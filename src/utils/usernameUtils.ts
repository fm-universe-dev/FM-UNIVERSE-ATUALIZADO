/**
 * Normaliza um nome de usuário (username) para padronização e garantia estrita de unicidade:
 * - Converte todas as letras para minúsculas
 * - Remove espaços em branco nas pontas e internos
 * - Remove acentos e diacríticos (NFD)
 * - Remove caracteres especiais, permitindo apenas letras (a-z), números (0-9), sublinhado (_) e ponto (.)
 *
 * Exemplo:
 * "Rodrigo10" -> "rodrigo10"
 * "RODRIGO10" -> "rodrigo10"
 * "rodrigo10" -> "rodrigo10"
 * "  Rodrigo 10 " -> "rodrigo10"
 */
export function normalizeUsername(username?: string | null): string {
  if (!username) return '';
  return username
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_.-]/g, '');
}

/**
 * Validação dos critérios de formato de um nome de usuário:
 * - Obrigatório
 * - Mínimo 3 caracteres
 * - Máximo 25 caracteres
 * - Não pode conter apenas números ou símbolos
 */
export function validateUsernameFormat(username?: string | null): {
  valid: boolean;
  error?: string;
  normalized: string;
} {
  if (!username || !username.trim()) {
    return {
      valid: false,
      error: 'Por favor, informe seu nome de usuário.',
      normalized: '',
    };
  }

  const raw = username.trim();
  const normalized = normalizeUsername(raw);

  if (normalized.length < 3) {
    return {
      valid: false,
      error: 'O nome de usuário deve conter no mínimo 3 caracteres.',
      normalized,
    };
  }

  if (normalized.length > 25) {
    return {
      valid: false,
      error: 'O nome de usuário deve conter no máximo 25 caracteres.',
      normalized,
    };
  }

  // Permite apenas caracteres seguros: a-z, 0-9, sublinhado e ponto
  const validPattern = /^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/;
  if (!validPattern.test(normalized)) {
    return {
      valid: false,
      error: 'O nome de usuário deve começar e terminar com letra ou número e não pode ter caracteres especiais.',
      normalized,
    };
  }

  return { valid: true, normalized };
}

/**
 * Mapeia de forma determinística o username normalizado para a credencial interna do Firebase Auth.
 * O usuário final NUNCA vê nem preenche este identificador; toda a experiência é baseada puramente em username e senha.
 */
export function getInternalAuthEmail(normalizedUsername: string): string {
  return `${normalizedUsername}@fmuniverse.auth`;
}

/**
 * Lista de logins e apelidos normalizados dos 6 managers canônicos já existentes no FM Universe
 * para mapeamento e retrocompatibilidade direta absoluta sem perda de dados ou acesso.
 */
export const CANONICAL_MANAGER_LOGINS: Record<string, { uid: string; name: string; email: string }> = {
  // 1. Rodrigo Mariano — Ninja FC
  'rodrigo.mariano': {
    uid: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.mariano@fmverse.com',
  },
  'rodrigomariano': {
    uid: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.mariano@fmverse.com',
  },
  'ninjafc': {
    uid: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.mariano@fmverse.com',
  },
  'ninja': {
    uid: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.mariano@fmverse.com',
  },

  // 2. Thales Henrique — Thales FC
  'thales.henrique': {
    uid: 'qowYWnG0EfUqrr1a5cHlu4UYmNB3',
    name: 'Thales Henrique',
    email: 'thales.henrique@fmverse.com',
  },
  'thaleshenrique': {
    uid: 'qowYWnG0EfUqrr1a5cHlu4UYmNB3',
    name: 'Thales Henrique',
    email: 'thales.henrique@fmverse.com',
  },
  'thalesfc': {
    uid: 'qowYWnG0EfUqrr1a5cHlu4UYmNB3',
    name: 'Thales Henrique',
    email: 'thales.henrique@fmverse.com',
  },

  // 3. Igor Vicente — Mutant's
  'igor.vicente': {
    uid: 'XTEQSFH1x9To3EuVESp54vCCFTf2',
    name: 'Igor Vicente',
    email: 'igor.vicente@fmverse.com',
  },
  'igorvicente': {
    uid: 'XTEQSFH1x9To3EuVESp54vCCFTf2',
    name: 'Igor Vicente',
    email: 'igor.vicente@fmverse.com',
  },
  'mutants': {
    uid: 'XTEQSFH1x9To3EuVESp54vCCFTf2',
    name: 'Igor Vicente',
    email: 'igor.vicente@fmverse.com',
  },

  // 4. Leandro Vicente — Nós Travamos
  'leandro.vicente': {
    uid: 'qBMw9GdVuiVkBB22ZJwVoW1uEXG3',
    name: 'Leandro Vicente',
    email: 'leandro.vicente@fmverse.com',
  },
  'leandrovicente': {
    uid: 'qBMw9GdVuiVkBB22ZJwVoW1uEXG3',
    name: 'Leandro Vicente',
    email: 'leandro.vicente@fmverse.com',
  },
  'nostravamos': {
    uid: 'qBMw9GdVuiVkBB22ZJwVoW1uEXG3',
    name: 'Leandro Vicente',
    email: 'leandro.vicente@fmverse.com',
  },

  // 5. Thales Henrique — SaoPauloBrasil
  'thales.spb': {
    uid: '3dOrJ03rdGYipkflIjziZx8fd6d2',
    name: 'Thales Henrique',
    email: 'thales.spb@fmverse.com',
  },
  'thalesspb': {
    uid: '3dOrJ03rdGYipkflIjziZx8fd6d2',
    name: 'Thales Henrique',
    email: 'thales.spb@fmverse.com',
  },
  'saopaulobrasil': {
    uid: '3dOrJ03rdGYipkflIjziZx8fd6d2',
    name: 'Thales Henrique',
    email: 'thales.spb@fmverse.com',
  },

  // 6. Rodrigo Mariano — NinguemSegura FC
  'rodrigo.nsf': {
    uid: 'zmm8RxW9iyXIpW5g0hWeqNiPlt12',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.nsf@fmverse.com',
  },
  'rodrignonsf': {
    uid: 'zmm8RxW9iyXIpW5g0hWeqNiPlt12',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.nsf@fmverse.com',
  },
  'ninguemsegura': {
    uid: 'zmm8RxW9iyXIpW5g0hWeqNiPlt12',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.nsf@fmverse.com',
  },
  'ninguemsegurafc': {
    uid: 'zmm8RxW9iyXIpW5g0hWeqNiPlt12',
    name: 'Rodrigo Mariano',
    email: 'rodrigo.nsf@fmverse.com',
  },
};
