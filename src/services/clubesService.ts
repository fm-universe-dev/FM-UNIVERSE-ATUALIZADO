import { Club, ClubAuditReport } from '../types';
import { isFirebaseConfigured, firestoreDb, getFirestoreDb } from '../config/firebase';
import { dataStore } from './dataStore';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, updateDoc } from 'firebase/firestore';
import { managersService } from './managersService';
import {
  isFreeAgentClub,
  findMatchingClub,
  createFMUniverseClubObject,
  normalizeClubComparisonKey,
  slugifyClubName,
  generateValidClubId,
} from '../utils/clubUtils';

export {
  isFreeAgentClub,
  findMatchingClub,
  createFMUniverseClubObject,
  normalizeClubComparisonKey,
  slugifyClubName,
  generateValidClubId,
};

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
    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'clubes');
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          const firestoreClubs = snap.docs.map((d) => ensureClubPreparation({ id: d.id, ...d.data() } as Club));
          const localClubs = dataStore.getClubs().map(ensureClubPreparation);
          const mergedMap = new Map<string, Club>();
          localClubs.forEach((c) => mergedMap.set(c.id, c));
          firestoreClubs.forEach((c) => {
            mergedMap.set(c.id, c);
            try {
              dataStore.saveClub(c);
            } catch {
              // ignore
            }
          });
          return Array.from(mergedMap.values());
        }
      } catch (err) {
        console.warn('Falha na consulta Firestore para clubes. Usando fallback.', err);
      }
    }
    return dataStore.getClubs().map(ensureClubPreparation);
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
    const hasManager = Boolean(managerId && managerId.length > 0);
    const managerStatus = hasManager ? 'WITH_MANAGER' : 'WITHOUT_MANAGER';

    // 8. Classificação no Universo
    // Clubes Oficiais tradicionais da liga: FM United, Real Football, Inter Tech, Porto Real, Santos Stars, Ninja FC
    const officialCodes = ['FMU', 'RFO', 'INT', 'POR', 'SAN', 'NIN'];
    const officialIds = [
      'club-1',
      'club-2',
      'club-3',
      'club-4',
      'club-5',
      'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
    ];
    const isOfficial = officialIds.includes(id) || officialCodes.includes(code.toUpperCase());
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
};
