import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Drop-in replacement for `Alert.alert` that actually works on web.
 *
 * react-native-web does NOT implement Alert — every `Alert.alert` is a silent
 * no-op there, which shipped as "can't log out / can't quit a daily / can't
 * confirm a pack purchase" on the web build. Native keeps the real Alert;
 * web degrades to window.confirm / window.alert:
 *  - no buttons or a single button → window.alert, then that button's onPress
 *  - two or more buttons → window.confirm; OK triggers the first
 *    non-cancel button, Cancel triggers the `style: 'cancel'` one.
 *    (Three-button alerts lose their middle option on web — acceptable for
 *    the confirm/cancel dialogs this app uses.)
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
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
