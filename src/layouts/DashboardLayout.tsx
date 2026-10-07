import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import { notificacoesService } from '../services/notificacoesService';
import { jogosService } from '../services/jogosService';
import { seasonMotorService } from '../services/seasonMotorService';
import { dataStore } from '../services/dataStore';
import { NotificationItem, Match, RoundSummaryData } from '../types';
import { RoundSummaryModal } from '../components/season/RoundSummaryModal';
import { NotificationCenterModal } from '../components/notifications/NotificationCenterModal';
import { formatCurrencyBRL } from '../utils/currency';
import { ClubBadge } from '../components/common/ClubBadge';
import {
  LayoutDashboard,
  Users,
  Crosshair,
  DollarSign,
  Building2,
  Search,
  Calendar,
  Bell,
  LogOut,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Gavel,
  Menu,
  X,
  Shield,
  ExternalLink,
} from 'lucide-react';

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentPath, navigate } = useNavigation();
  const { managedClub, role, firebaseUser, managerProfile, logoutManager, refreshClubData } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [isCenterModalOpen, setIsCenterModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [nextMatch, setNextMatch] = useState<Match | null>(null);

  // Motor de Temporada State
  const [isAdvancingRound, setIsAdvancingRound] = useState(false);
  const [roundSummary, setRoundSummary] = useState<RoundSummaryData | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [pendingRoundNumber, setPendingRoundNumber] = useState<number>(5);
  const [hasValidMatchForClub, setHasValidMatchForClub] = useState<boolean>(true);
  const [calendarDiagnostic, setCalendarDiagnostic] = useState<string | null>(null);
  const [isPendingRound, setIsPendingRound] = useState<boolean>(false);
  const [isOverdue, setIsOverdue] = useState<boolean>(false);
  const [advanceFeedback, setAdvanceFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchNextPending = useCallback(async () => {
    try {
      const nextInfo = await seasonMotorService.getNextPendingRound(managedClub?.id);
      if (nextInfo) {
        setPendingRoundNumber(nextInfo.roundNumber);
        setHasValidMatchForClub(nextInfo.hasValidMatchForClub);
        setCalendarDiagnostic(nextInfo.diagnosticReason || null);
        setIsPendingRound(Boolean(nextInfo.isPendingRound));
        setIsOverdue(Boolean(nextInfo.isOverdue));
      }
    } catch {
      // fallback
    }
  }, [managedClub?.id]);

  useEffect(() => {
    const fetchNotifs = () => {
      notificacoesService.getAll(managedClub?.id).then(setNotifications);
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);

    if (managedClub) {
      jogosService.getByClubId(managedClub.id).then((matches) => {
        const scheduled = matches
          .filter((m) => m.status === 'SCHEDULED')
          .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
        const upcoming = scheduled[0] || null;
        if (upcoming) setNextMatch(upcoming);
      });
    }

    fetchNextPending();

    return () => clearInterval(interval);
  }, [managedClub, fetchNextPending]);

  const handleAdvanceRound = async () => {
    if (!managedClub) {
      setAdvanceFeedback({ type: 'error', message: 'Nenhum clube ativo selecionado para avançar.' });
      return;
    }

    if (!hasValidMatchForClub) {
      setAdvanceFeedback({
        type: 'error',
        message:
          calendarDiagnostic ||
          `Avanço bloqueado: O clube ${managedClub.name} não possui partida agendada no calendário oficial da Rodada ${pendingRoundNumber}.`,
      });
      setTimeout(() => setAdvanceFeedback(null), 7000);
      return;
    }

    setIsAdvancingRound(true);
    setAdvanceFeedback(null);

    try {
      const tactic = dataStore.getTactic(managedClub.id);
      const summary = await seasonMotorService.advanceRound(managedClub.id, tactic);

      setRoundSummary(summary);
      setIsSummaryModalOpen(true);

      await refreshClubData();

      const notifs = await notificacoesService.getAll(managedClub.id);
      setNotifications(notifs);

      const matches = await jogosService.getByClubId(managedClub.id);
      const scheduled = matches
        .filter((m) => m.status === 'SCHEDULED')
        .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
      const upcoming = scheduled[0] || null;
      setNextMatch(upcoming || null);

      await fetchNextPending();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdvanceFeedback({ type: 'error', message: msg });
      setTimeout(() => setAdvanceFeedback(null), 6000);
    } finally {
      setIsAdvancingRound(false);
    }
  };

  // Menu canônico solicitado pelo usuário:
  // CENTRAL | ELENCO | MERCADO | LEILÕES | FINANÇAS | TÁTICAS | CALENDÁRIO | CLUBE
  const mainNavItems = [
    { label: 'CENTRAL', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'ELENCO', path: '/dashboard/elenco', icon: Users },
    { label: 'MERCADO', path: '/dashboard/mercado', icon: Search },
    { label: 'LEILÕES', path: '/dashboard/leiloes-v3', icon: Gavel },
    { label: 'FINANÇAS', path: '/dashboard/financas', icon: DollarSign },
    { label: 'TÁTICAS', path: '/dashboard/tatica', icon: Crosshair },
    { label: 'CALENDÁRIO', path: '/jogos', icon: Calendar },
    { label: 'CLUBE', path: '/dashboard/estadio', icon: Building2 },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNav = (path: string) => {
    navigate(path);
    setMobileNavOpen(false);
  };

  const markAllRead = () => {
    notifications.forEach((n) => notificacoesService.markAsRead(n.id));
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const managerDisplayName = managerProfile?.name || managedClub?.managerName || 'Treinador';
  const managerInitial = managerDisplayName.trim().charAt(0).toUpperCase() || 'M';

  return (
    <div className="min-h-screen bg-[#07050d] text-zinc-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* 1. BARRA SUPERIOR FIXA — ESTILO FOOTBALL MANAGER MODERNO */}
      <header className="sticky top-0 z-40 w-full bg-[#0d091a]/95 backdrop-blur-md border-b border-purple-900/30 shadow-xl shadow-black/40">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* LADO ESQUERDO: Marca FM UNIVERSE */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleNav('/dashboard')}
              className="flex items-center gap-2.5 group cursor-pointer focus:outline-none"
              title="Central de Comando FM Universe"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center font-black text-sm text-white shadow-md shadow-purple-900/40 border border-purple-400/30 group-hover:scale-105 transition-transform">
                FM
              </div>
              <div className="flex flex-col text-left leading-none">
                <span className="text-sm font-black tracking-widest text-white uppercase group-hover:text-purple-300 transition-colors">
                  UNIVERSE
                </span>
                <span className="text-[9px] font-bold text-purple-400/80 tracking-wider uppercase">
                  CENTRAL DO CLUBE
                </span>
              </div>
            </button>
          </div>

          {/* CENTRO: MENU HORIZONTAL MODERNO (DESKTOP) */}
          <nav className="hidden xl:flex items-center gap-1 flex-1 justify-center max-w-4xl">
            {mainNavItems.map((item) => {
              const isActive = item.exact
                ? currentPath === '/dashboard' || currentPath === '/manager'
                : currentPath.startsWith(item.path);
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => handleNav(item.path)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-extrabold tracking-wider transition-all rounded-lg cursor-pointer ${
                    isActive
                      ? 'text-white bg-purple-600/25 border border-purple-500/40 shadow-sm shadow-purple-900/40'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-purple-400' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full" />
                  )}
                </button>
              );
            })}

            {/* Link extra apenas para administradores */}
            {role === 'ADMIN' && (
              <button
                onClick={() => handleNav('/admin/importar-fm26')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                  currentPath.startsWith('/admin')
                    ? 'bg-purple-950/70 text-purple-200 border-purple-700/60'
                    : 'text-purple-400/80 hover:text-purple-200 border-purple-900/40 hover:bg-purple-950/30'
                }`}
                title="Painel de Administração"
              >
                <Shield className="w-3 h-3 text-purple-400" />
                <span>Admin</span>
              </button>
            )}
          </nav>

          {/* LADO DIREITO: MANAGER, CLUBE, NOTIFICAÇÕES, CONTINUAR E SAIR */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Botão de Rodada FM "Continuar" */}
            <button
              onClick={handleAdvanceRound}
              disabled={isAdvancingRound || !hasValidMatchForClub}
              className={`hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg cursor-pointer ${
                !hasValidMatchForClub
                  ? 'bg-zinc-800 text-zinc-500 border border-zinc-700/60 cursor-not-allowed opacity-80'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/40 shadow-purple-950/60 active:scale-95'
              }`}
              title={
                !hasValidMatchForClub
                  ? (calendarDiagnostic || 'Avanço bloqueado: Sem partida agendada.')
                  : isPendingRound
                  ? `Partida pendente obrigatória da Rodada ${pendingRoundNumber}`
                  : 'Avançar para a próxima rodada da temporada'
              }
            >
              {isAdvancingRound ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processando...</span>
                </>
              ) : !hasValidMatchForClub ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Sem Jogo (R{pendingRoundNumber})</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white text-white" />
                  <span>Continuar</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/30 text-purple-200 font-bold border border-white/10">
                    R{pendingRoundNumber}
                  </span>
                </>
              )}
            </button>

            {/* Notificações com Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2 text-zinc-300 hover:text-white bg-purple-950/30 hover:bg-purple-900/40 rounded-xl border border-purple-800/30 transition-colors cursor-pointer"
                title="Notificações do Clube"
              >
                <Bell className="w-4 h-4 text-purple-300" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[17px] text-[10px] font-black bg-purple-500 text-white rounded-full text-center shadow-lg leading-tight animate-pulse border border-[#0d091a]">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown de Notificações */}
              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#110d22] border border-purple-800/40 rounded-2xl shadow-2xl shadow-black/80 p-3.5 z-50 text-xs">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-purple-900/30">
                    <span className="font-extrabold text-white text-sm flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 text-purple-400" />
                      <span>Notificações</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="text-[11px] text-purple-300 hover:text-purple-200 hover:underline cursor-pointer"
                        >
                          Marcar lidas
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setNotifDropdownOpen(false);
                          setIsCenterModalOpen(true);
                        }}
                        className="text-[11px] text-purple-400 font-bold hover:underline cursor-pointer"
                      >
                        Ver Central
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-zinc-500 text-xs">
                        Nenhuma notificação recente.
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.read) {
                              notificacoesService.markAsRead(n.id);
                              setNotifications((prev) =>
                                prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
                              );
                            }
                            if (n.leilaoId || n.link?.includes('leilao')) {
                              if (n.leilaoId && typeof window !== 'undefined') {
                                sessionStorage.setItem('fmu_target_leilao_id', n.leilaoId);
                                window.dispatchEvent(new CustomEvent('fmu_open_auction'));
                              }
                              navigate(n.link || '/manager/leiloes-v3');
                              setNotifDropdownOpen(false);
                            } else if (n.link) {
                              navigate(n.link);
                              setNotifDropdownOpen(false);
                            }
                          }}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                            n.read
                              ? 'bg-zinc-900/40 hover:bg-zinc-900 border-zinc-800/60 text-zinc-400'
                              : 'bg-purple-950/40 hover:bg-purple-900/40 border-purple-700/50 text-zinc-200'
                          }`}
                        >
                          <div className="flex justify-between font-bold text-white mb-0.5">
                            <span className="flex items-center gap-1.5 truncate">
                              {(n.leilaoId || n.type === 'AUCTION_BID') && (
                                <Gavel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                              <span>{n.title}</span>
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0 ml-1 font-mono">{n.date}</span>
                          </div>
                          <p className="text-[11px] text-zinc-300 line-clamp-2">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-purple-900/30 text-center">
                    <button
                      onClick={() => {
                        setNotifDropdownOpen(false);
                        setIsCenterModalOpen(true);
                      }}
                      className="w-full py-2 bg-purple-900/40 hover:bg-purple-800/50 text-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-purple-700/40"
                    >
                      Abrir Central Completa
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Perfil do Manager & Clube Atual */}
            <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-purple-900/30">
              {/* Avatar do Manager */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-500 border border-purple-300/40 flex items-center justify-center text-xs font-black text-white shadow-md shadow-purple-950/60 shrink-0">
                {managerInitial}
              </div>

              {/* Informações de Texto do Treinador e Clube */}
              <div className="hidden md:flex flex-col text-left leading-tight min-w-0 max-w-[160px]">
                <span className="text-xs font-bold text-white truncate">
                  {managerDisplayName}
                </span>
                <span className="text-[10px] font-extrabold text-purple-400 truncate flex items-center gap-1">
                  <ClubBadge club={managedClub} size="xs" className="shrink-0" />
                  <span className="truncate">{managedClub?.name || 'Sem Clube'}</span>
                </span>
              </div>
            </div>

            {/* Botão de Sair */}
            {firebaseUser && (
              <button
                onClick={async () => {
                  await logoutManager();
                  navigate('/login');
                }}
                className="flex items-center justify-center p-2 rounded-xl text-zinc-400 hover:text-rose-300 bg-zinc-900/60 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-900/40 transition-colors cursor-pointer"
                title="Sair da Conta (Logout)"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="xl:hidden p-2 text-zinc-300 hover:text-white bg-purple-950/40 rounded-xl border border-purple-800/40"
              title="Menu de Navegação"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* MENU RESPONSIVO MOBILE / TABLET */}
        {mobileNavOpen && (
          <div className="xl:hidden bg-[#0e0a1f] border-t border-purple-900/30 px-4 py-3 space-y-2 shadow-2xl">
            {/* Mobile Continue Round button */}
            <div className="pb-2 border-b border-purple-900/30 sm:hidden">
              <button
                onClick={handleAdvanceRound}
                disabled={isAdvancingRound || !hasValidMatchForClub}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Continuar (Rodada {pendingRoundNumber})</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {mainNavItems.map((item) => {
                const isActive = item.exact
                  ? currentPath === '/dashboard' || currentPath === '/manager'
                  : currentPath.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => handleNav(item.path)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-zinc-900/60 text-zinc-300 hover:bg-purple-950/40'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {role === 'ADMIN' && (
              <div className="pt-2 border-t border-purple-900/30">
                <button
                  onClick={() => handleNav('/admin/importar-fm26')}
                  className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-bold text-purple-300 bg-purple-950/60 border border-purple-800/40"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Painel do Administrador (Importação FM26)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Banner de feedback do Motor de Temporada */}
      {advanceFeedback && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-2xl border text-xs flex items-center gap-2 shadow-2xl backdrop-blur-md animate-in slide-in-from-top duration-200 ${
            advanceFeedback.type === 'error'
              ? 'bg-rose-950/95 border-rose-800 text-rose-200'
              : 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
          }`}
        >
          {advanceFeedback.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold">{advanceFeedback.message}</span>
          <button
            onClick={() => setAdvanceFeedback(null)}
            className="ml-2 text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. ÁREA DE CONTEÚDO PRINCIPAL (OCUPA TODA A TELA) */}
      <main className="flex-1 w-full max-w-[1680px] mx-auto p-3 sm:p-5 lg:p-6 overflow-y-auto">
        {children}
      </main>

      {/* Modal Oficial de Resumo da Rodada (Motor de Temporada FM Universe) */}
      <RoundSummaryModal
        data={roundSummary}
        isOpen={isSummaryModalOpen}
        onClose={() => {
          setIsSummaryModalOpen(false);
          refreshClubData();
        }}
      />

      {/* Central de Notificações Modal */}
      <NotificationCenterModal
        isOpen={isCenterModalOpen}
        onClose={() => setIsCenterModalOpen(false)}
        notifications={notifications}
        clubId={managedClub?.id}
        onRefresh={() => notificacoesService.getAll(managedClub?.id).then(setNotifications)}
      />
    </div>
  );
};
