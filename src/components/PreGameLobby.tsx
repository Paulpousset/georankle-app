import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import type { AvatarConfig, Match } from '../types';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { Avatar } from './Avatar';
import { a11yHidden, announce } from '../lib/a11y';

interface PlayerProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  avatar_config: AvatarConfig | null;
}

interface PreGameLobbyProps {
  matchData: Match;
  currentUserId: string;
  onReady: () => void;
}

export function PreGameLobby({
  matchData,
  currentUserId,
  onReady,
}: PreGameLobbyProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [player1, setPlayer1] = useState<PlayerProfile | null>(null);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(null);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const ids = [matchData.player1_id, matchData.player2_id].filter(Boolean) as string[];
    supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_config')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return;
        const rows = data as PlayerProfile[];
        setPlayer1(rows.find((p) => p.id === matchData.player1_id) ?? { id: matchData.player1_id, username: null, avatar_url: null, avatar_config: null });
        setPlayer2(rows.find((p) => p.id === matchData.player2_id) ?? { id: matchData.player2_id ?? '', username: null, avatar_url: null, avatar_config: null });
      });
  }, [matchData.player1_id, matchData.player2_id]);

  useEffect(() => {
    if (countdown <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      announce(language === 'fr' ? "C'est parti !" : "Let's go!");
      onReady();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const t = setTimeout(() => setCountdown((cv) => cv - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onReady, language]);

  const MODE_LABELS: Record<string, string> = {
    classic: 'Rankle',
    streak: 'Mode Streak',
    versus: 'Mode Versus',
    globe: language === 'fr' ? 'Globe Géo' : 'Geo Globe',
    guess: language === 'fr' ? 'Devine le Pays' : 'Guess Country',
    regions: language === 'fr' ? 'Défis Pays' : 'Country Challenges',
    challenge: language === 'fr' ? 'Quiz Pays' : 'Country Quiz',
  };
  const modeLabel = matchData.game_data?.is_custom
    ? (language === 'fr' ? 'Partie perso' : 'Custom game')
    : MODE_LABELS[matchData.game_mode] ?? 'Mode Versus';

  const renderAvatar = (profile: PlayerProfile | null, isCurrentUser: boolean) => {
    const name = profile?.username ?? (language === 'fr' ? 'Joueur' : 'Player');
    return (
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Avatar
          config={profile?.avatar_config ?? null}
          photoUrl={profile?.avatar_url ?? null}
          username={profile?.username ?? name}
          size={80}
          ringColor={isCurrentUser ? '#2a6e3f' : c.border}
          ringWidth={isCurrentUser ? 3 : 1}
        />
        <Text style={{ color: c.text, fontFamily: FONTS.heading, fontSize: 16, textAlign: 'center' }}>
          {name}
        </Text>
        {isCurrentUser && (
          <Text style={{ color: '#2a6e3f', fontSize: 12, fontFamily: FONTS.monoBold }}>
            {language === 'fr' ? 'Vous' : 'You'}
          </Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <Text style={{ color: c.textFaint, fontSize: 14, fontFamily: FONTS.monoBold, letterSpacing: 2, marginBottom: 40 }}>
        {modeLabel.toUpperCase()}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 32 }}>
        {renderAvatar(player1, player1?.id === currentUserId)}

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
            {language === 'fr' ? 'contre' : 'vs'}
          </Text>
          <View
            style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: countdown > 0 ? '#1a4a7a' : '#2a6e3f',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text {...a11yHidden} style={{ color: '#fff', fontSize: 26, fontFamily: FONTS.headingBlack }}>
              {countdown > 0 ? countdown : '▶'}
            </Text>
          </View>
        </View>

        {renderAvatar(player2, player2?.id === currentUserId)}
      </View>

      <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginTop: 48 }}>
        {countdown > 0
          ? language === 'fr'
            ? `La partie commence dans ${countdown}…`
            : `Game starts in ${countdown}…`
          : language === 'fr'
            ? "C'est parti !"
            : "Let's go!"}
      </Text>
    </SafeAreaView>
  );
}
