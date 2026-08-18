/**
 * Version native de DesktopStage : sur téléphone et tablette, le jeu occupe
 * l'écran entier et il n'y a rien à mettre en scène. Voir DesktopStage.web.tsx
 * pour la vraie implémentation.
 */
import type { ReactNode } from 'react';

export function DesktopStage({ children }: { children: ReactNode; brand?: string }) {
  return <>{children}</>;
}
