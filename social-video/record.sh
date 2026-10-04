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

# Nom anglais : c'est le libellé d'accessibilité des lignes du sélecteur.
lang_english() {
  case "$1" in
    fr) echo "French" ;; en) echo "English" ;; es) echo "Spanish" ;;
    pt) echo "Portuguese" ;; de) echo "German" ;; it) echo "Italian" ;;
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
    # Pas de boîte « X ne répond pas » : l'émulateur logiciel de la CI est lent
    # et le lanceur Pixel finissait par en afficher une par-dessus l'app.
    adb shell settings put global hide_error_dialogs 1
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
      -e APP_LANG="$lang" -e APP_LANG_NAME="$(lang_name "$lang")" -e APP_LANG_EN="$(lang_english "$lang")" -e OUTPUT="$out" --test-output-dir "$HERE/out/maestro/$out" \
      "$HERE/maestro/$flow.yaml"; then
      # Maestro range la vidéo dans le dossier de sortie du run (il refuse un
      # chemin hors de ce dossier) : on la rapatrie dans out/raw.
      if [ ! -s "$OUT/$out.mp4" ]; then
        found="$(find "$HERE/out/maestro" "$HERE/maestro" "$HOME/.maestro" "$PWD" -name "$out.mp4" -newer "$HERE/record.sh" 2>/dev/null | head -1)"
        [ -n "$found" ] && mv "$found" "$OUT/$out.mp4"
      fi
      if [ -s "$OUT/$out.mp4" ]; then
        echo "✓ $OUT/$out.mp4 ($(du -h "$OUT/$out.mp4" | cut -f1))"
      else
        echo "✗ $out : flow réussi mais vidéo introuvable" >&2
        find / -name "$out.mp4" 2>/dev/null | head -5 | sed 's/^/    /' >&2
        status=1
      fi
    else
      echo "✗ $out a échoué" >&2
      # Captures et hiérarchie de l'écran au moment de l'échec, pour corriger le
      # flow sans rejouer (le workflow les dépose dans l'artefact).
      # Ce que l'écran affiche à cet instant, lisible directement dans le log :
      # textes et libellés d'accessibilité de la hiérarchie.
      echo "  écran au moment de l'échec :" >&2
      maestro hierarchy 2>/dev/null \
        | jq -r '.. | objects | .attributes? // empty
                 | [.text, .["accessibilityText"], .["resource-id"]]
                 | map(select(. != null and . != "")) | select(length > 0) | join(" · ")' \
        | head -60 | sed 's/^/    /' >&2 || true
      if [ "$PLATFORM" = android ]; then
        echo "  logcat (JS et plantages) :" >&2
        adb logcat -d 2>/dev/null | grep -E "ReactNativeJS|FATAL|AndroidRuntime" | tail -30 | sed 's/^/    /' >&2 || true
      fi
      last="$(ls -td "$HOME"/.maestro/tests/*/ 2>/dev/null | head -1)"
      if [ -n "$last" ]; then
        mkdir -p "$HERE/out/debug"
        cp -r "$last" "$HERE/out/debug/$out"
        echo "  debug → social-video/out/debug/$out" >&2
      fi
      status=1
    fi
  done
done

[ "$PLATFORM" = ios ] && xcrun simctl status_bar booted clear || true
exit $status
