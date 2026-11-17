#!/usr/bin/env python3
"""Verify the brush-X brand assets and animated name badges are complete and in sync."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def load(rel):
    path = ROOT / rel
    if not path.exists():
        raise SystemExit('missing ' + rel)
    return Image.open(path).convert('RGBA')


master = load('tools/brand/x-logo.png')
assert master.size == (1024, 1024), master.size
assert master.getchannel('A').getextrema()[0] == 0, 'brand master lost its transparent background'

marks = [
    'build/icon.png',
    'store/assets/logo.png',
    'shop/assets/logo.png',
    'website/assets/logo.png',
    'xion-client-mod/src/main/resources/assets/xionclient/icon.png',
]
reference = load(marks[0])
assert reference.size == (512, 512), reference.size
for rel in marks[1:]:
    if load(rel).tobytes() != reference.tobytes():
        raise SystemExit('stale app icon: ' + rel)

gui = load('xion-client-mod/src/main/resources/assets/xionclient/textures/gui/logo.png')
assert gui.size == (256, 256), gui.size
assert gui.getchannel('A').getextrema()[0] == 0, 'in-game mark must be transparent'
brand = load('src/renderer/logo.png')
assert brand.size == (512, 512), brand.size
assert brand.getchannel('A').getextrema()[0] == 0, 'launcher mark must be transparent'

font = ROOT / 'xion-client-mod/src/main/resources/assets/xionclient/textures/font'
sheet = load('xion-client-mod/src/main/resources/assets/xionclient/textures/font/badge_free.png')
plus = load('xion-client-mod/src/main/resources/assets/xionclient/textures/font/badge_premium.png')
for name, im in (('badge_free', sheet), ('badge_premium', plus)):
    assert im.size == (128, 32), (name, im.size)
    frames = [im.crop(((i % 8) * 16, (i // 8) * 16, (i % 8) * 16 + 16, (i // 8) * 16 + 16)) for i in range(16)]
    assert len({f.tobytes() for f in frames}) >= 8, name + ' has no animation'
legacy = load('xion-client-mod/src/main/resources/assets/xionclient/textures/font/badge.png')
assert legacy.size == (16, 16), legacy.size
legacy_pro = load('xion-client-mod/src/main/resources/assets/xionclient/textures/font/badge_pro.png')
assert legacy_pro.size == (128, 16), legacy_pro.size

provider = json.loads((ROOT / 'xion-client-mod/src/main/resources/assets/minecraft/font/default.json').read_text())
chars = {p['file']: sum(len(row) for row in p['chars']) for p in provider['providers'] if p['type'] == 'bitmap'}
assert chars['xionclient:font/badge_free.png'] == 16, chars
assert chars['xionclient:font/badge_premium.png'] == 16, chars
assert chars['xionclient:font/badge_pro.png'] == 8, chars

html = (ROOT / 'src/renderer/index.html').read_text()
intro = (ROOT / 'src/renderer/intro.js').read_text()
for rel, text in (('index.html', html), ('intro.js', intro)):
    assert 'logo.png' in text, rel + ' does not use the brush mark'
    assert '#xlogo' not in text, rel + ' still references the old symbol'

print('PASS: brush-X icons, launcher mark and 16-frame free/Xion+ name badges')
