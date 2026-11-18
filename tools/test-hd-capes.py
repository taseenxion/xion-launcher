#!/usr/bin/env python3
"""Verify lossless author artwork, frame counts, timings and every shipped copy."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / "capes/collection.json").read_text())
records = json.loads((ROOT / "src/assets/capes/hd-collection.json").read_text())
assert len(records) == 19 and sum(c["frames"] for c in records) == 536
for c in records:
    spec = next(s for s in source["capes"] if s["id"] == c["id"])
    file = ROOT / "capes" / (spec["source"] + "_spritesheet.png")
    assert hashlib.sha256(file.read_bytes()).hexdigest() == c["sourceHash"]
    sheet = Image.open(file).convert("RGB")
    assert c["texWidth"] == 1024 and c["texHeight"] == 512
    with Image.open(ROOT / "capes" / (spec["source"] + "_preview.gif")) as gif:
        assert gif.n_frames == c["frames"]
        for i in range(gif.n_frames):
            gif.seek(i)
            assert gif.info["duration"] == c["frameMs"]
    for frame in range(c["frames"]):
        name = f"{c['id']}_{frame}.png"
        path = ROOT / "src/assets/capes" / name
        texture = Image.open(path).convert("RGB")
        assert texture.size == (1024, 512)
        front = sheet.crop((16, frame * 512 + 16, 176, frame * 512 + 272))
        assert texture.crop((16, 16, 176, 272)).tobytes() == front.tobytes()
        assert texture.crop((176, 16, 336, 272)).tobytes() == front.tobytes()
        assert Image.open(ROOT / "src/assets/capes" / f"{c['id']}_preview_{frame}.png").size == (80, 128)
        assert Image.open(ROOT / "shop/assets/previews" / name).size == (160, 256)
        for site in ["website", "shop", "store"]:
            assert (ROOT / site / "assets/capes" / name).read_bytes() == path.read_bytes()
for site in ["src", "website", "shop", "store"]:
    catalog = json.loads((ROOT / site / "assets/capes/capes.json").read_text())
    assert len(catalog) == 155 and len({c["id"] for c in catalog}) == 155
print("PASS: 19 HD capes, 536 lossless frames, original timings, matching cape UVs and all distributed assets")
