# Xion Shop — The Deep

Static storefront over one fixed 3D ocean. Scrolling the page dives the camera from the sunlit surface past a coral shelf, a kelp forest and an ocean monument to the abyss, while a swimming player wears the cape chosen with **Try on**. Accounts, catalog prices, cart and payment-proof APIs go through the same-origin API bridge.

## Files

- `index.html` — page layout: featured collections, Popular, Categories, New, the Xion+ comparison, the full catalog, collections, locker and how it works.
- `app.js` — browsing: carousel, strips, tiles, catalog filters, Try on, the visitor's own skin, and the 3D inspector dialog.
- `depths.js` — the WebGL ocean and the swimming player (skinview3d). A second viewer is created only when the inspector opens.
- `store.js` — cart, checkout, orders, account and locker. It publishes `window.XionMoney` and a `xion:catalog` event for card prices.
- `assets/previews/` holds cropped cape front faces for cards. Rebuild with `python3 tools/build-previews.py` after updating `assets/capes/` (requires Pillow).

## Notes

- Everything in the scene is built from cubes in code; no outside models, images or CDNs.
- Motion respects reduced-motion preferences, can be paused from the nav, and rendering stops while the tab is hidden or a drawer/dialog is open.
- "Use skin" loads a Java Edition skin through `/api/cosmetics?r=skin`.
- Product previews can be linked with `?cape=<cape id>`.

No client build step is required. The API controls final pricing and ownership; the browser never grants entitlements.
