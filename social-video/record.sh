#!/usr/bin/env bash
# Tourne les vidéos brutes de l'app NATIVE (pas du web) : un simulateur iOS ou
# un émulateur Android, le build EAS `recording`, les flows Maestro.
#
#   ./social-video/record.sh ios                 # tous les flows, en fr + en
#   ./social-video/record.sh android higher-lower
#   LANGS="fr en es" ./social-video/record.sh ios flags
#
# Prérequis : maestro (curl -fsSL https://get.maestro.mobile.dev | bash), le
# build `recording` installé (voir README), un simulateur démarré ou un
# émulateur branché. Sortie : social-video/out/raw/<flow>-<lang>.mp4
set -euo pipefail

PLATFORM="${1:?usage: record.sh ios|android [flow...]}"
shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out/raw"
mkdir -p "$OUT"
LANGS="${LANGS:-fr en}"
FLOWS=("$@")
if [ ${#FLOWS[@]} -eq 0 ]; then
  FLOWS=()
  for f in "$HERE"/maestro/*.yaml; do
    name="$(basename "$f" .yaml)"
    [ "$name" = config ] || FLOWS+=("$name")
  done
fi

lang_name() {
  case "$1" in
    fr) echo "Français" ;; en) echo "English" ;; es) echo "Español" ;;
    pt) echo "Português" ;; de) echo "Deutsch" ;; it) echo "Italiano" ;;
    *) echo "unknown lang $1" >&2; exit 1 ;;
  esac
}

# Barre d'état propre et identique sur toutes les vidéos : 9:41, batterie
# pleine, réseau plein, pas de notifications.
case "$PLATFORM" in
  ios)
    xcrun simctl status_bar booted override --time "9:41" --dataNetwork wifi \
      --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
      --batteryState charged --batteryLevel 100
    ;;
  android)
    adb shell settings put global sysui_demo_allowed 1
    adb shell am broadcast -a com.android.systemui.demo -e command enter
    adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
    adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
    adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
    adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
    ;;
  *) echo "plateforme inconnue : $PLATFORM" >&2; exit 1 ;;
esac

# startRecording écrit le .mp4 dans le dossier courant de maestro.
cd "$OUT"
status=0
for flow in "${FLOWS[@]}"; do
  for lang in $LANGS; do
    out="$flow-$lang"
    echo "▶ $out ($PLATFORM)"
    if maestro test \
      -e APP_LANG="$lang" -e APP_LANG_NAME="$(lang_name "$lang")" -e OUTPUT="$out" \
      "$HERE/maestro/$flow.yaml"; then
      echo "✓ $OUT/$out.mp4"
    else
      echo "✗ $out a échoué (voir ~/.maestro/tests)" >&2
      status=1
    fi
  done
done

[ "$PLATFORM" = ios ] && xcrun simctl status_bar booted clear || true
exit $status
