/**
 * La grille de résultat d'une partie, dessinée au lieu d'être tapée en emoji.
 *
 * Chaque mode construit une chaîne 🟩 / 🟥 / 🟨 (une case par question) qui
 * sert au PARTAGE façon Wordle (lib/share.ts) — là, les emoji sont le bon
 * format : ils traversent WhatsApp et les SMS. À l'écran, en revanche, une
 * rangée de gros carrés de couleur jurait avec l'atlas ; Paul (17/09/2026) :
 * « les carrés qui indiquent bonne ou mauvaise réponse sont laids ».
 *
 * Ici la même chaîne devient une rangée de pastilles rondes « trait fin »,
 * dans la ligne des AtlasIcons : cercle finement cerclé, fond légèrement
 * teinté, et le signe dedans — ✓ pour une bonne réponse, ✕ pour une mauvaise,
 * un tiret pour une case « presque » (🟨 du Rankle). La chaîne partagée ne
 * change pas : le composant ne fait que la lire.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { a11yImage } from '../lib/a11y';
import { tr } from '../i18n';
import { PALETTE } from '../theme/colors';

type Cell = 'ok' | 'near' | 'miss';

/** Une case emoji → son état. Tout ce qui n'est pas connu compte comme raté. */
function cellOf(ch: string): Cell {
  if (ch === '🟩') return 'ok';
  if (ch === '🟨') return 'near';
  return 'miss';
}

/** Découpe la chaîne en cases (les emoji font deux unités UTF-16). */
export function parseGrid(grid: string): Cell[] {
  return Array.from(grid).filter((ch) => ch.trim()).map(cellOf);
}

interface ResultGridProps {
  /** La chaîne 🟩🟥🟨 d'un mode. Vide → rien n'est rendu. */
  grid: string;
  /** Diamètre d'une pastille. */
  size?: number;
  style?: object;
}

const COLORS: Record<Cell, string> = {
  ok: PALETTE.forestGreen,
  near: PALETTE.sand,
  miss: PALETTE.dangerRed,
};

export function ResultGrid({ grid, size = 26, style }: ResultGridProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const cells = parseGrid(grid);
  if (!cells.length) return null;

  const ok = cells.filter((c) => c === 'ok').length;
  const stroke = Math.max(1.4, size * 0.07);
  // Teinte de fond : assez présente pour lire la couleur, jamais un aplat.
  const fillAlpha = isDarkMode ? 0.28 : 0.16;

  return (
    <View
      style={[styles.row, style]}
      {...a11yImage(
        tr(language, '{0} bonnes réponses sur {1}', '{0} correct out of {1}', [ok, cells.length]),
      )}
    >
      {cells.map((cell, i) => {
        const color = COLORS[cell];
        return (
          <View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              backgroundColor: withAlpha(color, fillAlpha),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
              {cell === 'ok' ? (
                <Path d="M5 12.5l4.5 4.5L19 7" {...line(color, stroke * 1.5)} />
              ) : cell === 'near' ? (
                <Path d="M6 12h12" {...line(color, stroke * 1.5)} />
              ) : (
                <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...line(color, stroke * 1.5)} />
              )}
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

/** Trait fin arrondi, comme les AtlasIcons. */
const line = (color: string, w: number) => ({
  stroke: color,
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const n = parseInt(c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 7,
    maxWidth: 320,
    alignSelf: 'center',
  },
});
