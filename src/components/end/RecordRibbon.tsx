/**
 * <RecordRibbon> — le ruban « NOUVEAU RECORD » qui claque en coin de carte.
 *
 * Or sur sépia, penché, tamponné à 1 s (quand le globe s'est posé et que le
 * score se compte). Le ruban est posé en absolu : le parent doit être
 * `position: relative` (tout View l'est) et laisser déborder.
 */
import { Text, View } from 'react-native';

import { useLanguage } from '../../contexts/LanguageContext';
import { tr } from '../../i18n';
import { FONTS } from '../../theme/typography';
import { Reveal } from './Reveal';

const GOLD = '#f5b301';
const GOLD_DEEP = '#8a5a00';

interface RecordRibbonProps {
  at?: number;
  /** Record précédent, pour la petite ligne « ancien record ». */
  previous?: number | null;
  formatScore?: (n: number) => string;
}

export function RecordRibbon({ at = 1000, previous = null, formatScore }: RecordRibbonProps) {
  const { language } = useLanguage();
  const label = tr(language, 'Nouveau record', 'New record');
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -10, right: -6, zIndex: 5 }}>
      <Reveal at={at} kind="stamp" style={{ alignSelf: 'auto' }}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={label}
          style={{
            backgroundColor: GOLD,
            borderColor: GOLD_DEEP,
            borderWidth: 1.5,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 5,
            transform: [{ rotate: '6deg' }],
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <Text style={{ color: GOLD_DEEP, fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 1.6 }}>
            {label.toUpperCase()}
          </Text>
          {previous != null ? (
            <Text style={{ color: GOLD_DEEP, fontFamily: FONTS.mono, fontSize: 9, marginTop: 1 }}>
              {tr(language, 'ancien : {0}', 'previous: {0}', [formatScore ? formatScore(previous) : previous])}
            </Text>
          ) : null}
        </View>
      </Reveal>
    </View>
  );
}
