import { Dimensions, Platform } from 'react-native';

/**
 * Phone-layout switch shared by the game screens' compact headers. True on
 * native, and on web at phone width — mobile-browser users (and the store
 * screenshot pipeline) get the compact header instead of the desktop one,
 * which overflows below ~768px. Evaluated once at module load like the
 * per-screen constants it replaces (no live resize handling).
 */
export const isMobileLayout =
  Platform.OS === 'ios' ||
  Platform.OS === 'android' ||
  Dimensions.get('window').width < 768;
