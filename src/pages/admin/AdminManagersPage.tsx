import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit2,
  Power,
  RefreshCw,
  Building2,
  Lock,
  Calendar,
  AtSign,
  Mail,
  X,
  Users,
} from 'lucide-react';
import { managersService, RODRIGO_MARIANO_UID } from '../../services/managersService';
import { dataStore } from '../../services/dataStore';
import { ManagerProfile, Club } from '../../types';

const AVATAR_OPTIONS = ['👔', '🧢', '🎩', '🕶️', '⚽', '🏆', '🧠', '💼', '⭐', '🥷'];

export const AdminManagersPage: React.FC = () => {
  const [managers, setManagers] = useState<ManagerProfile[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<ManagerProfile | null>(null);
  const [unlinkWarning, setUnlinkWarning] = useState<{
    isOpen: boolean;
    reason: string;
    onConfirm: () => void;
  }>({ isOpen: false, reason: '', onConfirm: () => {} });

  // Form states
  const [formName, setFormName] = useState('');
  const [formLogin, setFormLogin] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formClubId, setFormClubId] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formAvatar, setFormAvatar] = useState('👔');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Carrega lista de managers e clubes
  const loadData = async () => {
    try {
      setLoading(true);
      const [mgrList, clubList] = await Promise.all([
        managersService.getAllManagers(),
        Promise.resolve(dataStore.getClubs()),
      ]);
      setManagers(mgrList);
      setClubs(clubList);
    } catch (err: any) {
      console.error('Erro ao carregar managers:', err);
      showToast('error', 'Falha ao carregar lista de managers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Clubes elegíveis para novo manager
  const eligibleClubsForNew = useMemo(() => {
    return managersService.getEligibleClubsForManager();
  }, [managers, clubs]);

  // Clubes elegíveis para manager sendo editado
  const eligibleClubsForEdit = useMemo(() => {
    if (!editingManager) return [];
    return managersService.getEligibleClubsForManager(editingManager.uid);
  }, [editingManager, managers, clubs]);

  // Estatísticas do painel
  const stats = useMemo(() => {
    const total = managers.length;
    const active = managers.filter((m) => m.status === 'ACTIVE').length;
    const withClub = managers.filter((m) => m.clubId && m.status === 'ACTIVE').length;
    const available = eligibleClubsForNew.length;
    return { total, active, withClub, available };
  }, [managers, eligibleClubsForNew]);

  // Filtragem de managers
  const filteredManagers = useMemo(() => {
    return managers.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.login && m.login.toLowerCase().includes(search.toLowerCase())) ||
        (m.email && m.email.toLowerCase().includes(search.toLowerCase())) ||
        (m.clubId && clubs.find((c) => c.id === m.clubId)?.name.toLowerCase().includes(search.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL' ? true : statusFilter === 'ACTIVE' ? m.status === 'ACTIVE' : m.status === 'INACTIVE';

      return matchSearch && matchStatus;
    });
  }, [managers, search, statusFilter, clubs]);

  // Abrir Modal de Criação
  const openCreateModal = () => {
    setFormName('');
    setFormLogin('');
    setFormEmail('');
    setFormClubId('');
    setFormStatus('ACTIVE');
    setFormAvatar('👔');
    setFormError(null);
    setIsCreateOpen(true);
  };

  // Abrir Modal de Edição
  const openEditModal = (mgr: ManagerProfile) => {
    setEditingManager(mgr);
    setFormName(mgr.name);
    setFormLogin(mgr.login || mgr.email?.split('@')[0] || '');
    setFormEmail(mgr.email || '');
    setFormClubId(mgr.clubId || '');
    setFormStatus(mgr.status || 'ACTIVE');
    setFormAvatar(mgr.avatar || '👔');
    setFormError(null);
  };

  // Submissão do Cadastro
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Nome é obrigatório.');
      return;
    }
    if (!formLogin.trim()) {
      setFormError('Login/Identificador é obrigatório.');
      return;
    }

    try {
      setIsSubmitting(true);
      await managersService.createManager({
        name: formName,
        login: formLogin,
        email: formEmail || undefined,
        clubId: formClubId || null,
        status: formStatus,
        avatar: formAvatar,
      });

      showToast('success', `Manager "${formName}" cadastrado com sucesso!`);
      setIsCreateOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao cadastrar manager.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submissão da Edição
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingManager) return;
    setFormError(null);

    const isChangingClub = editingManager.clubId && editingManager.clubId !== formClubId;

    // Se o clube atual possui dependências e está sendo alterado/removido
    if (isChangingClub) {
      const unlinkCheck = managersService.checkUnlinkConsequences(editingManager.uid);
      if (!unlinkCheck.canUnlink) {
        setFormError(unlinkCheck.reason || 'Este vínculo não pode ser alterado.');
        return;
      }
      if (unlinkCheck.requiresConfirmation) {
        setUnlinkWarning({
          isOpen: true,
          reason: unlinkCheck.reason || 'O clube atual possui dados ativos que retornarão para controle de IA.',
          onConfirm: () => executeEditSave(),
        });
        return;
      }
    }

    await executeEditSave();
  };

  const executeEditSave = async () => {
    if (!editingManager) return;
    try {
      setIsSubmitting(true);
      await managersService.updateManager(editingManager.uid, {
        name: formName,
        login: formLogin,
        email: formEmail,
        clubId: formClubId || null,
        status: formStatus,
        avatar: formAvatar,
      });

      showToast('success', `Manager "${formName}" atualizado com sucesso!`);
      setEditingManager(null);
      setUnlinkWarning({ isOpen: false, reason: '', onConfirm: () => {} });
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao atualizar manager.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Alternar Status Ativo / Inativo
  const handleToggleStatus = async (mgr: ManagerProfile) => {
    if (mgr.uid === RODRIGO_MARIANO_UID) {
      showToast('error', 'O Manager Rodrigo Mariano é o gestor oficial do Ninja FC e não pode ser desativado.');
      return;
    }

    try {
      const updated = await managersService.toggleManagerStatus(mgr.uid);
      showToast(
        'success',
        `Manager "${mgr.name}" agora está ${updated.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}.`
      );
      await loadData();
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao alternar status do manager.');
    }
  };

  const getClubName = (clubId: string | null) => {
    if (!clubId) return 'Sem Clube';
    const found = clubs.find((c) => c.id === clubId);
    return found ? found.name : clubId;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/90 border-red-500/30 text-red-300'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#262626] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-6 h-6 text-purple-400" />
            <h1 className="text-2xl font-bold tracking-tight text-white">Gerenciamento de Managers</h1>
          </div>
          <p className="text-sm text-neutral-400">
            Controle de participantes da liga, vinculação oficial de clubes e garantia de integridade competitiva.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            title="Recarregar lista"
            className="p-2.5 rounded-lg border border-[#333] hover:border-neutral-500 text-neutral-400 hover:text-white bg-[#141414] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Manager</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#121212] border border-[#262626] rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Total de Managers</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-xs text-neutral-500 mt-1">Registrados no sistema</div>
        </div>

        <div className="bg-[#121212] border border-[#262626] rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Managers Ativos</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.active}</div>
          <div className="text-xs text-neutral-500 mt-1">Aptos para participar da liga</div>
        </div>

        <div className="bg-[#121212] border border-[#262626] rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Clubes com Manager</div>
          <div className="text-2xl font-bold text-purple-400">{stats.withClub}</div>
          <div className="text-xs text-neutral-500 mt-1">Sob comando de treinador oficial</div>
        </div>

        <div className="bg-[#121212] border border-[#262626] rounded-xl p-4">
          <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Vagas Oficiais Disponíveis</div>
          <div className="text-2xl font-bold text-amber-400">{stats.available}</div>
          <div className="text-xs text-neutral-500 mt-1">Clubes elegíveis sem treinador</div>
        </div>
      </div>

      {/* Visão de Clubes da Liga: Ocupados vs. Disponíveis */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Vínculos Manager ↔ Clube na Liga Oficial
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            {eligibleClubsForNew.length} clube(s) aguardando novo Manager
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Clubes ocupados / protegidos */}
          {clubs
            .filter((c) => c.id !== 'club-6' && c.id !== 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3' && (c as any).universeType !== 'TEST_FICTITIOUS')
            .map((club) => {
              const assignedManager = managers.find(
                (m) => m.status === 'ACTIVE' && m.clubId === club.id
              );
              const isAvailable = !assignedManager;

              return (
                <div
                  key={club.id}
                  className={`p-3 rounded-lg border transition-all flex items-center justify-between ${
                    isAvailable
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-[#181818] border-[#2b2b2b]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg shrink-0">{club.badge || '🛡️'}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                        <span>{club.name}</span>
                        {club.name.toLowerCase() === 'ninja fc' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-normal">
                            Oficial
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate text-neutral-400 mt-0.5">
                        {assignedManager ? (
                          <span className="text-neutral-300 flex items-center gap-1">
                            <span className="text-xs">{assignedManager.avatar || '👔'}</span>
                            <span className="truncate">{assignedManager.name}</span>
                            <span className="text-neutral-500 font-mono text-[11px]">(@{assignedManager.login})</span>
                          </span>
                        ) : (
                          <span className="text-amber-400/90 font-medium">
                            Disponível para novos Managers
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 ml-2">
                    {isAvailable ? (
                      <span className="px-2 py-1 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Disponível
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-[11px] font-medium rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700">
                        Ocupado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#121212] border border-[#262626] p-3 rounded-xl">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar por nome, login, clube..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#181818] border border-[#333] rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'text-neutral-400 hover:text-white bg-[#181818] border border-[#262626]'
            }`}
          >
            Todos ({managers.length})
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                : 'text-neutral-400 hover:text-white bg-[#181818] border border-[#262626]'
            }`}
          >
            Ativos ({managers.filter((m) => m.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'INACTIVE'
                ? 'bg-neutral-600/20 text-neutral-300 border border-neutral-500/30'
                : 'text-neutral-400 hover:text-white bg-[#181818] border border-[#262626]'
            }`}
          >
            Inativos ({managers.filter((m) => m.status === 'INACTIVE').length})
          </button>
        </div>
      </div>

      {/* Managers Table */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-300">
            <thead className="bg-[#181818] text-xs font-semibold uppercase text-neutral-400 tracking-wider border-b border-[#262626]">
              <tr>
                <th className="py-3.5 px-4">Manager</th>
                <th className="py-3.5 px-4">Identificador / Login</th>
                <th className="py-3.5 px-4">Clube Vinculado</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Data de Cadastro</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                      <span>Carregando dados dos managers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredManagers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500">
                    Nenhum manager encontrado para os critérios selecionados.
                  </td>
                </tr>
              ) : (
                filteredManagers.map((mgr) => {
                  const isRodrigo = mgr.uid === RODRIGO_MARIANO_UID;
                  const club = clubs.find((c) => c.id === mgr.clubId);

                  return (
                    <tr key={mgr.uid} className="hover:bg-[#181818]/60 transition-colors">
                      {/* Manager Name + Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl select-none">{mgr.avatar || '👔'}</span>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>{mgr.name}</span>
                              {isRodrigo && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  Oficial
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-neutral-500">{mgr.email || `${mgr.login || 'manager'}@fmverse.com`}</div>
                          </div>
                        </div>
                      </td>

                      {/* Login / UID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-neutral-300 font-mono text-xs">
                          <AtSign className="w-3.5 h-3.5 text-neutral-500" />
                          <span>{mgr.login || mgr.uid.slice(0, 12)}</span>
                        </div>
                      </td>

                      {/* Linked Club */}
                      <td className="py-3.5 px-4">
                        {mgr.clubId && club ? (
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-[#333]">
                            <Shield className="w-3.5 h-3.5 text-purple-400" />
                            <span className="font-medium text-white text-xs">{club.name}</span>
                            {isRodrigo && (
                              <span className="text-[10px] text-amber-400 font-semibold">(Titular)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500 italic">Nenhum clube vinculado</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {mgr.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-900 text-neutral-400 border border-neutral-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                            Inativo
                          </span>
                        )}
                      </td>

                      {/* Registered At */}
                      <td className="py-3.5 px-4 text-xs text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                          <span>{formatDate(mgr.createdAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(mgr)}
                            title="Editar Manager"
                            className="p-1.5 rounded-lg border border-[#333] hover:border-purple-500/50 text-neutral-400 hover:text-purple-300 hover:bg-purple-950/30 transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(mgr)}
                            disabled={isRodrigo}
                            title={
                              isRodrigo
                                ? 'Rodrigo Mariano possui proteção e não pode ser desativado'
                                : mgr.status === 'ACTIVE'
                                ? 'Desativar Manager'
                                : 'Ativar Manager'
                            }
                            className={`p-1.5 rounded-lg border transition-all ${
                              isRodrigo
                                ? 'border-[#262626] text-neutral-600 cursor-not-allowed bg-transparent'
                                : mgr.status === 'ACTIVE'
                                ? 'border-[#333] hover:border-amber-500/50 text-neutral-400 hover:text-amber-400 hover:bg-amber-950/30'
                                : 'border-[#333] hover:border-emerald-500/50 text-neutral-400 hover:text-emerald-400 hover:bg-emerald-950/30'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regras e Observações de Integridade */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-purple-400" />
          Regras de Integridade de Vínculos da Liga
        </h3>
        <ul className="text-xs text-neutral-400 space-y-1.5 list-disc list-inside">
          <li>
            <strong className="text-neutral-300">Exclusividade Mútua:</strong> Um Manager ativo pode controlar no máximo 1 clube, e cada clube pode possuir no máximo 1 Manager ativo.
          </li>
          <li>
            <strong className="text-neutral-300">Clubes Protegidos e Teste:</strong> Ninja FC é o clube oficial e exclusivo do Manager Rodrigo Mariano. Thales FC e Atlântico FC são classificados como Fictício/Teste e não aceitam novos vínculos.
          </li>
          <li>
            <strong className="text-neutral-300">Clubes Oficiais da Liga:</strong> Rodrigo Mariano gerencia o Ninja FC e Carlos Teste gerencia o FM United. Os clubes disponíveis para novos Managers participantes são: Real Football, Inter Tech, Porto Real e Santos Stars.
          </li>
          <li>
            <strong className="text-neutral-300">Preservação Histórica:</strong> Nenhuma alteração nesta área afeta lances de leilões, orçamentos, finanças já apuradas ou plantéis oficiais.
          </li>
        </ul>
      </div>

      {/* MODAL CADASTRAR MANAGER */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-[#333] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Cadastrar Novo Manager</h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-[#222]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-950/60 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Avatar Picker */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-2">Avatar / Ícone</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormAvatar(emoji)}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center border transition-all ${
                        formAvatar === emoji
                          ? 'bg-purple-600/30 border-purple-500 text-white scale-105'
                          : 'bg-[#1a1a1a] border-[#333] text-neutral-400 hover:border-neutral-500'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Albuquerque"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Login / Identificador */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Identificação / Login do Manager *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">@</span>
                  <input
                    type="text"
                    required
                    placeholder="ex: carlos.silva"
                    value={formLogin}
                    onChange={(e) => setFormLogin(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">Identificador único de acesso ao sistema.</p>
              </div>

              {/* Email (opcional) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Email de Contato (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="Deixe vazio para gerar automaticamente"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Clube Vinculado */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Clube Vinculado
                </label>
                <select
                  value={formClubId}
                  onChange={(e) => setFormClubId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Sem clube no momento (Agente Livre)</option>
                  {eligibleClubsForNew.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name} (Disponível)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Apenas clubes oficiais disponíveis são listados. Ninja FC, Thales FC e Atlântico FC são restritos.
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">Status Inicial</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormStatus('ACTIVE')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      formStatus === 'ACTIVE'
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                        : 'bg-[#1a1a1a] border-[#333] text-neutral-400'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Ativo
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStatus('INACTIVE')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      formStatus === 'INACTIVE'
                        ? 'bg-neutral-800 border-neutral-600 text-neutral-200'
                        : 'bg-[#1a1a1a] border-[#333] text-neutral-400'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    Inativo
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#262626]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Cadastrando...' : 'Cadastrar Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR MANAGER */}
      {editingManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-[#333] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Editar Manager</h3>
              </div>
              <button
                onClick={() => setEditingManager(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-[#222]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {editingManager.uid === RODRIGO_MARIANO_UID && (
                <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-lg text-xs text-purple-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>
                    <strong>Manager Titular Oficial:</strong> Rodrigo Mariano possui proteção de integridade vinculada ao Ninja FC.
                  </span>
                </div>
              )}

              {formError && (
                <div className="p-3 bg-red-950/60 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Avatar Picker */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-2">Avatar / Ícone</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormAvatar(emoji)}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center border transition-all ${
                        formAvatar === emoji
                          ? 'bg-purple-600/30 border-purple-500 text-white scale-105'
                          : 'bg-[#1a1a1a] border-[#333] text-neutral-400 hover:border-neutral-500'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Login */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Identificação / Login *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">@</span>
                  <input
                    type="text"
                    required
                    value={formLogin}
                    disabled={editingManager.uid === RODRIGO_MARIANO_UID}
                    onChange={(e) => setFormLogin(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Clube Vinculado */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">
                  Clube Vinculado
                </label>
                {editingManager.uid === RODRIGO_MARIANO_UID ? (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-neutral-300">
                    <Lock className="w-4 h-4 text-purple-400" />
                    <span>Ninja FC (Vínculo Exclusivo e Protegido)</span>
                  </div>
                ) : (
                  <select
                    value={formClubId}
                    onChange={(e) => setFormClubId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Sem clube vinculado</option>
                    {/* Inclui o clube atual se existir */}
                    {editingManager.clubId &&
                      !eligibleClubsForEdit.some((c) => c.id === editingManager.clubId) && (
                        <option value={editingManager.clubId}>
                          {getClubName(editingManager.clubId)} (Clube Atual)
                        </option>
                      )}
                    {eligibleClubsForEdit.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name} {club.id === editingManager.clubId ? '(Atual)' : '(Disponível)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase mb-1.5">Status</label>
                {editingManager.uid === RODRIGO_MARIANO_UID ? (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ativo (Protegido contra desativação)</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormStatus('ACTIVE')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                        formStatus === 'ACTIVE'
                          ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                          : 'bg-[#1a1a1a] border-[#333] text-neutral-400'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormStatus('INACTIVE')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                        formStatus === 'INACTIVE'
                          ? 'bg-neutral-800 border-neutral-600 text-neutral-200'
                          : 'bg-[#1a1a1a] border-[#333] text-neutral-400'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      Inativo
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#262626]">
                <button
                  type="button"
                  onClick={() => setEditingManager(null)}
                  className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO DE DESVINCULAÇÃO */}
      {unlinkWarning.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-amber-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-3 bg-amber-500/10 rounded-full border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Confirmação de Desvinculação</h3>
            </div>

            <p className="text-sm text-neutral-300 leading-relaxed">{unlinkWarning.reason}</p>

            <div className="p-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-xs text-neutral-400">
              Esta ação removerá o vínculo do treinador humano com este clube, preservando todos os jogadores e histórico intactos sob gestão interina de IA.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnlinkWarning({ isOpen: false, reason: '', onConfirm: () => {} })}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={unlinkWarning.onConfirm}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Confirmar Desvinculação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
