# Xion Launcher 1.22.0

## The Mods page now shows each mod's real logo

Cards on the Right Shift Mods page draw the icon each mod ships in its own jar —
Sodium's logo, the Xion mark, every installed mod's own art — instead of the generic
hand-drawn glyphs (those remain as the fallback for mods without an icon). Logos are
read straight from the jar, cached, and dim when a mod is switched off.

## Enable and Settings are now real buttons

The bottom row of every card has two buttons:

- **Enabled / Disabled** (or *Turns on / Turns off next launch*, or *Required* when
  other mods depend on it) — click to switch the mod.
- **Settings** — opens the mod's own config screen (Sodium Extra, Zoomify, Iris and
  everything else that exposes one through Mod Menu's config entrypoint). Mods that
  ship no config screen show a greyed *No settings*.

Everything you installed yourself keeps its own **YOUR MODS** section below
**XION MODS**, with the same two buttons and its own All / Xion / Added filter chips.

## The Store is gone — capes stay

The launcher's Store tab (shop, cart, checkout, orders, locker and store admin) has
been removed, along with the in-game Xion+ purchase screen. The capes stay:

- the launcher's **Skin page** still has the full cape picker, including custom cape
  upload;
- the in-game menu now has a **Capes** tab (formerly Cosmetics) with the same grid —
  pick a cape, animated ones included; your elytra still matches;
- Xion+ capes still work with a valid key: enter it in **Xion Launcher → Settings →
  Xion Premium**, they are never bought inside the game;
- the custom crosshair editor moved from the old Xion+ tab to its own **Crosshair**
  tab, which appears when Xion+ is active.

## Also in this build

- Fresh client jars for 26.3, 1.21.11, 1.21.10, 1.21.8, 1.21.4 and 1.21.1, stamped
  1.22.0 and rebuilt from this source.
- Windows installer, portable exe, Linux AppImage, .deb and tar.gz all built from the
  same source and published together with `latest.yml` / `latest-linux.yml`, so every
  install type keeps updating itself.
