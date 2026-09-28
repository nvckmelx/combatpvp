#!/usr/bin/env python3
"""
Арт главной HUJARILOVO: art-source/brand/*.png  →  client/public/brand/*.webp

- logo-gold.png      → logo-gold.webp: прозрачный логотип, обрезка пустых полей (+3 % воздуха),
                        ширина не больше 1600 px, альфа сохраняется.
- home-portrait.png  → home-portrait.webp: фон для телефона, 1080×1920 (кадрирование по центру).
- home-landscape.png → home-landscape.webp: фон для компьютера, 1920×1080.

Пока какого-то файла нет, главная показывает временную замену (старый логотип и арт, тонированные в золото).
Запуск: python3 tools/build_brand.py [папка-исходников]   (нужен Pillow)
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'art-source' / 'brand'
OUT = ROOT / 'client' / 'public' / 'brand'

LOGO_MAX_W = 1600
ALPHA_CUT = 16  # альфа ниже — ореол генератора, в габарит логотипа не считаем
BACKGROUNDS = {'home-portrait': (1080, 1920), 'home-landscape': (1920, 1080)}


def build_logo() -> str:
    src = SRC / 'logo-gold.png'
    if not src.exists():
        return f'  нет файла: {src.name} — остаётся временный логотип'
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
    img.save(out, 'WEBP', quality=90, alpha_quality=95, method=6)
    return f'  {out.relative_to(ROOT)}  {img.width}×{img.height}  {out.stat().st_size // 1024} КБ'


def build_background(name: str, size: tuple[int, int]) -> str:
    src = SRC / f'{name}.png'
    if not src.exists():
        return f'  нет файла: {src.name} — остаётся временный фон'
    img = Image.open(src).convert('RGB')
    note = ''
    if img.width < size[0] or img.height < size[1]:
        note = f' (исходник {img.width}×{img.height} меньше нужного — будет растянут)'
    img = ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.5))
    out = OUT / f'{name}.webp'
    img.save(out, 'WEBP', quality=80, method=6)
    return f'  {out.relative_to(ROOT)}  {size[0]}×{size[1]}  {out.stat().st_size // 1024} КБ{note}'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [build_logo()] + [build_background(n, s) for n, s in BACKGROUNDS.items()]
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
