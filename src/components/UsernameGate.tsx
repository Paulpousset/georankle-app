/**
 * Blocking "choose a username" gate.
 *
 * Usernames are required at sign-up now, but two paths can still leave an
 * authenticated user without one: legacy accounts created before the rule, and
 * the email-confirmation sign-up flow (the profile row can't be written until
 * the first confirmed login). This gate covers both — the first time a logged-in
 * user has no username, it pops a non-dismissible card and won't let them back
 * to the game until they pick one. No more "Anonymous Player" on the leaderboard.
 *
 * Mounted once at the app root as a sibling of the Router (like ModeIntroGate).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { User } from 'lucide-react-native';

import { tr } from '../i18n';
import { supabase } from '../lib/supabase';
import { cacheClear } from '../lib/cache';
import { log } from '../lib/log';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton } from '../lib/a11y';
import { isValidUsername, usernameError, USERNAME_MAX } from '../lib/validation';

export function UsernameGate() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  // null = not resolved yet / gate closed; true = needs a username (show card).
  const [needsUsername, setNeedsUsername] = useState(false);
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);

  // When a user signs in, check whether their profile already has a username.
  // A cancel flag drops a slow lookup that lands after they signed out again.
  useEffect(() => {
    if (!user) {
      setNeedsUsername(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Don't trap the user behind the gate on a transient fetch error.
        log.error('UsernameGate profile fetch error:', error);
        return;
      }
      const existing = (data?.username ?? '').trim();
      if (existing) {
        setNeedsUsername(false);
      } else {
        // Prefill from sign-up metadata (email-confirmation flow stashes it there)
        // so a fresh account often just has to tap the button once.
        const metaName =
          typeof user.user_metadata?.username === 'string' ? user.user_metadata.username : '';
        setUsername(metaName);
        setNeedsUsername(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const err = usernameError(language, username);

  async function save() {
    if (!user || !isValidUsername(username)) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: username.trim(), updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      log.error('UsernameGate save error:', error);
      return;
    }
    cacheClear(`profile:${user.id}`);
    setNeedsUsername(false);
  }

  if (!needsUsername) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 350,
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
              marginBottom: 16,
            }}
          >
            <User color="#fff" size={30} />
          </View>

          <Text
            style={{
              fontFamily: FONTS.headingBlack,
              fontSize: 20,
              color: c.text,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {tr(language, 'Choisis ton pseudo', 'Choose your username')}
          </Text>
          <Text
            style={{
              fontFamily: FONTS.mono,
              fontSize: 13,
              color: c.textMuted,
              textAlign: 'center',
              lineHeight: 19,
              marginBottom: 20,
            }}
          >
            {tr(
              language,
              'Il apparaîtra sur les classements et en ligne. Choisis-en un pour continuer.',
              'It appears on leaderboards and online. Pick one to continue.',
            )}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: c.surface,
              borderRadius: 12,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <User size={18} color={c.textMuted} style={{ marginRight: 10 }} />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder={tr(language, 'Pseudo', 'Username')}
              placeholderTextColor={c.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX}
              returnKeyType="done"
              onSubmitEditing={save}
              style={{ flex: 1, height: 48, color: c.text, fontSize: 16, fontFamily: FONTS.mono }}
              accessibilityLabel={tr(language, 'Pseudo', 'Username')}
            />
          </View>
          {err && (
            <Text
              style={{
                color: '#c04a1a',
                fontSize: 12,
                fontFamily: FONTS.mono,
                marginTop: 6,
                marginLeft: 4,
              }}
            >
              {err}
            </Text>
          )}

          <TouchableOpacity
            onPress={save}
            disabled={saving || !isValidUsername(username)}
            style={{
              height: 50,
              borderRadius: 14,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 20,
              opacity: saving || !isValidUsername(username) ? 0.5 : 1,
            }}
            {...a11yButton(tr(language, 'Continuer', 'Continue'), {
              disabled: saving || !isValidUsername(username),
              busy: saving,
            })}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 15 }}>
                {tr(language, 'Continuer', 'Continue')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
