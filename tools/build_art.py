#!/usr/bin/env python3
"""
Сборка арта HUJARILOVO: art-source/*.png  →  client/public/art/*.webp

- Бойцы: общий масштаб на бойца и ракурс (по стойке idle), ступни на одной линии,
  срез слабого ореола по альфе, холст 640×960 (как .actor в CSS, 2:3).
  Позы, которые при общем масштабе не влезают в холст, уменьшаются, но никогда не растягиваются.
- Остальное: уменьшение до игровых размеров и сжатие в WebP с сохранением альфы.

Запуск: python3 tools/build_art.py [папка-исходников]   (нужен Pillow: pip install pillow)
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'art-source'
OUT = ROOT / 'client' / 'public' / 'art'

FIGHTERS = ['borodach', 'lysy']
FRONT = ['idle', 'slip', 'hook', 'straight', 'hit_side', 'hit_center', 'ko', 'victory', 'taunt']
BACK = ['idle', 'slip', 'hook', 'straight', 'hit', 'ko']

CANVAS = (640, 960)
FIGURE_H = 0.94  # доля высоты холста, которую занимает стойка idle
BOTTOM_PAD = 8  # отступ ступней от нижнего края, px
ALPHA_CUT = 32  # альфа ниже — это ореол генератора, срезаем
SOLID = 128  # альфа выше — «тело» фигуры для замеров

# Прочие файлы: путь → (ширина, высота) результата; None — сохранить пропорции по ширине.
OTHER = {
    'portraits/borodach.png': (512, 512),
    'portraits/lysy.png': (512, 512),
    'arena/pit_portrait.png': (1024, 1536),
    'arena/pit_landscape.png': (1536, 1024),
    'arena/crack_1.png': (512, 512),
    'arena/crack_2.png': (512, 512),
    'arena/crack_3.png': (512, 512),
    'arena/crowd.png': (1536, 512),
    'vfx/impact.png': (512, 512),
    'vfx/sweat.png': (512, 512),
    'vfx/dust.png': (512, 512),
    'vfx/whoosh.png': (768, None),
    'vfx/crush_splash.png': (1280, None),
    'ui/vs_bg.png': (1280, None),
}


def solid_bbox(img: Image.Image):
    return img.getchannel('A').point(lambda v: 255 if v > SOLID else 0).getbbox()


def cut_halo(img: Image.Image) -> Image.Image:
    r, g, b, a = img.split()
    return Image.merge('RGBA', (r, g, b, a.point(lambda v: 0 if v < ALPHA_CUT else v)))


def save_webp(img: Image.Image, path: Path, quality=82) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=quality, alpha_quality=90, method=6)


def build_fighter(fid: str, view: str, poses: list[str]) -> list[str]:
    report = []
    ref_path = SRC / 'fighters' / fid / f'{view}_idle.png'
    ref = Image.open(ref_path).convert('RGBA')
    x0, y0, x1, y1 = solid_bbox(ref)
    cw, ch = CANVAS
    base_scale = FIGURE_H * ch / (y1 - y0)
    for pose in poses:
        src = SRC / 'fighters' / fid / f'{view}_{pose}.png'
        if not src.exists():
            report.append(f'  нет файла: {src.relative_to(SRC)}')
            continue
        img = cut_halo(Image.open(src).convert('RGBA'))
        bx0, by0, bx1, by1 = solid_bbox(img)
        fig_h = by1 - by0
        # Не растягиваем и не режем: большая поза уменьшается, чтобы влезть в холст.
        scale = min(base_scale, (ch - BOTTOM_PAD - 2) / fig_h)
        w, h = img.size
        scaled = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        canvas = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
        # По горизонтали — как у генератора (центр холста к центру), по вертикали — ступни на линию.
        dx = round(cw / 2 - (w / 2) * scale)
        dy = round((ch - BOTTOM_PAD) - by1 * scale)
        canvas.paste(scaled, (dx, dy), scaled)
        out = OUT / 'fighters' / fid / f'{view}_{pose}.webp'
        save_webp(canvas, out)
        note = '' if scale == base_scale else f' (уменьшено до {scale / base_scale:.0%}, чтобы влезть)'
        report.append(f'  {out.relative_to(OUT)}  {out.stat().st_size // 1024} КБ{note}')
    return report


def build_other(rel: str, size) -> str:
    src = SRC / rel
    if not src.exists():
        return f'  нет файла: {rel}'
    img = Image.open(src)
    img = img.convert('RGBA') if 'A' in img.getbands() else img.convert('RGB')
    if img.mode == 'RGBA':
        img = cut_halo(img) if rel.startswith('fighters') else img
    w, h = size
    if h is None:
        h = round(img.height * w / img.width)
    if (w, h) != img.size:
        img = img.resize((w, h), Image.LANCZOS)
    out = OUT / Path(rel).with_suffix('.webp')
    save_webp(img, out, quality=80)
    return f'  {out.relative_to(OUT)}  {w}×{h}  {out.stat().st_size // 1024} КБ'


def main() -> None:
    if not SRC.exists():
        sys.exit(f'Нет папки исходников: {SRC}')
    lines = []
    for fid in FIGHTERS:
        lines += build_fighter(fid, 'front', FRONT)
        lines += build_fighter(fid, 'back', BACK)
    for rel, size in OTHER.items():
        lines.append(build_other(rel, size))
    print('\n'.join(lines))
    total = sum(p.stat().st_size for p in OUT.rglob('*.webp'))
    print(f'Готово: {len(list(OUT.rglob("*.webp")))} файлов, {total / 1024 / 1024:.1f} МБ → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
