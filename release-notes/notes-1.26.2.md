# Xion Launcher 1.26.2

## New animated player badges

- **Free players:** a blue Xion shield with an animated light sweep and moving edge highlight.
- **Xion+ players:** a crowned gold shield with its own animated highlights.
- Both variants use **16 preloaded frames** beside names in the tab list and in-world nametags/F5.
- Every frame has the same width, so player names do not jitter as the badge animates.
- Cached name components refresh their frames without stacking duplicate badges. Server ranks, team colors and name styling are preserved.
- The existing badge privacy toggle, Xion account entitlement and legacy license support remain unchanged.

## A modern in-game Mods page

- A larger, responsive mod library with readable icon-led cards, descriptions and version information.
- Pinned search and **All / Xion / Added / Changes** filters, plus keyboard editing and paste support.
- Smooth scrolling, subtle hover transitions, explicit enable switches and clearer restart-pending states.
- Real Settings buttons with shared drawing/hit-test geometry. Fixed the old absolute-coordinate calculation that could give buttons a negative width.
- Clicking a card no longer accidentally disables a mod. Config screens open on mouse release, and required dependencies remain protected.
- Better-spaced HUD module cards and an in-profile preview of both badge variants.
- Correct keyboard handling across GLFW and Minecraft 26.3's SDL input API.

## Performance and release

- The **Unlimited FPS / VSync fix from 1.26.1 remains included**.
- Badge textures and mod filtering are cached; only visible mod cards render.
- Tests cover badge animation/widths, rich name styling, privacy, search editing, control geometry and the FPS regression.
- Updated Windows installer/portable and Linux AppImage/DEB/tar.gz builds, with both auto-update manifests published together.
