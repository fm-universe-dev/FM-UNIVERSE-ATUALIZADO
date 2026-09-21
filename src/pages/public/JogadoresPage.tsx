import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import { jogadoresService } from '../../services/jogadoresService';
import { clubesService } from '../../services/clubesService';
import { Player, Club, PlayerPosition } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';
import { PositionBadge, RatingBadge } from '../../components/common/Badge';
import { Users, Search, ArrowUpDown, ChevronLeft, ChevronRight, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

export const JogadoresPage: React.FC = () => {
  const { navigate } = useNavigation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClub, setSelectedClub] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'overall' | 'marketValue' | 'age' | 'goals'>('overall');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carrega catálogo de clubes uma única vez para o filtro
  useEffect(() => {
    clubesService.getAll().then((c) => setClubs(c)).catch(() => {});
  }, []);

  // Debounce da busca por nome para evitar consultas repetidas ou excessivas
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const handler = setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput, debouncedSearch]);

  // Redefine a página para 1 quando qualquer filtro for alterado
  const handleClubChange = (val: string) => {
    setSelectedClub(val);
    setPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setPage(1);
  };

  const handleSortChange = (val: 'overall' | 'marketValue' | 'age' | 'goals') => {
    setSortBy(val);
    setPage(1);
  };

  const handlePageSizeChange = (val: number) => {
    setPageSize(val);
    setPage(1);
  };

  // Carrega atletas paginados com limit() + startAfter()
  const loadPlayers = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await jogadoresService.getPaginated({
        search: debouncedSearch || undefined,
        clubId: selectedClub === 'ALL' ? undefined : selectedClub,
        positionCategory: selectedCategory === 'ALL' ? undefined : selectedCategory,
        sortBy,
        sortOrder: sortBy === 'age' ? 'asc' : 'desc',
        page,
        pageSize,
        forceRefresh,
      });

      setPlayers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setHasNextPage(res.hasNextPage);
      setHasPrevPage(res.hasPrevPage);
    } catch (err: any) {
      console.error('Falha ao consultar coleção /jogadores do Firestore:', err);
      // Exibe mensagem clara do erro real e desativa fallback silencioso para mockPlayers
      setError(
        err?.message ||
          'Não foi possível consultar os atletas no Firestore. Verifique sua conexão ou cota de leitura.'
      );
      setPlayers([]);
      setTotal(0);
      setTotalPages(1);
      setHasNextPage(false);
      setHasPrevPage(false);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, selectedClub, selectedCategory, sortBy, page, pageSize]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-400" />
            <span>Banco de Dados de Jogadores</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Explore todos os atletas registrados no FM Universe, com atributos detalhados, valores e contratos.
          </p>
        </div>

        <button
          onClick={() => loadPlayers(true)}
          disabled={isLoading}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          title="Recarregar dados do Firestore"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Alerta explícito quando a consulta ao Firestore falha (sem fallback silencioso) */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-5 rounded-2xl text-rose-300 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <h3 className="font-bold text-white text-sm">
                Falha na leitura da coleção /jogadores do Firestore
              </h3>
              <p className="text-xs text-rose-200/90 leading-relaxed font-mono bg-black/40 p-2.5 rounded-lg border border-rose-500/20">
                {error}
              </p>
              <p className="text-[11px] text-slate-400">
                O fallback silencioso para dados locais de exemplo (mockPlayers) foi desativado conforme solicitado para preservar a fidelidade com a base de dados real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => loadPlayers(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome (ex: Kaká, Abidal, Ronaldo)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>

        {/* Club Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Clube:</span>
          <select
            value={selectedClub}
            onChange={(e) => handleClubChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Todos os Clubes</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Position Category */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Setor:</span>
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Todas as Posições</option>
            <option value="GOLEIRO">Goleiros</option>
            <option value="DEFENSOR">Defensores</option>
            <option value="MEIO-CAMPISTA">Meio-Campistas</option>
            <option value="ATACANTE">Atacantes</option>
          </select>
        </div>

        {/* Sort By */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400">Ordenar por:</span>
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="overall">Maior Overall</option>
            <option value="marketValue">Maior Valor de Mercado</option>
            <option value="goals">Mais Gols</option>
            <option value="age">Mais Jovem</option>
          </select>
        </div>
      </div>

      {/* Players Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm relative">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-xs text-emerald-400 flex items-center gap-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Consultando Firestore...</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <th className="py-3 px-4">Jogador</th>
                <th className="py-3 px-3">Clube</th>
                <th className="py-3 px-3">Pos</th>
                <th className="py-3 px-3 text-center">Idade</th>
                <th className="py-3 px-3 text-center">Nac</th>
                <th className="py-3 px-3 text-center">OVR</th>
                <th className="py-3 px-3 text-center">POT</th>
                <th className="py-3 px-3 text-right">Valor Mercado</th>
                <th className="py-3 px-3 text-right">Salário/Mês</th>
                <th className="py-3 px-3 text-center">Partidas</th>
                <th className="py-3 px-3 text-center">Gols</th>
                <th className="py-3 px-3 text-center">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {players.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                        <span className="text-xs">Consultando banco de dados Firestore...</span>
                      </div>
                    ) : error ? (
                      <div className="space-y-1">
                        <p className="text-rose-400 font-medium">Não foi possível exibir os atletas devido ao erro acima.</p>
                        <p className="text-slate-500 text-[11px]">Clique em "Tentar Novamente" após a renovação da cota.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-slate-300">Nenhum jogador encontrado para os filtros selecionados.</p>
                        {debouncedSearch && (
                          <p className="text-slate-500 text-[11px]">
                            Busca por "{debouncedSearch}". Experimente variações como sobrenome ou apelido.
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                players.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/jogadores/${p.id}`)}
                    className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500 font-bold text-[11px] w-5">
                          #{p.jerseyNumber ?? '-'}
                        </span>
                        <div>
                          <span className="font-bold text-white hover:text-emerald-400 transition-colors">
                            {p.name || 'Jogador'}
                          </span>
                          {p.knownAs && p.knownAs !== p.name && (
                            <span className="text-slate-400 text-[11px] ml-1.5 font-normal">
                              ({p.knownAs})
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">
                      {p.clubName || 'Sem Clube'}
                    </td>
                    <td className="py-3 px-3">
                      <PositionBadge position={p.position || 'MC'} size="xs" />
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-300">{p.age ?? '-'}</td>
                    <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                      {p.nationalityCode || '-'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <RatingBadge rating={p.overall ?? 70} size="sm" />
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-emerald-400 text-xs">
                      {p.potential ?? p.overall ?? 70}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                      {formatCurrencyBRL(p.marketValue ?? 0, { compact: true })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {formatCurrencyBRL(p.wage ?? 0, { compact: true, decimals: 0 })}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-300">
                      {p.stats?.matches ?? 0}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-400">
                      {p.stats?.goals ?? 0}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-200">
                      {typeof p.stats?.averageRating === 'number'
                        ? p.stats.averageRating.toFixed(1)
                        : '6.5'}
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
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
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
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-emerald-200 cursor-pointer flex items-center gap-1"
              title="Próxima página"
            >
              <span>Próxima</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
