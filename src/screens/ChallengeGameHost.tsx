/**
 * Défi entre amis en différé : intro → la grille (mêmes écrans que le défi du
 * jour, même graine pour les deux joueurs) → verdict.
 *
 * Deux usages (src/lib/friendChallenge.ts) :
 *  - `answer` : on ouvre le lien d'un ami, on joue sa grille, on voit qui gagne.
 *    Connecté, le score est enregistré et les deux deviennent amis ; invité, le
 *    score attend la connexion (proposée sur le verdict).
 *  - `create` : on joue une grille neuve, puis on l'envoie (« Revanche », onglet
 *    Duel, fin de défi du jour).
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '@supabase/supabase-js';
import { Eye, Home, RefreshCcw, Send, Swords, Trophy, X } from 'lucide-react-native';

import type { GameMode } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/ToastProvider';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { track } from '../lib/analytics';
import { dailyModeLabel } from '../lib/daily';
import {
  createFriendChallenge,
  fetchFriendChallenge,
  formatChallengeScore,
  randomSeed,
  shareChallenge,
  storePendingChallengeScore,
  submitFriendChallenge,
  verdict,
  type ChallengeIntent,
  type FriendChallenge,
} from '../lib/friendChallenge';
import { getTodayUTC } from '../lib/daily';
import { tr } from '../i18n';
import { SeededGame } from './seededGame';

interface Props {
  intent: ChallengeIntent;
  user: User | null;
  onExit: () => void;
  /** Start another challenge (« Revanche » → a fresh grid in the same mode). */
  onRestart: (intent: ChallengeIntent) => void;
  /** Open the sign-in modal (guest answering a challenge, or a guest wanting to send one). */
  onRequestLogin: () => void;
}

type Phase = 'loading' | 'missing' | 'intro' | 'playing' | 'end';

interface Game {
  mode: GameMode;
  seed: number;
  date: string;
}

