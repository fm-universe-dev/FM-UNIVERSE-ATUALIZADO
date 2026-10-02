import { doc, getDoc, setDoc, updateDoc, getDocFromServer, collection, getDocs } from 'firebase/firestore';
import { getFirestoreDb, firestoreDb, isFirebaseConfigured } from '../config/firebase';
import { ManagerProfile, Club } from '../types';
import { clubesService } from './clubesService';
import { dataStore } from './dataStore';

const MANAGERS_COLLECTION = 'managers';
const LOCAL_MANAGERS_KEY = 'fmu_managers_cache';
const MANAGERS_SYNC_META_KEY = 'fmu_managers_sync_meta';

export const RODRIGO_MARIANO_UID = 'NKijWNgl4ORYGpkESx1nvBLQpBx1';
export const RODRIGO_MARIANO_CLUB_ID = 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1';

export interface ManagersSyncStatus {
  source: 'firestore' | 'cache' | 'fallback';
  isQuotaExceeded: boolean;
  lastSyncTime: string | null;
  error: string | null;
  totalLoaded: number;
}

let lastSyncStatus: ManagersSyncStatus = {
  source: 'fallback',
  isQuotaExceeded: false,
  lastSyncTime: null,
  error: null,
  totalLoaded: 6,
};

// Carrega metadados salvos previamente
try {
  if (typeof localStorage !== 'undefined') {
    const rawMeta = localStorage.getItem(MANAGERS_SYNC_META_KEY);
    if (rawMeta) {
      lastSyncStatus = JSON.parse(rawMeta);
    }
  }
} catch {
  // ignore
}

export function isFirestoreQuotaError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const message = String(err.message || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    message.includes('resource-exhausted') ||
    message.includes('resource exhausted') ||
    message.includes('quota') ||
    message.includes('limit exceeded')
  );
}

function saveSyncMeta(status: ManagersSyncStatus): void {
  lastSyncStatus = status;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MANAGERS_SYNC_META_KEY, JSON.stringify(status));
    }
  } catch {
    // ignore
  }
}

function getStoredSyncMeta(): ManagersSyncStatus | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(MANAGERS_SYNC_META_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

function saveAllLocalManagers(managers: Record<string, ManagerProfile>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_MANAGERS_KEY, JSON.stringify(managers));
    }
  } catch (e) {
    console.warn('⚠️ [managersService] Falha ao persistir cache local de managers:', e);
  }
}

