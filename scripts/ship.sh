#!/usr/bin/env bash
# GeoG — déploiement complet en une commande.
#   npm run ship            -> web (Vercel) + iOS & Android (EAS build + auto-submit)
#   PLATFORM=ios npm run ship   -> web + iOS uniquement
#   PLATFORM=android npm run ship
#   NO_SUBMIT=1 npm run ship    -> build sans envoyer aux stores
#   NO_WEB=1 npm run ship       -> natif seulement
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${PLATFORM:-all}"
BLUE='\033[1;34m'; GREEN='\033[1;32m'; RED='\033[1;31m'; NC='\033[0m'
step() { echo -e "${BLUE}▶ $1${NC}"; }

# Pre-flight: never ship a broken build. A typo that fails typecheck or the test
# suite must stop here, before the long parallel web + native builds kick off.
# Bypass intentionally with SKIP_CHECKS=1 (e.g. shipping a known-broken hotfix).
if [ -z "${SKIP_CHECKS:-}" ]; then
  step "Pré-vol → typecheck + tests"
  if ! npm run typecheck; then
    echo -e "${RED}❌ typecheck a échoué — déploiement annulé.${NC}"; exit 1
  fi
  if ! npm test -- --ci; then
    echo -e "${RED}❌ tests ont échoué — déploiement annulé.${NC}"; exit 1
  fi
  # Pack cosmétique 3D : ids du catalogue ↔ fichiers rendus (no-op tant que le
  # pack n'est pas rendu ; bloquant dès qu'il existe et diverge).
  if [ -d asset-pipeline/node_modules ]; then
    if ! (cd asset-pipeline && npm run check); then
      echo -e "${RED}❌ pack cosmétique incohérent (asset-pipeline/check_assets) — déploiement annulé.${NC}"; exit 1
    fi
  fi
  # Extraits parlés du mode Langues : chaque phrase des langues `audio: true`
  # doit être en ligne. Ignoré tant que la variante audio est éteinte (le flag
  # languages_audio reste le garde-fou d'activation).
  if [ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${CHECK_LANG_AUDIO:-}" ]; then
    if ! node scripts/check_language_audio.mjs; then
      echo -e "${RED}❌ extraits audio « Langues » manquants — déploiement annulé.${NC}"; exit 1
    fi
  fi
  echo -e "${GREEN}✅ Pré-vol OK${NC}"
else
  echo "⏭️  SKIP_CHECKS=1 — pré-vol ignoré"
fi

WEB_PID=""
if [ -z "${NO_WEB:-}" ]; then
  step "Web → build + déploiement Vercel (prod)"
  # tourne en arrière-plan pendant que le build natif (long) démarre
  # Le sous-shell doit PROPAGER son code de sortie. La version précédente
  # rattrapait l'échec sur place et finissait par `tail`, qui réussit : le
  # sous-shell sortait donc à 0 même quand Vercel avait planté, et le script
  # concluait par « ✅ Terminé » après avoir affiché un « ❌ » noyé dans les
  # logs EAS. C'est ce qui faisait croire que le web était déployé.
  ( npx vercel --prod --yes >/tmp/geog-web-deploy.log 2>&1 ) &
  WEB_PID=$!
fi

SUBMIT_FLAG="--auto-submit"
[ -n "${NO_SUBMIT:-}" ] && SUBMIT_FLAG=""

step "Natif → EAS build ($PLATFORM) en cloud + ${SUBMIT_FLAG:-sans envoi store}"
echo "   (iOS & Android buildent en parallèle ; numéros de build auto-incrémentés)"
npx eas build --platform "$PLATFORM" --profile production $SUBMIT_FLAG

# attendre la fin du déploiement web et TENIR COMPTE de son résultat
WEB_OK=1
if [ -n "$WEB_PID" ]; then
  if wait "$WEB_PID"; then
    echo -e "${GREEN}✅ Web en ligne : https://playgeog.com${NC}"
  else
    WEB_OK=0
    echo -e "${RED}❌ Échec du déploiement web — voir /tmp/geog-web-deploy.log${NC}"
    tail -15 /tmp/geog-web-deploy.log
  fi
fi

if [ "$WEB_OK" -eq 0 ]; then
  echo -e "${RED}❌ Livraison INCOMPLÈTE : le natif est parti, le web n'est PAS déployé.${NC}"
  echo "   Relancer seul : npx vercel --prod --yes"
  exit 1
fi

echo -e "${GREEN}✅ Terminé. Suivi des builds : https://expo.dev/accounts/polololo/projects/geog/builds${NC}"
