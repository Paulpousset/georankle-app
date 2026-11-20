/**
 * Les quatre bulles de l'Accueil, en rangée sous le titre, et leurs fenêtres :
 * L'Impossible du jour, Coffre du jour, Tournoi de la semaine, Duel 20h.
 * Chaque bulle donne une raison de revenir à un rythme différent (chaque jour,
 * chaque soir, chaque semaine).
 */
import { useEffect, useState } from 'react';
import { Gift, Skull, Swords, Trophy } from 'lucide-react-native';

import { BubbleRow, type BubbleSpec } from './BubbleRow';
import { DailyChestModal, CHEST_GOLD } from '../DailyChestModal';
import { RushHourModal, RUSH_GREEN } from '../RushHourModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { tr } from '../../i18n';
import { track } from '../../lib/analytics';
import { getImpossibleState, impossibleSummary } from '../../lib/impossible';
import {
  chestDay,
  chestReady,
  getChestState,
  nextStreak,
  refreshChestState,
  type ChestState,
} from '../../lib/chest';
import { isRushHour, rushLocalHour } from '../../lib/rush';
import { msUntilTournamentEnd } from '../../lib/tournament';

/** Couleurs des bulles (fond sous une icône blanche). */
const IMPOSSIBLE_RED = '#9d1238';
const TOURNAMENT_BLUE = '#1a4a7a';

interface Props {
  /** Couleur des libellés sous les bulles (texte du thème). */
  labelColor: string;
  isAuthenticated: boolean;
  refreshKey: number;
  onOpenImpossible: () => void;
  onOpenTournament: () => void;
  onOpenDuel: () => void;
  onOpenAuth: () => void;
}

export function HomeBubbles({
  labelColor,
  isAuthenticated,
  refreshKey,
  onOpenImpossible,
  onOpenTournament,
  onOpenDuel,
  onOpenAuth,
}: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();

  const [impossible, setImpossible] = useState<{ answered: number; correct: number } | null>(null);
  const [chest, setChest] = useState<ChestState | null>(null);
  const [chestOpen, setChestOpen] = useState(false);
  const [rushOpen, setRushOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    getImpossibleState().then((s) => {
      if (alive) setImpossible(impossibleSummary(s));
    });
    // Le reflet local d'abord (instantané), puis le compte s'il y en a un.
    getChestState().then((s) => {
      if (alive) setChest(s);
    });
    if (user) {
      refreshChestState(user.id)
        .then((s) => {
          if (alive) setChest(s);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [refreshKey, user]);

  // L'heure de pointe s'allume et s'éteint sans quitter l'Accueil.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rushLive = isRushHour(now);
  const chestCanOpen = !!chest && chestReady(chest);
  const daysLeft = Math.ceil(msUntilTournamentEnd(now) / 86_400_000);

  const bubbles: BubbleSpec[] = [
    {
      id: 'impossible',
      icon: Skull,
      color: IMPOSSIBLE_RED,
      label: tr(language, 'Impossible', 'Impossible'),
      badge: !impossible ? null : impossible.answered === 0 ? 'NEW' : `${impossible.correct}/6`,
      pulse: !!impossible && impossible.answered < 6,
      a11yLabel: tr(language, 'L’Impossible du jour', 'Today’s Impossible'),
      onPress: () => {
        track('impossible_bubble_tap', { answered: impossible?.answered ?? 0 });
        onOpenImpossible();
      },
    },
    {
      id: 'chest',
      icon: Gift,
      color: CHEST_GOLD,
      label: tr(language, 'Coffre', 'Chest'),
      badge: chest ? tr(language, 'J{0}', 'D{0}', [chestDay(nextStreak(chest))]) : null,
      pulse: chestCanOpen,
      a11yLabel: tr(language, 'Coffre du jour', 'Daily chest'),
      onPress: () => {
        track('chest_bubble_tap', { ready: chestCanOpen });
        setChestOpen(true);
      },
    },
    {
      id: 'tournament',
      icon: Trophy,
      color: TOURNAMENT_BLUE,
      label: tr(language, 'Tournoi', 'Tournament'),
      badge: tr(language, '{0} j', '{0}d', [daysLeft]),
      pulse: false,
      a11yLabel: tr(language, 'Tournoi de la semaine', 'Weekly tournament'),
      onPress: () => {
        track('tournament_bubble_tap', { days_left: daysLeft });
        onOpenTournament();
      },
    },
    {
      id: 'rush',
      icon: Swords,
      color: RUSH_GREEN,
      label: rushLive
        ? tr(language, 'Duel x2', 'Duel x2')
        : tr(language, 'Duel {0}', '{0} Duel', [rushLocalHour(now, language)]),
      badge: rushLive ? 'LIVE' : 'x2',
      pulse: rushLive,
      a11yLabel: tr(language, 'Duel de l’heure de pointe', 'Rush-hour duel'),
      onPress: () => {
        track('rush_bubble_tap', { live: rushLive });
        setRushOpen(true);
      },
    },
  ];

  return (
    <>
      <BubbleRow bubbles={bubbles} labelColor={labelColor} />
      {chest && (
        <DailyChestModal
          visible={chestOpen}
          state={chest}
          isAuthenticated={isAuthenticated}
          onClose={() => setChestOpen(false)}
          onOpenAuth={() => {
            setChestOpen(false);
            onOpenAuth();
          }}
          onClaimed={setChest}
        />
      )}
      <RushHourModal
        visible={rushOpen}
        onClose={() => setRushOpen(false)}
        onGoDuel={() => {
          setRushOpen(false);
          onOpenDuel();
        }}
      />
    </>
  );
}
