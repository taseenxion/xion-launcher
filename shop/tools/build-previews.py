#!/usr/bin/env python3
"""Crop cape front faces from Minecraft UV atlases. Development tool; requires Pillow."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "assets"
out = root / "previews"
out.mkdir(parents=True, exist_ok=True)
count = 0
for cape in json.loads((root / "capes/capes.json").read_text()):
    frames = cape.get("frames", 1)
    for frame in range(frames):
        name = cape["id"] + ("_" + str(frame) if frames > 1 else "") + ".png"
        image = Image.open(root / "capes" / name).convert("RGBA")
        if image.width != image.height * 2:
            raise ValueError("Invalid cape atlas: " + name)
        scale = image.width / 64
        image.crop(tuple(round(v * scale) for v in (1, 1, 11, 17))).save(out / name, optimize=True)
        count += 1
print(f"Built {count} correctly mapped cape-face previews")
