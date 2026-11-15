# Xion Launcher 1.20.0

## The Mods page is now split in two

Press **Right Shift** in game and the Mods page opens with two clear sections:

- **XION MODS** — everything Xion Launcher itself installs, in one place.
- **YOUR MODS** — the mods you added yourself.

Each section has its own title, count and rule, and the All / Xion / Added chips
still narrow the list down.

## Cards drawn in Xion's own style

The cards no longer use each mod's own logo image. Every card now draws a Xion
glyph picked from what the mod does — the Xion mark for the client, rising bars
for performance mods, a lens for shader and visual mods, tiles for config
libraries, angle brackets for APIs, a block for everything else — in the same
monochrome line art, dimmed when a mod is switched off.

Bigger cards, too: name and version on top, the glyph centred and floating, and
a row at the bottom with a **⚙ settings** button and a full-width
**Enabled / Disabled** pill (green when on, "Turns on next launch" while a
change is pending, "Required" for mods other mods depend on).

## Fixed: updates were not offered

Clients that installed 1.19.0 kept 1.19.0 forever, because the later build
carried the same version number and the updater only installs a *newer* version.
This release moves the number to 1.20.0, so 1.19.0 installs pick it up on their
next launch.

## Also in this build

- Fresh client jars for 26.3, 1.21.11, 1.21.10, 1.21.8, 1.21.4 and 1.21.1.
- Windows installer, portable exe, Linux AppImage, .deb and tar.gz all built
  from the same source and published with `latest.yml` / `latest-linux.yml`, so
  auto-update keeps working for every install type.
