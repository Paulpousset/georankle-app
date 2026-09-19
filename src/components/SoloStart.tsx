/**
 * Écran de lancement d'une partie solo — « prêt ? ».
 *
 * Avant, taper un mode au menu tombait directement sur la question 1 : aucun
 * temps de respiration, aucun rappel des règles passé le tout premier essai, et
 * surtout le globe qu'on venait d'acheter ne se voyait nulle part. Cet écran
 * donne au globe équipé sa vitrine (avec son nom, sa rareté et un raccourci vers
 * « Globes en jeu »), rappelle le mode et ses règles, et laisse partir d'un tap.
 *
 * Monté une seule fois, au niveau du Router, pour les modes qui se lancent
 * directement — ceux qui ont déjà leur propre écran de choix (Régions, Langues,
 * Quiz Pays, parcours local) gardent le leur. Jamais affiché en match en ligne,
 * en défi quotidien ni en mode Histoire : ces flux ont leur propre lobby.
 */
import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Globe, HelpCircle, Palette, Play } from 'lucide-react-native';

import type { GameMode } from '../types';
import { MODE_INTROS } from '../data/modeIntros';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { tr } from '../i18n';
import { useMyGameGlobe } from '../lib/myGlobe';
import { EquippedChips } from './EquippedChips';
import { ModeIntroCard } from './ModeIntroModal';
import { PlayerGlobe } from './PlayerGlobe';

interface SoloStartProps {
  mode: GameMode;
  onStart: () => void;
  onExit: () => void;
  /** « Globes en jeu ». Absent (déconnecté) = le raccourci disparaît. */
  onChangeGlobe?: () => void;
  /** Éditeur « Mon Monde » (orbite, emblème, satellite, cosmos). */
  onCustomize?: () => void;
  /** Badges d'état de la partie : continent choisi, entraînement, révision. */
  badges?: string[];
}

export function SoloStart({ mode, onStart, onExit, onChangeGlobe, onCustomize, badges = [] }: SoloStartProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [showRules, setShowRules] = useState(false);
  const { config } = useMyGameGlobe();

  const intro = MODE_INTROS[mode];
  const accent = intro?.accent ?? c.accentStrong;
  const Icon = intro?.icon;
  const title = intro ? (tr(language, intro.titleFr, intro.titleEn)) : mode;
  const body = intro ? (tr(language, intro.bodyFr, intro.bodyEn)) : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <TouchableOpacity
        onPress={onExit}
        {...a11yButton(tr(language, 'Retour au menu', 'Back to menu'))}
        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 16 }}
      >
        <ArrowLeft color={c.textMuted} size={20} {...a11yHidden} />
        <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 13 }}>
          {tr(language, 'Menu', 'Menu')}
        </Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingBottom: 24,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 8 }}>
          {Icon ? <Icon color={accent} size={34} {...a11yHidden} /> : null}
          <Text
            style={{ color: c.text, fontFamily: FONTS.headingBlack, fontSize: 28, textAlign: 'center' }}
          >
            {title}
          </Text>
          {/* Sans limite de lignes : la règle du mode se lit en entier dans les
              seize langues. Le vietnamien et l'allemand débordaient des trois
              lignes du français et perdaient leur fin de phrase — l'écran est
              déjà dans une ScrollView, il n'y a rien à protéger. */}
          <Text
            style={{
              color: c.textMuted,
              fontFamily: FONTS.mono,
              fontSize: 12.5,
              lineHeight: 18,
              textAlign: 'center',
              maxWidth: 360,
            }}
          >
            {body}
          </Text>
        </View>

        {badges.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {badges.map((b) => (
              <View
                key={b}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10.5 }}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        {/* La vedette : le monde avec lequel on va jouer — le globe, puis chaque
            cosmétique porté en puce, et deux vrais boutons pour en changer
            (Paul, 19/09/2026 : « mets plus en avant le changement de globe et
            tous les cosmétiques dans les modes de jeu »). */}
        <PlayerGlobe
          config={config}
          size={188}
          label={tr(language, 'TON MONDE', 'YOUR WORLD')}
          accent={accent}
          animate
          onPress={onChangeGlobe}
          showGlobeName
        />
        <EquippedChips config={config} onPressPart={onCustomize} action="edit" />
        {onChangeGlobe || onCustomize ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {onChangeGlobe ? (
              <TouchableOpacity
                onPress={onChangeGlobe}
                activeOpacity={0.85}
                {...a11yButton(tr(language, 'Changer de globe', 'Change globe'))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderWidth: 1.5,
                  borderColor: accent,
                  backgroundColor: c.card,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                }}
              >
                <Globe color={accent} size={18} {...a11yHidden} />
                <Text style={{ color: accent, fontFamily: FONTS.monoBold, fontSize: 13 }}>
                  {tr(language, 'Changer de globe', 'Change globe')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {onCustomize ? (
              <TouchableOpacity
                onPress={onCustomize}
                activeOpacity={0.85}
                {...a11yButton(tr(language, 'Personnaliser mon monde', 'Customize my world'))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderWidth: 1.5,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                }}
              >
                <Palette color={c.text} size={18} {...a11yHidden} />
                <Text style={{ color: c.text, fontFamily: FONTS.monoBold, fontSize: 13 }}>
                  {tr(language, 'Personnaliser mon monde', 'Customize my world')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          onPress={onStart}
          activeOpacity={0.9}
          {...a11yButton(tr(language, 'Commencer la partie', 'Start the game'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: accent,
            borderRadius: 16,
            paddingVertical: 18,
            paddingHorizontal: 40,
            // `stretch` + `maxWidth` = collé à gauche : dès que la contrainte de
            // taille mord (stage web de 900 px), flexbox aligne la boîte au
            // début de l'axe. Largeur explicite + `center` pour rester centré.
            alignSelf: 'center',
            width: '100%',
            maxWidth: 420,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          }}
        >
          <Play color="#fff" size={22} fill="#fff" {...a11yHidden} />
          <Text style={{ color: '#fff', fontFamily: FONTS.headingBlack, fontSize: 18, letterSpacing: 1 }}>
            {tr(language, 'COMMENCER', 'START')}
          </Text>
        </TouchableOpacity>

        {intro && (
          <TouchableOpacity
            onPress={() => setShowRules(true)}
            {...a11yButton(tr(language, 'Voir les règles', 'See the rules'))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
          >
            <HelpCircle color={c.textMuted} size={16} {...a11yHidden} />
            <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 12.5 }}>
              {tr(language, 'Règles du jeu', 'How to play')}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ModeIntroCard mode={showRules ? mode : null} onDismiss={() => setShowRules(false)} />
    </SafeAreaView>
  );
}
