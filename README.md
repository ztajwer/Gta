# TIDELINE

An original browser-native 3D open-world slice set in Suncoast County. Its coastal setting, characters, vehicles, missions, and procedural art are original; it is not a recreation of another game.

## Run it

Install dependencies, then start the local Vite server:

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4173> in a WebGL-capable browser. `npm run build` creates the production bundle; `npm run preview` serves it locally.

The game is written in JavaScript (ES modules) with Three.js for 3D, HTML/CSS for the interface, and Vite for development and production builds.

Three.js and the game's scene are loaded locally through Vite. The lead character, Mara Vale, is generated from original Three.js geometry with an articulated walk rig, detailed face and hair, layered jacket, utility pockets, jewelry, and sneakers. The supplied GLB remains unused; it no longer replaces or appears in the playable character.

## Controls

- Arrow keys — walk and drive; up accelerates, down brakes/reverses, left/right steer
- `Shift` — sprint on foot; descend while flying
- `Mouse drag` — look around
- `Space` — jump on foot, handbrake in a car, ascend in flight mode
- `E` — enter or exit a nearby vehicle
- `C` — cycle follow, cinematic, and hood camera
- `H` — horn
- `J` — accept the next courier mission
- `M` — open the coastal grid map
- `T` or the sun/moon HUD button — smoothly switch between day and night
- `Y` — toggle coastal rain and wet-road reflections
- Type `SEAWAYS` — toggle a car's floating ability; drive into the surf
- Type `FLY` — toggle flight mode; use `Space` to rise and `Shift` to descend
- `R` — reset the current vehicle
- `Esc` — pause or resume
- Pause menu — save or load a local game save
- Touch screens — on-screen movement pad and action buttons; drag to look around

Buildings, facades, landmarks, NPCs, vehicles, and weather are generated at runtime. The supplied `bg game sound.mp3` soundtrack starts when the city starts and loops until muted or the page is closed. Engine, footsteps, horn, rain, and police-siren layers are synthesized locally with Web Audio. If the track cannot load, the game falls back to its generated instrumental score. Fonts are self-hosted, and saves stay in this browser on this device.

## Performance

The renderer detects phones, Chromebooks, reduced-data connections, memory, and CPU limits automatically. Constrained devices use a 1x render scale, lighter shadows, fewer NPCs/traffic cars/particles, simplified background characters, and cheaper water effects. Desktop devices start at a capped 1.35x render scale and automatically lower render scale or shadows if sustained frame time drops.

The production app registers a small service worker that caches the app shell and all requested production assets, so repeat launches are faster and the game can start from the browser cache when the network is unavailable.
