/**
 * Centralized logging.
 *
 * Goal: keep a useful console in development, but stop leaking noise into the
 * device logs in production. Error paths still reach Sentry — our source of
 * truth for prod failures — while debug/info/warn simply no-op once shipped.
 *
 *   log.debug(...)  dev console only          (pure local debugging)
 *   log.info(...)   dev console only
 *   log.warn(...)   dev console only
 *   log.error(...)  dev console; Sentry in prod
 *
 * Prefer this over `console.*` so the prod/dev split lives in one place.
 */
import { Sentry } from './sentry';

/**
 * Turn an arbitrary `log.error(...)` argument list into something Sentry can
 * group on. Supabase/RPC errors arrive as plain objects (not `Error`s), so we
 * keep the first real `Error` when present, otherwise synthesize one from the
 * leading string message and attach the rest as context.
 */
/**
 * A dropped connection is the player's network, not our bug: Supabase reports
 * it as `{ message: 'TypeError: Network request failed' }`, a 504, or an
 * `AuthRetryableFetchError`. Those filled Sentry with unfixable issues, so they
 * become breadcrumbs — still visible in the trail of a real error.
 */
const TRANSIENT_NETWORK = /network request (failed|timed out)|failed to fetch|gateway time-?out|load failed/i;

export function isTransientNetworkError(args: readonly unknown[]): boolean {
  return args.some((a) => {
    if (!a || typeof a !== 'object') return false;
    const e = a as { name?: unknown; message?: unknown; details?: unknown };
    if (e.name === 'AuthRetryableFetchError') return true;
    return [e.message, e.details].some((text) => typeof text === 'string' && TRANSIENT_NETWORK.test(text));
  });
}

function reportToSentry(args: unknown[]): void {
  const realError = args.find((a): a is Error => a instanceof Error);
  const message = args.find((a): a is string => typeof a === 'string');
  const context = args.filter((a) => a !== realError && a !== message);

  if (isTransientNetworkError(args)) {
    Sentry.addBreadcrumb({ category: 'network', level: 'warning', message: message ?? realError?.message });
    return;
  }

  const extra: Record<string, unknown> = {};
  if (context.length) extra.context = context;
  // With a real Error, the leading string is the call-site label and worth
  // keeping. Without one, that string already becomes the Error message below.
  if (realError && message) extra.label = message;

  Sentry.captureException(realError ?? new Error(message ?? 'Logged error'), { extra });
}

export const log = {
  /** Pure local debugging. Never ships, never reports. */
  debug(...args: unknown[]): void {
    if (__DEV__) console.log(...args);
  },
  info(...args: unknown[]): void {
    if (__DEV__) console.info(...args);
  },
  warn(...args: unknown[]): void {
    if (__DEV__) console.warn(...args);
  },
  /** Error paths: console in dev, Sentry in prod. */
  error(...args: unknown[]): void {
    if (__DEV__) {
      console.error(...args);
      return;
    }
    reportToSentry(args);
  },
};
