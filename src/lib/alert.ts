import { Alert, Platform, type AlertButton } from 'react-native';

/** What a `showAlert` call carries to the web dialog host. */
export interface AlertRequest {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

/**
 * Set by <AlertHost/> (mounted once at the app root) — the app's own themed
 * dialog. Null before it mounts, and on native, where the OS Alert is used.
 */
let handler: ((req: AlertRequest) => void) | null = null;

export function setAlertHandler(next: ((req: AlertRequest) => void) | null): void {
  handler = next;
}

/**
 * Drop-in replacement for `Alert.alert` that actually works on web.
 *
 * react-native-web does NOT implement Alert — every `Alert.alert` is a silent
 * no-op there, which shipped as "can't log out / can't quit a daily / can't
 * confirm a pack purchase" on the web build. Native keeps the real Alert; web
 * goes to <AlertHost/>, which draws the dialog in the app's own skin and keeps
 * every button (labels included: the browser dialog could only ever say OK).
 *
 * Fallback, when no host is mounted (tests, an early call at boot): the old
 * window.confirm / window.alert path, so a dialog is never simply swallowed.
 *  - no buttons or a single button → window.alert, then that button's onPress
 *  - two or more buttons → window.confirm; OK triggers the first non-cancel
 *    button, Cancel triggers the `style: 'cancel'` one.
 *    (Three-button alerts lose their middle option there — the host does not.)
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  if (handler) {
    handler({ title, message, buttons });
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  if (window.confirm(text)) confirmBtn?.onPress?.();
  else cancelBtn?.onPress?.();
}
