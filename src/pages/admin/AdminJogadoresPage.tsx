import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import { jogadoresService } from '../../services/jogadoresService';
import { clubesService } from '../../services/clubesService';
import { Player, Club, PlayerPosition, PositionCategory } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';
import { PositionBadge, RatingBadge } from '../../components/common/Badge';
import { Users, Plus, Edit2, Trash2, Eye, X, CheckCircle2, Search, Database, AlertTriangle, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

export const AdminJogadoresPage: React.FC = () => {
  const { navigate } = useNavigation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClub, setSelectedClub] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'overall' | 'marketValue' | 'age' | 'goals'>('overall');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [knownAs, setKnownAs] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState(10);
  const [clubId, setClubId] = useState('');
  const [position, setPosition] = useState<PlayerPosition>('ATA');
  const [age, setAge] = useState(24);
  const [overall, setOverall] = useState(80);
  const [potential, setPotential] = useState(85);
  const [marketValue, setMarketValue] = useState(15000000);
  const [wage, setWage] = useState(200000);
  const [nationality, setNationality] = useState('Brasil');

  useEffect(() => {
    clubesService.getAll().then((c) => {
      setClubs(c);
      if (c.length > 0 && !clubId) setClubId(c[0].id);
    }).catch(() => {});
  }, []);

  // Debounce com verificação estrita para evitar consultas repetidas ao montar
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch]);

  const loadData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await jogadoresService.getPaginated({
        search: debouncedSearch || undefined,
        clubId: selectedClub !== 'ALL' ? selectedClub : undefined,
        positionCategory: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        source: selectedSource !== 'ALL' ? (selectedSource as any) : undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
        forceRefresh,
      });
      setPlayers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setHasNextPage(res.hasNextPage);
      setHasPrevPage(res.hasPrevPage);
    } catch (err: any) {
      console.error('Falha ao consultar Firestore no painel admin:', err);
      setError(err?.message || 'Falha ao consultar a coleção de jogadores no Firestore.');
      setPlayers([]);
      setTotal(0);
      setTotalPages(1);
      setHasNextPage(false);
      setHasPrevPage(false);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, selectedClub, selectedCategory, selectedSource, page, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingPlayer(null);
    setName('');
    setKnownAs('');
    setJerseyNumber(10);
    setClubId(clubs[0]?.id || 'club-1');
    setPosition('ATA');
    setAge(22);
    setOverall(80);
    setPotential(86);
    setMarketValue(15000000);
    setWage(200000);
    setNationality('Brasil');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Player) => {
    setEditingPlayer(p);
    setName(p.name);
    setKnownAs(p.knownAs || '');
    setJerseyNumber(p.jerseyNumber);
    setClubId(p.clubId);
    setPosition(p.position);
    setAge(p.age);
    setOverall(p.overall);
    setPotential(p.potential);
    setMarketValue(p.marketValue);
    setWage(p.wage);
    setNationality(p.nationality);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, playerName: string) => {
    if (confirm(`Excluir o jogador "${playerName}"?`)) {
      await jogadoresService.delete(id);
      loadData();
      setFeedback(`Jogador "${playerName}" excluído com sucesso.`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClub = clubs.find((c) => c.id === clubId);
    const clubName = selectedClub?.name || 'Sem Clube';

    const getCat = (pos: PlayerPosition): PositionCategory => {
      if (pos === 'GOL') return 'GOLEIRO';
      if (['ZAG', 'LE', 'LD', 'LBO'].includes(pos)) return 'DEFENSOR';
      if (['VOL', 'MC', 'MEI', 'ME', 'MD'].includes(pos)) return 'MEIO-CAMPISTA';
      return 'ATACANTE';
    };

    if (editingPlayer) {
      await jogadoresService.update(editingPlayer.id, {
        name,
        knownAs,
        jerseyNumber,
        clubId,
        clubName,
        position,
        positionCategory: getCat(position),
        age,
        overall,
        potential,
        marketValue,
        wage,
        nationality,
      });
      setFeedback(`Jogador "${name}" atualizado!`);
    } else {
      await jogadoresService.create({
        name,
        knownAs,
        jerseyNumber,
        clubId,
        clubName,
        position,
        positionCategory: getCat(position),
        secondaryPositions: [],
        age,
        nationality,
        nationalityCode: 'BRA',
        preferredFoot: 'Destro',
        overall,
        potential,
        marketValue,
        wage,
        contractUntil: '2028',
        status: 'FIT',
        condition: 100,
        morale: 'Excelente',
        attributes: {
          pace: overall - 2,
          shooting: overall,
          passing: overall - 3,
          dribbling: overall + 1,
          defending: 45,
          physical: overall - 4,
        },
        stats: {
          matches: 0,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          yellowCards: 0,
          redCards: 0,
          minutesPlayed: 0,
          averageRating: 6.8,
        },
      });
      setFeedback(`Jogador "${name}" cadastrado com sucesso!`);
    }

    setIsModalOpen(false);
    loadData();
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-900/40 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            <span>Gerenciador de Jogadores</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Cadastro de atletas, overall, atributos técnicos e vínculo contratual.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => navigate('/admin/importar-fm26')}
            className="bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-700/60 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Database className="w-4 h-4 text-purple-400" />
            <span>Importar Banco FM26</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Jogador</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Alerta de erro do Firestore sem fallback silencioso */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl text-rose-300 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h4 className="font-bold text-white text-xs">Falha na leitura de /jogadores no Firestore</h4>
              <p className="text-[11px] text-rose-200 font-mono bg-black/40 p-2 rounded border border-rose-500/20">
                {error}
              </p>
            </div>
          </div>
          <button
            onClick={() => loadData(true)}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      )}

      {/* Barra de Filtros e Busca Controlada */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Campo de Busca Específica */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar atleta por nome (ex: Kaká, Cristiano Ronaldo, Abidal)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            {isLoading && (
              <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {/* Filtro de Clube */}
          <div className="w-full md:w-56">
            <select
              value={selectedClub}
              onChange={(e) => {
                setSelectedClub(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Todos os Clubes</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Setor / Posição */}
          <div className="w-full md:w-44">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Todas as Posições</option>
              <option value="GOLEIRO">Goleiros</option>
              <option value="DEFENSOR">Defensores</option>
              <option value="MEIO-CAMPISTA">Meio-Campistas</option>
              <option value="ATACANTE">Atacantes</option>
            </select>
          </div>

          {/* Filtro de Base de Origem */}
          <div className="w-full md:w-36">
            <select
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL">Todas as Bases</option>
              <option value="FM2008">Base FM2008</option>
              <option value="FM26">Base FM26</option>
            </select>
          </div>

          {/* Ordenação */}
          <div className="w-full md:w-44">
            <select
              value={sortBy}
              onChange={(e) => {
                const val = e.target.value as any;
                setSortBy(val);
                setSortOrder(val === 'age' ? 'asc' : 'desc');
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="overall">Maior Overall</option>
              <option value="marketValue">Maior Valor</option>
              <option value="goals">Mais Gols</option>
              <option value="age">Mais Jovem</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <div>
            Nesta página: <strong className="text-white">{players.length}</strong> atleta(s) carregado(s) com limite de 50
          </div>
          <div className="font-mono text-purple-400">
            {debouncedSearch ? `Buscando "${debouncedSearch}"` : `Página ${page}`}
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm relative">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-xs text-purple-400 flex items-center gap-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Consultando Firestore...</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <th className="py-3 px-3">Nº</th>
                <th className="py-3 px-4">Jogador</th>
                <th className="py-3 px-3">Clube de Origem</th>
                <th className="py-3 px-3">Pos</th>
                <th className="py-3 px-2 text-center">Idade</th>
                <th className="py-3 px-2 text-center">OVR</th>
                <th className="py-3 px-2 text-center">POT</th>
                <th className="py-3 px-3 text-center">Atributos Principais</th>
                <th className="py-3 px-3 text-right">Valor</th>
                <th className="py-3 px-3 text-right">Salário/Mês</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {players.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        <span>Carregando jogadores do Firestore...</span>
                      </div>
                    ) : error ? (
                      <span className="text-rose-400">Erro ao carregar dados do Firestore.</span>
                    ) : (
                      <span>Nenhum jogador encontrado.</span>
                    )}
                  </td>
                </tr>
              ) : (
                players.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-400 font-bold">#{p.jerseyNumber}</td>
                    <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{p.name}</span>
                        {p.knownAs && <span className="text-slate-400 text-[11px]">({p.knownAs})</span>}
                        {(p.databaseSource === 'FM2008' || p.source === 'FM2008' || p.database === 'FM2008' || p.id?.startsWith('fm2008_')) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            FM2008
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">{p.clubName}</td>
                    <td className="py-3 px-3">
                      <PositionBadge position={p.position} size="xs" />
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-slate-300">{p.age}</td>
                    <td className="py-3 px-2 text-center">
                      <RatingBadge rating={p.overall} size="sm" />
                    </td>
                    <td className="py-3 px-2 text-center font-mono font-bold text-emerald-400">
                      {p.potential}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {p.attributes ? (
                        <div
                          className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-950/90 px-2 py-1 rounded border border-slate-800"
                          title={`PAC: ${p.attributes.pace ?? '-'} | SHO: ${p.attributes.shooting ?? '-'} | PAS: ${p.attributes.passing ?? '-'} | DRI: ${p.attributes.dribbling ?? '-'} | DEF: ${p.attributes.defending ?? '-'} | PHY: ${p.attributes.physical ?? '-'}`}
                        >
                          <span className="text-amber-400 font-bold" title="Ritmo / Pace">P:{p.attributes.pace ?? '-'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-rose-400 font-bold" title="Finalização / Shooting">F:{p.attributes.shooting ?? '-'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-cyan-400 font-bold" title="Passe / Passing">P:{p.attributes.passing ?? '-'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-purple-400 font-bold" title="Drible / Dribbling">D:{p.attributes.dribbling ?? '-'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-emerald-400 font-bold" title="Defesa / Defending">D:{p.attributes.defending ?? '-'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-orange-400 font-bold" title="Físico / Physical">F:{p.attributes.physical ?? '-'}</span>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono text-[10px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                      {formatCurrencyBRL(p.marketValue, { compact: true })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {formatCurrencyBRL(p.wage, { compact: true, decimals: 0 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => navigate(`/jogadores/${p.id}`)}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                          title="Visualizar Perfil"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 hover:bg-slate-800 text-purple-400 hover:text-purple-300 rounded"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="p-1.5 hover:bg-slate-800 text-rose-400 hover:text-rose-300 rounded"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-slate-950 px-4 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Exibindo <strong className="text-white">{players.length}</strong> atletas nesta página
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] text-slate-500">Limite:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value={25}>25 por página</option>
                <option value={50}>50 por página (padrão)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-200 cursor-pointer flex items-center gap-1"
              title="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <span className="font-mono text-xs px-3 py-1 rounded bg-slate-900 border border-slate-800">
              Página <strong className="text-white">{page}</strong>
            </span>

            <button
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!hasNextPage || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-purple-950/40 hover:bg-purple-900/50 border-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-purple-200 cursor-pointer flex items-center gap-1"
              title="Próxima página"
            >
              <span>Próxima</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-900/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">
                {editingPlayer ? `Editar Jogador: ${editingPlayer.name}` : 'Cadastrar Novo Jogador'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Nome Completo:</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Apelido / Conhecido Como:</label>
                  <input
                    type="text"
                    value={knownAs}
                    onChange={(e) => setKnownAs(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Clube:</label>
                  <select
                    value={clubId}
                    onChange={(e) => setClubId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Posição:</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    {['GOL', 'ZAG', 'LE', 'LD', 'VOL', 'MC', 'MEI', 'PE', 'PD', 'ATA'].map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Nº Camisa:</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Idade:</label>
                  <input
                    type="number"
                    min={15}
                    max={45}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Overall (0-99):</label>
                  <input
                    type="number"
                    min={40}
                    max={99}
                    value={overall}
                    onChange={(e) => setOverall(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Potencial (0-99):</label>
                  <input
                    type="number"
                    min={40}
                    max={99}
                    value={potential}
                    onChange={(e) => setPotential(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Valor de Mercado (R$):</label>
                  <input
                    type="number"
                    step={1000000}
                    value={marketValue}
                    onChange={(e) => setMarketValue(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-emerald-400 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Salário Mensal (R$):</label>
                  <input
                    type="number"
                    step={10000}
                    value={wage}
                    onChange={(e) => setWage(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Salvar Jogador
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
