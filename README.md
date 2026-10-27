# FortCraft: The Loop of Cubeterra

A browser battle royale with blocky voxel graphics. Drop from the Battle Bus, loot golden chests, build (or don't), and be the last Looper standing while the Static closes in. Play solo against bots or with friends on the same network.

## Play online

Play solo in your browser at **https://nugggy.github.io/FortCraft/**. LAN play needs the downloadable server below.

## Running it

You need Node.js 18 or newer. The easiest way to install is with git, so updates are one click:

```
git clone https://github.com/nugggy/FortCraft.git
cd FortCraft
```

Or download the latest release zip from https://github.com/nugggy/FortCraft/releases/latest.

1. Double-click `start.bat`, or run `npm install` once and then `npm start`.
2. The game opens at http://localhost:8080.

The server prints a LAN address such as `http://192.168.1.20:8080`. Other players on the same network open that address in their browser. If Windows Firewall asks whether to allow Node.js on private networks, allow it, or other computers won't be able to connect.

## Mobile and cross-play

FortCraft runs on phones and tablets in the browser. Touch controls switch on automatically.

- **Move:** the left thumb is a floating joystick. Push it all the way forward to sprint.
- **Aim:** drag anywhere on the right side, or drag on the fire button while shooting.
- **Buttons:** fire, jump, crouch or slide, aim, reload, build (with wall, floor, ramp and cone buttons in build mode), and a Use button that appears next to chests, loot, vending machines and minecarts.
- **Shortcuts:** tap hotbar slots to equip, and tap the minimap for the full map.
- **Aim assist:** a light assist for touch and controller players keeps cross-play fair. Mouse players never get assist. Turn it off in Settings under Touch and mobile.
- **Phone defaults:** phones start on Low graphics with 10 bots. Play in landscape.
- **Home screen app:** on the online version (or any HTTPS host) you can add FortCraft to your home screen. It then opens fullscreen like an app.

Cross-play works over the LAN: phones, tablets and PCs join the same lobby by opening the server's LAN address. The lobby shows each player's device.

## Android app

Download **FortCraft.apk** from the latest release: https://github.com/nugggy/FortCraft/releases/latest

1. Open the download on your phone. The first time, Android asks you to allow installs from your browser or Files app.
2. Launch FortCraft. It runs fullscreen in landscape with touch controls, and solo play works offline.
3. For LAN play, tap **LAN lobby** and enter the address the server prints (for example `192.168.1.20:8080`). The phone must be on the same Wi-Fi.

**Updates:** the app checks GitHub every time it opens. When a new release is out, tap **Download update** on the banner and install it over the old app. Your progress and settings are kept.

**Building the APK yourself:** you need Android Studio (for the SDK and its bundled Java) and Node.js. Run `mobile/build-apk.bat`. Release builds are signed with the key in your user folder under `.fortcraft`, which is never committed. Without that key, builds fall back to the debug key, and those can't install over the official app.

## Self-hosting on a NAS

Docker files are included, so a NAS that runs containers (Synology Container Manager, QNAP Container Station, Unraid, TrueNAS and others) can host FortCraft for the whole household:

```
docker compose up -d
```

Then open `http://<nas-address>:8080` on every device. To change the port, edit `docker-compose.yml`.

- **Health check:** `/api/health` reports whether the server is up, plus the player count.
- **Updating a Docker install:** pull the latest code, then run `docker compose up -d --build`. The in-game banner links to the release notes.
- **HTTPS (optional):** needed for "add to home screen" and offline play on phones. Put the NAS's reverse proxy in front of port 8080 with a certificate, and pass WebSockets through (path `/ws`). The game switches to secure WebSockets automatically on HTTPS.

## Updates

FortCraft checks GitHub for a newer version every time it loads and shows a banner in the lobby when one is out.

- **Channel:** Settings, then Updates. Stable follows published releases, Beta follows the latest code, Off never checks.
- **Git installs:** click **Update now** on the banner (only works on the computer running the server), or run `update.bat`. Then restart the server.
- **Zip installs:** the banner links to the latest release download.
- **Online version:** just reload the page.

## LAN play

- Everyone clicks **LAN lobby**. The first person in becomes the host.
- The host picks the mode (Builds or No Builds), bot count and bot skill, then starts the match.
- The host's computer runs the bots, the storm and all loot. If the host leaves mid-match, the match ends for everyone.
- People who arrive mid-match wait in the lobby for the next one.

## The island

Every match generates a new 320 × 320 island from a shared seed, so LAN players all see the same one. There are 12 named locations, including towns, tower blocks, a farm, Loot Lake, a desert temple, a lighthouse, a castle, a mine and a factory. Biomes cover plains, forest, desert, snowy peaks and swamp, with rivers, roads and bridges in between. Each match also rolls a time of day (morning, midday, afternoon or sunset).

## Graphics

Settings has a graphics quality option. High uses sun shadows, bloom and colour grading at up to 2× resolution. Medium uses smaller shadows at lower resolution. Low turns shadows and post-processing off for slower computers.

## Progression

You earn XP for eliminations, chests, placement and wins, and level up over time. Your level, XP and outfit (picked in the Locker) are saved in the browser.

## Modes

- **Builds**: harvest materials with the pickaxe and build walls, floors, ramps and cones.
- **No Builds**: building and harvesting are off, materials don't drop, and everyone gets a 50-point overshield that regenerates after 5 seconds without taking damage.

## Controls

| Action | Key |
| --- | --- |
| Move, jump | W A S D, Space |
| Shoot or swing, aim down sights | Left click, right click |
| Pickaxe, inventory slots | 1, 2 to 6 (or mouse wheel) |
| Reload | R |
| Pick up, search chest | E (hold E on chests) |
| Wall, floor, ramp, cone | Q, Z, X, C |
| Toggle build mode, swap material | G, R while building |
| Full map (click to place a marker, right-click to clear) | M |
| Pause | Esc |

Sound effects can be shown as on-screen indicators around the crosshair (on by default, toggle in Settings).

## Story

Five chapters guided by Echo, a rogue AI, against the Architect who runs the Loop. Objectives carry over between matches and unlock Codex entries. Chapter 4 hides a Seed Shard on the map, and Chapter 5 brings the Warden boss into the final circles. Progress is saved in the browser and can be reset from the Story screen.

## Project layout

- `server.js`: static file server and WebSocket relay for LAN play
- `mobile/`: the Android app (Capacitor wrapper and build script)
- `src/`: game code (world generation, meshing, actors, bots, combat, building, loot, storm, story, HUD, networking)
- `vendor/three.module.min.js`: three.js r170
- All textures and sounds are generated in code at runtime. There are no image or audio files.
