import React, { useState, useEffect, useMemo } from 'react';
import {
  Gavel,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Shield,
  Eye,
  RefreshCw,
  XCircle,
  Zap,
  CheckSquare,
  Square,
  Filter,
  Layers,
} from 'lucide-react';
import { leiloesV3Service, cleanSearchText } from '../../services/leiloesV3Service';
import { jogadoresService } from '../../services/jogadoresService';
import { Leilao, Lance, LeilaoStatus, CriarLeiloesEmMassaResult } from '../../types/leiloesV3';
import { Player } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export const AdminLeiloesV3Page: React.FC = () => {
  const { firebaseUser, user } = useAuth();

  // Estados dos Leilões (/leiloes)
  const [leiloes, setLeiloes] = useState<Leilao[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados do Modal de Criação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jogadores, setJogadores] = useState<Player[]>([]);
  const [loadingJogadores, setLoadingJogadores] = useState(false);
  const [filtroJogador, setFiltroJogador] = useState('');
  const [jogadorSelecionado, setJogadorSelecionado] = useState<Player | null>(null);
  const [initialBid, setInitialBid] = useState<number>(1000000);
  const [minIncrement, setMinIncrement] = useState<number>(100000);
  const [startTime, setStartTime] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [endTime, setEndTime] = useState<string>(() => {
    const now = new Date();
    now.setHours(now.getHours() + 24);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  // Modal de Visualização de Lances
  const [leilaoSelecionado, setLeilaoSelecionado] = useState<Leilao | null>(null);
  const [lancesModal, setLancesModal] = useState<Lance[]>([]);

  // Modal de Confirmação de Alteração de Status (substitui window.confirm bloqueado no iFrame)
  const [confirmModal, setConfirmModal] = useState<{
    leilaoId: string;
    nomeJogador: string;
    novoStatus: LeilaoStatus;
  } | null>(null);

  // Estados do Modal de Criação em Massa (⚡ CRIAR LEILÕES EM MASSA)
  const [isMassModalOpen, setIsMassModalOpen] = useState(false);
  const [loadingMass, setLoadingMass] = useState(false);
  const [massActionLoading, setMassActionLoading] = useState(false);
  const [massJogadores, setMassJogadores] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [filtroMassBusca, setFiltroMassBusca] = useState('');
  const [filtroMassPosicao, setFiltroMassPosicao] = useState<'ALL' | 'GK' | 'DEF' | 'MID' | 'ATT'>('ALL');
  const [filtroMassOvrMin, setFiltroMassOvrMin] = useState<number>(0);

  // Configuração do lote (Incremento mínimo e Encerramento)
  const [massMinIncrement, setMassMinIncrement] = useState<number>(100000);
  const [massEndTime, setMassEndTime] = useState<string>(() => {
    const now = new Date();
    now.setHours(now.getHours() + 24);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  // Confirmação e Resumo do Lote
  const [massConfirmModal, setMassConfirmModal] = useState<boolean>(false);
  const [massResultDetails, setMassResultDetails] = useState<CriarLeiloesEmMassaResult | null>(null);

  // Identifica jogadores que já possuem leilão ativo (ABERTO ou AGENDADO)
  const activeAuctionPlayerIds = useMemo(() => {
    const set = new Set<string>();
    leiloes.forEach((l) => {
      if (l.status === 'ABERTO' || l.status === 'AGENDADO') {
        set.add(l.playerId);
      }
    });
    return set;
  }, [leiloes]);

  // Lista filtrada em memória de atletas Sem Clube para criação em massa (pesquisa na base completa)
  const [massPaginaAtual, setMassPaginaAtual] = useState<number>(1);
  const ITENS_POR_PAGINA = 100;

  // Reseta a página para 1 quando os filtros mudam
  useEffect(() => {
    setMassPaginaAtual(1);
  }, [filtroMassBusca, filtroMassPosicao, filtroMassOvrMin]);

  const jogadoresSemClubeFiltrados = useMemo(() => {
    return massJogadores.filter((p) => {
      // 1. Busca textual abrangente (nome, sobrenome, apelido, posições, nacionalidade, OVR, clube de origem)
      if (filtroMassBusca.trim()) {
        const rawQ = cleanSearchText(filtroMassBusca);
        const numQ = parseInt(rawQ, 10);
        const isOvrSearch = !isNaN(numQ) && numQ >= 40 && numQ <= 200;

        const playerOvr = p.overall || (p as any).ca || 70;
        if (isOvrSearch && (playerOvr === numQ || String(playerOvr) === rawQ)) {
          // Corresponde a OVR exato
        } else {
          const terms = rawQ.split(/[\s,]+/).filter(Boolean);
          const searchable = cleanSearchText([
            p.name,
            p.fullName,
            (p as any).nome,
            (p as any).nomeCompleto,
            (p as any).originalName,
            p.knownAs,
            p.shortName,
            (p as any).nickname,
            p.position,
            (p as any).posicao,
            ...(p.secondaryPositions || []),
            p.positionCategory,
            p.nationality,
            (p as any).nacionalidade,
            p.nationalityCode,
            (p as any).fm2008_clube_origem,
            (p as any).originClub,
            String(p.overall || (p as any).ca || ''),
            String(p.potential || (p as any).pa || ''),
          ].filter(Boolean).join(' '));

          const matchesAllTerms = terms.every((term) => searchable.includes(term));
          if (!matchesAllTerms) return false;
        }
      }

      // 2. Filtro por Categoria de Posição (GK, DEF, MID, ATT) compatível com FM e FM2008
      if (filtroMassPosicao !== 'ALL') {
        const cat = (p.positionCategory || '').toUpperCase();
        const pos = (p.position || (p as any).posicao || '').toUpperCase();
        if (filtroMassPosicao === 'GK') {
          if (cat !== 'GK' && pos !== 'GK') return false;
        } else if (filtroMassPosicao === 'DEF') {
          const isDef =
            cat === 'DEF' ||
            ['CB', 'LB', 'RB', 'DF', 'DC', 'DL', 'DR', 'SW', 'LWB', 'RWB', 'D C', 'D L', 'D R', 'D RL', 'D LC', 'D RC', 'D RLC', 'WB L', 'WB R', 'WB RL'].some((s) => pos.includes(s));
          if (!isDef) return false;
        } else if (filtroMassPosicao === 'MID') {
          const isMid =
            cat === 'MID' ||
            ['MC', 'DM', 'AM', 'ML', 'MR', 'CM', 'CDM', 'CAM', 'LM', 'RM', 'AMC', 'M C', 'M L', 'M R', 'M RC', 'M LC', 'M RLC', 'AM C', 'AM L', 'AM R', 'AM RL', 'AM LC', 'AM RC', 'AM RLC'].some((s) => pos.includes(s));
          if (!isMid) return false;
        } else if (filtroMassPosicao === 'ATT') {
          const isAtt =
            cat === 'ATT' ||
            ['ST', 'CF', 'LW', 'RW', 'FW', 'SS', 'AML', 'AMR', 'F C', 'FS', 'TS'].some((s) => pos.includes(s));
          if (!isAtt) return false;
        }
      }

      // 3. Filtro por OVR mínimo
      const playerOvr = p.overall || (p as any).ca || 70;
      if (filtroMassOvrMin > 0 && playerOvr < filtroMassOvrMin) {
        return false;
      }

      return true;
    });
  }, [massJogadores, filtroMassBusca, filtroMassPosicao, filtroMassOvrMin]);

  // Paginação e corte estrito para exibição controlada (máximo 100 itens renderizados no DOM)
  const totalFiltrados = jogadoresSemClubeFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrados / ITENS_POR_PAGINA));
  const startIndex = (massPaginaAtual - 1) * ITENS_POR_PAGINA;
  const jogadoresExibidos = useMemo(() => {
    return jogadoresSemClubeFiltrados.slice(startIndex, startIndex + ITENS_POR_PAGINA);
  }, [jogadoresSemClubeFiltrados, startIndex]);

  // Atletas elegíveis da página visível atualmente (que NÃO possuem leilão ativo)
  const jogadoresElegiveisPagina = useMemo(() => {
    return jogadoresExibidos.filter((p) => !activeAuctionPlayerIds.has(p.id));
  }, [jogadoresExibidos, activeAuctionPlayerIds]);

  // Escuta leilões em tempo real de /leiloes
  useEffect(() => {
    setLoading(true);
    const unsub = leiloesV3Service.escutarLeiloes((list) => {
      setLeiloes(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Escuta lances do leilão aberto no modal
  useEffect(() => {
    if (!leilaoSelecionado) {
      setLancesModal([]);
      return;
    }
    const unsub = leiloesV3Service.escutarLances(leilaoSelecionado.id, (list) => {
      setLancesModal(list);
    });
    return () => unsub();
  }, [leilaoSelecionado]);

  // Carrega catálogo de jogadores para o modal de criação
  const carregarJogadores = async () => {
    if (jogadores.length > 0) return;
    setLoadingJogadores(true);
    try {
      const lista = await jogadoresService.getAll();
      setJogadores(lista || []);
    } catch (err) {
      console.warn('Erro ao carregar catálogo de jogadores:', err);
    } finally {
      setLoadingJogadores(false);
    }
  };

  const handleOpenCreateModal = () => {
    setIsModalOpen(true);
    carregarJogadores();
  };

  // Criação de Leilão: UMA ÚNICA gravação em /leiloes
  const handleCriarLeilao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jogadorSelecionado) {
      setFeedback({ type: 'error', message: 'Selecione um jogador para o leilão.' });
      return;
    }
    const adminUid = firebaseUser?.uid || user?.id || 'admin-master';
    if (!adminUid) {
      setFeedback({ type: 'error', message: 'Administrador não autenticado.' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    const res = await leiloesV3Service.criarLeilao({
      playerId: jogadorSelecionado.id,
      playerName: jogadorSelecionado.name,
      initialBid: Number(initialBid),
      minIncrement: Number(minIncrement),
      startTime,
      endTime,
      status: 'ABERTO',
      createdBy: adminUid,
      playerAge: jogadorSelecionado.age,
      playerClub: jogadorSelecionado.clubName || 'Sem clube',
      playerPosition: jogadorSelecionado.position,
      playerRating: jogadorSelecionado.overall || 70,
      playerPhoto: jogadorSelecionado.photoUrl || null,
    });

    setActionLoading(false);

    if (res.success && res.id) {
      setFeedback({
        type: 'success',
        message: `Leilão de ${jogadorSelecionado.name} criado com sucesso em /leiloes/${res.id}!`,
      });
      setIsModalOpen(false);
      setJogadorSelecionado(null);
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Falha ao criar leilão.',
      });
    }
  };

  // Abre a confirmação visual na interface (substitui window.confirm bloqueado no iFrame)
  const solicitarMudarStatus = (leilaoId: string, nomeJogador: string, novoStatus: LeilaoStatus) => {
    setConfirmModal({
      leilaoId,
      nomeJogador,
      novoStatus,
    });
  };

  // Executa a alteração de status existente após confirmação no modal
  const executarMudarStatus = async () => {
    if (!confirmModal) return;
    const { leilaoId, novoStatus } = confirmModal;
    setConfirmModal(null);

    setActionLoading(true);
    const res = await leiloesV3Service.atualizarStatus(leilaoId, novoStatus);
    setActionLoading(false);

    if (res.success) {
      setFeedback({ type: 'success', message: `Status do leilão alterado para "${novoStatus}".` });
    } else {
      setFeedback({ type: 'error', message: res.error || 'Falha ao atualizar status.' });
    }
  };

  // Abre o modal de criação em massa e carrega a base completa de jogadores Sem Clube
  const handleOpenMassModal = async () => {
    setIsMassModalOpen(true);
    setMassResultDetails(null);
    setMassConfirmModal(false);
    setSelectedPlayerIds(new Set());
    setMassPaginaAtual(1);
    setLoadingMass(true);
    try {
      const list = await leiloesV3Service.buscarJogadoresSemClube({ getAll: true });
      setMassJogadores(list || []);
    } catch (err) {
      console.warn('Erro ao carregar atletas sem clube:', err);
    } finally {
      setLoadingMass(false);
    }
  };

  // Alterna seleção de um jogador individual
  const handleTogglePlayer = (playerId: string) => {
    if (activeAuctionPlayerIds.has(playerId)) return;
    const next = new Set(selectedPlayerIds);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      next.add(playerId);
    }
    setSelectedPlayerIds(next);
  };

  // Alterna selecionar todos os jogadores visíveis e elegíveis da página atual
  const handleToggleSelectAll = () => {
    const elegiveisIds = jogadoresElegiveisPagina.map((p) => p.id);
    const areAllSelected =
      elegiveisIds.length > 0 && elegiveisIds.every((id) => selectedPlayerIds.has(id));

    const next = new Set(selectedPlayerIds);
    if (areAllSelected) {
      elegiveisIds.forEach((id) => next.delete(id));
    } else {
      elegiveisIds.forEach((id) => next.add(id));
    }
    setSelectedPlayerIds(next);
  };

  // Executa a criação dos leilões em massa via writeBatch
  const handleExecutarCriarLeiloesEmMassa = async () => {
    if (selectedPlayerIds.size === 0) return;
    const adminUid = firebaseUser?.uid || user?.id || 'admin-master';

    setMassActionLoading(true);
    try {
      const selecionados = massJogadores.filter((p) => selectedPlayerIds.has(p.id));
      const res = await leiloesV3Service.criarLeiloesEmMassa({
        jogadores: selecionados.map((p) => {
          const valorMercado = Math.max(10000, Number(p.marketValue || 1000000));
          return {
            playerId: p.id,
            playerName: p.name,
            playerAge: p.age,
            playerClub: 'Sem Clube',
            playerPosition: p.position,
            playerRating: p.overall || 70,
            playerPhoto: p.photoUrl || null,
            marketValue: valorMercado,
            initialBid: valorMercado,
          };
        }),
        minIncrement: Number(massMinIncrement || 100000),
        endTime: massEndTime,
        createdBy: adminUid,
      });

      setMassResultDetails(res);
      setMassConfirmModal(false);

      if (res.totalCriados > 0) {
        setFeedback({
          type: 'success',
          message: `${res.totalCriados} leilão(ões) criado(s) com sucesso na coleção /leiloes!`,
        });
      } else if (res.totalFalhas > 0) {
        setFeedback({
          type: 'error',
          message: `Nenhum leilão pôde ser criado. Verifique as restrições indicadas.`,
        });
      }
    } catch (err: unknown) {
      console.error('Erro na criação em lote de leilões:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: `Falha na criação em lote: ${msg}` });
    } finally {
      setMassActionLoading(false);
    }
  };

  const jogadoresFiltrados = jogadores.filter((p) => {
    if (!filtroJogador) return true;
    const q = filtroJogador.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.knownAs || '').toLowerCase().includes(q) ||
      (p.position || '').toLowerCase().includes(q) ||
      (p.clubName || '').toLowerCase().includes(q) ||
      (p.databaseSource || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Gavel className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leilões (Painel Administrativo)</h1>
            <p className="text-sm text-slate-400">
              Coleção isolada em <code className="text-amber-400 font-mono text-xs">/leiloes</code> e lances em <code className="text-amber-400 font-mono text-xs">/leiloes/[id]/lances</code>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            id="btn-abrir-criar-leiloes-em-massa"
            onClick={handleOpenMassModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold rounded-xl transition-all shadow-lg hover:shadow-amber-500/10 active:scale-95 cursor-pointer"
          >
            <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
            <span>⚡ CRIAR LEILÕES EM MASSA</span>
          </button>

          <button
            id="btn-abrir-criar-leilao"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl transition-all shadow-lg hover:shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Leilão</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/40 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 uppercase tracking-wider font-bold"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Tabela de Leilões */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>Leilões Cadastrados</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {leiloes.length}
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <p>Carregando leilões em tempo real...</p>
          </div>
        ) : leiloes.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Gavel className="w-12 h-12 mx-auto text-slate-600 stroke-[1.5]" />
            <p className="text-base font-medium text-slate-300">Nenhum leilão cadastrado em /leiloes.</p>
            <p className="text-sm text-slate-500">
              Clique em "Novo Leilão" para publicar o primeiro jogador.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                  <th className="p-4 font-medium">Jogador</th>
                  <th className="p-4 font-medium">Posição / Idade</th>
                  <th className="p-4 font-medium">Lance Inicial</th>
                  <th className="p-4 font-medium">Incremento Mínimo</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Período</th>
                  <th className="p-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {leiloes.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-amber-400">
                          {l.playerPhoto ? (
                            <img src={l.playerPhoto} alt={l.playerName} className="w-full h-full object-cover" />
                          ) : (
                            l.playerName.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-white">{l.playerName}</p>
                            {(l.playerId?.startsWith('fm2008_') || l.playerClub === 'Manchester United' || l.playerClub === 'Man Utd' || l.playerClub === 'Barcelona' || l.playerClub === 'Inter' || l.playerClub === 'Milan') && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                FM2008
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{l.playerClub || 'Livre'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
                        {l.playerPosition || 'N/A'}
                      </span>
                      {l.playerAge ? (
                        <span className="text-xs text-slate-400 ml-2">{l.playerAge} anos</span>
                      ) : null}
                    </td>

                    <td className="p-4">
                      <p className="font-semibold text-emerald-400 font-mono">
                        R$ {Number(l.initialBid).toLocaleString('pt-BR')}
                      </p>
                    </td>

                    <td className="p-4 font-mono text-slate-300">
                      R$ {Number(l.minIncrement).toLocaleString('pt-BR')}
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          l.status === 'ABERTO'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : l.status === 'AGENDADO'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : l.status === 'ENCERRADO'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>

                    <td className="p-4 text-xs text-slate-400 font-mono">
                      <div>Fim: {new Date(l.endTime).toLocaleString('pt-BR')}</div>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setLeilaoSelecionado(l)}
                          title="Ver lances"
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Lances
                        </button>

                        {l.status === 'ABERTO' && (
                          <>
                            <button
                              id={`btn-encerrar-leilao-${l.id}`}
                              onClick={() => solicitarMudarStatus(l.id, l.playerName, 'ENCERRADO')}
                              disabled={actionLoading}
                              title="Encerrar leilão"
                              className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
                            >
                              Encerrar
                            </button>
                            <button
                              id={`btn-cancelar-leilao-${l.id}`}
                              onClick={() => solicitarMudarStatus(l.id, l.playerName, 'CANCELADO')}
                              disabled={actionLoading}
                              title="Cancelar leilão"
                              className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </>
                        )}

                        {l.status !== 'ABERTO' && (
                          <button
                            id={`btn-reabrir-leilao-${l.id}`}
                            onClick={() => solicitarMudarStatus(l.id, l.playerName, 'ABERTO')}
                            disabled={actionLoading}
                            title="Reabrir leilão"
                            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
                          >
                            Reabrir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Criação de Leilão */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-white shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Gavel className="w-5 h-5 text-amber-400" />
                Criar Novo Leilão (/leiloes)
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCriarLeilao} className="space-y-4">
              {/* Seleção de Jogador */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                  1. Selecionar Jogador
                </label>

                {jogadorSelecionado ? (
                  <div className="flex items-center justify-between p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-amber-400">
                        {jogadorSelecionado.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-white">{jogadorSelecionado.name}</p>
                        <p className="text-xs text-slate-300">
                          {jogadorSelecionado.position} • {jogadorSelecionado.age} anos • {jogadorSelecionado.clubName || 'Sem clube'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setJogadorSelecionado(null)}
                      className="text-xs text-amber-300 hover:underline font-semibold"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Buscar por nome (ex: Cristiano, Abidal)..."
                        value={filtroJogador}
                        onChange={(e) => setFiltroJogador(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800 bg-slate-950/40">
                      {loadingJogadores ? (
                        <p className="p-4 text-center text-xs text-slate-500">Carregando catálogo de atletas...</p>
                      ) : jogadoresFiltrados.length === 0 ? (
                        <p className="p-4 text-center text-xs text-slate-500">Nenhum atleta encontrado.</p>
                      ) : (
                        jogadoresFiltrados.slice(0, 30).map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setJogadorSelecionado(p);
                              if (p.marketValue && p.marketValue > 0) {
                                const suggestedInitial = Math.max(500000, Math.round((p.marketValue * 0.1) / 50000) * 50000);
                                setInitialBid(suggestedInitial);
                                setMinIncrement(50000);
                              }
                            }}
                            className="p-2.5 hover:bg-slate-800/60 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-white">{p.name}</p>
                                {(p.databaseSource === 'FM2008' || p.source === 'FM2008' || p.id?.startsWith('fm2008_')) && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    FM2008
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">
                                {p.position} • {p.age} anos • {p.clubName || 'Sem clube'}
                              </p>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono">
                              OVR {p.overall || 70}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Valores */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Lance Inicial (initialBid) R$
                  </label>
                  <input
                    id="input-initial-bid"
                    type="number"
                    min={10000}
                    step={10000}
                    value={initialBid}
                    onChange={(e) => setInitialBid(Number(e.target.value))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Incremento Mínimo (minIncrement) R$
                  </label>
                  <input
                    id="input-min-increment"
                    type="number"
                    min={10000}
                    step={10000}
                    value={minIncrement}
                    onChange={(e) => setMinIncrement(Number(e.target.value))}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Prazos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Data / Hora Início (startTime)
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Data / Hora Fim (endTime)
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Botões do Modal */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirmar-criar-leilao"
                  type="submit"
                  disabled={actionLoading || !jogadorSelecionado}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition shadow-lg"
                >
                  {actionLoading ? 'Publicando...' : 'Criar Leilão (/leiloes)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Lances */}
      {leilaoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-white shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold">Lances: {leilaoSelecionado.playerName}</h3>
                <p className="text-xs text-slate-400">
                  Subcoleção: <code className="text-amber-400 font-mono">/leiloes/{leilaoSelecionado.id}/lances</code>
                </p>
              </div>
              <button
                onClick={() => setLeilaoSelecionado(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {lancesModal.length === 0 ? (
                <p className="text-center py-6 text-sm text-slate-500">Nenhum lance registrado até o momento.</p>
              ) : (
                lancesModal.map((lance) => (
                  <div
                    key={lance.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center"
                  >
                    <div>
                      <p className="font-semibold text-white flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-amber-400" />
                        {lance.managerName || 'Manager'}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">Clube: {lance.clubId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-emerald-400">
                        R$ {Number(lance.value).toLocaleString('pt-BR')}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {new Date(lance.createdAt).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 text-right">
              <button
                onClick={() => setLeilaoSelecionado(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação Visual para Alteração de Status (substitui window.confirm) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  confirmModal.novoStatus === 'ENCERRADO'
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                    : confirmModal.novoStatus === 'CANCELADO'
                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}
              >
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirmar {confirmModal.novoStatus === 'ENCERRADO' ? 'Encerramento' : confirmModal.novoStatus === 'CANCELADO' ? 'Cancelamento' : 'Reabertura'}
                </h3>
                <p className="text-xs text-slate-400">Ação administrativa imediata</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-sm text-slate-300">
              <p>
                Deseja alterar o status do leilão de <strong className="text-white">{confirmModal.nomeJogador}</strong> para{' '}
                <span className="font-semibold text-amber-400">"{confirmModal.novoStatus}"</span>?
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                id="btn-cancelar-status-modal"
                onClick={() => setConfirmModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                id="btn-confirmar-status-modal"
                onClick={executarMudarStatus}
                disabled={actionLoading}
                className={`px-4 py-2 font-semibold rounded-xl text-sm shadow-lg transition active:scale-95 flex items-center gap-2 cursor-pointer ${
                  confirmModal.novoStatus === 'ENCERRADO'
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
                    : confirmModal.novoStatus === 'CANCELADO'
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                }`}
              >
                {actionLoading ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR LEILÕES EM MASSA (JOGADORES SEM CLUBE)                       */}
      {/* ========================================================================= */}
      {isMassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl text-white shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
            
            {/* Header do Modal */}
            <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
                  <Zap className="w-6 h-6 fill-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    Criar Leilões em Massa
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                      Sem Clube
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Selecione jogadores Sem Clube para lançar múltiplos leilões V3 simultaneamente via batch atômico.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMassModalOpen(false);
                  setMassResultDetails(null);
                }}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Resultado da Execução (se finalizado) */}
            {massResultDetails ? (
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">Lote de Leilões Processado</h4>
                      <p className="text-xs text-slate-400">
                        {massResultDetails.totalCriados} de {massResultDetails.totalSolicitado} leilões foram cadastrados com sucesso.
                      </p>
                    </div>
                  </div>

                  {/* Resumo de Sucessos */}
                  {massResultDetails.totalCriados > 0 && (
                    <div className="p-4 bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
                      <p className="text-sm font-semibold text-emerald-300 mb-2">
                        ✓ {massResultDetails.totalCriados} leilão(ões) ativo(s) na lista V3:
                      </p>
                      <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                        {massResultDetails.criados.map((c) => (
                          <span
                            key={c.leilaoId}
                            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-900/40 text-emerald-200 border border-emerald-500/30 font-medium"
                          >
                            {c.playerName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detalhes de Falhas / Ignorados */}
                  {massResultDetails.totalFalhas > 0 && (
                    <div className="p-4 bg-amber-950/30 border border-amber-500/20 rounded-xl space-y-2">
                      <p className="text-sm font-semibold text-amber-300">
                        ⚠️ {massResultDetails.totalFalhas} atleta(s) não criado(s) devido a restrições:
                      </p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs text-slate-300">
                        {massResultDetails.falhas.map((f, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-800/60">
                            <span className="font-semibold text-white">{f.playerName}</span>
                            <span className="text-amber-400">{f.motivo}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsMassModalOpen(false);
                      setMassResultDetails(null);
                    }}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition shadow-lg"
                  >
                    Concluir e Ver Leilões
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Barra de Filtros e Busca */}
                <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    {/* Campo de Busca Textual */}
                    <div className="sm:col-span-6 relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Pesquisar por nome, sobrenome, posição ou OVR (ex: ronal, 85)..."
                        value={filtroMassBusca}
                        onChange={(e) => setFiltroMassBusca(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Filtro por Posição */}
                    <div className="sm:col-span-3">
                      <select
                        value={filtroMassPosicao}
                        onChange={(e) => setFiltroMassPosicao(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="ALL">Todas as Posições</option>
                        <option value="GK">Goleiros (GK)</option>
                        <option value="DEF">Defensores (DEF)</option>
                        <option value="MID">Meio-campo (MID)</option>
                        <option value="ATT">Atacantes (ATT)</option>
                      </select>
                    </div>

                    {/* Filtro por OVR Mínimo */}
                    <div className="sm:col-span-3">
                      <select
                        value={filtroMassOvrMin}
                        onChange={(e) => setFiltroMassOvrMin(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value={0}>Todos os OVRs</option>
                        <option value={70}>OVR 70+</option>
                        <option value={75}>OVR 75+</option>
                        <option value={80}>OVR 80+</option>
                      </select>
                    </div>
                  </div>

                  {/* Barra de Ações Rápidas de Seleção e Contadores */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        disabled={jogadoresElegiveisPagina.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition font-medium cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {jogadoresElegiveisPagina.length > 0 &&
                          jogadoresElegiveisPagina.every((p) => selectedPlayerIds.has(p.id))
                            ? 'Desmarcar Visíveis'
                            : `Selecionar Visíveis (${jogadoresExibidos.length})`}
                        </span>
                      </button>

                      {selectedPlayerIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerIds(new Set())}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                        >
                          Limpar Seleção
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">
                        Filtrados: <strong className="text-slate-200">{totalFiltrados}</strong> atleta(s) • Exibindo{' '}
                        <strong className="text-amber-400">{jogadoresExibidos.length}</strong> (Pág. {massPaginaAtual} de {totalPaginas})
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold font-mono">
                        {selectedPlayerIds.size} selecionado(s)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lista Pesquisável de Jogadores com Checkboxes */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 min-h-[220px] max-h-[360px] divide-y divide-slate-800/40">
                  {loadingMass ? (
                    <div className="py-16 text-center text-slate-400 space-y-3">
                      <RefreshCw className="w-7 h-7 animate-spin mx-auto text-amber-400" />
                      <p className="text-sm">Carregando catálogo de atletas Sem Clube...</p>
                    </div>
                  ) : jogadoresExibidos.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 space-y-2">
                      <AlertCircle className="w-8 h-8 mx-auto text-slate-600" />
                      <p className="text-sm font-medium text-slate-300">Nenhum jogador Sem Clube corresponde aos filtros.</p>
                      <p className="text-xs text-slate-500">Ajuste os termos de busca ou filtros de posição/OVR.</p>
                    </div>
                  ) : (
                    jogadoresExibidos.map((jogador) => {
                      const isSelected = selectedPlayerIds.has(jogador.id);
                      const hasActiveAuction = activeAuctionPlayerIds.has(jogador.id);

                      return (
                        <div
                          key={jogador.id}
                          onClick={() => !hasActiveAuction && handleTogglePlayer(jogador.id)}
                          className={`pt-2.5 pb-2.5 px-3 rounded-xl flex items-center justify-between transition ${
                            hasActiveAuction
                              ? 'opacity-50 bg-slate-950/20 cursor-not-allowed'
                              : isSelected
                              ? 'bg-amber-500/10 border border-amber-500/30 cursor-pointer shadow-sm'
                              : 'hover:bg-slate-800/50 cursor-pointer border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Checkbox customizado */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={hasActiveAuction}
                              onChange={() => handleTogglePlayer(jogador.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900 cursor-pointer disabled:cursor-not-allowed"
                            />

                            {/* Foto / Avatar */}
                            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-bold text-amber-400 flex-shrink-0">
                              {jogador.photoUrl ? (
                                <img src={jogador.photoUrl} alt={jogador.name} className="w-full h-full object-cover" />
                              ) : (
                                jogador.name.charAt(0)
                              )}
                            </div>

                            {/* Detalhes do Jogador */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-white text-sm truncate">{jogador.name}</p>
                                {(jogador.databaseSource === 'FM2008' || jogador.source === 'FM2008' || jogador.id?.startsWith('fm2008_')) && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                                    FM2008
                                  </span>
                                )}
                                {hasActiveAuction && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex-shrink-0">
                                    Leilão Ativo
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">
                                {jogador.position} • {jogador.age} anos • {jogador.nationality || 'Brasil'} •{' '}
                                {(jogador as any).fm2008_clube_origem && (
                                  <span className="text-slate-300 font-medium">Origem: {(jogador as any).fm2008_clube_origem} • </span>
                                )}
                                <span className="text-emerald-400 font-medium">Sem Clube</span>
                              </p>
                            </div>
                          </div>

                          {/* OVR e Valor de Mercado / Lance Inicial */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-shrink-0 pl-2 text-right">
                            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 font-mono font-bold self-end sm:self-auto">
                              OVR {jogador.overall || 70}
                            </span>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block font-medium">
                                Lance Inicial (Valor de Mercado)
                              </span>
                              <span className="text-xs font-mono font-bold text-emerald-400">
                                R$ {Number(jogador.marketValue || 1000000).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Controles de Paginação da Lista */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-t border-slate-800 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span>Exibindo</span>
                      <strong className="text-slate-200">
                        {totalFiltrados === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + ITENS_POR_PAGINA, totalFiltrados)}
                      </strong>
                      <span>de</span>
                      <strong className="text-amber-400">{totalFiltrados}</strong>
                      <span>atletas</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={massPaginaAtual <= 1}
                        onClick={() => setMassPaginaAtual((p) => Math.max(1, p - 1))}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-medium transition cursor-pointer"
                      >
                        ◀ Anterior
                      </button>
                      <span className="font-mono text-slate-300 px-1">
                        Pág. <strong className="text-amber-400">{massPaginaAtual}</strong> de {totalPaginas}
                      </span>
                      <button
                        type="button"
                        disabled={massPaginaAtual >= totalPaginas}
                        onClick={() => setMassPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-medium transition cursor-pointer"
                      >
                        Próxima ▶
                      </button>
                    </div>
                  </div>
                )}

                {/* Configuração Única do Lote (Incremento, Encerramento e Info de Lance Inicial) */}
                <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-amber-400" />
                      Configuração do Lote ({selectedPlayerIds.size} selecionado(s))
                    </h4>
                    <span className="text-xs text-slate-500">Definido uma única vez para todos os selecionados</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Lance Inicial Informativo (Valor de Mercado) */}
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/20 flex flex-col justify-center">
                      <label className="block text-xs text-emerald-400 mb-0.5 font-semibold flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        Lance Inicial Automático
                      </label>
                      <p className="text-xs text-slate-200 font-medium">
                        Igual ao <strong className="text-emerald-300">Valor de Mercado</strong> de cada jogador.
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Cada atleta recebe seu próprio lance inicial individual.
                      </p>
                    </div>

                    {/* Incremento Mínimo */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-medium">
                        Incremento Mínimo (R$)
                      </label>
                      <input
                        type="number"
                        min={10000}
                        step={10000}
                        value={massMinIncrement}
                        onChange={(e) => setMassMinIncrement(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Data / Hora de Encerramento */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-medium">
                        Data / Hora de Encerramento
                      </label>
                      <input
                        type="datetime-local"
                        value={massEndTime}
                        onChange={(e) => setMassEndTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Ações Inferiores */}
                  <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <p className="text-xs text-slate-400 text-center sm:text-left">
                      Cada atleta selecionado receberá um leilão individual em <code className="text-amber-400 font-mono">/leiloes</code> mantendo o status Sem Clube.
                    </p>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => setIsMassModalOpen(false)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition text-sm cursor-pointer"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        id="btn-avancar-criar-leiloes-em-massa"
                        disabled={selectedPlayerIds.size === 0}
                        onClick={() => setMassConfirmModal(true)}
                        className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl transition shadow-lg flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Zap className="w-4 h-4 fill-slate-950" />
                        <span>Continuar ({selectedPlayerIds.size})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMAÇÃO VISUAL ("Você está prestes a criar X leilões.")        */}
      {/* ========================================================================= */}
      {massConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-white shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl">
                <Zap className="w-6 h-6 fill-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirmar Criação em Massa</h3>
                <p className="text-xs text-slate-400">Publicação de novos leilões no Leilões V3</p>
              </div>
            </div>

            {/* Mensagem exigida pelo Critério do Usuário */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <p className="text-base font-semibold text-amber-300">
                Você está prestes a criar {selectedPlayerIds.size} leilões.
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                <div className="col-span-2 p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-300">
                  <span className="font-semibold block">Lance Inicial:</span>
                  <span>Igual ao Valor de Mercado individual de cada jogador (veja abaixo).</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Incremento Mínimo:</span>
                  <span className="font-mono font-bold text-white">R$ {massMinIncrement.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Data de Encerramento:</span>
                  <span className="font-mono text-slate-200">
                    {new Date(massEndTime).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Pré-visualização dos atletas selecionados com seus respectivos lances iniciais */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                  Atletas no lote e Lances Iniciais (Valor de Mercado):
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {massJogadores
                    .filter((p) => selectedPlayerIds.has(p.id))
                    .map((p) => (
                      <div
                        key={p.id}
                        className="text-xs px-2.5 py-1.5 rounded bg-slate-800 text-slate-200 border border-slate-700 flex justify-between items-center"
                      >
                        <span className="font-medium text-white truncate max-w-[200px]">
                          {p.name} ({p.position || 'N/A'})
                        </span>
                        <span className="font-mono font-bold text-emerald-400 text-[11px]">
                          Lance Inicial: R$ {Number(p.marketValue || 1000000).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                id="btn-voltar-confirm-massa"
                disabled={massActionLoading}
                onClick={() => setMassConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition cursor-pointer"
              >
                Voltar
              </button>

              <button
                type="button"
                id="btn-confirmar-criar-leiloes-massa"
                disabled={massActionLoading}
                onClick={handleExecutarCriarLeiloesEmMassa}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-amber-500/20 transition active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                {massActionLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Criando leilões em lote...</span>
                  </>
                ) : (
                  <span>CRIAR LEILÕES</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
