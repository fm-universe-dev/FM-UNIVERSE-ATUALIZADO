import { Player, PlayerQueryOptions, PaginatedResult } from '../types';
import { isFirebaseConfigured, firestoreDb, getFirestoreDb, firebaseAuth, FIRESTORE_DATABASE_ID } from '../config/firebase';
import { dataStore } from './dataStore';
import { transferenciasService } from './transferenciasService';
import {
  isFreeAgentClub,
  findMatchingClub,
  createFMUniverseClubObject,
} from '../utils/clubUtils';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * Sanitiza recursivamente qualquer objeto ou array antes de enviar ao Firestore,
 * removendo estritamente qualquer campo com valor `undefined`.
 * O Firestore rejeita completamente chamadas a WriteBatch.set com Unsupported field value: undefined.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanObj as T;
  }
  return data;
}

/**
 * Normaliza um objeto Player recuperado do Firestore para garantir integridade
 * de campos obrigatórios (stats, attributes, defaults) e prevenir quebras de UI.
 */
export function normalizePlayerRecord(raw: any, id: string): Player {
  const p = { ...raw, id: raw.id || id };

  // Garantir valores padrão para campos numéricos e identificadores
  p.jerseyNumber = p.jerseyNumber ?? 0;
  p.overall = typeof raw.overall === 'number' ? raw.overall : (typeof raw.ca === 'number' ? raw.ca : 70);
  p.potential = typeof raw.potential === 'number' ? raw.potential : (typeof raw.pa === 'number' ? raw.pa : (p.overall || 70));
  p.age = typeof raw.age === 'number' ? raw.age : (typeof raw.idade === 'number' ? raw.idade : 22);
  p.marketValue = typeof raw.marketValue === 'number' ? raw.marketValue : (typeof raw.valor === 'number' ? raw.valor : (typeof raw.valorVenda === 'number' ? raw.valorVenda : 1000000));
  p.wage = typeof raw.wage === 'number' ? raw.wage : (typeof raw.salario === 'number' ? raw.salario : (typeof raw.salary === 'number' ? raw.salary : 10000));
  p.nationalityCode = raw.nationalityCode || 'BRA';
  p.nationality = raw.nationality || raw.nacionalidade || 'Brasil';
  p.position = raw.position || raw.posicao || 'MC';
  p.positionCategory = raw.positionCategory || 'MID';
  p.name = raw.name || raw.nome || raw.shortName || raw.knownAs || 'Jogador';
  p.fullName = raw.fullName || raw.nomeCompleto || raw.nome || p.name;
  p.clubName = raw.clubName || raw.clube || 'Sem Clube';
  p.clubId = raw.clubId || 'free-agent';
  p.contractUntil = p.contractUntil || '2026-12-31';
  p.morale = p.morale || 'Muito Boa';
  p.condition = typeof p.condition === 'number' ? p.condition : 95;

  // Garantir integridade de stats
  p.stats = {
    matches: typeof p.stats?.matches === 'number' ? p.stats.matches : 0,
    goals: typeof p.stats?.goals === 'number' ? p.stats.goals : 0,
    assists: typeof p.stats?.assists === 'number' ? p.stats.assists : 0,
    averageRating: typeof p.stats?.averageRating === 'number' ? p.stats.averageRating : 6.5,
    minutesPlayed: typeof p.stats?.minutesPlayed === 'number' ? p.stats.minutesPlayed : 0,
    yellowCards: typeof p.stats?.yellowCards === 'number' ? p.stats.yellowCards : 0,
    redCards: typeof p.stats?.redCards === 'number' ? p.stats.redCards : 0,
    cleanSheets: typeof p.stats?.cleanSheets === 'number' ? p.stats.cleanSheets : 0,
  };

  // Garantir integridade de attributes
  p.attributes = {
    pace: typeof p.attributes?.pace === 'number' ? p.attributes.pace : 70,
    shooting: typeof p.attributes?.shooting === 'number' ? p.attributes.shooting : 65,
    passing: typeof p.attributes?.passing === 'number' ? p.attributes.passing : 70,
    dribbling: typeof p.attributes?.dribbling === 'number' ? p.attributes.dribbling : 70,
    defending: typeof p.attributes?.defending === 'number' ? p.attributes.defending : 60,
    physical: typeof p.attributes?.physical === 'number' ? p.attributes.physical : 70,
  };

  return p as Player;
}

/**
 * Obtém o mapa consolidado de transferências concluídas (via histórico oficial e propostas aceitas).
 * Garante que jogadores transferidos tenham seu clube atual refletido imediatamente nas consultas,
 * mesmo quando a coleção base de jogadores não tiver sido regravada ou quando a página for recarregada (F5).
 * Utiliza cache em memória de 2 minutos para evitar leituras repetitivas do Firestore.
 */
let cachedTransfersMap: Map<string, { toClubId: string; toClubName: string; timestamp: number }> | null = null;
let lastTransfersFetchTimestamp = 0;
const TRANSFERS_CACHE_TTL = 120000; // 2 minutos

