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
function reportToSentry(args: unknown[]): void {
  const realError = args.find((a): a is Error => a instanceof Error);
  const message = args.find((a): a is string => typeof a === 'string');
  const context = args.filter((a) => a !== realError && a !== message);

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
