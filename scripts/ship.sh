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
  echo -e "${GREEN}✅ Pré-vol OK${NC}"
else
  echo "⏭️  SKIP_CHECKS=1 — pré-vol ignoré"
fi

WEB_PID=""
if [ -z "${NO_WEB:-}" ]; then
  step "Web → build + déploiement Vercel (prod)"
  # tourne en arrière-plan pendant que le build natif (long) démarre
  ( npx vercel --prod --yes >/tmp/geog-web-deploy.log 2>&1 \
      && echo -e "${GREEN}✅ Web en ligne : https://geogames-mu.vercel.app${NC}" \
      || { echo "❌ Échec déploiement web — voir /tmp/geog-web-deploy.log"; tail -5 /tmp/geog-web-deploy.log; } ) &
  WEB_PID=$!
fi

SUBMIT_FLAG="--auto-submit"
[ -n "${NO_SUBMIT:-}" ] && SUBMIT_FLAG=""

step "Natif → EAS build ($PLATFORM) en cloud + ${SUBMIT_FLAG:-sans envoi store}"
echo "   (iOS & Android buildent en parallèle ; numéros de build auto-incrémentés)"
npx eas build --platform "$PLATFORM" --profile production $SUBMIT_FLAG

# attendre la fin du déploiement web
[ -n "$WEB_PID" ] && wait "$WEB_PID" || true

echo -e "${GREEN}✅ Terminé. Suivi des builds : https://expo.dev/accounts/polololo/projects/geog/builds${NC}"