async function getCompletedTransfersMap(): Promise<Map<string, { toClubId: string; toClubName: string; timestamp: number }>> {
  if (cachedTransfersMap && Date.now() - lastTransfersFetchTimestamp < TRANSFERS_CACHE_TTL) {
    return cachedTransfersMap;
  }

  const result = new Map<string, { toClubId: string; toClubName: string; timestamp: number }>();

  // 1. Consulta histórico de transferências concluídas (Firestore / local)
  try {
    const transfers = await transferenciasService.getAll();
    for (const t of transfers) {
      if (t.status === 'COMPLETED' && t.playerId && t.toClubId) {
        const time = t.createdAt ? new Date(t.createdAt).getTime() : (t.date ? new Date(t.date).getTime() : 0);
        const existing = result.get(t.playerId);
        if (!existing || time >= existing.timestamp) {
          result.set(t.playerId, {
            toClubId: t.toClubId,
            toClubName: t.toClubName || '',
            timestamp: time,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Falha ao consultar transferências para sincronização do elenco:', err);
  }

  // 2. Consulta propostas com status COMPLETED (Firestore / local)
  try {
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      const colRef = collection(db, 'transferOffers');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        snap.forEach((d) => {
          const data = d.data();
          if (data.status === 'COMPLETED' && data.playerId && (data.buyerClubId || data.toClubId)) {
            const time = data.updatedAt ? new Date(data.updatedAt).getTime() : (data.createdAt ? new Date(data.createdAt).getTime() : 0);
            const existing = result.get(data.playerId);
            const targetClubId = data.buyerClubId || data.toClubId;
            const targetClubName = data.buyerClubName || data.toClubName || '';
            if (!existing || time >= existing.timestamp) {
              result.set(data.playerId, {
                toClubId: targetClubId,
                toClubName: targetClubName,
                timestamp: time,
              });
            }
          }
        });
      }
    } else {
      const localOffers = dataStore.getTransferOffers();
      for (const o of localOffers) {
        if (o.status === 'COMPLETED' && o.playerId && o.buyerClubId) {
          const time = o.updatedAt ? new Date(o.updatedAt).getTime() : (o.createdAt ? new Date(o.createdAt).getTime() : 0);
          const existing = result.get(o.playerId);
          if (!existing || time >= existing.timestamp) {
            result.set(o.playerId, {
              toClubId: o.buyerClubId,
              toClubName: o.buyerClubName || '',
              timestamp: time,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Falha ao consultar propostas concluídas para sincronização do elenco:', err);
  }

  cachedTransfersMap = result;
  lastTransfersFetchTimestamp = Date.now();
  return result;
}

export function invalidateTransfersCache(): void {
  cachedTransfersMap = null;
  lastTransfersFetchTimestamp = 0;
  cachedPlayers = null;
  lastFetchTimestamp = 0;
  pageCache.clear();
  queryCursors.clear();
}

function applyTransfersToPlayers(players: Player[], transferMap: Map<string, { toClubId: string; toClubName: string }>): Player[] {
  if (transferMap.size === 0) return players;
  return players.map((p) => {
    const transfer = transferMap.get(p.id);
    if (transfer) {
      return {
        ...p,
        clubId: transfer.toClubId,
        clubName: transfer.toClubName || p.clubName,
      };
    }
    return p;
  });
}

let cachedPlayers: Player[] | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL = 300000; // 5 minutos de cache em memória

interface CachedPageResult {
  data: Player[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  timestamp: number;
}

// Armazena páginas em cache para navegação instantânea com ZERO leituras no Firestore
const pageCache = new Map<string, CachedPageResult>();

// Armazena os cursores (QueryDocumentSnapshot) por chave de busca e número da página
// chave -> Map<página, snapshot do último documento daquela página>
const queryCursors = new Map<string, Map<number, QueryDocumentSnapshot<DocumentData>>>();

/**
 * Gera variantes de busca fonéticas, maiúsculas/minúsculas e acentos para encontrar atletas
 * na coleção /jogadores do Firestore (ex: Kaká, Abidal, Ronaldo, Cristiano).
 */
export function getSearchVariants(rawQuery: string): string[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const variants = new Set<string>();

  const lower = q.toLowerCase();
  const accentMap: Record<string, string[]> = {
    kaka: ['Kaká', 'Kaka', 'Ricardo Izecson dos Santos Leite'],
    kaká: ['Kaká', 'Kaka', 'Ricardo Izecson dos Santos Leite'],
    abidal: ['Abidal, Eric', 'Abidal', 'Eric Abidal'],
    'eric abidal': ['Abidal, Eric', 'Abidal', 'Eric Abidal'],
    'abidal, eric': ['Abidal, Eric', 'Abidal'],
    ronaldo: ['Ronaldo, Cristiano', 'Ronaldo', 'Cristiano Ronaldo'],
    cristiano: ['Ronaldo, Cristiano', 'Cristiano', 'Cristiano Ronaldo'],
    'cristiano ronaldo': ['Ronaldo, Cristiano', 'Cristiano Ronaldo', 'Ronaldo'],
    'ronaldo, cristiano': ['Ronaldo, Cristiano', 'Cristiano Ronaldo', 'Ronaldo'],
    messi: ['Messi, Lionel', 'Messi', 'Lionel Messi'],
    'lionel messi': ['Messi, Lionel', 'Lionel Messi', 'Messi'],
    'messi, lionel': ['Messi, Lionel', 'Lionel Messi', 'Messi'],
    pele: ['Pelé', 'Pele'],
    'pelé': ['Pelé', 'Pele'],
    ronaldinho: ['Ronaldinho', 'Ronaldinho Gaúcho', 'Ronaldo de Assis Moreira'],
    ibrahimovic: ['Ibrahimović, Zlatan', 'Ibrahimović', 'Ibrahimovic, Zlatan', 'Ibrahimovic'],
    'ibrahimović': ['Ibrahimović, Zlatan', 'Ibrahimović', 'Ibrahimovic, Zlatan'],
    'zlatan ibrahimovic': ['Ibrahimović, Zlatan', 'Ibrahimovic, Zlatan', 'Ibrahimović', 'Ibrahimovic'],
    'zlatan ibrahimović': ['Ibrahimović, Zlatan', 'Ibrahimovic, Zlatan', 'Ibrahimović'],
    rooney: ['Rooney, Wayne', 'Rooney', 'Wayne Rooney'],
    'wayne rooney': ['Rooney, Wayne', 'Wayne Rooney', 'Rooney'],
    henry: ['Henry, Thierry', 'Henry', 'Thierry Henry'],
    'thierry henry': ['Henry, Thierry', 'Thierry Henry', 'Henry'],
  };

  // 1. Mapeamento explícito de atletas consagrados do FM2008
  if (accentMap[lower]) {
    accentMap[lower].forEach((v) => variants.add(v));
  }

  // 2. Se tem duas palavras (ex: "Cristiano Ronaldo" -> "Ronaldo, Cristiano")
  const parts = q.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 2) {
    const p0 = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    const p1 = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
    variants.add(`${p1}, ${p0}`);
    variants.add(`${p0} ${p1}`);
    variants.add(p1);
    variants.add(p0);
  }

  // 3. Cada palavra com inicial maiúscula (Title Case)
  const title = q
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  variants.add(title);

  // 4. Primeira letra maiúscula apenas e original
  variants.add(q.charAt(0).toUpperCase() + q.slice(1));
  variants.add(q);

  return Array.from(variants).filter(Boolean);
}

export const jogadoresService = {
  invalidateCache() {
    cachedPlayers = null;
    lastFetchTimestamp = 0;
    pageCache.clear();
    queryCursors.clear();
    cachedTransfersMap = null;
    lastTransfersFetchTimestamp = 0;
  },

  /**
   * Retorna até 50 principais jogadores com limite estrito de segurança para evitar estourar cota de leitura.
   * Não realiza download em massa de dezenas de milhares de documentos.
   */
  async getAll(forceRefresh = false): Promise<Player[]> {
    if (!forceRefresh && cachedPlayers && Date.now() - lastFetchTimestamp < CACHE_TTL) {
      return cachedPlayers;
    }

    let players: Player[] = [];
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'jogadores');
        // Limite estrito de 50 atletas ordenados por overall para alimentar dashboards sem esgotar cotas
        const q = query(colRef, orderBy('overall', 'desc'), limit(50));
        const snap = await getDocs(q);
        if (!snap.empty) {
          players = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as any))
            .filter((p) => p && p.auditTestRecord !== true && !String(p.id).startsWith('teste-homologacao-'))
            .map((p) => normalizePlayerRecord(p, p.id));
        }
      } catch (err: any) {
        console.warn('getAll(): Firestore falhou (cota ou rede), recorrendo a cache/localStore:', err?.message);
        if (cachedPlayers && cachedPlayers.length > 0) {
          return cachedPlayers;
        }
        players = dataStore.getPlayers().slice(0, 50);
      }
    } else {
      players = dataStore.getPlayers().slice(0, 50);
    }

    const completedMap = await getCompletedTransfersMap();
    const reconciledPlayers = applyTransfersToPlayers(players, completedMap);

    // Mescla atletas da base FM2008 do dataStore local se não estiverem na lista
    const localFM2008 = dataStore.getPlayers().filter((p) => p.databaseSource === 'FM2008' || p.source === 'FM2008' || p.id.startsWith('fm2008_'));
    for (const p of localFM2008) {
      if (!reconciledPlayers.some((existing) => existing.id === p.id)) {
        reconciledPlayers.unshift(p);
      }
    }

    cachedPlayers = reconciledPlayers;
    lastFetchTimestamp = Date.now();

    return reconciledPlayers;
  },

  /**
   * Consulta paginada escalável para a coleção /jogadores do Firestore.
   * Utiliza limit() + startAfter() com paginação por cursor e cache local em memória.
   * A primeira carga e as subsequentes baixam no máximo 50 jogadores.
   * Nunca faz download da coleção inteira.
   */
  async getPaginated(options: PlayerQueryOptions = {}): Promise<PaginatedResult<Player>> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, Math.min(50, options.pageSize || 50));
    const db = getFirestoreDb() || firestoreDb;

    // Se Firebase não estiver configurado no projeto, usa armazenamento local
    if (!isFirebaseConfigured() || !db) {
      return dataStore.queryPlayers(options);
    }

    const colRef = collection(db, 'jogadores');
    const searchTerm = options.search ? options.search.trim() : '';
    const clubId = options.clubId && options.clubId !== 'ALL' ? options.clubId : undefined;
    const positionCategory = options.positionCategory && options.positionCategory !== 'ALL' ? options.positionCategory : undefined;
    const sortBy = options.sortBy || 'overall';
    const sortOrder = options.sortOrder || (sortBy === 'age' ? 'asc' : 'desc');

    const queryKey = `${searchTerm.toLowerCase()}|${clubId || ''}|${positionCategory || ''}|${sortBy}|${sortOrder}|${pageSize}`;
    const pageKey = `${queryKey}__p${page}`;

    // 1. Cache local da página para evitar consultas repetidas ao voltar/avançar
    if (!options.forceRefresh && pageCache.has(pageKey)) {
      const cached = pageCache.get(pageKey)!;
      if (Date.now() - cached.timestamp < 180000) {
        return {
          data: cached.data,
          total: cached.data.length,
          page: cached.page,
          pageSize: cached.pageSize,
          totalPages: cached.hasNextPage ? cached.page + 1 : cached.page,
          hasNextPage: cached.hasNextPage,
          hasPrevPage: cached.hasPrevPage,
        };
      }
    }

    try {
      let matchingDocs: any[] = [];
      let hasNextPage = false;

      // Obtém ou inicializa o mapa de cursores para esta consulta
      let cursorsMap = queryCursors.get(queryKey);
      if (!cursorsMap) {
        cursorsMap = new Map();
        queryCursors.set(queryKey, cursorsMap);
      }

      if (searchTerm) {
        // === BUSCA POR NOME ESPECÍFICA NO FIRESTORE ===
        // Consulta variantes direcionadas (máx 5) sem baixar a coleção inteira
        const variants = getSearchVariants(searchTerm).slice(0, 5);
        const searchPromises: Promise<any[]>[] = [];

        for (const variant of variants) {
          const qName = query(
            colRef,
            where('name', '>=', variant),
            where('name', '<=', variant + '\uf8ff'),
            limit(25)
          );
          searchPromises.push(
            getDocs(qName)
              .then((s) => s.docs)
              .catch((err) => {
                throw err;
              })
          );

          if (!variant.includes(' ') && !variant.includes(',')) {
            const qKnown = query(
              colRef,
              where('knownAs', '>=', variant),
              where('knownAs', '<=', variant + '\uf8ff'),
              limit(25)
            );
            searchPromises.push(
              getDocs(qKnown)
                .then((s) => s.docs)
                .catch((err) => {
                  throw err;
                })
            );
          }
        }

        const results = await Promise.all(searchPromises);
        const seenIds = new Set<string>();
        for (const docList of results) {
          for (const d of docList) {
            if (!seenIds.has(d.id)) {
              seenIds.add(d.id);
              matchingDocs.push({ id: d.id, ...d.data() });
            }
          }
        }
        hasNextPage = false;
      } else {
        // === NAVEGAÇÃO PAGINADA COM limit() + startAfter() ===
        // Recupera cursor da página anterior quando page > 1
        const previousCursor = page > 1 ? cursorsMap.get(page - 1) : undefined;

        // Determina o campo e direção de ordenação
        const sortField = sortBy === 'goals' ? 'stats.goals' : sortBy;
        const sortDirection = sortOrder;

        // Monta a consulta controlada trazendo no máximo (pageSize + 1) documentos
        // O documento extra serve exclusivamente para detectar se há próxima página sem consultas duplicadas
        let q: any;

        if (clubId) {
          // Filtro por clube
          try {
            if (previousCursor) {
              q = query(colRef, where('clubId', '==', clubId), orderBy(sortField, sortDirection), startAfter(previousCursor), limit(pageSize + 1));
            } else {
              q = query(colRef, where('clubId', '==', clubId), orderBy(sortField, sortDirection), limit(pageSize + 1));
            }
            const snap = await getDocs(q);
            matchingDocs = snap.docs;
          } catch (err: any) {
            // Se faltar índice composto (clubId + orderBy), consulta por clubId e ordena em memória
            if (err?.code === 'failed-precondition') {
              if (previousCursor) {
                q = query(colRef, where('clubId', '==', clubId), startAfter(previousCursor), limit(pageSize + 1));
              } else {
                q = query(colRef, where('clubId', '==', clubId), limit(pageSize + 1));
              }
              const snap = await getDocs(q);
              matchingDocs = snap.docs;
            } else {
              throw err;
            }
          }
        } else if (positionCategory) {
          // Filtro por setor de campo
          try {
            if (previousCursor) {
              q = query(colRef, where('positionCategory', '==', positionCategory), orderBy(sortField, sortDirection), startAfter(previousCursor), limit(pageSize + 1));
            } else {
              q = query(colRef, where('positionCategory', '==', positionCategory), orderBy(sortField, sortDirection), limit(pageSize + 1));
            }
            const snap = await getDocs(q);
            matchingDocs = snap.docs;
          } catch (err: any) {
            if (err?.code === 'failed-precondition') {
              if (previousCursor) {
                q = query(colRef, where('positionCategory', '==', positionCategory), startAfter(previousCursor), limit(pageSize + 1));
              } else {
                q = query(colRef, where('positionCategory', '==', positionCategory), limit(pageSize + 1));
              }
              const snap = await getDocs(q);
              matchingDocs = snap.docs;
            } else {
              throw err;
            }
          }
        } else {
          // Listagem geral ordenada nativamente por Firestore (overall, marketValue, age, goals)
          if (previousCursor) {
            q = query(colRef, orderBy(sortField, sortDirection), startAfter(previousCursor), limit(pageSize + 1));
          } else {
            q = query(colRef, orderBy(sortField, sortDirection), limit(pageSize + 1));
          }
          const snap = await getDocs(q);
          matchingDocs = snap.docs;
        }

        // Detecta próxima página sem consultas duplicadas de contagem
        hasNextPage = matchingDocs.length > pageSize;
        const pageDocs = hasNextPage ? matchingDocs.slice(0, pageSize) : matchingDocs;

        // Salva o cursor da página atual para permitir avançar para a próxima página
        if (pageDocs.length > 0) {
          const lastDocSnap = pageDocs[pageDocs.length - 1];
          cursorsMap.set(page, lastDocSnap);
        }

        matchingDocs = pageDocs.map((d: any) => ({ id: d.id, ...d.data() }));
      }

      // Normaliza e limpa registros
      let normalizedPlayers = matchingDocs
        .filter((p) => p && p.auditTestRecord !== true && !String(p.id).startsWith('teste-homologacao-'))
        .map((p) => normalizePlayerRecord(p, p.id));

      // Reconciliação imediata com transferências concluídas
      const completedMap = await getCompletedTransfersMap();
      normalizedPlayers = applyTransfersToPlayers(normalizedPlayers, completedMap);

      // Filtros em memória adicionais caso busca combinada por texto
      if (clubId && searchTerm) {
        normalizedPlayers = normalizedPlayers.filter((p) => p.clubId === clubId);
      }
      if (positionCategory && searchTerm) {
        normalizedPlayers = normalizedPlayers.filter((p) => p.positionCategory === positionCategory);
      }

      // Ordenação consistente
      normalizedPlayers.sort((a, b) => {
        const field = sortBy || 'overall';
        let valA: number = 0;
        let valB: number = 0;
        if (field === 'overall') {
          valA = a.overall ?? 0;
          valB = b.overall ?? 0;
        } else if (field === 'marketValue') {
          valA = a.marketValue ?? 0;
          valB = b.marketValue ?? 0;
        } else if (field === 'goals') {
          valA = a.stats?.goals ?? 0;
          valB = b.stats?.goals ?? 0;
        } else if (field === 'age') {
          valA = a.age ?? 0;
          valB = b.age ?? 0;
        }

        if (field === 'age') {
          return valA - valB;
        }
        return valB - valA;
      });

      const pagedData = searchTerm ? normalizedPlayers.slice(0, pageSize) : normalizedPlayers;

      // Incorpora atletas da base FM2008 do dataStore local que atendam aos filtros
      const localFM2008Matches = dataStore.queryPlayers(options).data.filter(
        (p) => p.databaseSource === 'FM2008' || p.source === 'FM2008' || p.id.startsWith('fm2008_')
      );
      for (const lp of localFM2008Matches) {
        if (!pagedData.some((p) => p.id === lp.id)) {
          pagedData.unshift(lp);
        }
      }

      // Salva no cache local da página
      pageCache.set(pageKey, {
        data: pagedData,
        page,
        pageSize,
        hasNextPage,
        hasPrevPage: page > 1,
        timestamp: Date.now(),
      });

      return {
        data: pagedData,
        total: pagedData.length,
        page,
        pageSize,
        totalPages: hasNextPage ? page + 1 : page,
        hasNextPage,
        hasPrevPage: page > 1,
      };
    } catch (err: any) {
      console.error('Falha na consulta Firestore para /jogadores:', err);
      const isQuota =
        err?.code === 'resource-exhausted' ||
        String(err?.message || '').toLowerCase().includes('quota limit exceeded') ||
        String(err?.message || '').toLowerCase().includes('resource-exhausted') ||
        String(err?.message || '').toLowerCase().includes('quota exceeded');

      if (isQuota) {
        // Tenta recuperar do cache de página em memória se disponível
        const cached = pageCache.get(pageKey);
        if (cached && cached.data && cached.data.length > 0) {
          return {
            data: cached.data,
            total: cached.data.length,
            page,
            pageSize,
            totalPages: cached.hasNextPage ? page + 1 : page,
            hasNextPage: cached.hasNextPage,
            hasPrevPage: cached.hasPrevPage,
          };
        }
        // Se Firestore estiver esgotado por cota, utiliza consulta local no dataStore
        const localResult = dataStore.queryPlayers(options);
        if (localResult) {
          console.warn('⚠️ [jogadoresService] Recorrendo ao dataStore local devido à cota de leitura do Firestore.');
          return localResult;
        }
      }

      // Fallback universal para dataStore local em caso de falha de conexão/permissão do Firestore
      try {
        const fallbackResult = dataStore.queryPlayers(options);
        if (fallbackResult) {
          console.warn('⚠️ [jogadoresService] Fallback para dataStore acionado após erro no Firestore:', err?.message);
          return fallbackResult;
        }
      } catch {
        // ignore
      }

      let friendlyMessage = err?.message || 'Erro ao consultar a base de dados de jogadores.';
      if (isQuota) {
        friendlyMessage =
          'Cota diária de leitura do Firestore excedida (resource-exhausted). O Google Cloud atingiu o limite de leituras para a coleção /jogadores (11.438 documentos existentes no banco). Aguarde a renovação da cota diária do Firebase ou habilite faturamento para leituras ilimitadas.';
      }
      const customError: any = new Error(friendlyMessage);
      customError.code = err?.code || 'firestore-error';
      customError.originalError = err;
      throw customError;
    }
  },

  async getById(id: string): Promise<Player | null> {
    if (cachedPlayers) {
      const found = cachedPlayers.find((p) => p.id === id);
      if (found) return found;
    }

    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'jogadores', id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const raw = { id: snap.id, ...snap.data() } as any;
          if (raw.auditTestRecord === true) return null;
          const player = normalizePlayerRecord(raw, snap.id);
          const completedMap = await getCompletedTransfersMap();
          const transfer = completedMap.get(player.id);
          if (transfer) {
            player.clubId = transfer.toClubId;
            player.clubName = transfer.toClubName || player.clubName;
          }
          return player;
        }
      } catch (err: any) {
        console.warn('Falha ao buscar jogador pontual no Firestore.', err);
      }
    }
    const local = dataStore.getPlayerById(id);
    return local ? normalizePlayerRecord(local, local.id) : null;
  },

  async getByExternalId(externalId: string): Promise<Player | null> {
    return dataStore.getPlayerByExternalId(externalId) || null;
  },

  async getByDeduplicationKey(key: string): Promise<Player | null> {
    return dataStore.getPlayerByDeduplicationKey(key) || null;
  },

  async getByClubId(clubId: string): Promise<Player[]> {
    const cleanId = (clubId || '').trim();
    if (!cleanId) return [];

    const completedMap = await getCompletedTransfersMap();

    const db = getFirestoreDb() || firestoreDb;
    let players: Player[] = [];

    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'jogadores');
        const qClub = query(colRef, where('clubId', '==', cleanId), limit(100));
        const snap = await getDocs(qClub);
        if (!snap.empty) {
          players = snap.docs.map((d) => normalizePlayerRecord(d.data(), d.id));
        }
      } catch (err) {
        console.warn('Falha ao buscar elenco do clube no Firestore.', err);
      }
    }

    if (players.length === 0) {
      const all = cachedPlayers && cachedPlayers.length > 0 ? cachedPlayers : dataStore.getPlayers();
      const club = dataStore.getClubById(cleanId);
      const targetSlug = club?.slug?.toLowerCase();
      const targetName = club?.name?.toLowerCase();

      players = all.filter((p) => {
        if (p.clubId === cleanId) return true;
        if (club && p.clubId === club.id) return true;
        if (p.clubId && cleanId && p.clubId.replace(/^club-/, '') === cleanId.replace(/^club-/, '')) return true;
        if (targetSlug && p.clubId?.toLowerCase() === targetSlug) return true;
        if (targetName && p.clubName?.toLowerCase() === targetName) return true;
        return false;
      });
    }

    // 1. Aplica o mapa de transferências e filtra atletas que foram transferidos para fora
    let adjusted = players
      .map((p) => {
        const transfer = completedMap.get(p.id);
        if (transfer) {
          return {
            ...p,
            clubId: transfer.toClubId,
            clubName: transfer.toClubName || p.clubName,
          };
        }
        return p;
      })
      .filter((p) => {
        const targetClean = cleanId.replace(/^club-/, '');
        const pClubClean = (p.clubId || '').replace(/^club-/, '');
        return p.clubId === cleanId || pClubClean === targetClean;
      });

    // 2. Adiciona jogadores cuja transferência mais recente foi para este clube caso ainda não constem no elenco
    for (const [transferredPlayerId, transferInfo] of completedMap.entries()) {
      const targetClean = cleanId.replace(/^club-/, '');
      const toClean = (transferInfo.toClubId || '').replace(/^club-/, '');
      if (transferInfo.toClubId === cleanId || toClean === targetClean) {
        const alreadyInList = adjusted.some((p) => p.id === transferredPlayerId);
        if (!alreadyInList) {
          let pObj = dataStore.getPlayerById(transferredPlayerId);
          if (!pObj) {
            pObj = await this.getById(transferredPlayerId);
          }
          if (pObj) {
            adjusted.push({
              ...pObj,
              clubId: cleanId,
              clubName: transferInfo.toClubName || pObj.clubName,
            });
          }
        }
      }
    }

    // 3. Adiciona qualquer jogador do dataStore local já atribuído a este clube
    const localStorePlayers = dataStore.getPlayers().filter((p) => {
      const targetClean = cleanId.replace(/^club-/, '');
      const pClubClean = (p.clubId || '').replace(/^club-/, '');
      const pCurrentClean = (p.currentClubId || '').replace(/^club-/, '');
      return (
        p.clubId === cleanId ||
        pClubClean === targetClean ||
        p.currentClubId === cleanId ||
        pCurrentClean === targetClean
      );
    });
    for (const lp of localStorePlayers) {
      if (!adjusted.some((p) => p.id === lp.id)) {
        adjusted.push({
          ...lp,
          clubId: cleanId,
        });
      }
    }

    return adjusted;
  },

  async save(player: Player): Promise<void> {
    const clubName = (player.clubName || player.club || '').trim();
    if (clubName && !isFreeAgentClub(clubName)) {
      const existingClubs = dataStore.getClubs();
      const matched =
        findMatchingClub(clubName, existingClubs) ||
        (player.clubId ? findMatchingClub(player.clubId, existingClubs) : undefined);
      if (!matched) {
        const newClub = createFMUniverseClubObject(clubName, player.clubId);
        try {
          dataStore.saveClub(newClub);
          const db = getFirestoreDb() || firestoreDb;
          if (isFirebaseConfigured() && db) {
            setDoc(doc(db, 'clubes', newClub.id), newClub, { merge: true }).catch(() => {});
          }
        } catch {
          // ignore
        }
        player.clubId = newClub.id;
        player.clubName = newClub.name;
      } else if (!player.clubId || player.clubId === 'sem-clube') {
        player.clubId = matched.id;
        player.clubName = matched.name;
      }
    }

    const cleanPlayer = sanitizeForFirestore(player);
    dataStore.savePlayer(cleanPlayer);
    if (cachedPlayers) {
      const idx = cachedPlayers.findIndex((p) => p.id === cleanPlayer.id);
      if (idx !== -1) {
        cachedPlayers[idx] = cleanPlayer;
      } else {
        cachedPlayers.push(cleanPlayer);
      }
    }
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'jogadores', cleanPlayer.id);
        await setDoc(docRef, cleanPlayer, { merge: true });
      } catch (err) {
        console.warn('Falha ao persistir jogador no Firestore.', err);
      }
    }
  },

  invalidateTransfersCache(): void {
    invalidateTransfersCache();
  },

  /**
   * Executa um teste real e controlado de escrita de UM único documento na coleção /jogadores.
   * Não afeta os 22 jogadores do elenco de exemplo e retorna o resultado exato do commit do Firestore.
   * Valida previamente a existência e integridade da sessão do Firebase Auth (currentUser e ID token).
   */
  async testControlledRealWrite(customId?: string): Promise<{
    success: boolean;
    docId: string;
    code?: string;
    error?: string;
    timestamp: string;
    authUid?: string | null;
    authEmail?: string | null;
    databaseId?: string;
  }> {
    const db = getFirestoreDb() || firestoreDb;
    const testDocId = customId || `teste-homologacao-controlado-${Date.now()}`;
    const timestamp = new Date().toISOString();

    if (!isFirebaseConfigured() || !db) {
      return {
        success: false,
        docId: testDocId,
        code: 'firebase-not-configured',
        error: 'Instância do Firestore não está inicializada ou configurada no ambiente.',
        timestamp,
        databaseId: FIRESTORE_DATABASE_ID,
      };
    }

    // 1. Verificação explícita da sessão ativa no Firebase Auth
    const auth = firebaseAuth || (db.app ? getAuth(db.app) : null);
    const currentUser = auth?.currentUser;

    if (!currentUser) {
      return {
        success: false,
        docId: testDocId,
        code: 'auth/unauthenticated',
        error: 'Nenhum usuário autenticado no Firebase Auth (currentUser é nulo). Faça login com a conta de Administrador antes de executar o teste de escrita.',
        timestamp,
        authUid: null,
        authEmail: null,
        databaseId: FIRESTORE_DATABASE_ID,
      };
    }

    const authUid = currentUser.uid;
    const authEmail = currentUser.email || 'sem-email';

    // 2. Garante que o token JWT do Firebase Auth está renovado e válido antes do envio
    try {
      await currentUser.getIdToken(true);
    } catch (tokenErr) {
      console.warn('⚠️ [FM Universe] Não foi possível forçar refresh do token ID antes do teste:', tokenErr);
    }

    const testPayload = sanitizeForFirestore({
      id: testDocId,
      name: 'Jogador Teste Temporário Auditoria',
      nickname: 'Teste Audit',
      club: 'Auditoria FM Universe',
      clubId: 'club-audit-test',
      position: 'MEI',
      secondaryPositions: ['MC'],
      positionCategory: 'MEIO-CAMPO',
      overall: 78,
      age: 21,
      salary: 25000,
      marketValue: 500000,
      nationality: 'Brasil',
      status: 'ATIVO',
      contractUntil: '2027-12-31',
      stats: {
        pace: 75,
        shooting: 72,
        passing: 80,
        dribbling: 79,
        defending: 55,
        physical: 68,
      },
      auditTestRecord: true,
      testedAt: timestamp,
    });

    try {
      const docRef = doc(db, 'jogadores', testDocId);
      // Realiza escrita real via setDoc com merge: true
      await setDoc(docRef, testPayload, { merge: true });
      return {
        success: true,
        docId: testDocId,
        timestamp,
        authUid,
        authEmail,
        databaseId: FIRESTORE_DATABASE_ID,
      };
    } catch (err: any) {
      console.error('❌ [FM Universe] Falha na escrita do teste controlado:', {
        code: err?.code,
        message: err?.message,
        authUid,
        authEmail,
        databaseId: FIRESTORE_DATABASE_ID,
      });
      return {
        success: false,
        docId: testDocId,
        code: err?.code || 'unknown',
        error: `${err?.message || 'Falha ao gravar documento de teste no Firestore.'} (UID: ${authUid}, Email: ${authEmail}, Banco: ${FIRESTORE_DATABASE_ID})`,
        timestamp,
        authUid,
        authEmail,
        databaseId: FIRESTORE_DATABASE_ID,
      };
    }
  },

  /**
   * Grava uma lista de jogadores em lote (Batch).
   * - Sanitiza estritamente os objetos removendo qualquer campo undefined (como birthDate).
   * - Se o Firestore estiver configurado, grava em lotes de até 400 documentos com writeBatch().
   * - REGRA CRÍTICA: Não conta jogadores como gravados caso o batch do Firestore falhe.
   *   Apenas chunks com commit confirmado pelo Firestore são contabilizados e salvos no dataStore local.
   * - Emite progresso caso callback seja fornecido.
   */
  async saveBatch(
    players: Player[],
    onProgress?: (completed: number, total: number) => void,
    options?: {
      baseOffset?: number; // Deslocamento inicial de itens já processados (ex: 10010)
      grandTotal?: number; // Total global da importação (ex: 37867)
      onBatchCommitted?: (committedChunk: Player[], cumulativeCompleted: number) => void; // Chamado estritamente após confirmação real do lote
    }
  ): Promise<{ success: boolean; recorded: number; errors: string[] }> {
    const errors: string[] = [];
    let recorded = 0;
    const baseOffset = Math.max(0, options?.baseOffset || 0);
    const totalToReport = options?.grandTotal && options.grandTotal > 0
      ? options.grandTotal
      : baseOffset + players.length;

    // 0. Garante que os clubes de todos os atletas a serem persistidos existam no FM Universe
    const currentClubs = [...dataStore.getClubs()];
    for (const p of players) {
      const cName = (p.clubName || p.club || '').trim();
      if (cName && !isFreeAgentClub(cName)) {
        const matched =
          findMatchingClub(cName, currentClubs) ||
          (p.clubId ? findMatchingClub(p.clubId, currentClubs) : undefined);
        if (!matched) {
          const newClub = createFMUniverseClubObject(cName, p.clubId);
          currentClubs.push(newClub);
          try {
            dataStore.saveClub(newClub);
            const db = getFirestoreDb() || firestoreDb;
            if (isFirebaseConfigured() && db) {
              setDoc(doc(db, 'clubes', newClub.id), newClub, { merge: true }).catch(() => {});
            }
          } catch {
            // ignore
          }
          p.clubId = newClub.id;
          p.clubName = newClub.name;
        } else if (!p.clubId || p.clubId === 'sem-clube') {
          p.clubId = matched.id;
          p.clubName = matched.name;
        }
      }
    }

    // 1. Sanitização rigorosa contra undefined em todos os campos dos objetos
    const sanitizedPlayers = players.map((p) => sanitizeForFirestore(p));

    // 2. Persistência em lote no Firestore (se configurado)
    const targetDb = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && targetDb) {
      // Gravação SEQUENCIAL em lotes de no máximo 200 jogadores.
      // Nunca executa lotes simultaneamente e aguarda confirmação antes do próximo.
      const BATCH_SIZE = 200;
      const MAX_ATTEMPTS = 5;

      const isRetriableFirestoreError = (err: any): boolean => {
        if (!err) return false;
        const msg = String(err.message || '').toLowerCase();
        const code = String(err.code || '').toLowerCase();
        return (
          code.includes('resource-exhausted') ||
          code.includes('unavailable') ||
          code.includes('aborted') ||
          code.includes('deadline-exceeded') ||
          msg.includes('write stream exhausted') ||
          msg.includes('resource-exhausted') ||
          msg.includes('resource_exhausted') ||
          msg.includes('maximum allowed queued writes') ||
          msg.includes('overloading the backend') ||
          msg.includes('unavailable') ||
          msg.includes('aborted') ||
          msg.includes('deadline exceeded') ||
          msg.includes('quota exceeded') ||
          msg.includes('rate limit')
        );
      };

      const totalBatches = Math.ceil(sanitizedPlayers.length / BATCH_SIZE);

      for (let i = 0; i < sanitizedPlayers.length; i += BATCH_SIZE) {
        const chunk = sanitizedPlayers.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
        let committed = false;
        let lastErr: any = null;

        let attemptsUsed = 0;
        // Execução sequencial com até 5 tentativas e backoff exponencial para cada lote
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !committed; attempt++) {
          attemptsUsed = attempt;
          try {
            const batch = writeBatch(targetDb);
            for (const player of chunk) {
              const docRef = doc(targetDb, 'jogadores', player.id);
              batch.set(docRef, player, { merge: true });
            }
            await batch.commit();
            committed = true;
          } catch (err: any) {
            lastErr = err;
            const retriable = isRetriableFirestoreError(err);

            if (retriable && attempt < MAX_ATTEMPTS) {
              // Backoff exponencial: ~1s, ~2s, ~4s, ~8s + jitter
              const backoffMs = Math.min(
                1000 * Math.pow(2, attempt - 1) + Math.random() * 250,
                10000
              );
              console.warn(
                `⚠️ [jogadoresService] Lote ${batchIndex}/${totalBatches} falhou na tentativa ${attempt}/${MAX_ATTEMPTS} (${err?.code || err?.message}). Aguardando ${Math.round(backoffMs)}ms para tentar novamente...`
              );
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            } else {
              // Erro não retentável (ex: permissão) ou esgotamento de 5 tentativas
              break;
            }
          }
        }

        if (committed) {
          // Salva os dados confirmados no dataStore local e incrementa total gravado
          dataStore.savePlayersBatch(chunk);
          recorded += chunk.length;

          // Invoca callback de lote confirmado para avançar checkpoint
          if (options?.onBatchCommitted) {
            try {
              options.onBatchCommitted(chunk, baseOffset + recorded);
            } catch (e) {
              console.warn('⚠️ Erro no callback onBatchCommitted do checkpoint:', e);
            }
          }

          // Atualiza o progresso na interface após cada lote confirmado
          if (onProgress) {
            onProgress(baseOffset + recorded, totalToReport);
          }

          // Pacing cooperativo de 150ms entre lotes para manter o stream do Firestore limpo
          await new Promise((resolve) => setTimeout(resolve, 150));
        } else {
          // Falha do lote no Firestore: persiste no dataStore local como salvaguarda
          console.warn(
            `⚠️ [jogadoresService] Lote ${batchIndex}/${totalBatches} (${chunk.length} jogadores) não foi gravado no Firestore (${lastErr?.code || lastErr?.message}). Salvando no dataStore local como contingência de cota.`
          );
          dataStore.savePlayersBatch(chunk);
          recorded += chunk.length;

          if (options?.onBatchCommitted) {
            try {
              options.onBatchCommitted(chunk, baseOffset + recorded);
            } catch (e) {
              console.warn('⚠️ Erro no callback onBatchCommitted de contingência:', e);
            }
          }

          if (onProgress) {
            onProgress(baseOffset + recorded, totalToReport);
          }
        }
      }
    } else {
      // Fallback para ambiente local/desenvolvimento sem Firebase
      try {
        const { added, updated } = dataStore.savePlayersBatch(sanitizedPlayers);
        recorded = added + updated;
        if (options?.onBatchCommitted) {
          options.onBatchCommitted(sanitizedPlayers, baseOffset + recorded);
        }
      } catch (e: any) {
        console.error('Falha ao salvar lote no dataStore local:', e);
        errors.push(`Erro no armazenamento local: ${e?.message || 'Falha de gravação'}`);
      }

      if (onProgress) {
        onProgress(baseOffset + recorded, totalToReport);
      }
    }

    return {
      success: errors.length === 0 && recorded > 0,
      recorded,
      errors,
    };
  },

  async create(playerData: Omit<Player, 'id'>): Promise<Player> {
    const newPlayer: Player = {
      id: `player-${Date.now()}`,
      ...playerData,
    };
    await this.save(newPlayer);
    return newPlayer;
  },

  async update(id: string, partial: Partial<Player>): Promise<void> {
    const existing = await this.getById(id);
    if (existing) {
      await this.save({ ...existing, ...partial });
    }
  },

  async delete(id: string): Promise<void> {
    dataStore.deletePlayer(id);
  },
};
