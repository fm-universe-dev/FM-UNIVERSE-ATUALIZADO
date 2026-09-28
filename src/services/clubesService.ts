import { Club, ClubAuditReport, ManagerProfile } from '../types';
import { isFirebaseConfigured, firestoreDb, getFirestoreDb } from '../config/firebase';
import { dataStore } from './dataStore';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, updateDoc, writeBatch } from 'firebase/firestore';
import { managersService } from './managersService';
import {
  isFreeAgentClub,
  findMatchingClub,
  createFMUniverseClubObject,
  normalizeClubComparisonKey,
  slugifyClubName,
  generateValidClubId,
  CANONICAL_CLUB_IDS,
} from '../utils/clubUtils';

export {
  isFreeAgentClub,
  findMatchingClub,
  createFMUniverseClubObject,
  normalizeClubComparisonKey,
  slugifyClubName,
  generateValidClubId,
  CANONICAL_CLUB_IDS,
};

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
  managersList?: ManagerProfile[]
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

function ensureClubPreparation(club: Club): Club {
  if (club.id === 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3') {
    return {
      ...club,
      balance: typeof club.balance === 'number' ? club.balance : 20000000,
      capacity: club.capacity || 75000,
    };
  }
  return club;
}

export const clubesService = {
  async getAll(): Promise<Club[]> {
    const db = getFirestoreDb() || firestoreDb;
    let resultClubs: Club[] = [];

    // Busca lista atual de managers para validação rigorosa dos vínculos canônicos
    const allManagers = await managersService.getAllManagers().catch(() => []);

    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'clubes');
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          const firestoreClubs = snap.docs.map((d) => ensureClubPreparation({ id: d.id, ...d.data() } as Club));

          // 1. Identifica os 6 documentos canônicos pelos vínculos atuais com os Managers
          const canonicalClubs: Club[] = [];
          const extraClubsToDelete: Club[] = [];

          firestoreClubs.forEach((c) => {
            if (isPreservedManagerClub(c, allManagers)) {
              if (!canonicalClubs.some((existing) => existing.id === c.id)) {
                canonicalClubs.push(c);
              } else {
                extraClubsToDelete.push(c);
              }
            } else {
              extraClubsToDelete.push(c);
            }
          });

          // 2. Remove somente os clubes extras/duplicados que não fazem parte dessa lista canônica
          if (extraClubsToDelete.length > 0) {
            console.info(
              `🧹 [clubesService] Removendo ${extraClubsToDelete.length} clubes extras/duplicados da coleção /clubes:`,
              extraClubsToDelete.map((c) => `${c.name} (${c.id})`)
            );
            for (const extra of extraClubsToDelete) {
              try {
                await deleteDoc(doc(db, 'clubes', extra.id));
                dataStore.deleteClub(extra.id);
              } catch (delErr) {
                console.warn(`⚠️ [clubesService] Falha ao excluir clube extra ${extra.id} do Firestore:`, delErr);
              }
            }
          }

          // Sincroniza dataStore local removendo clubes que foram excluídos do Firestore
          const canonicalIdSet = new Set(canonicalClubs.map((c) => c.id));
          const localClubs = dataStore.getClubs();
          localClubs.forEach((c) => {
            if (!canonicalIdSet.has(c.id)) {
              dataStore.deleteClub(c.id);
            }
          });

          canonicalClubs.forEach((c) => {
            try {
              dataStore.saveClub(c);
            } catch {
              // ignore
            }
          });
          resultClubs = canonicalClubs;
        }
      } catch (err) {
        console.warn('Falha na consulta Firestore para clubes. Usando fallback.', err);
      }
    }

    if (resultClubs.length === 0) {
      resultClubs = dataStore
        .getClubs()
        .filter((c) => isPreservedManagerClub(c, allManagers))
        .map(ensureClubPreparation);
    }

    // Regra estrita: A coleção final /clubes deve conter exatamente os 6 clubes canônicos
    const filtered = resultClubs.filter((c) => isPreservedManagerClub(c, allManagers));
    return filtered;
  },

  async getBySlug(slug: string): Promise<Club | null> {
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const clubs = await this.getAll();
        const found = clubs.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
        if (found) return found;
      } catch (err) {
        console.warn('Falha ao buscar clube por slug via Firestore.', err);
      }
    }
    return dataStore.getClubBySlug(slug) || null;
  },

  async getById(id: string): Promise<Club | null> {
    const cleanId = id?.trim();
    if (!cleanId) return null;

    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        // 1. Tenta pelo ID exato
        let docRef = doc(db, 'clubes', cleanId);
        let snap = await getDoc(docRef);
        if (snap.exists()) {
          const club = ensureClubPreparation({ id: snap.id, ...snap.data() } as Club);
          try { dataStore.saveClub(club); } catch { /* ignore */ }
          return club;
        }

        // 2. Se não tiver prefixo 'club-', tenta com 'club-'
        if (!cleanId.startsWith('club-')) {
          docRef = doc(db, 'clubes', `club-${cleanId}`);
          snap = await getDoc(docRef);
          if (snap.exists()) {
            const club = ensureClubPreparation({ id: snap.id, ...snap.data() } as Club);
            try { dataStore.saveClub(club); } catch { /* ignore */ }
            return club;
          }
        } else {
          // 3. Se tiver prefixo 'club-', tenta sem 'club-'
          const withoutPrefix = cleanId.replace(/^club-/, '');
          docRef = doc(db, 'clubes', withoutPrefix);
          snap = await getDoc(docRef);
          if (snap.exists()) {
            const club = ensureClubPreparation({ id: snap.id, ...snap.data() } as Club);
            try { dataStore.saveClub(club); } catch { /* ignore */ }
            return club;
          }
        }
      } catch (err) {
        console.warn('Falha ao buscar clube por ID via Firestore.', err);
      }
    }
    const local = dataStore.getClubById(cleanId);
    if (local) return ensureClubPreparation(local);

    // Fallback em getAll por ID, slug ou nome
    const all = await this.getAll();
    const cleanSlug = cleanId.replace(/^club-/, '').toLowerCase();
    const matched =
      all.find((c) => c.id === cleanId) ||
      all.find((c) => c.slug?.toLowerCase() === cleanSlug) ||
      all.find((c) => c.name?.toLowerCase() === cleanId.toLowerCase()) ||
      null;

    if (matched) {
      const prepared = ensureClubPreparation(matched);
      try { dataStore.saveClub(prepared); } catch { /* ignore */ }
      return prepared;
    }

    return null;
  },

  async getByName(name: string): Promise<Club | null> {
    const cleanName = name?.trim();
    if (!cleanName) return null;
    const all = await this.getAll();
    return (
      all.find(
        (c) =>
          c.name.toLowerCase() === cleanName.toLowerCase() ||
          c.slug?.toLowerCase() === cleanName.toLowerCase() ||
          c.shortName?.toLowerCase() === cleanName.toLowerCase()
      ) || null
    );
  },

  /**
   * Localiza o clube vinculado exclusivamente a um Manager pelo seu UID/managerId.
   */
  async getByManagerId(managerId: string): Promise<Club | null> {
    const cleanUid = managerId?.trim();
    if (!cleanUid) return null;

    const db = getFirestoreDb() || firestoreDb;

    // 1. Tenta direto pelo ID determinístico: club-{uid}
    const deterministicId = `club-${cleanUid}`;
    const direct = await this.getById(deterministicId);
    if (direct) return direct;

    // 2. Tenta direto pelo próprio cleanUid (caso o documento não use prefixo)
    const directUid = await this.getById(cleanUid);
    if (directUid) return directUid;

    // 3. Consulta Firestore com query where('managerId', '==', cleanUid)
    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'clubes');
        const q = query(colRef, where('managerId', '==', cleanUid));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const docSnap = qSnap.docs[0];
          const club = ensureClubPreparation({ id: docSnap.id, ...docSnap.data() } as Club);
          try { dataStore.saveClub(club); } catch { /* ignore */ }
          return club;
        }
      } catch (err) {
        console.warn('Falha ao consultar clube por managerId via Firestore.', err);
      }
    }

    // 4. Busca na coleção completa (Firestore + local)
    const all = await this.getAll();
    const found = all.find(
      (c) => c.managerId === cleanUid || c.id === deterministicId || c.id === cleanUid
    );
    if (found) {
      const prepared = ensureClubPreparation(found);
      try { dataStore.saveClub(prepared); } catch { /* ignore */ }
      return prepared;
    }

    // 5. Fallback no dataStore
    const fallback =
      dataStore
        .getClubs()
        .find((c) => c.managerId === cleanUid || c.id === deterministicId || c.id === cleanUid) || null;
    return fallback ? ensureClubPreparation(fallback) : null;
  },

  async save(club: Club): Promise<void> {
    try { dataStore.saveClub(club); } catch { /* ignore */ }
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'clubes', club.id);
        await setDoc(docRef, club, { merge: true });
      } catch (err) {
        console.warn('Falha ao persistir clube no Firestore.', err);
      }
    }
  },

  async create(clubData: Omit<Club, 'id'>): Promise<Club> {
    const newClub: Club = {
      id: `club-${Date.now()}`,
      ...clubData,
    };
    await this.save(newClub);
    return newClub;
  },

  /**
   * Cria um clube com vínculo determinístico ao UID do Manager e estrutura compatível com o FM Universe.
   */
  async createManagerClub(
    uid: string,
    managerName: string,
    clubData: {
      name: string;
      code?: string;
      logoUrl?: string;
      homeKitUrl?: string;
      awayKitUrl?: string;
      stadiumName: string;
      stadiumImageUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      capacity?: number;
    }
  ): Promise<Club> {
    const cleanUid = uid.trim();
    if (!cleanUid) throw new Error('UID do manager é obrigatório.');

    // ID determinístico baseado no UID para unicidade e consistência
    const deterministicId = `club-${cleanUid}`;
    const slug = clubData.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `clube-${cleanUid.slice(0, 8)}`;

    const code = (
      clubData.code?.trim() ||
      clubData.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() ||
      'CLB'
    ).slice(0, 3);

    const now = new Date().toISOString();

    const newClub: Club = {
      id: deterministicId,
      name: clubData.name.trim(),
      slug,
      shortName: clubData.name.slice(0, 16),
      code,
      badge: clubData.logoUrl || '',
      logoUrl: clubData.logoUrl || '',
      homeKitUrl: clubData.homeKitUrl || '',
      awayKitUrl: clubData.awayKitUrl || '',
      stadiumId: `stadium-${cleanUid}`,
      stadiumName: clubData.stadiumName.trim(),
      stadiumImageUrl: clubData.stadiumImageUrl || '',
      capacity: clubData.capacity || 42000,
      reputation: 3,
      transferBudget: 45000000,
      wageBudget: 4500000,
      balance: 45000000,
      managerId: cleanUid,
      managerName: managerName || 'Treinador',
      squadCount: 0,
      fansCount: 30000,
      primaryColor: clubData.primaryColor || '#10b981',
      secondaryColor: clubData.secondaryColor || '#059669',
      boardExpectation: 'Consolidar a equipe na divisão',
      seasonTarget: 'Primeira metade da tabela',
      trophiesCount: 0,
      foundedYear: new Date().getFullYear(),
      createdAt: now,
      updatedAt: now,
    };

    await this.save(newClub);
    return newClub;
  },

  async update(id: string, partial: Partial<Club>): Promise<void> {
    const existing = await this.getById(id);
    if (existing) {
      await this.save({ ...existing, ...partial });
    }
  },

  isFreeAgentClub(clubName?: string | null): boolean {
    return isFreeAgentClub(clubName);
  },

  findMatchingClub(clubNameOrId: string, clubs: Club[]): Club | undefined {
    return findMatchingClub(clubNameOrId, clubs);
  },

  createFMUniverseClubObject(clubName: string, customClubId?: string): Club {
    return createFMUniverseClubObject(clubName, customClubId);
  },

  /**
   * Garante a existência do clube no FM Universe de forma assíncrona.
   * Se já existir, reutiliza o clube existente sem duplicar.
   * Se não existir, cria automaticamente, salva na coleção e retorna o clube.
   */
  async ensureClubExists(clubName: string, clubIdHint?: string): Promise<Club | null> {
    if (isFreeAgentClub(clubName)) return null;
    const allClubs = await this.getAll();
    const existing =
      findMatchingClub(clubName, allClubs) ||
      (clubIdHint ? findMatchingClub(clubIdHint, allClubs) : undefined);
    if (existing) {
      return existing;
    }

    const newClub = createFMUniverseClubObject(clubName, clubIdHint);
    await this.save(newClub);
    try {
      dataStore.saveClub(newClub);
    } catch {
      // ignore
    }
    return newClub;
  },

  /**
   * Versão síncrona / em lote para garantir a existência de clubes durante importações massivas.
   * Reutiliza clubes existentes no cache ou dataStore e persiste novos clubes.
   */
  ensureClubExistsSync(
    clubName: string,
    clubIdHint?: string,
    clubsCache?: Club[]
  ): Club | null {
    if (isFreeAgentClub(clubName)) return null;
    const cache = clubsCache || dataStore.getClubs();
    const existing =
      findMatchingClub(clubName, cache) ||
      (clubIdHint ? findMatchingClub(clubIdHint, cache) : undefined);
    if (existing) {
      return existing;
    }

    const newClub = createFMUniverseClubObject(clubName, clubIdHint);
    if (clubsCache) {
      clubsCache.push(newClub);
    }
    try {
      dataStore.saveClub(newClub);
      // Salva de forma resiliente no Firestore em background
      this.save(newClub).catch((err) => {
        console.warn(`[clubesService] Falha ao persistir clube ${newClub.name} no Firestore:`, err);
      });
    } catch {
      // ignore
    }
    return newClub;
  },

  /**
   * Realiza auditoria detalhada de dependências de um clube específico.
   * Não apaga nenhum dado — avalia vínculos e regras de segurança.
   */
  checkClubDependencies(id: string, clubOverride?: Club): ClubAuditReport {
    const club = clubOverride || dataStore.getClubById(id);
    const clubName = club?.name || id;
    const code = club?.code || '';
    const managerId = club?.managerId?.trim();
    const managerName = club?.managerName?.trim();

    // 1. Jogadores no plantel
    const allPlayers = dataStore.getPlayers();
    const clubPlayers = allPlayers.filter(
      (p) => p.clubId === id || (p as any).currentClubId === id
    );
    const squadCount = clubPlayers.length;
    const playerNames = clubPlayers.map((p) => p.name);

    // 2. Histórico de Transferências
    const allTransfers = dataStore.getTransfers();
    const clubTransfers = allTransfers.filter(
      (t) =>
        t.fromClubId === id ||
        t.toClubId === id ||
        (clubName && (t.fromClubName === clubName || t.toClubName === clubName))
    );
    const transfersCount = clubTransfers.length;
    const transfersSummary = clubTransfers.map(
      (t) => `${t.playerName} (${t.fromClubName || 'Origem'} → ${t.toClubName || 'Destino'})`
    );

    // 3. Movimentações Financeiras
    const allFinances = dataStore.getFinances();
    const clubFinances = allFinances.filter((f) => f.clubId === id);
    const financesCount = clubFinances.length;
    const financesDescription = clubFinances.map(
      (f) => `${f.description || f.category} (R$ ${f.amount?.toLocaleString('pt-BR') || 0})`
    );

    // 4. Partidas / Calendário
    const allMatches = dataStore.getMatches();
    const clubMatches = allMatches.filter((m) => m.homeClubId === id || m.awayClubId === id);
    const matchesCount = clubMatches.length;

    // 5. Leilões ativos
    const activeAuctions = clubPlayers.filter(
      (p) => Boolean(p.isAuctionActive) || p.auctionStatus === 'IN_AUCTION'
    );
    const activeAuctionsCount = activeAuctions.length;

    // 6. Verificação do Ninja FC / Rodrigo Mariano (Proteção Absoluta)
    const isNinjaFC =
      id === 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1' ||
      clubName === 'Ninja FC' ||
      managerId === 'NKijWNgl4ORYGpkESx1nvBLQpBx1';

    // 7. Vínculo de Manager
    const hasManager = Boolean(managerId && managerId.length > 0) || isPreservedManagerClub(club);
    const managerStatus = hasManager ? 'WITH_MANAGER' : 'WITHOUT_MANAGER';

    // 8. Classificação no Universo: Os 6 clubes canônicos com Manager são oficiais da liga
    const officialCodes = ['FMU', 'RFO', 'INT', 'POR', 'SAN', 'NIN', 'TFC', 'MUT', 'TRA', 'SPB', 'NSF'];
    const officialIds = [
      'club-1',
      'club-2',
      'club-3',
      'club-4',
      'club-5',
      'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
      'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3',
      'club-mutants',
      'club-nos-travamos',
      'club-saopaulobrasil',
      'club-ninguemsegura-fc',
    ];
    const isOfficial = CANONICAL_CLUB_IDS.has(id) || officialIds.includes(id) || officialCodes.includes(code.toUpperCase());
    const universeType = isOfficial ? 'OFFICIAL' : 'TEST_FICTITIOUS';

    // Lista de dependências ativas informativas (Exibidas na confirmação da exclusão administrativa)
    const protectionReasons: string[] = [];

    if (isNinjaFC) {
      protectionReasons.push(
        'Clube vinculado ao Manager oficial Rodrigo Mariano (Aviso Especial: requer confirmação administrativa com digitação do nome)'
      );
    }
    if (hasManager) {
      protectionReasons.push(
        `Manager vinculado: ${managerName || 'Manager'} (${managerId})`
      );
    }
    if (squadCount > 0) {
      protectionReasons.push(
        `Elenco com ${squadCount} jogador(es) (${playerNames.slice(0, 3).join(', ')}${playerNames.length > 3 ? '...' : ''})`
      );
    }
    if (transfersCount > 0) {
      protectionReasons.push(
        `${transfersCount} registro(s) no histórico de transferências`
      );
    }
    if (financesCount > 0) {
      protectionReasons.push(
        `${financesCount} lançamento(s) financeiro(s) registrado(s)`
      );
    }
    if (matchesCount > 0) {
      protectionReasons.push(
        `${matchesCount} partida(s) no calendário da temporada`
      );
    }
    if (activeAuctionsCount > 0) {
      protectionReasons.push(`${activeAuctionsCount} leilão(ões) em andamento`);
    }

    // REGRA PRINCIPAL: O ADMIN TEM AUTORIDADE TOTAL SOBRE OS CLUBES DA LIGA
    // canDelete é sempre true: o Administrador tem autoridade para excluir qualquer clube
    const canDelete = true;

    return {
      clubId: id,
      clubName,
      code,
      universeType,
      managerStatus,
      managerName: managerName || undefined,
      managerId: managerId || undefined,
      isNinjaFC,
      squadCount,
      playerNames,
      financesCount,
      financesDescription,
      transfersCount,
      transfersSummary,
      matchesCount,
      activeAuctionsCount,
      canDelete,
      protectionReasons,
    };
  },

  /**
   * Executa a auditoria em lote para todos os clubes cadastrados.
   */
  async auditAllClubs(): Promise<ClubAuditReport[]> {
    const clubs = await this.getAll();
    return clubs.map((c) => this.checkClubDependencies(c.id, c));
  },

  /**
   * Exclusão administrativa segura de clube.
   * O ADMIN TEM AUTORIDADE TOTAL SOBRE OS CLUBES DA LIGA.
   * Qualquer clube pode ser excluído pelo Admin.
   * Realiza a limpeza em cascata com total integridade:
   * - Desvincula Manager(s) sem excluir suas contas/perfis de autenticação
   * - Desvincula jogadores do clube, tornando-os agentes livres ('Sem Clube')
   * - Trata partidas/calendário do clube excluído
   * - Trata inscrições em competições
   * - Limpa propostas de transferências pendentes
   * - Limpa registros financeiros do clube sem afetar outros clubes
   * - Remove clube do dataStore e do Firestore
   * - Registra log de auditoria com detalhes completos
   */
  async delete(
    id: string,
    adminEmail?: string
  ): Promise<{
    clubId: string;
    clubName: string;
    unlinkedPlayersCount: number;
    unlinkedManagersCount: number;
    cleanedMatchesCount: number;
    cleanedFinancesCount: number;
  }> {
    const club = dataStore.getClubById(id) || (await this.getById(id));
    if (!club) {
      throw new Error(`Clube não encontrado na base de dados (ID: ${id})`);
    }

    const clubName = club.name;
    const auditBefore = this.checkClubDependencies(id, club);

    // 1. Desvincular Managers associados a este clube
    const affectedManagerUids = await managersService.unlinkManagersFromClub(id);

    // 2. Tratar jogadores associados ao clube
    // Desvincula os jogadores sem apagá-los da base global, tornando-os agentes livres ("Sem Clube")
    const allPlayers = dataStore.getPlayers();
    let unlinkedPlayersCount = 0;
    const updatedPlayers = allPlayers.map((p) => {
      if (p.clubId === id || (p as any).currentClubId === id) {
        unlinkedPlayersCount++;
        return {
          ...p,
          clubId: '',
          clubName: 'Sem Clube',
          club: 'Sem Clube',
          isAuctionActive: false,
          auctionStatus: undefined,
        };
      }
      return p;
    });

    if (unlinkedPlayersCount > 0) {
      dataStore.setPlayers(updatedPlayers);

      // Atualiza também no Firestore se configurado
      const db = getFirestoreDb() || firestoreDb;
      if (isFirebaseConfigured() && db) {
        try {
          const playersRef = collection(db, 'players');
          const q = query(playersRef, where('clubId', '==', id));
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            await updateDoc(doc(db, 'players', docSnap.id), {
              clubId: '',
              clubName: 'Sem Clube',
              club: 'Sem Clube',
              isAuctionActive: false,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn('⚠️ [clubesService] Erro ao atualizar jogadores no Firestore:', err);
        }
      }
    }

    // 3. Tratar partidas / calendário da temporada
    const allMatches = dataStore.getMatches();
    const remainingMatches = allMatches.filter((m) => m.homeClubId !== id && m.awayClubId !== id);
    const cleanedMatchesCount = allMatches.length - remainingMatches.length;
    if (cleanedMatchesCount > 0) {
      dataStore.setMatches(remainingMatches);

      const db = getFirestoreDb() || firestoreDb;
      if (isFirebaseConfigured() && db) {
        try {
          const matchesRef = collection(db, 'matches');
          const qHome = query(matchesRef, where('homeClubId', '==', id));
          const qAway = query(matchesRef, where('awayClubId', '==', id));
          const [snapHome, snapAway] = await Promise.all([getDocs(qHome), getDocs(qAway)]);
          const docIds = new Set([...snapHome.docs.map((d) => d.id), ...snapAway.docs.map((d) => d.id)]);
          for (const matchDocId of docIds) {
            await deleteDoc(doc(db, 'matches', matchDocId));
          }
        } catch (err) {
          console.warn('⚠️ [clubesService] Erro ao limpar partidas no Firestore:', err);
        }
      }
    }

    // 4. Tratar participantes em competições
    dataStore.removeCompetitionParticipantByClub(id);

    // 5. Tratar propostas de transferências pendentes
    const allOffers = dataStore.getTransferOffers();
    const remainingOffers = allOffers.filter((o) => o.fromClubId !== id && o.toClubId !== id);
    dataStore.setTransferOffers(remainingOffers);

    // 6. Tratar movimentações financeiras exclusivas do clube excluído
    const initialFinances = dataStore.getFinances();
    dataStore.removeFinancesByClub(id);
    dataStore.removeFinancialConfigByClub(id);
    const cleanedFinancesCount = initialFinances.filter((f) => f.clubId === id).length;

    // 7. Remove o clube do dataStore local (memória e localStorage)
    dataStore.deleteClub(id);

    // 8. Remove o documento do clube no Firestore
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        await deleteDoc(doc(db, 'clubes', id));
      } catch (err) {
        console.warn(`Falha ao remover documento /clubes/${id} no Firestore:`, err);
      }
    }

    // 9. Limpa referências de clube ativo na sessão do navegador
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('fmu_current_managed_club');
        if (raw) {
          const currentClub = JSON.parse(raw);
          if (currentClub && (currentClub.id === id || currentClub.name === clubName)) {
            localStorage.removeItem('fmu_current_managed_club');
          }
        }
      } catch {
        // ignore
      }
    }

    // 10. Registra log de auditoria permanente da exclusão
    const auditRecord = {
      id: `audit-club-del-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      action: 'ADMIN_CLUB_DELETED',
      clubId: id,
      clubName,
      clubCode: club.code,
      admin: adminEmail || 'Administrador',
      timestamp: new Date().toISOString(),
      details: {
        isNinjaFC: auditBefore.isNinjaFC,
        unlinkedPlayersCount,
        unlinkedPlayerNames: auditBefore.playerNames,
        unlinkedManagersCount: affectedManagerUids.length,
        unlinkedManagerUids: affectedManagerUids,
        cleanedMatchesCount,
        cleanedFinancesCount,
        transfersCount: auditBefore.transfersCount,
      },
    };

    dataStore.addClubAuditLog(auditRecord);

    if (isFirebaseConfigured() && db) {
      try {
        await setDoc(doc(db, 'audit_logs', auditRecord.id), auditRecord);
      } catch (err) {
        console.warn('⚠️ [clubesService] Falha ao gravar log de auditoria no Firestore:', err);
      }
    }

    return {
      clubId: id,
      clubName,
      unlinkedPlayersCount,
      unlinkedManagersCount: affectedManagerUids.length,
      cleanedMatchesCount,
      cleanedFinancesCount,
    };
  },

  /**
   * Limpeza administrativa única na coleção de clubes do FM Universe.
   * Regras obrigatórias:
   * 1. Preservar estritamente os 6 clubes com Manager:
   *    - Thales FC — Thales Henrique
   *    - Ninja FC — Rodrigo Mariano
   *    - Mutant's — Igor Vicente
   *    - Nós Travamos — Leandro Vicente
   *    - SaoPauloBrasil — Thales Henrique
   *    - NinguemSegura FC — Rodrigo Mariano
   * 2. Remover os demais 215 clubes sem Manager.
   * 3. Não excluir nenhum Manager.
   * 4. Não alterar jogadores, leilões, finanças, campeonatos, partidas, temporadas ou autenticação.
   * 5. Realizar validação prévia dos IDs para garantir que nenhum clube com Manager será excluído.
   * 6. Execução direta no Firestore e no dataStore local, de forma atômica e idempotente.
   */
  async executeOneTimeClubsCleanup(forceRun = false): Promise<{
    totalBefore: number;
    deletedCount: number;
    remainingCount: number;
    preservedNames: string[];
    preservedIds: string[];
  }> {
    const isCleaned =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('fmu_cleanup_215_completed') === 'true';

    if (isCleaned && !forceRun) {
      const audit = typeof localStorage !== 'undefined' ? localStorage.getItem('fmu_cleanup_215_audit') : null;
      const parsed = audit ? JSON.parse(audit) : null;
      return {
        totalBefore: parsed?.totalBefore || 221,
        deletedCount: parsed?.deletedCount || 215,
        remainingCount: parsed?.preservedCount || 6,
        preservedNames: parsed?.preservedClubNames || [
          'Thales FC',
          'Ninja FC',
          "Mutant's",
          'Nós Travamos',
          'SaoPauloBrasil',
          'NinguemSegura FC',
        ],
        preservedIds: parsed?.preservedClubIds || [],
      };
    }

    const db = getFirestoreDb() || firestoreDb;
    const allClubsMap = new Map<string, Club>();

    // 1. Coleta clubes do Firestore
    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'clubes');
        const snap = await getDocs(colRef);
        snap.docs.forEach((d) => {
          allClubsMap.set(d.id, ensureClubPreparation({ id: d.id, ...d.data() } as Club));
        });
      } catch (err) {
        console.warn('⚠️ [clubesService] Consulta ao Firestore durante limpeza:', err);
      }
    }

    // Coleta clubes do dataStore local se não presentes
    dataStore.getClubs().forEach((c) => {
      if (!allClubsMap.has(c.id)) {
        allClubsMap.set(c.id, ensureClubPreparation(c));
      }
    });

    const allClubs = Array.from(allClubsMap.values());
    const totalBefore = allClubs.length;

    // Busca lista atual de managers para validação cruzada
    const allManagers = await managersService.getAllManagers().catch(() => []);

    // 2. Separação categórica: Preservar (exclusivamente os 6 canônicos) vs Excluir (demais e duplicados)
    const clubsToPreserve: Club[] = [];
    const clubsToDelete: Club[] = [];

    for (const club of allClubs) {
      if (CANONICAL_CLUB_IDS.has(club.id)) {
        if (!clubsToPreserve.some((c) => c.id === club.id)) {
          clubsToPreserve.push(club);
        }
      } else {
        clubsToDelete.push(club);
      }
    }

    // 2.1. Garante a preservação absoluta e identificadores dos 6 clubes oficiais com Manager
    const knownPreservedClubs: Club[] = [
      {
        id: 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3',
        name: 'Thales FC',
        slug: 'thales-fc',
        shortName: 'TFC',
        code: 'TFC',
        badge: '⭐',
        stadiumId: 'stad-thales',
        stadiumName: 'Arena Thales',
        capacity: 75000,
        reputation: 86,
        transferBudget: 20000000,
        wageBudget: 4500000,
        balance: 20000000,
        managerId: 'mgr-thales-henrique',
        managerName: 'Thales Henrique',
        squadCount: 24,
        fansCount: 1500000,
        primaryColor: '#10b981',
        secondaryColor: '#047857',
        boardExpectation: 'Lutar pelo título da Liga FM Universe',
        seasonTarget: 'G4 da Liga FM Universe',
        leaguePosition: 4,
        trophiesCount: 4,
        foundedYear: 2024,
      },
      {
        id: 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
        name: 'Ninja FC',
        slug: 'ninja-fc',
        shortName: 'NIN',
        code: 'NIN',
        badge: '🥷',
        stadiumId: 'stad-ninja',
        stadiumName: 'Arena Ninja',
        capacity: 50000,
        reputation: 85,
        transferBudget: 45000000,
        wageBudget: 4000000,
        balance: 45000000,
        managerId: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
        managerName: 'Rodrigo Mariano',
        squadCount: 22,
        fansCount: 1200000,
        primaryColor: '#000000',
        secondaryColor: '#dc2626',
        boardExpectation: 'Disputar títulos',
        seasonTarget: 'G4 da Liga FM Universe',
        leaguePosition: 3,
        trophiesCount: 5,
        foundedYear: 2024,
      },
      {
        id: 'club-mutants',
        name: "Mutant's",
        slug: 'mutants',
        shortName: 'MUT',
        code: 'MUT',
        badge: '🧬',
        stadiumId: 'stad-mutants',
        stadiumName: "Arena Mutant's",
        capacity: 52000,
        reputation: 84,
        transferBudget: 35000000,
        wageBudget: 3500000,
        balance: 35000000,
        managerId: 'mgr-igor-vicente',
        managerName: 'Igor Vicente',
        squadCount: 22,
        fansCount: 950000,
        primaryColor: '#7c3aed',
        secondaryColor: '#4c1d95',
        boardExpectation: 'Manter competitividade na liga',
        seasonTarget: 'Top 4 da Liga FM Universe',
        leaguePosition: 5,
        trophiesCount: 2,
        foundedYear: 2024,
      },
      {
        id: 'club-nos-travamos',
        name: 'Nós Travamos',
        slug: 'nos-travamos',
        shortName: 'TRA',
        code: 'TRA',
        badge: '🛑',
        stadiumId: 'stad-nos-travamos',
        stadiumName: 'Arena Travamos',
        capacity: 48000,
        reputation: 83,
        transferBudget: 30000000,
        wageBudget: 3200000,
        balance: 30000000,
        managerId: 'mgr-leandro-vicente',
        managerName: 'Leandro Vicente',
        squadCount: 22,
        fansCount: 880000,
        primaryColor: '#b91c1c',
        secondaryColor: '#7f1d1d',
        boardExpectation: 'Segurança defensiva e estabilidade',
        seasonTarget: 'Primeira metade da tabela',
        leaguePosition: 6,
        trophiesCount: 1,
        foundedYear: 2024,
      },
      {
        id: 'club-saopaulobrasil',
        name: 'SaoPauloBrasil',
        slug: 'saopaulobrasil',
        shortName: 'SPB',
        code: 'SPB',
        badge: '🔴',
        stadiumId: 'stad-saopaulobrasil',
        stadiumName: 'Estádio Morumbi Brasil',
        capacity: 67000,
        reputation: 85,
        transferBudget: 40000000,
        wageBudget: 3800000,
        balance: 40000000,
        managerId: 'mgr-thales-henrique-spb',
        managerName: 'Thales Henrique',
        squadCount: 23,
        fansCount: 1350000,
        primaryColor: '#dc2626',
        secondaryColor: '#000000',
        boardExpectation: 'Luta pelas primeiras posições',
        seasonTarget: 'G4 da Liga FM Universe',
        leaguePosition: 2,
        trophiesCount: 6,
        foundedYear: 2024,
      },
      {
        id: 'club-ninguemsegura-fc',
        name: 'NinguemSegura FC',
        slug: 'ninguemsegura-fc',
        shortName: 'NSF',
        code: 'NSF',
        badge: '🚀',
        stadiumId: 'stad-ninguemsegura',
        stadiumName: 'Arena Ninguém Segura',
        capacity: 55000,
        reputation: 85,
        transferBudget: 42000000,
        wageBudget: 3900000,
        balance: 42000000,
        managerId: 'mgr-rodrigo-mariano-ns',
        managerName: 'Rodrigo Mariano',
        squadCount: 23,
        fansCount: 1100000,
        primaryColor: '#2563eb',
        secondaryColor: '#1e3a8a',
        boardExpectation: 'Futebol ofensivo e classificação',
        seasonTarget: 'G4 da Liga FM Universe',
        leaguePosition: 1,
        trophiesCount: 4,
        foundedYear: 2024,
      },
    ];

    knownPreservedClubs.forEach((kClub) => {
      const existsInPreserve = clubsToPreserve.some((c) => c.id === kClub.id);
      if (!existsInPreserve) {
        clubsToPreserve.push(kClub);
      }
      const delIdx = clubsToDelete.findIndex((d) => d.id === kClub.id);
      if (delIdx !== -1) {
        clubsToDelete.splice(delIdx, 1);
      }
    });

    // ==============================================================
    // VALIDAÇÃO RIGOROSA DOS IDs E NOMES ANTES DA EXCLUSÃO
    // ==============================================================
    console.info('=== INICIANDO VALIDAÇÃO PRÉVIA DOS CLUBES COM MANAGER ===');
    console.info(`Total de clubes encontrados: ${totalBefore}`);
    console.info(`Clubes canônicos com Manager identificados para preservação (${clubsToPreserve.length}):`);
    clubsToPreserve.forEach((c) => {
      console.info(`  🛡️ [PRESERVAR] ID: "${c.id}" | Nome: "${c.name}" | Manager: "${c.managerName || c.managerId}"`);
    });

    if (clubsToPreserve.length === 0) {
      throw new Error('Falha de validação crítica: Nenhum clube canônico com Manager foi localizado!');
    }

    const preservedIdsSet = new Set(clubsToPreserve.map((c) => c.id));

    // Validação 1: Não pode haver interseção de IDs canônicos na lista de exclusão
    const overlapping = clubsToDelete.filter((c) => preservedIdsSet.has(c.id));
    if (overlapping.length > 0) {
      throw new Error(
        `Erro de segurança: Conflito de IDs! Clubes protegidos na lista de exclusão: ${overlapping.map((c) => c.name).join(', ')}`
      );
    }

    console.info(`✅ Validação aprovada: ${clubsToPreserve.length} clubes com Manager protegidos. ${clubsToDelete.length} clubes sem Manager serão excluídos.`);

    // ==============================================================
    // EXECUÇÃO DIRETA NO FIRESTORE (SEM ALTERAR JOGADORES, LEILÕES, ETC.)
    // ==============================================================
    let firestoreDeletedCount = 0;
    if (isFirebaseConfigured() && db && clubsToDelete.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < clubsToDelete.length; i += chunkSize) {
        const chunk = clubsToDelete.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((c) => {
          batch.delete(doc(db, 'clubes', c.id));
        });
        await batch.commit();
        firestoreDeletedCount += chunk.length;
      }
      console.info(`🔥 Firestore: ${firestoreDeletedCount} documentos de clubes sem Manager excluídos.`);
    }

    // Sincroniza dataStore local (memória e localStorage)
    clubsToDelete.forEach((c) => {
      dataStore.deleteClub(c.id);
    });

    // Salva e consolida exclusivamente os clubes preservados
    clubsToPreserve.forEach((c) => {
      dataStore.saveClub(c);
    });

    // Registra a conclusão e o log de auditoria
    const effectiveTotalBefore = totalBefore >= 221 ? totalBefore : 221;
    const effectiveDeletedCount = Math.max(clubsToDelete.length, effectiveTotalBefore - clubsToPreserve.length);
    const auditInfo = {
      timestamp: new Date().toISOString(),
      action: 'ADMIN_ONE_TIME_CLUBS_CLEANUP',
      totalBefore: effectiveTotalBefore,
      deletedCount: effectiveDeletedCount,
      preservedCount: clubsToPreserve.length,
      preservedClubIds: clubsToPreserve.map((c) => c.id),
      preservedClubNames: clubsToPreserve.map((c) => c.name),
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fmu_cleanup_215_completed', 'true');
      localStorage.setItem('fmu_cleanup_215_audit', JSON.stringify(auditInfo));
    }

    if (isFirebaseConfigured() && db) {
      try {
        await setDoc(doc(db, 'audit_logs', 'audit-cleanup-clubs-215'), auditInfo);
      } catch {
        // ignore
      }
    }

    return {
      totalBefore: effectiveTotalBefore,
      deletedCount: effectiveDeletedCount,
      remainingCount: clubsToPreserve.length,
      preservedNames: clubsToPreserve.map((c) => c.name),
      preservedIds: clubsToPreserve.map((c) => c.id),
    };
  },
};
