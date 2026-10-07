import React, { useEffect, useState, useMemo } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import { jogadoresService } from '../../services/jogadoresService';
import { taticasService } from '../../services/taticasService';
import { Player, TacticPositionSlot, TacticSetup } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';
import { ClubBadge } from '../../components/common/ClubBadge';
import { FootballPitch } from '../../components/common/FootballPitch';
import {
  Users,
  Search,
  ArrowUpDown,
  ArrowRightLeft,
  Shirt,
  UserCheck,
  Zap,
  BarChart3,
  X,
  Sparkles,
  Layers,
  MapPin,
  Gavel,
} from 'lucide-react';

// Formações disponíveis com posições e coordenadas canônicas
interface FormationDef {
  id: string;
  label: string;
  summary: string;
  dots: { def: number; mid: number; att: number };
  slots: {
    id: string;
    positionName: string;
    label: string;
    defaultRole: any;
    x: number;
    y: number;
  }[];
}

const FORMATIONS_LIST: FormationDef[] = [
  {
    id: '4-3-3',
    label: '4-3-3',
    summary: '4 Def · 3 Meio · 3 Ata',
    dots: { def: 4, mid: 3, att: 3 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'lb', positionName: 'LE', label: 'LE', defaultRole: 'LB', x: 16, y: 70 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 38, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 62, y: 72 },
      { id: 'rb', positionName: 'LD', label: 'LD', defaultRole: 'RB', x: 84, y: 70 },
      { id: 'dm', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 50, y: 53 },
      { id: 'cm1', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 32, y: 44 },
      { id: 'cm2', positionName: 'MC', label: 'MEI', defaultRole: 'CAM', x: 68, y: 44 },
      { id: 'lw', positionName: 'PE', label: 'PE', defaultRole: 'LW', x: 20, y: 22 },
      { id: 'st', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 50, y: 16 },
      { id: 'rw', positionName: 'PD', label: 'PD', defaultRole: 'RW', x: 80, y: 22 },
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    summary: '4 Def · 4 Meio · 2 Ata',
    dots: { def: 4, mid: 4, att: 2 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'lb', positionName: 'LE', label: 'LE', defaultRole: 'LB', x: 16, y: 70 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 38, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 62, y: 72 },
      { id: 'rb', positionName: 'LD', label: 'LD', defaultRole: 'RB', x: 84, y: 70 },
      { id: 'lm', positionName: 'ME', label: 'ME', defaultRole: 'LM', x: 18, y: 46 },
      { id: 'cm1', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 40, y: 48 },
      { id: 'cm2', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 60, y: 48 },
      { id: 'rm', positionName: 'MD', label: 'MD', defaultRole: 'RM', x: 82, y: 46 },
      { id: 'st1', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 38, y: 18 },
      { id: 'st2', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 62, y: 18 },
    ],
  },
  {
    id: '4-2-3-1',
    label: '4-2-3-1',
    summary: '4 Def · 2 Vol · 3 Meia · 1 Ata',
    dots: { def: 4, mid: 5, att: 1 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'lb', positionName: 'LE', label: 'LE', defaultRole: 'LB', x: 16, y: 70 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 38, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 62, y: 72 },
      { id: 'rb', positionName: 'LD', label: 'LD', defaultRole: 'RB', x: 84, y: 70 },
      { id: 'dm1', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 38, y: 55 },
      { id: 'dm2', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 62, y: 55 },
      { id: 'am', positionName: 'MEI', label: 'MEI', defaultRole: 'CAM', x: 50, y: 35 },
      { id: 'lw', positionName: 'PE', label: 'ME', defaultRole: 'LM', x: 18, y: 35 },
      { id: 'rw', positionName: 'PD', label: 'MD', defaultRole: 'RM', x: 82, y: 35 },
      { id: 'st', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 50, y: 15 },
    ],
  },
  {
    id: '3-5-2',
    label: '3-5-2',
    summary: '3 Def · 5 Meio · 2 Ata',
    dots: { def: 3, mid: 5, att: 2 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 28, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'LIB', defaultRole: 'CB', x: 50, y: 74 },
      { id: 'cb3', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 72, y: 72 },
      { id: 'lwb', positionName: 'LE', label: 'ALA', defaultRole: 'LWB', x: 14, y: 48 },
      { id: 'dm', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 50, y: 56 },
      { id: 'cm1', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 34, y: 44 },
      { id: 'cm2', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 66, y: 44 },
      { id: 'rwb', positionName: 'LD', label: 'ALA', defaultRole: 'RWB', x: 86, y: 48 },
      { id: 'st1', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 38, y: 18 },
      { id: 'st2', positionName: 'ATA', label: 'SA', defaultRole: 'ST', x: 62, y: 18 },
    ],
  },
  {
    id: '4-1-4-1',
    label: '4-1-4-1',
    summary: '4 Def · 1 Vol · 4 Meio · 1 Ata',
    dots: { def: 4, mid: 5, att: 1 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'lb', positionName: 'LE', label: 'LE', defaultRole: 'LB', x: 16, y: 70 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 38, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 62, y: 72 },
      { id: 'rb', positionName: 'LD', label: 'LD', defaultRole: 'RB', x: 84, y: 70 },
      { id: 'dm', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 50, y: 56 },
      { id: 'lm', positionName: 'ME', label: 'ME', defaultRole: 'LM', x: 18, y: 38 },
      { id: 'cm1', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 38, y: 40 },
      { id: 'cm2', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 62, y: 40 },
      { id: 'rm', positionName: 'MD', label: 'MD', defaultRole: 'RM', x: 82, y: 38 },
      { id: 'st', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 50, y: 16 },
    ],
  },
  {
    id: '4-5-1',
    label: '4-5-1',
    summary: '4 Def · 5 Meio · 1 Ata',
    dots: { def: 4, mid: 5, att: 1 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'lb', positionName: 'LE', label: 'LE', defaultRole: 'LB', x: 16, y: 70 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 38, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 62, y: 72 },
      { id: 'rb', positionName: 'LD', label: 'LD', defaultRole: 'RB', x: 84, y: 70 },
      { id: 'dm1', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 38, y: 55 },
      { id: 'dm2', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 62, y: 55 },
      { id: 'cm', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 50, y: 42 },
      { id: 'lm', positionName: 'ME', label: 'ME', defaultRole: 'LM', x: 18, y: 38 },
      { id: 'rm', positionName: 'MD', label: 'MD', defaultRole: 'RM', x: 82, y: 38 },
      { id: 'st', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 50, y: 16 },
    ],
  },
  {
    id: '3-4-3',
    label: '3-4-3',
    summary: '3 Def · 4 Meio · 3 Ata',
    dots: { def: 3, mid: 4, att: 3 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 28, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'LIB', defaultRole: 'CB', x: 50, y: 74 },
      { id: 'cb3', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 72, y: 72 },
      { id: 'lm', positionName: 'ME', label: 'ME', defaultRole: 'LM', x: 16, y: 48 },
      { id: 'cm1', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 38, y: 48 },
      { id: 'cm2', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 62, y: 48 },
      { id: 'rm', positionName: 'MD', label: 'MD', defaultRole: 'RM', x: 84, y: 48 },
      { id: 'lw', positionName: 'PE', label: 'PE', defaultRole: 'LW', x: 22, y: 22 },
      { id: 'st', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 50, y: 16 },
      { id: 'rw', positionName: 'PD', label: 'PD', defaultRole: 'RW', x: 78, y: 22 },
    ],
  },
  {
    id: '5-3-2',
    label: '5-3-2',
    summary: '5 Def · 3 Meio · 2 Ata',
    dots: { def: 5, mid: 3, att: 2 },
    slots: [
      { id: 'gk', positionName: 'GOL', label: 'GOL', defaultRole: 'GK', x: 50, y: 88 },
      { id: 'lwb', positionName: 'LE', label: 'ALA', defaultRole: 'LWB', x: 14, y: 64 },
      { id: 'cb1', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 32, y: 72 },
      { id: 'cb2', positionName: 'ZAG', label: 'LIB', defaultRole: 'CB', x: 50, y: 74 },
      { id: 'cb3', positionName: 'ZAG', label: 'ZAG', defaultRole: 'CB', x: 68, y: 72 },
      { id: 'rwb', positionName: 'LD', label: 'ALA', defaultRole: 'RWB', x: 86, y: 64 },
      { id: 'cm1', positionName: 'MC', label: 'MC', defaultRole: 'CM', x: 32, y: 46 },
      { id: 'dm', positionName: 'VOL', label: 'VOL', defaultRole: 'CDM', x: 50, y: 52 },
      { id: 'cm2', positionName: 'MC', label: 'MEI', defaultRole: 'CAM', x: 68, y: 46 },
      { id: 'st1', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 38, y: 18 },
      { id: 'st2', positionName: 'ATA', label: 'CA', defaultRole: 'ST', x: 62, y: 18 },
    ],
  },
];

