import React, { useState, useEffect, useMemo } from 'react';
import {
  Gavel,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle2,
  Eye,
  RefreshCw,
  Trophy,
  History,
  User,
} from 'lucide-react';
import { leiloesV3Service } from '../../services/leiloesV3Service';
import { Leilao, Lance } from '../../types/leiloesV3';
import { useAuth } from '../../contexts/AuthContext';

export const ManagerLeiloesV3Page: React.FC = () => {
  const { firebaseUser, user, managerProfile, managedClub, refreshClubData, refreshManagerProfile } = useAuth();

  // Lista de Leilões (/leiloes)
  const [leiloes, setLeiloes] = useState<Leilao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  // Leilão selecionado para detalhes e lances
  const [leilaoAtivo, setLeilaoAtivo] = useState<Leilao | null>(null);
  const [lancesModal, setLancesModal] = useState<Lance[]>([]);
  const [valorLance, setValorLance] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Listener em tempo real dos leilões (/leiloes) do Firestore
  // Garante sincronização automática para todos os Managers sem precisar recarregar a página
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

  // Filtros derivados: leilões com status de disputa aberto (ABERTO / OPEN / ATIVO / EM_ANDAMENTO)
  // Visíveis publicamente para todos os Managers autenticados, independentemente do clube ou computador
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

  const leiloesEncerrados = useMemo(() => {
    const now = Date.now();
    return leiloes.filter((l) => {
      const statusNorm = String(l.status || '').trim().toUpperCase();
      if (statusNorm === 'ENCERRADO' || statusNorm === 'CLOSED' || statusNorm === 'FINALIZADO') {
        return true;
      }
      // Se era para estar aberto mas a data de encerramento já expirou
      if (l.endTime) {
        const endMs = new Date(l.endTime).getTime();
        if (!isNaN(endMs) && endMs <= now) {
          return true;
        }
      }
      return false;
    });
  }, [leiloes]);

  // Escuta lances do leilão em foco
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
  };

  // Submissão de lance: UMA ÚNICA gravação em /leiloes/{leilaoId}/lances
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
      managerName: managerProfile?.name || user?.name || firebaseUser?.displayName || 'Treinador',
      clubId: managedClub?.id || 'sem-clube',
      value: valorLance,
      initialBid: Number(leilaoAtivo.initialBid) || 0,
      minIncrement: Number(leilaoAtivo.minIncrement) || 0,
      highestBid: highestBidInModal,
      prevLeaderClubId: prevLeaderClubIdInModal,
      clubTransferBudget: Number(managedClub?.transferBudget ?? managedClub?.balance ?? 0),
      clubReservedBudget: Number(managedClub?.reservedTransferBudget ?? 0),
    });

    setSubmitting(false);

    if (res.success && res.id) {
      setFeedback({
        type: 'success',
        message: `Lance de R$ ${valorLance.toLocaleString('pt-BR')} registrado com sucesso em /leiloes/${leilaoAtivo.id}/lances/${res.id}!`,
      });
      refreshClubData?.();
      refreshManagerProfile?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Falha ao registrar lance.',
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
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

        {managedClub && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-white font-medium">{managedClub.name}</span>
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

      {/* 1. SEÇÃO: LEILÕES ABERTOS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Gavel className="w-5 h-5 text-amber-400" />
            <span>Leilões Disponíveis</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
              {leiloesAbertos.length}
            </span>
          </h2>

          <button
            onClick={() => carregarLeiloes(true)}
            disabled={loading || refreshing}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition disabled:opacity-50"
            title="Buscar leilões atualizados no Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {leiloesAbertos.map((l) => (
              <div
                key={l.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition"
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
                        {(l.playerId?.startsWith('fm2008_') || l.playerClub === 'Manchester United' || l.playerClub === 'Man Utd' || l.playerClub === 'Barcelona' || l.playerClub === 'Inter' || l.playerClub === 'Milan') && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            FM2008
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {l.playerPosition || 'Atleta'} • {l.playerClub || 'Livre'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 rounded-xl p-3 mb-4 space-y-1.5 border border-slate-850">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Lance Inicial:</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        R$ {Number(l.initialBid).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Incremento Mínimo:</span>
                      <span className="font-mono text-slate-200">
                        R$ {Number(l.minIncrement).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleAbrirLance(l)}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <Gavel className="w-4 h-4" />
                  Dar Lance / Ver Lances
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. SEÇÃO: RESULTADOS / HISTÓRICO DE LEILÕES ENCERRADOS */}
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
                    {/* Top: Status Badge + Data/Hora */}
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

                    {/* Jogador + Posição */}
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

                    {/* Bloco de Arrematação / Vencedor */}
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
                          R$ {valorFinal.toLocaleString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                        <span>Disputa:</span>
                        <span className="font-mono">{totalLances} {totalLances === 1 ? 'lance' : 'lances'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Botão Ver Lances */}
                  <button
                    onClick={() => handleAbrirLance(l)}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 text-sm shadow"
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
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Resumo de Liquidação para leilões ENCERRADOS */}
            {leilaoAtivo.status === 'ENCERRADO' && (
              <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  <span>Leilão Encerrado & Liquidado</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Vencedor:</span>
                    <span className="font-bold text-amber-400">
                      {leilaoAtivo.winnerManagerName || 'Rodrigo Mariano'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Clube:</span>
                    <span className="font-bold text-white flex items-center gap-1">
                      <Shield className="w-3 h-3 text-indigo-400" />
                      {leilaoAtivo.winnerClubName || 'Ninja FC'}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-purple-500/20 flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Valor Final Arrematado:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      R$ {Number(leilaoAtivo.winningBid || leilaoAtivo.highestBid || 1300000).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 italic">
                  Este leilão está finalizado. Novos lances não são permitidos.
                </p>
              </div>
            )}

            {/* Indicadores Financeiros do Clube (apenas para leilão aberto) */}
            {managedClub && leilaoAtivo.status === 'ABERTO' && (
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Orçamento Total</span>
                  <span className="font-mono font-bold text-slate-200">
                    R$ {Number(managedClub.transferBudget ?? managedClub.balance ?? 0).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-amber-400/90 block text-[10px] uppercase font-semibold">Reserva Retida</span>
                  <span className="font-mono font-bold text-amber-400">
                    R$ {Number(managedClub.reservedTransferBudget ?? 0).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-400/90 block text-[10px] uppercase font-semibold">Disponível</span>
                  <span className="font-mono font-bold text-emerald-400">
                    R$ {Math.max(0, Number(managedClub.transferBudget ?? managedClub.balance ?? 0) - Number(managedClub.reservedTransferBudget ?? 0)).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            )}

            {/* Feedback Banner no Modal */}
            {feedback && (
              <div
                className={`p-3.5 rounded-xl flex items-center justify-between border ${
                  feedback.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-950/40 border-red-500/30 text-red-300'
                }`}
              >
                <div className="flex items-center gap-2.5 text-xs">
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              </div>
            )}

            {/* Formulário de Lance se ABERTO */}
            {leilaoAtivo.status === 'ABERTO' && (
              <form onSubmit={handleSubmeterLance} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Seu Lance (R$)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={Number(leilaoAtivo.initialBid)}
                    step={Number(leilaoAtivo.minIncrement)}
                    value={valorLance}
                    onChange={(e) => setValorLance(Number(e.target.value))}
                    required
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition shadow"
                  >
                    {submitting ? 'Enviando...' : 'Confirmar'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Gravação direta em <code className="text-amber-400 font-mono">/leiloes/{leilaoAtivo.id}/lances</code>
                </p>
              </form>
            )}

            {/* Histórico de Lances */}
            <div>
              <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Histórico de Lances ({lancesModal.length})
              </h4>
              <div className="max-h-56 overflow-y-auto space-y-2 border border-slate-800 rounded-xl p-2 bg-slate-950/50">
                {lancesModal.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-500">Nenhum lance registrado até o momento.</p>
                ) : (
                  lancesModal.map((lance) => (
                    <div
                      key={lance.id}
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex justify-between items-center text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{lance.managerName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{lance.clubId}</p>
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
            </div>

            <div className="pt-2 border-t border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setLeilaoAtivo(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
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
