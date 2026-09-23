#!/usr/bin/env bash
# Applique les migrations de supabase/migrations/ pas encore enregistrées dans
# public.ci_migrations. Idempotent : relançable sans risque.
#
#   SUPABASE_DB_URL=postgres://... bash scripts/migrate.sh
#   bash scripts/migrate.sh --dry-run    # liste ce qui serait appliqué
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL manquant : rien n'est appliqué." >&2
  # Pas une erreur : le secret n'est simplement pas encore posé.
  exit 0
fi

command -v psql >/dev/null || { echo "psql introuvable" >&2; exit 1; }

PSQL="psql $SUPABASE_DB_URL -v ON_ERROR_STOP=1 -q -X"

$PSQL -c "CREATE TABLE IF NOT EXISTS public.ci_migrations (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

applied=$($PSQL -At -c "SELECT name FROM public.ci_migrations")

shopt -s nullglob
count=0
for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  if grep -qx "$name" <<<"$applied"; then continue; fi
  if [ "$DRY" = 1 ]; then echo "à appliquer : $name"; continue; fi
  echo "▶ $name"
  # Une transaction par fichier : le fichier passe entier ou pas du tout, et
  # l'enregistrement n'est écrit que s'il est passé.
  { echo "BEGIN;"; cat "$f"; echo; \
    echo "INSERT INTO public.ci_migrations(name) VALUES ('$name');"; \
    echo "COMMIT;"; } | $PSQL
  count=$((count + 1))
done
echo "✅ $count migration(s) appliquée(s)"
