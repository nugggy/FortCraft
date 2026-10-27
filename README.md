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
- `src/`: game code (world generation, meshing, actors, bots, combat, building, loot, storm, story, HUD, networking)
- `vendor/three.module.min.js`: three.js r170
- All textures and sounds are generated in code at runtime. There are no image or audio files.
