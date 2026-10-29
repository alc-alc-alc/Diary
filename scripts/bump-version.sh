#!/usr/bin/env bash
# Устанавливает версию приложения в схеме <global>.<semi>.<release>.<debug>.
# Пример: scripts/bump-version.sh 0.3.5.132
# versionCode = global*1e9 + semi*1e6 + release*1e3 + debug (монотонно).
set -euo pipefail
V="${1:?укажи версию, напр. 0.3.5.132}"
IFS=. read -r A B C D <<<"$V"
for n in "$A" "$B" "$C" "$D"; do [[ "$n" =~ ^[0-9]+$ ]] || { echo "плохая версия: $V"; exit 1; }; done
CODE=$(( A*1000000000 + B*1000000 + C*1000 + D ))
# Версия, оканчивающаяся на .111 (первая попытка правки), показывается тремя числами:
# 0.3.9.111 -> 0.3.9. versionCode при этом остаётся полным, чтобы обновления работали.
NAME="$V"
case "$V" in *.111) NAME="${V%.111}" ;; esac
GRADLE="$(dirname "$0")/../app/build.gradle.kts"
sed -i -E "s/versionCode = [0-9]+/versionCode = ${CODE}/; s/versionName = \"[^\"]*\"/versionName = \"${NAME}\"/" "$GRADLE"
echo "версия ${V} → имя ${NAME} (versionCode ${CODE}) записано в $(basename "$GRADLE")"
