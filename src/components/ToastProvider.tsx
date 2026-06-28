/**
 * Lightweight, dependency-free toast system.
 *
 * The app had no non-blocking feedback channel — failures were either a modal
 * `Alert` or a silent `console.log`. `useToast()` gives every screen a themed,
 * auto-dismissing toast for the cases where an Alert would be too heavy.
 *
 * Mounted high in the tree (under Theme/Language) so the overlay floats above
 * every screen and modal.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';

import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';

type ToastKind = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 3800;
const MAX_VISIBLE = 3;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, kind }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (m) => show(m, 'error'),
      success: (m) => show(m, 'success'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 8 }]}>
        {toasts.map((t) => (
          <Toast key={t.id} item={t} colors={c} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const KIND_COLOR: Record<ToastKind, string> = {
  error: '#c0392b',
  success: '#2a6e3f',
  info: '#2a6e9d',
};

function Toast({
  item,
  colors,
  onDismiss,
}: {
  item: ToastItem;
  colors: ReturnType<typeof getColors>;
  onDismiss: () => void;
}) {
  // Lazy `useState` (not a ref) keeps a stable Animated.Value across renders
  // without tripping the no-ref-access-during-render lint rule.
  const [anim] = useState(() => new Animated.Value(0));
  const accent = KIND_COLOR[item.kind];
  const Icon = item.kind === 'error' ? AlertTriangle : item.kind === 'success' ? CheckCircle2 : Info;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDismiss);
    }, DEFAULT_DURATION);
    return () => clearTimeout(timer);
    // Animate in once on mount; onDismiss identity is stable per toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: colors.card, borderColor: accent }]}
      >
        <Icon color={accent} size={18} />
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={3}>
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    gap: 8,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 460,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  text: { flex: 1, fontSize: 13, fontFamily: FONTS.mono, lineHeight: 18 },
});
