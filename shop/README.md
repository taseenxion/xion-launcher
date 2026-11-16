# Xion Shop — Tideborn

Static storefront with a locally rendered underwater voxel world and a shared Minecraft skin/cape viewer. Existing accounts, catalog prices, cart and payment-proof APIs use the same-origin API bridge.

## Rendering

- `ocean.js` creates the reef/temple scenes and one reusable product inspector using locally vendored Three.js and skinview3d.
- The hero and inspector share cached original cape frames. UV atlases remain unmodified for real cape/elytra rendering.
- `assets/previews/` contains cropped front faces for lightweight product cards. Rebuild with `python3 tools/build-previews.py` after updating `assets/capes/` (requires Pillow).
- Background images in `assets/worlds/` are original renders of the procedural scene, not assets from the reference website.
- Motion respects reduced-motion preferences, can be paused manually, and stops rendering when the scene is offscreen or the page is hidden.
- Product previews can be linked with `?cape=an_tide` (any catalog cape ID).

No client build step or third-party CDN is required. The API controls final pricing and ownership; the browser never grants entitlements.
