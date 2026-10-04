import {
  News,
  NewsCategory,
  NewsPriority,
  NewsEventType,
  Match,
  TransferOffer,
  Transfer,
  FinanceRecord,
  Club,
  Stadium,
} from '../types';
import { isFirebaseConfigured, firestoreDb, getFirestoreDb } from '../config/firebase';
import { dataStore } from './dataStore';
import { clubesService } from './clubesService';
import { formatCurrencyBRL } from '../utils/currency';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export interface NewsFilter {
  clubId?: string;
  category?: NewsCategory | 'ALL';
  type?: NewsEventType | 'ALL';
  priority?: NewsPriority | 'ALL';
  unreadOnly?: boolean;
  searchQuery?: string;
}

export interface AuctionBidNewsParams {
  leilaoId: string;
  lanceId: string;
  clubId: string;
  clubName: string;
  managerId?: string;
  managerName?: string;
  playerId: string;
  playerName: string;
  valorLance: number;
  isOutbid?: boolean;
  timestamp?: string;
  temporada?: string;
}

export interface AuctionWonNewsParams {
  leilaoId: string;
  clubId: string;
  clubName: string;
  managerId?: string;
  managerName?: string;
  playerId: string;
  playerName: string;
  winningBid: number;
  timestamp?: string;
  temporada?: string;
}

// Lista oficial estrita de clubes fictícios banidos do feed
export const FICTITIOUS_CLUB_NAMES: string[] = [
  'fm united',
  'inter tech',
  'real football',
  'porto real',
  'santos stars',
  'atlântico fc',
  'atlantico fc',
  'real madrid ficticio',
];

export const FICTITIOUS_CLUB_IDS: string[] = [
  'club-1',
  'club-2',
  'club-3',
  'club-4',
  'club-5',
  'club-6',
  'club-real-madrid',
];

