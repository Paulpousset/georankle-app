/**
 * The listen button for the audio variant of « Langues ».
 *
 * Deliberate choices:
 *  - No autoplay. Browsers block it without a gesture, and it makes the mode
 *    hostile to screen-reader users.
 *  - Unlimited replays, counted but free. The only risk axis in this format is
 *    DUO / CARRÉ / CASH; charging for replays would double up on it.
 *  - After two failed loads the parent degrades the question to text rather
 *    than losing the round. That fallback is purely LOCAL: it changes nothing
 *    about the seed, the options or the score, so an online opponent who hears
 *    the clip fine stays perfectly in sync.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Play, Volume2 } from 'lucide-react-native';

import type { LanguagePhrase } from '../data/languages';
import { ensureCached } from '../lib/languageAudio';
import { log } from '../lib/log';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import type { Language } from '../types';

/** Two failures on the same clip and we stop fighting the network. */
const MAX_ATTEMPTS = 2;

interface Props {
  code: string;
  phrase: LanguagePhrase;
  language: Language;
  accent: string;
  textColor: string;
  mutedColor: string;
  /** Raised once the clip is unplayable — the parent then reveals the text. */
  onUnavailable: () => void;
}

export default function PhrasePlayer({
  code, phrase, language, accent, textColor, mutedColor, onUnavailable,
}: Props) {
  const [loading, setLoading] = useState(false);
  // Keyed by phrase id rather than reset in an effect: resetting state from an
  // effect costs an extra render and briefly shows the previous question's
  // replay count on the new one.
  const [playsBy, setPlaysBy] = useState<Record<string, number>>({});
  const plays = playsBy[phrase.id] ?? 0;
  const playerRef = useRef<AudioPlayer | null>(null);
  const attemptsRef = useRef<Record<string, number>>({});

  // Without this the whole mode is silent on an iPhone with the ring switch
  // flipped — which reads as "the game is broken", including in store review.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // One player per phrase; release it when the question changes.
  useEffect(() => {
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, [phrase.id]);

  const play = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (!playerRef.current) {
        const uri = await ensureCached(code, phrase);
        playerRef.current = createAudioPlayer({ uri });
      }
      playerRef.current.seekTo(0);
      playerRef.current.play();
      setPlaysBy((m) => ({ ...m, [phrase.id]: (m[phrase.id] ?? 0) + 1 }));
    } catch (e) {
      log.debug('language clip failed', e);
      playerRef.current?.remove();
      playerRef.current = null;
      const tries = (attemptsRef.current[phrase.id] ?? 0) + 1;
      attemptsRef.current[phrase.id] = tries;
      if (tries >= MAX_ATTEMPTS) onUnavailable();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, { borderColor: accent }]}
        onPress={play}
        disabled={loading}
        {...a11yButton(
          plays === 0
            ? tr(language, 'Écouter l’extrait', 'Play the clip')
            : tr(language, 'Réécouter l’extrait', 'Play the clip again'),
        )}
      >
        {loading ? (
          <ActivityIndicator color={accent} />
        ) : plays === 0 ? (
          <Play color={accent} size={34} />
        ) : (
          <Volume2 color={accent} size={34} />
        )}
      </TouchableOpacity>
      <Text style={[styles.hint, { color: plays === 0 ? textColor : mutedColor }]}>
        {plays === 0
          ? tr(language, 'Appuie pour écouter', 'Tap to listen')
          : tr(language, `Réécouter (${plays})`, `Play again (${plays})`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  btn: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { fontFamily: FONTS.mono, fontSize: 13 },
});
