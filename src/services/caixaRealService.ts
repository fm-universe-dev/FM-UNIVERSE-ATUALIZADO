import { Club, FinanceRecord, FinancialOperationType, MonthlyFinancialClosure } from '../types';
import { isFirebaseConfigured, firestoreDb, getFirestoreDb } from '../config/firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { dataStore } from './dataStore';
import { clubesService } from './clubesService';
import { adminFinancasService } from './adminFinancasService';

const STORAGE_KEY_CLOSURES = 'fmu_monthly_closures';

export interface ProcessTransactionParams {
  clubId: string;
  seasonId?: string;
  operationType: FinancialOperationType;
  amount: number;
  inOut: 'IN' | 'OUT';
  description: string;
  referenceId?: string;
  origin?: string;
  date?: string;
  round?: number;
  allowNegativeBalance?: boolean;
}

export interface TransactionResult {
  success: boolean;
  error?: string;
  record?: FinanceRecord;
  balanceBefore?: number;
  balanceAfter?: number;
}

export const caixaRealService = {
  /**
   * Obtém o Caixa Real atual de um clube.
   * O Caixa Real (club.balance) é a única fonte de verdade do dinheiro do clube.
   */
  async getBalance(clubId: string): Promise<number> {
    const club = await clubesService.getById(clubId);
    if (club && typeof club.balance === 'number') {
      return club.balance;
    }
    const local = dataStore.getClubById(clubId);
    if (local && typeof local.balance === 'number') {
      return local.balance;
    }
    return 20000000;
  },

  /**
   * Valida se o clube possui saldo suficiente no Caixa Real antes de qualquer saída definitiva.
   * Regra: saldo atual >= valor da operação.
   * Não permite que uma saída deixe o Caixa Real negativo.
   */
  async validateOperation(clubId: string, amount: number): Promise<{ valid: boolean; currentBalance: number; error?: string }> {
    const currentBalance = await this.getBalance(clubId);
    if (currentBalance < amount) {
      return {
        valid: false,
        currentBalance,
        error: 'Saldo insuficiente no Caixa Real.',
      };
    }
    return {
      valid: true,
      currentBalance,
    };
  },

  /**
   * Executa uma movimentação no Caixa Real com auditoria contábil rigorosa.
   * Atualiza club.balance, gera o lançamento oficial no Livro Caixa com saldo anterior e posterior,
   * e persiste tanto localmente quanto no Firebase Firestore.
   */
  async processTransaction(params: ProcessTransactionParams): Promise<TransactionResult> {
    const {
      clubId,
      seasonId = '2026/2027',
      operationType,
      amount,
      inOut,
      description,
      referenceId,
      origin = 'SISTEMA_FINANCEIRO',
      date = new Date().toISOString().split('T')[0],
      round,
      allowNegativeBalance = false,
    } = params;

    if (amount <= 0) {
      return { success: false, error: 'O valor da operação deve ser maior que zero.' };
    }

    // 1. Busca o clube
    let club = await clubesService.getById(clubId);
    if (!club) {
      club = dataStore.getClubById(clubId) || null;
    }
    if (!club) {
      return { success: false, error: 'Clube não encontrado para a operação financeira.' };
    }

    // 1.1 Determina o saldo anterior através do histórico oficial isolado da temporada atual
    const balanceBefore = this.calculateRealBalanceFromHistory(
      clubId,
      seasonId,
      Number(club.balance ?? 25000000)
    );

    // 2. Validação estrita de saldo para saídas
    if (inOut === 'OUT' && !allowNegativeBalance) {
      if (balanceBefore < amount) {
        return {
          success: false,
          error: 'Saldo insuficiente no Caixa Real.',
          balanceBefore,
          balanceAfter: balanceBefore,
        };
      }
    }

    // 3. Cálculo do novo saldo real
    const balanceAfter = inOut === 'IN' ? balanceBefore + amount : balanceBefore - amount;
    club.balance = balanceAfter;
    club.updatedAt = new Date().toISOString();

    // 4. Salva o clube atomicamente
    await clubesService.save(club);
    dataStore.saveClub(club);

    // Sincroniza sessão ativa no localStorage se for o clube sob gestão
    try {
      const storedClubRaw = localStorage.getItem('fmu_current_managed_club');
      if (storedClubRaw) {
        const storedClub = JSON.parse(storedClubRaw);
        if (storedClub.id === club.id || storedClub.name === club.name) {
          localStorage.setItem('fmu_current_managed_club', JSON.stringify(club));
        }
      }
    } catch {
      // ignore
    }

    // 5. Gera o lançamento auditado no Livro Caixa
    const recordId = `fin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record: FinanceRecord = {
      id: recordId,
      clubId,
      seasonId,
      season: seasonId,
      round,
      operationType,
      type: inOut === 'IN' ? 'INCOME' : 'EXPENSE',
      inOut: inOut === 'IN' ? 'CREDIT' : 'DEBIT',
      category: operationType,
      transactionType: description,
      description,
      amount,
      balanceBefore,
      balanceAfter,
      date,
      origin,
      referenceId,
    };

    // 6. Persistência contábil
    dataStore.addFinanceRecord(record);

    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const recordRef = doc(db, 'extratoFinanceiro', recordId);
        const cleanRecord = Object.fromEntries(
          Object.entries(record).filter(([_, v]) => v !== undefined)
        );
        await setDoc(recordRef, cleanRecord);
      } catch (err) {
        console.warn('Persistência do extrato financeiro no Firestore usou modo offline:', err);
      }
    }

    return {
      success: true,
      record,
      balanceBefore,
      balanceAfter,
    };
  },

  /**
   * Registra a compra definitiva de um jogador com saída no Caixa Real.
   * Se o vendedor for um clube do sistema, credita seu Caixa Real simultaneamente.
   */
  async processTransferPurchase(params: {
    buyerClubId: string;
    sellerClubId?: string;
    fee: number;
    playerName: string;
    playerId: string;
    offerId?: string;
    seasonId?: string;
    isAuction?: boolean;
  }): Promise<{ success: boolean; error?: string; buyerRecord?: FinanceRecord; sellerRecord?: FinanceRecord }> {
    const { buyerClubId, sellerClubId, fee, playerName, playerId, offerId, seasonId = '2026/2027', isAuction } = params;

    // 1. Valida saldo do comprador
    const validation = await this.validateOperation(buyerClubId, fee);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Saldo insuficiente no Caixa Real.' };
    }

    // 2. Débito no comprador
    const buyerDesc = isAuction
      ? `Contratação em leilão de ${playerName}`
      : `Contratação de ${playerName}`;

    const buyerTx = await this.processTransaction({
      clubId: buyerClubId,
      seasonId,
      operationType: 'TRANSFER_PURCHASE',
      amount: fee,
      inOut: 'OUT',
      description: buyerDesc,
      referenceId: offerId || playerId,
      origin: isAuction ? 'LEILAO_V3' : 'TRANSFERENCIA_DIRETA',
    });

    if (!buyerTx.success) {
      return { success: false, error: buyerTx.error };
    }

    // 3. Crédito no vendedor se for clube do sistema
    let sellerRecord: FinanceRecord | undefined;
    if (sellerClubId && sellerClubId !== 'free-agents' && sellerClubId !== 'mercado' && sellerClubId !== buyerClubId) {
      const sellerDesc = `Venda de ${playerName}`;
      const sellerTx = await this.processTransaction({
        clubId: sellerClubId,
        seasonId,
        operationType: 'PLAYER_SALE',
        amount: fee,
        inOut: 'IN',
        description: sellerDesc,
        referenceId: offerId || playerId,
        origin: isAuction ? 'LEILAO_V3' : 'TRANSFERENCIA_DIRETA',
      });
      if (sellerTx.success) {
        sellerRecord = sellerTx.record;
      }
    }

    return {
      success: true,
      buyerRecord: buyerTx.record,
      sellerRecord,
    };
  },

  /**
   * Registra a venda de um atleta com entrada de recursos no Caixa Real.
   */
  async processPlayerSale(params: {
    sellerClubId: string;
    buyerClubName?: string;
    fee: number;
    playerName: string;
    playerId: string;
    transferId?: string;
    seasonId?: string;
  }): Promise<{ success: boolean; error?: string; record?: FinanceRecord }> {
    const { sellerClubId, buyerClubName, fee, playerName, playerId, transferId, seasonId = '2026/2027' } = params;

    const desc = buyerClubName
      ? `Venda de ${playerName} para ${buyerClubName}`
      : `Venda de ${playerName}`;

    const tx = await this.processTransaction({
      clubId: sellerClubId,
      seasonId,
      operationType: 'PLAYER_SALE',
      amount: fee,
      inOut: 'IN',
      description: desc,
      referenceId: transferId || playerId,
      origin: 'TRANSFERENCIA_DIRETA',
    });

    return tx;
  },

  /**
   * Registra receita de bilheteria de uma partida.
   * Regra 8: A receita do jogo entra no Caixa Real SOMENTE para o clube mandante.
   * O clube visitante não recebe bilheteria.
   */
  async processMatchTicketRevenue(params: {
    homeClubId: string;
    awayClubId: string;
    homeClubName: string;
    awayClubName: string;
    ticketRevenue: number;
    matchId?: string;
    round?: number;
    seasonId?: string;
    date?: string;
  }): Promise<{ success: boolean; error?: string; record?: FinanceRecord }> {
    const { homeClubId, homeClubName, awayClubName, ticketRevenue, matchId, round, seasonId = '2026/2027', date } = params;

    if (ticketRevenue <= 0) {
      return { success: true };
    }

    const desc = `Bilheteria - ${homeClubName} x ${awayClubName}`;

    return this.processTransaction({
      clubId: homeClubId,
      seasonId,
      operationType: 'MATCH_TICKET_REVENUE',
      amount: ticketRevenue,
      inOut: 'IN',
      description: desc,
      referenceId: matchId,
      round,
      date,
      origin: 'PARTIDA_OFICIAL',
    });
  },

  /**
   * Obtém os fechamentos mensais salvos.
   */
  getMonthlyClosuresFromStorage(): MonthlyFinancialClosure[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CLOSURES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveMonthlyClosuresToStorage(closures: MonthlyFinancialClosure[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_CLOSURES, JSON.stringify(closures));
    } catch {
      // ignore
    }
  },

  /**
   * Consulta os fechamentos mensais de um clube na temporada.
   */
  async getMonthlyClosures(clubId: string, seasonId = '2026/2027'): Promise<MonthlyFinancialClosure[]> {
    const all = this.getMonthlyClosuresFromStorage();
    return all.filter((c) => c.clubId === clubId && c.seasonId === seasonId);
  },

  /**
   * Verifica de forma síncrona se um mês já foi fechado para o clube.
   */
  isMonthClosed(clubId: string, monthYear: string, seasonId = '2026/2027'): boolean {
    const all = this.getMonthlyClosuresFromStorage();
    return all.some(
      (c) =>
        c.clubId === clubId &&
        c.seasonId === seasonId &&
        c.monthYear.toLowerCase().trim() === monthYear.toLowerCase().trim()
    );
  },

  /**
   * Executa o Fechamento Contábil Mensal oficial de um clube.
   * - Não desconta salário diariamente: o pagamento ocorre UMA VEZ POR MÊS.
   * - Impede duplicidade de recebimento ou cobrança no mesmo mês.
   * - Soma os salários de todos os jogadores do clube e comissão técnica.
   * - Credita os patrocínios mensais ativos que entram no Caixa Real.
   * - Gera os lançamentos oficiais no Livro Caixa e atualiza o Caixa Real.
   */
  async executeMonthlyClosure(params: {
    clubId: string;
    monthYear: string; // Ex: "Setembro/2026"
    seasonId?: string;
    closedBy?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    closure?: MonthlyFinancialClosure;
    records?: FinanceRecord[];
  }> {
    const { clubId, monthYear, seasonId = '2026/2027', closedBy = 'Manager' } = params;

    // 1. Verificação estrita de duplicidade
    const existingClosures = await this.getMonthlyClosures(clubId, seasonId);
    const alreadyClosed = existingClosures.some(
      (c) => c.monthYear.toLowerCase() === monthYear.toLowerCase()
    );

    if (alreadyClosed) {
      return {
        success: false,
        error: `O fechamento financeiro de ${monthYear} já foi processado anteriormente para este clube. Operações duplicadas são bloqueadas.`,
      };
    }

    // 2. Busca o clube e configuração financeira
    const club = await clubesService.getById(clubId);
    if (!club) {
      return { success: false, error: 'Clube não localizado.' };
    }

    const config = await adminFinancasService.getConfigByClubId(clubId);
    const initialBalance = Number(club.balance ?? 20000000);

    // 3. Cálculo da Folha Salarial Real
    // Soma os salários de todos os jogadores atualmente no clube
    const players = dataStore.getPlayersByClubId(clubId);
    let playerSalariesTotal = players.reduce((sum, p) => sum + Number(p.wage || 0), 0);

    // Se o elenco ainda não tiver jogadores com salários cadastrados individualmente,
    // utiliza a folha homologada pelo Admin como referência
    if (playerSalariesTotal === 0 && config.expenses?.payrollWageMonthly) {
      playerSalariesTotal = config.expenses.payrollWageMonthly;
    }

    // Soma salários da comissão técnica e staff
    const coachingStaffWages = config.expenses?.coachingStaffWageMonthly || 350000;
    const operationalStaffWages = config.expenses?.operationalStaffWageMonthly || 150000;
    const staffSalariesTotal = coachingStaffWages + operationalStaffWages;

    const totalSalaries = playerSalariesTotal + staffSalariesTotal;

    // 4. Cálculo das Receitas Mensais Efetivas
    // Patrocínios ativos
    const activeSponsors = (config.sponsors || []).filter((s) => s.status === 'ATIVO');
    const totalSponsorships = activeSponsors.reduce((sum, s) => {
      if (s.monthlyAmount && s.monthlyAmount > 0) return sum + s.monthlyAmount;
      if (s.paymentMethod === 'MENSAL') return sum + Math.round(s.contractValue / 12);
      return sum;
    }, 0);

    // Cota de TV mensal (se configurada)
    const totalTv = config.tvRights?.monthlyQuota || 0;

    // Merchandising mensal (se configurado)
    const totalMerchandising = config.merchandising?.monthlyRevenue || 0;

    const totalIncomes = totalSponsorships + totalTv + totalMerchandising;
    const totalExpenses = totalSalaries;
    const netAmount = totalIncomes - totalExpenses;

    const todayDate = new Date().toISOString().split('T')[0];
    const generatedRecords: FinanceRecord[] = [];

    // 5. Execução e Lançamentos Contábeis Passo a Passo
    // 5.1 Credita Receita de Patrocínios
    if (totalSponsorships > 0) {
      const spTx = await this.processTransaction({
        clubId,
        seasonId,
        operationType: 'SPONSORSHIP_REVENUE',
        amount: totalSponsorships,
        inOut: 'IN',
        description: `Receita de patrocínio - ${monthYear}`,
        referenceId: `sponsors-${monthYear}`,
        origin: 'CONTRATO_PATROCINIO',
        date: todayDate,
      });
      if (spTx.record) generatedRecords.push(spTx.record);
    }

    // 5.2 Credita Cota de TV Mensal
    if (totalTv > 0) {
      const tvTx = await this.processTransaction({
        clubId,
        seasonId,
        operationType: 'TV_REVENUE',
        amount: totalTv,
        inOut: 'IN',
        description: `Cota de transmissão de TV - ${monthYear}`,
        referenceId: `tv-${monthYear}`,
        origin: 'DIREITOS_TELEVISAO',
        date: todayDate,
      });
      if (tvTx.record) generatedRecords.push(tvTx.record);
    }

    // 5.3 Credita Merchandising Mensal
    if (totalMerchandising > 0) {
      const merchTx = await this.processTransaction({
        clubId,
        seasonId,
        operationType: 'MERCHANDISING_REVENUE',
        amount: totalMerchandising,
        inOut: 'IN',
        description: `Receita de produtos e merchandising - ${monthYear}`,
        referenceId: `merch-${monthYear}`,
        origin: 'LOJA_OFICIAL',
        date: todayDate,
      });
      if (merchTx.record) generatedRecords.push(merchTx.record);
    }

    // 5.4 Debita Pagamento da Folha Salarial dos Atletas
    if (playerSalariesTotal > 0) {
      const salTx = await this.processTransaction({
        clubId,
        seasonId,
        operationType: 'SALARY_PAYMENT',
        amount: playerSalariesTotal,
        inOut: 'OUT',
        description: `Pagamento da folha salarial - ${monthYear}`,
        referenceId: `payroll-players-${monthYear}`,
        origin: 'FOLHA_SALARIAL_ATLETAS',
        date: todayDate,
        allowNegativeBalance: true, // Salários são obrigação legal do clube
      });
      if (salTx.record) generatedRecords.push(salTx.record);
    }

    // 5.5 Debita Salários da Comissão Técnica e Staff
    if (staffSalariesTotal > 0) {
      const staffTx = await this.processTransaction({
        clubId,
        seasonId,
        operationType: 'STAFF_SALARY',
        amount: staffSalariesTotal,
        inOut: 'OUT',
        description: `Salários da comissão técnica e funcionários - ${monthYear}`,
        referenceId: `payroll-staff-${monthYear}`,
        origin: 'FOLHA_COMISSAO_STAFF',
        date: todayDate,
        allowNegativeBalance: true,
      });
      if (staffTx.record) generatedRecords.push(staffTx.record);
    }

    const updatedBalance = await this.getBalance(clubId);

    // 6. Registrar o fechamento contábil mensal
    const closure: MonthlyFinancialClosure = {
      id: `closure-${clubId}-${monthYear.replace(/\//g, '-')}-${Date.now()}`,
      clubId,
      seasonId,
      monthYear,
      closedAt: new Date().toISOString(),
      totalSalaries,
      playerSalaries: playerSalariesTotal,
      staffSalaries: staffSalariesTotal,
      totalSponsorships,
      totalTv,
      totalMerchandising,
      totalIncomes,
      totalExpenses,
      netAmount,
      balanceBefore: initialBalance,
      balanceAfter: updatedBalance,
      status: updatedBalance >= 0 ? 'COMPLETED' : 'DEFICIT',
      playerCount: players.length,
      staffCount: 8,
    };

    const closures = this.getMonthlyClosuresFromStorage();
    closures.unshift(closure);
    this.saveMonthlyClosuresToStorage(closures);

    // Persiste também no Firestore se configurado
    const db = getFirestoreDb() || firestoreDb;
    if (isFirebaseConfigured() && db) {
      try {
        const closureRef = doc(db, 'fechamentosContabeis', closure.id);
        await setDoc(closureRef, closure);
      } catch (e) {
        console.warn('Aviso: Firestore offline para fechamento contábil.', e);
      }
    }

    return {
      success: true,
      closure,
      records: generatedRecords,
    };
  },

  /**
   * Obtém todo o extrato auditado do clube na temporada.
   */
  async getExtrato(clubId: string, seasonId: string = '2026/2027'): Promise<FinanceRecord[]> {
    return dataStore.getFinancesByClubId(clubId, seasonId);
  },

  /**
   * Calcula o Caixa Real Atual a partir do histórico contábil oficial ISOLADO POR TEMPORADA:
   * initialCash da temporada atual
   * + receitas da temporada atual
   * - despesas da temporada atual
   * = Caixa Real Atual da temporada.
   * Não inclui transações de temporadas diferentes (ex: despesa histórica de R$ 12.000.000 da 2025/2026
   * jamais é subtraída do exercício da 2026/2027).
   */
  calculateRealBalanceFromHistory(
    clubId: string,
    seasonYearOrFallback: string | number = '2026/2027',
    explicitFallback?: number
  ): number {
    let seasonYear = '2026/2027';
    let fallbackInitialCash = 25000000;

    if (typeof seasonYearOrFallback === 'string') {
      seasonYear = seasonYearOrFallback;
      if (typeof explicitFallback === 'number') {
        fallbackInitialCash = explicitFallback;
      }
    } else if (typeof seasonYearOrFallback === 'number') {
      fallbackInitialCash = seasonYearOrFallback;
    }

    const normalizeSeason = (s?: string) => (s || '').replace(/[-_]/g, '/').replace('season/', '');
    const targetSeasonNorm = normalizeSeason(seasonYear);

    // Obtém estritamente os lançamentos pertencentes à temporada
    const records = dataStore.getFinancesByClubId(clubId, seasonYear);
    const club = dataStore.getClubById(clubId);

    // 1. Busca o registro de abertura oficial da temporada (INITIAL_BUDGET)
    const initialRecord = records.find(
      (r) =>
        (r.operationType === 'INITIAL_BUDGET' || r.category === 'ORCAMENTO_INICIAL') &&
        normalizeSeason(r.seasonId || r.season) === targetSeasonNorm
    );

    let base = fallbackInitialCash;
    if (initialRecord && typeof initialRecord.amount === 'number') {
      base = Number(initialRecord.amount);
    } else {
      const config = dataStore.getFinancialConfig(clubId, seasonYear);
      if (config?.initialCash) {
        base = Number(config.initialCash);
      } else if (typeof club?.balance === 'number') {
        base = club.balance;
      }
    }

    // 2. Soma receitas e subtrai despesas da temporada atual
    let calculated = base;
    for (const r of records) {
      if (
        r.id === initialRecord?.id ||
        r.operationType === 'INITIAL_BUDGET' ||
        r.category === 'ORCAMENTO_INICIAL'
      ) {
        continue;
      }
      const isIncome = r.type === 'INCOME' || r.inOut === 'IN' || r.inOut === 'CREDIT';
      const isExpense = r.type === 'EXPENSE' || r.inOut === 'OUT' || r.inOut === 'DEBIT';

      if (isIncome) {
        calculated += Number(r.amount || 0);
      } else if (isExpense) {
        calculated -= Number(r.amount || 0);
      }
    }

    return calculated;
  },
};
