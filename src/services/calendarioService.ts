import { Match, Competition, Club } from '../types';
import { jogosService } from './jogosService';
import { competicoesService } from './competicoesService';
import { participantesService } from './participantesService';
import { dataStore } from './dataStore';

export interface CalendarGenerationOptions {
  competitionId: string;
  seasonId?: string;
  legs?: 'TURNO_UNICO' | 'TURNO_E_RETURNO';
  baseStartDate?: string;
  selectedClubIds?: string[];
  allowAdministrativeRevision?: boolean;
}

export interface CalendarMetrics {
  clubsCount: number;
  roundsCount: number;
  matchesPerRound: number;
  totalMatches: number;
  homeMatchesPerClub: number;
  awayMatchesPerClub: number;
  isEven: boolean;
  legs: 'TURNO_E_RETURNO' | 'TURNO_UNICO';
}

/**
 * Calcula metricamente as estatísticas de um calendário de pontos corridos (todos contra todos)
 */
export function calculateCalendarMetrics(
  clubsCount: number,
  legs: 'TURNO_E_RETURNO' | 'TURNO_UNICO' = 'TURNO_E_RETURNO'
): CalendarMetrics {
  const isEven = clubsCount % 2 === 0;
  const effectiveCount = isEven ? clubsCount : clubsCount + 1;
  const roundsTurno = effectiveCount - 1;
  const roundsCount = legs === 'TURNO_E_RETURNO' ? roundsTurno * 2 : roundsTurno;
  const matchesPerRound = Math.floor(clubsCount / 2);
  const totalMatches = roundsCount * matchesPerRound;

  // No turno e returno para N par: cada clube joga exatamente N - 1 em casa e N - 1 fora (total 2*(N-1))
  const homeMatchesPerClub = legs === 'TURNO_E_RETURNO'
    ? (clubsCount - 1)
    : Math.floor((clubsCount - 1) / 2);
  const awayMatchesPerClub = legs === 'TURNO_E_RETURNO'
    ? (clubsCount - 1)
    : Math.ceil((clubsCount - 1) / 2);

  return {
    clubsCount,
    roundsCount,
    matchesPerRound,
    totalMatches,
    homeMatchesPerClub,
    awayMatchesPerClub,
    isEven,
    legs,
  };
}

