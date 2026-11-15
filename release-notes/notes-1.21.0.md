# Xion Launcher 1.21.0

A maintenance release: everything below makes the launcher more reliable, and the
version bump lets every 1.20.0 install pick it up automatically on its next launch.

## Fixed: joining servers on older Minecraft versions

Profiles on 1.8 – 1.19 were supposed to join a server with `--server` / `--port`
because Quick Play only exists from 1.20. A broken version check meant that never
happened, so "Join server" silently did nothing on those versions. It now parses
the version correctly and joins as expected.

## Fixed: the Xion+ / Premium button

The Premium button opened an old GitHub Pages address that no longer exists. It now
opens the live site (`xionx.vercel.app`) at the premium section.

## Fixed: mods you switched off showed up as "your mods"

On the Mods page, a Xion mod that you had disabled was listed under **YOUR MODS**
instead of **XION MODS**, because the disabled file name (`name.jar.disabled`) did
not match the manifest. Disabled Xion mods now stay in the Xion group with their
Enabled / Disabled state intact.

## Fixed: launcher data is saved safely

Accounts, profiles and settings were written straight over `launcher.json`. A crash
or a full disk during that write could truncate the file, and the launcher would
then silently fall back to defaults — losing every profile and account.

Saves are now written to a temporary file and renamed into place, with a `.bak` copy
kept alongside. If the main file is ever unreadable, the launcher recovers the last
good save instead of resetting.

## Fixed: playtime and launch stats update right away

After closing the game, the profile panel kept showing the old playtime, launch
count and "last played" until you restarted the launcher. Those values now refresh
the moment Minecraft exits.

## Fixed: network stalls no longer hang the launcher

- DNS lookups now respect the requested address family, so an IPv4-only request can
  no longer be handed an IPv6 address.
- Requests that use both the Chromium and Node network stacks now have an overall
  timeout. If both stacks hang, the launcher reports a clear timeout instead of
  waiting forever. Large downloads are unaffected — only the wait for a response is
  capped.

## Under the hood

- The release script now reads the version from `package.json` (no more stale
  "1.18.0" messages) and updates the download links on the website to the version
  being released before deploying it, so the site can never point at an old build.

## Builds

Windows installer, portable exe, Linux AppImage, .deb and tar.gz are all built from
this source and published together with `latest.yml` / `latest-linux.yml`, so every
install type keeps updating itself.
