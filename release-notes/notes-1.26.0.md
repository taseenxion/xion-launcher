# Xion Launcher 1.26.0

## Meet XION AI

Xion Client now has a built-in assistant. Open the **Right Shift menu → XION AI** and ask anything: Minecraft tips, build ideas, redstone help, server questions or everyday questions.

- Smooth animated message bubbles, typing dots, suggestion cards and auto-scrolling
- Multi-turn conversations, so follow-up questions remember the context
- Enter-to-send, editable input, paste support, retry and one-click new chats
- Fast Gemini responses with an automatic fallback model and friendly offline/error states
- Network work stays off the game thread, so an API timeout cannot freeze or crash Minecraft

## A completely redesigned Right Shift menu

- A wider Nightfall glass layout with an animated header, icon sidebar and cleaner page canvas
- New page transitions, active-tab glow, drifting background motes and smoother hover feedback
- Better spacing for Mods, HUD, Features, FPS, Capes, Crosshair and Profile
- XION AI gets a larger chat-focused layout while the rest of the menu stays compact

## Cape and stability fixes

- Your launcher/in-game cape now always wins on your own player, including choosing **None**
- The client reads the new account-backed wear list instead of stale legacy wings/aura data
- Old purchased shop cape textures still work for other players through a safe legacy fallback
- Picking a local, free or custom cape clears a stale account cape; purchased account capes stay synchronized
- Unknown old cape IDs are cleaned up instead of blocking every new cape
- Corrupt/partial launcher hand-off files, malformed cosmetic responses and failed texture downloads are handled safely

## Release and updater

- Windows installer + portable builds and Linux AppImage + DEB + tar.gz builds are published together
- Existing installations receive 1.26.0 through the normal auto-updater
- Fixed the website release-link updater so it no longer changes Minecraft version labels
