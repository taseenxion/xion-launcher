#!/usr/bin/env python3
"""Minimal, antialiased X branding. Requires Pillow; no source cape or badge art is changed."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE, AA = 256, 4
canvas = Image.new("RGBA", (SIZE * AA, SIZE * AA))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((8 * AA, 8 * AA, 248 * AA, 248 * AA), radius=48 * AA, fill="#10151e", outline="#293140", width=2 * AA)
mask = Image.new("L", canvas.size)
md = ImageDraw.Draw(mask)
stroke = 22 * AA
for a, b in [((76, 68), (180, 188)), ((180, 68), (76, 188))]:
    points = [(x * AA, y * AA) for x, y in [a, b]]
    md.line(points, fill=255, width=stroke)
    for x, y in points:
        md.ellipse((x - stroke // 2, y - stroke // 2, x + stroke // 2, y + stroke // 2), fill=255)
gradient = Image.new("RGBA", canvas.size)
gd = ImageDraw.Draw(gradient)
for y in range(canvas.height):
    t = y / canvas.height
    color = tuple(round(a + (b - a) * t) for a, b in zip((238, 245, 255), (161, 186, 230)))
    gd.line((0, y, canvas.width, y), fill=(*color, 255))
canvas.alpha_composite(Image.composite(gradient, Image.new("RGBA", canvas.size), mask))
logo = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
for file in ["build/icon.png", "store/assets/logo.png", "shop/assets/logo.png", "website/assets/logo.png",
             "xion-client-mod/src/main/resources/assets/xionclient/icon.png", "xion-client-mod/src/main/resources/assets/xionclient/textures/gui/logo.png"]:
    logo.save(ROOT / file, optimize=True)
logo.save(ROOT / "build/icon.ico", format="ICO", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("Generated the simple X logo for client menus, app icons and matching web branding")