function getLocalManagers(): Record<string, ManagerProfile> {
  let current: Record<string, ManagerProfile> = {};
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_MANAGERS_KEY);
      if (raw) current = JSON.parse(raw);
    }
  } catch {
    current = {};
  }

  // Garante que o Manager oficial Rodrigo Mariano esteja sempre presente e reconhecido
  const ninjaClubExists = Boolean(dataStore.getClubById(RODRIGO_MARIANO_CLUB_ID));
  if (!current[RODRIGO_MARIANO_UID]) {
    current[RODRIGO_MARIANO_UID] = {
      uid: RODRIGO_MARIANO_UID,
      name: 'Rodrigo Mariano',
      email: 'rodrigo.mariano@fmverse.com',
      login: 'rodrigo.mariano',
      role: 'MANAGER',
      clubId: ninjaClubExists ? RODRIGO_MARIANO_CLUB_ID : null,
      onboardingCompleted: ninjaClubExists,
      status: 'ACTIVE',
      avatar: '🥷',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: new Date().toISOString(),
    };
  } else {
    current[RODRIGO_MARIANO_UID].name = current[RODRIGO_MARIANO_UID].name || 'Rodrigo Mariano';
    current[RODRIGO_MARIANO_UID].status = 'ACTIVE';
    current[RODRIGO_MARIANO_UID].role = 'MANAGER';
    if (!ninjaClubExists && current[RODRIGO_MARIANO_UID].clubId === RODRIGO_MARIANO_CLUB_ID) {
      current[RODRIGO_MARIANO_UID].clubId = null;
      current[RODRIGO_MARIANO_UID].onboardingCompleted = false;
    } else if (ninjaClubExists && current[RODRIGO_MARIANO_UID].clubId !== null && !current[RODRIGO_MARIANO_UID].clubId) {
      current[RODRIGO_MARIANO_UID].clubId = RODRIGO_MARIANO_CLUB_ID;
      current[RODRIGO_MARIANO_UID].onboardingCompleted = true;
    }
  }

  // Garante os 6 managers canônicos oficiais da liga com seus respectivos clubId reais
  const canonicalManagersData: Array<{ uid: string; name: string; clubId: string; email: string }> = [
    {
      uid: 'qowYWnG0EfUqrr1a5cHlu4UYmNB3',
      name: 'Thales Henrique',
      clubId: 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3',
      email: 'thales.henrique@fmverse.com',
    },
    {
      uid: 'XTEQSFH1x9To3EuVESp54vCCFTf2',
      name: 'Igor Vicente',
      clubId: 'club-XTEQSFH1x9To3EuVESp54vCCFTf2',
      email: 'igor.vicente@fmverse.com',
    },
    {
      uid: 'qBMw9GdVuiVkBB22ZJwVoW1uEXG3',
      name: 'Leandro Vicente',
      clubId: 'club-qBMw9GdVuiVkBB22ZJwVoW1uEXG3',
      email: 'leandro.vicente@fmverse.com',
    },
    {
      uid: '3dOrJ03rdGYipkflIjziZx8fd6d2',
      name: 'Thales Henrique',
      clubId: 'club-3dOrJ03rdGYipkflIjziZx8fd6d2',
      email: 'thales.spb@fmverse.com',
    },
    {
      uid: 'zmm8RxW9iyXIpW5g0hWeqNiPlt12',
      name: 'Rodrigo Mariano',
      clubId: 'club-zmm8RxW9iyXIpW5g0hWeqNiPlt12',
      email: 'rodrigo.nsf@fmverse.com',
    },
  ];

  canonicalManagersData.forEach((cm) => {
    if (!current[cm.uid]) {
      current[cm.uid] = {
        uid: cm.uid,
        name: cm.name,
        email: cm.email,
        login: cm.email.split('@')[0],
        role: 'MANAGER',
        clubId: cm.clubId,
        onboardingCompleted: true,
        status: 'ACTIVE',
        avatar: '👔',
        createdAt: '2026-09-10T10:00:00.000Z',
        updatedAt: new Date().toISOString(),
      };
    } else {
      if (!current[cm.uid].clubId) {
        current[cm.uid].clubId = cm.clubId;
      }
    }
  });

  return current;
}

function saveLocalManager(profile: ManagerProfile): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const current = getLocalManagers();
    current[profile.uid] = profile;
    localStorage.setItem(LOCAL_MANAGERS_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('⚠️ [managersService] Falha ao salvar no cache local:', e);
  }
}

