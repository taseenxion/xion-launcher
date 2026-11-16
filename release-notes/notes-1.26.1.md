# Xion Launcher 1.26.1 — Unlimited FPS fix

## No more hidden 60 FPS lock

The FPS menu could display **Unlimited** while re-enabling VSync. On a 60 Hz display, this limited rendering to 60 FPS even though Minecraft's frame limit was set to unlimited.

- **Unlimited FPS now turns VSync off automatically**, whether selected with the toggle or the FPS cap selector.
- The VSync row reflects this automatic setting instead of showing a misleading off toggle.
- Selecting a finite FPS cap cancels Unlimited, and the cap label shows the effective selection.

## Your performance settings stay yours

Changing one FPS option previously reset unrelated settings: clouds, particles, shadows, mipmaps, view distances and more. That could undo the launcher's Boost/Turbo preset or your custom tuning.

- Disabled FPS tweaks now leave those game settings untouched.
- Turning off a tweak restores its pre-tweak value for the current session instead of forcing a hardcoded default.
- Unchanged settings are not reapplied or saved every tick.
- Fixed an early-startup case that could cache the FPS settings before Minecraft's options were ready.

All six bundled client versions were rebuilt, with automated regression tests for both old and new Minecraft option APIs. XION AI, the redesigned menu and cape fixes from 1.26.0 remain included.

Windows installer/portable and Linux AppImage/DEB/tar.gz builds are published with updated auto-update manifests. Restart Minecraft after updating to load the fixed client.
