import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { financasService } from '../../services/financasService';
import { adminFinancasService } from '../../services/adminFinancasService';
import { caixaRealService } from '../../services/caixaRealService';
import { FinancialReport, ClubFinancialConfig, FinanceRecord, FinancialOperationType } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building,
  Users,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Award,
  Tv,
  Calendar,
  Shield,
  Info,
  BookOpen,
  Filter,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  Lock,
  FileText,
  Clock,
} from 'lucide-react';

interface MonthOption {
  month: number;
  year: number;
  label: string;
}

const SEASON_MONTHS: MonthOption[] = [
  { month: 8, year: 2026, label: 'Agosto / 2026 (Mês 1)' },
  { month: 9, year: 2026, label: 'Setembro / 2026 (Mês 2)' },
  { month: 10, year: 2026, label: 'Outubro / 2026 (Mês 3)' },
  { month: 11, year: 2026, label: 'Novembro / 2026 (Mês 4)' },
  { month: 12, year: 2026, label: 'Dezembro / 2026 (Mês 5)' },
  { month: 1, year: 2027, label: 'Janeiro / 2027 (Mês 6)' },
  { month: 2, year: 2027, label: 'Fevereiro / 2027 (Mês 7)' },
  { month: 3, year: 2027, label: 'Março / 2027 (Mês 8)' },
  { month: 4, year: 2027, label: 'Abril / 2027 (Mês 9)' },
  { month: 5, year: 2027, label: 'Maio / 2027 (Mês 10)' },
];