// Clubes oficiais confirmados da Temporada 2026/2027 do FM Universe
export const OFFICIAL_CLUBS_LIST: { id: string; name: string }[] = [
  { id: 'club-1E32eakvLtgxhAXhdGBdbCsKeg52', name: 'Corinthians' },
  { id: 'club-3dOrJ03rdGYipkflIjziZx8fd6d2', name: 'SaoPauloBrasil' },
  { id: 'club-BkeFN9NYE2d1L27hJ63L2LWrL3c2', name: 'Pardal Fc' },
  { id: 'club-CqUHZEVlVmMcUHXsYAExPP7SQuQ2', name: 'TheCriasOG' },
  { id: 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1', name: 'Ninja FC' },
  { id: 'club-RrsKw1Z17HgSQvKrSsp6Cr38SFk2', name: 'Baile de Munique FC' },
  { id: 'club-XTEQSFH1x9To3EuVESp54vCCFTf2', name: "Mutant's" },
  { id: 'club-qBMw9GdVuiVkBB22ZJwVoW1uEXG3', name: 'Nós Travamos' },
  { id: 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3', name: 'Thales FC' },
  { id: 'club-zmm8RxW9iyXIpW5g0hWeqNiPlt12', name: 'NinguemSegura FC' },
];

// Lances reais oficiais já registrados nos leilões do FM Universe
export const KNOWN_AUCTION_BIDS: AuctionBidNewsParams[] = [
  {
    leilaoId: 'pHz37FZEpqAaJlzTIrS3',
    lanceId: 'n9BypZoxvopn5rK9rl2c',
    clubId: 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
    clubName: 'Ninja FC',
    managerId: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    managerName: 'Rodrigo Mariano',
    playerId: 'pHz37FZEpqAaJlzTIrS3',
    playerName: 'Kaká',
    valorLance: 85000000,
    isOutbid: false,
    timestamp: '2026-10-04T04:15:29.375Z',
    temporada: '2026/2027',
  },
  {
    leilaoId: 'FivEhz9mzabBNRKxtANJ',
    lanceId: 'Dp5YJGAMdfAtCspMyIrB',
    clubId: 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
    clubName: 'Ninja FC',
    managerId: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    managerName: 'Rodrigo Mariano',
    playerId: 'FivEhz9mzabBNRKxtANJ',
    playerName: 'Zlatan Ibrahimović',
    valorLance: 68000000,
    isOutbid: false,
    timestamp: '2026-10-04T10:20:36.693Z',
    temporada: '2026/2027',
  },
  {
    leilaoId: '0HG0ETMmFS4TmkvFBQFH',
    lanceId: 'lance-owen-1',
    clubId: 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
    clubName: 'Ninja FC',
    managerId: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    managerName: 'Rodrigo Mariano',
    playerId: '0HG0ETMmFS4TmkvFBQFH',
    playerName: 'Owen Hargreaves',
    valorLance: 1700000,
    isOutbid: false,
    timestamp: '2026-09-28T12:00:00.000Z',
    temporada: '2026/2027',
  },
];

/**
 * Validador estrito de atualidade: garante que NENHUMA notícia associada a clubes
 * fictícios antigos (FM United, Inter Tech, Real Football, etc.) seja exibida no feed.
 */
export function isNewsValidForCurrentUniverse(
  news: News,
  validClubIds: Set<string>,
  validClubNames: Set<string>
): boolean {
  if (!news || !news.title) return false;

  const titleLower = news.title.toLowerCase();
  const summaryLower = (news.summary || '').toLowerCase();
  const contentLower = (news.content || '').toLowerCase();
  const clubNameLower = (news.clubName || '').toLowerCase();
  const clubId = news.clubId;

  // 1. Rejeita qualquer menção a nomes de clubes fictícios
  for (const fictName of FICTITIOUS_CLUB_NAMES) {
    if (
      titleLower.includes(fictName) ||
      summaryLower.includes(fictName) ||
      contentLower.includes(fictName) ||
      clubNameLower.includes(fictName)
    ) {
      return false;
    }
  }

  // 2. Rejeita IDs de clubes fictícios
  if (clubId && FICTITIOUS_CLUB_IDS.includes(clubId)) {
    return false;
  }

  // 3. Se a notícia for vinculada a um clube específico, valida contra os clubes oficiais
  if (clubId && clubId !== 'ALL' && clubId !== 'LIVRE' && clubId !== 'sem-clube') {
    const isIdKnown = validClubIds.has(clubId);
    const isNameKnown = clubNameLower ? validClubNames.has(clubNameLower) : false;
    if (!isIdKnown && !isNameKnown) {
      return false;
    }
  }

  return true;
}

function getStoredLeiloes(): any[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('fmu_leiloes_v3');
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return dataStore.getAuctions();
}

export const noticiasService = {
  /**
   * Converte um lance válido de leilão em notícia oficial no feed do FM Universe.
   * Totalmente idempotente: utiliza o ID determinístico auction-bid-{leilaoId}-{lanceId}.
   * Grava automaticamente na coleção /news do Firestore.
   */
  gerarNoticiaLance(params: AuctionBidNewsParams): News {
    const {
      leilaoId,
      lanceId,
      clubId,
      clubName,
      managerId,
      managerName,
      playerId,
      playerName,
      valorLance,
      isOutbid = false,
      timestamp = new Date().toISOString(),
      temporada = '2026/2027',
    } = params;

    const sourceEventId = `auction-bid-${leilaoId}-${lanceId}`;
    const valorFormatado = `R$ ${valorLance.toLocaleString('pt-BR')}`;
    const todayDate = timestamp.split('T')[0];

    const title = isOutbid
      ? `🔥 Lance superado: ${clubName} aumenta a oferta por ${playerName} para ${valorFormatado}.`
      : `🔨 Disputa no mercado: ${clubName} entra na disputa por ${playerName}`;

    const summary = isOutbid
      ? `${clubName} superou o lance anterior e aumentou a oferta por ${playerName} para ${valorFormatado}.`
      : `${clubName} ofereceu ${valorFormatado} por ${playerName}.`;

    const content =
      `A Mesa de Leilões do FM Universe registrou movimentação oficial na temporada ${temporada}.\n\n` +
      `O clube ${clubName} (Treinador: ${managerName || 'Treinador'}) formalizou lance válido no valor de ${valorFormatado} para a aquisição de ${playerName}.\n\n` +
      `• Atleta: ${playerName}\n` +
      `• Clube Proponente: ${clubName}\n` +
      `• Treinador: ${managerName || 'Treinador'}\n` +
      `• Valor Ofertado: ${valorFormatado}\n` +
      `• Leilão ID: ${leilaoId}\n` +
      `• Lance ID: ${lanceId}\n` +
      `• Temporada: ${temporada}\n` +
      `• Status: Leilão em andamento na central de transferências.\n` +
      `• Horário do registro: ${new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;

    const newsItem: News = {
      id: sourceEventId,
      sourceEventId,
      title,
      summary,
      content,
      category: 'TRANSFERENCIAS',
      type: isOutbid ? 'AUCTION_OUTBID' : 'AUCTION_BID',
      priority: valorLance >= 50000000 ? 'URGENTE' : valorLance >= 20000000 ? 'ALTA' : 'MEDIA',
      clubId,
      clubName,
      managerId,
      managerName,
      playerId,
      playerName,
      leilaoId,
      lanceId,
      valor: valorLance,
      date: todayDate,
      timestamp,
      temporada,
      author: 'Central de Leilões FM',
      readTimeMinutes: 1,
      isRead: false,
      metadata: {
        eventType: isOutbid ? 'AUCTION_OUTBID' : 'AUCTION_BID',
        leilaoId,
        lanceId,
        clubId,
        clubName,
        managerId,
        managerName,
        playerId,
        playerName,
        valor: valorLance,
        valorLance,
        timestamp,
        temporada,
      },
    };

    dataStore.addNews(newsItem);

    // Persiste imediatamente na coleção /news do Firestore
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'news', sourceEventId);
        const cleanData = Object.fromEntries(
          Object.entries(newsItem).filter(([_, v]) => v !== undefined)
        );
        setDoc(docRef, cleanData, { merge: true }).catch((err) => {
          console.warn('⚠️ [noticiasService] Falha ao persistir notícia no Firestore /news:', err);
        });
      } catch (err) {
        // Modo autônomo offline ou quota
      }
    }

    return newsItem;
  },

  /**
   * Converte a liquidação finalizada de um leilão em notícia oficial de vitória.
   * Totalmente idempotente: utiliza o ID determinístico news-auction-{leilaoId}.
   * Grava automaticamente na coleção /news do Firestore.
   */
  gerarNoticiaLeilaoEncerrado(params: AuctionWonNewsParams): News {
    const {
      leilaoId,
      clubId,
      clubName,
      managerId,
      managerName,
      playerId,
      playerName,
      winningBid,
      timestamp = new Date().toISOString(),
      temporada = '2026/2027',
    } = params;

    const sourceEventId = `news-auction-${leilaoId}`;
    const valorFormatado = `R$ ${winningBid.toLocaleString('pt-BR')}`;
    const todayDate = timestamp.split('T')[0];

    const title = `🏆 Leilão encerrado: ${clubName} vence ${playerName} por ${valorFormatado}.`;
    const summary = `${clubName} venceu a disputa e garantiu a contratação definitiva de ${playerName} por ${valorFormatado}.`;
    const content =
      `O leilão de ${playerName} foi oficialmente encerrado e liquidado no FM Universe.\n\n` +
      `O ${clubName}, sob o comando de ${managerName || 'Treinador'}, superou a concorrência e arrematou o atleta em definitivo pelo montante de ${valorFormatado}.\n\n` +
      `• Atleta: ${playerName}\n` +
      `• Clube Vencedor: ${clubName}\n` +
      `• Treinador: ${managerName || 'Treinador'}\n` +
      `• Valor Final: ${valorFormatado}\n` +
      `• Leilão ID: ${leilaoId}\n` +
      `• Temporada: ${temporada}\n` +
      `A transferência foi liquidada financeiramente junto ao Caixa Real do clube e o jogador já integra o plantel oficial para a disputa da temporada ${temporada}.`;

    const newsItem: News = {
      id: sourceEventId,
      sourceEventId,
      title,
      summary,
      content,
      category: 'TRANSFERENCIAS',
      type: 'AUCTION_WON',
      priority: 'ALTA',
      clubId,
      clubName,
      managerId,
      managerName,
      playerId,
      playerName,
      leilaoId,
      valor: winningBid,
      date: todayDate,
      timestamp,
      temporada,
      author: 'Central de Leilões FM',
      readTimeMinutes: 2,
      isRead: false,
      metadata: {
        eventType: 'AUCTION_WON',
        leilaoId,
        clubId,
        clubName,
        managerId,
        managerName,
        playerId,
        playerName,
        winningBid,
        valor: winningBid,
        timestamp,
        temporada,
      },
    };

    dataStore.addNews(newsItem);

    // Persiste imediatamente na coleção /news do Firestore
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'news', sourceEventId);
        const cleanData = Object.fromEntries(
          Object.entries(newsItem).filter(([_, v]) => v !== undefined)
        );
        setDoc(docRef, cleanData, { merge: true }).catch((err) => {
          console.warn('⚠️ [noticiasService] Falha ao persistir notícia de finalização no Firestore /news:', err);
        });
      } catch (err) {
        // Modo autônomo offline ou quota
      }
    }

    return newsItem;
  },

  /**
   * Obtém todas as notícias com filtros flexíveis.
   * Fonte de Verdade Principal: Coleção /news do Firestore.
   * Filtro Estrito: Apenas clubes reais atualmente presentes na coleção /clubes.
   * Preserva notícias reais existentes dos clubes oficiais.
   */
  async getAll(filter?: NewsFilter): Promise<News[]> {
    // 1. Sincroniza eventos reais do sistema (incluindo leilões e lances confirmados)
    this.syncFromRealEvents(filter?.clubId);

    let list: News[] = [];
    const db = getFirestoreDb() || firestoreDb;

    // Leitura primária da coleção /news do Firestore
    if (isFirebaseConfigured() && db) {
      try {
        const colRef = collection(db, 'news');
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          const fromDb = snap.docs.map((d) => ({ id: d.id, ...d.data() } as News));
          const local = dataStore.getNews();
          const map = new Map<string, News>();
          fromDb.forEach((n) => map.set(n.id, n));
          local.forEach((n) => {
            if (!map.has(n.id)) map.set(n.id, n);
          });
          list = Array.from(map.values());
        }
      } catch (err) {
        // Modo autônomo offline ou quota
      }
    }

    if (list.length === 0) {
      list = dataStore.getNews();
    }

    // 2. Consulta clubes reais existentes na coleção /clubes do Firestore
    const currentClubs = await clubesService.getAll().catch(() => []);
    const validClubIds = new Set<string>([
      ...OFFICIAL_CLUBS_LIST.map((c) => c.id),
      ...currentClubs
        .filter(
          (c) =>
            !FICTITIOUS_CLUB_IDS.includes(c.id) &&
            !FICTITIOUS_CLUB_NAMES.some((f) => c.name.toLowerCase().includes(f))
        )
        .map((c) => c.id),
    ]);

    const validClubNames = new Set<string>([
      ...OFFICIAL_CLUBS_LIST.map((c) => c.name.toLowerCase().trim()),
      ...currentClubs
        .filter(
          (c) =>
            !FICTITIOUS_CLUB_IDS.includes(c.id) &&
            !FICTITIOUS_CLUB_NAMES.some((f) => c.name.toLowerCase().includes(f))
        )
        .map((c) => c.name.toLowerCase().trim()),
    ]);

    // 3. Filtro estrito de atualidade: NENHUM clube fictício/antigo entra no feed
    list = list.filter((n) => isNewsValidForCurrentUniverse(n, validClubIds, validClubNames));

    // 4. Ordenação por data/hora decrescente (mais recente primeiro)
    list.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.date).getTime() || 0;
      const timeB = new Date(b.timestamp || b.date).getTime() || 0;
      return timeB - timeA;
    });

    // 5. Aplicação dos filtros solicitados
    if (filter) {
      if (filter.clubId && filter.clubId !== 'ALL') {
        list = list.filter((n) => !n.clubId || n.clubId === filter.clubId);
      }
      if (filter.category && filter.category !== 'ALL') {
        list = list.filter((n) => n.category === filter.category);
      }
      if (filter.type && filter.type !== 'ALL') {
        list = list.filter((n) => n.type === filter.type);
      }
      if (filter.priority && filter.priority !== 'ALL') {
        list = list.filter((n) => n.priority === filter.priority);
      }
      if (filter.unreadOnly) {
        list = list.filter((n) => !n.isRead);
      }
      if (filter.searchQuery && filter.searchQuery.trim() !== '') {
        const q = filter.searchQuery.toLowerCase().trim();
        list = list.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.summary.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q) ||
            n.clubName?.toLowerCase().includes(q)
        );
      }
    }

    return list;
  },

  /**
   * Busca uma notícia pelo ID.
   */
  async getById(id: string): Promise<News | null> {
    const all = await this.getAll();
    return all.find((n) => n.id === id) || null;
  },

  /**
   * Publica ou atualiza uma notícia no sistema.
   * Totalmente idempotente: deduplica por ID ou sourceEventId.
   */
  async publishNews(newsItem: News): Promise<News> {
    const formatted: News = {
      ...newsItem,
      timestamp: newsItem.timestamp || new Date().toISOString(),
      isRead: newsItem.isRead ?? false,
    };

    dataStore.addNews(formatted);

    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'news', formatted.id);
        const cleanData = Object.fromEntries(
          Object.entries(formatted).filter(([_, v]) => v !== undefined)
        );
        await setDoc(docRef, cleanData);
      } catch (err) {
        console.warn('Falha ao persistir notícia no Firestore.', err);
      }
    }

    return formatted;
  },

  /**
   * Marca uma notícia como lida.
   */
  async markAsRead(id: string): Promise<void> {
    dataStore.markNewsAsRead(id);
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'news', id);
        await updateDoc(docRef, { isRead: true });
      } catch (err) {
        // ignore
      }
    }
  },

  /**
   * Marca todas as notícias como lidas.
   */
  async markAllAsRead(clubId?: string): Promise<void> {
    dataStore.markAllNewsAsRead(clubId);
  },

  /**
   * Retorna o contador de notícias não lidas.
   */
  async getUnreadCount(clubId?: string): Promise<number> {
    const all = await this.getAll();
    return all.filter((n) => !n.isRead && (!clubId || !n.clubId || n.clubId === clubId)).length;
  },

  /**
   * MOTOR DE SINCRONIZAÇÃO DINÂMICA COM EVENTOS REAIS DO SISTEMA
   * Varre exclusivamente dados e eventos reais homologados no FM Universe:
   * 1. Lances e disputas de leilões (/leiloes/{leilaoId}/lances)
   * 2. Partidas concluídas reais (apenas clubes oficiais)
   * 3. Propostas e contrapropostas de transferência reais
   * 4. Transferências concluídas reais
   * 5. Obras de Estádio e movimentações financeiras relevantes
   * 6. Mudanças na liderança e classificação do campeonato
   */
  syncFromRealEvents(currentClubId?: string): void {
    const clubs = dataStore.getClubs();
    const stadiums = dataStore.getStadiums();
    const existingNews = dataStore.getNews();
    const publishedSourceIds = new Set<string>(
      existingNews.map((n) => n.sourceEventId).filter((id): id is string => Boolean(id))
    );

    const getClub = (id?: string): Club | undefined => clubs.find((c) => c.id === id);
    const getStadium = (id?: string): Stadium | undefined => stadiums.find((s) => s.id === id);

    // -------------------------------------------------------------
    // 1. EVENTOS REAIS DE LEILÕES E LANCES CONFIRMADOS
    // -------------------------------------------------------------
    // Sincroniza lances históricos conhecidos do FM Universe (Kaká R$ 85M, Zlatan R$ 68M, Hargreaves R$ 1.7M)
    for (const bid of KNOWN_AUCTION_BIDS) {
      const sourceId = `auction-bid-${bid.leilaoId}-${bid.lanceId}`;
      if (!publishedSourceIds.has(sourceId)) {
        this.gerarNoticiaLance(bid);
        publishedSourceIds.add(sourceId);
      }
    }

    // Sincroniza quaisquer leilões que já tenham lance registrado ou que tenham sido liquidados
    const leiloes = getStoredLeiloes();
    for (const leilao of leiloes) {
      // 1.1 Se o leilão foi liquidado e encerrado, gera a notícia oficial de vitória
      if (leilao.settled === true && leilao.winnerClubId && Number(leilao.highestBid) > 0) {
        const sourceWonId = `news-auction-${leilao.id}`;
        if (!publishedSourceIds.has(sourceWonId)) {
          const club = getClub(leilao.winnerClubId);
          this.gerarNoticiaLeilaoEncerrado({
            leilaoId: leilao.id,
            clubId: leilao.winnerClubId,
            clubName: club?.name || leilao.winnerClubName || 'Ninja FC',
            managerId: leilao.winnerManagerId,
            managerName: leilao.winnerManagerName,
            playerId: leilao.playerId || leilao.id,
            playerName: leilao.playerName || 'Atleta',
            winningBid: Number(leilao.highestBid) || 0,
            timestamp: leilao.updatedAt || new Date().toISOString(),
            temporada: '2026/2027',
          });
          publishedSourceIds.add(sourceWonId);
        }
      }

      // 1.2 Se o leilão possui maior lance registrado, assegura a notícia do lance
      const highestBid = Number(leilao.highestBid) || 0;
      if (highestBid > 0 && leilao.highestBidderClub) {
        const club = getClub(leilao.highestBidderClub);
        const sourceId = `auction-bid-${leilao.id}-${leilao.highestBidderClub}-${highestBid}`;
        if (!publishedSourceIds.has(sourceId)) {
          this.gerarNoticiaLance({
            leilaoId: leilao.id,
            lanceId: `top-${highestBid}`,
            clubId: leilao.highestBidderClub,
            clubName: club?.name || leilao.highestBidder || 'Ninja FC',
            managerName: leilao.highestBidder || 'Treinador',
            playerId: leilao.playerId || leilao.id,
            playerName: leilao.playerName || 'Atleta',
            valorLance: highestBid,
            isOutbid: false,
            timestamp: leilao.updatedAt || new Date().toISOString(),
            temporada: '2026/2027',
          });
          publishedSourceIds.add(sourceId);
        }
      }
    }

    // -------------------------------------------------------------
    // 2. EVENTOS REAIS DE PARTIDAS CONCLUÍDAS (APENAS CLUBES REAIS)
    // -------------------------------------------------------------
    const matches = dataStore.getMatches();
    const finishedMatches = matches.filter((m) => m.status === 'FINISHED');

    for (const match of finishedMatches) {
      const homeClub = getClub(match.homeClubId);
      const awayClub = getClub(match.awayClubId);
      const homeName = (homeClub?.name || match.homeClubName || '').toLowerCase();
      const awayName = (awayClub?.name || match.awayClubName || '').toLowerCase();

      // Ignora partidas de clubes fictícios antigos
      if (
        FICTITIOUS_CLUB_NAMES.some((f) => homeName.includes(f) || awayName.includes(f)) ||
        FICTITIOUS_CLUB_IDS.includes(match.homeClubId) ||
        FICTITIOUS_CLUB_IDS.includes(match.awayClubId)
      ) {
        continue;
      }

      const sourceId = `match-res-${match.id}`;
      if (!publishedSourceIds.has(sourceId)) {
        const stadium = getStadium(match.stadiumId);
        const isUserMatch =
          currentClubId &&
          (match.homeClubId === currentClubId || match.awayClubId === currentClubId);

        const primaryClub = isUserMatch
          ? (match.homeClubId === currentClubId ? homeClub : awayClub)
          : homeClub;

        const eventDate = match.date || '2026-09-09';
        const eventTime = match.time || '16:00';
        const isoTimestamp = `${eventDate}T${eventTime}:00Z`;

        const goalEvents = (match.events || []).filter((e) => e.type === 'GOAL');
        const scorersSummary =
          goalEvents.length > 0
            ? goalEvents.map((g) => `${g.minute}' ${g.playerName}`).join(', ')
            : 'Partida equilibrada sem gols marcados.';

        const newsTitle = `Liga FM (R${match.round}): ${match.homeClubName} ${match.homeScore} x ${match.awayScore} ${match.awayClubName}`;
        const summary = `Confronto disputado no ${match.stadiumName}${
          match.attendance ? ` com público oficial de ${match.attendance.toLocaleString('pt-BR')} torcedores.` : '.'
        }`;

        const possessionStr = match.stats?.possession
          ? `${match.stats.possession[0]}% x ${match.stats.possession[1]}%`
          : '50% x 50%';
        const shotsStr = match.stats?.shots
          ? `${match.stats.shots[0]} x ${match.stats.shots[1]}`
          : 'N/D';

        const content = `Em partida oficial válida pela Rodada ${match.round} da Liga FM Universe, o ${match.homeClubName} enfrentou o ${match.awayClubName} no estádio ${match.stadiumName}. O placar final registrou ${match.homeClubName} ${match.homeScore} x ${match.awayScore} ${match.awayClubName}.\n\nEstatísticas e destaques do confronto:\n• Gols: ${scorersSummary}\n• Posse de bola: ${possessionStr}\n• Finalizações: ${shotsStr}\n• Público e Bilheteria: ${match.attendance ? `${match.attendance.toLocaleString('pt-BR')} pagantes` : 'Portões normais'}.`;

        const newsItem: News = {
          id: `news-${sourceId}`,
          sourceEventId: sourceId,
          title: newsTitle,
          summary,
          content,
          category: 'COMPETICAO',
          type: isUserMatch ? 'MATCH_RESULT' : 'OTHER_CLUB_EVENT',
          priority: isUserMatch ? 'ALTA' : 'MEDIA',
          clubId: primaryClub?.id,
          clubName: primaryClub?.name || match.homeClubName,
          clubBadge: primaryClub?.badge,
          stadiumImage: stadium?.image,
          date: eventDate,
          timestamp: isoTimestamp,
          author: 'Redação Oficial FM Universe',
          readTimeMinutes: 2,
          isRead: false,
        };

        dataStore.addNews(newsItem);
        publishedSourceIds.add(sourceId);
      }
    }

    // -------------------------------------------------------------
    // 3. EVENTOS REAIS DE PROPOSTAS E NEGOCIAÇÕES DE MERCADO
    // -------------------------------------------------------------
    const offers = dataStore.getTransferOffers();
    for (const offer of offers) {
      const buyerClub = getClub(offer.buyerClubId);
      const sellerClub = getClub(offer.sellerClubId);
      const buyerName = (buyerClub?.name || offer.buyerClubName || '').toLowerCase();
      const sellerName = (sellerClub?.name || offer.sellerClubName || '').toLowerCase();

      // Ignora negociações com clubes fictícios antigos
      if (
        FICTITIOUS_CLUB_NAMES.some((f) => buyerName.includes(f) || sellerName.includes(f)) ||
        FICTITIOUS_CLUB_IDS.includes(offer.buyerClubId) ||
        FICTITIOUS_CLUB_IDS.includes(offer.sellerClubId)
      ) {
        continue;
      }

      const isRelated =
        currentClubId && (offer.buyerClubId === currentClubId || offer.sellerClubId === currentClubId);

      if (offer.status === 'PENDING') {
        const sourceId = `offer-pending-${offer.id}`;
        if (!publishedSourceIds.has(sourceId)) {
          const newsItem: News = {
            id: `news-${sourceId}`,
            sourceEventId: sourceId,
            title: `Mercado: ${buyerClub?.name || offer.buyerClubName} oficializa proposta por ${offer.playerName}`,
            summary: `Oferta de ${formatCurrencyBRL(offer.amount, { compact: true })} apresentada ao ${sellerClub?.name || offer.sellerClubName}. Negociação em andamento.`,
            content: `A diretoria do ${buyerClub?.name || offer.buyerClubName} formalizou proposta no valor de ${formatCurrencyBRL(offer.amount, { compact: true })} para contratar o atleta ${offer.playerName} junto ao ${sellerClub?.name || offer.sellerClubName}.\n\n${
              offer.responseNote ? `Nota da Diretoria: "${offer.responseNote}"\n\n` : ''
            }O clube vendedor tem prazo para analisar as condições e responder com aceite, recusa ou contraproposta.`,
            category: 'TRANSFERENCIAS',
            type: 'TRANSFER_PROPOSAL',
            priority: isRelated ? 'ALTA' : 'MEDIA',
            clubId: buyerClub?.id || offer.buyerClubId,
            clubName: buyerClub?.name || offer.buyerClubName,
            clubBadge: buyerClub?.badge,
            date: offer.createdAt?.split('T')[0] || '2026-09-09',
            timestamp: offer.createdAt || new Date().toISOString(),
            author: 'Central do Mercado FM',
            readTimeMinutes: 2,
            isRead: false,
          };
          dataStore.addNews(newsItem);
          publishedSourceIds.add(sourceId);
        }
      } else if (
        (offer.status === 'NEGOCIAÇÃO' || offer.status === 'NEGOTIATION' || (offer.counterOfferAmount && offer.counterOfferAmount > 0)) &&
        offer.counterOfferAmount
      ) {
        const sourceId = `offer-counter-${offer.id}-${offer.counterOfferAmount}`;
        if (!publishedSourceIds.has(sourceId)) {
          const newsItem: News = {
            id: `news-${sourceId}`,
            sourceEventId: sourceId,
            title: `Contraproposta: ${sellerClub?.name || offer.sellerClubName} pede ${formatCurrencyBRL(offer.counterOfferAmount, { compact: true })} por ${offer.playerName}`,
            summary: `Clube vendedor estabelece novo valor para liberar o atleta para o ${buyerClub?.name || offer.buyerClubName}.`,
            content: `Em resposta à investida inicial, o ${sellerClub?.name || offer.sellerClubName} apresentou uma contraproposta oficial no valor de ${formatCurrencyBRL(offer.counterOfferAmount, { compact: true })} para fechar a transferência de ${offer.playerName}.\n\n${
              offer.responseNote ? `Declaração da Diretoria: "${offer.responseNote}"\n\n` : ''
            }A decisão final agora está nas mãos da diretoria do ${buyerClub?.name || offer.buyerClubName}.`,
            category: 'TRANSFERENCIAS',
            type: 'TRANSFER_COUNTER',
            priority: isRelated ? 'URGENTE' : 'MEDIA',
            clubId: sellerClub?.id || offer.sellerClubId,
            clubName: sellerClub?.name || offer.sellerClubName,
            clubBadge: sellerClub?.badge,
            date: offer.updatedAt?.split('T')[0] || '2026-09-09',
            timestamp: offer.updatedAt || new Date().toISOString(),
            author: 'Central do Mercado FM',
            readTimeMinutes: 2,
            isRead: false,
          };
          dataStore.addNews(newsItem);
          publishedSourceIds.add(sourceId);
        }
      }
    }

    // -------------------------------------------------------------
    // 4. EVENTOS REAIS DE TRANSFERÊNCIAS CONCLUÍDAS
    // -------------------------------------------------------------
    const transfers = dataStore.getTransfers();
    for (const transfer of transfers) {
      const buyer = getClub(transfer.toClubId);
      const seller = getClub(transfer.fromClubId);
      const buyerName = (buyer?.name || transfer.toClubName || '').toLowerCase();
      const sellerName = (seller?.name || transfer.fromClubName || '').toLowerCase();

      // Ignora transferências de clubes fictícios
      if (
        FICTITIOUS_CLUB_NAMES.some((f) => buyerName.includes(f) || (sellerName && sellerName !== 'livre' && sellerName.includes(f))) ||
        FICTITIOUS_CLUB_IDS.includes(transfer.toClubId) ||
        FICTITIOUS_CLUB_IDS.includes(transfer.fromClubId)
      ) {
        continue;
      }

      const sourceId = `transf-done-${transfer.id}`;
      if (!publishedSourceIds.has(sourceId)) {
        const buyerStadium = getStadium(buyer?.stadiumId);

        const newsItem: News = {
          id: `news-${sourceId}`,
          sourceEventId: sourceId,
          title: `Oficial: ${transfer.playerName} assina com o ${buyer?.name || transfer.toClubName}!`,
          summary: `Contratação concluída por ${formatCurrencyBRL(transfer.fee, { compact: true })}. Atleta deixa o ${seller?.name || transfer.fromClubName}.`,
          content: `O ${buyer?.name || transfer.toClubName} anunciou oficialmente a contratação definitiva de ${transfer.playerName} (${transfer.playerPosition || 'Atleta'}). A transação foi homologada pelo montante de ${formatCurrencyBRL(transfer.fee, { compact: true })}.\n\nO jogador se juntará ao plantel imediatamente sob o comando técnico da comissão.`,
          category: 'TRANSFERENCIAS',
          type: 'TRANSFER_COMPLETED',
          priority: currentClubId && (transfer.toClubId === currentClubId || transfer.fromClubId === currentClubId) ? 'ALTA' : 'MEDIA',
          clubId: buyer?.id || transfer.toClubId,
          clubName: buyer?.name || transfer.toClubName,
          clubBadge: buyer?.badge,
          stadiumImage: buyerStadium?.image,
          date: transfer.date || '2026-09-08',
          timestamp: `${transfer.date || '2026-09-08'}T12:00:00Z`,
          author: 'Central do Mercado FM',
          readTimeMinutes: 2,
          isRead: false,
        };
        dataStore.addNews(newsItem);
        publishedSourceIds.add(sourceId);
      }
    }

    // -------------------------------------------------------------
    // 5. EVENTOS REAIS DE INFRAESTRUTURA E ESTÁDIO (ex: Thales FC)
    // -------------------------------------------------------------
    const finances = dataStore.getFinances();
    for (const fin of finances) {
      if (
        fin.category === 'INFRAESTRUTURA' ||
        fin.description?.includes('Expansão de Arquibancada') ||
        fin.transactionType === 'Melhoria de Infraestrutura'
      ) {
        const club = getClub(fin.clubId);
        const clubName = (club?.name || '').toLowerCase();
        if (
          FICTITIOUS_CLUB_NAMES.some((f) => clubName.includes(f)) ||
          FICTITIOUS_CLUB_IDS.includes(fin.clubId)
        ) {
          continue;
        }

        const sourceId = `infra-record-${fin.id}`;
        if (!publishedSourceIds.has(sourceId)) {
          const stadium = getStadium(club?.stadiumId);

          const newsItem: News = {
            id: `news-${sourceId}`,
            sourceEventId: sourceId,
            title: `Patrimônio: Concluída expansão da ${club?.stadiumName || 'Arena'} para 75.000 torcedores!`,
            summary: `Investimento histórico de ${formatCurrencyBRL(fin.amount, { compact: true })} amplia a capacidade e potencial de bilheteria do clube.`,
            content: `A diretoria do ${club?.name || 'clube'} confirmou a conclusão das obras de modernização e ampliação de sua praça esportiva (${club?.stadiumName || 'Arena'}), elevando a capacidade oficial para 75.000 assentos.\n\nO investimento contabilizado de ${formatCurrencyBRL(fin.amount, { compact: true })} capacita a instituição a maximizar sua arrecadação em dias de grandes clássicos e jogos decisivos da Liga FM Universe.`,
            category: 'ESTADIO',
            type: 'STADIUM_UPGRADE',
            priority: 'ALTA',
            clubId: club?.id || fin.clubId,
            clubName: club?.name,
            clubBadge: club?.badge,
            stadiumImage: stadium?.image,
            date: fin.date || '2026-09-08',
            timestamp: `${fin.date || '2026-09-08'}T10:00:00Z`,
            author: 'Departamento de Infraestrutura & Patrimônio',
            readTimeMinutes: 2,
            isRead: false,
          };
          dataStore.addNews(newsItem);
          publishedSourceIds.add(sourceId);
        }
      }
    }

    // -------------------------------------------------------------
    // 6. EVENTOS REAIS DE CLASSIFICAÇÃO / CAMPEONATO
    // -------------------------------------------------------------
    const comps = dataStore.getCompetitions();
    for (const comp of comps) {
      if (comp.standings && comp.standings.length > 0) {
        const leader = comp.standings[0];
        const leaderName = (leader.clubName || '').toLowerCase();
        if (
          FICTITIOUS_CLUB_NAMES.some((f) => leaderName.includes(f)) ||
          FICTITIOUS_CLUB_IDS.includes(leader.clubId)
        ) {
          continue;
        }

        const roundNum = comp.currentRound || 4;
        const sourceId = `comp-lead-${comp.id}-r${roundNum}`;
        if (!publishedSourceIds.has(sourceId)) {
          const leaderClub = getClub(leader.clubId);
          const newsItem: News = {
            id: `news-${sourceId}`,
            sourceEventId: sourceId,
            title: `Liga FM: ${leader.clubName} sustenta a ponta da tabela na Rodada ${roundNum}`,
            summary: `Com ${leader.points} pontos em ${leader.played} jogos, equipe lidera a acirrada disputa pelo título da temporada 2026/2027.`,
            content: `A classificação da Liga FM Universe segue em ritmo acelerado. O ${leader.clubName} desponta na liderança com ${leader.points} pontos conquistados em ${leader.played} compromissos (${leader.won} vitórias, ${leader.drawn} empates e ${leader.lost} derrotas), ostentando saldo de gols de +${leader.goalDifference}.\n\nO G-4 permanece em disputa direta entre os gigantes do universo FM.`,
            category: 'COMPETICAO',
            type: 'STANDINGS_CHANGE',
            priority: 'MEDIA',
            clubId: leaderClub?.id || leader.clubId,
            clubName: leader.clubName,
            clubBadge: leaderClub?.badge,
            date: '2026-09-08',
            timestamp: '2026-09-08T20:00:00Z',
            author: 'Mesa Redonda FM',
            readTimeMinutes: 2,
            isRead: false,
          };
          dataStore.addNews(newsItem);
          publishedSourceIds.add(sourceId);
        }
      }
    }
  },

  async publishOfficialAnnouncement(news: News): Promise<void> {
    dataStore.addNews(news);
    if (isFirebaseConfigured() && firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'news', news.id);
        await setDoc(docRef, news, { merge: true });
      } catch (err) {
        console.warn('Falha ao persistir notícia oficial no Firestore.', err);
      }
    }
  },
};
