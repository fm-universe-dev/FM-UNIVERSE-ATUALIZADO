import { Club } from '../types';

/**
 * Verifica se um nome de clube representa um atleta sem clube / agente livre / dispensado.
 */
export function isFreeAgentClub(clubName?: string | null): boolean {
  if (!clubName) return true;
  const clean = clubName.trim();
  if (!clean || clean === '-' || clean === 'N/A' || clean === 'n/a') return true;

  const norm = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const freeAgentTerms = [
    'semclube',
    'semcontrato',
    'freeagent',
    'freeagents',
    'livre',
    'freetransfer',
    'none',
    'nenhum',
    'unattached',
    'released',
    'desempregado',
    'livrenomercado',
  ];

  return freeAgentTerms.includes(norm);
}

/**
 * Normaliza string para comparação e indexação de clubes.
 */
export function normalizeClubComparisonKey(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Gera um slug legível a partir do nome do clube.
 */
export function slugifyClubName(name: string): string {
  if (!name) return 'clube';
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'clube';
}

/**
 * Gera um identificador clubId determinístico e canônico.
 */
export function generateValidClubId(clubName: string, clubIdHint?: string): string {
  if (clubIdHint && clubIdHint.trim() && clubIdHint !== 'sem-clube' && !clubIdHint.startsWith('club-sem-clube')) {
    const cleanHint = clubIdHint.trim();
    return cleanHint.startsWith('club-') ? cleanHint : `club-${cleanHint}`;
  }
  const slug = slugifyClubName(clubName);
  return `club-${slug}`;
}

/**
 * Localiza um clube na coleção usando correspondência flexível e normalizada:
 * 1. ID exato (com ou sem prefixo 'club-')
 * 2. Slug do clube
 * 3. Nome normalizado (sem acentos, minúsculas, ignorando espaços/pontuações)
 * 4. Nome curto (shortName) normalizado
 */
export function findMatchingClub(clubNameOrId: string, clubs: Club[]): Club | undefined {
  if (!clubNameOrId || !clubNameOrId.trim()) return undefined;
  const raw = clubNameOrId.trim();
  const cleanLower = raw.toLowerCase();
  const withoutPrefix = cleanLower.replace(/^club-/, '');
  const normTarget = normalizeClubComparisonKey(raw);

  if (!normTarget && !cleanLower) return undefined;

  return clubs.find((c) => {
    // 1. ID exato ou com/sem prefixo
    const cIdLower = (c.id || '').toLowerCase();
    if (cIdLower === cleanLower) return true;
    if (cIdLower === `club-${cleanLower}`) return true;
    if (cIdLower.replace(/^club-/, '') === withoutPrefix) return true;

    // 2. Slug
    const cSlugLower = (c.slug || '').toLowerCase();
    if (cSlugLower && (cSlugLower === cleanLower || cSlugLower === withoutPrefix)) return true;

    // 3. Nome normalizado
    const cNormName = normalizeClubComparisonKey(c.name);
    if (cNormName && cNormName === normTarget) return true;

    // 4. Slug normalizado
    const cNormSlug = normalizeClubComparisonKey(c.slug);
    if (cNormSlug && cNormSlug === normTarget) return true;

    // 5. ShortName / Código normalizado
    const cNormShort = normalizeClubComparisonKey(c.shortName);
    if (cNormShort && cNormShort === normTarget) return true;

    const cNormCode = normalizeClubComparisonKey(c.code);
    if (cNormCode && cNormCode === normTarget) return true;

    return false;
  });
}

/**
 * Cria um objeto Club oficial e completo no padrão do FM Universe para novos clubes importados.
 */
export function createFMUniverseClubObject(
  clubName: string,
  customClubId?: string
): Club {
  const cleanName = clubName.trim();
  const slug = slugifyClubName(cleanName);
  const id = generateValidClubId(cleanName, customClubId);

  // Gera código / shortName de 3 letras baseado no nome
  const words = cleanName.split(/\s+/).filter(Boolean);
  let code = '';
  if (words.length >= 3) {
    code = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  } else if (words.length === 2) {
    code = (words[0].substring(0, 2) + words[1][0]).toUpperCase();
  } else {
    code = cleanName.substring(0, 3).toUpperCase();
  }
  if (!code || code.length < 2) code = 'CLB';

  const defaultBadges = ['⚽', '🛡️', '⚡', '🦅', '🦁', '👑', '🌟', '🔵', '🔴', '⚪', '🟢'];
  const hash = cleanName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const badge = defaultBadges[hash % defaultBadges.length];

  return {
    id,
    name: cleanName,
    slug,
    shortName: code,
    code,
    badge,
    stadiumId: `stad-${slug}`,
    stadiumName: `Estádio ${cleanName}`,
    capacity: 50000,
    reputation: 80,
    transferBudget: 50000000,
    wageBudget: 4000000,
    balance: 60000000,
    managerName: `Diretoria ${cleanName}`,
    squadCount: 1,
    fansCount: 1200000,
    primaryColor: '#1e3a8a',
    secondaryColor: '#ffffff',
    boardExpectation: 'Manter estabilidade financeira e competitividade esportiva',
    seasonTarget: 'G4 das Competições Oficiais',
    trophiesCount: 3,
    foundedYear: 1902,
  };
}

export const CANONICAL_CLUB_IDS = new Set([
  'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3', // Thales FC — Thales Henrique
  'club-NKijWNgl4ORYGpkESx1nvBLQpBx1', // Ninja FC — Rodrigo Mariano
  'club-mutants',                       // Mutant's — Igor Vicente
  'club-nos-travamos',                  // Nós Travamos — Leandro Vicente
  'club-saopaulobrasil',                // SaoPauloBrasil — Thales Henrique
  'club-ninguemsegura-fc',              // NinguemSegura FC — Rodrigo Mariano
]);

/**
 * Validação rigorosa dos 6 clubes canônicos com Manager que DEVEM permanecer:
 * - Thales FC — Thales Henrique (ID: club-qowYWnG0EfUqrr1a5cHlu4UYmNB3)
 * - Ninja FC — Rodrigo Mariano (ID: club-NKijWNgl4ORYGpkESx1nvBLQpBx1)
 * - Mutant's — Igor Vicente (ID: club-mutants)
 * - Nós Travamos — Leandro Vicente (ID: club-nos-travamos)
 * - SaoPauloBrasil — Thales Henrique (ID: club-saopaulobrasil)
 * - NinguemSegura FC — Rodrigo Mariano (ID: club-ninguemsegura-fc)
 *
 * Remove clubes extras/duplicados identificando os 6 canônicos pelos vínculos atuais com os Managers.
 */
export function isPreservedManagerClub(
  club?: Club | null,
  managersList?: Array<{ uid?: string; login?: string; clubId?: string | null; name?: string }>
): boolean {
  if (!club || !club.id) return false;

  const clubId = club.id.trim();

  // 1. Identificação pelos vínculos atuais com os Managers reais
  if (managersList && managersList.length > 0) {
    const isLinkedToManager = managersList.some((m) => m.clubId === clubId);
    if (isLinkedToManager) return true;
  }

  // 2. Os 6 IDs canônicos oficiais preservados
  if (CANONICAL_CLUB_IDS.has(clubId)) {
    return true;
  }

  return false;
}

