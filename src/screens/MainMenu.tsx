import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  BarChart3,
  Info,
  LayoutGrid,
  LogIn,
  Moon,
  Sun,
  User,
  Users,
  Zap,
} from 'lucide-react-native';
import type { ComponentType } from 'react';

import type { GameMode, Language, MatchMode } from '../types';
import { commonStyles as styles } from '../theme/commonStyles';
import { PALETTE } from '../theme/colors';
import { tr } from '../i18n';

interface ModeButton {
  label: string;
  color: string;
  onPress: () => void;
}

interface ModeCardProps {
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  tint: string;
  title: string;
  isDarkMode: boolean;
  buttons: ModeButton[];
}

function ModeCard({ icon: Icon, accent, tint, title, isDarkMode, buttons }: ModeCardProps) {
  return (
    <View
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          padding: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 15,
          borderLeftWidth: 8,
          borderLeftColor: accent,
        },
      ]}
    >
      <View style={{ backgroundColor: tint, padding: 15, borderRadius: 15 }}>
        <Icon color={accent} size={32} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.countryName,
            !isDarkMode && styles.countryNameLight,
            { fontSize: 20, textAlign: 'left', marginBottom: 4 },
          ]}
        >
          {title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
          {buttons.map((button) => (
            <TouchableOpacity
              key={button.label}
              onPress={button.onPress}
              style={{
                backgroundColor: button.color,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>{button.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

interface MainMenuProps {
  isDarkMode: boolean;
  language: Language;
  isAuthenticated: boolean;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onOpenAuth: () => void;
  onOpenFriends: () => void;
  onOpenLeaderboard: () => void;
  onPlay: (mode: GameMode) => void;
  onPlayOnline: (mode: MatchMode) => void;
}

export function MainMenu({
  isDarkMode,
  language,
  isAuthenticated,
  onToggleTheme,
  onToggleLanguage,
  onOpenAuth,
  onOpenFriends,
  onOpenLeaderboard,
  onPlay,
  onPlayOnline,
}: MainMenuProps) {
  const iconColor = isDarkMode ? '#f8fafc' : '#1e293b';

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[
          styles.container,
          !isDarkMode && styles.containerLight,
          { justifyContent: 'center', alignItems: 'center', padding: 20 },
        ]}
      >
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={{ position: 'absolute', top: 60, right: 20, flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onOpenAuth}
            style={[
              styles.refreshBtn,
              !isDarkMode && styles.refreshBtnLight,
              { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
            ]}
          >
            {isAuthenticated ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#2563eb',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User color="white" size={16} />
                </View>
                <Text style={{ color: iconColor, fontWeight: 'bold', fontSize: 12 }}>
                  {tr(language, 'Profil', 'Profile')}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <LogIn color={iconColor} size={20} />
                <Text style={{ color: iconColor, fontWeight: 'bold', fontSize: 12 }}>
                  {tr(language, 'Connexion', 'Login')}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onToggleLanguage}
            style={[
              styles.refreshBtn,
              !isDarkMode && styles.refreshBtnLight,
              { padding: 10, minWidth: 45, alignItems: 'center' },
            ]}
          >
            <Text style={{ color: isDarkMode ? '#fff' : '#1e293b', fontWeight: 'bold' }}>
              {language.toUpperCase()}
            </Text>
          </TouchableOpacity>
          {isAuthenticated && (
            <TouchableOpacity
              onPress={onOpenFriends}
              style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
            >
              <Users color={iconColor} size={24} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onToggleTheme}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          >
            {isDarkMode ? <Sun color="#fbbf24" size={24} /> : <Moon color="#64748b" size={24} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenLeaderboard}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          >
            <BarChart3 color={iconColor} size={24} />
          </TouchableOpacity>
        </View>

        <Text
          style={[
            styles.title,
            !isDarkMode && styles.titleLight,
            { fontSize: 48, marginBottom: 10 },
          ]}
        >
          GeoRankle
        </Text>
        <Text style={{ color: '#64748b', fontSize: 16, marginBottom: 50, textAlign: 'center' }}>
          {tr(
            language,
            'Testez vos connaissances géographiques mondiales',
            'Test your global geographical knowledge',
          )}
        </Text>

        <View style={{ gap: 20, width: '100%', maxWidth: 400 }}>
          <ModeCard
            icon={LayoutGrid}
            accent={PALETTE.green}
            tint="rgba(16, 185, 129, 0.1)"
            title={tr(language, 'Mode Classique', 'Classic Mode')}
            isDarkMode={isDarkMode}
            buttons={[
              { label: 'Solo', color: PALETTE.green, onPress: () => onPlay('classic') },
              ...(isAuthenticated
                ? [
                    {
                      label: 'En Ligne',
                      color: PALETTE.blue,
                      onPress: () => onPlayOnline('classic'),
                    },
                  ]
                : []),
            ]}
          />
          <ModeCard
            icon={Zap}
            accent={PALETTE.amberLight}
            tint="rgba(251, 191, 36, 0.1)"
            title={tr(language, 'Mode Streak', 'Streak Mode')}
            isDarkMode={isDarkMode}
            buttons={[
              { label: 'Solo', color: PALETTE.amberLight, onPress: () => onPlay('streak') },
              ...(isAuthenticated
                ? [
                    {
                      label: 'En Ligne',
                      color: PALETTE.blue,
                      onPress: () => onPlayOnline('streak'),
                    },
                  ]
                : []),
            ]}
          />
          <ModeCard
            icon={Users}
            accent={PALETTE.blue}
            tint="rgba(59, 130, 246, 0.1)"
            title={tr(language, 'Mode Versus', 'Versus Mode')}
            isDarkMode={isDarkMode}
            buttons={[
              { label: 'Local', color: PALETTE.blue, onPress: () => onPlay('versus') },
              ...(isAuthenticated
                ? [
                    {
                      label: 'En Ligne',
                      color: PALETTE.purple,
                      onPress: () => onPlayOnline('versus'),
                    },
                  ]
                : []),
            ]}
          />
          <ModeCard
            icon={Info}
            accent={PALETTE.pink}
            tint="rgba(236, 72, 153, 0.1)"
            title={tr(language, 'Devinez le Pays', 'Guess Country')}
            isDarkMode={isDarkMode}
            buttons={[{ label: 'Solo', color: PALETTE.pink, onPress: () => onPlay('guess') }]}
          />
        </View>

        <Text style={{ position: 'absolute', bottom: 40, color: '#475569', fontSize: 12 }}>
          v2.0 • GeoRankle Engine
        </Text>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