export const calendarioService = {
  /**
   * Gera o calendário oficial de confrontos no formato TODOS CONTRA TODOS (Round-Robin)
   * Suporta qualquer quantidade válida de clubes selecionada pelo administrador (ex: 10 clubes, 18 rodadas, 90 partidas).
   * Garante:
   * - Utilização estrita dos clubes selecionados pelo administrador
   * - Equilíbrio exato de mandos de campo (CASA x FORA)
   * - Inversão rigorosa de mandos no Returno
   * - Todos os clubes jogam exatamente 1 vez por rodada (sem folgas para quantidade par)
   * - Nenhum confronto duplicado no mesmo turno
   */
  async generateRoundRobinCalendar(options: CalendarGenerationOptions): Promise<Match[]> {
    const {
      competitionId,
      seasonId = 's-2026',
      legs = 'TURNO_E_RETURNO',
      baseStartDate = '2026-08-08',
      selectedClubIds,
      allowAdministrativeRevision = false,
    } = options;

    const competition = await competicoesService.getById(competitionId);
    if (!competition) {
      throw new Error(`Competição "${competitionId}" não encontrada.`);
    }

    if (competition.calendarStatus === 'HOMOLOGADO' && !allowAdministrativeRevision) {
      throw new Error('Não é possível regerar um calendário já HOMOLOGADO sem antes revertê-lo para Rascunho.');
    }

    // Se estiver homologado e revisão administrativa foi autorizada, reabre para rascunho
    if (competition.calendarStatus === 'HOMOLOGADO' && allowAdministrativeRevision) {
      await this.revertToDraft(competitionId, true);
    }

    // Busca estritamente os clubes da competição ou usa a seleção do administrador
    let clubs: Club[] = [];
    const fullClubs = await (await import('./clubesService')).clubesService.getAll();

    if (selectedClubIds && selectedClubIds.length > 0) {
      clubs = selectedClubIds
        .map((id) => {
          const found = fullClubs.find((c) => c.id === id);
          if (found) return found;
          const local = dataStore.getClubById(id);
          if (local) return local;
          return {
            id,
            name: `Clube ${id.replace('club-', '')}`,
            stadiumName: 'Estádio Municipal',
            stadiumId: 'stad-default',
          } as Club;
        })
        .filter((c): c is Club => Boolean(c));
    } else {
      const parts = await participantesService.getClubsByCompetition(competitionId);
      clubs = parts.length > 0 ? parts : fullClubs;
    }

    // Ordenação canônica determinística por nome
    clubs.sort((a, b) => a.name.localeCompare(b.name));

    if (clubs.length < 2) {
      throw new Error(`São necessários ao menos 2 clubes participantes para gerar a tabela. Atual: ${clubs.length}.`);
    }

    // Helper para adicionar dias a uma data base
    const addDays = (startDateStr: string, days: number): string => {
      const d = new Date(startDateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const timeSlots = ['16:00', '18:30', '21:00', '16:00', '18:30'];

    // Algoritmo Canônico Round-Robin (Circle Method / Polígono com Pivô Fixo)
    // Garante equilíbrio de mandos para qualquer N
    const n = clubs.length;
    const isOdd = n % 2 !== 0;
    const teamList: (Club | null)[] = [...clubs];
    if (isOdd) {
      teamList.push(null);
    }
    const totalTeams = teamList.length; // sempre par
    const numRoundsTurno = totalTeams - 1;
    const matchesPerRound = totalTeams / 2;

    const rotating: (Club | null)[] = [];
    for (let i = 0; i < totalTeams - 1; i++) {
      rotating.push(teamList[i]);
    }
    const pivot = teamList[totalTeams - 1];

    // 1º TURNO
    const turnoMatches: Match[] = [];

    for (let r = 0; r < numRoundsTurno; r++) {
      const roundNumber = r + 1;
      const roundDate = addDays(baseStartDate, r * 7);

      // Partida 1: Envolve o pivô fixo
      let homeTeam: Club | null;
      let awayTeam: Club | null;

      if (r % 2 === 0) {
        homeTeam = rotating[0];
        awayTeam = pivot;
      } else {
        homeTeam = pivot;
        awayTeam = rotating[0];
      }

      if (homeTeam && awayTeam) {
        const matchId = `match-${competitionId}-r${roundNumber}-${homeTeam.id.slice(-4)}-${awayTeam.id.slice(-4)}`;
        turnoMatches.push({
          id: matchId,
          temporadaId: seasonId,
          seasonId: seasonId,
          competicaoId: competitionId,
          competitionId: competitionId,
          competitionName: competition.name,
          season: competition.season,
          round: roundNumber,
          rodada: roundNumber,
          date: roundDate,
          time: timeSlots[0],
          homeClubId: homeTeam.id,
          homeClubName: homeTeam.name,
          awayClubId: awayTeam.id,
          awayClubName: awayTeam.name,
          stadiumId: homeTeam.stadiumId || 'stad-default',
          stadiumName: homeTeam.stadiumName || 'Estádio Principal',
          status: 'SCHEDULED',
          events: [],
        });
      }

      // Demais partidas da rodada
      for (let m = 1; m < matchesPerRound; m++) {
        const t1 = rotating[m];
        const t2 = rotating[totalTeams - 1 - m];

        if ((m + r) % 2 === 0) {
          homeTeam = t1;
          awayTeam = t2;
        } else {
          homeTeam = t2;
          awayTeam = t1;
        }

        if (!homeTeam || !awayTeam) continue;

        const matchId = `match-${competitionId}-r${roundNumber}-${homeTeam.id.slice(-4)}-${awayTeam.id.slice(-4)}`;
        turnoMatches.push({
          id: matchId,
          temporadaId: seasonId,
          seasonId: seasonId,
          competicaoId: competitionId,
          competitionId: competitionId,
          competitionName: competition.name,
          season: competition.season,
          round: roundNumber,
          rodada: roundNumber,
          date: roundDate,
          time: timeSlots[m % timeSlots.length],
          homeClubId: homeTeam.id,
          homeClubName: homeTeam.name,
          awayClubId: awayTeam.id,
          awayClubName: awayTeam.name,
          stadiumId: homeTeam.stadiumId || 'stad-default',
          stadiumName: homeTeam.stadiumName || 'Estádio Principal',
          status: 'SCHEDULED',
          events: [],
        });
      }

      // Rotação: o último elemento do rotating vai para o início
      const last = rotating.pop();
      if (last !== undefined) rotating.unshift(last);
    }

    const generatedMatches: Match[] = [...turnoMatches];

    // 2º TURNO (RETURNO): Mando de campo estritamente invertido
    if (legs === 'TURNO_E_RETURNO') {
      const returnoBaseDate = addDays(baseStartDate, numRoundsTurno * 7);

      for (let r = 0; r < numRoundsTurno; r++) {
        const returnoRoundNumber = numRoundsTurno + r + 1;
        const returnoDate = addDays(returnoBaseDate, r * 7);
        const roundTurnoMatches = turnoMatches.filter((m) => m.round === r + 1);

        for (let m = 0; m < roundTurnoMatches.length; m++) {
          const original = roundTurnoMatches[m];
          const newHomeClub = clubs.find((c) => c.id === original.awayClubId)!;
          const newAwayClub = clubs.find((c) => c.id === original.homeClubId)!;

          const matchId = `match-${competitionId}-r${returnoRoundNumber}-${newHomeClub.id.slice(-4)}-${newAwayClub.id.slice(-4)}`;
          generatedMatches.push({
            id: matchId,
            temporadaId: seasonId,
            seasonId: seasonId,
            competicaoId: competitionId,
            competitionId: competitionId,
            competitionName: competition.name,
            season: competition.season,
            round: returnoRoundNumber,
            rodada: returnoRoundNumber,
            date: returnoDate,
            time: original.time,
            homeClubId: newHomeClub.id,
            homeClubName: newHomeClub.name,
            awayClubId: newAwayClub.id,
            awayClubName: newAwayClub.name,
            stadiumId: newHomeClub.stadiumId || 'stad-default',
            stadiumName: newHomeClub.stadiumName || 'Estádio Principal',
            status: 'SCHEDULED',
            events: [],
          });
        }
      }
    }

    // Substitui com integridade atômica todas as partidas da competição pelas partidas geradas
    await jogosService.replaceMatchesForCompetition(competitionId, generatedMatches);

    // Atualiza metadados da competição com o total exato de rodadas e clubes
    const calculatedTotalRounds = legs === 'TURNO_E_RETURNO' ? numRoundsTurno * 2 : numRoundsTurno;
    await competicoesService.save({
      ...competition,
      roundsCount: calculatedTotalRounds,
      teamsCount: clubs.length,
      format: 'TODOS_CONTRA_TODOS',
      legs,
      calendarStatus: 'RASCUNHO',
      calendarHomologatedAt: undefined,
      calendarHomologatedBy: undefined,
    });

    return generatedMatches;
  },

  /**
   * Homologa o calendário oficial da competição
   */
  async homologateCalendar(competitionId: string, adminName: string = 'Admin FM Universe'): Promise<void> {
    const comp = await competicoesService.getById(competitionId);
    if (!comp) {
      throw new Error(`Competição "${competitionId}" não encontrada.`);
    }

    const matches = (await jogosService.getAll()).filter((m) => m.competitionId === competitionId);
    if (matches.length === 0) {
      throw new Error('Não há partidas geradas no calendário para homologação.');
    }

    const participants = await participantesService.getByCompetition(competitionId);
    if (participants.length < 2) {
      throw new Error('A competição deve ter ao menos 2 participantes homologados.');
    }

    // Atualiza status de participantes para HOMOLOGADO
    await participantesService.homologateParticipants(competitionId);

    // Homologa a competição
    await competicoesService.save({
      ...comp,
      calendarStatus: 'HOMOLOGADO',
      calendarHomologatedAt: new Date().toISOString(),
      calendarHomologatedBy: adminName,
    });
  },

  /**
   * Reverte o calendário para status Rascunho
   * @param allowOverride Permite reabrir administrativamente mesmo que existam partidas
   */
  async revertToDraft(competitionId: string, allowOverride: boolean = false): Promise<void> {
    const comp = await competicoesService.getById(competitionId);
    if (!comp) return;

    const matches = (await jogosService.getAll()).filter((m) => m.competitionId === competitionId);
    const hasFinished = matches.some((m) => m.status === 'FINISHED');
    if (hasFinished && !allowOverride) {
      throw new Error('Não é possível reverter o calendário para Rascunho pois já existem partidas finalizadas nesta temporada.');
    }

    await competicoesService.save({
      ...comp,
      calendarStatus: 'RASCUNHO',
      calendarHomologatedAt: undefined,
      calendarHomologatedBy: undefined,
    });
  },

  /**
   * Obtém todas as partidas de uma competição agrupadas e ordenadas por rodada
   */
  async getCalendarByCompetition(competitionId: string): Promise<Match[]> {
    const all = await jogosService.getAll();
    return all
      .filter((m) => m.competitionId === competitionId || (!m.competitionId && competitionId === 'comp-1'))
      .sort((a, b) => a.round - b.round);
  },

  /**
   * Atualiza data, horário ou campos de uma partida
   */
  async updateMatch(matchId: string, partial: Partial<Match>): Promise<void> {
    await jogosService.update(matchId, partial);
  },

  /**
   * Remove uma partida do calendário
   */
  async deleteMatch(matchId: string): Promise<void> {
    await jogosService.delete(matchId);
  },

  /**
   * Adiciona uma nova partida ao calendário
   */
  async addMatch(match: Match): Promise<void> {
    await jogosService.save(match);
  },

  /**
   * Inverte mandante e visitante de uma partida, atualizando o estádio oficial
   */
  async swapMatchHomeAway(matchId: string): Promise<Match> {
    const match = await jogosService.getById(matchId);
    if (!match) {
      throw new Error(`Partida "${matchId}" não encontrada.`);
    }

    const clubs = await participantesService.getClubsByCompetition(match.competitionId);
    const newHomeClub = clubs.find((c) => c.id === match.awayClubId);
    const newAwayClub = clubs.find((c) => c.id === match.homeClubId);

    const updated: Match = {
      ...match,
      homeClubId: match.awayClubId,
      homeClubName: match.awayClubName,
      awayClubId: match.homeClubId,
      awayClubName: match.homeClubName,
      stadiumId: newHomeClub?.stadiumId || match.stadiumId,
      stadiumName: newHomeClub?.stadiumName || (newHomeClub ? `Estádio do ${newHomeClub.name}` : match.stadiumName),
    };

    await jogosService.save(updated);
    return updated;
  },
};
