#!/bin/bash
# Publish a built rep / driver APK so the apps offer it as an in-app update.
#   scripts/publish-apk.sh rep|driver ["What changed (shown in the update dialog)"] [--required]
# Copies mobile/apps/<app>/android/app/build/outputs/apk/release/app-release.apk to the uploads
# volume (uploads/.apps/itour-<app>.apk, served at /api/public/apps/<app>.apk) and records its
# versionName / versionCode in uploads/.apps/versions.json (GET /api/public/apps/latest).
# --required: installed versions below this one must update (the dialog cannot be dismissed).
# Publishing is an owner decision — run only on explicit approval.
set -euo pipefail
APP="${1:-}"; NOTES="${2:-}"; REQUIRED="${3:-}"
[[ "$APP" == "rep" || "$APP" == "driver" ]] || { echo "usage: $0 rep|driver [notes] [--required]"; exit 1; }
ROOT=/opt/itour
GRADLE="$ROOT/mobile/apps/$APP/android/app/build.gradle"
APK="$ROOT/mobile/apps/$APP/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "no APK at $APK — build it first"; exit 1; }
NAME=$(grep -oP 'versionName "\K[^"]+' "$GRADLE")
CODE=$(grep -oP 'versionCode \K[0-9]+' "$GRADLE")
NS=itour-production
POD=$(kubectl -n $NS get pod -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl -n $NS cp "$APK" "$POD:/app/uploads/.apps/itour-$APP.apk.tmp"
kubectl -n $NS exec "$POD" -- sh -c "mv /app/uploads/.apps/itour-$APP.apk.tmp /app/uploads/.apps/itour-$APP.apk"
TMP=$(mktemp)
kubectl -n $NS exec "$POD" -- sh -c "cat /app/uploads/.apps/versions.json 2>/dev/null || echo {}" > "$TMP"
python3 - "$TMP" "$APP" "$NAME" "$CODE" "$NOTES" "$REQUIRED" "$(stat -c %s "$APK")" <<'EOF'
import json, sys, datetime
path, app, name, code, notes, required, size = sys.argv[1:8]
try:
    d = json.load(open(path))
except Exception:
    d = {}
prev = d.get(app, {})
entry = {
    "versionName": name,
    "versionCode": int(code),
    "notes": notes,
    "size": int(size),
    "publishedAt": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "minVersionCode": int(code) if required == "--required" else prev.get("minVersionCode", 0),
}
d[app] = entry
json.dump(d, open(path, "w"), indent=2)
EOF
kubectl -n $NS cp "$TMP" "$POD:/app/uploads/.apps/versions.json"
rm -f "$TMP"
echo "published $APP $NAME ($CODE)"
