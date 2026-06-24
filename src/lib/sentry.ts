/**
 * Crash & error reporting via Sentry.
 *
 * `initSentry()` is called once at startup (top of App). If
 * `EXPO_PUBLIC_SENTRY_DSN` is unset it does nothing, so local dev without a DSN
 * is unaffected. Re-exports `Sentry` so callers can `Sentry.wrap(App)`,
 * `Sentry.setUser(...)`, or `Sentry.captureException(...)`.
 */
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Sample a fraction of transactions for performance monitoring. Tune later.
    tracesSampleRate: 0.2,
    // Avoid noisy logs in the local dev console; crashes still report.
    enableNativeCrashHandling: true,
  });
}

export { Sentry };
