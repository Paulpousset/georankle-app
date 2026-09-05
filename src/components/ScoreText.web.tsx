import { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

/**
 * Web version of {@link ScoreText} (see `ScoreText.tsx` for the native one).
 *
 * `adjustsFontSizeToFit` is a no-op in react-native-web : le texte n'est pas
 * rétréci, il est tronqué par `numberOfLines={1}`. Sur ordinateur les scores
 * en ligne (« 0 / 1000 » dans une colonne étroite) s'affichaient donc
 * « 0 / 10… ». On réimplémente le rétrécissement : on mesure la largeur réelle
 * du texte à sa taille nominale et on descend la police jusqu'à ce qu'elle
 * tienne dans la largeur disponible du parent (plancher : `minimumFontScale`,
 * 50 % par défaut, comme iOS).
 */
const DEFAULT_MIN_SCALE = 0.5;

export function ScoreText({ maxFontSizeMultiplier = 1.3, ...props }: TextProps) {
  const { adjustsFontSizeToFit, minimumFontScale, style, children } = props;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const baseSize = typeof flat?.fontSize === 'number' ? flat.fontSize : undefined;
  const shrinkable = !!adjustsFontSizeToFit && baseSize !== undefined;

  const ref = useRef<Text | null>(null);
  const [size, setSize] = useState<number | undefined>(baseSize);
  // La mise en page ne bouge pas toute seule : on relance la mesure quand le
  // texte change (nouveau score) ou quand le bloc est (re)dimensionné.
  const [layoutTick, setLayoutTick] = useState(0);
  const textKey = String(children);

  useLayoutEffect(() => {
    if (!shrinkable) return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el || !el.style) return;

    // Tout se mesure à la taille nominale. `getBoundingClientRect()` plutôt que
    // clientWidth/scrollWidth : ces deux-là sont arrondis à l'entier, et un
    // demi-pixel de dépassement suffit à déclencher les « … ».
    //  - largeur disponible : avec `numberOfLines={1}` l'élément est en
    //    `nowrap`/`overflow:hidden`, donc la mise en page le ramène déjà à la
    //    place réellement libre (siblings et paddings déduits) ;
    //  - largeur du texte : `width:max-content` le laisse s'étaler.
    const prevSize = el.style.fontSize;
    const prevWidth = el.style.width;
    const prevMaxWidth = el.style.maxWidth;
    el.style.fontSize = `${baseSize}px`;
    const avail = el.getBoundingClientRect().width;
    // `max-width: 100%` fait partie du style de <Text> côté RNW : sans le
    // neutraliser, `max-content` reste bloqué sur la largeur du parent et le
    // texte semble toujours tenir.
    el.style.width = 'max-content';
    el.style.maxWidth = 'none';
    const full = el.getBoundingClientRect().width;
    el.style.fontSize = prevSize;
    el.style.width = prevWidth;
    el.style.maxWidth = prevMaxWidth;
    if (!(avail > 0) || !(full > 0)) return;

    const floor = minimumFontScale ?? DEFAULT_MIN_SCALE;
    // Un demi-pixel de marge : les avances de glyphes ne se remettent pas à
    // l'échelle exactement, et le navigateur tronque au moindre dépassement.
    const scale = Math.max(floor, Math.min(1, (avail - 0.5) / full));
    const next = Math.floor(baseSize! * scale * 100) / 100;
    setSize(prev => (prev === next ? prev : next));
  }, [shrinkable, baseSize, minimumFontScale, textKey, layoutTick]);

  return (
    <Text
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
      onLayout={e => {
        setLayoutTick(t => t + 1);
        props.onLayout?.(e);
      }}
      style={shrinkable && size !== undefined ? [style, { fontSize: size }] : style}
    />
  );
}