export const managersService = {
  /**
   * Obtém o status atual de sincronização dos managers.
   */
  getSyncStatus(): ManagersSyncStatus {
    return { ...lastSyncStatus };
  },

  /**
   * Obtém todos os Managers cadastrados no sistema.
   * Regras estritas:
   * - A fonte principal continua sendo os dados reais persistidos no Firestore.
   * - Salva todos os managers reais lidos no cache local persistente (localStorage).
   * - Em caso de falha por cota do Firestore (resource-exhausted), NUNCA substitui os dados reais por uma lista canônica fixa.
   * - Preserva a última lista válida conhecida do cache e marca o status de sincronização apropriado.
   * - Não remove managers se a leitura do clube falhar temporariamente.
   */
  async getAllManagers(forceRefresh = false): Promise<ManagerProfile[]> {
    const localMap = getLocalManagers();
    const db = getFirestoreDb() || firestoreDb;
    let firestoreReadSuccess = false;
    let quotaErrorDetected = false;
    let caughtError: any = null;

    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, MANAGERS_COLLECTION);
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          snap.docs.forEach((d) => {
            const data = d.data() as Partial<ManagerProfile>;
            const uid = d.id;
            // Preserva Rodrigo Mariano protegido
            if (uid === RODRIGO_MARIANO_UID) {
              localMap[RODRIGO_MARIANO_UID] = {
                uid: RODRIGO_MARIANO_UID,
                name: data.name || 'Rodrigo Mariano',
                email: data.email || 'rodrigo.mariano@fmverse.com',
                login: data.login || 'rodrigo.mariano',
                role: 'MANAGER',
                clubId: RODRIGO_MARIANO_CLUB_ID,
                onboardingCompleted: true,
                status: 'ACTIVE',
                avatar: data.avatar || '🥷',
                createdAt: data.createdAt || '2026-09-10T10:00:00.000Z',
                updatedAt: data.updatedAt || new Date().toISOString(),
              };
            } else {
              localMap[uid] = {
                uid,
                name: data.name || 'Treinador',
                email: data.email || '',
                login: data.login || data.email?.split('@')[0] || uid,
                role: 'MANAGER',
                clubId: data.clubId || null,
                onboardingCompleted: Boolean(data.onboardingCompleted),
                status: data.status || 'ACTIVE',
                avatar: data.avatar || '👔',
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || new Date().toISOString(),
              };
            }
          });

          firestoreReadSuccess = true;
          // Persiste a lista completa no cache local para que falhas de cota futuras não descartem novos managers
          saveAllLocalManagers(localMap);

          const now = new Date().toISOString();
          const meta: ManagersSyncStatus = {
            source: 'firestore',
            isQuotaExceeded: false,
            lastSyncTime: now,
            error: null,
            totalLoaded: Object.keys(localMap).length,
          };
          saveSyncMeta(meta);
          console.info(`✅ [managersService] Sucesso na leitura do Firestore: ${snap.docs.length} registros persistidos consolidados.`);
        } else {
          firestoreReadSuccess = true;
        }
      } catch (err: any) {
        caughtError = err;
        quotaErrorDetected = isFirestoreQuotaError(err);

        if (quotaErrorDetected) {
          console.warn('⚠️ [managersService] Falha por COTA no Firestore (resource-exhausted). Preservando última sincronização válida em cache:', err);
        } else {
          console.warn('⚠️ [managersService] Falha ao consultar lista de managers no Firestore. Preservando última sincronização válida:', err);
        }
      }
    }

    if (!firestoreReadSuccess) {
      // Quando a leitura do Firestore falha (por cota ou conectividade):
      // 1. Resgata do localStorage a última lista válida completa de managers salvos anteriormente
      let cachedMap: Record<string, ManagerProfile> = {};
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(LOCAL_MANAGERS_KEY);
          if (raw) cachedMap = JSON.parse(raw);
        }
      } catch {
        // ignore
      }

      // 2. Mescla o cache completo sobre o localMap para garantir que Ruan, Isaac e novos managers NÃO sejam perdidos
      for (const [uid, cachedProfile] of Object.entries(cachedMap)) {
        if (!localMap[uid]) {
          localMap[uid] = cachedProfile;
        } else {
          // Se o perfil em memória perdeu o vínculo com o clube temporariamente, restaura do cache
          if (cachedProfile.clubId && !localMap[uid].clubId) {
            localMap[uid].clubId = cachedProfile.clubId;
          }
        }
      }

      const meta = getStoredSyncMeta();
      const totalCount = Object.keys(localMap).length;
      const isKnownCache = Boolean(meta?.lastSyncTime) || totalCount > 6;

      const updatedMeta: ManagersSyncStatus = {
        source: isKnownCache ? 'cache' : 'fallback',
        isQuotaExceeded: quotaErrorDetected,
        lastSyncTime: meta?.lastSyncTime || lastSyncStatus.lastSyncTime || null,
        error: quotaErrorDetected
          ? 'Cota de leitura do Firestore excedida (resource-exhausted). Dados preservados do cache mais recente.'
          : caughtError?.message || 'Falha temporária ao ler dados do Firestore.',
        totalLoaded: totalCount,
      };
      saveSyncMeta(updatedMeta);
    }

    // Sincroniza com clubes que possuem managerId já configurado no dataStore
    try {
      const clubs = dataStore.getClubs();
      clubs.forEach((c) => {
        if (c.managerId && !localMap[c.managerId]) {
          localMap[c.managerId] = {
            uid: c.managerId,
            name: c.managerName || 'Treinador',
            email: `${c.managerId.toLowerCase()}@fmverse.com`,
            login: c.managerId.toLowerCase(),
            role: 'MANAGER',
            clubId: c.id,
            onboardingCompleted: true,
            status: 'ACTIVE',
            avatar: '👔',
            createdAt: c.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      });
    } catch (e) {
      console.warn('⚠️ [managersService] Falha não impeditiva ao sincronizar com dataStore.getClubs():', e);
    }

    const list = Object.values(localMap);
    // Ordena colocando Rodrigo Mariano no topo e depois por nome
    list.sort((a, b) => {
      if (a.uid === RODRIGO_MARIANO_UID) return -1;
      if (b.uid === RODRIGO_MARIANO_UID) return 1;
      return a.name.localeCompare(b.name);
    });

    return list;
  },

  /**
   * Retorna os clubes elegíveis para vinculação de um novo Manager ou edição.
   * Regras estritas:
   * - Não disponibiliza Thales FC (fictício/teste)
   * - Não disponibiliza Atlântico FC (fictício/teste)
   * - Não disponibiliza Ninja FC (ocupado por Rodrigo Mariano)
   * - Não disponibiliza clubes que já possuem outro Manager ativo
   */
  getEligibleClubsForManager(currentManagerUid?: string): Club[] {
    const allClubs = dataStore.getClubs();
    const localManagers = Object.values(getLocalManagers());

    // Identifica quais clubes estão ocupados por managers ativos (exceto o próprio manager que está sendo editado)
    const occupiedClubIds = new Set<string>();
    localManagers.forEach((m) => {
      if (m.status === 'ACTIVE' && m.clubId && m.uid !== currentManagerUid) {
        occupiedClubIds.add(m.clubId);
      }
    });

    return allClubs.filter((c) => {
      // 1. Exclui clubes fictícios/teste
      if (c.id === 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3') return false; // Thales FC
      if (c.id === 'club-6') return false; // Atlântico FC
      if ((c as any).universeType === 'TEST_FICTITIOUS') return false;

      // 2. Exclui Ninja FC para qualquer outro manager
      if (
        (c.name.toLowerCase() === 'ninja fc' || c.id === RODRIGO_MARIANO_CLUB_ID) &&
        currentManagerUid !== RODRIGO_MARIANO_UID
      ) {
        return false;
      }

      // 3. Exclui se já estiver ocupado por outro manager ativo
      if (occupiedClubIds.has(c.id)) {
        return false;
      }

      return true;
    });
  },

  /**
   * Valida estritamente se o vínculo do Manager com um determinado clube é permitido.
   * Regras:
   * - Um Manager ativo pode controlar somente um clube.
   * - Um clube pode possuir no máximo um Manager ativo.
   * - Não permitir vincular dois Managers ao mesmo clube.
   * - Não permitir vincular a clubes fictícios/teste.
   */
  async validateManagerClubLink(
    managerUid: string,
    targetClubId: string | null,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
  ): Promise<void> {
    if (!targetClubId || status !== 'ACTIVE') {
      return; // Sem clube ou inativo não gera conflito de titularidade
    }

    // Bloqueio de clubes fictícios/teste
    if (targetClubId === 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3') {
      throw new Error('O clube "Thales FC" é classificado como Fictício/Teste e não está disponível para novos Managers.');
    }
    if (targetClubId === 'club-6') {
      throw new Error('O clube "Atlântico FC" é classificado como Fictício/Teste e não está disponível para novos Managers.');
    }

    // Bloqueio de apropriação do Ninja FC
    if (targetClubId === RODRIGO_MARIANO_CLUB_ID && managerUid !== RODRIGO_MARIANO_UID) {
      throw new Error('O clube "Ninja FC" é o clube exclusivo do Manager Rodrigo Mariano.');
    }

    // Proteção de Rodrigo Mariano se o Ninja FC existir
    if (managerUid === RODRIGO_MARIANO_UID && targetClubId !== RODRIGO_MARIANO_CLUB_ID) {
      const ninjaClubExists = Boolean(dataStore.getClubById(RODRIGO_MARIANO_CLUB_ID));
      if (ninjaClubExists && targetClubId !== null) {
        throw new Error('O Manager Rodrigo Mariano é o gestor oficial do Ninja FC e seu vínculo é protegido.');
      }
    }

    // Verifica se outro Manager ativo já possui vínculo com o clube alvo
    const allManagers = await this.getAllManagers();
    const existingActiveManager = allManagers.find(
      (m) => m.clubId === targetClubId && m.status === 'ACTIVE' && m.uid !== managerUid
    );

    if (existingActiveManager) {
      const targetClub = dataStore.getClubById(targetClubId);
      const clubName = targetClub?.name || targetClubId;
      throw new Error(
        `O clube "${clubName}" já está vinculado ao Manager ativo "${existingActiveManager.name}". Um clube pode possuir no máximo um Manager ativo.`
      );
    }
  },

  /**
   * Cria um novo Manager com validação completa de regras e integridade.
   */
  async createManager(data: {
    name: string;
    login: string;
    email?: string;
    clubId?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    avatar?: string;
  }): Promise<ManagerProfile> {
    const cleanName = data.name?.trim();
    const cleanLogin = data.login?.trim().toLowerCase();

    if (!cleanName) {
      throw new Error('O nome do Manager é obrigatório.');
    }
    if (!cleanLogin) {
      throw new Error('A identificação/login do Manager é obrigatória.');
    }

    const allManagers = await this.getAllManagers();

    // Valida duplicidade de login
    const existingLogin = allManagers.find(
      (m) => m.login?.toLowerCase() === cleanLogin || m.email?.toLowerCase() === cleanLogin
    );
    if (existingLogin) {
      throw new Error(`A identificação/login "${cleanLogin}" já está em uso pelo Manager "${existingLogin.name}".`);
    }

    const cleanEmail = (data.email?.trim().toLowerCase() || `${cleanLogin}@fmverse.com`);
    const status: 'ACTIVE' | 'INACTIVE' = data.status || 'ACTIVE';
    const targetClubId = data.clubId?.trim() || null;

    // Gera UID único
    const newUid = `mgr-${cleanLogin.replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-5)}`;

    // Valida regras de vínculo
    await this.validateManagerClubLink(newUid, targetClubId, status);

    const now = new Date().toISOString();
    const newManager: ManagerProfile = {
      uid: newUid,
      name: cleanName,
      login: cleanLogin,
      email: cleanEmail,
      role: 'MANAGER',
      clubId: status === 'ACTIVE' ? targetClubId : null,
      onboardingCompleted: Boolean(targetClubId),
      status,
      avatar: data.avatar?.trim() || '👔',
      createdAt: now,
      updatedAt: now,
    };

    // Salva no Firestore se disponível
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, MANAGERS_COLLECTION, newUid);
        await setDoc(docRef, newManager);
        console.info(`✅ [managersService] Manager ${newUid} criado no Firestore.`);
      } catch (err) {
        console.warn(`⚠️ [managersService] Erro ao salvar novo manager no Firestore:`, err);
      }
    }

    // Salva no cache local
    saveLocalManager(newManager);

    // Atualiza o clube vinculado no dataStore se houver
    if (newManager.clubId && status === 'ACTIVE') {
      const club = dataStore.getClubById(newManager.clubId);
      if (club) {
        club.managerId = newUid;
        club.managerName = newManager.name;
        club.updatedAt = now;
        dataStore.saveClub(club);
        clubesService.save(club).catch(() => {});
      }
    }

    return newManager;
  },

  /**
   * Atualiza dados de um Manager existente respeitando integridade e restrições.
   */
  async updateManager(
    uid: string,
    data: {
      name?: string;
      login?: string;
      username?: string;
      usernameNormalizado?: string;
      email?: string;
      clubId?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
      avatar?: string;
    }
  ): Promise<ManagerProfile> {
    const cleanUid = uid.trim();
    const allManagers = await this.getAllManagers();
    const existing = allManagers.find((m) => m.uid === cleanUid);

    if (!existing) {
      throw new Error(`Manager com ID "${cleanUid}" não encontrado.`);
    }

    // Proteção de Rodrigo Mariano
    if (cleanUid === RODRIGO_MARIANO_UID) {
      const ninjaClubExists = Boolean(dataStore.getClubById(RODRIGO_MARIANO_CLUB_ID));
      if (ninjaClubExists && data.clubId !== undefined && data.clubId !== RODRIGO_MARIANO_CLUB_ID && data.clubId !== null) {
        throw new Error('O Manager Rodrigo Mariano é o gestor oficial do Ninja FC e seu vínculo não pode ser alterado.');
      }
      if (ninjaClubExists && data.status === 'INACTIVE') {
        throw new Error('O Manager Rodrigo Mariano é o gestor oficial ativo do Ninja FC e não pode ser desativado.');
      }
    }

    const nextStatus = data.status || existing.status || 'ACTIVE';
    const nextClubId = data.clubId !== undefined ? data.clubId : existing.clubId;

    // Valida regras de vínculo
    await this.validateManagerClubLink(cleanUid, nextClubId, nextStatus);

    const prevClubId = existing.clubId;
    const now = new Date().toISOString();

    const updatedProfile: ManagerProfile = {
      ...existing,
      name: data.name?.trim() || existing.name,
      login: data.login?.trim().toLowerCase() || data.usernameNormalizado || existing.login,
      username: data.username?.trim() || existing.username || existing.name,
      usernameNormalizado: data.usernameNormalizado || existing.usernameNormalizado || existing.login,
      email: data.email?.trim().toLowerCase() || existing.email,
      status: nextStatus,
      clubId: nextStatus === 'ACTIVE' ? nextClubId : null,
      avatar: data.avatar !== undefined ? data.avatar.trim() : existing.avatar,
      updatedAt: now,
    };

    // Salva no Firestore
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, MANAGERS_COLLECTION, cleanUid);
        await updateDoc(docRef, { ...updatedProfile });
      } catch (err) {
        console.warn('⚠️ [managersService] Erro ao atualizar manager no Firestore:', err);
      }
    }

    // Salva localmente
    saveLocalManager(updatedProfile);

    // Se houve mudança de clube:
    if (prevClubId && prevClubId !== updatedProfile.clubId && cleanUid !== RODRIGO_MARIANO_UID) {
      // Libera o clube anterior para controle de IA
      const prevClub = dataStore.getClubById(prevClubId);
      if (prevClub && prevClub.managerId === cleanUid) {
        delete prevClub.managerId;
        prevClub.managerName = 'Treinador CPU';
        prevClub.updatedAt = now;
        dataStore.saveClub(prevClub);
        clubesService.save(prevClub).catch(() => {});
      }
    }

    // Atribui o novo clube
    if (updatedProfile.clubId && updatedProfile.status === 'ACTIVE') {
      const newClub = dataStore.getClubById(updatedProfile.clubId);
      if (newClub) {
        newClub.managerId = cleanUid;
        newClub.managerName = updatedProfile.name;
        newClub.updatedAt = now;
        dataStore.saveClub(newClub);
        clubesService.save(newClub).catch(() => {});
      }
    }

    return updatedProfile;
  },

  /**
   * Alterna o status do Manager entre ACTIVE e INACTIVE com segurança.
   */
  async toggleManagerStatus(uid: string): Promise<ManagerProfile> {
    const cleanUid = uid.trim();
    if (cleanUid === RODRIGO_MARIANO_UID) {
      throw new Error('O Manager Rodrigo Mariano é o gestor oficial do Ninja FC e não pode ser desativado.');
    }

    const all = await this.getAllManagers();
    const existing = all.find((m) => m.uid === cleanUid);
    if (!existing) {
      throw new Error('Manager não encontrado.');
    }

    const newStatus: 'ACTIVE' | 'INACTIVE' = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (newStatus === 'ACTIVE' && existing.clubId) {
      await this.validateManagerClubLink(cleanUid, existing.clubId, 'ACTIVE');
    }

    return this.updateManager(cleanUid, { status: newStatus });
  },

  /**
   * Avalia as consequências de desvincular um Manager do seu clube atual.
   */
  checkUnlinkConsequences(managerUid: string): {
    canUnlink: boolean;
    requiresConfirmation: boolean;
    clubName?: string;
    reason?: string;
  } {
    if (managerUid === RODRIGO_MARIANO_UID) {
      return {
        canUnlink: false,
        requiresConfirmation: false,
        clubName: 'Ninja FC',
        reason: 'Rodrigo Mariano é o gestor oficial e protegido do Ninja FC. Seu vínculo não pode ser removido.',
      };
    }

    const localManagers = getLocalManagers();
    const manager = localManagers[managerUid];
    if (!manager || !manager.clubId) {
      return { canUnlink: true, requiresConfirmation: false };
    }

    const club = dataStore.getClubById(manager.clubId);
    if (!club) {
      return { canUnlink: true, requiresConfirmation: false };
    }

    const squad = dataStore.getPlayers().filter((p) => p.clubId === club.id);
    const matches = dataStore.getMatches().filter((m) => m.homeClubId === club.id || m.awayClubId === club.id);

    if (squad.length > 0 || matches.length > 0) {
      return {
        canUnlink: true,
        requiresConfirmation: true,
        clubName: club.name,
        reason: `O clube "${club.name}" possui dados ativos (${squad.length} jogadores, ${matches.length} partidas). Ao desvincular este Manager, a gestão do clube retornará temporariamente à IA (CPU).`,
      };
    }

    return { canUnlink: true, requiresConfirmation: false, clubName: club.name };
  },

  /**
   * Obtém o perfil do Manager autenticado diretamente do Firestore (/managers/{uid}).
   */
  async getProfile(uid: string): Promise<ManagerProfile | null> {
    const cleanUid = uid?.trim();
    if (!cleanUid) return null;

    const db = getFirestoreDb() || firestoreDb;
    let profile: ManagerProfile | null = null;

    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, MANAGERS_COLLECTION, cleanUid);
        let snap;
        try {
          snap = await getDocFromServer(docRef);
        } catch {
          snap = await getDoc(docRef);
        }

        if (snap && snap.exists()) {
          const data = snap.data() as Partial<ManagerProfile>;
          profile = {
            uid: cleanUid,
            name: data.name || 'Treinador',
            email: data.email || '',
            login: data.login || data.usernameNormalizado || data.email?.split('@')[0] || cleanUid,
            username: data.username || data.login || data.name || cleanUid,
            usernameNormalizado: data.usernameNormalizado || data.login || cleanUid,
            role: 'MANAGER', // Força papel imutável no backend
            clubId: data.clubId || null,
            onboardingCompleted: Boolean(data.onboardingCompleted),
            status: data.status || 'ACTIVE',
            avatar: data.avatar || '👔',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          };
        } else if (snap && !snap.exists()) {
          console.info(`ℹ️ [managersService] Documento /managers/${cleanUid} não existe no Firestore.`);
        }
      } catch (err: any) {
        const isQuota = isFirestoreQuotaError(err);
        if (isQuota) {
          console.warn(`⚠️ [managersService] Erro de COTA ao consultar /managers/${cleanUid}. NÃO interpretado como ausência do documento. Preservando cache local:`, err);
        } else {
          console.warn(`⚠️ [managersService] Erro temporário de rede/leitura ao consultar /managers/${cleanUid}. Preservando cache:`, err);
        }
      }
    }

    // Fallback no cache local
    if (!profile) {
      const local = getLocalManagers();
      profile = local[cleanUid] || null;
    }

    // VÍNCULO DETERMINÍSTICO COM CLUBE OFICIAL:
    if (!profile || !profile.clubId || !profile.onboardingCompleted) {
      try {
        const linkedClub = await clubesService.getByManagerId(cleanUid);
        if (linkedClub) {
          if (!profile) {
            profile = {
              uid: cleanUid,
              name: linkedClub.managerName || 'Treinador',
              email: '',
              login: cleanUid,
              role: 'MANAGER',
              clubId: linkedClub.id,
              onboardingCompleted: true,
              status: 'ACTIVE',
              avatar: cleanUid === RODRIGO_MARIANO_UID ? '🥷' : '👔',
              createdAt: linkedClub.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          } else {
            profile = {
              ...profile,
              clubId: linkedClub.id,
              onboardingCompleted: true,
              updatedAt: new Date().toISOString(),
            };
          }
          saveLocalManager(profile);
        }
      } catch (e) {
        console.warn('⚠️ [managersService] Erro ao sincronizar vínculo automático com clube:', e);
      }
    }

    if (profile) {
      saveLocalManager(profile);
    }
    return profile;
  },

  /**
   * Cria o documento inicial do Manager em /managers/{uid}.
   * O role é fixado estritamente como "MANAGER" e não pode ser escolhido pelo usuário.
   */
  async createProfile(
    uid: string,
    data: {
      name: string;
      email: string;
      login?: string;
      username?: string;
      usernameNormalizado?: string;
    }
  ): Promise<ManagerProfile> {
    const cleanUid = uid.trim();
    if (!cleanUid) throw new Error('UID inválido.');

    const now = new Date().toISOString();
    const login = data.login || data.usernameNormalizado || data.email.trim().split('@')[0] || cleanUid;
    const username = data.username || data.login || data.name || cleanUid;
    const usernameNormalizado = data.usernameNormalizado || data.login || cleanUid;

    const profile: ManagerProfile = {
      uid: cleanUid,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      login,
      username,
      usernameNormalizado,
      role: 'MANAGER', // Garantia estrita: nunca aceita role do frontend
      clubId: null,
      onboardingCompleted: false,
      status: 'ACTIVE',
      avatar: cleanUid === RODRIGO_MARIANO_UID ? '🥷' : '👔',
      createdAt: now,
      updatedAt: now,
    };

    const db = getFirestoreDb() || firestoreDb;

    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, MANAGERS_COLLECTION, cleanUid);
        await setDoc(docRef, profile, { merge: true });
        console.info(`✅ [managersService] Perfil /managers/${cleanUid} criado com sucesso no Firestore.`);
      } catch (err) {
        console.warn(`⚠️ [managersService] Erro ao salvar /managers/${cleanUid} no Firestore:`, err);
      }
    }

    saveLocalManager(profile);
    return profile;
  },

  /**
   * Finaliza o processo de primeiro acesso (onboarding) vinculando o clube criado ao Manager.
   */
  async completeOnboarding(uid: string, clubId: string): Promise<ManagerProfile> {
    const cleanUid = uid.trim();
    const cleanClubId = clubId.trim();

    if (!cleanUid || !cleanClubId) {
      throw new Error('UID e ClubID são obrigatórios para finalizar o onboarding.');
    }

    const now = new Date().toISOString();
    const db = getFirestoreDb() || firestoreDb;

    let existing = await this.getProfile(cleanUid);
    if (!existing) {
      existing = {
        uid: cleanUid,
        name: 'Treinador',
        email: '',
        login: cleanUid,
        role: 'MANAGER',
        clubId: cleanClubId,
        onboardingCompleted: true,
        status: 'ACTIVE',
        avatar: cleanUid === RODRIGO_MARIANO_UID ? '🥷' : '👔',
        createdAt: now,
        updatedAt: now,
      };
    } else {
      existing = {
        ...existing,
        clubId: cleanClubId,
        onboardingCompleted: true,
        updatedAt: now,
      };
    }

    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, MANAGERS_COLLECTION, cleanUid);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          // Garante documento inicial compatível com regra 'allow create' (onboardingCompleted == false)
          await setDoc(docRef, {
            uid: cleanUid,
            name: existing.name || 'Treinador',
            role: 'MANAGER',
            clubId: null,
            onboardingCompleted: false,
            createdAt: now,
            updatedAt: now,
          });
        }
        await setDoc(
          docRef,
          {
            uid: cleanUid,
            name: existing.name || 'Treinador',
            role: 'MANAGER',
            clubId: cleanClubId,
            onboardingCompleted: true,
            updatedAt: now,
          },
          { merge: true }
        );
        console.info(`✅ [managersService] Onboarding concluído para ${cleanUid} com clube ${cleanClubId}`);
      } catch (err) {
        console.warn(`⚠️ [managersService] Erro ao atualizar onboarding no Firestore:`, err);
      }
    }

    saveLocalManager(existing);
    return existing;
  },

  /**
   * Atualiza dados permitidos do manager (não permite alteração de role).
   */
  async updateProfile(uid: string, partial: Partial<ManagerProfile>): Promise<ManagerProfile | null> {
    const cleanUid = uid.trim();
    const existing = await this.getProfile(cleanUid);
    if (!existing) return null;

    // Remove qualquer tentativa de alteração de role ou uid
    const safeData: Partial<ManagerProfile> = { ...partial };
    delete safeData.role;
    delete safeData.uid;

    const updated: ManagerProfile = {
      ...existing,
      ...safeData,
      role: 'MANAGER', // Garantia constante
      updatedAt: new Date().toISOString(),
    };

    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, MANAGERS_COLLECTION, cleanUid);
        await updateDoc(docRef, { ...safeData, updatedAt: updated.updatedAt });
      } catch (err) {
        console.warn('⚠️ [managersService] Erro ao atualizar perfil no Firestore:', err);
      }
    }

    saveLocalManager(updated);
    return updated;
  },

  /**
   * Desvincula com segurança qualquer Manager associado a um clube excluído.
   * Não exclui a conta de autenticação nem o cadastro do Manager, deixando-o disponível
   * para futura vinculação com outro clube.
   */
  async unlinkManagersFromClub(clubId: string): Promise<string[]> {
    const cleanClubId = clubId.trim();
    const affectedUids: string[] = [];
    const localManagers = getLocalManagers();

    for (const [uid, mgr] of Object.entries(localManagers)) {
      if (mgr.clubId === cleanClubId) {
        affectedUids.push(uid);
        mgr.clubId = null;
        mgr.onboardingCompleted = false;
        mgr.updatedAt = new Date().toISOString();
        saveLocalManager(mgr);

        const db = getFirestoreDb() || firestoreDb;
        if (isFirebaseConfigured() && db) {
          try {
            const docRef = doc(db, MANAGERS_COLLECTION, uid);
            await updateDoc(docRef, {
              clubId: null,
              onboardingCompleted: false,
              updatedAt: mgr.updatedAt,
            });
          } catch (err) {
            console.warn(`⚠️ [managersService] Falha ao desvincular manager ${uid} no Firestore:`, err);
          }
        }
      }
    }

    return affectedUids;
  },
};
