/**
 * Version native de UiScaleProvider : sur téléphone et tablette, l'interface
 * est déjà à sa taille — il n'y a rien à agrandir. Voir UiScaleProvider.web.tsx
 * pour la vraie implémentation (et lib/uiScale.ts pour le pourquoi).
 */
import type { ReactNode } from 'react';

export function UiScaleProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
