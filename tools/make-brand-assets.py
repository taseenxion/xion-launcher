#!/usr/bin/env python3
"""Build the Xion brand mark, app icons and animated in-game name badges.

The launcher/app icons use the supplied brush-X artwork (tools/brand/x-logo.png).
Name tags use a simplified 16x16 brush-X so it stays legible at font size.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'tools/brand/x-logo.png'
CELL, SS = 16, 24
R = CELL * SS
FRAMES = 16


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def stroke(draw, pts, widths, color):
    n = len(pts)
    left, right = [], []
    for i, (p, w) in enumerate(zip(pts, widths)):
        if i == 0:
            t = sub(pts[1], pts[0])
        elif i == n - 1:
            t = sub(pts[-1], pts[-2])
        else:
            t = sub(pts[i + 1], pts[i - 1])
        ln = math.hypot(*t) or 1
        nx, ny = -t[1] / ln, t[0] / ln
        left.append((p[0] + nx * w / 2, p[1] + ny * w / 2))
        right.append((p[0] - nx * w / 2, p[1] - ny * w / 2))
    draw.polygon([(x * SS, y * SS) for x, y in left + right[::-1]], fill=color)
    for p, w in zip(pts, widths):
        r = w / 2 * SS
        draw.ellipse((p[0] * SS - r, p[1] * SS - r, p[0] * SS + r, p[1] * SS + r), fill=color)


def star(draw, cx, cy, r, color):
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.26
        pts.append(((cx + math.cos(ang) * rr) * SS, (cy + math.sin(ang) * rr) * SS))
    draw.polygon(pts, fill=color)


# A compact brush X: two tapered crossings plus the ribbon curls from the artwork.
STROKES = [
    ([(2.55, 4.35), (5.0, 6.65), (8.1, 9.9), (11.55, 12.15)], [1.45, 2.5, 2.8, 1.5]),
    ([(12.25, 3.85), (9.65, 6.3), (7.3, 8.8), (4.55, 11.65)], [1.35, 2.5, 2.7, 1.4]),
    ([(11.4, 4.45), (12.4, 3.3), (13.2, 3.62), (13.1, 4.75), (11.7, 6.35), (9.7, 7.65)], [1.25, 1.5, 1.5, 1.5, 1.4, 1.0]),
    ([(4.0, 11.95), (2.9, 12.75), (2.0, 12.3), (2.0, 11.3), (3.0, 10.2), (5.0, 9.2)], [1.05, 1.4, 1.4, 1.4, 1.3, 0.9]),
]
STARS = [(4.95, 2.05, 1.4), (9.7, 13.75, 1.35)]


def shapes(draw, grow, color, spark_grow=0.0):
    for pts, ws in STROKES:
        stroke(draw, pts, [w + grow for w in ws], color)
    for x, y, r in STARS:
        star(draw, x, y, r + spark_grow, color)


CORE = Image.new('RGBA', (R, R))
shapes(ImageDraw.Draw(CORE), 1.3, (7, 10, 17, 255), 0.6)
FILL = Image.new('L', (R, R))
shapes(ImageDraw.Draw(FILL), 0.0, 255)


def gradient(c0, c1):
    im = Image.new('RGBA', (R, R))
    px = im.load()
    for y in range(R):
        for x in range(R):
            t = x / (R - 1) * 0.6 + y / (R - 1) * 0.4
            px[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3)) + (255,)
    return im


BODIES = {
    False: Image.composite(gradient((249, 253, 255), (158, 193, 232)), Image.new('RGBA', (R, R)), FILL),
    True: Image.composite(gradient((255, 250, 232), (231, 179, 88)), Image.new('RGBA', (R, R)), FILL),
}


def badge_frame(frame, premium):
    body = BODIES[premium].copy()
    shine = Image.new('RGBA', (R, R))
    sd = ImageDraw.Draw(shine)
    cx = -18 + 21 * (frame / FRAMES)
    w = 1.75
    quad = [(cx - w, -6), (cx + w, -6), (cx + w + 26, 22), (cx - w + 26, 22)]
    sd.polygon([(x * SS, y * SS) for x, y in quad], fill=(255, 255, 255, 100))
    shine = shine.filter(ImageFilter.GaussianBlur(0.12 * SS))
    body.alpha_composite(Image.composite(shine, Image.new('RGBA', (R, R)), FILL))

    out = Image.new('RGBA', (R, R))
    shadow = CORE.filter(ImageFilter.GaussianBlur(0.32 * SS))
    shadow.putalpha(shadow.getchannel('A').point(lambda a: int(a * 0.5)))
    out.alpha_composite(shadow, (int(0.25 * SS), int(0.3 * SS)))
    out.alpha_composite(CORE)
    out.alpha_composite(body)

    # Gentle breathing keeps the tiny badge visibly animated in the tab list.
    pulse = 0.94 + 0.06 * (0.5 + 0.5 * math.sin(frame / FRAMES * math.tau))
    if pulse != 1.0:
        out = ImageEnhance.Brightness(out).enhance(pulse)
    return out.resize((CELL, CELL), Image.Resampling.LANCZOS)


def compact_mark(size=256):
    """A simpler brush X for in-game menu sizes, where the full artwork would blur."""
    out = Image.new('RGBA', (R, R))
    shadow = CORE.filter(ImageFilter.GaussianBlur(0.32 * SS))
    shadow.putalpha(shadow.getchannel('A').point(lambda a: int(a * 0.45)))
    out.alpha_composite(shadow, (int(0.25 * SS), int(0.3 * SS)))
    out.alpha_composite(CORE)
    out.alpha_composite(BODIES[False])
    return out.resize((size, size), Image.Resampling.LANCZOS)


def sheet(frames):
    rows = (len(frames) + 7) // 8
    tex = Image.new('RGBA', (CELL * 8, CELL * rows))
    for i, frame in enumerate(frames):
        tex.alpha_composite(frame, ((i % 8) * CELL, (i // 8) * CELL))
    return tex


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def tile(size, master):
    S = size * 4
    strip = Image.new('RGBA', (1, S))
    px = strip.load()
    for y in range(S):
        t = y / (S - 1)
        px[0, y] = (round(10 + 15 * t), round(15 + 19 * t), round(22 + 26 * t), 255)
    bg = strip.resize((S, S), Image.Resampling.NEAREST)

    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((S * 0.16, S * 0.16, S * 0.84, S * 0.84), fill=(110, 160, 225, 30))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * 0.09)))

    art = master.resize((round(S * 0.78), round(S * 0.78)), Image.Resampling.LANCZOS)
    bg.alpha_composite(art, ((S - art.width) // 2, (S - art.height) // 2))

    border = max(1, S // 256)
    ImageDraw.Draw(bg).rounded_rectangle((border, border, S - border, S - border),
                                         radius=round(S * 0.22), outline=(255, 255, 255, 16), width=border)
    out = Image.new('RGBA', (S, S))
    out.paste(bg, (0, 0), rounded_mask(S, round(S * 0.22)))
    return out.resize((size, size), Image.Resampling.LANCZOS)


def main():
    master = Image.open(MASTER).convert('RGBA')
    if master.size != (1024, 1024):
        raise SystemExit('tools/brand/x-logo.png must be 1024x1024')
    if master.getchannel('A').getextrema()[0] != 0:
        raise SystemExit('brand master must keep a transparent background')

    icon = tile(512, master)
    destinations = [
        ROOT / 'build/icon.png',
        ROOT / 'store/assets/logo.png',
        ROOT / 'shop/assets/logo.png',
        ROOT / 'website/assets/logo.png',
        ROOT / 'xion-client-mod/src/main/resources/assets/xionclient/icon.png',
    ]
    for dest in destinations:
        icon.save(dest, optimize=True)
    compact_mark().save(ROOT / 'xion-client-mod/src/main/resources/assets/xionclient/textures/gui/logo.png', optimize=True)
    icon.save(ROOT / 'build/icon.ico', format='ICO',
              sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # Transparent brush mark for in-app launcher branding.
    master.resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / 'src/renderer/logo.png', optimize=True)

    free = [badge_frame(i, False) for i in range(FRAMES)]
    plus = [badge_frame(i, True) for i in range(FRAMES)]
    font = ROOT / 'xion-client-mod/src/main/resources/assets/xionclient/textures/font'
    outputs = {
        'badge.png': free[0],
        'badge_pro.png': sheet(plus[:8]),
        'badge_free.png': sheet(free),
        'badge_premium.png': sheet(plus),
    }
    for name, image in outputs.items():
        image.save(font / name, optimize=True)
    for directory, names in (
        (ROOT / 'website/assets/badges', outputs.keys()),
        (ROOT / 'shop/assets/badges', ('badge_premium.png',)),
    ):
        directory.mkdir(parents=True, exist_ok=True)
        for name in names:
            outputs[name].save(directory / name, optimize=True)

    print('Generated brush-X icons, launcher mark and 16-frame free/Xion+ name badges')


if __name__ == '__main__':
    main()