const OPERATION_TYPE_LABELS: Record<FinancialOperationType, { label: string; badgeClass: string }> = {
  INITIAL_BUDGET: { label: 'Caixa Inicial', badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' },
  MATCH_TICKET_REVENUE: { label: 'Bilheteria', badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' },
  SPONSORSHIP_REVENUE: { label: 'Patrocínio', badgeClass: 'bg-teal-950/80 text-teal-300 border-teal-800/60' },
  PRIZE_REVENUE: { label: 'Premiação', badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60' },
  TV_REVENUE: { label: 'Direitos de TV', badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60' },
  PLAYER_SALE: { label: 'Venda de Jogador', badgeClass: 'bg-green-950/80 text-green-300 border-green-800/60' },
  TRANSFER_PURCHASE: { label: 'Compra de Jogador', badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/60' },
  SALARY_PAYMENT: { label: 'Folha Salarial', badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/60' },
  OTHER_EXPENSE: { label: 'Despesa Operacional', badgeClass: 'bg-slate-800 text-slate-300 border-slate-700' },
};

export const FinancasPage: React.FC = () => {
  const { managedClub } = useAuth();
  const [finances, setFinances] = useState<FinancialReport | null>(null);
  const [adminConfig, setAdminConfig] = useState<ClubFinancialConfig | null>(null);
  const [ledgerRecords, setLedgerRecords] = useState<FinanceRecord[]>([]);
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<string>('ALL');
  const [selectedOperationFilter, setSelectedOperationFilter] = useState<string>('ALL');
  const [selectedSeasonFilter, setSelectedSeasonFilter] = useState<string>('2026/2027');
  const [boardRequestStatus, setBoardRequestStatus] = useState<string | null>(null);

  // Fechamento Mensal
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0);
  const [isProcessingClosure, setIsProcessingClosure] = useState<boolean>(false);
  const [closureFeedback, setClosureFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    if (!managedClub) return;
    const [fin, cfg, recs] = await Promise.all([
      financasService.getByClubId(managedClub.id),
      adminFinancasService.getConfigByClubId(managedClub.id, selectedSeasonFilter),
      financasService.getRecordsByClubId(managedClub.id, selectedSeasonFilter),
    ]);
    setFinances(fin);
    setAdminConfig(cfg);
    setLedgerRecords(recs || []);
  };

  useEffect(() => {
    loadData();
  }, [managedClub, selectedSeasonFilter]);

  if (!finances || !managedClub) {
    return (
      <div className="text-center py-16 text-slate-400">
        Carregando balancete contábil do clube...
      </div>
    );
  }

  const handleRequestBoardFunds = () => {
    setBoardRequestStatus('Solicitação enviada ao Conselho Deliberativo. Aguardando aprovação na reunião mensal.');
    setTimeout(() => setBoardRequestStatus(null), 4000);
  };

  // Executar Fechamento Mensal Contábil
  const handleExecuteClosure = async () => {
    const opt = SEASON_MONTHS[selectedMonthIndex];
    if (!opt || !managedClub) return;

    setIsProcessingClosure(true);
    setClosureFeedback(null);

    try {
      const res = await caixaRealService.executeMonthlyClosure({
        clubId: managedClub.id,
        monthYear: opt.label,
        seasonId: '2026/2027',
      });
      if (res.success && res.closure) {
        setClosureFeedback({
          type: 'success',
          message: `Fechamento do mês ${opt.label} homologado com sucesso! Receita de Patrocínio: ${formatCurrencyBRL(res.closure.totalSponsorships)}. Despesa de Folha: ${formatCurrencyBRL(res.closure.totalSalaries)}. Saldo Resultante em Caixa: ${formatCurrencyBRL(res.closure.balanceAfter)}.`,
        });
        await loadData();
      } else {
        setClosureFeedback({
          type: 'error',
          message: res.error || 'Não foi possível concluir o fechamento deste mês.',
        });
      }
    } catch (err: unknown) {
      setClosureFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao processar fechamento mensal.',
      });
    } finally {
      setIsProcessingClosure(false);
    }
  };

  const selectedMonthOption = SEASON_MONTHS[selectedMonthIndex];
  const isSelectedMonthAlreadyClosed = managedClub
    ? caixaRealService.isMonthClosed(managedClub.id, selectedMonthOption.label)
    : false;

  const totalIncomes =
    finances.incomes.ticketSales +
    finances.incomes.sponsorships +
    finances.incomes.tvRights +
    finances.incomes.merchandising +
    finances.incomes.prizeMoney;

  const totalExpenses =
    finances.expenses.playerWages +
    finances.expenses.staffWages +
    finances.expenses.stadiumMaintenance +
    finances.expenses.youthAcademy;

  const currentMonthlyWages = finances.expenses.playerWages + finances.expenses.staffWages;
  const isOverWageBudget = currentMonthlyWages > finances.wageBudget;
  const isDeficitBalance = finances.balance < 0;

  // Filtragem do Livro Caixa
  const filteredRecords = ledgerRecords.filter((record) => {
    const matchesRound =
      selectedRoundFilter === 'ALL' || record.round === Number(selectedRoundFilter);
    const matchesOp =
      selectedOperationFilter === 'ALL' || record.operationType === selectedOperationFilter;
    return matchesRound && matchesOp;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            <span>Saúde Financeira & Contabilidade • {managedClub.name}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Contabilidade de clube de futebol real: fluxo de caixa oficial, auditoria de transações e fechamentos mensais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Atualizar balancete"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={handleRequestBoardFunds}
            className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Pedir Aumento de Orçamento
          </button>
        </div>
      </div>

      {/* Alerta de Déficit no Caixa Real se estiver negativo */}
      {isDeficitBalance && (
        <div className="bg-rose-950/80 border-2 border-rose-600/80 text-rose-200 p-4 rounded-xl flex items-start gap-3 shadow-lg shadow-rose-950/50">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <strong className="text-sm font-bold text-white block">
              DÉFICIT FINANCEIRO NO CAIXA REAL: {formatCurrencyBRL(finances.balance)}
            </strong>
            <p className="text-rose-200 leading-relaxed">
              O clube gastou mais do que possui em caixa real. Novas contratações em leilões e transferências estão <span className="font-bold underline">bloqueadas pelo Conselho Fiscal</span> até que o saldo volte a ficar positivo através de receitas de bilheteria, patrocínio ou venda de atletas.
            </p>
          </div>
        </div>
      )}

      {boardRequestStatus && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{boardRequestStatus}</span>
        </div>
      )}

      {/* Card Educativo das Regras Oficiais de Caixa Real */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-white">Regra Contábil do FM Universe:</strong> O <span className="text-emerald-400 font-bold">Caixa Real</span> é o dinheiro bancário efetivo do clube. O <span className="text-purple-300 font-bold">Orçamento de Transferências</span> é apenas um teto de planejamento (não soma ao caixa). Operações sem saldo suficiente são estritamente bloqueadas.
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 whitespace-nowrap self-start md:self-auto">
          Auditado por Partida & Mês
        </span>
      </div>

      {/* 4 Pilares Econômicos Segregados (Estrutura FM Universe) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. CAIXA REAL (Dinheiro Real Disponível) */}
        <div className={`bg-slate-900 border-2 p-4 rounded-xl shadow-lg ${
          isDeficitBalance
            ? 'border-rose-500/80 shadow-rose-950/30'
            : 'border-emerald-500/50 shadow-emerald-950/20'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-emerald-400 block uppercase">1. Caixa Real</span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
              isDeficitBalance
                ? 'bg-rose-950 text-rose-300 border-rose-800/60 font-bold'
                : 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
            }`}>
              {isDeficitBalance ? 'Déficit' : 'Disponível'}
            </span>
          </div>
          <span className={`text-xl sm:text-2xl font-black font-mono ${
            isDeficitBalance ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {formatCurrencyBRL(finances.balance, { compact: true })}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            Dinheiro real bancário do clube
          </span>
        </div>

        {/* 2. ORÇAMENTO DE TRANSFERÊNCIAS (Teto de Compras) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-200 block uppercase">2. Orç. Transferências</span>
            <span className="text-[9px] font-mono bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800/60">
              Teto de Gastos
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-white font-mono">
            {formatCurrencyBRL(finances.transferBudget, { compact: true })}
          </span>
          <span className="text-[11px] text-purple-300 block mt-1">
            Limite máx. aprovado pela diretoria
          </span>
        </div>

        {/* 3. TETO SALARIAL MENSAL */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-cyan-300 block uppercase">3. Teto Salarial</span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
              isOverWageBudget
                ? 'bg-rose-950 text-rose-300 border-rose-800/60 font-bold'
                : 'bg-cyan-950 text-cyan-300 border-cyan-800/60'
            }`}>
              {isOverWageBudget ? 'Excedido' : 'Teto Mensal'}
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-cyan-300 font-mono">
            {formatCurrencyBRL(finances.wageBudget, { compact: true, decimals: 2 })}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            Folha atual: {formatCurrencyBRL(currentMonthlyWages, { compact: true, decimals: 2 })}/mês
          </span>
        </div>

        {/* 4. RECEITAS FUTURAS HOMOLOGADAS (Projeção) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-300 block uppercase">4. Receitas Futuras</span>
            <span className="text-[9px] font-mono bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/60">
              Projeção
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
            {formatCurrencyBRL(
              adminConfig
                ? (adminConfig.tvRights.amountPerRound * 38 + adminConfig.tvRights.amountPerCompetition) +
                  adminConfig.sponsors.reduce((acc, s) => acc + (s.contractValue || 0), 0) +
                  adminConfig.matchday.estimatedMatchRevenue * 19 +
                  adminConfig.matchday.memberSubscriptionRevenueMonthly * 12
                : totalIncomes * 12,
              { compact: true }
            )}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            Não soma ao caixa até recebimento
          </span>
        </div>
      </div>

      {/* ROTINA DE FECHAMENTO MENSAL CONTÁBIL */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <h2 className="font-bold text-base text-white uppercase tracking-wider">
                Rotina de Fechamento Mensal Contábil
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Liquidação formal da folha salarial (jogadores + comissão) e recebimento oficial dos patrocínios mensais no Caixa Real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Mês da Temporada:</span>
            <select
              value={selectedMonthIndex}
              onChange={(e) => {
                setSelectedMonthIndex(Number(e.target.value));
                setClosureFeedback(null);
              }}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg focus:border-emerald-500 outline-none cursor-pointer font-sans"
            >
              {SEASON_MONTHS.map((m, idx) => (
                <option key={idx} value={idx}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feedback do Fechamento */}
        {closureFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              closureFeedback.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-200'
                : 'bg-rose-950/70 border-rose-600/70 text-rose-200'
            }`}
          >
            {closureFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{closureFeedback.message}</span>
          </div>
        )}

        {/* Resumo do Mês Selecionado */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Status do Mês</span>
            <div className="flex items-center gap-1.5 pt-0.5">
              {isSelectedMonthAlreadyClosed ? (
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" /> Fechado & Liquidado
                </span>
              ) : (
                <span className="bg-amber-950/80 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" /> Pendente de Liquidação
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 block">
              {isSelectedMonthAlreadyClosed ? 'Lançamentos já integrados ao Caixa Real' : 'Aguardando processamento'}
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-emerald-400 uppercase font-bold block">(+) Patrocínios do Mês</span>
            <span className="font-mono font-bold text-emerald-400 text-sm block pt-0.5">
              +{formatCurrencyBRL(finances.incomes.sponsorships)}
            </span>
            <span className="text-[10px] text-slate-500 block">Entra no Caixa Real no fechamento</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-rose-400 uppercase font-bold block">(-) Folha Mensal (Elenco + Staff)</span>
            <span className="font-mono font-bold text-rose-400 text-sm block pt-0.5">
              -{formatCurrencyBRL(currentMonthlyWages)}
            </span>
            <span className="text-[10px] text-slate-500 block">Pagamento único mensal do clube</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-cyan-300 uppercase font-bold block">(=) Impacto Líquido Mensal</span>
            <span className={`font-mono font-bold text-sm block pt-0.5 ${
              finances.incomes.sponsorships - currentMonthlyWages >= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}>
              {finances.incomes.sponsorships - currentMonthlyWages >= 0 ? '+' : ''}
              {formatCurrencyBRL(finances.incomes.sponsorships - currentMonthlyWages)}
            </span>
            <span className="text-[10px] text-slate-500 block">Variação do Caixa no fechamento</span>
          </div>
        </div>

        {/* Ação de Fechamento */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-slate-400">
            * O fechamento mensal impede duplicidades de salário ou patrocínio no mesmo mês. Salários não são deduzidos diariamente.
          </p>

          <button
            onClick={handleExecuteClosure}
            disabled={isSelectedMonthAlreadyClosed || isProcessingClosure}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              isSelectedMonthAlreadyClosed
                ? 'bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
            }`}
          >
            {isProcessingClosure ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processando Fechamento...</span>
              </>
            ) : isSelectedMonthAlreadyClosed ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mês Já Fechado</span>
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                <span>Executar Fechamento de {selectedMonthOption.label}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Income and Expense Detailed Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Incomes */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h2 className="font-bold text-sm text-white uppercase tracking-wider">
                Fontes de Receita Mensal
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Total: {formatCurrencyBRL(totalIncomes, { compact: true, decimals: 2 })}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Bilheteria & Matchday</span>
                <span className="text-[10px] text-slate-500">Creditado automaticamente nos jogos em casa (mandante)</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {formatCurrencyBRL(finances.incomes.ticketSales, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Contratos de Patrocínio Master</span>
                <span className="text-[10px] text-slate-500">Creditado no Caixa Real no fechamento mensal</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {formatCurrencyBRL(finances.incomes.sponsorships, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Cotas de TV & Direitos de Transmissão</span>
                <span className="text-[10px] text-slate-500">Creditado a cada rodada homologada disputada</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {formatCurrencyBRL(finances.incomes.tvRights, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Venda de Camisas & Merchandising</span>
                <span className="text-[10px] text-slate-500">Receitas de produtos do clube por rodada</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {formatCurrencyBRL(finances.incomes.merchandising, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Premiações de Jogos & Bônus</span>
                <span className="text-[10px] text-slate-500">Bonificação por vitórias e empates conquistados</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {formatCurrencyBRL(finances.incomes.prizeMoney, { compact: true, decimals: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <h2 className="font-bold text-sm text-white uppercase tracking-wider">
                Despesas & Custos Fixos
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-rose-400">
              Total: {formatCurrencyBRL(totalExpenses, { compact: true, decimals: 2 })}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Folha Salarial do Elenco Principal</span>
                <span className="text-[10px] text-slate-500">Somatório dos salários dos jogadores (pago mensalmente)</span>
              </div>
              <span className="font-mono font-bold text-rose-400">
                {formatCurrencyBRL(finances.expenses.playerWages, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Salários da Comissão Técnica & Staff</span>
                <span className="text-[10px] text-slate-500">Treinador, auxiliares e profissionais do clube</span>
              </div>
              <span className="font-mono font-bold text-rose-400">
                {formatCurrencyBRL(finances.expenses.staffWages, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Manutenção do Estádio & Operação de Jogos</span>
                <span className="text-[10px] text-slate-500">Custos de matchday nos jogos com mando de campo</span>
              </div>
              <span className="font-mono font-bold text-rose-400">
                {formatCurrencyBRL(finances.expenses.stadiumMaintenance, { compact: true, decimals: 0 })}
              </span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-300 block font-medium">Estrutura das Categorias de Base</span>
                <span className="text-[10px] text-slate-500">Manutenção de instalações e formação de jovens talentos</span>
              </div>
              <span className="font-mono font-bold text-rose-400">
                {formatCurrencyBRL(finances.expenses.youthAcademy, { compact: true, decimals: 0 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* LIVRO CAIXA & EXTRATO CONTÁBIL HISTÓRICO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              <h2 className="font-bold text-base text-white uppercase tracking-wider">
                Extrato Financeiro Oficial & Fluxo de Caixa
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Registro cronológico auditado de todas as movimentações reais no Caixa Real (leilões, transferências, bilheterias e salários).
            </p>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Filtro por Temporada */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px]">Exercício:</span>
              <select
                value={selectedSeasonFilter}
                onChange={(e) => setSelectedSeasonFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-emerald-400 font-bold text-xs px-2.5 py-1.5 rounded-lg focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="2026/2027">Temporada 2026/2027 (Atual)</option>
                <option value="2025/2026">Temporada 2025/2026 (Histórico)</option>
                <option value="ALL">Todas as Temporadas</option>
              </select>
            </div>

            {/* Filtro por Tipo de Operação */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px]">Tipo de Operação:</span>
              <select
                value={selectedOperationFilter}
                onChange={(e) => setSelectedOperationFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="ALL">Todas as Operações</option>
                <option value="INITIAL_BUDGET">Caixa Inicial</option>
                <option value="MATCH_TICKET_REVENUE">Bilheteria</option>
                <option value="SPONSORSHIP_REVENUE">Patrocínio</option>
                <option value="PRIZE_REVENUE">Premiação</option>
                <option value="TV_REVENUE">Direitos de TV</option>
                <option value="PLAYER_SALE">Venda de Jogador</option>
                <option value="TRANSFER_PURCHASE">Compra de Jogador</option>
                <option value="SALARY_PAYMENT">Pagamento de Salários</option>
                <option value="OTHER_EXPENSE">Outras Despesas</option>
              </select>
            </div>

            {/* Filtro por Rodada */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                <Filter className="w-3 h-3" /> Rodada:
              </span>
              <select
                value={selectedRoundFilter}
                onChange={(e) => setSelectedRoundFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg focus:border-emerald-500 outline-none cursor-pointer font-mono"
              >
                <option value="ALL">Todas</option>
                {Array.from(
                  new Set<number>(
                    ledgerRecords
                      .map((r) => r.round)
                      .filter((rnd): rnd is number => typeof rnd === 'number')
                  )
                )
                  .sort((a: number, b: number) => b - a)
                  .map((r: number) => (
                    <option key={r} value={String(r)}>
                      {r}ª Rodada
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tabela de Lançamentos */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Tipo de Operação</th>
                <th className="p-3">Descrição</th>
                <th className="p-3">Entrada / Saída</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-right">Saldo em Caixa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredRecords.map((record) => {
                const isIncome = record.type === 'INCOME' || record.inOut === 'IN' || record.inOut === 'CREDIT';
                const opInfo = record.operationType && OPERATION_TYPE_LABELS[record.operationType]
                  ? OPERATION_TYPE_LABELS[record.operationType]
                  : {
                      label: record.transactionType || record.category || 'Movimentação',
                      badgeClass: isIncome
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                        : 'bg-rose-950/80 text-rose-300 border-rose-800/60',
                    };

                return (
                  <tr key={record.id} className="hover:bg-slate-900/40 text-slate-300">
                    <td className="p-3 text-slate-400 whitespace-nowrap">{record.date}</td>
                    <td className="p-3 whitespace-nowrap font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${opInfo.badgeClass}`}>
                        {opInfo.label}
                      </span>
                    </td>
                    <td className="p-3 text-slate-200 font-sans max-w-sm truncate">
                      {record.description}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          isIncome
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                        }`}
                      >
                        {isIncome ? 'ENTRADA (+)' : 'SAÍDA (-)'}
                      </span>
                    </td>
                    <td
                      className={`p-3 text-right font-bold whitespace-nowrap ${
                        isIncome ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {formatCurrencyBRL(record.amount)}
                    </td>
                    <td className="p-3 text-right text-slate-200 font-bold whitespace-nowrap">
                      {record.balanceAfter !== undefined
                        ? formatCurrencyBRL(record.balanceAfter)
                        : '-'}
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-sans italic">
                    Nenhum lançamento contábil encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Fonte de verdade: Toda movimentação é auditada no Caixa Real do clube.
          </span>
          <span className="font-mono">
            Registros exibidos: {filteredRecords.length} de {ledgerRecords.length}
          </span>
        </div>
      </div>
    </div>
  );
};
