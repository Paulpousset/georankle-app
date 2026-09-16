/**
 * <EndStamp> — le tampon d'encre qui claque sur l'écran : « RÉUSSI · NIV. 42 »,
 * « VICTOIRE », « PROMOTION · OR ». Double liseré, italique serif, légèrement
 * penché, et une entrée en `stamp` (grand → petit) à son heure.
 */
import { Text, View } from 'react-native';

import { FONTS } from '../../theme/typography';
import { Reveal } from './Reveal';

interface EndStampProps {
  text: string;
  color?: string;
  at?: number;
  size?: number;
  /** Inclinaison finale (degrés). */
  tilt?: number;
  onShown?: () => void;
}

export function EndStamp({ text, color = '#c04a1a', at = 0, size = 24, tilt = -6, onShown }: EndStampProps) {
  return (
    <Reveal at={at} kind="stamp" onShown={onShown}>
      <View
        style={{
          borderWidth: 3,
          borderColor: color,
          borderRadius: 8,
          paddingHorizontal: 14,
          paddingVertical: 4,
          transform: [{ rotate: `${tilt}deg` }],
        }}
        accessible
        accessibilityRole="text"
        accessibilityLabel={text}
      >
        <View style={{ borderWidth: 1, borderColor: color, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              color,
              fontFamily: FONTS.headingBlack,
              fontStyle: 'italic',
              fontSize: size,
              letterSpacing: 1,
              textAlign: 'center',
            }}
          >
            {text}
          </Text>
        </View>
      </View>
    </Reveal>
  );
}
