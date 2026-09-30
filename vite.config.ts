import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import bcrypt from 'bcryptjs';

function adminAuthDevPlugin() {
  return {
    name: 'admin-auth-dev-api',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/api/auth/admin-reset-password' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              if (!data.managerUid || !data.newPass || data.newPass.length < 6) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'A nova senha deve ter no mínimo 6 caracteres.' }));
                return;
              }
              const salt = await bcrypt.genSalt(10);
              const passwordHash = await bcrypt.hash(data.newPass, salt);
              console.log(`🔐 [Dev Server] Senha redefinida para o manager UID: ${data.managerUid}`);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  message: 'Senha redefinida com sucesso.',
                  managerUid: data.managerUid,
                  resetAt: new Date().toISOString(),
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor' }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  let cleaned = String(val).trim();
  cleaned = cleaned.replace(/[,;\s]+$/, '');
  cleaned = cleaned.replace(/^["'`\s]+|["'`\s]+$/g, '');
  cleaned = cleaned.replace(/[,;\s]+$/, '');
  cleaned = cleaned.replace(/^["'`\s]+|["'`\s]+$/g, '');
  return cleaned.trim();
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), adminAuthDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(cleanEnv(process.env.VITE_FIREBASE_API_KEY)),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(cleanEnv(process.env.VITE_FIREBASE_AUTH_DOMAIN)),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(cleanEnv(process.env.VITE_FIREBASE_PROJECT_ID)),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(cleanEnv(process.env.VITE_FIREBASE_STORAGE_BUCKET)),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(cleanEnv(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID)),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(cleanEnv(process.env.VITE_FIREBASE_APP_ID)),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
