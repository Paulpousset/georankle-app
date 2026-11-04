#!/usr/bin/env bash
# Déploie les Edge Functions Supabase touchées par un push.
#
#   SUPABASE_ACCESS_TOKEN=... bash scripts/deploy_functions.sh <base-sha> <head-sha>
#   SUPABASE_ACCESS_TOKEN=... bash scripts/deploy_functions.sh --all
#
# Une fonction est redéployée si son dossier a changé, ou si un fichier de
# _shared/ qu'elle importe a changé. Lancé par migrate.yml APRÈS les
# migrations : une fonction peut appeler une RPC que la migration vient de créer.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="exwfggaytrywnfzcqpel"

# Ces fonctions font leur propre authentification (secret partagé) : elles
# DOIVENT être déployées sans vérification du JWT Supabase, sinon pg_cron et
# RevenueCat se font refuser. Les autres gardent le JWT.
NO_VERIFY_JWT="run-campaigns revenuecat-webhook"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN manquant : aucune fonction déployée." >&2
  # Pas une erreur : le secret n'est simplement pas encore posé.
  exit 0
fi

if [ "${1:-}" = "--all" ]; then
  changed=$(find supabase/functions -type f)
else
  base="${1:?base sha}"; head="${2:?head sha}"
  # Premier push d'une branche : pas de base exploitable → tout.
  if [ "$base" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$base" 2>/dev/null; then
    changed=$(find supabase/functions -type f)
  else
    changed=$(git diff --name-only "$base" "$head" -- supabase/functions)
  fi
fi

targets=()
for dir in supabase/functions/*/; do
  name=$(basename "$dir")
  [ "$name" = "_shared" ] && continue
  [ -f "$dir/index.ts" ] || continue
  hit=0
  grep -q "^supabase/functions/$name/" <<<"$changed" && hit=1
  if [ $hit = 0 ]; then
    for shared in $(grep -ho "_shared/[A-Za-z0-9_.-]*" "$dir"*.ts 2>/dev/null | sort -u); do
      grep -qx "supabase/functions/$shared" <<<"$changed" && hit=1
    done
  fi
  [ $hit = 1 ] && targets+=("$name")
done

if [ ${#targets[@]} -eq 0 ]; then
  echo "Aucune fonction à déployer."
  exit 0
fi

for name in "${targets[@]}"; do
  flags=()
  grep -qw "$name" <<<"$NO_VERIFY_JWT" && flags+=(--no-verify-jwt)
  echo "▶ $name ${flags[*]:-}"
  supabase functions deploy "$name" --project-ref "$PROJECT_REF" "${flags[@]}"
done
