#!/usr/bin/env python3
"""
Арт главной HUJARILOVO: art-source/brand/*.png  →  client/public/brand/*.webp

- logo-gold.png      → logo-gold.webp: прозрачный логотип, обрезка пустых полей (+3 % воздуха),
                        ширина не больше 1360 px, альфа сохраняется.
- hero-cinematic-mobile.png  → hero-mobile.webp: кинофон для телефона (не больше 1920 px по высоте).
- hero-cinematic-desktop.png → hero-desktop.webp: кинофон для компьютера (не больше 1920 px по ширине).

Фоны только сжимаются и никогда не растягиваются; кадрирует их CSS (background-size: cover).
Запуск: python3 tools/build_brand.py [папка-исходников]   (нужен Pillow)
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'art-source' / 'brand'
OUT = ROOT / 'client' / 'public' / 'brand'

LOGO_MAX_W = 1360  # на экране логотип не шире 680 px — хватает и для двойной плотности
ALPHA_CUT = 16  # альфа ниже — ореол генератора, в габарит логотипа не считаем
# исходник → (результат, наибольшая ширина, наибольшая высота)
BACKGROUNDS = {
    'hero-cinematic-mobile': ('hero-mobile', 1080, 1920),
    'hero-cinematic-desktop': ('hero-desktop', 1920, 1080),
}


def build_logo() -> str:
    src = SRC / 'logo-gold.png'
    if not src.exists():
        return f'  нет файла: {src.name}'
    img = Image.open(src)
    if 'A' not in img.getbands():
        return f'  {src.name}: нет альфа-канала — нужен PNG с прозрачным фоном'
    img = img.convert('RGBA')
    bbox = img.getchannel('A').point(lambda v: 255 if v >= ALPHA_CUT else 0).getbbox()
    if not bbox:
        return f'  {src.name}: картинка пустая'
    x0, y0, x1, y1 = bbox
    pad = round(max(x1 - x0, y1 - y0) * 0.03)
    img = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))
    if img.width > LOGO_MAX_W:
        img = img.resize((LOGO_MAX_W, round(img.height * LOGO_MAX_W / img.width)), Image.LANCZOS)
    out = OUT / 'logo-gold.webp'
    img.save(out, 'WEBP', quality=84, alpha_quality=90, method=6)
    return f'  {out.relative_to(ROOT)}  {img.width}×{img.height}  {out.stat().st_size // 1024} КБ'


def build_background(src_name: str, out_name: str, max_w: int, max_h: int) -> str:
    src = SRC / f'{src_name}.png'
    if not src.exists():
        return f'  нет файла: {src.name}'
    img = Image.open(src).convert('RGB')
    scale = min(1.0, max_w / img.width, max_h / img.height)
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    out = OUT / f'{out_name}.webp'
    img.save(out, 'WEBP', quality=82, method=6)
    return f'  {out.relative_to(ROOT)}  {img.width}×{img.height}  {out.stat().st_size // 1024} КБ'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [build_logo()] + [build_background(src, *dst) for src, dst in BACKGROUNDS.items()]
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
