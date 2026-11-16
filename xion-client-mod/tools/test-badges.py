#!/usr/bin/env python3
"""Ensure animated font sprites cannot move player names or collide with other glyphs."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
resources = root / "xion-client-mod/src/main/resources/assets"
font = json.loads((resources / "minecraft/font/default.json").read_text())
seen = set()
for provider in font["providers"]:
    for char in "".join(provider["chars"]):
        assert char not in seen, "Overlapping font glyph"
        seen.add(char)
for name in ["badge_free.png", "badge_premium.png"]:
    image = Image.open(resources / "xionclient/textures/font" / name).convert("RGBA")
    assert image.size == (128, 32)
    frames = [image.crop((i % 8 * 16, i // 8 * 16, i % 8 * 16 + 16, i // 8 * 16 + 16)) for i in range(16)]
    assert len({f.tobytes() for f in frames}) == 16, "Animation has duplicate frames"
    advances = {f.getchannel("A").getbbox()[2] for f in frames}
    assert advances == {16}, "Glyph advance varies between frames"
    assert (root / "website/assets/badges" / name).read_bytes() == (resources / "xionclient/textures/font" / name).read_bytes()
print("PASS: 32 unique free/premium frames, fixed name width, non-overlapping glyphs and matching web assets")
