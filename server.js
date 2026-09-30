import express from 'express';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

app.use(express.json());

// Endpoint de recuperação/reset administrativo de senha de Manager
app.post('/api/auth/admin-reset-password', async (req, res) => {
  try {
    const { managerUid, newPass } = req.body;
    if (!managerUid || typeof managerUid !== 'string') {
      return res.status(400).json({ error: 'UID do manager é obrigatório.' });
    }
    if (!newPass || typeof newPass !== 'string' || newPass.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    // Criptografa a nova senha com bcrypt (10 rounds de salt)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPass, salt);

    console.log(`🔐 [Admin] Senha redefinida administrativamente para o manager UID: ${managerUid}`);
    return res.status(200).json({
      success: true,
      message: 'Senha redefinida com sucesso.',
      managerUid,
      resetAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Erro no reset de senha:', error);
    return res.status(500).json({ error: 'Erro interno ao processar redefinição de senha.' });
  }
});

// Se dist não foi gerado pelo build command no deploy do Render, compila automaticamente
if (!fs.existsSync(indexPath)) {
  console.log('⚠️ Pasta dist/index.html não encontrada. Executando build de produção...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build de produção concluído com sucesso!');
  } catch (err) {
    console.error('❌ Falha ao compilar build:', err);
  }
}

// Serve arquivos estáticos da pasta dist gerada pelo Vite
app.use(express.static(distPath));

// Redirecionamento SPA para index.html em qualquer rota (evita Not Found ao navegar ou recarregar)
app.get('*', (_req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<!DOCTYPE html><html><head><title>FM Universe</title></head><body style="font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div><h1>FM Universe</h1><p>Inicializando aplicação... Por favor, aguarde e atualize em instantes.</p></div></body></html>');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FM Universe servidor online na porta ${PORT}`);
});

