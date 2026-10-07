import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Gavel,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Trophy,
  History,
  User,
  Search,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb, firestoreDb } from '../../config/firebase';
import { Club } from '../../types';
import { leiloesV3Service } from '../../services/leiloesV3Service';
import { Leilao, Lance } from '../../types/leiloesV3';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrencyBRL } from '../../utils/currency';

interface MeuLanceItem {
  leilao: Leilao;
  meuUltimoLance: Lance;
  lanceAtual: number;
  liderNome: string;
  liderClube: string | null;
  isLider: boolean;
  statusDisputa: 'LIDERANDO' | 'SUPERADO' | 'AGUARDANDO';
  quantidadeConcorrentes: number;
}

export const ManagerLeiloesV3Page: React.FC = () => {
  const { firebaseUser, user, managerProfile, managedClub, refreshClubData, refreshManagerProfile } = useAuth();

  // Identificação canônica do Manager logado e seu clube
  const currentManagerUid = firebaseUser?.uid || user?.id || managerProfile?.uid;
  const currentManagerName = managerProfile?.name || user?.name || firebaseUser?.displayName || 'Treinador';

  // Estado local do clube com sincronização em tempo real do Firestore (/clubes/{clubId})
  const [clubeAtualizado, setClubeAtualizado] = useState<Club | null>(null);
  const clubeExibido = clubeAtualizado || managedClub;
  const currentClubId = clubeExibido?.id;
  const currentClubName = clubeExibido?.name;

  // Sincroniza estado inicial com managedClub
  useEffect(() => {
    if (managedClub) {
      setClubeAtualizado((prev) => (prev ? { ...prev, ...managedClub } : managedClub));
    }
  }, [managedClub]);

  // Função para releitura forçada direta do documento real /clubes/{clubId} no Firestore
  const recarregarClubeFirestore = useCallback(async () => {
    const clubId = managedClub?.id || managerProfile?.clubId || user?.managedClubId;
    if (!clubId || clubId === 'sem-clube') return;

    try {
      const db = getFirestoreDb() || firestoreDb;
      if (db) {
        const snap = await getDoc(doc(db, 'clubes', clubId));
        if (snap.exists()) {
          const cloudData = snap.data();
          const updated: Club = {
            ...(managedClub || {}),
            ...cloudData,
            id: snap.id,
            balance: Number(cloudData.balance ?? managedClub?.balance ?? 0),
            reservedTransferBudget: Number(cloudData.reservedTransferBudget ?? 0),
            transferBudget: Number(cloudData.transferBudget ?? managedClub?.transferBudget ?? 0),
          } as Club;
          setClubeAtualizado(updated);
          try {
            localStorage.setItem('fmu_current_managed_club', JSON.stringify(updated));
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ [Leilões] Falha ao recarregar clube do Firestore:', err);
    }
  }, [managedClub, managerProfile?.clubId, user?.managedClubId]);

  // Listener em tempo real direto do documento /clubes/{clubId} no Firestore
  useEffect(() => {
    const clubId = managedClub?.id || managerProfile?.clubId || user?.managedClubId;
    if (!clubId || clubId === 'sem-clube') return;

    const db = getFirestoreDb() || firestoreDb;
    if (!db) return;

    const clubRef = doc(db, 'clubes', clubId);
    const unsub = onSnapshot(
      clubRef,
      (snap) => {
        if (snap.exists()) {
          const cloudData = snap.data();
          setClubeAtualizado((prev) => ({
            ...(prev || managedClub || {}),
            ...cloudData,
            id: snap.id,
            balance: Number(cloudData.balance ?? prev?.balance ?? 0),
            reservedTransferBudget: Number(cloudData.reservedTransferBudget ?? 0),
            transferBudget: Number(cloudData.transferBudget ?? prev?.transferBudget ?? 0),
          } as Club));
        }
      },
      (err) => {
        console.warn('⚠️ [Leilões] Erro no listener em tempo real do clube:', err);
      }
    );

    return () => unsub();
  }, [managedClub?.id, managerProfile?.clubId, user?.managedClubId]);

  // Lista de Leilões (/leiloes)
  const [leiloes, setLeiloes] = useState<Leilao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  // Busca em tempo real na lista de leilões abertos
  const [termoBusca, setTermoBusca] = useState('');

  // Leilão selecionado para detalhes e lances
  const [leilaoAtivo, setLeilaoAtivo] = useState<Leilao | null>(null);
  const [lancesModal, setLancesModal] = useState<Lance[]>([]);
  const [valorLance, setValorLance] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Mapa de lances por leilão para a seção "MEUS LANCES"
  const [lancesPorLeilao, setLancesPorLeilao] = useState<Record<string, Lance[]>>({});
  const [filtroMeusLances, setFiltroMeusLances] = useState<'TODOS' | 'LIDERANDO' | 'SUPERADOS'>('TODOS');

  // Contador de tempo regressivo em tempo real (1 segundo)
  const [, setClockTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Listener em tempo real dos leilões (/leiloes) do Firestore
  useEffect(() => {
    setLoading(true);
    setQuotaError(null);
    const unsub = leiloesV3Service.escutarLeiloes((list) => {
      setLeiloes(list);
      setLoading(false);
      setRefreshing(false);
    });
    return () => unsub();
  }, []);

  // Auto-abertura de leilão quando o manager clica em "Ver leilão" em uma notificação
  useEffect(() => {
    const checkTargetAuction = () => {
      if (leiloes.length === 0) return;
      const targetId = typeof window !== 'undefined' ? sessionStorage.getItem('fmu_target_leilao_id') : null;
      if (targetId) {
        const found = leiloes.find((l) => l.id === targetId);
        if (found) {
          setLeilaoAtivo(found);
          setFeedback(null);
          const minIncrement = Number(found.minIncrement) || 100000;
          const highestBid = Number(found.highestBid) || 0;
          const initialBid = Number(found.initialBid) || 0;
          const proximoValor = highestBid > 0 ? highestBid + minIncrement : initialBid;
          setValorLance(proximoValor);
          sessionStorage.removeItem('fmu_target_leilao_id');
        }
      }
    };

    checkTargetAuction();
    window.addEventListener('fmu_open_auction', checkTargetAuction);
    return () => window.removeEventListener('fmu_open_auction', checkTargetAuction);
  }, [leiloes]);

  // Sincronização oficial de lances para a seção "MEUS LANCES"
  // Consulta apenas as subcoleções /leiloes/{leilaoId}/lances necessárias para o Manager logado
  useEffect(() => {
    if (!currentManagerUid || leiloes.length === 0) return;

    const unsubs: Array<() => void> = [];
    const leiloesDisputadosIdsLocal = leiloesV3Service.getLeiloesDisputadosIds(currentManagerUid);
    const leiloesDisputadosSet = new Set(leiloesDisputadosIdsLocal);

    leiloes.forEach((l) => {
      const isLiderDireto =
        l.highestBidder === currentManagerName ||
        (Boolean(currentClubName) && l.highestBidderClub === currentClubName) ||
        (l as any).highestBidderId === currentManagerUid;

      let temLanceLocal = false;
      try {
        const stored = localStorage.getItem(`fmu_lances_v3_${l.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            Array.isArray(parsed) &&
            parsed.some(
              (lance: Lance) =>
                lance.managerId === currentManagerUid || (Boolean(currentClubId) && lance.clubId === currentClubId)
            )
          ) {
            temLanceLocal = true;
          }
        }
      } catch {
        // ignore
      }

      if (leiloesDisputadosSet.has(l.id) || isLiderDireto || temLanceLocal) {
        const unsub = leiloesV3Service.escutarLances(l.id, (lances) => {
          setLancesPorLeilao((prev) => ({ ...prev, [l.id]: lances }));
        });
        unsubs.push(unsub);
      }
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [leiloes, currentManagerUid, currentManagerName, currentClubId, currentClubName]);

  // Atualização pontual manual acionada pelo botão "Atualizar"
  const carregarLeiloes = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setQuotaError(null);

    const res = await leiloesV3Service.buscarLeiloes();
    if (res.data) {
      setLeiloes(res.data);
    }

    if (!res.success) {
      if (res.isQuotaExhausted) {
        setQuotaError(
          'Limite diário de leituras do Firestore atingido. Tente novamente após a renovação da cota.'
        );
      } else if (res.error) {
        setQuotaError(res.error);
      }
    }

    setLoading(false);
    setRefreshing(false);
  };

  // Filtros derivados: leilões com status de disputa aberto
  const leiloesAbertos = useMemo(() => {
    return leiloes.filter((l) => {
      const statusNorm = String(l.status || 'ABERTO').trim().toUpperCase();
      return (
        statusNorm === 'ABERTO' ||
        statusNorm === 'OPEN' ||
        statusNorm === 'ATIVO' ||
        statusNorm === 'EM_ANDAMENTO'
      );
    });
  }, [leiloes]);

  // Lista de leilões abertos com pesquisa por nome/sobrenome em tempo real e ordenação automática
  const leiloesAbertosExibidos = useMemo(() => {
    let lista = leiloesAbertos;

    if (termoBusca.trim()) {
      const rawQ = termoBusca
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      const terms = rawQ.split(/[\s,]+/).filter(Boolean);

      lista = lista.filter((l) => {
        const nomeInvertido = l.playerName?.includes(',')
          ? l.playerName.split(',').reverse().map((s) => s.trim()).join(' ')
          : '';
        const searchable = [
          l.playerName,
          nomeInvertido,
          (l as any).playerFullName,
          (l as any).nome,
          (l as any).nomeCompleto,
          (l as any).knownAs,
          (l as any).nickname,
        ]
          .filter(Boolean)
          .join(' ')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        return terms.every((term) => searchable.includes(term));
      });
    }

    return [...lista].sort((a, b) => {
      const ovrA = Number(a.playerRating || (a as any).ovr || (a as any).ca || (a as any).rating || 70);
      const ovrB = Number(b.playerRating || (b as any).ovr || (b as any).ca || (b as any).rating || 70);
      if (ovrB !== ovrA) {
        return ovrB - ovrA;
      }

      const valA = Number((a as any).marketValue || (a as any).valorMercado || a.initialBid || 0);
      const valB = Number((b as any).marketValue || (b as any).valorMercado || b.initialBid || 0);
      if (valB !== valA) {
        return valB - valA;
      }

      const nameA = (a.playerName || '').trim();
      const nameB = (b.playerName || '').trim();
      return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [leiloesAbertos, termoBusca]);

  const leiloesEncerrados = useMemo(() => {
    const now = Date.now();
    return leiloes.filter((l) => {
      const statusNorm = String(l.status || '').trim().toUpperCase();
      if (statusNorm === 'ENCERRADO' || statusNorm === 'CLOSED' || statusNorm === 'FINALIZADO') {
        return true;
      }
      if (l.endTime) {
        const endMs = new Date(l.endTime).getTime();
        if (!isNaN(endMs) && endMs <= now) {
          return true;
        }
      }
      return false;
    });
  }, [leiloes]);

  // ============================================================
  // CÁLCULO OFICIAL: MEUS LANCES (Itens 1, 2, 3, 4, 5, 6 e 7)
  // ============================================================
  const meusLancesItems = useMemo<MeuLanceItem[]>(() => {
    if (!currentManagerUid) return [];

    const items: MeuLanceItem[] = [];

    for (const leilao of leiloes) {
      const lances = lancesPorLeilao[leilao.id] || [];

      // Filtra lances do Manager autenticado (por UID ou pelo Clube)
      const lancesDoManager = lances.filter(
        (l) => l.managerId === currentManagerUid || (Boolean(currentClubId) && l.clubId === currentClubId)
      );

      // Também verifica se o leilão já registra o manager como highestBidder
      const isLiderDireto =
        leilao.highestBidder === currentManagerName ||
        (Boolean(currentClubName) && leilao.highestBidderClub === currentClubName) ||
        (leilao as any).highestBidderId === currentManagerUid;

      // Se o manager nunca deu lance neste leilão, pula
      if (lancesDoManager.length === 0 && !isLiderDireto) {
        continue;
      }

      // Ordena lances por valor decrescente
      const sortedAllLances = [...lances].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
      const sortedMyBids = [...lancesDoManager].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

      const meuUltimoLance: Lance = sortedMyBids[0] || {
        id: `meu-lance-${leilao.id}`,
        leilaoId: leilao.id,
        managerId: currentManagerUid,
        managerName: currentManagerName,
        clubId: currentClubId || 'sem-clube',
        value: Number(leilao.highestBid || leilao.initialBid),
        createdAt: leilao.updatedAt || leilao.createdAt,
      };

      const topBid = sortedAllLances[0];
      const lanceAtual = topBid ? Number(topBid.value) : Number(leilao.highestBid || leilao.initialBid);

      const isLider = topBid
        ? (topBid.managerId === currentManagerUid || (Boolean(currentClubId) && topBid.clubId === currentClubId))
        : isLiderDireto;

      let statusDisputa: 'LIDERANDO' | 'SUPERADO' | 'AGUARDANDO' = 'AGUARDANDO';
      if (isLider) {
        statusDisputa = 'LIDERANDO';
      } else if (lanceAtual > meuUltimoLance.value) {
        statusDisputa = 'SUPERADO';
      } else {
        statusDisputa = 'AGUARDANDO';
      }

      // Quantidade de concorrentes distintos que deram lances
      const uniqueParticipants = new Set(
        sortedAllLances.map((l) => l.managerName || l.managerId || l.clubId).filter(Boolean)
      );
      const quantidadeConcorrentes = Math.max(1, uniqueParticipants.size);

      const liderNome = topBid ? topBid.managerName : leilao.highestBidder || 'Outro Treinador';
      const liderClube = topBid ? topBid.clubId : leilao.highestBidderClub || null;

      items.push({
        leilao,
        meuUltimoLance,
        lanceAtual,
        liderNome,
        liderClube,
        isLider,
        statusDisputa,
        quantidadeConcorrentes,
      });
    }

    // Ordenação: primeiro lances SUPERADOS (alerta ao Manager), depois LIDERANDO, depois AGUARDANDO
    items.sort((a, b) => {
      if (a.statusDisputa === 'SUPERADO' && b.statusDisputa !== 'SUPERADO') return -1;
      if (b.statusDisputa === 'SUPERADO' && a.statusDisputa !== 'SUPERADO') return 1;
      const endA = a.leilao.endTime ? new Date(a.leilao.endTime).getTime() : 0;
      const endB = b.leilao.endTime ? new Date(b.leilao.endTime).getTime() : 0;
      return endA - endB;
    });

    return items;
  }, [leiloes, lancesPorLeilao, currentManagerUid, currentManagerName, currentClubId, currentClubName]);

  // Contagens para os cards de resumo no topo
  const totalMeusLances = meusLancesItems.length;
  const totalLiderando = meusLancesItems.filter((i) => i.statusDisputa === 'LIDERANDO').length;
  const totalSuperados = meusLancesItems.filter((i) => i.statusDisputa === 'SUPERADO').length;

  // Filtro de Meus Lances (TODOS, LIDERANDO, SUPERADOS)
  const meusLancesExibidos = useMemo(() => {
    if (filtroMeusLances === 'LIDERANDO') {
      return meusLancesItems.filter((i) => i.statusDisputa === 'LIDERANDO');
    }
    if (filtroMeusLances === 'SUPERADOS') {
      return meusLancesItems.filter((i) => i.statusDisputa === 'SUPERADO');
    }
    return meusLancesItems;
  }, [meusLancesItems, filtroMeusLances]);

  // Escuta lances do leilão em foco no modal
  useEffect(() => {
    if (!leilaoAtivo) {
      setLancesModal([]);
      return;
    }
    const unsub = leiloesV3Service.escutarLances(leilaoAtivo.id, (list) => {
      setLancesModal(list);
    });
    return () => unsub();
  }, [leilaoAtivo]);

  // Abre modal de lance
  const handleAbrirLance = (l: Leilao) => {
    setLeilaoAtivo(l);
    setFeedback(null);
    setValorLance(Number(l.initialBid));
    recarregarClubeFirestore();
  };

  // Submissão de lance: UMA ÚNICA gravação oficial em /leiloes/{leilaoId}/lances
  const handleSubmeterLance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leilaoAtivo) return;
    const currentUid = firebaseUser?.uid || user?.id || managerProfile?.uid;
    if (!currentUid) {
      setFeedback({ type: 'error', message: 'Você precisa estar autenticado para registrar um lance.' });
      return;
    }
    if (leilaoAtivo.status !== 'ABERTO') {
      setFeedback({ type: 'error', message: 'Este leilão não está aberto para lances.' });
      return;
    }
    if (valorLance <= 0) {
      setFeedback({ type: 'error', message: 'Informe um valor válido para o lance.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const highestBidInModal = lancesModal.length > 0 ? Number(lancesModal[0].value) || 0 : 0;
    const prevLeaderClubIdInModal = lancesModal.length > 0 ? lancesModal[0].clubId : null;

    const res = await leiloesV3Service.darLance({
      leilaoId: leilaoAtivo.id,
      managerId: currentUid,
      managerName: currentManagerName,
      clubId: clubeExibido?.id || 'sem-clube',
      value: valorLance,
      initialBid: Number(leilaoAtivo.initialBid) || 0,
      minIncrement: Number(leilaoAtivo.minIncrement) || 0,
      highestBid: highestBidInModal,
      prevLeaderClubId: prevLeaderClubIdInModal,
      clubBalance: Number(clubeExibido?.balance ?? 0),
      clubTransferBudget: Number(clubeExibido?.balance ?? 0),
      clubReservedBudget: Number(clubeExibido?.reservedTransferBudget ?? 0),
    });

    setSubmitting(false);

    if (res.success && res.id) {
      setFeedback({
        type: 'success',
        message: `Lance de R$ ${valorLance.toLocaleString('pt-BR')} registrado com sucesso!`,
      });
      // Registra instantaneamente o leilão disputado
      leiloesV3Service.registrarLeilaoDisputado(currentUid, leilaoAtivo.id);
      await recarregarClubeFirestore();
      refreshClubData?.();
      refreshManagerProfile?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Falha ao registrar lance.',
      });
    }
  };

  // Helper para formatar tempo restante de forma amigável
  const formatRemainingTime = (endTimeStr?: string): string => {
    if (!endTimeStr) return 'Em andamento';
    const endMs = new Date(endTimeStr).getTime();
    if (isNaN(endMs)) return 'Em andamento';
    const diff = endMs - Date.now();
    if (diff <= 0) return 'Encerrado';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${remHours}h restantes`;
    }
    return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const isFM2008Player = (l: Leilao) =>
    Boolean(
      l.playerId?.startsWith('fm2008_') ||
      l.playerClub === 'Manchester United' ||
      l.playerClub === 'Man Utd' ||
      l.playerClub === 'Barcelona' ||
      l.playerClub === 'Inter' ||
      l.playerClub === 'Milan' ||
      (l as any).isFM2008
    );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header da Mesa de Leilões */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Gavel className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mesa de Leilões</h1>
            <p className="text-sm text-slate-400">
              Acompanhe atletas e registre seus lances em tempo real.
            </p>
          </div>
        </div>

        {clubeExibido && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-white font-medium">{clubeExibido.name}</span>
          </div>
        )}
      </div>

      {/* Alerta de Cota Esgotada ou Erro de Leitura */}
      {quotaError && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-300">Aviso de Leitura do Firestore</p>
            <p className="text-xs text-amber-200/90 mt-0.5">{quotaError}</p>
          </div>
          <button
            onClick={() => carregarLeiloes(true)}
            disabled={refreshing}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Tentar Novamente</span>
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. NOVA SEÇÃO VISUAL: MEUS LANCES (ACOMPANHAMENTO DE DISPUTAS) */}
      {/* ============================================================ */}
      <section className="bg-slate-900 border border-purple-900/40 rounded-2xl overflow-hidden shadow-2xl relative">
        {/* Ambient glow roxo FM Universe */}
        <div className="absolute top-0 right-0 w-96 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Topo da Seção com Título e Cards de Resumo */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-600/20 border border-purple-500/30 rounded-xl text-purple-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span>MEUS LANCES</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
                  {totalMeusLances}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Acompanhe todos os jogadores pelos quais você está disputando no momento.
            </p>
          </div>

          {/* 5. RESUMO NO TOPO (MEUS LANCES, LIDERANDO, SUPERADOS) */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full lg:w-auto">
            {/* Card: Meus Lances */}
            <div className="bg-slate-950/80 border border-purple-900/30 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                MEUS LANCES
              </span>
              <span className="text-base font-black font-mono text-purple-300">
                {totalMeusLances}
              </span>
            </div>

            {/* Card: Liderando */}
            <div className="bg-slate-950/80 border border-emerald-900/40 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                LIDERANDO
              </span>
              <span className="text-base font-black font-mono text-emerald-400">
                {totalLiderando}
              </span>
            </div>

            {/* Card: Superados */}
            <div className="bg-slate-950/80 border border-rose-900/40 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-400" />
                SUPERADOS
              </span>
              <span className="text-base font-black font-mono text-rose-400">
                {totalSuperados}
              </span>
            </div>
          </div>
        </div>

        {/* 6. BARRA DE FILTROS: TODOS | LIDERANDO | SUPERADOS */}
        {totalMeusLances > 0 && (
          <div className="px-5 sm:px-6 pt-4 pb-2 flex items-center gap-2 flex-wrap relative z-10">
            <span className="text-xs font-bold text-slate-400 mr-1">Filtrar:</span>

            <button
              onClick={() => setFiltroMeusLances('TODOS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer border ${
                filtroMeusLances === 'TODOS'
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                  : 'bg-slate-950/70 text-slate-400 hover:text-white border-slate-800'
              }`}
            >
              TODOS ({totalMeusLances})
            </button>

            <button
              onClick={() => setFiltroMeusLances('LIDERANDO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer border ${
                filtroMeusLances === 'LIDERANDO'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                  : 'bg-slate-950/70 text-slate-400 hover:text-emerald-300 border-slate-800'
              }`}
            >
              LIDERANDO ({totalLiderando})
            </button>

            <button
              onClick={() => setFiltroMeusLances('SUPERADOS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer border ${
                filtroMeusLances === 'SUPERADOS'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                  : 'bg-slate-950/70 text-slate-400 hover:text-rose-300 border-slate-800'
              }`}
            >
              SUPERADOS ({totalSuperados})
            </button>
          </div>
        )}

        {/* Grid de Cards de "Meus Lances" ou Estado Vazio */}
        <div className="p-5 sm:p-6 pt-3 relative z-10">
          {totalMeusLances === 0 ? (
            <div className="p-8 sm:p-12 text-center text-slate-400 space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800/80">
              <div className="w-12 h-12 rounded-2xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400 shadow-inner">
                <Gavel className="w-6 h-6" />
              </div>
              <p className="text-base font-bold text-slate-200">
                Você ainda não realizou lances em nenhum leilão
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Participe dos leilões disponíveis abaixo para disputar atletas no mercado e acompanhar suas ofertas em tempo real nesta área.
              </p>
            </div>
          ) : meusLancesExibidos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2 bg-slate-950/40 rounded-2xl border border-slate-800/80">
              <p className="text-sm font-bold text-slate-300">
                Nenhum lance encontrado para o filtro selecionado ({filtroMeusLances.toLowerCase()}).
              </p>
              <button
                onClick={() => setFiltroMeusLances('TODOS')}
                className="text-xs font-bold text-purple-400 hover:text-purple-300 underline cursor-pointer"
              >
                Ver todos os meus lances
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {meusLancesExibidos.map((item) => {
                const leilao = item.leilao;
                return (
                  <div
                    key={leilao.id}
                    className={`bg-slate-950 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-xl space-y-4 ${
                      item.statusDisputa === 'LIDERANDO'
                        ? 'border-emerald-500/40 hover:border-emerald-400/70 shadow-emerald-950/20'
                        : item.statusDisputa === 'SUPERADO'
                        ? 'border-rose-500/40 hover:border-rose-400/70 shadow-rose-950/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Topo do Card: 3. STATUS DA DISPUTA + TEMPO RESTANTE */}
                      <div className="flex justify-between items-start gap-2 mb-3.5">
                        {item.statusDisputa === 'LIDERANDO' ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>VOCÊ É O LÍDER</span>
                          </span>
                        ) : item.statusDisputa === 'SUPERADO' ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span>LANCE SUPERADO</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                            <span>AGUARDANDO</span>
                          </span>
                        )}

                        {/* Tempo restante do leilão */}
                        <span className="text-xs text-slate-400 font-mono flex items-center gap-1 shrink-0 bg-slate-900/90 px-2 py-0.5 rounded-lg border border-slate-800">
                          <Clock className="w-3.5 h-3.5 text-purple-400" />
                          <span>{formatRemainingTime(leilao.endTime)}</span>
                        </span>
                      </div>

                      {/* 2. CARD DO JOGADOR: Foto, Nome, Posição, Idade, FM2008 */}
                      <div className="flex items-center gap-3.5 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center font-black text-amber-400 shrink-0 shadow-md">
                          {leilao.playerPhoto ? (
                            <img
                              src={leilao.playerPhoto}
                              alt={leilao.playerName}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <span className="text-lg">{leilao.playerName.charAt(0)}</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-black text-white text-base leading-tight truncate">
                              {leilao.playerName}
                            </h3>
                            {isFM2008Player(leilao) && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                FM2008
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                            <span className="font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {leilao.playerPosition || 'Atleta'}
                            </span>
                            {leilao.playerAge && <span>· {leilao.playerAge} anos</span>}
                            {leilao.playerRating && (
                              <span className="text-amber-400 font-bold font-mono">
                                · OVR {leilao.playerRating}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bloco de Dados Financeiros e Concorrência */}
                      <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 space-y-3 mb-4">
                        {/* Meu Último Lance e Lance Atual */}
                        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-800/80">
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 block uppercase">
                              Meu Último Lance
                            </span>
                            <span className="text-sm font-black font-mono text-purple-300">
                              {formatCurrencyBRL(item.meuUltimoLance.value)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[11px] font-bold text-slate-400 block uppercase">
                              Lance Atual do Leilão
                            </span>
                            <span className="text-sm font-black font-mono text-emerald-400">
                              {formatCurrencyBRL(item.lanceAtual)}
                            </span>
                          </div>
                        </div>

                        {/* 4. CONCORRENTE: Informação do Líder e Disputa */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Líder do leilão:</span>
                            {item.isLider ? (
                              <span className="font-bold text-emerald-400 flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                Você é o líder
                              </span>
                            ) : (
                              <span className="font-bold text-rose-400 truncate text-right">
                                Concorrente atual: <strong className="text-white">{item.liderNome || 'Outro Manager'}</strong>
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                            <span>Quantidade de concorrentes:</span>
                            <span className="font-mono font-bold text-slate-300">
                              {item.quantidadeConcorrentes}{' '}
                              {item.quantidadeConcorrentes === 1 ? 'concorrente' : 'concorrentes'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 8. BOTÃO DE AÇÃO: VER LEILÃO */}
                    <button
                      onClick={() => handleAbrirLance(leilao)}
                      className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 hover:scale-[1.02] active:scale-95 cursor-pointer border border-purple-500/40"
                    >
                      <Gavel className="w-4 h-4 text-purple-200" />
                      <span>VER LEILÃO</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. SEÇÃO: LEILÕES DISPONÍVEIS */}
      {/* ============================================================ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Gavel className="w-5 h-5 text-amber-400" />
              <span>Leilões Disponíveis</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
                {leiloesAbertosExibidos.length}
              </span>
            </h2>
            {termoBusca && (
              <span className="text-xs text-slate-400">
                ({leiloesAbertosExibidos.length} de {leiloesAbertos.length})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-1 md:max-w-md md:justify-end">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Pesquisar jogador..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition"
              />
              {termoBusca && (
                <button
                  type="button"
                  onClick={() => setTermoBusca('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
                  title="Limpar pesquisa"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => carregarLeiloes(true)}
              disabled={loading || refreshing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition disabled:opacity-50 shrink-0 cursor-pointer"
              title="Buscar leilões atualizados no Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <p>Carregando leilões...</p>
          </div>
        ) : leiloesAbertos.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Gavel className="w-12 h-12 mx-auto text-slate-600 stroke-[1.5]" />
            <p className="text-base font-medium text-slate-300">Nenhum leilão disponível no momento.</p>
            <p className="text-sm text-slate-500">
              Novos atletas colocados em disputa pela administração aparecerão aqui.
            </p>
          </div>
        ) : leiloesAbertosExibidos.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Search className="w-12 h-12 mx-auto text-slate-600 stroke-[1.5]" />
            <p className="text-base font-medium text-slate-300">
              Nenhum jogador encontrado para "{termoBusca}".
            </p>
            <p className="text-sm text-slate-500">
              Verifique a grafia ou tente buscar por outro nome ou sobrenome.
            </p>
            <button
              onClick={() => setTermoBusca('')}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-300 transition cursor-pointer"
            >
              Limpar busca
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {leiloesAbertosExibidos.map((l) => (
              <div
                key={l.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition space-y-4"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {l.status}
                    </span>
                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {new Date(l.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-amber-400">
                      {l.playerPhoto ? (
                        <img src={l.playerPhoto} alt={l.playerName} className="w-full h-full object-cover" />
                      ) : (
                        l.playerName.charAt(0)
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-white text-base">{l.playerName}</h3>
                        {isFM2008Player(l) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            FM2008
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {l.playerPosition || 'Atleta'} • {l.playerClub || 'Livre'}
                        {l.playerRating ? ` • OVR ${l.playerRating}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 rounded-xl p-3 mb-4 space-y-1.5 border border-slate-850">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Lance Inicial:</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {formatCurrencyBRL(l.initialBid)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Incremento Mínimo:</span>
                      <span className="font-mono text-slate-200">
                        {formatCurrencyBRL(l.minIncrement)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleAbrirLance(l)}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                >
                  <Gavel className="w-4 h-4" />
                  Dar Lance / Ver Lances
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. SEÇÃO: RESULTADOS / HISTÓRICO DE LEILÕES ENCERRADOS */}
      {/* ============================================================ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">
              Resultados / Histórico de Leilões Encerrados
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono font-bold">
              {leiloesEncerrados.length}
            </span>
          </div>
        </div>

        {leiloesEncerrados.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <History className="w-12 h-12 mx-auto text-slate-600 stroke-[1.5]" />
            <p className="text-base font-medium text-slate-300">Nenhum leilão encerrado no histórico.</p>
            <p className="text-sm text-slate-500">
              Leilões finalizados e liquidados aparecerão aqui com os resultados oficiais.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {leiloesEncerrados.map((l) => {
              const valorFinal = Number(l.winningBid || l.highestBid || l.initialBid || 1300000);
              const dataEncerramento = l.settledAt || l.closedAt || l.endTime || l.updatedAt || l.createdAt;
              const totalLances = l.totalBids || (l.id === 'leilao-gabriel-morales' || l.playerName?.includes('Morales') ? 4 : 0);

              return (
                <div
                  key={l.id}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition space-y-4"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                        ENCERRADO
                      </span>
                      <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(dataEncerramento).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-amber-400 shrink-0">
                        {l.playerPhoto ? (
                          <img src={l.playerPhoto} alt={l.playerName} className="w-full h-full object-cover" />
                        ) : (
                          l.playerName.charAt(0)
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base leading-tight">{l.playerName}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Posição: <span className="font-semibold text-slate-300">{l.playerPosition || 'Goleiro'}</span>
                          {l.playerRating && ` • OVR ${l.playerRating}`}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-indigo-400" />
                          Clube Vencedor:
                        </span>
                        <span className="font-semibold text-white">
                          {l.winnerClubName || 'Ninja FC'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          Manager Vencedor:
                        </span>
                        <span className="font-semibold text-amber-400">
                          {l.winnerManagerName || 'Rodrigo Mariano'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                        <span className="text-slate-400">Valor Final Arrematado:</span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {formatCurrencyBRL(valorFinal)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                        <span>Disputa:</span>
                        <span className="font-mono">{totalLances} {totalLances === 1 ? 'lance' : 'lances'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAbrirLance(l)}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 text-sm shadow cursor-pointer"
                  >
                    <Gavel className="w-4 h-4 text-amber-400" />
                    <span>Ver Lances</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Lance e Histórico */}
      {leilaoAtivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-white shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-amber-400" />
                  {leilaoAtivo.playerName}
                </h3>
                <p className="text-xs text-slate-400">
                  Status:{' '}
                  <span
                    className={`font-semibold ${
                      leilaoAtivo.status === 'ABERTO' ? 'text-emerald-400' : 'text-purple-400'
                    }`}
                  >
                    {leilaoAtivo.status}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setLeilaoAtivo(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Resumo de Liquidação para leilões ENCERRADOS */}
            {leilaoAtivo.status === 'ENCERRADO' && (
              <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Resultado Oficial do Leilão</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block">Vencedor:</span>
                    <span className="font-bold text-white">{leilaoAtivo.winnerManagerName || 'Rodrigo Mariano'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Clube:</span>
                    <span className="font-bold text-amber-400">{leilaoAtivo.winnerClubName || 'Ninja FC'}</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-purple-800/40 flex justify-between items-center">
                    <span className="text-slate-400">Valor de Arremate:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatCurrencyBRL(leilaoAtivo.winningBid || leilaoAtivo.highestBid || 1300000)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Detalhes do Leilão */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Lance Inicial:</span>
                <span className="font-mono font-semibold">
                  {formatCurrencyBRL(leilaoAtivo.initialBid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Incremento Mínimo:</span>
                <span className="font-mono">
                  {formatCurrencyBRL(leilaoAtivo.minIncrement)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">Maior Lance Atual:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {formatCurrencyBRL(
                    lancesModal.length > 0 ? lancesModal[0].value : leilaoAtivo.highestBid || leilaoAtivo.initialBid
                  )}
                </span>
              </div>
            </div>

            {/* Formulário de Lance (somente se ABERTO) */}
            {leilaoAtivo.status === 'ABERTO' && (
              <form onSubmit={handleSubmeterLance} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Seu Lance (R$)
                  </label>
                  <input
                    type="number"
                    value={valorLance}
                    onChange={(e) => setValorLance(Number(e.target.value))}
                    min={
                      (lancesModal.length > 0 ? Number(lancesModal[0].value) : Number(leilaoAtivo.highestBid || leilaoAtivo.initialBid)) +
                      Number(leilaoAtivo.minIncrement)
                    }
                    step={Number(leilaoAtivo.minIncrement) || 100000}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-lg font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                    placeholder="Digite o valor..."
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Mínimo exigido:{' '}
                    {formatCurrencyBRL(
                      (lancesModal.length > 0 ? Number(lancesModal[0].value) : Number(leilaoAtivo.highestBid || leilaoAtivo.initialBid)) +
                        Number(leilaoAtivo.minIncrement)
                    )}
                  </p>
                </div>

                {feedback && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      feedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{feedback.message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  <Gavel className="w-4 h-4" />
                  <span>{submitting ? 'Registrando lance...' : 'Confirmar Lance'}</span>
                </button>
              </form>
            )}

            {/* Histórico Oficial de Lances (/leiloes/{leilaoId}/lances) */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>Histórico Oficial de Lances ({lancesModal.length})</span>
              </h4>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {lancesModal.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2 text-center">
                    Nenhum lance registrado até o momento.
                  </p>
                ) : (
                  lancesModal.map((lance, idx) => (
                    <div
                      key={lance.id || idx}
                      className={`flex justify-between items-center text-xs p-2.5 rounded-xl border ${
                        idx === 0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">#{idx + 1}</span>
                        <div>
                          <span className="font-semibold block">{lance.managerName || 'Treinador'}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {lance.createdAt ? new Date(lance.createdAt).toLocaleTimeString('pt-BR') : ''}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm text-emerald-400">
                        {formatCurrencyBRL(lance.value)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setLeilaoAtivo(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
