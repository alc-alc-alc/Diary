#!/usr/bin/env bash
# Пересобирает иконки приложения из логотипа сайта (открытая книга из сплэша).
# Вектор адаптивной иконки лежит в res/drawable/ic_launcher_{foreground,background}.xml,
# этот скрипт обновляет ТОЛЬКО растровые mipmap-* (для API < 26 и старых лончеров).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RES="$ROOT/Diary/app/src/main/res"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"

cat > icon.html <<'HTML'
<html><body style="margin:0;background:transparent">
<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">
<svg viewBox="0 0 64 64" width="1024" height="1024">
  <path d="M32 21c-5-4-12-4-18-2v26c6-2 13-2 18 2 5-4 12-4 18-2V19c-6-2-13-2-18 2z"
        fill="none" stroke="#EEF6EF" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M32 21v26" stroke="#FFD166" stroke-width="2.8" stroke-linecap="round"/>
</svg>
</div></body></html>
HTML

chromium --headless --no-sandbox --disable-gpu --user-data-dir="$TMP/prof" \
  --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$TMP/book.png" "file://$TMP/icon.html" >/dev/null 2>&1

python3 - "$TMP/book.png" "$RES" <<'PY'
import sys
from PIL import Image, ImageDraw
book = Image.open(sys.argv[1]).convert('RGBA'); book = book.crop(book.getbbox())
RES = sys.argv[2]; BW, BH = book.size
TOP, BOT, SS = (23, 89, 75), (10, 46, 39), 4

def make(size, round_icon):
    S = size * SS
    col = Image.new('RGB', (1, S))
    for y in range(S):
        t = y / max(1, S - 1)
        col.putpixel((0, y), tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3)))
    bg = col.resize((S, S))
    mask = Image.new('L', (S, S), 0); d = ImageDraw.Draw(mask)
    if round_icon: d.ellipse((0, 0, S - 1, S - 1), fill=255)
    else: d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
    icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)
    tw = int(S * 0.62); th = int(BH * tw / BW)
    icon.alpha_composite(book.resize((tw, th), Image.LANCZOS), ((S - tw) // 2, (S - th) // 2))
    return icon.resize((size, size), Image.LANCZOS)

for dpi, px in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
    make(px, False).save(f'{RES}/mipmap-{dpi}/ic_launcher.webp', 'WEBP', lossless=True)
    make(px, True).save(f'{RES}/mipmap-{dpi}/ic_launcher_round.webp', 'WEBP', lossless=True)
print('mipmap-* обновлены')
PY
