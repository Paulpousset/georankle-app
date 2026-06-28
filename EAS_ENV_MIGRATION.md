# D2 — Migrate public env vars out of `eas.json` into EAS Environment Variables

**Status:** runbook (manual steps — requires `eas login` on Paul's Expo account).

## Context / threat model
The 5 vars in `eas.json` are all `EXPO_PUBLIC_*` → **client-exposed by design** and end up
in the shipped JS bundle regardless. Audit confirmed:

- ✅ No `service_role` key in `src/`, `dist/`, or any `.env*` file — it only lives in Edge Functions.
- ✅ The anon key in the bundle is expected; RLS is the real security boundary.

So this is **not a secret leak**. The only issues are *hygiene*: the keys are committed to VCS and
can't be rotated without a code change. Migrating to EAS env vars decouples them from git and makes
rotation a dashboard/CLI operation.

## Step 1 — Create the vars on EAS (preview + production share identical values)
Run from `georankle-app/`. `--visibility plaintext` is correct: these are public keys, so there's
no value in hiding them, and it keeps them readable in the EAS dashboard.

```bash
eas login   # if not already

for ENV in preview production; do
  eas env:create --environment $ENV --name EXPO_PUBLIC_SUPABASE_URL \
    --value "https://exwfggaytrywnfzcqpel.supabase.co" --type string --visibility plaintext --force
  eas env:create --environment $ENV --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
    --value "<anon key from eas.json>" --type string --visibility plaintext --force
  eas env:create --environment $ENV --name EXPO_PUBLIC_POSTHOG_KEY \
    --value "<posthog key from eas.json>" --type string --visibility plaintext --force
  eas env:create --environment $ENV --name EXPO_PUBLIC_POSTHOG_HOST \
    --value "https://eu.i.posthog.com" --type string --visibility plaintext --force
  eas env:create --environment $ENV --name EXPO_PUBLIC_SENTRY_DSN \
    --value "<sentry dsn from eas.json>" --type string --visibility plaintext --force
done

eas env:list --environment production   # verify all 5 present
```

## Step 2 — Point the build profiles at the environment, drop the inline `env`
Only after Step 1 verifies. Replace each profile's `"env": { ... }` block with `"environment"`:

```jsonc
"preview": {
  "distribution": "internal",
  "autoIncrement": true,
  "environment": "preview",          // <-- replaces the whole "env": { 5 keys } block
  "ios": { "simulator": false },
  "android": { "buildType": "apk" }
},
"production": {
  "autoIncrement": true,
  "environment": "production"        // <-- replaces the whole "env": { 5 keys } block
}
```

## Step 3 — Verify before committing
```bash
eas build --profile preview --platform ios --dry-run   # confirms env resolves from EAS, not eas.json
```
⚠️ **Do NOT remove the inline `env` until Step 1 is confirmed** — a build with neither inline env
nor EAS env vars boots to a white screen (the known TestFlight failure mode).

`.env.example` stays as developer documentation. Local dev keeps using `.env` (gitignored).
