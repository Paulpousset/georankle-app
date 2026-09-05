/**
 * ResumeMatchBanner — shown on the main menu when the player has a recently-left
 * online match still resumable (item 8). The active match id is remembered
 * locally (src/lib/activeMatch.ts) when entering a match; on the menu we look it
 * up, verify it's still open server-side and within the resume window, and offer
 * to jump back in. Tapping resume hands the fresh match row back to the caller.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RotateCcw, X } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { Match } from '../types';
import { supabase } from '../lib/supabase';
import { getResumableMatch, clearActiveMatch } from '../lib/activeMatch';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';

export function ResumeMatchBanner({
  user,
  onResume,
}: {
  user: User | null;
  onResume: (match: Match) => void;
}) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const c = getColors(isDarkMode);
  const [match, setMatch] = useState<Match | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const ref = await getResumableMatch(Date.now());
      if (!ref || cancelled) return;
      const { data, error } = await supabase.from('matches').select('*').eq('id', ref.matchId).maybeSingle();
      if (cancelled) return;
      // A network error must NOT wipe the resume pointer — the match may still
      // be live. Only clear it when the server positively says the row is gone
      // or finished; on error, keep it and retry on the next mount.
      if (error) return;
      const m = data as Match | null;
      if (m && (m.status === 'in_progress' || m.status === 'waiting')) {
        setMatch(m);
      } else {
        clearActiveMatch();
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!match) return null;

  const dismiss = () => {
    clearActiveMatch();
    setMatch(null);
  };

  return (
    // Anchored to the BOTTOM: the top of the screen is already taken by the
    // status bar / notch (the banner used to sit at top:0, i.e. under the
    // notch and unreachable on phones), plus the offline bar and the toasts.
    <View
      style={[
        styles.banner,
        { backgroundColor: c.card, borderColor: PALETTE.forestGreen, bottom: insets.bottom + 12 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: c.text }]}>
          {tr(language, 'Partie en cours', 'Match in progress')}
        </Text>
        <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={1}>
          {tr(language, 'Reprends là où tu en étais', 'Pick up where you left off')}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.resumeBtn, { backgroundColor: PALETTE.forestGreen }]}
        onPress={() => { const m = match; setMatch(null); onResume(m); }}
        hitSlop={ICON_HIT_SLOP}
        {...a11yButton(tr(language, 'Reprendre la partie', 'Resume match'))}
      >
        <RotateCcw color="#fff" size={16} />
        <Text style={styles.resumeText}>{tr(language, 'Reprendre', 'Resume')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={dismiss}
        hitSlop={ICON_HIT_SLOP}
        style={{ padding: 6 }}
        {...a11yButton(tr(language, 'Ignorer', 'Dismiss'))}
      >
        <X color={c.textMuted} size={18} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
    // Lift it off the menu content it floats over.
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  title: { fontFamily: FONTS.headingBlack, fontSize: 14 },
  sub: { fontFamily: FONTS.mono, fontSize: 11, marginTop: 1 },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  resumeText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 13 },
});
