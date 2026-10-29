#!/usr/bin/env bash
# Публикует обновление ИНТЕРФЕЙСА (html/css/js) без пересборки APK.
#   alc1.ru/dl/site-<версия>.zip   — архив фронта
#   alc1.ru/dl/front.json          — манифест (version/zip/size/sha256)
#   alc1.ru/homework/front.json    — тот же манифест на h.alc1.ru (приложение читает его)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DL="$ROOT/alc1.ru/dl"; SRC="$ROOT/alc1.ru"
VER="${1:?укажи версию, напр. 0.3.9.301}"
case "$VER" in *.111) VER="${VER%.111}" ;; esac   # правило: .111 показываем тремя числами
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/site/css" "$TMP/site/js" "$TMP/site/auth" "$TMP/site/account"
cp "$SRC/homework/homework.html" "$TMP/site/"
cp "$SRC"/homework/css/* "$TMP/site/css/"
cp "$SRC"/homework/js/* "$TMP/site/js/"
cp "$SRC"/auth/* "$TMP/site/auth/"
cp "$SRC"/account/* "$TMP/site/account/"

ZIP="site-$VER.zip"
( cd "$TMP/site" && zip -qr "$TMP/$ZIP" . )
mkdir -p "$DL"
mv "$TMP/$ZIP" "$DL/$ZIP"

python3 - "$DL" "$ZIP" "$VER" <<'PY'
import hashlib, json, os, sys
dl, name, ver = sys.argv[1], sys.argv[2], sys.argv[3]
p = os.path.join(dl, name)
h = hashlib.sha256()
with open(p, 'rb') as fh:
    for chunk in iter(lambda: fh.read(1 << 20), b''):
        h.update(chunk)
data = {"version": ver, "level": "interface", "zip": name,
        "size": os.path.getsize(p), "sha256": h.hexdigest()}
body = json.dumps(data, ensure_ascii=False, indent=2)
open(os.path.join(dl, 'front.json'), 'w', encoding='utf-8').write(body)
open(os.path.join(dl, '..', 'homework', 'front.json'), 'w', encoding='utf-8').write(body)
print('front.json:', ver, '|', data["size"], 'Б')
PY
