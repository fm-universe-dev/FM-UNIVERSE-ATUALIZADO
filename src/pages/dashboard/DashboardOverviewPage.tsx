import React, { useEffect, useState, useMemo } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import { jogadoresService } from '../../services/jogadoresService';
import { jogosService } from '../../services/jogosService';
import { competicoesService } from '../../services/competicoesService';
import { dataStore } from '../../services/dataStore';
import { notificacoesService } from '../../services/notificacoesService';
import { noticiasService } from '../../services/noticiasService';
import { clubesService } from '../../services/clubesService';
import { Player, Match, ClubStanding, Stadium, News, Club } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';
import { ClubBadge } from '../../components/common/ClubBadge';
import { NewsDetailModal } from '../../components/news/NewsDetailModal';
import {
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  Shield,
  MapPin,
  Trophy,
  ArrowRightLeft,
  Gavel,
  Zap,
  Award,
  Wallet,
  Building2,
  Crosshair,
  Search,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Swords,
  Activity,
  FileText,
  AlertCircle,
  HelpCircle,
  CheckCheck,
} from 'lucide-react';

export const DashboardOverviewPage: React.FC = () => {
  const { navigate } = useNavigation();
  const { managedClub, isLoadingManager, isAuthInitialized } = useAuth();

  // Estados dos dados existentes
  const [squad, setSquad] = useState<Player[]>([]);
  const [nextMatch, setNextMatch] = useState<Match | null>(null);
  const [lastFinishedMatch, setLastFinishedMatch] = useState<Match | null>(null);
  const [standings, setStandings] = useState<ClubStanding[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [competitionName, setCompetitionName] = useState<string>('Liga FM Universe');
  const [stadium, setStadium] = useState<Stadium | undefined>(undefined);
  const [allClubs, setAllClubs] = useState<Club[]>([]);

  // Central de Notícias
  const [newsList, setNewsList] = useState<News[]>([]);
  const [newsFilter, setNewsFilter] = useState<'ALL' | 'MY_CLUB' | 'MARKET' | 'MATCHES' | 'FINANCES'>('ALL');
  const [newsSearch, setNewsSearch] = useState<string>('');
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);

  useEffect(() => {
    if (managedClub) {
      // 1. Dados do Estádio
      const stad =
        dataStore.getStadiumById(managedClub.stadiumId) ||
        dataStore.getStadiums().find((s) => s.name === managedClub.stadiumName) ||
        dataStore.getStadiums()[0];
      setStadium(stad);

      // 2. Clubes para badges
      clubesService.getAll().then(setAllClubs).catch(() => {});

      // 3. Elenco do Clube
      jogadoresService.getByClubId(managedClub.id).then(setSquad).catch(() => {});

      // 4. Partidas (Próximo jogo e Último resultado)
      jogosService.getByClubId(managedClub.id).then((matches) => {
        const scheduled = matches
          .filter((m) => m.status === 'SCHEDULED')
          .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
        const upcoming = scheduled[0] || null;

        const finished = matches
          .filter((m) => m.status === 'FINISHED')
          .sort((a, b) => b.round - a.round || b.date.localeCompare(a.date));
        const lastFinished = finished[0] || null;

        if (upcoming) setNextMatch(upcoming);
        if (lastFinished) setLastFinishedMatch(lastFinished);
      }).catch(() => {});

      // 5. Competição e Classificação
      competicoesService.getAll().then((comps) => {
        const league = comps.find((c) => c.type === 'LIGA') || comps[0];
        if (league) {
          setStandings(league.standings || []);
          setCurrentRound(league.currentRound || 1);
          setCompetitionName(league.name || 'Liga FM Universe');
        }
      }).catch(() => {});

      // 6. Notícias reais do sistema
      setIsLoadingNews(true);
      noticiasService.getAll().then((allNews) => {
        setNewsList(allNews);
      }).catch(() => {}).finally(() => {
        setIsLoadingNews(false);
      });
    }
  }, [managedClub]);

  // Estatísticas calculadas do elenco e finanças
  const squadSize = squad.length;
  const avgOverall = squadSize > 0
    ? Math.round(squad.reduce((acc, p) => acc + (p.overall || 70), 0) / squadSize)
    : 75;
  const totalWages = squad.reduce((acc, p) => acc + (p.wage || 0), 0);

  // Posição na tabela da classificação
  const currentStanding = standings.find((s) => s.clubId === managedClub?.id);
  const positionNumber = currentStanding?.position || 1;
  const pointsNumber = currentStanding?.points || 0;

  // Adversário do próximo jogo
  const isHomeMatch = nextMatch?.homeClubId === managedClub?.id;
  const opponentClubId = isHomeMatch ? nextMatch?.awayClubId : nextMatch?.homeClubId;
  const opponentClubName = isHomeMatch ? nextMatch?.awayClubName : nextMatch?.homeClubName;
  const opponentClub = allClubs.find((c) => c.id === opponentClubId);

  // Adversário do último resultado
  const isLastHome = lastFinishedMatch?.homeClubId === managedClub?.id;
  const lastOpponentName = isLastHome ? lastFinishedMatch?.awayClubName : lastFinishedMatch?.homeClubName;

  // Filtragem e busca da Central de Notícias
  const filteredNews = useMemo(() => {
    return newsList.filter((item) => {
      // Filtro de categoria
      if (newsFilter === 'MY_CLUB') {
        if (managedClub && item.clubId !== managedClub.id) return false;
      } else if (newsFilter === 'MARKET') {
        const isMarket =
          item.category === 'TRANSFERENCIAS' ||
          item.type?.includes('TRANSFER') ||
          item.type?.includes('AUCTION') ||
          item.type?.includes('LANCE');
        if (!isMarket) return false;
      } else if (newsFilter === 'MATCHES') {
        const isMatch =
          item.category === 'COMPETICAO' ||
          item.type === 'MATCH_RESULT' ||
          item.type === 'ROUND_COMPLETED';
        if (!isMatch) return false;
      } else if (newsFilter === 'FINANCES') {
        const isFinance =
          item.category === 'FINANCAS' ||
          item.category === 'ESTADIO' ||
          item.type === 'FINANCE_RECORD' ||
          item.type === 'STADIUM_UPGRADE';
        if (!isFinance) return false;
      }

      // Filtro de texto
      if (newsSearch.trim() !== '') {
        const q = newsSearch.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesSummary = item.summary?.toLowerCase().includes(q);
        const matchesClub = item.clubName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSummary && !matchesClub) return false;
      }

      return true;
    });
  }, [newsList, newsFilter, newsSearch, managedClub]);

  const unreadNewsCount = newsList.filter((n) => !n.isRead).length;

  const handleOpenNews = async (item: News) => {
    setSelectedNews(item);
    setIsNewsModalOpen(true);
    if (!item.isRead) {
      try {
        await noticiasService.markAsRead(item.id);
        setNewsList((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      } catch {
        // safe fallback
      }
    }
  };

  const handleMarkAllNewsRead = async () => {
    try {
      await noticiasService.markAllAsRead(managedClub?.id);
      setNewsList((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // safe fallback
    }
  };

  // Helper visual para ícones e badges temáticos de notícias
  const getNewsVisualMeta = (item: News) => {
    const type = item.type || '';
    const category = item.category || '';

    if (type.includes('AUCTION') || type.includes('LANCE')) {
      return {
        label: 'LEILÃO',
        badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        icon: Gavel,
      };
    }
    if (type === 'TRANSFER_COMPLETED' || type.includes('CONTRATADO')) {
      return {
        label: 'CONTRATAÇÃO',
        badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        icon: CheckCircle2,
      };
    }
    if (type.includes('TRANSFER') || category === 'TRANSFERENCIAS') {
      return {
        label: 'TRANSFERÊNCIA',
        badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        iconBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        icon: ArrowRightLeft,
      };
    }
    if (type === 'MATCH_RESULT' || category === 'COMPETICAO') {
      return {
        label: 'PARTIDA',
        badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
        iconBg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        icon: Trophy,
      };
    }
    if (type.includes('ROUND') || type.includes('RODADA')) {
      return {
        label: 'RODADA',
        badgeBg: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
        iconBg: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
        icon: Calendar,
      };
    }
    if (category === 'FINANCAS' || type === 'FINANCE_RECORD') {
      return {
        label: 'FINANÇAS',
        badgeBg: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        iconBg: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
        icon: DollarSign,
      };
    }
    if (category === 'ESTADIO' || type === 'STADIUM_UPGRADE') {
      return {
        label: 'ESTÁDIO',
        badgeBg: 'bg-amber-600/15 text-amber-300 border-amber-600/30',
        iconBg: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
        icon: Building2,
      };
    }

    return {
      label: 'COMUNICADO',
      badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
      iconBg: 'bg-purple-950/60 text-purple-400 border-purple-700/40',
      icon: Shield,
    };
  };

  if (!isAuthInitialized || (isLoadingManager && !managedClub)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-purple-300/80 font-bold uppercase tracking-widest">
          Inicializando Central de Comando do Clube...
        </p>
      </div>
    );
  }

  if (!managedClub) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-purple-950/60 border border-purple-700/40 flex items-center justify-center mb-4 text-purple-400">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-white uppercase tracking-tight mb-2">
          Nenhum Clube Vinculado
        </h2>
        <p className="text-xs text-zinc-400 mb-6">
          Seu perfil de Manager precisa de um clube oficial fundado ou vinculado para acessar a Central de Comando.
        </p>
        <button
          onClick={() => navigate('/manager/setup')}
          className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-950/60 transition-all cursor-pointer"
        >
          Fundar Meu Clube Agora
        </button>
      </div>
    );
  }

  const stadiumImage =
    stadium?.image ||
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80';
  const stadiumName = stadium?.name || managedClub.stadiumName || 'Arena Principal';
  const stadiumCapacity = stadium?.capacity || managedClub.capacity || 45000;
  const stadiumCity = stadium?.city || 'São Paulo, Brasil';

  return (
    <div className="space-y-5 pb-12">
      
      {/* 6. BLOCOS DE INFORMAÇÃO RÁPIDA (HUD SUPERIOR MODERNO) */}
      <section aria-label="Informações Rápidas do Clube" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Próximo Jogo */}
        <div
          onClick={() => navigate('/dashboard/tatica')}
          className="group p-3.5 rounded-2xl bg-[#0f0b1e]/90 hover:bg-[#140e29] border border-purple-900/30 hover:border-purple-600/50 transition-all shadow-md shadow-black/40 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[10px] font-black tracking-wider uppercase text-purple-300/80">
              PRÓXIMO JOGO
            </span>
            <Calendar className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm font-black text-white truncate group-hover:text-purple-200 transition-colors">
              {nextMatch ? (opponentClubName || 'Adversário') : 'Sem Jogos'}
            </div>
            <div className="text-[10px] font-bold text-zinc-400 truncate mt-0.5">
              {nextMatch ? `R${nextMatch.round} · ${isHomeMatch ? 'Casa' : 'Fora'}` : 'Aguardando rodada'}
            </div>
          </div>
        </div>

        {/* Card 2: Último Resultado */}
        <div
          onClick={() => navigate('/jogos')}
          className="group p-3.5 rounded-2xl bg-[#0f0b1e]/90 hover:bg-[#140e29] border border-purple-900/30 hover:border-purple-600/50 transition-all shadow-md shadow-black/40 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[10px] font-black tracking-wider uppercase text-purple-300/80">
              ÚLTIMO RESULTADO
            </span>
            <Activity className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-sm font-black text-white truncate font-mono group-hover:text-purple-200 transition-colors">
              {lastFinishedMatch
                ? `${lastFinishedMatch.homeScore} - ${lastFinishedMatch.awayScore}`
                : '0 - 0'}
            </div>
            <div className="text-[10px] font-bold text-zinc-400 truncate mt-0.5">
              {lastFinishedMatch ? `vs ${lastOpponentName}` : 'Início de Temporada'}
            </div>
          </div>
        </div>

        {/* Card 3: Posição na Tabela */}
        <div
          onClick={() => navigate('/competicoes')}
          className="group p-3.5 rounded-2xl bg-[#0f0b1e]/90 hover:bg-[#140e29] border border-purple-900/30 hover:border-purple-600/50 transition-all shadow-md shadow-black/40 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[10px] font-black tracking-wider uppercase text-purple-300/80">
              POSIÇÃO NA TABELA
            </span>
            <Trophy className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-lg font-black text-amber-300 font-mono leading-none">
              {positionNumber}º <span className="text-xs font-bold text-zinc-400">Lugar</span>
            </div>
            <div className="text-[10px] font-bold text-zinc-400 truncate mt-1">
              {pointsNumber} pts · Liga Nacional
            </div>
          </div>
        </div>

        {/* Card 4: Saldo em Caixa */}
        <div
          onClick={() => navigate('/dashboard/financas')}
          className="group p-3.5 rounded-2xl bg-[#0f0b1e]/90 hover:bg-[#140e29] border border-purple-900/30 hover:border-purple-600/50 transition-all shadow-md shadow-black/40 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[10px] font-black tracking-wider uppercase text-purple-300/80">
              SALDO EM CAIXA
            </span>
            <Wallet className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-base font-black text-emerald-400 font-mono leading-none">
              {formatCurrencyBRL(managedClub.balance, { compact: true })}
            </div>
            <div className="text-[10px] font-bold text-zinc-400 truncate mt-1">
              Disponível em caixa
            </div>
          </div>
        </div>

        {/* Card 5: Jogadores no Elenco */}
        <div
          onClick={() => navigate('/dashboard/elenco')}
          className="group p-3.5 rounded-2xl bg-[#0f0b1e]/90 hover:bg-[#140e29] border border-purple-900/30 hover:border-purple-600/50 transition-all shadow-md shadow-black/40 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[10px] font-black tracking-wider uppercase text-purple-300/80">
              JOGADORES NO ELENCO
            </span>
            <Users className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-lg font-black text-white font-mono leading-none">
              {squadSize} <span className="text-xs font-bold text-zinc-400">atletas</span>
            </div>
            <div className="text-[10px] font-bold text-purple-300 truncate mt-1">
              Média OVR: {avgOverall}
            </div>
          </div>
        </div>

        {/* Card 6: Folha Salarial */}
        <div
          onClick={() => navigate('/dashboard/financas')}
          className="group p-3.5 rounded-2xl bg-[#0f0b1e]/90 hover:bg-[#140e29] border border-purple-900/30 hover:border-purple-600/50 transition-all shadow-md shadow-black/40 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[10px] font-black tracking-wider uppercase text-purple-300/80">
              FOLHA SALARIAL
            </span>
            <FileText className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-base font-black text-purple-200 font-mono leading-none">
              {formatCurrencyBRL(totalWages, { compact: true, decimals: 0 })}
            </div>
            <div className="text-[10px] font-bold text-zinc-400 truncate mt-1">
              Despesa mensal
            </div>
          </div>
        </div>
      </section>

      {/* GRADE PRINCIPAL DE COMANDO DO CLUBE:
          ESQUERDA (Identidade) | CENTRO (Central de Notícias) | DIREITA (Próximo Jogo & Classificação) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* 2. COLUNA ESQUERDA — IDENTIDADE DO CLUBE */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="rounded-3xl overflow-hidden bg-[#0e0a1f] border border-purple-900/40 shadow-xl shadow-black/50">
            {/* Foto e Banner do Estádio em Destaque */}
            <div className="relative h-44 w-full overflow-hidden bg-zinc-950">
              <img
                src={stadiumImage}
                alt={stadiumName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center brightness-75 contrast-110 scale-105 hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0a1f] via-[#0e0a1f]/60 to-transparent" />
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 text-[10px] font-bold text-zinc-200 flex items-center gap-1.5 shadow-md">
                <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="truncate max-w-[150px]">{stadiumCity}</span>
              </div>
            </div>

            {/* Escudo do Clube em Destaque com visual premium */}
            <div className="relative px-5 pb-5 -mt-16 text-center flex flex-col items-center">
              <div className="p-2 rounded-2xl bg-[#0e0a1f] border-2 border-purple-500/80 shadow-2xl shadow-purple-950/80 mb-3 hover:scale-105 transition-transform">
                <ClubBadge club={managedClub} size="xl" className="shadow-lg" />
              </div>

              {/* Nome do Clube */}
              <h1 className="text-xl font-black text-white tracking-tight uppercase">
                {managedClub.name}
              </h1>

              {/* Divisão */}
              <p className="text-xs font-bold text-purple-400 mt-0.5">
                {(managedClub as any).division || '1ª Divisão · Liga FM Universe'}
              </p>

              {/* Posição Atual em Destaque */}
              <div className="mt-3 px-3 py-1 rounded-xl bg-purple-950/60 border border-purple-700/50 inline-flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-black text-white">
                  {positionNumber}º Lugar na Liga
                </span>
                <span className="text-[10px] font-mono text-purple-300">({pointsNumber} pts)</span>
              </div>

              {/* Estádio Detalhes */}
              <div className="w-full mt-5 pt-4 border-t border-purple-900/30 text-left space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Estádio:</span>
                  </span>
                  <span className="font-bold text-white truncate max-w-[140px] text-right" title={stadiumName}>
                    {stadiumName}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                    <span>Capacidade:</span>
                  </span>
                  <span className="font-extrabold text-white font-mono">
                    {Number(stadiumCapacity).toLocaleString('pt-BR')} lugares
                  </span>
                </div>
              </div>

              {/* Dados Financeiros do Clube */}
              <div className="w-full mt-4 pt-4 border-t border-purple-900/30 text-left space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Saldo em Caixa:</span>
                  </span>
                  <span className="font-black text-emerald-400 font-mono">
                    {formatCurrencyBRL(managedClub.balance, { compact: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Orçamento Transf.:</span>
                  </span>
                  <span className="font-bold text-white font-mono">
                    {formatCurrencyBRL(managedClub.transferBudget, { compact: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                    <span>Folha Salarial:</span>
                  </span>
                  <span className="font-bold text-purple-200 font-mono">
                    {formatCurrencyBRL(totalWages, { compact: true, decimals: 0 })}/mês
                  </span>
                </div>
              </div>

              {/* Ações Rápidas de Navegação */}
              <div className="w-full mt-5 pt-4 border-t border-purple-900/30 grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate('/dashboard/estadio')}
                  className="py-2 px-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 text-purple-200 text-[11px] font-bold transition-all cursor-pointer text-center"
                >
                  Estádio & Obras
                </button>
                <button
                  onClick={() => navigate('/dashboard/financas')}
                  className="py-2 px-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 text-purple-200 text-[11px] font-bold transition-all cursor-pointer text-center"
                >
                  Ver Finanças
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* 3. CENTRO — CENTRAL DE NOTÍCIAS (ÁREA PRINCIPAL E MAIS IMPORTANTE) */}
        <main className="lg:col-span-8 xl:col-span-6 space-y-4">
          <div className="rounded-3xl bg-[#0e0a1f] border border-purple-900/40 p-5 sm:p-6 shadow-xl shadow-black/50">
            
            {/* Cabeçalho do Painel CENTRAL DE NOTÍCIAS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-purple-900/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-purple-950/60 border border-purple-400/30 shrink-0">
                  <Sparkles className="w-5 h-5 text-purple-200" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight uppercase flex items-center gap-2">
                    <span>CENTRAL DE NOTÍCIAS</span>
                    {unreadNewsCount > 0 && (
                      <span className="bg-purple-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                        {unreadNewsCount} novas
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-purple-300/70">
                    Acontecimentos, propostas, leilões, rodadas e comunicados oficiais da liga
                  </p>
                </div>
              </div>

              {/* Botão de marcar todas como lidas */}
              {unreadNewsCount > 0 && (
                <button
                  onClick={handleMarkAllNewsRead}
                  className="self-start sm:self-auto text-xs font-bold text-purple-300 hover:text-white flex items-center gap-1.5 bg-purple-950/50 hover:bg-purple-900/60 px-3 py-1.5 rounded-xl border border-purple-800/40 transition-colors cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>Marcar todas como lidas</span>
                </button>
              )}
            </div>

            {/* Filtros e Busca Rápida */}
            <div className="py-3.5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-b border-purple-900/20">
              {/* Abas de Categoria */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { id: 'ALL', label: 'Todas' },
                  { id: 'MY_CLUB', label: 'Meu Clube' },
                  { id: 'MARKET', label: 'Mercado & Leilões' },
                  { id: 'MATCHES', label: 'Partidas' },
                  { id: 'FINANCES', label: 'Finanças' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setNewsFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                      newsFilter === f.id
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-950/60 border border-purple-400/30'
                        : 'bg-purple-950/30 hover:bg-purple-900/40 text-zinc-300 hover:text-white border border-purple-900/30'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Input de Busca */}
              <div className="relative shrink-0 sm:w-48">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar notícia..."
                  value={newsSearch}
                  onChange={(e) => setNewsSearch(e.target.value)}
                  className="w-full bg-[#0a0716] border border-purple-900/40 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Lista das Notícias Existentes */}
            <div className="mt-4 space-y-3 max-h-[720px] overflow-y-auto pr-1">
              {isLoadingNews ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  Carregando notícias da central...
                </div>
              ) : filteredNews.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 space-y-2">
                  <Shield className="w-8 h-8 mx-auto text-purple-500/40" />
                  <p className="text-sm font-bold text-zinc-300">Nenhuma notícia encontrada</p>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Não há comunicados correspondentes ao filtro selecionado no momento.
                  </p>
                </div>
              ) : (
                filteredNews.map((item) => {
                  const meta = getNewsVisualMeta(item);
                  const Icon = meta.icon;

                  return (
                    <article
                      key={item.id}
                      onClick={() => handleOpenNews(item)}
                      className={`group p-4 rounded-2xl border transition-all cursor-pointer flex gap-3.5 items-start ${
                        item.isRead
                          ? 'bg-[#0a0716]/60 hover:bg-[#120d26] border-purple-950/30 hover:border-purple-800/40 text-zinc-300'
                          : 'bg-purple-950/20 hover:bg-purple-950/40 border-purple-700/50 hover:border-purple-500/60 shadow-lg shadow-purple-950/20 text-white'
                      }`}
                    >
                      {/* Ícone ou Miniatura do Evento */}
                      <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${meta.iconBg}`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Conteúdo da Notícia */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {/* Badge de tipo de evento */}
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider ${meta.badgeBg}`}>
                            {meta.label}
                          </span>

                          {/* Clube ou autor */}
                          {item.clubName && (
                            <span className="text-[11px] font-bold text-purple-300/80 truncate">
                              {item.clubName}
                            </span>
                          )}

                          {/* Data / Hora */}
                          <span className="text-[10px] font-mono text-zinc-500 ml-auto flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3 text-zinc-600" />
                            <span>{item.date}</span>
                          </span>
                        </div>

                        {/* Título */}
                        <h3 className="text-sm font-black text-white group-hover:text-purple-200 transition-colors line-clamp-1 leading-snug">
                          {item.title}
                        </h3>

                        {/* Resumo */}
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.summary || item.content}
                        </p>
                      </div>

                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all shrink-0 self-center" />
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </main>

        {/* 4. BLOCO DO PRÓXIMO JOGO & 5. BLOCO DE CLASSIFICAÇÃO (COLUNA DIREITA) */}
        <section aria-label="Painéis de Partida e Classificação" className="lg:col-span-12 xl:col-span-3 space-y-4">
          
          {/* 4. BLOCO DO PRÓXIMO JOGO */}
          <div className="rounded-3xl bg-[#0e0a1f] border border-purple-900/40 p-5 shadow-xl shadow-black/50">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-900/30">
              <span className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-purple-400" />
                <span>PRÓXIMO JOGO</span>
              </span>
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Rodada {nextMatch?.round || currentRound}
              </span>
            </div>

            {nextMatch ? (
              <div className="space-y-4">
                {/* Competição */}
                <div className="text-center">
                  <span className="text-[11px] font-extrabold text-purple-300">
                    {nextMatch.competitionName || competitionName}
                  </span>
                </div>

                {/* Confronto Duelo Visual: Próprio Clube vs Adversário */}
                <div className="flex items-center justify-between py-2">
                  {/* Próprio Clube */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-0">
                    <div className="p-1 rounded-2xl bg-purple-950/40 border border-purple-600/40 mb-1.5 shadow-md">
                      <ClubBadge club={managedClub} size="lg" />
                    </div>
                    <span className="text-xs font-black text-white truncate max-w-[90px]">
                      {managedClub.name}
                    </span>
                    <span className="text-[9px] font-bold text-purple-400 uppercase mt-0.5">
                      {isHomeMatch ? 'Mandante' : 'Visitante'}
                    </span>
                  </div>

                  {/* Divisor VS */}
                  <div className="px-2 text-center">
                    <span className="text-sm font-black text-purple-400 font-mono">VS</span>
                  </div>

                  {/* Clube Adversário */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-0">
                    <div className="p-1 rounded-2xl bg-zinc-900 border border-zinc-700/60 mb-1.5 shadow-md">
                      <ClubBadge club={opponentClub || { name: opponentClubName }} size="lg" />
                    </div>
                    <span className="text-xs font-black text-white truncate max-w-[90px]">
                      {opponentClubName || 'Adversário'}
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase mt-0.5">
                      {!isHomeMatch ? 'Mandante' : 'Visitante'}
                    </span>
                  </div>
                </div>

                {/* Dados de Horário, Data e Estádio */}
                <div className="pt-3 border-t border-purple-900/30 text-center space-y-1">
                  <div className="text-xs font-bold text-white flex items-center justify-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    <span>{nextMatch.date} às {nextMatch.time || '16:00'}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate flex items-center justify-center gap-1">
                    <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                    <span className="truncate">{nextMatch.stadiumName || stadiumName}</span>
                  </div>
                </div>

                {/* Botão Ação Rápida: Tática */}
                <button
                  onClick={() => navigate('/dashboard/tatica')}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-purple-950/60 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Definir Tática & Escalação</span>
                </button>
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-500 text-xs space-y-1">
                <Clock className="w-6 h-6 mx-auto text-zinc-600 mb-1" />
                <p>Nenhuma partida agendada.</p>
                <p className="text-[10px]">Aguardando motor de rodadas da temporada.</p>
              </div>
            )}
          </div>

          {/* 5. BLOCO DE CLASSIFICAÇÃO */}
          <div className="rounded-3xl bg-[#0e0a1f] border border-purple-900/40 p-5 shadow-xl shadow-black/50">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-900/30">
              <span className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>CLASSIFICAÇÃO</span>
              </span>
              <button
                onClick={() => navigate('/competicoes')}
                className="text-[10px] font-extrabold text-purple-400 hover:text-purple-200 transition-colors cursor-pointer"
              >
                Tabela Completa
              </button>
            </div>

            {/* Tabela de Classificação da Competição Atual */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] text-zinc-500 uppercase border-b border-purple-900/30 font-bold">
                  <tr>
                    <th className="pb-2 w-6 text-center">Pos</th>
                    <th className="pb-2">Clube</th>
                    <th className="pb-2 text-center w-8">J</th>
                    <th className="pb-2 text-center w-8">SG</th>
                    <th className="pb-2 text-right w-10">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-950/30 text-xs">
                  {standings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-zinc-500 text-xs">
                        Aguardando início dos confrontos.
                      </td>
                    </tr>
                  ) : (
                    standings.slice(0, 8).map((st) => {
                      const isMyClub = st.clubId === managedClub.id;
                      const cObj = allClubs.find((c) => c.id === st.clubId);

                      return (
                        <tr
                          key={st.clubId}
                          className={`transition-colors ${
                            isMyClub
                              ? 'bg-purple-600/20 text-white font-extrabold'
                              : 'hover:bg-purple-950/20 text-zinc-300'
                          }`}
                        >
                          <td className={`py-2 text-center font-mono ${isMyClub ? 'text-purple-300 font-black' : 'text-zinc-500'}`}>
                            {st.position}º
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-1.5 truncate max-w-[120px]">
                              <ClubBadge club={cObj || { name: st.clubName }} size="xs" className="shrink-0" />
                              <span className="truncate">{st.clubName}</span>
                            </div>
                          </td>
                          <td className="py-2 text-center font-mono text-zinc-400">
                            {st.played || 0}
                          </td>
                          <td className="py-2 text-center font-mono text-zinc-400">
                            {(st.goalDifference || 0) > 0 ? `+${st.goalDifference}` : st.goalDifference || 0}
                          </td>
                          <td className={`py-2 text-right font-mono font-black ${isMyClub ? 'text-amber-300' : 'text-white'}`}>
                            {st.points || 0}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-2.5 border-t border-purple-900/30 flex items-center justify-between text-[10px] text-zinc-500">
              <span>{competitionName}</span>
              <span className="text-purple-400 font-bold">Rodada {currentRound}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Modal de Leitura Detalhada de Notícia (Reutilizando componente existente) */}
      <NewsDetailModal
        news={selectedNews}
        isOpen={isNewsModalOpen}
        onClose={() => {
          setIsNewsModalOpen(false);
          setSelectedNews(null);
        }}
      />
    </div>
  );
};