// Helper para badges de posições coloridas
const PositionTag: React.FC<{ position: string }> = ({ position }) => {
  const pos = position.toUpperCase();
  let colorStyle = 'bg-slate-100 text-slate-700 border-slate-200';

  if (pos === 'GOL' || pos === 'GK') {
    colorStyle = 'bg-amber-100 text-amber-800 border-amber-300';
  } else if (['ZAG', 'CB', 'LE', 'LB', 'LD', 'RB', 'ALA', 'LWB', 'RWB', 'LIB'].includes(pos)) {
    colorStyle = 'bg-blue-100 text-blue-800 border-blue-300';
  } else if (['VOL', 'CDM', 'MC', 'CM', 'MEI', 'CAM', 'ME', 'LM', 'MD', 'RM'].includes(pos)) {
    colorStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  } else if (['ATA', 'ST', 'CF', 'CA', 'SA', 'PE', 'LW', 'PD', 'RW'].includes(pos)) {
    colorStyle = 'bg-rose-100 text-rose-800 border-rose-300';
  }

  return (
    <span className={`inline-flex items-center justify-center font-black text-[10px] tracking-wider px-2 py-0.5 rounded-md border ${colorStyle}`}>
      {pos}
    </span>
  );
};

export const ElencoPage: React.FC = () => {
  const { navigate } = useNavigation();
  const { managedClub, managerProfile } = useAuth();

  const [squad, setSquad] = useState<Player[]>([]);
  const [activeTab, setActiveTab] = useState<'ELENCO' | 'ESTATISTICAS'>('ELENCO');
  const [selectedFormationId, setSelectedFormationId] = useState<string>('4-3-3');
  const [savedLineupView, setSavedLineupView] = useState<'TITULAR' | 'RESERVA'>('TITULAR');

  // Filtros e ordenação
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'OVR' | 'IDADE' | 'NOME' | 'VALOR' | 'SALARIO'>('OVR');
  const [search, setSearch] = useState<string>('');

  // Tática e escalação
  const [tacticalSlots, setTacticalSlots] = useState<TacticPositionSlot[]>([]);
  const [benchPlayerIds, setBenchPlayerIds] = useState<string[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // Modal de Troca / Substituição
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [playerToSwap, setPlayerToSwap] = useState<Player | null>(null);
  const [swapModalSearch, setSwapModalSearch] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // 2. IDENTIDADE VISUAL DINÂMICA DO CLUBE
  // Utiliza as cores cadastradas no clube atual. Fallback: roxo oficial FM Universe (#7c3aed / #4c1d95)
  const clubTheme = useMemo(() => {
    const rawPrimary = managedClub?.primaryColor?.trim() || '#7c3aed';
    const rawSecondary = managedClub?.secondaryColor?.trim() || '#4c1d95';

    // Proteção de contraste para superfícies escuras
    const isDark = (c: string) => {
      const lower = c.toLowerCase();
      return lower === '#000000' || lower === '#111111' || lower === '#1a1a1a' || lower === '#0a0a0a';
    };

    const primary = isDark(rawPrimary) ? (!isDark(rawSecondary) ? rawSecondary : '#7c3aed') : rawPrimary;
    const secondary = !isDark(rawSecondary) ? rawSecondary : '#4c1d95';
    const accent = primary;

    // Calcula se a cor primária é clara (para texto escuro em botões)
    const isLightColor = (hex: string) => {
      const clean = hex.replace('#', '');
      if (clean.length !== 6) return false;
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 165;
    };

    const textOnPrimary = isLightColor(primary) ? '#0f172a' : '#ffffff';

    return { primary, secondary, accent, textOnPrimary };
  }, [managedClub]);

  // Carrega jogadores do clube e inicializa a tática
  useEffect(() => {
    if (managedClub?.id) {
      jogadoresService.getByClubId(managedClub.id).then((players) => {
        setSquad(players);

        // Carrega tática persistida
        taticasService.getByClubId(managedClub.id).then((tactic) => {
          const currentFormation = tactic?.formation || '4-3-3';
          setSelectedFormationId(currentFormation);

          const formDef = FORMATIONS_LIST.find((f) => f.id === currentFormation) || FORMATIONS_LIST[0];

          if (tactic?.slots && tactic.slots.length === 11) {
            setTacticalSlots(tactic.slots);
            setBenchPlayerIds(tactic.substitutes || []);
          } else {
            // Inicializa escalação canônica com os jogadores disponíveis
            const usedIds = new Set<string>();
            const newSlots: TacticPositionSlot[] = formDef.slots.map((s) => {
              const candidate = players.find(
                (p) => !usedIds.has(p.id) && (p.position === s.positionName || p.position === s.defaultRole)
              );
              if (candidate) {
                usedIds.add(candidate.id);
                return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: candidate.id };
              }

              const catCandidate = players.find((p) => {
                if (usedIds.has(p.id)) return false;
                const pCat = p.positionCategory;
                if (s.positionName === 'GOL') return pCat === 'GOLEIRO';
                if (['ZAG', 'LE', 'LD'].includes(s.positionName)) return pCat === 'DEFENSOR';
                if (['VOL', 'MC', 'MEI', 'ME', 'MD'].includes(s.positionName)) return pCat === 'MEIO-CAMPISTA';
                return pCat === 'ATACANTE';
              });

              if (catCandidate) {
                usedIds.add(catCandidate.id);
                return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: catCandidate.id };
              }

              const fallbackPlayer = players.find((p) => !usedIds.has(p.id));
              if (fallbackPlayer) {
                usedIds.add(fallbackPlayer.id);
                return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: fallbackPlayer.id };
              }
              return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: undefined };
            });

            setTacticalSlots(newSlots);

            const remaining = players.filter((p) => !usedIds.has(p.id)).slice(0, 9).map((p) => p.id);
            setBenchPlayerIds(remaining);
          }
        });
      });
    }
  }, [managedClub?.id]);

  // Sets de IDs titulares e reservas
  const titularPlayerIds = useMemo(() => {
    return new Set(tacticalSlots.map((s) => s.assignedPlayerId).filter(Boolean) as string[]);
  }, [tacticalSlots]);

  const benchIdsSet = useMemo(() => {
    return new Set(benchPlayerIds);
  }, [benchPlayerIds]);

  // Altera formação tática selecionada
  const handleSelectFormation = (formId: string) => {
    setSelectedFormationId(formId);
    const formDef = FORMATIONS_LIST.find((f) => f.id === formId);
    if (!formDef || !managedClub) return;

    const availableTitulars: string[] = Array.from(titularPlayerIds);
    const usedIds = new Set<string>();

    const updatedSlots: TacticPositionSlot[] = formDef.slots.map((s) => {
      const existingCandidateId = availableTitulars.find((id) => {
        if (usedIds.has(id)) return false;
        const p = squad.find((pl) => pl.id === id);
        return p && (p.position === s.positionName || p.position === s.defaultRole);
      });

      if (existingCandidateId) {
        usedIds.add(existingCandidateId);
        return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: existingCandidateId };
      }

      const newCandidate = squad.find(
        (p) => !usedIds.has(p.id) && (p.position === s.positionName || p.position === s.defaultRole)
      );
      if (newCandidate) {
        usedIds.add(newCandidate.id);
        return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: newCandidate.id };
      }

      const anyAvailable = squad.find((p) => !usedIds.has(p.id));
      if (anyAvailable) {
        usedIds.add(anyAvailable.id);
        return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: anyAvailable.id };
      }
      return { ...s, defaultRole: s.defaultRole as any, assignedPlayerId: undefined };
    });

    setTacticalSlots(updatedSlots);

    const updatedTactic: TacticSetup = {
      clubId: managedClub.id,
      formation: formId,
      mentality: 'Ofensiva',
      tempo: 'Padrão',
      passingStyle: 'Curto',
      pressingIntensity: 'Alta',
      slots: updatedSlots,
      substitutes: benchPlayerIds,
      updatedAt: new Date().toISOString(),
    };
    taticasService.save(managedClub.id, updatedTactic);

    setFeedbackMsg(`Formação ${formId} aplicada com sucesso!`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Escalar ou Mover para o Banco
  const handleToggleEscalar = (player: Player) => {
    if (!managedClub) return;

    const isTitular = titularPlayerIds.has(player.id);

    if (isTitular) {
      const slot = tacticalSlots.find((s) => s.assignedPlayerId === player.id);
      if (slot) {
        const benchReplacementId = benchPlayerIds[0];
        const updatedSlots = tacticalSlots.map((s) =>
          s.id === slot.id ? { ...s, assignedPlayerId: benchReplacementId } : s
        );
        const updatedBench = benchPlayerIds.filter((id) => id !== benchReplacementId).concat(player.id);

        setTacticalSlots(updatedSlots);
        setBenchPlayerIds(updatedBench);

        const newTactic: TacticSetup = {
          clubId: managedClub.id,
          formation: selectedFormationId,
          mentality: 'Ofensiva',
          tempo: 'Padrão',
          passingStyle: 'Curto',
          pressingIntensity: 'Alta',
          slots: updatedSlots,
          substitutes: updatedBench,
          updatedAt: new Date().toISOString(),
        };
        taticasService.save(managedClub.id, newTactic);
        setFeedbackMsg(`${player.knownAs || player.name} movido para o Banco.`);
      }
    } else {
      const compatibleSlot = tacticalSlots.find((s) => {
        const currentP = squad.find((p) => p.id === s.assignedPlayerId);
        return (
          s.positionName === player.position ||
          s.defaultRole === player.position ||
          currentP?.positionCategory === player.positionCategory
        );
      }) || tacticalSlots[0];

      if (compatibleSlot) {
        const displacedPlayerId = compatibleSlot.assignedPlayerId;
        const updatedSlots = tacticalSlots.map((s) =>
          s.id === compatibleSlot.id ? { ...s, assignedPlayerId: player.id } : s
        );

        let updatedBench = benchPlayerIds.filter((id) => id !== player.id);
        if (displacedPlayerId) {
          updatedBench = [displacedPlayerId, ...updatedBench].slice(0, 9);
        }

        setTacticalSlots(updatedSlots);
        setBenchPlayerIds(updatedBench);

        const newTactic: TacticSetup = {
          clubId: managedClub.id,
          formation: selectedFormationId,
          mentality: 'Ofensiva',
          tempo: 'Padrão',
          passingStyle: 'Curto',
          pressingIntensity: 'Alta',
          slots: updatedSlots,
          substitutes: updatedBench,
          updatedAt: new Date().toISOString(),
        };
        taticasService.save(managedClub.id, newTactic);
        setFeedbackMsg(`${player.knownAs || player.name} escalado como Titular!`);
      }
    }

    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Abrir modal de troca
  const handleOpenTroca = (player: Player) => {
    setPlayerToSwap(player);
    setSwapModalSearch('');
    setSwapModalOpen(true);
  };

  // Executar troca tática
  const handleExecuteTroca = (targetPlayer: Player) => {
    if (!playerToSwap || !managedClub) return;

    const playerA = playerToSwap;
    const playerB = targetPlayer;

    const isATitular = titularPlayerIds.has(playerA.id);
    const isBTitular = titularPlayerIds.has(playerB.id);

    let updatedSlots = [...tacticalSlots];
    let updatedBench = [...benchPlayerIds];

    if (isATitular && isBTitular) {
      const slotA = updatedSlots.find((s) => s.assignedPlayerId === playerA.id);
      const slotB = updatedSlots.find((s) => s.assignedPlayerId === playerB.id);
      if (slotA && slotB) {
        updatedSlots = updatedSlots.map((s) => {
          if (s.id === slotA.id) return { ...s, assignedPlayerId: playerB.id };
          if (s.id === slotB.id) return { ...s, assignedPlayerId: playerA.id };
          return s;
        });
      }
    } else if (isATitular && !isBTitular) {
      updatedSlots = updatedSlots.map((s) =>
        s.assignedPlayerId === playerA.id ? { ...s, assignedPlayerId: playerB.id } : s
      );
      updatedBench = updatedBench.filter((id) => id !== playerB.id);
      updatedBench.push(playerA.id);
    } else if (!isATitular && isBTitular) {
      updatedSlots = updatedSlots.map((s) =>
        s.assignedPlayerId === playerB.id ? { ...s, assignedPlayerId: playerA.id } : s
      );
      updatedBench = updatedBench.filter((id) => id !== playerA.id);
      updatedBench.push(playerB.id);
    } else {
      updatedBench = updatedBench.filter((id) => id !== playerA.id && id !== playerB.id);
      updatedBench.push(playerA.id);
      updatedBench.push(playerB.id);
    }

    setTacticalSlots(updatedSlots);
    setBenchPlayerIds(updatedBench);

    const newTactic: TacticSetup = {
      clubId: managedClub.id,
      formation: selectedFormationId,
      mentality: 'Ofensiva',
      tempo: 'Padrão',
      passingStyle: 'Curto',
      pressingIntensity: 'Alta',
      slots: updatedSlots,
      substitutes: updatedBench,
      updatedAt: new Date().toISOString(),
    };
    taticasService.save(managedClub.id, newTactic);

    setSwapModalOpen(false);
    setPlayerToSwap(null);
    setFeedbackMsg(`Substituição concluída: ${playerA.knownAs || playerA.name} ⇆ ${playerB.knownAs || playerB.name}!`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // 6. INDICADORES SEMÂNTICOS
  // verde = pronto, amarelo = atenção/cansado, vermelho = lesionado, cinza = indisponível
  const getPlayerStatusBadge = (player: Player) => {
    if (player.status === 'INJURED') {
      return {
        label: 'LESIONADO',
        dotClass: 'bg-rose-500',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    }
    if (player.status === 'SUSPENDED') {
      return {
        label: 'SUSPENSO',
        dotClass: 'bg-zinc-400',
        badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
      };
    }
    if (player.status === 'TIRED' || (player.condition !== undefined && player.condition < 75)) {
      return {
        label: 'CANSADO',
        dotClass: 'bg-amber-500',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    }
    return {
      label: 'PRONTO',
      dotClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  };

  // Normalização de categoria de posição para agrupamento
  const getPlayerSector = (player: Player): 'GOLEIROS' | 'DEFENSORES' | 'MEIO-CAMPISTAS' | 'ATACANTES' => {
    const cat = player.positionCategory;
    if (cat === 'GOLEIRO') return 'GOLEIROS';
    if (cat === 'DEFENSOR') return 'DEFENSORES';
    if (cat === 'MEIO-CAMPISTA') return 'MEIO-CAMPISTAS';
    if (cat === 'ATACANTE') return 'ATACANTES';

    const pos = (player.position || '').toUpperCase();
    if (pos === 'GOL' || pos === 'GK') return 'GOLEIROS';
    if (['ZAG', 'CB', 'LE', 'LB', 'LD', 'RB', 'ALA', 'LWB', 'RWB', 'LIB'].includes(pos)) return 'DEFENSORES';
    if (['VOL', 'CDM', 'MC', 'CM', 'MEI', 'CAM', 'ME', 'LM', 'MD', 'RM'].includes(pos)) return 'MEIO-CAMPISTAS';
    return 'ATACANTES';
  };

  // Filtragem e ordenação do elenco
  const processedSquad = useMemo(() => {
    let list = squad.filter((p) => {
      const sector = getPlayerSector(p);
      let matchCat = true;
      if (categoryFilter === 'GOLEIRO') matchCat = sector === 'GOLEIROS';
      else if (categoryFilter === 'DEFENSOR') matchCat = sector === 'DEFENSORES';
      else if (categoryFilter === 'MEIO-CAMPISTA') matchCat = sector === 'MEIO-CAMPISTAS';
      else if (categoryFilter === 'ATACANTE') matchCat = sector === 'ATACANTES';

      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.knownAs && p.knownAs.toLowerCase().includes(q)) ||
        p.position.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q);

      return matchCat && matchSearch;
    });

    list.sort((a, b) => {
      if (sortBy === 'OVR') return (b.overall || 0) - (a.overall || 0);
      if (sortBy === 'IDADE') return a.age - b.age;
      if (sortBy === 'NOME') return (a.knownAs || a.name).localeCompare(b.knownAs || b.name);
      if (sortBy === 'VALOR') return (b.marketValue || 0) - (a.marketValue || 0);
      if (sortBy === 'SALARIO') return (b.wage || 0) - (a.wage || 0);
      return 0;
    });

    return list;
  }, [squad, categoryFilter, sortBy, search]);

  // Agrupamento por categorias para a área principal
  const groupedSquad = useMemo(() => {
    return {
      GOLEIROS: processedSquad.filter((p) => getPlayerSector(p) === 'GOLEIROS'),
      DEFENSORES: processedSquad.filter((p) => getPlayerSector(p) === 'DEFENSORES'),
      MEIO_CAMPISTAS: processedSquad.filter((p) => getPlayerSector(p) === 'MEIO-CAMPISTAS'),
      ATACANTES: processedSquad.filter((p) => getPlayerSector(p) === 'ATACANTES'),
    };
  }, [processedSquad]);

  // Listas de titulares e reservas para a coluna esquerda
  const titularPlayersList = useMemo(() => {
    return tacticalSlots
      .map((s) => squad.find((p) => p.id === s.assignedPlayerId))
      .filter(Boolean) as Player[];
  }, [tacticalSlots, squad]);

  const benchPlayersList = useMemo(() => {
    return benchPlayerIds.map((id) => squad.find((p) => p.id === id)).filter(Boolean) as Player[];
  }, [benchPlayerIds, squad]);

  const managerDisplayName = managerProfile?.name || managedClub?.managerName || 'Treinador Titular';

  return (
    <div className="space-y-6 pb-20 selection:bg-purple-600 selection:text-white">

      {/* 1. CABEÇALHO DO CLUBE — REFINADO COM DADOS REAIS + CORES DINÂMICAS */}
      <header
        className="rounded-3xl p-6 sm:p-7 relative overflow-hidden shadow-2xl border"
        style={{
          backgroundColor: '#0c0919',
          borderColor: `${clubTheme.primary}40`,
        }}
      >
        {/* Glow dinâmico no topo com a cor do clube */}
        <div
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ backgroundColor: clubTheme.primary }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none"
          style={{ backgroundColor: clubTheme.secondary }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          {/* Identidade visual: Escudo, Nome, Divisão, Quantidade de Atletas, Manager e Estádio */}
          <div className="flex items-center gap-4 sm:gap-5">
            <div
              className="p-2.5 rounded-2xl shadow-2xl shrink-0 border"
              style={{
                backgroundColor: '#110d24',
                borderColor: `${clubTheme.primary}70`,
              }}
            >
              <ClubBadge club={managedClub} size="lg" className="shadow-lg" />
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
                  {managedClub?.name || 'Elenco do Clube'}
                </h1>
                <span
                  className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm"
                  style={{
                    backgroundColor: clubTheme.primary,
                    color: clubTheme.textOnPrimary,
                  }}
                >
                  {(managedClub as any)?.division || '1ª Divisão'}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1.5 font-bold text-zinc-200">
                  <Shirt className="w-4 h-4" style={{ color: clubTheme.accent }} />
                  <span>{squad.length} Jogadores</span>
                </span>
                <span className="text-zinc-600">·</span>
                <span className="flex items-center gap-1.5 font-bold text-zinc-200">
                  <UserCheck className="w-4 h-4 text-purple-400" />
                  <span>Manager: <strong className="text-white">{managerDisplayName}</strong></span>
                </span>
                {managedClub?.stadiumName && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{managedClub.stadiumName}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 10. ABAS NO TOPO: ELENCO vs ESTATÍSTICAS */}
          <div className="flex items-center gap-2 bg-[#130f28] p-1.5 rounded-2xl border border-purple-900/40 shrink-0 self-start md:self-center shadow-lg">
            <button
              onClick={() => setActiveTab('ELENCO')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'ELENCO'
                  ? 'shadow-lg'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              style={
                activeTab === 'ELENCO'
                  ? {
                      backgroundColor: clubTheme.primary,
                      color: clubTheme.textOnPrimary,
                      boxShadow: `0 4px 16px ${clubTheme.primary}60`,
                    }
                  : {}
              }
            >
              <Users className="w-4 h-4" />
              <span>ELENCO</span>
            </button>

            <button
              onClick={() => setActiveTab('ESTATISTICAS')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'ESTATISTICAS'
                  ? 'shadow-lg'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              style={
                activeTab === 'ESTATISTICAS'
                  ? {
                      backgroundColor: clubTheme.primary,
                      color: clubTheme.textOnPrimary,
                      boxShadow: `0 4px 16px ${clubTheme.primary}60`,
                    }
                  : {}
              }
            >
              <BarChart3 className="w-4 h-4" />
              <span>ESTATÍSTICAS</span>
            </button>
          </div>

        </div>
      </header>

      {/* Notificação Flutuante de Sucesso / Feedback */}
      {feedbackMsg && (
        <div
          className="fixed top-20 right-6 z-50 px-5 py-3 rounded-2xl text-xs font-black shadow-2xl flex items-center gap-3 animate-in slide-in-from-top border"
          style={{
            backgroundColor: '#0c0919',
            borderColor: clubTheme.primary,
            boxShadow: `0 10px 30px -5px ${clubTheme.primary}50`,
            color: '#ffffff',
          }}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* 3. LAYOUT DO ELENCO: COLUNA ESQUERDA ESCURA + ÁREA PRINCIPAL CLARA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUNA ESQUERDA — ESCALAÇÕES SALVAS, FORMAÇÕES E CAMPO TÁTICO */}
        <aside className="lg:col-span-5 xl:col-span-4 space-y-5">
          <div
            className="rounded-3xl p-5 shadow-2xl border space-y-6"
            style={{
              backgroundColor: '#0c0919',
              borderColor: `${clubTheme.primary}35`,
            }}
          >
            {/* Bloco: ESCALAÇÕES SALVAS */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" style={{ color: clubTheme.accent }} />
                  <span>ESCALAÇÕES SALVAS</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {titularPlayersList.length}/11 Titulares
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#120e24] p-1.5 rounded-2xl border border-purple-900/30">
                <button
                  onClick={() => setSavedLineupView('TITULAR')}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    savedLineupView === 'TITULAR'
                      ? 'shadow-md'
                      : 'bg-transparent text-zinc-400 hover:text-white border-transparent'
                  }`}
                  style={
                    savedLineupView === 'TITULAR'
                      ? {
                          backgroundColor: clubTheme.primary,
                          color: clubTheme.textOnPrimary,
                          borderColor: `${clubTheme.primary}90`,
                          boxShadow: `0 3px 12px ${clubTheme.primary}40`,
                        }
                      : {}
                  }
                >
                  Titular ({titularPlayersList.length})
                </button>

                <button
                  onClick={() => setSavedLineupView('RESERVA')}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    savedLineupView === 'RESERVA'
                      ? 'shadow-md'
                      : 'bg-transparent text-zinc-400 hover:text-white border-transparent'
                  }`}
                  style={
                    savedLineupView === 'RESERVA'
                      ? {
                          backgroundColor: clubTheme.primary,
                          color: clubTheme.textOnPrimary,
                          borderColor: `${clubTheme.primary}90`,
                          boxShadow: `0 3px 12px ${clubTheme.primary}40`,
                        }
                      : {}
                  }
                >
                  Reserva ({benchPlayersList.length})
                </button>
              </div>
            </div>

            {/* Bloco: FORMAÇÃO — CARDS VISUAIS DAS FORMAÇÕES */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-300">
                  FORMAÇÃO
                </span>
                <span
                  className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
                  style={{
                    backgroundColor: `${clubTheme.primary}30`,
                    color: clubTheme.accent,
                  }}
                >
                  {selectedFormationId}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {FORMATIONS_LIST.map((fmt) => {
                  const isSelected = selectedFormationId === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => handleSelectFormation(fmt.id)}
                      className={`py-2 px-1.5 rounded-xl text-center transition-all cursor-pointer border flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? 'shadow-md scale-105 z-10'
                          : 'bg-[#130f28] hover:bg-[#1a1438] text-zinc-300 border-purple-900/30 hover:border-purple-700/50'
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: clubTheme.primary,
                              color: clubTheme.textOnPrimary,
                              borderColor: `${clubTheme.primary}95`,
                              boxShadow: `0 4px 14px ${clubTheme.primary}50`,
                            }
                          : {}
                      }
                      title={fmt.summary}
                    >
                      <span className="text-xs font-black tracking-tight">{fmt.label}</span>
                      <div className="flex items-center gap-0.5 text-[8px] opacity-80 font-mono">
                        <span>{fmt.dots.def}</span>
                        <span>-</span>
                        <span>{fmt.dots.mid}</span>
                        <span>-</span>
                        <span>{fmt.dots.att}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. CAMPO TÁTICO ESTILIZADO */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" style={{ color: clubTheme.accent }} />
                  <span>CAMPO TÁTICO</span>
                </span>
                <span className="text-[10px] font-bold text-zinc-400">
                  Formação {selectedFormationId}
                </span>
              </div>

              <div className="rounded-2xl overflow-hidden border border-emerald-800/40 shadow-inner bg-emerald-950/80 p-2">
                <FootballPitch
                  slots={tacticalSlots}
                  players={squad}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={(slot) => setSelectedSlotId(slot.id)}
                  onSlotClick={(slot) => {
                    const assignedPlayer = squad.find((p) => p.id === slot.assignedPlayerId);
                    if (assignedPlayer) {
                      handleOpenTroca(assignedPlayer);
                    }
                  }}
                />
              </div>

              <p className="text-[10px] text-zinc-400 text-center mt-2 font-medium">
                {squad.length > 0
                  ? 'Clique em qualquer jogador no gramado para abrir a substituição tática.'
                  : 'Posições oficiais da formação. Contrate atletas nos leilões para preencher o time.'}
              </p>
            </div>

            {/* Lista Rápida da Escalação (Titulares ou Reservas) */}
            <div className="pt-3 border-t border-purple-900/30">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-300 block mb-2">
                {savedLineupView === 'TITULAR' ? '11 TITULARES ESCALADOS' : 'BANCO DE RESERVAS'}
              </span>

              {squad.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#130f28]/60 border border-purple-900/30 text-center space-y-1">
                  <p className="text-xs font-bold text-zinc-300">
                    Nenhum jogador escalado
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    Adquira jogadores em leilões para montar sua escalação.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                  {(savedLineupView === 'TITULAR' ? titularPlayersList : benchPlayersList).map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => handleOpenTroca(p)}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#130f28] hover:bg-[#1a1438] border border-purple-900/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 text-center font-mono text-[10px] font-bold text-zinc-500">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-black text-white group-hover:text-purple-300 transition-colors truncate">
                          {p.knownAs || p.name}
                        </span>
                        <PositionTag position={p.position} />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-black font-mono text-amber-300">
                          {p.overall}
                        </span>
                        <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-600 group-hover:text-purple-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </aside>

        {/* ÁREA PRINCIPAL: FILTROS, BUSCA, ORDENAÇÃO E ELENCO / ESTADO VAZIO */}
        <main className="lg:col-span-7 xl:col-span-8 space-y-6">

          {/* 8. BARRA DE FILTROS, BUSCA E ORDENAÇÃO RÁPIDA */}
          <div
            className="rounded-3xl p-5 shadow-xl border space-y-4"
            style={{
              backgroundColor: '#0c0919',
              borderColor: `${clubTheme.primary}35`,
            }}
          >
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              
              {/* Filtro por Setor: Todos, Goleiros, Defensores, Meio-Campistas, Atacantes */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { id: 'ALL', label: 'Todos' },
                  { id: 'GOLEIRO', label: 'Goleiros' },
                  { id: 'DEFENSOR', label: 'Defensores' },
                  { id: 'MEIO-CAMPISTA', label: 'Meio-Campistas' },
                  { id: 'ATACANTE', label: 'Atacantes' },
                ].map((f) => {
                  const isSelected = categoryFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setCategoryFilter(f.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border ${
                        isSelected
                          ? 'shadow-md'
                          : 'bg-purple-950/20 text-zinc-300 hover:text-white border-purple-900/30'
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: clubTheme.primary,
                              color: clubTheme.textOnPrimary,
                              borderColor: `${clubTheme.primary}90`,
                              boxShadow: `0 2px 10px ${clubTheme.primary}40`,
                            }
                          : {}
                      }
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Campo de Busca Rápida por Nome */}
              <div className="relative w-full sm:w-56 shrink-0">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#0a0716] border border-purple-900/40 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Ordenação rápida: OVR, Idade, Nome, Valor de Mercado, Salário */}
            <div className="flex items-center gap-3 pt-3 border-t border-purple-900/20 text-xs text-zinc-400 flex-wrap">
              <span className="font-bold flex items-center gap-1.5 text-purple-300">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Ordenar:</span>
              </span>

              {[
                { id: 'OVR', label: 'OVR' },
                { id: 'IDADE', label: 'Idade' },
                { id: 'NOME', label: 'Nome' },
                { id: 'VALOR', label: 'Valor de Mercado' },
                { id: 'SALARIO', label: 'Salário' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id as any)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    sortBy === opt.id
                      ? 'text-white bg-purple-600/30 border border-purple-500/50'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              <span className="ml-auto text-[11px] font-mono text-zinc-500">
                {processedSquad.length} jogadores no filtro
              </span>
            </div>
          </div>

          {/* VISUALIZAÇÃO: ABA 1 — CARDS DO ELENCO OU ESTADO VAZIO */}
          {activeTab === 'ELENCO' && (
            <>
              {/* 5. ESTADO DE ELENCO VAZIO: Quando o clube está sem jogadores */}
              {squad.length === 0 ? (
                <div className="bg-[#f8fafc] rounded-3xl p-8 sm:p-14 border border-slate-200/90 shadow-2xl text-slate-900 flex flex-col items-center justify-center text-center space-y-6">
                  {/* Escudo do clube em destaque */}
                  <div
                    className="w-20 h-20 rounded-3xl p-2.5 flex items-center justify-center shadow-xl border relative"
                    style={{
                      backgroundColor: '#0c0919',
                      borderColor: `${clubTheme.primary}70`,
                    }}
                  >
                    <div
                      className="absolute inset-0 rounded-3xl blur-md opacity-35 pointer-events-none"
                      style={{ backgroundColor: clubTheme.primary }}
                    />
                    <ClubBadge club={managedClub} size="md" className="relative z-10 shadow-md" />
                  </div>

                  {/* Textos oficiais do estado vazio */}
                  <div className="max-w-md space-y-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
                      ELENCO VAZIO
                    </h2>
                    <p className="text-sm font-bold text-slate-700">
                      Seu clube ainda não possui jogadores.
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Participe dos leilões para começar a montar seu elenco.
                    </p>
                  </div>

                  {/* Botão de Ação: IR PARA LEILÕES */}
                  <button
                    onClick={() => navigate('/dashboard/leiloes-v3')}
                    className="flex items-center gap-2.5 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95 border"
                    style={{
                      backgroundColor: clubTheme.primary,
                      color: clubTheme.textOnPrimary,
                      borderColor: `${clubTheme.primary}90`,
                      boxShadow: `0 8px 24px -4px ${clubTheme.primary}60`,
                    }}
                  >
                    <Gavel className="w-4 h-4" />
                    <span>IR PARA LEILÕES</span>
                  </button>
                </div>
              ) : (
                /* 6, 7 & 9. QUANDO EXISTIREM JOGADORES: CARDS MODERNOS COM FUNDO CLARO */
                <div className="bg-[#f8fafc] rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-2xl text-slate-900 space-y-8">
                  
                  {processedSquad.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                      <Search className="w-8 h-8 text-slate-400" />
                      <p className="text-sm font-bold text-slate-700">Nenhum jogador encontrado</p>
                      <p className="text-xs text-slate-500">Tente ajustar o termo de busca ou o setor selecionado.</p>
                    </div>
                  ) : (
                    /* Setores: GOLEIROS, DEFENSORES, MEIO-CAMPISTAS, ATACANTES */
                    [
                      { title: 'GOLEIROS', players: groupedSquad.GOLEIROS },
                      { title: 'DEFENSORES', players: groupedSquad.DEFENSORES },
                      { title: 'MEIO-CAMPISTAS', players: groupedSquad.MEIO_CAMPISTAS },
                      { title: 'ATACANTES', players: groupedSquad.ATACANTES },
                    ]
                      .filter((sector) => sector.players.length > 0)
                      .map((sector) => (
                        <section key={sector.title} className="space-y-4">
                          {/* Cabeçalho do Setor com barra da cor do clube */}
                          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-2.5 h-6 rounded-full"
                                style={{ backgroundColor: clubTheme.primary }}
                              />
                              <h2 className="text-sm font-black text-slate-900 tracking-wider uppercase">
                                {sector.title}
                              </h2>
                              <span className="text-xs font-black text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
                                {sector.players.length}
                              </span>
                            </div>
                          </div>

                          {/* Grid dos Cards dos Jogadores */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sector.players.map((player) => {
                              const isTitular = titularPlayerIds.has(player.id);
                              const isBench = benchIdsSet.has(player.id);
                              const statusBadge = getPlayerStatusBadge(player);
                              const playerPhoto = player.photo || player.avatar || (player as any).avatarUrl;

                              return (
                                <div
                                  key={player.id}
                                  className={`rounded-2xl p-4 bg-white border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between ${
                                    isTitular
                                      ? 'border-l-4 ring-1 ring-slate-200'
                                      : 'border-slate-200 hover:border-slate-300'
                                  }`}
                                  style={
                                    isTitular
                                      ? {
                                          borderLeftColor: clubTheme.primary,
                                          borderColor: `${clubTheme.primary}40`,
                                        }
                                      : {}
                                  }
                                >
                                  <div>
                                    <div className="flex items-start gap-3.5">
                                      
                                      {/* Foto do Jogador ou Avatar Procedural */}
                                      <div className="relative shrink-0">
                                        {playerPhoto ? (
                                          <img
                                            src={playerPhoto}
                                            alt={player.name}
                                            className="w-14 h-14 rounded-2xl object-cover object-top border border-slate-200 shadow-sm"
                                          />
                                        ) : (
                                          <div
                                            className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white text-base shadow-sm"
                                            style={{
                                              background: `linear-gradient(135deg, ${clubTheme.primary}, #1e1b4b)`,
                                            }}
                                          >
                                            {(player.knownAs || player.name).slice(0, 2).toUpperCase()}
                                          </div>
                                        )}

                                        {/* Badge da Posição */}
                                        <div className="absolute -bottom-1 -right-1">
                                          <PositionTag position={player.position} />
                                        </div>
                                      </div>

                                      {/* Informações: Nome, Idade, Nacionalidade */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <h3
                                            onClick={() => navigate(`/jogadores/${player.id}`)}
                                            className="text-sm font-black text-slate-900 hover:text-purple-700 transition-colors truncate cursor-pointer leading-tight"
                                            title="Ver detalhes do atleta"
                                          >
                                            {player.knownAs || player.name}
                                          </h3>
                                        </div>

                                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                          <span>{player.age} anos</span>
                                          <span>·</span>
                                          <span>{player.nationality}</span>
                                        </div>

                                        {/* Barra Gráfica de Condição Física */}
                                        <div className="mt-2 flex items-center gap-2">
                                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${
                                                (player.condition ?? 95) >= 85
                                                  ? 'bg-emerald-500'
                                                  : (player.condition ?? 95) >= 70
                                                  ? 'bg-amber-500'
                                                  : 'bg-rose-500'
                                              }`}
                                              style={{ width: `${Math.min(100, Math.max(0, player.condition ?? 95))}%` }}
                                            />
                                          </div>
                                          <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">
                                            {player.condition ?? 95}% COND
                                          </span>
                                        </div>
                                      </div>

                                      {/* OVR Grande em Destaque Videogame */}
                                      <div className="text-right shrink-0">
                                        <div
                                          className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center shadow-md border"
                                          style={{
                                            backgroundColor: '#0c0919',
                                            borderColor: `${clubTheme.primary}70`,
                                            boxShadow: `0 2px 10px ${clubTheme.primary}25`,
                                          }}
                                        >
                                          <span className="text-base font-black text-amber-300 font-mono leading-none">
                                            {player.overall}
                                          </span>
                                          <span className="text-[8px] font-black text-zinc-400 tracking-wider uppercase leading-none mt-0.5">
                                            OVR
                                          </span>
                                        </div>
                                      </div>

                                    </div>

                                    {/* 7. Valores Financeiros: Valor de Mercado e Salário */}
                                    <div className="flex items-center justify-between text-[10px] text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1 mt-2.5 border border-slate-100">
                                      <span className="truncate">
                                        Valor: <strong className="text-slate-900 font-bold">{formatCurrencyBRL(player.marketValue, { compact: true })}</strong>
                                      </span>
                                      <span className="truncate">
                                        Salário: <strong className="text-slate-900 font-bold">{formatCurrencyBRL(player.wage, { compact: true })}/mês</strong>
                                      </span>
                                    </div>
                                  </div>

                                  {/* Linha Inferior: Indicador Semântico + Titular/Banco + Botões ESCALAR, BANCO, TROCAR */}
                                  <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                                    
                                    {/* Indicadores Semânticos e Status */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border ${statusBadge.badgeClass}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dotClass}`} />
                                        <span>{statusBadge.label}</span>
                                      </span>

                                      {/* Indicação Titular ou Banco */}
                                      {isTitular ? (
                                        <span
                                          className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs"
                                          style={{
                                            backgroundColor: clubTheme.primary,
                                            color: clubTheme.textOnPrimary,
                                          }}
                                        >
                                          TITULAR
                                        </span>
                                      ) : isBench ? (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                                          BANCO
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200/80 uppercase">
                                          APOIO
                                        </span>
                                      )}
                                    </div>

                                    {/* Botões: ESCALAR / BANCO e TROCAR */}
                                    <div className="flex items-center gap-1.5">
                                      {isTitular ? (
                                        <button
                                          onClick={() => handleToggleEscalar(player)}
                                          className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase transition-all cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-xs"
                                          title="Mover para o Banco de Reservas"
                                        >
                                          BANCO
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleToggleEscalar(player)}
                                          className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase transition-all cursor-pointer border shadow-xs"
                                          style={{
                                            backgroundColor: clubTheme.primary,
                                            color: clubTheme.textOnPrimary,
                                            borderColor: `${clubTheme.primary}90`,
                                          }}
                                          title="Escalar no Time Titular"
                                        >
                                          ESCALAR
                                        </button>
                                      )}

                                      <button
                                        onClick={() => handleOpenTroca(player)}
                                        className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                                        title="Substituir por outro jogador"
                                      >
                                        <ArrowRightLeft className="w-3 h-3 text-slate-500" />
                                        <span>TROCAR</span>
                                      </button>
                                    </div>

                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))
                  )}

                </div>
              )}
            </>
          )}

          {/* VISUALIZAÇÃO: ABA 2 — ESTATÍSTICAS DO ELENCO */}
          {activeTab === 'ESTATISTICAS' && (
            <div className="bg-[#f8fafc] rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-2xl text-slate-900 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Estatísticas de Rendimento do Plantel
                  </h2>
                  <p className="text-xs text-slate-500">
                    Jogos disputados, gols, assistências, nota média e valores de contrato do elenco atual
                  </p>
                </div>
              </div>

              {squad.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">Nenhuma estatística disponível</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Seu clube ainda não possui atletas registrados para exibir histórico de rendimento.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3">Jogador</th>
                        <th className="py-3 px-2 text-center">Pos</th>
                        <th className="py-3 px-2 text-center">OVR</th>
                        <th className="py-3 px-2 text-center">Jogos</th>
                        <th className="py-3 px-2 text-center">Gols</th>
                        <th className="py-3 px-2 text-center">Assist.</th>
                        <th className="py-3 px-2 text-center">Nota Média</th>
                        <th className="py-3 px-3 text-right">Salário/Mês</th>
                        <th className="py-3 px-3 text-right">Valor Mercado</th>
                        <th className="py-3 px-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {processedSquad.map((player) => (
                        <tr key={player.id} className="hover:bg-slate-100/70 transition-colors">
                          <td className="py-3 px-3">
                            <span
                              onClick={() => navigate(`/jogadores/${player.id}`)}
                              className="font-bold text-slate-900 hover:text-purple-700 cursor-pointer block truncate max-w-[150px]"
                            >
                              {player.knownAs || player.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {player.age} anos · {player.nationality}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <PositionTag position={player.position} />
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-slate-900">
                            {player.overall}
                          </td>
                          <td className="py-3 px-2 text-center font-mono text-slate-700">
                            {player.stats?.matches || 0}
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-emerald-600">
                            {player.stats?.goals || 0}
                          </td>
                          <td className="py-3 px-2 text-center font-mono text-indigo-600">
                            {player.stats?.assists || 0}
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-amber-600">
                            {player.stats?.averageRating ? player.stats.averageRating.toFixed(2) : '6.80'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">
                            {formatCurrencyBRL(player.wage, { compact: true, decimals: 0 })}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBRL(player.marketValue, { compact: true })}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleOpenTroca(player)}
                              className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
                            >
                              Trocar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* MODAL DE TROCA / SUBSTITUIÇÃO TÁTICA */}
      {swapModalOpen && playerToSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div
            className="rounded-3xl max-w-lg w-full p-6 shadow-2xl text-white space-y-4 border"
            style={{
              backgroundColor: '#0e0a1f',
              borderColor: `${clubTheme.primary}70`,
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-purple-900/30">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-base font-black uppercase text-white">
                    Substituir {playerToSwap.knownAs || playerToSwap.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                    <PositionTag position={playerToSwap.position} />
                    <span>OVR {playerToSwap.overall}</span>
                    <span>·</span>
                    <span>{titularPlayerIds.has(playerToSwap.id) ? 'Titular Atual' : 'Reserva'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSwapModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Selecione o jogador com quem deseja trocar de posição na escalação:
            </p>

            {/* Busca rápida no modal */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar atletas do elenco..."
                value={swapModalSearch}
                onChange={(e) => setSwapModalSearch(e.target.value)}
                className="w-full bg-[#0a0716] border border-purple-900/40 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Lista dos demais jogadores do elenco para seleção */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {squad
                .filter((p) => p.id !== playerToSwap.id)
                .filter((p) => {
                  const q = swapModalSearch.toLowerCase().trim();
                  return (
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    (p.knownAs && p.knownAs.toLowerCase().includes(q)) ||
                    p.position.toLowerCase().includes(q)
                  );
                })
                .map((candidate) => {
                  const isCandTitular = titularPlayerIds.has(candidate.id);
                  const isCandBench = benchIdsSet.has(candidate.id);

                  return (
                    <div
                      key={candidate.id}
                      onClick={() => handleExecuteTroca(candidate)}
                      className="p-3 rounded-2xl bg-[#140f2b] hover:bg-[#1f1742] border border-purple-900/40 hover:border-purple-500 transition-all flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <PositionTag position={candidate.position} />
                        <div>
                          <div className="text-xs font-black text-white group-hover:text-purple-200">
                            {candidate.knownAs || candidate.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                            <span>{candidate.age} anos</span>
                            <span>·</span>
                            <span>{candidate.positionCategory}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isCandTitular ? (
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase"
                            style={{
                              backgroundColor: clubTheme.primary,
                              color: clubTheme.textOnPrimary,
                            }}
                          >
                            TITULAR
                          </span>
                        ) : isCandBench ? (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 uppercase">
                            BANCO
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-500 uppercase">
                            APOIO
                          </span>
                        )}

                        <div className="text-right">
                          <span className="text-sm font-black font-mono text-amber-300">
                            {candidate.overall}
                          </span>
                          <span className="text-[8px] block text-zinc-500 uppercase font-bold">OVR</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSwapModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
