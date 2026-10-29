#!/usr/bin/env bash
# Публикует release-APK:
#   1. zipalign + подпись ключом из .keys/
#   2. alc1.ru/dl/AmoreDiary-<версия>.apk  (+ дубль diary.apk для старых ссылок)
#   3. dl/versions.json — манифест: сканирует каталог, сортирует по версии, отмечает latest
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DL="$ROOT/alc1.ru/dl"; KEYS="$ROOT/.keys"
BT="$HOME/Android/Sdk/build-tools/36.0.0"; export JAVA_HOME=/home/alc/android-studio/jbr
VER=$(grep -m1 'versionName' "$ROOT/Diary/app/build.gradle.kts" | sed -E 's/.*"([^"]+)".*/\1/')
# Уровень важности выбирается по СМЫСЛУ правки:
#   --interface   — интерфейс: вёрстка, стили, тексты, кнопки (по умолчанию для таких правок)
#   --recommended — новая функция
#   --critical    — сломались API/структура (блок групп, схема данных) — без обновления не работает
# Путь к APK можно передать отдельным аргументом.
LEVEL="recommended"
SRC=""
for arg in "$@"; do
  case "$arg" in
    --critical) LEVEL="critical" ;;
    --interface|--front) LEVEL="interface" ;;
    --recommended) LEVEL="recommended" ;;
    -*) echo "неизвестный флаг: $arg (--critical | --recommended)"; exit 1 ;;
    *) SRC="$arg" ;;
  esac
done
SRC="${SRC:-$ROOT/Diary/app/build/outputs/apk/release/app-release-unsigned.apk}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$SRC" ] || { echo "нет APK: $SRC"; exit 1; }
"$BT/zipalign" -p -f 4 "$SRC" "$TMP/aligned.apk"
"$BT/apksigner" sign --ks "$KEYS/diary.jks" --ks-key-alias key0 \
  --ks-pass "file:$KEYS/diary.pass" --out "$TMP/AmoreDiary-$VER.apk" "$TMP/aligned.apk" 2>&1 | grep -v WARNING || true
"$BT/apksigner" verify --print-certs "$TMP/AmoreDiary-$VER.apk" 2>&1 | grep "SHA-256" || true

mkdir -p "$DL"
cp "$TMP/AmoreDiary-$VER.apk" "$DL/"
cp "$TMP/AmoreDiary-$VER.apk" "$DL/diary.apk"

APK_LEVEL="$LEVEL" APK_VER="$VER" python3 - "$DL" "${DL%/dl}/homework" "$LEVEL" <<'PY'
import hashlib, json, os, re, sys
dl, homework, level = sys.argv[1], sys.argv[2], sys.argv[3]
rx = re.compile(r'^AmoreDiary-(\d+(?:\.\d+)*)\.apk$')
levels_path = os.path.join(dl, 'levels.json')
levels = {}
if os.path.exists(levels_path):
    try:
        levels = json.load(open(levels_path, encoding='utf-8'))
    except Exception:
        levels = {}
# запоминаем уровень ЭТОГО релиза; уровни прошлых версий не перезаписываем
levels[os.environ.get('APK_VER', '')] = level
files = []
for name in os.listdir(dl):
    m = rx.match(name)
    if not m: continue
    ver = m.group(1)
    path = os.path.join(dl, name)
    st = os.stat(path)
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    files.append({
        "version": ver,
        "key": tuple(int(x) for x in ver.split('.')) + (0,) * (4 - len(ver.split('.'))),
        "file": name,
        "size": st.st_size,
        "sha256": h.hexdigest(),
        "level": levels.get(ver, 'recommended'),
        "date": __import__('datetime').date.fromtimestamp(st.st_mtime).isoformat(),
    })
files.sort(key=lambda f: f["key"], reverse=True)
for f in files: f.pop("key")
data = {"latest": files[0]["version"] if files else None,
        "latest_level": level, "files": files}
body = json.dumps(data, ensure_ascii=False, indent=2)
with open(os.path.join(dl, 'versions.json'), 'w', encoding='utf-8') as fh:
    fh.write(body)
# копия на h.alc1.ru (страница download.html читает манифест со своего origin)
with open(os.path.join(homework, 'versions.json'), 'w', encoding='utf-8') as fh:
    fh.write(body)
print("versions.json:", data["latest"], "| файлов:", len(files))
PY
ls -la "$DL" | tail -6
