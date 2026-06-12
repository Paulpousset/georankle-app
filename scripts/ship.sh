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
BLUE='\033[1;34m'; GREEN='\033[1;32m'; NC='\033[0m'
step() { echo -e "${BLUE}▶ $1${NC}"; }

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
