#!/usr/bin/env python3
"""Import the artist's lossless cape sheets without modifying any source artwork. Requires Pillow."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "capes"
SPEC = json.loads((SOURCE / "collection.json").read_text())
DESTINATIONS = [ROOT / p for p in ["src/assets/capes", "website/assets/capes", "shop/assets/capes", "store/assets/capes"]]
records = []

for entry in SPEC["capes"]:
    sheet_path = SOURCE / (entry["source"] + "_spritesheet.png")
    sheet = Image.open(sheet_path).convert("RGB")
    width, height = sheet.width, sheet.width // 2
    if width % 64 or sheet.height % height:
        raise ValueError("Invalid Minecraft atlas sheet: " + str(sheet_path))
    frames = sheet.height // height
    with Image.open(SOURCE / (entry["source"] + "_preview.gif")) as preview:
        if preview.n_frames != frames:
            raise ValueError("PNG/GIF frame counts disagree: " + entry["source"])
        durations = []
        for i in range(frames):
            preview.seek(i)
            durations.append(preview.info.get("duration", 110))
    if len(set(durations)) != 1 or not 16 <= durations[0] <= 1000:
        raise ValueError("Unsupported animation timing: " + entry["source"])
    record = {"id": entry["id"], "name": entry["name"], "cat": SPEC["collection"], "tier": SPEC["tier"],
              "frames": frames, "frameMs": durations[0], "texWidth": width, "texHeight": height,
              "preview": True, "previewWidth": 80, "previewHeight": 128, "description": entry["description"],
              "includedWithPlus": SPEC["includedWithPlus"]}
    records.append(record)
    scale = width // 64
    for frame in range(frames):
        original = sheet.crop((0, frame * height, width, (frame + 1) * height))
        art = original.crop((scale, scale, 11 * scale, 17 * scale))
        atlas = original.copy()
        # Keep the front face byte-for-byte intact. Populate the matching reverse/edge/elytra UVs.
        atlas.paste(art, (11 * scale, scale))
        atlas.paste(art.crop((0, 0, 1, art.height)).resize((scale, art.height)), (0, scale))
        atlas.paste(art.crop((art.width - 1, 0, art.width, art.height)).resize((scale, art.height)), (21 * scale, scale))
        atlas.paste(art.crop((0, 0, art.width, 1)).resize((art.width, scale)), (scale, 0))
        atlas.paste(art.crop((0, art.height - 1, art.width, art.height)).resize((art.width, scale)), (11 * scale, 0))
        wing = art.resize((10 * scale, 20 * scale), Image.Resampling.LANCZOS)
        atlas.paste(wing, (24 * scale, 2 * scale))
        atlas.paste(wing, (36 * scale, 2 * scale))
        name = entry["id"] + "_" + str(frame) + ".png"
        for destination in DESTINATIONS:
            destination.mkdir(parents=True, exist_ok=True)
            atlas.save(destination / name, optimize=True)
        # Small UI textures prevent the cape grid from loading every HD frame into GPU memory.
        art.resize((80, 128), Image.Resampling.LANCZOS).save(DESTINATIONS[0] / f"{entry['id']}_preview_{frame}.png", optimize=True)
        (ROOT / "shop/assets/previews").mkdir(parents=True, exist_ok=True)
        art.save(ROOT / "shop/assets/previews" / name, optimize=True)
    print(f"{entry['name']}: {frames} frames, {width}x{height}, {durations[0]} ms/frame")
    record["sourceHash"] = hashlib.sha256(sheet_path.read_bytes()).hexdigest()

canonical = {c["id"]: c for c in json.loads((DESTINATIONS[0] / "capes.json").read_text())}
for record in records:
    canonical[record["id"]] = record
for destination in DESTINATIONS:
    file = destination / "capes.json"
    existing = json.loads(file.read_text()) if file.exists() else []
    by_id = dict(canonical)
    for c in existing:
        if c["id"] not in by_id:
            by_id[c["id"]] = c
    file.write_text(json.dumps(list(by_id.values()), indent=2, ensure_ascii=False) + "\n")
    (destination / "hd-collection.json").write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n")
    if destination != DESTINATIONS[0]:
        for c in canonical.values():
            for frame in range(c["frames"]):
                name = c["id"] + ("_" + str(frame) if c["frames"] > 1 else "") + ".png"
                (destination / name).write_bytes((DESTINATIONS[0] / name).read_bytes())
print(f"Imported {len(records)} capes / {sum(c['frames'] for c in records)} lossless HD frames")
