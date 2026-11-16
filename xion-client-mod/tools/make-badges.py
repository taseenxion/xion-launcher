#!/usr/bin/env python3
"""Build Xion's fixed-width animated name badges (requires Pillow)."""
import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SIZE, FRAMES = 16, 16
SHIELD = [(4, 1), (11, 1), (15, 5), (15, 10), (8, 15), (0, 10), (0, 5), (4, 1)]


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def frame(pro, index):
    image = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(image)
    low, high = ((220, 135, 48), (255, 235, 151)) if pro else ((101, 125, 252), (112, 231, 255))
    phase = index / FRAMES
    breath = 0.5 + 0.5 * math.sin(phase * math.tau)
    draw.polygon(SHIELD, fill=(13, 20, 38, 255))
    draw.line(SHIELD, fill=(*mix(low, high, 0.25 + breath * 0.3), 255), width=1)
    draw.line([(4, 2), (11, 2), (14, 5)], fill=(*high, 150), width=1)
    # Both outlines always occupy x=0..15: animated font glyphs must have identical advances.
    mask = Image.new("L", (SIZE, SIZE))
    md = ImageDraw.Draw(mask)
    if pro:
        draw.polygon([(4, 3), (6, 5), (8, 2), (10, 5), (12, 3), (11, 6), (5, 6)], fill=(*high, 255))
        md.line([(5, 8), (10, 12)], fill=255, width=2)
        md.line([(10, 8), (5, 12)], fill=255, width=2)
    else:
        md.line([(4, 4), (11, 11)], fill=255, width=2)
        md.line([(11, 4), (4, 11)], fill=255, width=2)
    sweep = phase * 26 - 3
    for y in range(SIZE):
        for x in range(SIZE):
            if mask.getpixel((x, y)):
                shine = max(0, 1 - abs(x + y - sweep) / 3)
                color = mix(high, (255, 255, 255), 0.45 + shine * 0.55)
                image.putpixel((x, y), (*color, 255))
    # A moving edge light, not a separate texture upload or particle system.
    edge = [(4, 1), (7, 1), (11, 1), (13, 3), (15, 5), (15, 8), (15, 10), (11, 13),
            (8, 15), (4, 13), (0, 10), (0, 8), (0, 5), (2, 3), (4, 1), (5, 1)]
    draw.point(edge[index], fill=(255, 248, 213, 255) if pro else (211, 255, 255, 255))
    return image


def atlas(images, columns):
    out = Image.new("RGBA", (columns * SIZE, math.ceil(len(images) / columns) * SIZE))
    for i, image in enumerate(images):
        out.paste(image, ((i % columns) * SIZE, (i // columns) * SIZE))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    free = [frame(False, i) for i in range(FRAMES)]
    pro = [frame(True, i) for i in range(FRAMES)]
    files = {"badge.png": free[0], "badge_pro.png": atlas(pro[::2], 8),
             "badge_free.png": atlas(free, 8), "badge_premium.png": atlas(pro, 8)}
    destinations = [ROOT / "xion-client-mod/src/main/resources/assets/xionclient/textures/font", ROOT / "website/assets/badges"]
    for directory in destinations:
        directory.mkdir(parents=True, exist_ok=True)
        for name, image in files.items():
            image.save(directory / name, optimize=True)
    if args.preview:
        preview = Image.new("RGB", (576, 174), (11, 15, 25))
        d = ImageDraw.Draw(preview)
        for y, label, images in [(12, "FREE / BLUE — ANIMATED", free), (94, "XION+ / GOLD — ANIMATED", pro)]:
            d.text((16, y), label.replace("—", "-"), fill=(225, 234, 255))
            for i, image in enumerate(images):
                preview.paste(image.resize((32, 32), Image.Resampling.NEAREST), (16 + i * 34, y + 23), image.resize((32, 32), Image.Resampling.NEAREST))
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        preview.save(args.preview)
    print("Generated 16-frame free/premium badges with fixed glyph widths")


if __name__ == "__main__":
    main()
