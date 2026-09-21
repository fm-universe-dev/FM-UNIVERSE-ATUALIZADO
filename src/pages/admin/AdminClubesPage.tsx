import React, { useEffect, useState } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import { clubesService } from '../../services/clubesService';
import { Club, ClubAuditReport } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';
import { ClubBadge } from '../../components/common/ClubBadge';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  Users,
  RefreshCw,
  Layers,
  ArrowRight,
  AlertOctagon,
  Building,
} from 'lucide-react';

type FilterType = 'ALL' | 'OFFICIAL' | 'TEST' | 'WITH_MANAGER' | 'WITHOUT_MANAGER';

export const AdminClubesPage: React.FC = () => {
  const { navigate } = useNavigation();
  const { isRealAdmin, user } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [auditMap, setAuditMap] = useState<Record<string, ClubAuditReport>>({});
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');

  // Modais de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Fluxo de Exclusão em 2 Etapas (Autoridade Total do Admin)
  const [clubToDelete, setClubToDelete] = useState<ClubAuditReport | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | null>(null);
  const [confirmNameInput, setConfirmNameInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [badge, setBadge] = useState('⚽');
  const [reputation, setReputation] = useState(75);
  const [transferBudget, setTransferBudget] = useState(25000000);
  const [wageBudget, setWageBudget] = useState(3000000);
  const [stadiumName, setStadiumName] = useState('Estádio Municipal');
  const [capacity, setCapacity] = useState(35000);
  const [managerName, setManagerName] = useState('Novo Treinador');

  const loadClubsAndAudit = async () => {
    setLoadingAudit(true);
    try {
      const [loadedClubs, reports] = await Promise.all([
        clubesService.getAll(),
        clubesService.auditAllClubs(),
      ]);
      setClubs(loadedClubs);
      const map: Record<string, ClubAuditReport> = {};
      reports.forEach((r) => {
        map[r.clubId] = r;
      });
      setAuditMap(map);
    } catch (err) {
      console.error('Erro ao carregar clubes e auditoria:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadClubsAndAudit();
  }, []);

  const handleOpenCreate = () => {
    setEditingClub(null);
    setName('');
    setCode('');
    setBadge('⚽');
    setReputation(75);
    setTransferBudget(25000000);
    setWageBudget(3000000);
    setStadiumName('Estádio Central');
    setCapacity(35000);
    setManagerName('Treinador Padrão');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (club: Club) => {
    setEditingClub(club);
    setName(club.name);
    setCode(club.code);
    setBadge(club.badge);
    setReputation(club.reputation);
    setTransferBudget(club.transferBudget);
    setWageBudget(club.wageBudget);
    setStadiumName(club.stadiumName);
    setCapacity(club.capacity);
    setManagerName(club.managerName);
    setIsModalOpen(true);
  };

  // Inicia fluxo de exclusão em 2 etapas com autoridade total do Admin
  const handleInitiateDelete = (club: Club) => {
    const report = auditMap[club.id] || clubesService.checkClubDependencies(club.id, club);
    setClubToDelete(report);
    setDeleteStep(1);
    setConfirmNameInput('');
    setDeleteError(null);
  };

  // Avança para a etapa 2 de exclusão
  const handleProceedToStep2 = () => {
    setDeleteStep(2);
    setConfirmNameInput('');
    setDeleteError(null);
  };

  // Confirmação final da exclusão definitiva
  const handleExecuteDelete = async () => {
    if (!clubToDelete) return;
    if (!isRealAdmin) {
      setDeleteError('Ação exclusiva do Administrador da Liga.');
      return;
    }
    if (confirmNameInput.trim().toLowerCase() !== clubToDelete.clubName.trim().toLowerCase()) {
      setDeleteError(`Digite exatamente "${clubToDelete.clubName}" para confirmar.`);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await clubesService.delete(clubToDelete.clubId, user?.email || 'Admin');
      setFeedback(
        `Clube "${clubToDelete.clubName}" excluído com sucesso. Desvinculados: ${res.unlinkedPlayersCount} atleta(s), ${res.unlinkedManagersCount} manager(s).`
      );
      setDeleteStep(null);
      setClubToDelete(null);
      await loadClubsAndAudit();
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setDeleteError(err.message || 'Falha ao excluir o clube.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingClub) {
      await clubesService.update(editingClub.id, {
        name,
        code: code.toUpperCase(),
        badge,
        reputation,
        transferBudget,
        wageBudget,
        stadiumName,
        capacity,
        managerName,
      });
      setFeedback(`Clube "${name}" atualizado com sucesso!`);
    } else {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      await clubesService.create({
        name,
        slug,
        shortName: code.toUpperCase() || 'NEW',
        code: code.toUpperCase() || 'NEW',
        badge: badge || '⚽',
        stadiumId: 'stad-1',
        primaryColor: '#10b981',
        secondaryColor: '#0f172a',
        foundedYear: 2025,
        stadiumName,
        capacity,
        balance: transferBudget * 1.5,
        transferBudget,
        wageBudget,
        reputation,
        fansCount: 500000,
        squadCount: 22,
        trophiesCount: 0,
        managerName,
        boardExpectation: 'Garantir estabilidade na liga e desenvolver talentos',
        seasonTarget: 'Meio de tabela',
      });
      setFeedback(`Clube "${name}" criado com sucesso!`);
    }

    setIsModalOpen(false);
    await loadClubsAndAudit();
    setTimeout(() => setFeedback(null), 3000);
  };

  // Contadores
  const allReports: ClubAuditReport[] = Object.values(auditMap) as ClubAuditReport[];
  const officialCount = allReports.filter((r) => r.universeType === 'OFFICIAL').length;
  const testCount = allReports.filter((r) => r.universeType === 'TEST_FICTITIOUS').length;
  const withManagerCount = allReports.filter((r) => r.managerStatus === 'WITH_MANAGER').length;
  const withoutManagerCount = clubs.length - withManagerCount;

  // Filtragem da lista
  const filteredClubs = clubs.filter((c) => {
    const report = auditMap[c.id] as ClubAuditReport | undefined;
    if (activeFilter === 'OFFICIAL') return report && report.universeType === 'OFFICIAL';
    if (activeFilter === 'TEST') return report && report.universeType === 'TEST_FICTITIOUS';
    if (activeFilter === 'WITH_MANAGER') return report && report.managerStatus === 'WITH_MANAGER';
    if (activeFilter === 'WITHOUT_MANAGER') return !report || report.managerStatus !== 'WITH_MANAGER';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-900/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-400" />
              <span>Gerenciador de Clubes</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Autoridade Administrativa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Controle total sobre os clubes da liga, elenco, managers vinculados e exclusão administrativa com integridade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadClubsAndAudit}
            disabled={loadingAudit}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Atualizar lista de todos os clubes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Clube</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Painel de Métricas da Liga */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total de Clubes</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-white mt-1">{clubs.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Cadastrados no sistema</p>
        </div>

        <div className="bg-slate-900/90 border border-blue-900/40 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-300">Oficiais da Liga</span>
            <Shield className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-200 mt-1">{officialCount}</p>
          <p className="text-[11px] text-blue-400/80 mt-0.5">Pilares do universo FM Universe</p>
        </div>

        <div className="bg-slate-900/90 border border-amber-900/40 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">Fictícios / Teste</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-200 mt-1">{testCount}</p>
          <p className="text-[11px] text-amber-400/80 mt-0.5">Clubes de teste ou mock</p>
        </div>

        <div className="bg-slate-900/90 border border-emerald-900/40 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">Clubes com Manager</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-200 mt-1">{withManagerCount}</p>
          <p className="text-[11px] text-emerald-400/80 mt-0.5">
            {withoutManagerCount > 0 ? `${withoutManagerCount} sem manager (CPU)` : 'Todos com manager'}
          </p>
        </div>
      </div>

      {/* Banner de Autoridade Administrativa e Integridade */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/20 to-slate-900 border border-purple-800/40 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-white flex items-center gap-2">
              <span>Autoridade Administrativa Total — Gestão e Exclusão de Clubes</span>
              <span className="bg-purple-500/20 text-purple-300 px-2 py-0.2 rounded text-[10px] border border-purple-500/30">
                Acesso de Administrador
              </span>
            </h4>
            <p className="text-slate-300 leading-relaxed">
              O Administrador possui autoridade para criar, editar ou excluir qualquer clube da liga. A exclusão de qualquer clube exige confirmação em 2 etapas com digitação do nome, realizando a limpeza segura em cascata (desvinculação de managers e atletas, tratamento de partidas e registros) sem corromper outros participantes.
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs">
        <span className="text-slate-500 font-semibold text-[11px] mr-1">Filtrar por:</span>
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
            activeFilter === 'ALL'
              ? 'bg-purple-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Todos ({clubs.length})
        </button>
        <button
          onClick={() => setActiveFilter('OFFICIAL')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
            activeFilter === 'OFFICIAL'
              ? 'bg-blue-600 text-white shadow'
              : 'bg-slate-900 text-blue-300 hover:text-white border border-blue-900/40'
          }`}
        >
          Oficiais da Liga ({officialCount})
        </button>
        <button
          onClick={() => setActiveFilter('TEST')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
            activeFilter === 'TEST'
              ? 'bg-amber-600 text-white shadow'
              : 'bg-slate-900 text-amber-300 hover:text-white border border-amber-900/40'
          }`}
        >
          Fictícios / Teste ({testCount})
        </button>
        <button
          onClick={() => setActiveFilter('WITH_MANAGER')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeFilter === 'WITH_MANAGER'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-900 text-emerald-300 hover:text-white border border-emerald-900/40'
          }`}
        >
          <Users className="w-3 h-3" />
          <span>Com Manager ({withManagerCount})</span>
        </button>
        <button
          onClick={() => setActiveFilter('WITHOUT_MANAGER')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
            activeFilter === 'WITHOUT_MANAGER'
              ? 'bg-slate-700 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Sem Manager ({withoutManagerCount})
        </button>
      </div>

      {/* Clubs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <th className="py-3.5 px-4">Clube</th>
                <th className="py-3.5 px-3">Classificação</th>
                <th className="py-3.5 px-3">Manager</th>
                <th className="py-3.5 px-3 text-center">Elenco</th>
                <th className="py-3.5 px-3 text-center">Vínculos</th>
                <th className="py-3.5 px-3 text-right">Orçamento</th>
                <th className="py-3.5 px-3 text-center">Situação</th>
                <th className="py-3.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {filteredClubs.map((c) => {
                const report = auditMap[c.id];
                const isNinja = report?.isNinjaFC || c.name === 'Ninja FC';
                const isOfficial = report?.universeType === 'OFFICIAL';
                const hasSquad = (report?.squadCount || 0) > 0;

                return (
                  <tr
                    key={c.id}
                    className={`transition-colors ${
                      isNinja
                        ? 'bg-purple-950/20 hover:bg-purple-950/30'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Clube */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <ClubBadge club={c} size="xs" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-[13px]">{c.name}</span>
                            <span className="font-mono text-[11px] font-bold text-slate-400">
                              ({c.code})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            ID: {c.id}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Classificação no Universo */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        {isNinja ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            🥷 Rodrigo Mariano
                          </span>
                        ) : isOfficial ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            🏆 Oficial da Liga
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            🧪 Fictício / Teste
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Manager */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {report?.managerStatus === 'WITH_MANAGER' ? (
                        <div>
                          <span className="font-semibold text-emerald-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>{c.managerName}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            UID: {c.managerId?.slice(0, 10)}...
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-400 text-xs">{c.managerName || 'Sem Manager'}</span>
                          <span className="text-[10px] text-slate-500 block">CPU / Padrão</span>
                        </div>
                      )}
                    </td>

                    {/* Elenco */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      {hasSquad ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          <Users className="w-3 h-3" />
                          <span>{report?.squadCount} jog.</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">0 jogadores</span>
                      )}
                    </td>

                    {/* Vínculos e Dependências (Transf, Fin, Partidas) */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5 font-mono text-[11px]">
                        <span
                          title={`Transferências: ${report?.transfersCount || 0}`}
                          className={`px-1.5 py-0.5 rounded border ${
                            (report?.transfersCount || 0) > 0
                              ? 'bg-amber-950/60 text-amber-300 border-amber-800/60 font-bold'
                              : 'bg-slate-950 text-slate-500 border-slate-800'
                          }`}
                        >
                          🔄 {report?.transfersCount || 0}
                        </span>

                        <span
                          title={`Lançamentos Financeiros: ${report?.financesCount || 0}`}
                          className={`px-1.5 py-0.5 rounded border ${
                            (report?.financesCount || 0) > 0
                              ? 'bg-purple-950/60 text-purple-300 border-purple-800/60 font-bold'
                              : 'bg-slate-950 text-slate-500 border-slate-800'
                          }`}
                        >
                          💰 {report?.financesCount || 0}
                        </span>

                        <span
                          title={`Partidas no Calendário: ${report?.matchesCount || 0}`}
                          className={`px-1.5 py-0.5 rounded border ${
                            (report?.matchesCount || 0) > 0
                              ? 'bg-blue-950/60 text-blue-300 border-blue-800/60 font-bold'
                              : 'bg-slate-950 text-slate-500 border-slate-800'
                          }`}
                        >
                          📅 {report?.matchesCount || 0}
                        </span>
                      </div>
                    </td>

                    {/* Orçamento */}
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {formatCurrencyBRL(c.transferBudget, { compact: true })}
                    </td>

                    {/* Situação */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Ativo</span>
                      </span>
                    </td>

                    {/* Ações: Visualizar, Editar, Excluir para todos os clubes */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => navigate(`/clubes/${c.slug}`)}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                          title="Visualizar Clube"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="p-1.5 hover:bg-slate-800 text-purple-400 hover:text-purple-300 rounded transition-colors cursor-pointer"
                          title="Editar Clube"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleInitiateDelete(c)}
                          className="p-1.5 rounded transition-all cursor-pointer text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                          title={`Excluir Clube "${c.name}"`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredClubs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Nenhum clube encontrado para o filtro selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ETAPA 1 — CONFIRMAÇÃO DE EXCLUSÃO */}
      {deleteStep === 1 && clubToDelete && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Excluir clube?
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Etapa 1 de 2 • Vínculos e Dependências
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDeleteStep(null);
                  setClubToDelete(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Identificação do Clube */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">⚽</span>
                  <div>
                    <span className="font-bold text-white text-sm block">{clubToDelete.clubName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Sigla: {clubToDelete.code} | ID: {clubToDelete.clubId}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    clubToDelete.universeType === 'OFFICIAL'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {clubToDelete.universeType === 'OFFICIAL' ? 'Oficial da Liga' : 'Fictício / Teste'}
                </span>
              </div>

              {/* Aviso Adicional específico para Ninja FC */}
              {clubToDelete.isNinjaFC && (
                <div className="bg-purple-950/40 border border-purple-700/60 rounded-xl p-3 text-purple-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-purple-300">
                    <AlertOctagon className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Aviso Adicional — Ninja FC</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-purple-200">
                    O <strong>Ninja FC</strong> possui Manager oficial vinculado (<strong>Rodrigo Mariano</strong>) e jogadores no plantel (incluindo <strong>Gabriel Morales</strong>). Como Administrador, você possui autoridade total para excluí-lo. O vínculo do Manager Rodrigo Mariano será desfeito e os jogadores ficarão sem clube no universo da liga.
                  </p>
                </div>
              )}

              {/* Resumo das Dependências */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                  Resumo das dependências e dados vinculados:
                </h4>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Manager Atual:</span>
                    <span className="font-semibold text-white">
                      {clubToDelete.managerStatus === 'WITH_MANAGER'
                        ? `${clubToDelete.managerName || 'Manager vinculado'}`
                        : 'Nenhum (CPU / Padrão)'}
                    </span>
                    {clubToDelete.managerStatus === 'WITH_MANAGER' && (
                      <span className="text-[10px] text-emerald-400 block mt-0.5">
                        ✓ Ficará livre para novo clube (conta mantida)
                      </span>
                    )}
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Jogadores no Elenco:</span>
                    <span className="font-semibold text-white">
                      {clubToDelete.squadCount} jogador(es)
                    </span>
                    <span className="text-[10px] text-sky-400 block mt-0.5">
                      ✓ Ficarão 'Sem Clube' (mantidos na base)
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Transferências / Histórico:</span>
                    <span className="font-semibold text-white">
                      {clubToDelete.transfersCount} registro(s)
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      ✓ Histórico preservado sem corrupção
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Partidas no Calendário:</span>
                    <span className="font-semibold text-white">
                      {clubToDelete.matchesCount} partida(s)
                    </span>
                    <span className="text-[10px] text-amber-400 block mt-0.5">
                      ✓ Removidas do calendário
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Registros Financeiros:</span>
                    <span className="font-semibold text-white">
                      {clubToDelete.financesCount} lançamento(s)
                    </span>
                    <span className="text-[10px] text-purple-400 block mt-0.5">
                      ✓ Isolados deste clube
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Leilões Vinculados:</span>
                    <span className="font-semibold text-white">
                      {clubToDelete.activeAuctionsCount} leilão(ões)
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      ✓ Desvinculados com segurança
                    </span>
                  </div>
                </div>

                {clubToDelete.playerNames && clubToDelete.playerNames.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block mb-1">
                      Jogadores afetados ({clubToDelete.playerNames.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {clubToDelete.playerNames.slice(0, 6).map((pn, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                          {pn}
                        </span>
                      ))}
                      {clubToDelete.playerNames.length > 6 && (
                        <span className="text-[10px] text-slate-500 self-center">
                          +{clubToDelete.playerNames.length - 6} outros
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Aviso da ação */}
              <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 text-amber-300 text-[11px] leading-relaxed">
                <p>
                  <strong>Aviso:</strong> A exclusão é uma ação administrativa definitiva que removerá o vínculo do clube com a liga. Todas as dependências serão tratadas de forma segura e consistente, sem afetar dados de outros participantes.
                </p>
              </div>

              {/* Botões Etapa 1 */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteStep(null);
                    setClubToDelete(null);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProceedToStep2}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ETAPA 2 — CONFIRMAÇÃO FINAL COM DIGITAÇÃO DO NOME */}
      {deleteStep === 2 && clubToDelete && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Confirmação Final de Exclusão
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Etapa 2 de 2 • Digitação Obrigatória do Nome
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDeleteStep(null);
                  setClubToDelete(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3.5 text-rose-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertOctagon className="w-4 h-4 text-rose-400" />
                  <span>Confirmação com Nome do Clube</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Para autorizar a exclusão definitiva de{' '}
                  <strong className="text-white font-bold">{clubToDelete.clubName}</strong>, digite exatamente o nome do clube:
                </p>
                <div className="p-2 bg-slate-950 rounded border border-rose-900/40 text-center font-mono font-bold text-rose-300 text-xs">
                  Digite <span className="text-white underline">{clubToDelete.clubName}</span> para confirmar
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1.5">
                  Nome do clube:
                </label>
                <input
                  type="text"
                  value={confirmNameInput}
                  onChange={(e) => setConfirmNameInput(e.target.value)}
                  placeholder={clubToDelete.clubName}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-white font-semibold focus:outline-none focus:border-rose-500 text-xs"
                  autoFocus
                />
              </div>

              {deleteError && (
                <div className="bg-rose-500/20 border border-rose-500/40 text-rose-300 p-2.5 rounded-lg text-[11px]">
                  {deleteError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeleteStep(1)}
                  disabled={isDeleting}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  disabled={
                    isDeleting ||
                    confirmNameInput.trim().toLowerCase() !==
                      clubToDelete.clubName.trim().toLowerCase()
                  }
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Clube Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criação / Edição de Clube */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-900/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">
                {editingClub ? `Editar Clube: ${editingClub.name}` : 'Cadastrar Novo Clube'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Nome do Clube:</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Sigla (3 letras):</label>
                  <input
                    type="text"
                    maxLength={4}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Ícone / Badge:</label>
                  <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Reputação (0-100):</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={reputation}
                    onChange={(e) => setReputation(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Orçamento Transf. (R$):</label>
                  <input
                    type="number"
                    value={transferBudget}
                    onChange={(e) => setTransferBudget(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Folha Salarial (R$):</label>
                  <input
                    type="number"
                    value={wageBudget}
                    onChange={(e) => setWageBudget(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Estádio:</label>
                  <input
                    type="text"
                    value={stadiumName}
                    onChange={(e) => setStadiumName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Capacidade:</label>
                  <input
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Treinador:</label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  {editingClub ? 'Salvar Alterações' : 'Criar Clube'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