export default function ChallengeGameHost({
  intent,
  user,
  onExit,
  onRestart,
  onRequestLogin,
}: Props) {
  const { language } = useLanguage();
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>(intent.kind === 'answer' ? 'loading' : 'intro');
  const [challenge, setChallenge] = useState<FriendChallenge | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [savedAsGuest, setSavedAsGuest] = useState(false);
  // Once a grid was played, the verdict sits ON TOP of the game's own end
  // screen (its recap stays one tap away), like the daily end.
  const [showVerdict, setShowVerdict] = useState(true);
  const [played, setPlayed] = useState(false);
  const completedRef = useRef(false);
  const liveScoreRef = useRef(0);

  const game: Game | null =
    intent.kind === 'create'
      ? { mode: intent.mode, seed: intent.seed, date: intent.date }
      : challenge
        ? { mode: challenge.mode, seed: challenge.seed, date: challenge.pool_date }
        : null;

  useEffect(() => {
    if (intent.kind !== 'answer') return;
    let alive = true;
    fetchFriendChallenge(intent.code).then((ch) => {
      if (!alive) return;
      if (!ch) {
        setPhase('missing');
        return;
      }
      setChallenge(ch);
      track('friend_challenge_opened', { mode: ch.mode, signed_in: Boolean(user) });
      // Already played it (or it's mine): straight to the results, no second try.
      const mine = user ? ch.results.find((r) => r.user_id === user.id) : undefined;
      if (user && ch.creator_id === user.id) {
        setPhase('end');
      } else if (mine) {
        setMyScore(mine.score);
        setPhase('end');
      } else {
        setPhase('intro');
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A guest who signs in from the verdict: record the score now and refresh the
  // board (the deep-link hook also flushes the pending score; the server keeps
  // the first one, so the two never double-count).
  useEffect(() => {
    if (!user || !savedAsGuest || intent.kind !== 'answer' || myScore == null) return;
    let alive = true;
    (async () => {
      await submitFriendChallenge(intent.code, myScore);
      const fresh = await fetchFriendChallenge(intent.code);
      if (!alive) return;
      if (fresh) setChallenge(fresh);
      setSavedAsGuest(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleComplete = async (score: number) => {
    if (completedRef.current || !game) return;
    completedRef.current = true;
    setPlayed(true);
    setMyScore(score);
    if (intent.kind === 'answer') {
      if (user) {
        const out = await submitFriendChallenge(intent.code, score);
        if (out?.befriended && challenge?.creator_name) {
          toast.success(
            tr(language, '{0} est maintenant ton ami', '{0} is now your friend', [
              challenge.creator_name,
            ]),
          );
        }
        // Refresh so the board includes me.
        const fresh = await fetchFriendChallenge(intent.code);
        if (fresh) setChallenge(fresh);
      } else {
        await storePendingChallengeScore(intent.code, score);
        setSavedAsGuest(true);
      }
    } else if (user) {
      const code = await createFriendChallenge({ ...game, score });
      setSentCode(code);
      if (!code)
        toast.error(
          tr(
            language,
            'Impossible de créer le défi, réessaie.',
            'Could not create the challenge, try again.',
          ),
        );
    }
    setPhase('end');
  };

  const requestExit = () => {
    if (phase === 'playing' && !completedRef.current) {
      // Leaving mid-game locks in the current score, like the daily.
      void handleComplete(liveScoreRef.current);
      return;
    }
    onExit();
  };

  const onShare = () => {
    if (!game || myScore == null) return;
    const code = intent.kind === 'answer' ? intent.code : sentCode;
    if (!code) return;
    shareChallenge(game.mode, myScore, code, language, () =>
      toast.success(tr(language, 'Lien copié !', 'Link copied!')),
    ).catch(() => {});
  };

  const revanche = () => {
    if (!game) return;
    if (!user) {
      onRequestLogin();
      return;
    }
    onRestart({ kind: 'create', mode: game.mode, seed: randomSeed(), date: getTodayUTC() });
  };

  const gameScreen =
    game && (phase === 'playing' || (phase === 'end' && played)) ? (
      <SeededGame
        mode={game.mode}
        seed={game.seed}
        date={game.date}
        user={user}
        ghost={false}
        handleComplete={handleComplete}
        reportScore={(sc) => {
          liveScoreRef.current = sc;
        }}
        requestExit={requestExit}
        onShare={onShare}
      />
    ) : null;

  // ── Playing ──────────────────────────────────────────────────────────────
  if (phase === 'playing' && gameScreen) {
    return <SafeAreaProvider>{gameScreen}</SafeAreaProvider>;
  }

  const modeName = game ? dailyModeLabel(game.mode, language) : '';
  const fmt = (n: number) => (game ? formatChallengeScore(game.mode, n, language) : `${n}`);

  const button = (label: string, Icon: typeof Home, onPress: () => void, primary = false) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      style={[
        styles.btn,
        primary
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : { borderColor: c.border, backgroundColor: c.card },
      ]}
      {...a11yButton(label)}
    >
      <Icon color={primary ? '#fff' : c.text} size={18} {...a11yHidden} />
      <Text style={[styles.btnText, { color: primary ? '#fff' : c.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  let content: React.ReactNode = null;

  if (phase === 'loading') {
    content = <ActivityIndicator color={c.accent} />;
  } else if (phase === 'missing') {
    content = (
      <>
        <Text style={[styles.title, { color: c.text }]}>
          {tr(language, 'Défi introuvable', 'Challenge not found')}
        </Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>
          {tr(language, 'Le lien est peut-être incomplet.', 'The link may be incomplete.')}
        </Text>
        {button(tr(language, 'Menu', 'Menu'), Home, onExit, true)}
      </>
    );
  } else if (phase === 'intro' && game) {
    const startLabel = tr(language, 'Jouer', 'Play');
    content =
      intent.kind === 'answer' && challenge ? (
        <>
          <Swords color={c.accent} size={36} {...a11yHidden} />
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, '{0} te défie !', '{0} challenges you!', [
              challenge.creator_name || tr(language, 'Un ami', 'A friend'),
            ])}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{modeName}</Text>
          <View style={[styles.scoreBox, { borderColor: c.border, backgroundColor: c.card }]}>
            <Text style={[styles.scoreLabel, { color: c.textMuted }]}>
              {tr(language, 'Score à battre', 'Score to beat')}
            </Text>
            <Text style={[styles.scoreValue, { color: c.text }]}>
              {fmt(challenge.creator_score)}
            </Text>
          </View>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {tr(language, 'Même grille que lui, un seul essai.', 'Same grid as them, one try.')}
          </Text>
          {button(startLabel, Swords, () => setPhase('playing'), true)}
          {button(tr(language, 'Plus tard', 'Later'), X, onExit)}
        </>
      ) : (
        <>
          <Send color={c.accent} size={36} {...a11yHidden} />
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, 'Défier un ami', 'Challenge a friend')}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{modeName}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {tr(
              language,
              'Joue ta grille, puis envoie-la. Ton ami joue exactement la même, quand il veut.',
              'Play your grid, then send it. Your friend plays the exact same one, whenever they like.',
            )}
          </Text>
          {button(startLabel, Swords, () => setPhase('playing'), true)}
          {button(tr(language, 'Retour', 'Back'), X, onExit)}
        </>
      );
  } else if (phase === 'end' && game) {
    if (intent.kind === 'create') {
      content = (
        <>
          <Trophy color={c.accent} size={36} {...a11yHidden} />
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, 'Ton score : {0}', 'Your score: {0}', [fmt(myScore ?? 0)])}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {user
              ? tr(
                  language,
                  'Envoie le défi : ton ami jouera la même grille.',
                  'Send the challenge: your friend will play the same grid.',
                )
              : tr(
                  language,
                  'Connecte-toi pour envoyer ce défi.',
                  'Sign in to send this challenge.',
                )}
          </Text>
          {user
            ? sentCode
              ? button(tr(language, 'Envoyer le défi', 'Send the challenge'), Send, onShare, true)
              : null
            : button(tr(language, 'Se connecter', 'Sign in'), Send, onRequestLogin, true)}
          {button(tr(language, 'Menu', 'Menu'), Home, onExit)}
        </>
      );
    } else if (challenge) {
      const isCreator = Boolean(user && challenge.creator_id === user.id);
      const v = myScore != null ? verdict(myScore, challenge.creator_score) : null;
      const name = challenge.creator_name || tr(language, 'ton ami', 'your friend');
      const headline = isCreator
        ? tr(language, 'Ton défi', 'Your challenge')
        : v === 'win'
          ? tr(language, 'Tu as battu {0} !', 'You beat {0}!', [name])
          : v === 'tie'
            ? tr(language, 'Égalité avec {0}', 'Tied with {0}', [name])
            : tr(language, '{0} garde la tête', '{0} stays ahead', [name]);
      const board = [
        { username: challenge.creator_name, score: challenge.creator_score, me: isCreator },
        ...challenge.results.map((r) => ({
          username: r.username,
          score: r.score,
          me: Boolean(user && r.user_id === user.id),
        })),
      ];
      if (!user && myScore != null)
        board.push({ username: tr(language, 'Toi', 'You'), score: myScore, me: true });
      board.sort((a, b) => b.score - a.score);
      content = (
        <>
          <Trophy color={c.accent} size={36} {...a11yHidden} />
          <Text style={[styles.title, { color: c.text }]}>{headline}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{modeName}</Text>
          <View style={[styles.board, { borderColor: c.border, backgroundColor: c.card }]}>
            {board.map((row, i) => (
              <View key={`${row.username}-${i}`} style={styles.boardRow}>
                <Text style={[styles.boardRank, { color: c.textMuted }]}>{i + 1}</Text>
                <Text
                  style={[
                    styles.boardName,
                    { color: c.text, fontFamily: row.me ? FONTS.monoBold : FONTS.mono },
                  ]}
                  numberOfLines={1}
                >
                  {row.username || tr(language, 'Joueur', 'Player')}
                </Text>
                <Text style={[styles.boardScore, { color: c.text }]}>{fmt(row.score)}</Text>
              </View>
            ))}
          </View>
          {savedAsGuest ? (
            <>
              <Text style={[styles.sub, { color: c.textMuted }]}>
                {tr(
                  language,
                  'Connecte-toi pour enregistrer ton score et ajouter {0} en ami.',
                  'Sign in to save your score and add {0} as a friend.',
                  [name],
                )}
              </Text>
              {button(tr(language, 'Se connecter', 'Sign in'), Send, onRequestLogin, true)}
            </>
          ) : null}
          {!isCreator
            ? button(tr(language, 'Revanche', 'Rematch'), RefreshCcw, revanche, !savedAsGuest)
            : null}
          {myScore != null || isCreator
            ? button(
                tr(language, 'Défier quelqu’un d’autre', 'Challenge someone else'),
                Send,
                () => {
                  const score = isCreator ? challenge.creator_score : (myScore ?? 0);
                  shareChallenge(challenge.mode, score, challenge.code, language, () =>
                    toast.success(tr(language, 'Lien copié !', 'Link copied!')),
                  ).catch(() => {});
                },
              )
            : null}
          {button(tr(language, 'Menu', 'Menu'), Home, onExit)}
        </>
      );
    }
  }

  const panel = (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        {content}
        {gameScreen
          ? button(tr(language, 'Voir ma partie', 'See my game'), Eye, () => setShowVerdict(false))
          : null}
      </ScrollView>
    </SafeAreaView>
  );

  if (gameScreen) {
    return (
      <SafeAreaProvider>
        {gameScreen}
        {showVerdict ? <View style={StyleSheet.absoluteFill}>{panel}</View> : null}
      </SafeAreaProvider>
    );
  }
  return panel;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontFamily: FONTS.heading, fontSize: 24, textAlign: 'center' },
  sub: { fontFamily: FONTS.mono, fontSize: 13, textAlign: 'center' },
  scoreBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  scoreLabel: { fontFamily: FONTS.mono, fontSize: 11 },
  scoreValue: { fontFamily: FONTS.heading, fontSize: 32 },
  board: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    gap: 6,
  },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boardRank: { fontFamily: FONTS.monoBold, fontSize: 12, width: 18 },
  boardName: { flex: 1, fontSize: 13 },
  boardScore: { fontFamily: FONTS.monoBold, fontSize: 13 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignSelf: 'stretch',
  },
  btnText: { fontFamily: FONTS.monoBold, fontSize: 14 },
});
