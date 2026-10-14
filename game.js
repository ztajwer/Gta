import * as THREE from "three";
import backgroundMusicUrl from "./bg game sound.mp3?url";
let launchGame;

/* TIDELINE — original procedural open-world slice */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("game-canvas");
  const state = {
    started: false,
    paused: false,
    mapOpen: false,
    cameraMode: 0,
    clockHours: 17.65,
    timeTarget: null,
    raining: false,
    arrested: false,
    wanted: 0,
    wantedCooldown: 0,
    cash: 12840,
    health: 100,
    lastFootstepAt: 0,
    playerInCar: false,
    playerCar: null,
    seaways: false,
    flightMode: false,
    cheatBuffer: "",
    lastCheatInput: 0,
    coastWarningAt: 0,
    // Frame the coastal boulevard, with the city to the left and water to the right.
    mouseYaw: -Math.PI / 2,
    mousePitch: 0.18,
    keys: Object.create(null),
    mission: { index: 0, active: false, complete: false, target: new THREE.Vector3(94, 0, -104), elapsed: 0 },
  };
  const missionCatalog = [
    { title: "HOTEL RENDEZVOUS", copy: "Take a sealed envelope from the marina to Hotel Cielo before the evening rush.", target: new THREE.Vector3(94,0,-104), reward: 2500, limit: 60, destination: "HOTEL CIELO" },
    { title: "SHORELINE RELAY", copy: "Get an emergency radio to the lifeguard tower before the squall hits.", target: new THREE.Vector3(-106,0,-151), reward: 3200, limit: 75, destination: "LIFEGUARD TOWER" },
    { title: "SKYLINE SIGNAL", copy: "Carry the encrypted transmitter to the old coast guard lookout.", target: new THREE.Vector3(-112,0,112), reward: 5000, limit: 95, destination: "COASTLINE LOOKOUT" },
  ];

  if (!THREE) {
    $("error-banner").textContent = "WebGL library failed to load. Check your connection and reload the page.";
    $("error-banner").classList.remove("hidden");
    return;
  }

  let renderer;
  let scene;
  let camera;
  let sun;
  let hemi;
  let moon;
  let water;
  let skyMaterial;
  let sunDisc;
  let moonDisc;
  let starField;
  let rainStreaks;
  let waveLines;
  let cityGroup;
  let player;
  let playerShadow;
  let lowPowerDevice = false;
  let missionMarker;
  let audio = null;
  let toastTimer = 0;
  let lastTime = performance.now();
  const buildingColliders = [];
  const pedestrians = [];
  const officers = [];
  const bloodEffects = [];
  let bloodDropGeometry = null;
  let bloodPoolGeometry = null;
  let lastPedestrianToastAt = 0;
  const policeCars = [];
  const trafficCars = [];
  const streetLights = [];
  const trafficSignals = [];
  const neonMaterials = [];
  const cars = [];
  const facadeTextures = [];
  const CITY_HALF = 174;
  const ROAD_STEP = 36;
  const ROAD_WIDTH = 10;
  let lastRenderAt = 0;

  const rand = (() => {
    let seed = 12042026;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = THREE.MathUtils.clamp;
  const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const skyColors = {
    dayZenith: new THREE.Color(0x78bce8), nightZenith: new THREE.Color(0x1a2b52),
    dayHorizon: new THREE.Color(0xffc49b), nightHorizon: new THREE.Color(0x786b9e),
    dayUnder: new THREE.Color(0xe7a17d), nightUnder: new THREE.Color(0x262444), mixed: new THREE.Color(),
    daySun: new THREE.Color(0xffd1a1), nightSun: new THREE.Color(0x8297ff),
  };

  function makeCanvasTexture(paint, size = 256) {
    const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d"); paint(ctx, size);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  function makeFacadeTexture(palette) {
    return makeCanvasTexture((ctx, size) => {
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, palette.base); gradient.addColorStop(.52, palette.mid); gradient.addColorStop(1, palette.base);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
      const columns = 5; const floors = 6; const cellW = size / columns; const cellH = size / floors;
      for (let floor = 0; floor < floors; floor++) {
        const y = floor * cellH;
        ctx.fillStyle = palette.band; ctx.globalAlpha = .55; ctx.fillRect(0, y, size, 5); ctx.globalAlpha = 1;
        for (let col = 0; col < columns; col++) {
          const x = col * cellW; const margin = 8;
          const lit = ((floor * 7 + col * 11 + palette.seed) % 9) < 3;
          const pane = ctx.createLinearGradient(x, y + 5, x + cellW, y + cellH);
          pane.addColorStop(0, lit ? palette.glow : "#172438"); pane.addColorStop(.48, "#182d45"); pane.addColorStop(1, lit ? "#41566c" : "#24334a");
          ctx.fillStyle = pane; ctx.fillRect(x + margin, y + 10, cellW - margin * 2, cellH - 20);
          ctx.fillStyle = "rgba(215,238,255,.24)"; ctx.fillRect(x + margin, y + 10, 2, cellH - 20);
          ctx.fillStyle = "rgba(10,18,35,.72)"; ctx.fillRect(x + cellW / 2 - 1, y + 10, 2, cellH - 20);
          if ((floor + col + palette.seed) % 5 === 0) { ctx.fillStyle = palette.trim; ctx.fillRect(x + margin - 2, y + cellH - 9, cellW - margin * 2 + 4, 3); }
        }
      }
      ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(0, 0, 5, size);
      ctx.fillStyle = "rgba(6,11,24,.3)"; ctx.fillRect(size - 7, 0, 7, size);
    }, 256);
  }

  function makeRoadTexture() {
    return makeCanvasTexture((ctx, size) => {
      ctx.fillStyle = "#465263"; ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2600; i++) {
        const shade = 45 + Math.floor(rand() * 38); const alpha = .045 + rand() * .13;
        ctx.fillStyle = `rgba(${shade + 5},${shade + 9},${shade + 18},${alpha})`;
        const r = rand() * 2.2 + .3; ctx.beginPath(); ctx.ellipse(rand() * size, rand() * size, r * 2.4, r, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 8; i++) {
        const x = rand() * size; const y = rand() * size; const stain = ctx.createRadialGradient(x, y, 2, x, y, 22 + rand() * 20);
        stain.addColorStop(0, "rgba(3,8,17,.18)"); stain.addColorStop(1, "rgba(3,8,17,0)"); ctx.fillStyle = stain; ctx.fillRect(x - 50, y - 50, 100, 100);
      }
      ctx.strokeStyle = "rgba(177,203,232,.035)"; ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) { const y = i * (size / 18); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + (rand() - .5) * 3); ctx.stroke(); }
    });
  }

  function makePavementTexture() {
    return makeCanvasTexture((ctx, size) => {
      ctx.fillStyle = "#858b91"; ctx.fillRect(0, 0, size, size);
      for (let tileY = 0; tileY < 4; tileY++) for (let tileX = 0; tileX < 4; tileX++) {
        const shade = 116 + Math.floor(rand() * 18);
        ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 6},.2)`;
        ctx.fillRect(tileX * size / 4 + 2, tileY * size / 4 + 2, size / 4 - 4, size / 4 - 4);
      }
      ctx.strokeStyle = "rgba(28,39,54,.32)"; ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        const p = i * size / 4;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
      }
      for (let i = 0; i < 1900; i++) {
        const shade = 26 + Math.floor(rand() * 80); const alpha = .035 + rand() * .075;
        ctx.fillStyle = `rgba(${shade},${shade + 5},${shade + 9},${alpha})`;
        const r = rand() * 1.3 + .25; ctx.beginPath(); ctx.ellipse(rand() * size, rand() * size, r * 2.2, r, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  const facadePalette = [
    { base: "#455875", mid: "#71869b", band: "#d5aa8c", glow: "#f4c99a", trim: "#e4c5a0", seed: 2 },
    { base: "#265267", mid: "#4c7a8e", band: "#83c4c7", glow: "#79e9e8", trim: "#a2e0d7", seed: 5 },
    { base: "#5b4969", mid: "#85667e", band: "#e99a8e", glow: "#ffd89f", trim: "#ffb891", seed: 7 },
    { base: "#4b5d72", mid: "#788b9b", band: "#aebfca", glow: "#e9f1f4", trim: "#d5e0df", seed: 1 },
  ];
  facadePalette.forEach((palette) => facadeTextures.push(makeFacadeTexture(palette)));
  const asphaltTexture = makeRoadTexture();
  const pavementTexture = makePavementTexture();

  const mats = {
    asphalt: new THREE.MeshStandardMaterial({ color: 0xc7d0d9, map: asphaltTexture, roughness: 0.8, metalness: 0.12 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x56647c, roughness: 0.9, metalness: 0.02 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xcfad7d, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x244c4c, roughness: 1 }),
    roadLine: new THREE.MeshBasicMaterial({ color: 0xd4c177, transparent: true, opacity: 0.82 }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x7cecff, toneMapped: false }),
    pink: new THREE.MeshBasicMaterial({ color: 0xff6dbe, toneMapped: false }),
    gold: new THREE.MeshBasicMaterial({ color: 0xffd27d, toneMapped: false }),
    darkGlass: new THREE.MeshStandardMaterial({ color: 0x13203b, roughness: 0.16, metalness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb87c63, roughness: 0.68 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0xff477f, roughness: 0.62 }),
    pants: new THREE.MeshStandardMaterial({ color: 0x162541, roughness: 0.85 }),
  };

  function makeRenderer() {
    lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || window.matchMedia("(max-width: 760px)").matches;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPowerDevice, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPowerDevice ? 1 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;
  }

  function makeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101731);
    scene.fog = new THREE.FogExp2(0x182044, 0.00165);

    camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(18, 9, 60);

    hemi = new THREE.HemisphereLight(0xb5d9ff, 0x4e536e, 2.35);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffd1a3, 2.8);
    sun.position.set(-80, 110, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(lowPowerDevice ? 1024 : 2048, lowPowerDevice ? 1024 : 2048);
    sun.shadow.camera.left = -220;
    sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -220;
    sun.shadow.bias = -0.00018;
    scene.add(sun);
    moon = new THREE.DirectionalLight(0x7696ff, 0.08);
    moon.position.set(70, 90, -80);
    scene.add(moon);

    cityGroup = new THREE.Group();
    scene.add(cityGroup);
    buildGround();
    buildRoadNetwork();
    buildBuildings();
    buildLandmarks();
    buildPalmsAndParks();
    buildStreetFurniture();
    buildTrafficSignals();
    buildWaterAndSkyline();
    buildPlayer();
    buildMissionMarker();
    buildTraffic();
    buildPedestrians();
    updateLighting(0);
    updateCamera(1);
  }

  function addBox(parent, size, pos, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = opts.castShadow ?? false;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    parent.add(mesh);
    return mesh;
  }

  function buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), mats.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    const plaza = addBox(cityGroup, [340, 0.18, 320], [0, 0.06, 7], mats.sidewalk, { receiveShadow: true });
    const plazaMap = pavementTexture.clone(); plazaMap.repeat.set(38, 36); plazaMap.needsUpdate = true;
    plaza.material = new THREE.MeshStandardMaterial({ color: 0xc6d0d8, map: plazaMap, roughness: 0.94 });

    const beach = addBox(cityGroup, [340, 0.22, 22], [0, 0.16, -165], mats.sand);
    beach.material.color.setHex(0xcba778);
    for (let i = 0; i < 32; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(5 + rand() * 8, 0.025, 0.17), new THREE.MeshBasicMaterial({ color: 0xefd6a5, transparent: true, opacity: 0.23 }));
      stripe.position.set(-160 + rand() * 320, 0.3, -174 + rand() * 18);
      stripe.rotation.y = rand() * Math.PI;
      cityGroup.add(stripe);
    }
  }

  function buildRoadNetwork() {
    asphaltTexture.repeat.set(10, 10);
    for (let i = -5; i <= 5; i++) {
      const p = i * ROAD_STEP;
      const roadX = addBox(cityGroup, [ROAD_WIDTH, 0.12, 350], [p, 0.18, 0], mats.asphalt);
      const roadZ = addBox(cityGroup, [350, 0.12, ROAD_WIDTH], [0, 0.19, p], mats.asphalt);
      roadX.receiveShadow = roadZ.receiveShadow = true;
      for (let n = -10; n <= 10; n++) {
        const z = n * 16;
        addBox(cityGroup, [0.24, 0.03, 6], [p, 0.27, z], mats.roadLine);
        addBox(cityGroup, [6, 0.03, 0.24], [z, 0.28, p], mats.roadLine);
      }
    }
    for (let i = -5; i <= 5; i++) {
      const p = i * ROAD_STEP;
      for (const side of [-1, 1]) {
        addBox(cityGroup, [1.55, 0.08, 350], [p + side * (ROAD_WIDTH / 2 + .78), 0.23, 0], mats.sidewalk);
        addBox(cityGroup, [350, 0.08, 1.55], [0, 0.23, p + side * (ROAD_WIDTH / 2 + .78)], mats.sidewalk);
      }
    }
    const median = addBox(cityGroup, [350, 0.16, 2.4], [0, 0.32, 72], new THREE.MeshStandardMaterial({ color: 0x173a41, roughness: 1 }));
    for (let i = -11; i <= 11; i++) addBox(cityGroup, [2, 0.18, 1.1], [i * 15, 0.47, 72], mats.grass);

    const paint = new THREE.MeshBasicMaterial({ color: 0xe6e8db, transparent: true, opacity: .78 });
    for (let gx = -4; gx <= 4; gx += 2) for (let gz = -4; gz <= 4; gz += 2) {
      const ix = gx * ROAD_STEP; const iz = gz * ROAD_STEP;
      for (const side of [-1, 1]) for (let bar = 0; bar < 7; bar++) {
        const offset = side * (ROAD_WIDTH / 2 + .5 - bar * .62);
        addBox(cityGroup, [ROAD_WIDTH - 1.6, .026, .36], [ix, .29, iz + offset], paint);
        addBox(cityGroup, [.36, .026, ROAD_WIDTH - 1.6], [ix + offset, .29, iz], paint);
      }
      for (const cornerX of [-1, 1]) for (const cornerZ of [-1, 1]) {
        const curb = addBox(cityGroup, [1.1, .18, 1.1], [ix + cornerX * 6.4, .33, iz + cornerZ * 6.4], new THREE.MeshStandardMaterial({ color: 0x7d8792, roughness: .87 }));
        curb.rotation.y = Math.PI / 4;
      }
    }
    for (let i = -4; i <= 4; i++) for (const side of [-1, 1]) {
      const grate = addBox(cityGroup, [1.15, .025, .22], [i * 36 + 6.8 * side, .292, 16], new THREE.MeshStandardMaterial({ color: 0x29313d, metalness: .25, roughness: .72 }));
      for (let slot = -3; slot <= 3; slot++) addBox(cityGroup, [.025, .028, .2], [grate.position.x + slot * .13, .31, grate.position.z], new THREE.MeshStandardMaterial({ color: 0x7d8a94, metalness: .55, roughness: .46 }));
    }
  }

  function buildingMaterial(w, h, d) {
    const map = pick(facadeTextures).clone(); map.repeat.set(Math.max(1, Math.max(w, d) / 8), Math.max(1, h / 7)); map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.58, metalness: 0.22 });
  }

  function addWindowBands(building, w, h, d, seed) {
    const floors = Math.max(2, Math.floor(h / 4.3));
    const rows = Math.min(6, Math.floor(w / 3));
    const glowColors = [0x7cecff, 0xffd27d, 0xff6dbe, 0xb9ff88];
    const windows = [];
    for (let floor = 1; floor < floors; floor++) {
      if ((seed + floor) % 4 === 0) continue;
      for (let row = 0; row < rows; row++) {
        if (rand() < 0.24) continue;
        const side = row - (rows - 1) / 2;
        const front = rand() > 0.45;
        const y = floor * 4.05 - h / 2 + 1.1;
        windows.push({ x: front ? side * 2.2 : w / 2 + .012, y, z: front ? d / 2 + .012 : side * 2.2, turn: front ? 0 : Math.PI / 2, color: pick(glowColors) });
      }
    }
    if (!windows.length) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .62, toneMapped: false });
    const instances = new THREE.InstancedMesh(new THREE.PlaneGeometry(.92,.82), mat, windows.length); const dummy = new THREE.Object3D();
    windows.forEach((window, i) => { dummy.position.set(window.x, window.y, window.z); dummy.rotation.y = window.turn; dummy.updateMatrix(); instances.setMatrixAt(i, dummy.matrix); instances.setColorAt(i, new THREE.Color(window.color)); });
    instances.instanceMatrix.needsUpdate = true; instances.frustumCulled = false; building.add(instances); neonMaterials.push(mat);
  }

  function addRooftopSign(parent, textType, color) {
    const sign = new THREE.Group();
    const board = addBox(sign, [6.8, 1.5, 0.16], [0, 0, 0], new THREE.MeshBasicMaterial({ color: 0x161c34, transparent: true, opacity: 0.95, toneMapped: false }));
    const trim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(7, 1.65, 0.2)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35 }));
    sign.add(trim);
    const texture = makeStoreSignTexture(textType, color);
    const faceMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6.45, 1.22), faceMat); face.position.z = .086; sign.add(face);
    const rearFace = new THREE.Mesh(new THREE.PlaneGeometry(6.45, 1.22), faceMat); rearFace.position.z = -.086; rearFace.rotation.y = Math.PI; sign.add(rearFace);
    sign.userData.kind = textType;
    parent.add(sign);
    neonMaterials.push(board.material, faceMat);
    return sign;
  }

  function makeStoreSignTexture(label, color) {
    return makeCanvasTexture((ctx, size) => {
      const grad = ctx.createLinearGradient(0, 0, size, size / 2); grad.addColorStop(0, "#101c31"); grad.addColorStop(1, "#222744");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size / 2);
      ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(5, 5, size - 10, size / 2 - 10);
      ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = "#f1f6ff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "900 48px Arial, sans-serif"; ctx.fillText(label, size / 2, size / 4 + 1);
      ctx.shadowBlur = 0; ctx.fillStyle = color; ctx.fillRect(20, size / 2 - 10, size - 40, 2);
    }, 256);
  }

  function addStorefront(parent, w, d, label, color, h) {
    const frontZ = d / 2 + .13;
    const groundY = -h / 2;
    addBox(parent, [w * .87, .5, .18], [0, groundY + .29, frontZ], new THREE.MeshStandardMaterial({ color: 0x26364a, roughness: .48, metalness: .25 }));
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x5e9aac, roughness: .14, metalness: .25, transparent: true, opacity: .64, side: THREE.DoubleSide });
    for (let bay = -1; bay <= 1; bay++) {
      const pane = addBox(parent, [w * .23, 2.05, .055], [bay * w * .27, groundY + 1.43, frontZ + .09], glass);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(.07, 2.1, .08), new THREE.MeshStandardMaterial({ color: 0xe1c6a0, metalness: .32, roughness: .52 })); trim.position.set(bay * w * .27 - w * .125, groundY + 1.43, frontZ + .13); parent.add(trim);
      if (bay === 0) addBox(parent, [w * .13, 1.9, .1], [w * .14, groundY + 1.1, frontZ + .17], new THREE.MeshStandardMaterial({ color: 0x19243b, roughness: .36, metalness: .3 }));
      pane.castShadow = false;
    }
    const signMap = makeStoreSignTexture(label, `#${color.toString(16).padStart(6, "0")}`);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * .78, 7.4), .9), new THREE.MeshBasicMaterial({ map: signMap, toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(0, groundY + 2.85, frontZ + .17); parent.add(sign); neonMaterials.push(sign.material);
    const awning = addBox(parent, [Math.min(w * .9, 9), .15, .85], [0, groundY + 2.35, frontZ + .48], new THREE.MeshStandardMaterial({ color, roughness: .56 }));
    awning.rotation.x = -.08;
    for (let stripe = -4; stripe <= 4; stripe++) {
      addBox(parent, [.045, .17, .84], [stripe * Math.min(w * .9, 9) / 9, groundY + 2.36, frontZ + .49], new THREE.MeshStandardMaterial({ color: stripe % 2 ? 0xf1ead9 : color, roughness: .62 }));
    }
  }

  function buildBuildings() {
    let seed = 1;
    for (let gx = -5; gx < 5; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        // Buildings occupy blocks between roads instead of sitting on top of the road grid.
        const x = (gx + .5) * ROAD_STEP + (rand() - 0.5) * 5;
        const z = (gz + .5) * ROAD_STEP + (rand() - 0.5) * 5;
        const cieloHotel = gx === 2 && gz === -3;
        const mareaHotel = gx === -3 && gz === -3;
        const brandedHotel = cieloHotel || mareaHotel;
        const w = brandedHotel ? 21 : 13 + rand() * 12;
        const d = brandedHotel ? 17 : 13 + rand() * 12;
        const shoreBlock = gz === -3;
        const h = cieloHotel ? 36 : mareaHotel ? 30 : shoreBlock ? 12 + rand() * 17 : 11 + rand() * 30 + (Math.abs(gx + .5) < 2.5 && Math.abs(gz + .5) < 2.5 ? 17 : 0);
        const b = new THREE.Group();
        b.position.set(x, h / 2, z);
        const body = addBox(b, [w, h, d], [0, 0, 0], buildingMaterial(w, h, d), { castShadow: true });
        addWindowBands(b, w, h, d, seed++);
        if (h < 25) addStorefront(b, w, d, pick(["BAY MARKET", "PALM ROOM", "COASTAL CLUB", "SUNSET CAFE", "MOTEL 8", "VANTA" ]), pick([0xff6dbe, 0x7cecff, 0xffd27d, 0xb9ff88]), h);
        if (h > 15 && rand() > .42) {
          const floors = Math.floor(h / 4.2);
          for (let floor = 1; floor < floors; floor++) {
            if (rand() > .58) continue;
            const y = -h / 2 + floor * 4.2; const balconyX = pick([-1, 1]) * w * .26;
            addBox(b, [w * .52, .11, .74], [balconyX, y, d / 2 + .32], new THREE.MeshStandardMaterial({ color: 0x6e8797, metalness: .42, roughness: .34 }));
            addBox(b, [w * .52, .07, .06], [balconyX, y + .43, d / 2 + .68], new THREE.MeshStandardMaterial({ color: 0xc5d8d8, metalness: .74, roughness: .26 }));
            for (let rail = -2; rail <= 2; rail++) addBox(b, [.035,.42,.035], [balconyX + rail * w * .1, y + .22, d / 2 + .68], new THREE.MeshStandardMaterial({ color: 0xc5d8d8, metalness: .74, roughness: .26 }));
          }
          if (rand() > .45) {
            const ac = addBox(b, [1.1,.64,.72], [w / 2 + .34, -h / 2 + 3.5 + rand() * Math.max(1,h-8), (rand() - .5) * d * .65], new THREE.MeshStandardMaterial({ color: 0x8994a0, metalness: .32, roughness: .62 }));
            addBox(b, [.9,.08,.06], [w / 2 + .37, ac.position.y, ac.position.z + .39], new THREE.MeshStandardMaterial({ color: 0x485663, metalness: .5, roughness: .5 }));
          }
        }
        if (h > 38) {
          const trim = new THREE.MeshStandardMaterial({ color: pick([0x89c3c4, 0xd9c2a1, 0x9baecb]), metalness: .46, roughness: .34 });
          for (const side of [-1, 1]) addBox(b, [.16, h * .86, .13], [side * (w / 2 - .42), 0, d / 2 + .1], trim);
          addBox(b, [w + .8, .24, d + .8], [0, h / 2 - .28, 0], trim);
        }
        addBox(b, [w + .35, .22, d + .35], [0, h / 2 - .08, 0], new THREE.MeshStandardMaterial({ color: 0x9ca6af, metalness: .34, roughness: .45 }));
        if (rand() > 0.72) {
          const rooftop = addBox(b, [w * .5, 1.4, d * .5], [0, h / 2 + .7, 0], new THREE.MeshStandardMaterial({ color: 0x151c35, roughness: .7 }));
          rooftop.castShadow = true;
        }
        if (rand() > 0.77) {
          const sign = addRooftopSign(b, pick(["LOUNGE", "HOTEL", "MOTEL", "ARCADE"]), pick([0x7cecff, 0xff6dbe, 0xffd27d]));
          sign.position.set(0, h / 2 + 2.1, d / 2 + .12);
          sign.rotation.y = rand() > .5 ? 0 : Math.PI / 2;
        }
        if (brandedHotel) {
          addBox(b, [w * .72, 2.3, .42], [0, 2.4, -d / 2 - .13], new THREE.MeshStandardMaterial({ color: 0x234052, metalness: .48, roughness: .3 }), { castShadow: true });
          const sign = addRooftopSign(b, cieloHotel ? "CIELO" : "HOTEL", cieloHotel ? 0xffd27d : 0xff6dbe);
          sign.position.set(0, h / 2 + 2.1, -d / 2 - .15); sign.rotation.y = Math.PI; sign.scale.set(1.15, .82, 1);
          if (mareaHotel) { const nameplate = addRooftopSign(b, "MAREA", 0x7cecff); nameplate.position.set(0, 4.2, -d / 2 - .2); nameplate.rotation.y = Math.PI; nameplate.scale.set(.9, .68, 1); }
        }
        cityGroup.add(b);
        buildingColliders.push({ minX: x - w / 2 - 1.3, maxX: x + w / 2 + 1.3, minZ: z - d / 2 - 1.3, maxZ: z + d / 2 + 1.3, minY: 0, maxY: h + 1.2 });
      }
    }
    const skyline = new THREE.Group();
    skyline.position.set(-112, 0, 112);
    const tower = addBox(skyline, [23, 95, 23], [0, 47.5, 0], new THREE.MeshStandardMaterial({ color: 0x1b294a, roughness: .27, metalness: .52 }), { castShadow: true });
    addWindowBands(skyline, 23, 95, 23, 9);
    const cap = addBox(skyline, [27, 1.3, 27], [0, 96, 0], new THREE.MeshBasicMaterial({ color: 0xff6dbe, toneMapped: false }));
    skyline.add(cap); neonMaterials.push(cap.material);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 23, 5), new THREE.MeshBasicMaterial({ color: 0x7cecff, toneMapped: false }));
    spire.position.y = 107; skyline.add(spire); neonMaterials.push(spire.material);
    cityGroup.add(skyline);
  }

  function buildLandmarks() {
    const marina = new THREE.Group(); marina.position.set(92, 0, -124);
    addBox(marina, [56, .32, 20], [0, .2, 0], new THREE.MeshStandardMaterial({ color: 0x7c90a5, roughness: .64 }));
    for (let i = -4; i <= 4; i++) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 6, 7), new THREE.MeshStandardMaterial({ color: 0xced7df, metalness: .6, roughness: .25 }));
      mast.position.set(i * 5.7, 3, -3 + rand() * 5); marina.add(mast);
      const sail = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 3), new THREE.MeshBasicMaterial({ color: pick([0xf6f1e9, 0xff6dbe, 0x7cecff]), transparent: true, opacity: .72 }));
      sail.position.set(i * 5.7, 3.7, -3 + rand() * 5); sail.rotation.x = Math.PI / 2; marina.add(sail);
    }
    const marinaSign = addRooftopSign(marina, "MARINA", 0x7cecff); marinaSign.scale.set(1.2, 1, 1); marinaSign.position.set(0, 3, 8); marinaSign.rotation.y = Math.PI;
    cityGroup.add(marina);

    const club = new THREE.Group(); club.position.set(-92, 0, -90);
    addBox(club, [34, 5, 22], [0, 2.5, 0], new THREE.MeshStandardMaterial({ color: 0x251b42, roughness: .5, metalness: .35 }), { castShadow: true });
    for (let i = -5; i <= 5; i++) addBox(club, [1.2, 3.5, .1], [i * 2.8, 2.9, 11.1], new THREE.MeshBasicMaterial({ color: pick([0xff6dbe, 0x7cecff, 0xffd27d]), toneMapped: false }));
    const clubSign = addRooftopSign(club, "VANTA", 0xff6dbe); clubSign.position.set(0, 6, 0); clubSign.rotation.y = Math.PI / 2; clubSign.scale.set(1.7, 1.3, 1);
    cityGroup.add(club);

    const arch = new THREE.Group(); arch.position.set(0, 0, 105);
    addBox(arch, [5, 18, 5], [-16, 9, 0], new THREE.MeshStandardMaterial({ color: 0x5b7189, metalness: .4, roughness: .42 }), { castShadow: true });
    addBox(arch, [5, 18, 5], [16, 9, 0], new THREE.MeshStandardMaterial({ color: 0x5b7189, metalness: .4, roughness: .42 }), { castShadow: true });
    addBox(arch, [37, 4, 5], [0, 18, 0], new THREE.MeshStandardMaterial({ color: 0x617f96, metalness: .5, roughness: .35 }), { castShadow: true });
    addRooftopSign(arch, "COASTLINE", 0xffd27d).position.set(0, 21, 0);
    cityGroup.add(arch);

    const rescue = new THREE.Group(); rescue.position.set(-106, 0, -151);
    const timber = new THREE.MeshStandardMaterial({ color: 0x875e49, roughness: .84 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0dfc1, roughness: .7 });
    addBox(rescue, [7,.2,5], [0,4,0], timber);
    for (const side of [-1,1]) { addBox(rescue,[.2,4,.2],[side*2.8,2,side*.9],timber); addBox(rescue,[.2,4,.2],[side*2.8,2,-side*.9],timber); }
    addBox(rescue,[6.2,.2,4.5],[0,6.1,0],white);
    addBox(rescue,[8,.28,6],[0,8.15,0],new THREE.MeshStandardMaterial({color:0xff596f,roughness:.56}));
    addBox(rescue,[2.8,1.45,2.5],[0,5,0],new THREE.MeshStandardMaterial({color:0x6ab2c3,metalness:.2,roughness:.22,transparent:true,opacity:.62}));
    for (let step=0;step<7;step++) addBox(rescue,[1.05,.13,.45],[1.6-step*.31,.5+step*.52,2.4-step*.34],timber);
    addRooftopSign(rescue,"LIFEGUARD",0xff6dbe).position.set(0,8.5,3.1);
    cityGroup.add(rescue);

    const umbrellaColors=[0xff6dbe,0x7cecff,0xffd27d,0xf2eee2];
    for(let i=0;i<11;i++){
      const x=-95+i*19; const z=-163+(i%2)*5; const umbrella=new THREE.Group(); umbrella.position.set(x,0,z);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,2.25,8),new THREE.MeshStandardMaterial({color:0xe4d9c9,metalness:.3,roughness:.48})); pole.position.y=1.13; umbrella.add(pole);
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(1.65,.62,10),new THREE.MeshStandardMaterial({color:umbrellaColors[i%umbrellaColors.length],roughness:.7,side:THREE.DoubleSide})); canopy.position.y=2.25; umbrella.add(canopy);
      const lounger=addBox(umbrella,[.78,.13,1.6],[2.3,.3,.3],new THREE.MeshStandardMaterial({color:i%2?0xf0e6d1:0x39a7a8,roughness:.78})); lounger.rotation.x=-.16;
      cityGroup.add(umbrella);
    }
  }

  function makePalm(x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.32, .62, 6.5, 8), new THREE.MeshStandardMaterial({ color: 0x7c5c45, roughness: .9 }));
    trunk.position.y = 3.25; trunk.rotation.z = (rand() - .5) * .12; trunk.castShadow = true; g.add(trunk);
    const leaves = new THREE.Group(); leaves.position.y = 6.45;
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.18, 4.3, 5), new THREE.MeshStandardMaterial({ color: pick([0x2a7968, 0x3c8f72, 0x1d5b5e]), roughness: .9 }));
      leaf.rotation.z = Math.PI / 2.45; leaf.rotation.y = i * Math.PI / 4; leaf.position.set(Math.cos(i * Math.PI / 4) * 1.65, Math.sin(i * Math.PI / 4) * .5, Math.sin(i * Math.PI / 4) * 1.65); leaves.add(leaf);
    }
    g.add(leaves); cityGroup.add(g);
  }

  function buildPalmsAndParks() {
    for (let x = -168; x <= 160; x += 41) {
      makePalm(x, -136, .88 + rand() * .15);
      makePalm(x, -154.5, .82 + rand() * .15);
    }
    for (let i = 0; i < 38; i++) {
      const side = pick([-1, 1]);
      makePalm(side * (145 + rand() * 12), -145 + rand() * 64, .72 + rand() * .45);
    }
    for (let i = 0; i < 26; i++) {
      const x = -140 + rand() * 280; const z = -130 + rand() * 250;
      if (Math.abs(x % ROAD_STEP) < 10 || Math.abs(z % ROAD_STEP) < 10) continue;
      makePalm(x, z, .42 + rand() * .25);
    }
    const park = new THREE.Group(); park.position.set(98, .2, 55);
    addBox(park, [28, .12, 28], [0, 0, 0], new THREE.MeshStandardMaterial({ color: 0x2c6b61, roughness: 1 }));
    for (let i = 0; i < 7; i++) makePalm(98 + (rand() - .5) * 23, 55 + (rand() - .5) * 23, .46);
    cityGroup.add(park);
  }

  function buildStreetFurniture() {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * 72 + ROAD_WIDTH / 2 + 1.7; const z = j * 72 + ROAD_WIDTH / 2 + 1.7;
      const lamp = new THREE.Group(); lamp.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 7, 7), new THREE.MeshStandardMaterial({ color: 0x273650, metalness: .8, roughness: .22 })); pole.position.y = 3.5; lamp.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27d, toneMapped: false })); bulb.position.set(0, 7, 0); lamp.add(bulb);
      const light = new THREE.PointLight(0xffb773, 0.0, 25, 2); light.position.set(0, 6.7, 0); lamp.add(light); streetLights.push(light);
      cityGroup.add(lamp);
    }
    for (let i = -4; i <= 4; i++) {
      const billboard = new THREE.Group(); billboard.position.set(i * 36 + 10, 0, -56);
      addBox(billboard, [10, .18, .18], [0, 9, 0], new THREE.MeshStandardMaterial({ color: 0x3c4b62, metalness: .45 }));
      addBox(billboard, [.18, 9, .18], [-4.5, 4.5, 0], new THREE.MeshStandardMaterial({ color: 0x3c4b62, metalness: .45 }));
      addBox(billboard, [.18, 9, .18], [4.5, 4.5, 0], new THREE.MeshStandardMaterial({ color: 0x3c4b62, metalness: .45 }));
      const face = addBox(billboard, [8.8, 4, .12], [0, 6.6, .1], new THREE.MeshBasicMaterial({ color: pick([0x7cecff, 0xff6dbe, 0x271f56]), toneMapped: false }));
      face.material.transparent = true; face.material.opacity = .86; neonMaterials.push(face.material); cityGroup.add(billboard);
    }
  }

  function buildTrafficSignals() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x27354a, metalness: .78, roughness: .26 });
    for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
      if ((gx + gz) % 2 !== 0) continue;
      const x = gx * 72 - 6.4; const z = gz * 72 - 6.4;
      const group = new THREE.Group(); group.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,4.6,8), poleMat); pole.position.y = 2.3; group.add(pole);
      const arm = addBox(group, [.07,.07,1.2], [0,4.45,-.52], poleMat); arm.rotation.x = -.04;
      const head = addBox(group, [.36,.92,.39], [0,3.82,-1.03], new THREE.MeshStandardMaterial({ color: 0x101827, metalness: .35, roughness: .44 }));
      const red = new THREE.MeshBasicMaterial({ color: 0xff334e, toneMapped: false }); const amber = new THREE.MeshBasicMaterial({ color: 0xffc764, toneMapped: false }); const green = new THREE.MeshBasicMaterial({ color: 0x55ffb0, toneMapped: false });
      const lenses = [red, amber, green].map((mat, index) => {
        const lens = new THREE.Mesh(new THREE.SphereGeometry(.105, 10, 8), mat); lens.position.set(0, 4.1 - index * .28, -1.235); group.add(lens); return lens;
      });
      group.userData.lenses = lenses; group.userData.phase = (gx * 11 + gz * 7) * 3; trafficSignals.push(group); cityGroup.add(group);
    }
  }

  function buildWaterAndSkyline() {
    skyMaterial = new THREE.ShaderMaterial({
      uniforms: { zenith: { value: new THREE.Color(0x78bce8) }, horizon: { value: new THREE.Color(0xffc49b) }, under: { value: new THREE.Color(0xe7a17d) } },
      vertexShader: "varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 under;
varying vec3 vWorldPosition;
void main(){
  float h=normalize(vWorldPosition-cameraPosition).y;
  vec3 col=mix(under,horizon,smoothstep(-0.12,0.04,h));
  col=mix(col,zenith,smoothstep(0.02,0.62,h));
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), skyMaterial); sky.frustumCulled = false; sky.renderOrder = -1000; scene.add(sky);
    const starPositions = [];
    for (let i = 0; i < 460; i++) {
      const phi = rand() * Math.PI * 2; const theta = rand() * Math.PI * .48;
      const radius = 420; starPositions.push(Math.sin(theta) * Math.cos(phi) * radius, Math.cos(theta) * radius, Math.sin(theta) * Math.sin(phi) * radius);
    }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd9edff, size: 1.35, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); scene.add(starField);

    const cloudTexture = makeCanvasTexture((ctx, size) => {
      ctx.clearRect(0, 0, size, size);
      for (let i = 0; i < 9; i++) {
        const x = size * (.2 + rand() * .6); const y = size * (.27 + rand() * .46); const r = size * (.11 + rand() * .16);
        const g = ctx.createRadialGradient(x, y, r * .08, x, y, r);
        g.addColorStop(0, "rgba(255,239,231,.32)"); g.addColorStop(.56, "rgba(218,217,241,.19)"); g.addColorStop(1, "rgba(196,206,238,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    });
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: .62, depthWrite: false, color: 0xffd9c4 }));
      cloud.position.set(-190 + rand() * 380, 48 + rand() * 72, -220 - rand() * 90); cloud.scale.set(58 + rand() * 70, 18 + rand() * 28, 1); cloud.userData.drift = .6 + rand() * .7; scene.add(cloud);
    }
    const cloudSprites = scene.children.filter((obj) => obj.isSprite);
    scene.userData.cloudSprites = cloudSprites;

    // A continuous coastal shelf reaches well past the playable marina, so the horizon
    // reads as open ocean instead of a narrow strip of water behind the beach.
    water = new THREE.Mesh(new THREE.PlaneGeometry(980, 440, 96, 40), new THREE.MeshPhysicalMaterial({ color: 0x14566d, roughness: .23, metalness: .14, clearcoat: .86, clearcoatRoughness: .12 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, .09, -370); scene.add(water);
    const shallows = new THREE.Mesh(new THREE.PlaneGeometry(340, 18), new THREE.MeshStandardMaterial({ color: 0x318c9d, roughness: .24, metalness: .08, transparent: true, opacity: .42, depthWrite: false }));
    shallows.rotation.x = -Math.PI / 2; shallows.position.set(0, .12, -169); scene.add(shallows);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(340, .55), new THREE.MeshBasicMaterial({ color: 0xb3f1ec, transparent: true, opacity: .42, depthWrite: false, toneMapped: false }));
    surf.rotation.x = -Math.PI / 2; surf.position.set(0, .145, -177); scene.add(surf);
    const sunGlow = new THREE.MeshBasicMaterial({ color: 0xffb36b, toneMapped: false, transparent: true, opacity: .95 });
    sunDisc = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 24), sunGlow); sunDisc.position.set(-100, 65, -202); scene.add(sunDisc);
    moonDisc = new THREE.Mesh(new THREE.SphereGeometry(5.6, 24, 18), new THREE.MeshBasicMaterial({ color: 0xc6dcff, toneMapped: false, transparent: true, opacity: 0 })); moonDisc.position.set(110, 76, -210); scene.add(moonDisc);
    for (let i = 0; i < 19; i++) {
      const h = 11 + rand() * 32;
      addBox(scene, [5 + rand() * 8, h, 4 + rand() * 7], [-160 + i * 18, h / 2, -224 - rand() * 12], new THREE.MeshStandardMaterial({ color: 0x202b54, roughness: .85 }));
    }
    const waveMat = new THREE.MeshBasicMaterial({ color: 0x9cecff, transparent: true, opacity: .2, depthWrite: false });
    waveLines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .018, .055), waveMat, 260);
    const dummy = new THREE.Object3D(); waveLines.userData.offsets = [];
    for (let i = 0; i < 260; i++) {
      const x = -475 + rand() * 950; const z = -570 + rand() * 400; const length = 1.5 + rand() * 13;
      dummy.position.set(x, .16 + rand() * .015, z); dummy.scale.set(length, 1, 1); dummy.rotation.y = (rand() - .5) * .25; dummy.updateMatrix(); waveLines.setMatrixAt(i, dummy.matrix); waveLines.userData.offsets.push({ x, z, speed: .6 + rand() * 1.6, phase: rand() * 5, length, angle: dummy.rotation.y });
    }
    scene.add(waveLines);
    const rainGeo = new THREE.BufferGeometry(); const rainVertices = new Float32Array(1100 * 2 * 3);
    for (let i = 0; i < 1100; i++) { const x = (rand() - .5) * 380; const y = rand() * 150; const z = (rand() - .5) * 380; const k = i * 6; rainVertices[k] = x; rainVertices[k + 1] = y; rainVertices[k + 2] = z; rainVertices[k + 3] = x - .15; rainVertices[k + 4] = y - 1.8; rainVertices[k + 5] = z; }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainVertices, 3)); rainStreaks = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaadfff, transparent: true, opacity: .3, depthWrite: false })); rainStreaks.visible = false; scene.add(rainStreaks);
  }

  function createHuman({ role = "civilian", outfit, skinTone, hairTone, seed = rand() }) {
    const police = role === "police";
    const root = new THREE.Group();
    const rig = { body: new THREE.Group(), arms: [], legs: [], bob: 0, role, phase: seed * 9 };
    root.add(rig.body);
    const topColor = police ? 0x172b49 : role === "player" ? 0xf0ece4 : (outfit ?? pick([0x21a6a3, 0xf05d78, 0xe2a54f, 0x465caa, 0xf0eee6, 0x914f81, 0x53a77a]));
    const trouserColor = police ? 0x18253a : role === "player" ? 0x171a20 : pick([0x1c2638, 0x364153, 0x54494a, 0x273746, 0x3d3454]);
    const skin = new THREE.MeshStandardMaterial({ color: skinTone ?? pick([0x754b3c, 0x9b624d, 0xc08466, 0xd7a27f, 0xe0b797]), roughness: .74 });
    const hair = new THREE.MeshStandardMaterial({ color: hairTone ?? pick([0x211a1a, 0x39251d, 0x70482d, 0x171a24]), roughness: .84 });
    const shirt = new THREE.MeshStandardMaterial({ color: topColor, roughness: police ? .72 : .65 });
    const pants = new THREE.MeshStandardMaterial({ color: trouserColor, roughness: .84 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: police ? 0x0c121b : role === "player" ? 0xe7e3dc : pick([0x111722, 0x493933, 0xddd6c8]), roughness: .8 });
    const add = (geometry, material, parent, pos, scale, rot) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...pos); if (scale) mesh.scale.set(...scale); if (rot) mesh.rotation.set(...rot); parent.add(mesh); mesh.castShadow = false; mesh.receiveShadow = false; return mesh;
    };

    // A compact, proportioned full-body rig with a readable silhouette from every direction.
    add(new THREE.CapsuleGeometry(.3, .46, 6, 12), shirt, rig.body, [0, 1.43, 0], [1, 1, .77]);
    add(new THREE.CapsuleGeometry(.095, .16, 4, 8), skin, rig.body, [0, 1.83, 0]);
    add(new THREE.BoxGeometry(.5, .105, .31), new THREE.MeshStandardMaterial({ color: police ? 0x101824 : 0x211d2c, metalness: .24, roughness: .55 }), rig.body, [0, 1.04, 0]);
    add(new THREE.BoxGeometry(.065, .12, .035), new THREE.MeshStandardMaterial({ color: police ? 0xe5bd66 : 0xb8dce0, metalness: .7, roughness: .24 }), rig.body, [0, 1.04, -.18]);

    const headGroup = new THREE.Group(); headGroup.position.set(0, 1.98, 0); rig.body.add(headGroup);
    add(new THREE.SphereGeometry(.195, 18, 14), skin, headGroup, [0, 0, 0], [1, 1.12, .88]);
    add(new THREE.SphereGeometry(.037, 10, 8), skin, headGroup, [-.198, 0, 0]);
    add(new THREE.SphereGeometry(.037, 10, 8), skin, headGroup, [.198, 0, 0]);
    add(new THREE.SphereGeometry(.2, 18, 10, 0, Math.PI * 2, 0, Math.PI * .55), hair, headGroup, [0, .095, .018], [1.02, .94, .96]);
    // Face is aimed toward -Z, matching the driving and walking camera convention.
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: .52 });
    const iris = new THREE.MeshStandardMaterial({ color: police ? 0x27364d : 0x34251d, roughness: .46 });
    for (const side of [-1, 1]) {
      add(new THREE.SphereGeometry(.031, 10, 8), eyeWhite, headGroup, [side * .073, .025, -.16], [1, .78, .46]);
      add(new THREE.SphereGeometry(.016, 8, 6), iris, headGroup, [side * .073, .024, -.178], [1, .9, .55]);
      add(new THREE.BoxGeometry(.075, .018, .026), hair, headGroup, [side * .073, .073, -.162], null, [0, 0, side * -.08]);
    }
    add(new THREE.SphereGeometry(.03, 8, 6), skin, headGroup, [0, -.025, -.18], [.62, .82, .68]);
    add(new THREE.BoxGeometry(.072, .012, .018), new THREE.MeshStandardMaterial({ color: 0x754247, roughness: .7 }), headGroup, [0, -.085, -.164]);

    if (police) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.19, .2, .105, 16), new THREE.MeshStandardMaterial({ color: 0x14243b, roughness: .65 })); cap.position.set(0, 2.18, .008); rig.body.add(cap);
      add(new THREE.BoxGeometry(.24, .035, .105), new THREE.MeshStandardMaterial({ color: 0x182a43, roughness: .58 }), rig.body, [0, 2.15, -.13]);
      add(new THREE.CircleGeometry(.045, 8), new THREE.MeshBasicMaterial({ color: 0xe6bb67, toneMapped: false }), rig.body, [0, 2.18, -.101], [1, 1, 1], [-.12, 0, 0]);
    } else if (role === "player") {
      // Soft high bun, face-framing locks, warm makeup, and fine jewelry.
      add(new THREE.SphereGeometry(.11, 16, 12), hair, headGroup, [0, .205, .025], [1.05, 1.08, .95]);
      add(new THREE.SphereGeometry(.075, 14, 10), new THREE.MeshStandardMaterial({ color: 0x795b40, roughness: .68 }), headGroup, [-.025, .235, .055], [1.1, .62, .68]);
      for (const side of [-1, 1]) {
        add(new THREE.CapsuleGeometry(.034, .14, 5, 8), hair, headGroup, [side * .145, -.012, -.035], [.82, 1, .8], [0, 0, side * -.18]);
        add(new THREE.SphereGeometry(.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd7a087, roughness: .8, transparent: true, opacity: .48 }), headGroup, [side * .11, -.035, -.118], [.8, .55, .38]);
        add(new THREE.SphereGeometry(.035, 9, 7), new THREE.MeshStandardMaterial({ color: 0xdac17f, metalness: .72, roughness: .2 }), headGroup, [side * .203, -.015, .005]);
        add(new THREE.SphereGeometry(.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5d3c2d, roughness: .44 }), headGroup, [side * .073, .024, -.18], [1, .85, .5]);
        add(new THREE.BoxGeometry(.077, .014, .02), new THREE.MeshStandardMaterial({ color: 0x30231f, roughness: .68 }), headGroup, [side * .073, .073, -.163], null, [0, 0, side * -.08]);
      }
      add(new THREE.BoxGeometry(.055, .015, .02), new THREE.MeshStandardMaterial({ color: 0x9b5057, roughness: .65 }), headGroup, [0, -.085, -.164]);
    } else if (seed > .62) {
      add(new THREE.ConeGeometry(.25, .31, 8), new THREE.MeshStandardMaterial({ color: pick([0xefe1c9, 0x26384a, 0xcf6470]), roughness: .86 }), rig.body, [0, 2.2, 0]);
    }

    if (police) {
      const vest = new THREE.Mesh(new THREE.CapsuleGeometry(.315, .39, 5, 10), new THREE.MeshStandardMaterial({ color: 0x243853, roughness: .79 })); vest.position.set(0, 1.45, -.015); vest.scale.set(1, 1, .86); rig.body.add(vest);
      const badgeMat = new THREE.MeshStandardMaterial({ color: 0xf0c567, metalness: .67, roughness: .28 });
      add(new THREE.CircleGeometry(.055, 6), badgeMat, rig.body, [-.16, 1.61, -.285], [1, 1, 1], [-.15, 0, 0]);
      add(new THREE.BoxGeometry(.1, .045, .018), new THREE.MeshStandardMaterial({ color: 0x718aa2, metalness: .5 }), rig.body, [.14, 1.64, -.275]);
      add(new THREE.BoxGeometry(.11, .19, .08), new THREE.MeshStandardMaterial({ color: 0x101c2c, roughness: .68 }), rig.body, [-.23, 1.44, -.26]);
      add(new THREE.BoxGeometry(.12, .12, .1), new THREE.MeshStandardMaterial({ color: 0x111923, metalness: .35, roughness: .62 }), rig.body, [.28, 1.04, -.12]);
      for (const side of [-1, 1]) {
        const patch = new THREE.Mesh(new THREE.CircleGeometry(.09, 8), new THREE.MeshStandardMaterial({ color: 0x7187a0, roughness: .7 })); patch.position.set(side * .285, 1.59, 0); patch.rotation.y = side * Math.PI / 2; rig.body.add(patch);
        add(new THREE.BoxGeometry(.08, .035, .04), badgeMat, rig.body, [side * .28, 1.56, -.02]);
      }
    } else if (role === "player") {
      const jacketMat = new THREE.MeshStandardMaterial({ color: 0x202126, roughness: .68, metalness: .04 });
      add(new THREE.CapsuleGeometry(.32, .47, 5, 12), jacketMat, rig.body, [0, 1.44, .012], [1.03, 1, .87]);
      add(new THREE.BoxGeometry(.13, .42, .045), new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: .74 }), rig.body, [0, 1.43, -.27]);
      const lapelMat = new THREE.MeshStandardMaterial({ color: 0x292a2f, roughness: .72 });
      for (const side of [-1, 1]) add(new THREE.BoxGeometry(.11, .38, .035), lapelMat, rig.body, [side * .12, 1.58, -.292], null, [0, 0, side * -.24]);
      const gold = new THREE.MeshStandardMaterial({ color: 0xd2b16f, metalness: .72, roughness: .26 });
      add(new THREE.TorusGeometry(.085, .009, 6, 20, Math.PI * 1.4), gold, rig.body, [0, 1.76, -.292], [1, .85, 1], [0, 0, Math.PI]);
      add(new THREE.SphereGeometry(.018, 10, 8), gold, rig.body, [0, 1.67, -.3], [.8, 1.2, .7]);
      // Utility pockets, flap seams, snaps, zipper pull and jacket stitching.
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(.105, .12, .035), new THREE.MeshStandardMaterial({ color: 0x303138, roughness: .78 }), rig.body, [side * .185, 1.55, -.252]);
        add(new THREE.BoxGeometry(.112, .028, .042), jacketMat, rig.body, [side * .185, 1.615, -.27]);
        add(new THREE.SphereGeometry(.012, 8, 6), gold, rig.body, [side * .185, 1.61, -.294]);
        add(new THREE.BoxGeometry(.018, .18, .018), gold, rig.body, [side * .065, 1.425, -.3]);
      }
      // Rear yoke and restrained seam lines keep the jacket readable from the follow camera.
      const seamMat = new THREE.MeshStandardMaterial({ color: 0x35363b, roughness: .82 });
      add(new THREE.BoxGeometry(.43, .045, .018), seamMat, rig.body, [0, 1.68, .286]);
      for (const side of [-1, 1]) add(new THREE.BoxGeometry(.012, .31, .012), seamMat, rig.body, [side * .19, 1.47, .292]);
      for (const side of [-1, 1]) {
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(.096, .012, 5, 12), gold);
        cuff.rotation.x = Math.PI / 2; cuff.position.set(side * .3, 1.02, 0); rig.body.add(cuff);
      }
    } else {
      const accessory = rand();
      if (accessory > .72) {
        const pack = new THREE.Mesh(new THREE.BoxGeometry(.36, .42, .13), new THREE.MeshStandardMaterial({ color: pick([0x354a55, 0x574266, 0x30435c]), roughness: .86 })); pack.position.set(0, 1.4, .24); rig.body.add(pack);
      }
      if (accessory < .2) {
        const coat = new THREE.Mesh(new THREE.CapsuleGeometry(.33, .47, 5, 10), new THREE.MeshStandardMaterial({ color: 0xe3d5bd, roughness: .73 })); coat.position.set(0, 1.4, .035); coat.scale.set(1.05, 1.05, .9); rig.body.add(coat);
      }
    }

    const armMat = police ? new THREE.MeshStandardMaterial({ color: 0x172b49, roughness: .72 }) : role === "player" ? new THREE.MeshStandardMaterial({ color: 0x202126, roughness: .68, metalness: .04 }) : shirt;
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * .3, 1.68, 0); rig.body.add(shoulder);
      add(new THREE.CapsuleGeometry(.115, .31, 5, 9), armMat, shoulder, [0, -.22, 0], [1, 1, .92]);
      const elbow = new THREE.Group(); elbow.position.y = -.45; shoulder.add(elbow);
      add(new THREE.CapsuleGeometry(.096, .3, 5, 8), armMat, elbow, [0, -.2, 0], [1, 1, .9]);
      add(new THREE.SphereGeometry(.09, 9, 7), skin, elbow, [0, -.43, -.015], [1, 1, .8]);
      if (police && side < 0) {
        add(new THREE.BoxGeometry(.095, .14, .08), new THREE.MeshStandardMaterial({ color: 0x17212c, metalness: .2 }), shoulder, [-.02, -.1, .12]);
      }
      rig.arms.push({ shoulder, elbow, side });
    }
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * .15, 1.0, 0); rig.body.add(hip);
      add(new THREE.CapsuleGeometry(.135, .37, 5, 9), pants, hip, [0, -.24, 0], [1, 1, .95]);
      if (role === "player") {
        add(new THREE.BoxGeometry(.045, .18, .15), new THREE.MeshStandardMaterial({ color: 0x282c33, roughness: .9 }), hip, [side * .11, -.23, -.012]);
        add(new THREE.BoxGeometry(.052, .03, .16), new THREE.MeshStandardMaterial({ color: 0x343840, roughness: .82 }), hip, [side * .115, -.14, -.018]);
        add(new THREE.SphereGeometry(.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xbda16e, metalness: .62, roughness: .28 }), hip, [side * .14, -.14, -.02]);
      }
      const knee = new THREE.Group(); knee.position.y = -.48; hip.add(knee);
      add(new THREE.CapsuleGeometry(.115, .34, 5, 8), pants, knee, [0, -.21, -.005], [1, 1, .92]);
      add(new THREE.BoxGeometry(.2, .11, .33), shoeMat, knee, [0, -.46, -.075]);
      if (role === "player") {
        add(new THREE.BoxGeometry(.205, .025, .34), new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: .72 }), knee, [0, -.515, -.075]);
        for (let lace = 0; lace < 3; lace++) add(new THREE.BoxGeometry(.09, .009, .012), new THREE.MeshStandardMaterial({ color: 0xf9f7f1, roughness: .62 }), knee, [0, -.425 + lace * .022, -.15 + lace * .045]);
      }
      rig.legs.push({ hip, knee, side });
    }
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(role === "player" ? .48 : .34, 16), new THREE.MeshBasicMaterial({ color: 0x03050d, transparent: true, opacity: .25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .018; root.add(shadow);
    root.userData.rig = rig; root.userData.baseY = 0;
    return root;
  }

  function createHeroCharacter(seed = .33) {
    const hero = createHuman({ role: "player", skinTone: 0xd5a087, hairTone: 0x624632, seed });
    hero.name = "Mara Vale — original player character";
    hero.userData.generatedCharacter = true;
    return hero;
  }

  function animateHuman(actor, stride, time) {
    const rig = actor.userData.rig; if (!rig) return;
    const moving = Math.min(1, stride); const phase = time * (2.3 + moving * 7.6) + rig.phase;
    const swing = Math.sin(phase) * moving;
    rig.arms.forEach(({ shoulder, elbow, side }) => { shoulder.rotation.x = swing * .55 * (side > 0 ? 1 : -1); shoulder.rotation.z = side * (rig.role === "police" ? -.06 : -.035); elbow.rotation.x = Math.max(0, -swing * .28); });
    rig.legs.forEach(({ hip, knee, side }) => { hip.rotation.x = -swing * .58 * (side > 0 ? 1 : -1); knee.rotation.x = Math.max(0, swing * .58 * (side > 0 ? 1 : -1)); });
    rig.body.position.y = moving ? Math.abs(Math.sin(phase * 2)) * .035 * moving : 0;
    rig.body.rotation.z = moving ? Math.sin(phase) * .022 * moving : 0;
  }

  function buildPlayer() {
    player = createHeroCharacter(.33);
    player.position.set(-14, 0, -142); player.rotation.y = Math.PI / 2; player.userData.verticalVelocity = 0; player.userData.grounded = true; player.userData.body = player.userData.rig.body;
    playerShadow = player.children.find((child) => child.isMesh);
    playerShadow.material.opacity = .34; player.add(new THREE.PointLight(0x77e9ff, .15, 3)); scene.add(player);
  }

  function poseHeroArms(mesh) {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;
    const axis = spanZ >= spanX ? "z" : "x";
    const span = Math.max(.0001, axis === "z" ? spanZ : spanX);
    const center = axis === "z" ? (bounds.min.z + bounds.max.z) * .5 : (bounds.min.x + bounds.max.x) * .5;
    const minY = bounds.min.y;
    const spanY = Math.max(.0001, bounds.max.y - minY);
    const pivotY = minY + spanY * .72;
    const pivotOffset = span * .105;
    const smoothStep = (edge0, edge1, value) => {
      const t = clamp((value - edge0) / Math.max(.0001, edge1 - edge0), 0, 1);
      return t * t * (3 - 2 * t);
    };
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i); const y = positions.getY(i); const z = positions.getZ(i);
      const axisValue = axis === "z" ? z : x;
      const signedDistance = axisValue - center;
      const side = Math.sign(signedDistance) || 1;
      const outward = smoothStep(span * .07, span * .31, Math.abs(signedDistance));
      const height = (y - minY) / spanY;
      const shoulderBand = smoothStep(.53, .65, height) * (1 - smoothStep(.83, .94, height));
      const weight = outward * shoulderBand;
      if (weight < .015) continue;
      const angle = side * 1.02 * weight;
      if (axis === "z") {
        const pivotZ = center + side * pivotOffset;
        const dy = y - pivotY; const dz = z - pivotZ;
        const nextY = pivotY + dy * Math.cos(angle) - dz * Math.sin(angle);
        const nextZ = pivotZ + dy * Math.sin(angle) + dz * Math.cos(angle);
        positions.setXYZ(i, x, nextY, nextZ);
      } else {
        const pivotX = center + side * pivotOffset;
        const dx = x - pivotX; const dy = y - pivotY;
        const nextX = pivotX + dx * Math.cos(angle) + dy * Math.sin(angle);
        const nextY = pivotY - dx * Math.sin(angle) + dy * Math.cos(angle);
        positions.setXYZ(i, nextX, nextY, z);
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  }

  function colorizeHeroMesh(mesh) {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions || geometry.getAttribute("color")) return;
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const spanY = Math.max(.0001, geometry.boundingBox.max.y - minY);
    const spanX = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
    const spanZ = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
    const armAxis = spanZ >= spanX ? "z" : "x";
    const armCenter = armAxis === "z" ? (geometry.boundingBox.min.z + geometry.boundingBox.max.z) * .5 : (geometry.boundingBox.min.x + geometry.boundingBox.max.x) * .5;
    const armSpan = Math.max(.0001, armAxis === "z" ? spanZ : spanX);
    const palette = {
      shoes: new THREE.Color(0xe8e5de), trousers: new THREE.Color(0x17191e),
      jacket: new THREE.Color(0x202024), shirt: new THREE.Color(0xe8e2d9),
      skin: new THREE.Color(0xd5a18a), hair: new THREE.Color(0x705543),
    };
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const height = (positions.getY(i) - minY) / spanY;
      const armPosition = Math.abs((armAxis === "z" ? positions.getZ(i) : positions.getX(i)) - armCenter) / armSpan;
      const x = positions.getX(i);
      const backOfHead = height > .82 && x < geometry.boundingBox.min.x + spanX * .38;
      const hand = armPosition > .42 && height > .54 && height < .79;
      const hair = height > .94 || backOfHead;
      const shirt = height > .51 && height < .71 && armPosition < .105;
      const color = height < .072 ? palette.shoes
        : height < .445 ? palette.trousers
        : hand || (height > .79 && !hair) ? palette.skin
        : hair ? palette.hair
        : shirt ? palette.shirt
        : palette.jacket;
      color.toArray(colors, i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const tintMaterial = (material) => {
      const copy = material.clone();
      copy.color.set(0xffffff); copy.vertexColors = true; copy.roughness = .72; copy.metalness = .02; copy.needsUpdate = true;
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tintMaterial) : tintMaterial(mesh.material);
  }

  function addHeroModelDetails(model) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x28282c, roughness: .64 });
    const pocketMat = new THREE.MeshStandardMaterial({ color: 0x303035, roughness: .78 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8b8ad, metalness: .72, roughness: .26 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc6a76d, metalness: .68, roughness: .24 });
    const brown = new THREE.MeshStandardMaterial({ color: 0x725844, roughness: .76 });
    const eye = new THREE.MeshStandardMaterial({ color: 0x392820, roughness: .5 });
    const add = (geometry, material, position, scale, rotation) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (scale) mesh.scale.set(...scale);
      if (rotation) mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
      return mesh;
    };

    // The reference has a high loose bun, dark cropped jacket and utility pockets.
    add(new THREE.SphereGeometry(.085, 16, 12), brown, [-.035, .98, 0], [1.05, 1.12, .92]);
    add(new THREE.SphereGeometry(.062, 12, 10), brown, [-.055, .93, -.035], [1.12, .8, 1.18]);
    // Subtle face details sit on the sculpt's +X-facing side.
    for (const side of [-1, 1]) {
      add(new THREE.SphereGeometry(.012, 8, 6), eye, [.158, .842, side * .036], [1, .82, 1]);
      add(new THREE.BoxGeometry(.018, .012, .038), dark, [.151, .862, side * .037], null, [0, 0, side * -.08]);
      add(new THREE.SphereGeometry(.012, 8, 6), gold, [.01, .805, side * .105], [1, 1.3, 1]);
    }
    // Cropped tee, jacket opening, seam/pocket hints, and a small pendant.
    add(new THREE.BoxGeometry(.012, .27, .012), metal, [.137, .47, 0]);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(.014, .105, .092), pocketMat, [.137, .49, side * .13]);
      add(new THREE.BoxGeometry(.02, .026, .098), dark, [.146, .548, side * .13]);
      add(new THREE.BoxGeometry(.018, .16, .092), pocketMat, [.116, -.28, side * .145]);
      add(new THREE.BoxGeometry(.022, .027, .098), dark, [.126, -.19, side * .145]);
      add(new THREE.BoxGeometry(.24, .045, .16), new THREE.MeshStandardMaterial({ color: 0xe8e5de, roughness: .8 }), [0, -.965, side * .12]);
    }
    const necklace = add(new THREE.TorusGeometry(.056, .0045, 5, 20), gold, [.145, .715, 0]);
    necklace.rotation.y = Math.PI / 2;
    add(new THREE.SphereGeometry(.014, 10, 8), gold, [.156, .67, 0], [1, 1.3, .8]);
    add(new THREE.BoxGeometry(.018, .035, .045), metal, [.15, -.045, 0]);
  }

  function makeSideProfile(points, depth, material, parent, yOffset = 0) {
    const shape = new THREE.Shape(); shape.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => shape.lineTo(x, y)); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .045, bevelThickness: .045 });
    geometry.translate(0, 0, -depth / 2); geometry.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = yOffset; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  function makeGlassPane(points, side, parent) {
    const shape = new THREE.Shape(); shape.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(([x, y]) => shape.lineTo(x, y)); shape.closePath();
    const pane = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshPhysicalMaterial({ color: 0x6f9eb7, roughness: .13, metalness: .32, transparent: true, opacity: .62, side: THREE.DoubleSide }));
    pane.position.x = side * 1.055; pane.position.y += .025; pane.rotation.y = side * Math.PI / 2; parent.add(pane); return pane;
  }

  function makeCarQuad(parent, points, material) {
    const geometry = new THREE.BufferGeometry();
    const verts = new Float32Array(points.flat()); geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
  }

  function createCar({ name = "VAPOR GT", color = 0xff3f7f, police = false, traffic = false }) {
    const car = new THREE.Group();
    car.userData = { isCar: true, name, color, police, traffic, speed: 0, velocity: 0, targetSpeed: 0, heading: 0, active: true, wheels: [], doors: [], siren: null, sirenLights: [], lampCones: [], signalLenses: [] };
    const bodyMat = new THREE.MeshPhysicalMaterial({ color, metalness: .55, roughness: .25, clearcoat: .92, clearcoatRoughness: .18 });
    const profile = [[-2.28,.42],[-2.22,.78],[-1.67,.91],[-1.18,.98],[.92,.98],[1.82,.9],[2.24,.75],[2.3,.46]];
    makeSideProfile(profile, 1.98, bodyMat, car);
    // Sculpted roof, sloped pillars, and independent glass give the cabin real depth.
    const hood = addBox(car, [1.87, .055, 1.1], [0, .984, -1.63], new THREE.MeshStandardMaterial({ color, metalness: .52, roughness: .22 }));
    const roof = addBox(car, [1.72, .12, 1.31], [0, 1.58, -.02], bodyMat); roof.rotation.x = -.025;
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x27475e, roughness: .12, metalness: .25, transparent: true, opacity: .72, side: THREE.DoubleSide });
    makeGlassPane([[-1.07,1.02],[-.68,1.47],[-.38,1.5],[.36,1.5],[.78,1.03]], -1, car);
    makeGlassPane([[-1.07,1.02],[-.68,1.47],[-.38,1.5],[.36,1.5],[.78,1.03]], 1, car);
    for (const side of [-1, 1]) {
      const pillarMat = new THREE.MeshStandardMaterial({ color, metalness: .5, roughness: .26 });
      const aPillar = addBox(car, [.075,.58,.08], [side * .87,1.25,-.76], pillarMat); aPillar.rotation.x = -.55;
      addBox(car, [.065,.51,.07], [side * .91,1.24,.73], pillarMat).rotation.x = .62;
      addBox(car, [.055,.53,.06], [side * .94,1.27,.02], pillarMat);
    }
    // Windshields and rear glass face forward/back, while the side panes stay visible from oblique camera angles.
    makeCarQuad(car, [[-.73,1.08,-1.13],[.73,1.08,-1.13],[.48,1.53,-.67],[-.48,1.53,-.67]], glassMat);
    makeCarQuad(car, [[-.73,1.08,1.13],[.73,1.08,1.13],[.48,1.53,.67],[-.48,1.53,.67]], glassMat);
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(.16, .11, .24), bodyMat); mirror.position.set(side * 1.08, 1.05, -1.08); car.add(mirror);
      const handle = addBox(car, [.035, .06, .2], [side * 1.105, .86, .16], new THREE.MeshStandardMaterial({ color: 0xe3e8ee, metalness: .8, roughness: .26 }));
      const door = new THREE.Group(); door.position.set(side * .99, .83, -.02); car.add(door);
      addBox(door, [.075,.48,1.15], [side * .03,-.02,0], bodyMat);
      addBox(door, [.026,.045,.18], [side * .073,.11,-.34], new THREE.MeshStandardMaterial({ color: 0xe5ebf4, metalness: .75, roughness: .24 }));
      const sill = addBox(car, [.06,.12,1.1], [side * .97,.57,.02], new THREE.MeshStandardMaterial({ color: 0x172131, metalness: .55, roughness: .3 }));
      car.userData.doors.push({ group: door, side, angle: 0 });
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0e15, roughness: .82 });
      for (const z of [-1.38, 1.38]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.405, .405, .28, 18, 1), wheelMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.02, .52, z); wheel.castShadow = true; wheel.userData.front = z < 0; wheel.userData.wheelVisual = true; car.add(wheel); car.userData.wheels.push(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .295, 12), new THREE.MeshStandardMaterial({ color: police ? 0xbcc7d2 : 0xb3d8df, metalness: .85, roughness: .22 })); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); hub.userData.wheelVisual = true; car.add(hub);
        for (let spoke = 0; spoke < 5; spoke++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(.045,.31,.035), new THREE.MeshStandardMaterial({ color: 0xc8d8e4, metalness: .85, roughness: .2 })); bar.position.copy(wheel.position); bar.position.x += side * .155; bar.rotation.x = spoke * Math.PI / 5; bar.rotation.z = Math.PI / 2; bar.userData.wheelVisual = true; car.add(bar); }
      }
      if (police) {
        addBox(car, [.04, .22, 1.3], [side * 1.095, .77, -.02], new THREE.MeshBasicMaterial({ color: 0xd7e8f0, toneMapped: false }));
        const crest = new THREE.Mesh(new THREE.CircleGeometry(.15, 8), new THREE.MeshBasicMaterial({ color: 0xe2be6c, toneMapped: false })); crest.position.set(side * 1.112, .82, .02); crest.rotation.y = side * Math.PI / 2; car.add(crest);
      }
    }
    const headlamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xc9f5ff, emissiveIntensity: .75, roughness: .16 });
    const tailLamp = new THREE.MeshStandardMaterial({ color: 0xff183c, emissive: 0xff102f, emissiveIntensity: 1.3, roughness: .25 });
    for (const side of [-1, 1]) {
      const front = addBox(car, [.47, .21, .07], [side * .64, .77, -2.25], headlamp); front.rotation.y = side * -.12;
      const rear = addBox(car, [.43, .2, .07], [side * .65, .75, 2.24], tailLamp);
      addBox(car, [.36, .14, .055], [side * .35, .55, -2.3], new THREE.MeshStandardMaterial({ color: 0x202838, metalness: .72, roughness: .25 }));
    }
    addBox(car, [1.2, .13, .07], [0, .53, -2.3], new THREE.MeshStandardMaterial({ color: 0x151923, metalness: .55, roughness: .3 }));
    for (let i = -3; i <= 3; i++) addBox(car, [.035, .12, .035], [i * .15, .53, -2.345], new THREE.MeshStandardMaterial({ color: 0x929eaf, metalness: .75 }));
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xd5f8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.65, 10, 18, 1, true), coneMat.clone()); cone.rotation.x = -Math.PI / 2; cone.position.set(side * .58, .65, -6.9); car.add(cone); car.userData.lampCones.push(cone);
    }
    if (police) {
      const bar = new THREE.Group();
      const redMat = new THREE.MeshStandardMaterial({ color: 0xff3158, emissive: 0xff0b35, emissiveIntensity: 1.4, roughness: .18 });
      const blueMat = new THREE.MeshStandardMaterial({ color: 0x5ce9ff, emissive: 0x21caff, emissiveIntensity: 1.4, roughness: .18 });
      const red = addBox(bar, [.43,.17,.32], [-.29,1.78,0], redMat); const blue = addBox(bar, [.43,.17,.32], [.29,1.78,0], blueMat);
      bar.userData.lenses = [red, blue]; car.add(bar); car.userData.siren = bar; car.userData.signalLenses = [red, blue];
      const redLight = new THREE.PointLight(0xff174e, 0, 18, 2); redLight.position.set(-.35,1.85,0); car.add(redLight);
      const blueLight = new THREE.PointLight(0x27cfff, 0, 18, 2); blueLight.position.set(.35,1.85,0); car.add(blueLight);
      car.userData.sirenLights.push(redLight,blueLight);
      for (const side of [-1, 1]) addBox(car, [.07,.16,1.0], [side * 1.11,.78,.05], new THREE.MeshBasicMaterial({ color: 0x7cecff, toneMapped: false }));
    }
    if (name === "VAPOR GT") {
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x161d2c, metalness: .48, roughness: .24 });
      addBox(car, [.12,.42,.12], [-.64,.96,1.88], wingMat); addBox(car, [.12,.42,.12], [.64,.96,1.88], wingMat); addBox(car, [1.85,.09,.34], [0,1.2,1.9], bodyMat);
      const trim = new THREE.MeshStandardMaterial({ color: 0x101722, metalness: .68, roughness: .26 });
      const brightTrim = new THREE.MeshStandardMaterial({ color: 0x86e8e8, metalness: .8, roughness: .2, emissive: 0x16434b, emissiveIntensity: .42 });
      addBox(car, [1.78,.12,.24], [0,.34,-2.19], trim);
      addBox(car, [1.84,.13,.28], [0,.32,2.12], trim);
      addBox(car, [.72,.19,.045], [0,.63,2.285], new THREE.MeshStandardMaterial({ color: 0x111a25, metalness: .5, roughness: .3 }));
      addBox(car, [.74,.045,.035], [0,.81,2.29], tailLamp);
      for (const side of [-1, 1]) {
        addBox(car, [.034,.035,1.08], [side * 1.035,.64,.16], brightTrim);
        addBox(car, [.034,.2,.48], [side * 1.035,.67,1.31], trim);
        addBox(car, [.56,.04,.035], [side * .65,.9,-2.29], headlamp);
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.18,14), trim); exhaust.rotation.z = Math.PI / 2; exhaust.position.set(side * .68,.37,2.24); car.add(exhaust);
      }
    }
    // Every moving car has a driver visible behind the glass; police cars carry uniformed officers.
    if (traffic || police) {
      const driver = createHuman({ role: police ? "police" : "civilian", outfit: pick([0x236b73,0x925462,0x344d70,0xc08a47]), seed: rand() });
      driver.scale.setScalar(.61); driver.position.set(0, .43, .13); car.add(driver); car.userData.driver = driver;
    }
    const seatedPlayer = createHeroCharacter(.51); seatedPlayer.scale.setScalar(.61); seatedPlayer.position.set(0,.43,.13); seatedPlayer.visible = false; car.add(seatedPlayer); car.userData.playerSeat = seatedPlayer;
    const steering = new THREE.Mesh(new THREE.TorusGeometry(.17, .025, 6, 18), new THREE.MeshStandardMaterial({ color: 0x111923, metalness: .45, roughness: .4 })); steering.position.set(0, 1.06, -.61); car.add(steering);
    car.castShadow = true; car.receiveShadow = true;
    cars.push(car); return car;
  }

  function buildTraffic() {
    const colors = [0x43c4d8, 0xffd27d, 0xa77bff, 0x61d07b, 0xf26d7d, 0xeef3f6];
    for (let i = 0; i < 12; i++) {
      const car = createCar({ name: pick(["CIRRUS", "NOVA", "KITE", "PALM SEDAN"]), color: pick(colors), traffic: true });
      const horizontal = i % 2 === 0;
      car.position.set(horizontal ? -160 + rand() * 320 : pick([-72, -36, 0, 36, 72]), .05, horizontal ? pick([-72, -36, 0, 36, 72]) : -150 + rand() * 300);
      const direction = rand() > .5 ? 1 : -1;
      car.userData.axis = horizontal ? "x" : "z"; car.userData.direction = direction;
      car.rotation.y = horizontal ? (direction > 0 ? -Math.PI / 2 : Math.PI / 2) : (direction > 0 ? Math.PI : 0);
      car.userData.trafficSpeed = 5 + rand() * 4; trafficCars.push(car); cityGroup.add(car);
    }
    for (const [x, z, direction] of [[-76,-141,-1],[48,-147,1],[126,-141,-1]]) {
      const car = createCar({ name: pick(["BAY COUPE", "NOVA", "PALM SEDAN"]), color: pick(colors), traffic: true });
      car.position.set(x, .05, z); car.rotation.y = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      car.userData.axis = "x"; car.userData.direction = direction; car.userData.trafficSpeed = 5.6 + rand() * 2.2; trafficCars.push(car); cityGroup.add(car);
    }
    const heroCar = createCar({ name: "VAPOR GT", color: 0x19b9b2 }); heroCar.position.set(-18, 0, -144.5); heroCar.rotation.y = -Math.PI / 2; heroCar.userData.parked = true; cityGroup.add(heroCar);
  }

  function buildPedestrians() {
    for (let i = 0; i < 25; i++) {
      const npc = createHuman({ role: "civilian", seed: rand() });
      const horizontal = i % 2 === 0; const road = pick([-144, -108, -72, -36, 0, 36, 72, 108, 144]);
      const sidewalk = road + pick([-1, 1]) * (ROAD_WIDTH / 2 + 1.5);
      npc.position.set(horizontal ? -151 + rand() * 302 : sidewalk, .02, horizontal ? sidewalk : -151 + rand() * 302);
      npc.userData.walk = { horizontal, lane: sidewalk, direction: rand() > .5 ? 1 : -1, speed: .55 + rand() * .8, phase: rand() * 7 };
      pedestrians.push(npc); cityGroup.add(npc);
    }
    const patrolSpots = [[-17,43],[18,84],[-55,-20],[111,-106]];
    patrolSpots.forEach(([x,z], index) => {
      const officer = createHuman({ role: "police", seed: .17 + index * .21 });
      officer.position.set(x, .02, z); officer.userData.walk = { horizontal: index % 2 === 0, lane: index % 2 === 0 ? z : x, direction: index % 2 ? -1 : 1, speed: .5, phase: index * 1.7 };
      officer.userData.patrolPoint = officer.position.clone(); officers.push(officer); cityGroup.add(officer);
    });
  }

  function buildMissionMarker() {
    missionMarker = new THREE.Group(); missionMarker.position.copy(state.mission.target); missionMarker.position.y = .28;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.8, .12, 8, 36), new THREE.MeshBasicMaterial({ color: 0xff6dbe, toneMapped: false })); ring.rotation.x = -Math.PI / 2; missionMarker.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.28, .7, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff6dbe, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); beam.position.y = 3.5; missionMarker.add(beam);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd27d, toneMapped: false })); beacon.position.y = 6.9; missionMarker.add(beacon);
    cityGroup.add(missionMarker);
  }

  const scoreChords = [
    { pad: [50, 53, 57, 60, 64], bass: 38, arp: [76, 72, 69, 72, 76, 72, 65, 69] },
    { pad: [46, 53, 57, 62, 65], bass: 34, arp: [74, 69, 65, 69, 74, 69, 62, 65] },
    { pad: [41, 48, 52, 57, 60], bass: 29, arp: [72, 69, 64, 69, 72, 67, 60, 64] },
    { pad: [48, 55, 59, 62, 64], bass: 36, arp: [74, 71, 67, 71, 74, 69, 62, 67] },
  ];

  function midiToFrequency(note) { return 440 * 2 ** ((note - 69) / 12); }

  function scheduleMusicVoice(ctx, destination, note, when, duration, kind, volume) {
    const oscillator = ctx.createOscillator(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
    oscillator.type = kind === "pad" ? "triangle" : kind === "bass" ? "sine" : "sine";
    oscillator.frequency.setValueAtTime(midiToFrequency(note), when);
    filter.type = "lowpass"; filter.frequency.setValueAtTime(kind === "pad" ? 1050 : kind === "bass" ? 380 : 2200, when); filter.Q.value = .35;
    gain.gain.setValueAtTime(.0001, when);
    if (kind === "pad") {
      gain.gain.linearRampToValueAtTime(volume, when + .58);
      gain.gain.setValueAtTime(volume, when + duration - .48);
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    } else if (kind === "bass") {
      gain.gain.exponentialRampToValueAtTime(volume, when + .09);
      gain.gain.setValueAtTime(volume * .62, when + duration * .48);
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    } else {
      gain.gain.exponentialRampToValueAtTime(volume, when + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    }
    oscillator.connect(filter).connect(gain).connect(destination);
    oscillator.start(when); oscillator.stop(when + duration + .025);
  }

  function scheduleScoreStep(step, when) {
    const chordIndex = Math.floor(step / 8); const beat = step % 8; const chord = scoreChords[chordIndex];
    if (beat === 0) {
      chord.pad.forEach((note, index) => scheduleMusicVoice(audio.ctx, audio.musicBus, note, when, 3.18, "pad", index === 0 ? .014 : .009));
      scheduleMusicVoice(audio.ctx, audio.musicBus, chord.bass, when, 1.28, "bass", .026);
    }
    if (beat % 2 === 1) scheduleMusicVoice(audio.ctx, audio.musicBus, chord.arp[beat], when, .48, "pluck", .032);
  }

  function initAudio() {
    if (audio) { if (audio.ctx.state === "suspended") audio.ctx.resume(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const master = ctx.createGain(); master.gain.value = .18; master.connect(ctx.destination);
    const musicBus = ctx.createGain(); musicBus.gain.value = .68; musicBus.connect(master);
    const music = { step: 0, stepDuration: 60 / 82 / 2, nextTime: ctx.currentTime + .12 };
    const backgroundMusic = new Audio(backgroundMusicUrl); backgroundMusic.loop = true; backgroundMusic.preload = "auto"; backgroundMusic.volume = .9;
    const backgroundMusicSource = ctx.createMediaElementSource(backgroundMusic); backgroundMusicSource.connect(musicBus);
    const ambience = ctx.createGain(); ambience.gain.value = .035; ambience.connect(master);
    const pad = ctx.createOscillator(); pad.type = "sine"; pad.frequency.value = 98; pad.connect(ambience); pad.start();
    const shimmer = ctx.createOscillator(); shimmer.type = "triangle"; shimmer.frequency.value = 196; const shimmerGain = ctx.createGain(); shimmerGain.gain.value = .12; shimmer.connect(shimmerGain).connect(ambience); shimmer.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .18;
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true; const low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 460; const waveGain = ctx.createGain(); waveGain.gain.value = .035; noise.connect(low).connect(waveGain).connect(master); noise.start();
    const rainNoise = ctx.createBufferSource(); rainNoise.buffer = buffer; rainNoise.loop = true; const rainFilter = ctx.createBiquadFilter(); rainFilter.type = "highpass"; rainFilter.frequency.value = 1400; const rainGain = ctx.createGain(); rainGain.gain.value = 0; rainNoise.connect(rainFilter).connect(rainGain).connect(master); rainNoise.start();
    const engine = ctx.createOscillator(); engine.type = "sawtooth"; engine.frequency.value = 72; const engineGain = ctx.createGain(); engineGain.gain.value = 0; engine.connect(engineGain).connect(master); engine.start();
    const siren = ctx.createOscillator(); siren.type = "square"; siren.frequency.value = 530; const sirenGain = ctx.createGain(); sirenGain.gain.value = 0; siren.connect(sirenGain).connect(master); siren.start();
    audio = { ctx, master, musicBus, music, backgroundMusic, musicFallback: false, ambience, pad, shimmer, waveGain, engine, engineGain, siren, sirenGain, rainGain, enabled: true };
    backgroundMusic.addEventListener("error", () => { if (audio) audio.musicFallback = true; });
  }

  function startBackgroundMusic() {
    if (!audio || !audio.enabled) return;
    if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
    audio.backgroundMusic.play().catch(() => {});
  }

  function blip(type = "ui") {
    if (!audio || !audio.enabled) return;
    const osc = audio.ctx.createOscillator(); const gain = audio.ctx.createGain(); osc.type = type === "alert" ? "square" : "sine";
    osc.frequency.value = type === "alert" ? 210 : type === "success" ? 620 : type === "footstep" ? 92 : 340; gain.gain.setValueAtTime(type === "footstep" ? .028 : .07, audio.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.ctx.currentTime + (type === "footstep" ? .075 : .18)); osc.connect(gain).connect(audio.master); osc.start(); osc.stop(audio.ctx.currentTime + .2);
  }

  function playHorn() {
    if (!audio || !audio.enabled) return;
    const now = audio.ctx.currentTime;
    for (const frequency of [362, 448]) {
      const osc = audio.ctx.createOscillator(); const gain = audio.ctx.createGain(); osc.type = "sawtooth"; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, now); gain.gain.linearRampToValueAtTime(.13, now + .035); gain.gain.setValueAtTime(.13, now + .36); gain.gain.exponentialRampToValueAtTime(.0001, now + .52);
      const filter = audio.ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1050; osc.connect(filter).connect(gain).connect(audio.master); osc.start(now); osc.stop(now + .54);
    }
  }

  function updateAudio() {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const speed = state.playerCar ? Math.abs(state.playerCar.userData.speed) : 0;
    audio.engine.frequency.setTargetAtTime(65 + speed * 14, now, .08);
    audio.engineGain.gain.setTargetAtTime(state.playerInCar ? .045 + speed * .005 : 0, now, .12);
    const sirenLevel = state.wanted > 0 ? .018 : 0;
    audio.siren.frequency.setTargetAtTime(480 + Math.sin(performance.now() * .005) * 160, now, .03);
    audio.sirenGain.gain.setTargetAtTime(sirenLevel, now, .1);
    audio.rainGain.gain.setTargetAtTime(state.raining ? .028 : 0, now, .4);
    audio.pad.frequency.setTargetAtTime(state.clockHours > 18 || state.clockHours < 6 ? 82 : 98, now, .5);
    if (audio.musicFallback) {
      const music = audio.music;
      if (now - music.nextTime > music.stepDuration * 3) { music.step = 0; music.nextTime = now + .08; }
      while (music.nextTime < now + .14) {
        scheduleScoreStep(music.step, music.nextTime);
        music.step = (music.step + 1) % 32;
        music.nextTime += music.stepDuration;
      }
    }
  }

  function acceptMission() {
    if (state.mission.active) return;
    if (state.mission.complete) { state.mission.index = (state.mission.index + 1) % missionCatalog.length; state.mission.complete = false; }
    const job = missionCatalog[state.mission.index]; state.mission.target.copy(job.target); missionMarker.position.set(job.target.x,.28,job.target.z);
    state.mission.active = true; state.mission.elapsed = 0; state.wanted = Math.max(1, state.wanted); state.wantedCooldown = 0;
    missionMarker.visible = true; blip("alert"); showToast(`JOB ACCEPTED // ${job.destination}`); updateMissionUI();
  }

  function completeMission() {
    const job = missionCatalog[state.mission.index];
    state.mission.active = false; state.mission.complete = true; state.cash += job.reward; state.wanted = 0; state.wantedCooldown = 0; missionMarker.visible = false; blip("success"); showToast(`DELIVERY COMPLETE // +$${job.reward.toLocaleString("en-US")}`); updateMissionUI();
  }

  function updateMissionUI() {
    const job = missionCatalog[state.mission.index];
    if (state.mission.complete) {
      $("mission-status").textContent = "DELIVERY COMPLETE"; $("mission-title").textContent = "RUN COMPLETE"; $("mission-copy").textContent = "The city has another contract ready when you are."; $("mission-objective").textContent = "Press J for the next job"; $("mission-reward").textContent = `+$${job.reward.toLocaleString("en-US")}`; $("mission-progress-fill").style.width = "100%"; return;
    }
    if (state.mission.active) {
      $("mission-status").textContent = `ACTIVE JOB ${state.mission.index + 1}/${missionCatalog.length}`; $("mission-title").textContent = job.title; $("mission-copy").textContent = job.copy; $("mission-objective").textContent = `Reach ${job.destination} // ${Math.max(0, job.limit - Math.floor(state.mission.elapsed))}s`; $("mission-reward").textContent = `+$${job.reward.toLocaleString("en-US")}`; return;
    }
    $("mission-status").textContent = `AVAILABLE JOB ${state.mission.index + 1}/${missionCatalog.length}`; $("mission-title").textContent = job.title; $("mission-copy").textContent = job.copy; $("mission-objective").textContent = "Press J to accept"; $("mission-reward").textContent = `+$${job.reward.toLocaleString("en-US")}`; $("mission-progress-fill").style.width = "0%";
  }

  function setWanted(level) {
    const next = clamp(Math.round(level), 0, 5);
    if (next !== state.wanted) blip(next > state.wanted ? "alert" : "ui");
    state.wanted = next; state.wantedCooldown = 0;
  }

  function updateWanted(dt) {
    if (state.wanted === 0) return;
    const nearPolice = policeCars.some((car) => car.visible && car.position.distanceTo(getPlayerPosition()) < 32);
    if (!nearPolice && !state.mission.active) state.wantedCooldown += dt;
    if (state.wantedCooldown > 24 && !state.mission.active) setWanted(state.wanted - 1);
    ensurePolice();
  }

  function ensurePolice() {
    for (let i = policeCars.length; i < state.wanted; i++) {
      const car = createCar({ name: "POLICE INTERCEPTOR", color: 0x1a2a4b, police: true });
      const arrestingOfficer = createHuman({ role: "police", seed: .41 + i * .17 });
      arrestingOfficer.visible = false;
      car.userData.arrestOfficer = arrestingOfficer;
      car.userData.officerState = "inside";
      cityGroup.add(car, arrestingOfficer); policeCars.push(car);
    }
    policeCars.forEach((car, index) => {
      car.visible = index < state.wanted;
      if (car.visible && !car.userData.hasSpawned) {
        const p = getPlayerPosition(); const angle = Math.PI * 2 * (index / Math.max(1, state.wanted)) + .8; car.position.set(p.x + Math.cos(angle) * 42, .05, p.z + Math.sin(angle) * 42); car.userData.hasSpawned = true; car.userData.speed = 0; car.userData.officerState = "inside";
        if (car.userData.arrestOfficer) car.userData.arrestOfficer.visible = false;
        if (car.userData.driver) car.userData.driver.visible = true;
      }
      if (!car.visible) {
        car.userData.hasSpawned = false;
        car.userData.officerState = "inside";
        if (car.userData.arrestOfficer) car.userData.arrestOfficer.visible = false;
        if (car.userData.driver) car.userData.driver.visible = true;
      }
    });
  }

  function getPlayerPosition() { return state.playerCar ? state.playerCar.position : player.position; }

  function resolveCollisions(pos, radius = 1, options = {}) {
    const { skipBuildings = false, allowSea = false } = options;
    let collided = false;
    pos.x = clamp(pos.x, -CITY_HALF + 4, CITY_HALF - 4); pos.z = clamp(pos.z, allowSea ? -226 : -CITY_HALF + 4, CITY_HALF - 4);
    if (skipBuildings) return false;
    for (const b of buildingColliders) {
      if (pos.x > b.minX - radius && pos.x < b.maxX + radius && pos.z > b.minZ - radius && pos.z < b.maxZ + radius) {
        collided = true;
        const pushX = Math.min(Math.abs(pos.x - (b.minX - radius)), Math.abs((b.maxX + radius) - pos.x));
        const pushZ = Math.min(Math.abs(pos.z - (b.minZ - radius)), Math.abs((b.maxZ + radius) - pos.z));
        if (pushX < pushZ) pos.x = pos.x < (b.minX + b.maxX) / 2 ? b.minX - radius : b.maxX + radius;
        else pos.z = pos.z < (b.minZ + b.maxZ) / 2 ? b.minZ - radius : b.maxZ + radius;
      }
    }
    return collided;
  }

  function moveOnFoot(dt) {
    const forward = (state.keys.w || state.keys.arrowup ? 1 : 0) - (state.keys.s || state.keys.arrowdown ? 1 : 0);
    const strafe = (state.keys.d || state.keys.arrowright ? 1 : 0) - (state.keys.a || state.keys.arrowleft ? 1 : 0);
    const input = V(strafe, 0, forward);
    if (input.lengthSq() > 0) {
      input.normalize();
      // Three.js characters face local -Z. Build the basis from the camera yaw
      // so Up always follows the character's view, including the default heading.
      const facing = V(Math.sin(state.mouseYaw), 0, -Math.cos(state.mouseYaw));
      const right = V(Math.cos(state.mouseYaw), 0, Math.sin(state.mouseYaw));
      const worldMove = right.multiplyScalar(input.x).addScaledVector(facing, input.z).normalize();
      const speed = state.keys.shift ? 10.5 : 5.2;
      player.position.addScaledVector(worldMove, speed * dt);
      player.rotation.y = Math.atan2(-worldMove.x, -worldMove.z);
    }
    if (state.keys.space && !state.keys._space && player.userData.grounded) { player.userData.verticalVelocity = 7.2; player.userData.grounded = false; blip("ui"); }
    state.keys._space = state.keys.space;
    player.userData.verticalVelocity -= 18 * dt; player.position.y += player.userData.verticalVelocity * dt;
    if (player.position.y <= 0) { player.position.y = 0; player.userData.verticalVelocity = 0; player.userData.grounded = true; }
    resolveCollisions(player.position, 1.25);
    animateHuman(player, input.lengthSq() > 0 ? (state.keys.shift ? 1 : .6) : 0, performance.now() * .001);
    const now = performance.now();
    if (input.lengthSq() > 0 && player.userData.grounded && now - state.lastFootstepAt > (state.keys.shift ? 285 : 410)) { state.lastFootstepAt = now; blip("footstep"); }
  }

  function spawnBloodEffect(position) {
    bloodDropGeometry ??= new THREE.SphereGeometry(.052, 7, 5);
    bloodPoolGeometry ??= new THREE.CircleGeometry(.34, 16);
    const group = new THREE.Group();
    const drops = [];
    const dropMaterial = new THREE.MeshBasicMaterial({ color: 0xa51f32, transparent: true, opacity: .92, depthWrite: false, toneMapped: false });
    const poolMaterial = new THREE.MeshBasicMaterial({ color: 0x791626, transparent: true, opacity: .48, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const pool = new THREE.Mesh(bloodPoolGeometry, poolMaterial);
    pool.rotation.x = -Math.PI / 2; pool.position.copy(position); pool.position.y = .035; group.add(pool);
    for (let i = 0; i < 9; i++) {
      const drop = new THREE.Mesh(bloodDropGeometry, dropMaterial);
      drop.position.copy(position); drop.position.y += .45 + Math.random() * .45;
      drop.scale.set(.72, 1.35, .72);
      drop.userData.velocity = V((Math.random() - .5) * 2.7, .7 + Math.random() * 2.1, (Math.random() - .5) * 2.7);
      group.add(drop); drops.push(drop);
    }
    scene.add(group); bloodEffects.push({ group, drops, dropMaterial, poolMaterial, pool, age: 0 });
  }

  function updateBloodEffects(dt) {
    for (let i = bloodEffects.length - 1; i >= 0; i--) {
      const effect = bloodEffects[i]; effect.age += dt;
      for (const drop of effect.drops) {
        if (drop.position.y <= .055) continue;
        drop.userData.velocity.y -= 5.2 * dt;
        drop.position.addScaledVector(drop.userData.velocity, dt);
        if (drop.position.y < .055) { drop.position.y = .055; drop.userData.velocity.set(0, 0, 0); }
      }
      effect.dropMaterial.opacity = Math.max(0, 1 - effect.age / 1.3);
      effect.poolMaterial.opacity = .48 * Math.max(0, 1 - effect.age / 2.4);
      effect.pool.scale.setScalar(1 + Math.min(effect.age, 1) * .2);
      if (effect.age >= 2.4) {
        scene.remove(effect.group); effect.dropMaterial.dispose(); effect.poolMaterial.dispose(); bloodEffects.splice(i, 1);
      }
    }
  }

  function hitPedestriansWithCar(car) {
    if (Math.abs(car.userData.speed) < 4.2 || car.position.y > 2.8) return;
    let hitCount = 0;
    const hit = (npc) => {
      if (npc.userData.dead) return;
      const dx = npc.position.x - car.position.x; const dz = npc.position.z - car.position.z;
      if (dx * dx + dz * dz > 4.8) return;
      npc.userData.dead = true;
      npc.position.y = .02;
      const rig = npc.userData.rig;
      if (rig) { rig.body.position.y = .025; rig.body.rotation.z = dx >= 0 ? -Math.PI / 2 : Math.PI / 2; }
      const shadow = npc.children.find((child) => child.isMesh);
      if (shadow) shadow.visible = false;
      spawnBloodEffect(npc.position);
      hitCount++;
    };
    pedestrians.forEach(hit); officers.forEach(hit);
    if (hitCount) {
      setWanted(Math.min(5, state.wanted + hitCount));
      if (performance.now() - lastPedestrianToastAt > 1300) {
        lastPedestrianToastAt = performance.now(); showToast("PEDESTRIAN STRUCK // POLICE ALERT");
      }
    }
  }

  function drivePlayer(dt) {
    const car = state.playerCar; if (!car) return;
    const input = (state.keys.w || state.keys.arrowup ? 1 : 0) - (state.keys.s || state.keys.arrowdown ? .72 : 0);
    const handbrake = state.keys.space && !state.flightMode;
    const maxSpeed = 26;
    if (input !== 0) car.userData.speed += input * (input > 0 ? 15 : 19) * dt;
    else car.userData.speed *= Math.pow(.985, dt * 60);
    if (handbrake) car.userData.speed *= Math.pow(.93, dt * 60);
    car.userData.speed = clamp(car.userData.speed, -10, maxSpeed);
    const steer = (state.keys.d || state.keys.arrowright ? 1 : 0) - (state.keys.a || state.keys.arrowleft ? 1 : 0);
    const steerAmount = (0.45 + Math.min(Math.abs(car.userData.speed) / 16, 1) * .85) * dt;
    car.rotation.y -= steer * steerAmount * (car.userData.speed >= 0 ? 1 : -1);
    const forward = V(-Math.sin(car.rotation.y), 0, -Math.cos(car.rotation.y));
    car.position.addScaledVector(forward, car.userData.speed * dt);
    if (!state.seaways && !state.flightMode && car.position.z < -158) {
      car.position.z = -158; car.userData.speed *= -.18;
      if (performance.now() - state.coastWarningAt > 2500) { state.coastWarningAt = performance.now(); showToast("THE SURF IS DEEP // TYPE SEAWAYS TO FLOAT"); }
    }
    const inWater = state.seaways && car.position.z < -177 && car.position.z > -229 && Math.abs(car.position.x) < 206;
    if (state.flightMode) {
      const lift = (state.keys.space ? 1 : state.keys.shift ? -1 : 0);
      car.userData.flightVelocity = clamp((car.userData.flightVelocity || 0) + (lift * 54 - (car.userData.flightVelocity || 0) * 1.7) * dt, -24, 34);
      car.position.y = clamp(Math.max(1.45, car.position.y) + car.userData.flightVelocity * dt, 1.45, 420);
      if (car.position.y >= 420 && car.userData.flightVelocity > 0) car.userData.flightVelocity = 0;
      if (car.position.y <= 1.45 && car.userData.flightVelocity < 0) car.userData.flightVelocity = 0;
    } else {
      car.userData.flightVelocity = 0;
      car.position.y = inWater ? .27 + Math.sin(performance.now() * .002 + car.position.x) * .055 : 0;
    }
    const attitudeTime = performance.now() * .001;
    const targetPitch = state.flightMode ? clamp(-input * .012, -.16, .16) : inWater ? Math.sin(attitudeTime * 1.2 + car.position.x) * .025 : 0;
    const targetRoll = state.flightMode ? clamp(-steer * .12, -.18, .18) : inWater ? Math.sin(attitudeTime + car.position.z) * .02 : 0;
    car.rotation.x += (targetPitch - car.rotation.x) * Math.min(1, dt * 3.2);
    car.rotation.z += (targetRoll - car.rotation.z) * Math.min(1, dt * 3.2);
    car.traverse((part) => { if (part.userData.wheelVisual) part.visible = !inWater && !state.flightMode; });
    const airborne = state.flightMode && car.position.y > 2.8;
    let crash = resolveCollisions(car.position, 1.55, { skipBuildings: airborne || inWater, allowSea: state.seaways || airborne });
    for (const other of (airborne || inWater ? [] : cars)) {
      if (other === car || !other.visible) continue;
      if (other.position.distanceTo(car.position) < 2.55) {
        crash = true; const push = V(car.position.x-other.position.x,0,car.position.z-other.position.z).normalize(); car.position.addScaledVector(push,.38);
      }
    }
    if (!airborne && !inWater) hitPedestriansWithCar(car);
    if (crash) car.userData.speed *= -.16;
    car.userData.wheels.forEach((wheel) => { wheel.rotation.x -= car.userData.speed * dt * 1.9; if (wheel.userData.front) wheel.rotation.y = -steer * .3; });
    if (state.keys.h && !state.keys._h) { playHorn(); showToast("HORN // THE CITY HEARD YOU"); }
    state.keys._h = state.keys.h;
  }

  function arrestPlayer() {
    if (state.arrested || state.wanted === 0) return;
    const missedJob = state.mission.active;
    const arrestedCar = state.playerCar;
    const caughtAt = getPlayerPosition().clone();
    state.arrested = true; state.paused = false; state.mapOpen = false;
    state.keys = Object.create(null); state.wanted = 0; state.wantedCooldown = 0;
    state.health = 100; state.flightMode = false; state.seaways = false;
    if (arrestedCar) {
      arrestedCar.userData.speed = 0; arrestedCar.userData.flightVelocity = 0;
      arrestedCar.userData.playerSeat.visible = false;
      if (arrestedCar.userData.driver) arrestedCar.userData.driver.visible = true;
      const side = V(Math.cos(arrestedCar.rotation.y), 0, -Math.sin(arrestedCar.rotation.y));
      player.position.copy(caughtAt).addScaledVector(side, 2.1); player.rotation.y = arrestedCar.rotation.y;
      state.playerInCar = false; state.playerCar = null; state.mouseYaw = -player.rotation.y;
    } else player.position.copy(caughtAt);
    player.position.y = 0; player.visible = true;
    resolveCollisions(player.position, 1.25);
    if (missedJob) { state.mission.active = false; state.mission.complete = false; state.mission.elapsed = 0; updateMissionUI(); }
    ensurePolice(); updateHUD(); updateCamera(1);
    $("arrest-copy").textContent = missedJob ? "You were caught before finishing the job. Your wanted level has been cleared." : "You were caught by Suncoast Police. Your wanted level has been cleared.";
    $("arrest-overlay").classList.remove("hidden");
    blip("alert"); $("arrest-return-btn").focus?.();
  }

  function returnFromArrest() {
    if (!state.arrested) return;
    state.arrested = false; $("arrest-overlay").classList.add("hidden");
    updateHUD(); updateCamera(1); showToast("RELEASED // WANTED LEVEL CLEARED");
    canvas.focus?.();
  }

  function updatePolice(dt) {
    const target = getPlayerPosition();
    policeCars.forEach((car, index) => {
      if (!car.visible) return;
      const delta = V(target.x - car.position.x, 0, target.z - car.position.z);
      const distance = delta.length();
      const targetYaw = Math.atan2(-delta.x, -delta.z);
      const diff = wrapAngle(targetYaw - car.rotation.y);
      car.rotation.y += clamp(diff, -1.55 * dt, 1.55 * dt);
      const officer = car.userData.arrestOfficer;
      const officerOnFoot = car.userData.officerState === "approaching";
      const desired = officerOnFoot ? 0 : distance < 8.5 ? 0 : distance < 17 ? 4.6 : clamp(9 + state.wanted * 2.4 + (distance > 40 ? 4 : 0), 0, 24);
      car.userData.speed += (desired - car.userData.speed) * Math.min(1, dt * (distance < 20 ? 3.5 : 1.3));
      const forward = V(-Math.sin(car.rotation.y), 0, -Math.cos(car.rotation.y)); car.position.addScaledVector(forward, car.userData.speed * dt);
      resolveCollisions(car.position, 1.5); car.userData.wheels.forEach((wheel) => { wheel.rotation.x -= car.userData.speed * dt * 1.5; });
      if (car.userData.siren) {
        const flash = Math.sin(performance.now() * .018 + index * .7);
        car.userData.siren.rotation.y = flash * .08;
        car.userData.signalLenses[0].material.emissiveIntensity = flash > 0 ? 2.2 : .42;
        car.userData.signalLenses[1].material.emissiveIntensity = flash > 0 ? .42 : 2.2;
        car.userData.sirenLights[0].intensity = flash > 0 ? 3.2 : .05;
        car.userData.sirenLights[1].intensity = flash > 0 ? .05 : 3.2;
      }
      const finalTarget = getPlayerPosition();
      const finalDistance = Math.hypot(finalTarget.x - car.position.x, finalTarget.z - car.position.z);
      if (!officerOnFoot && state.wanted > 0 && officer && finalDistance < 10.5 && Math.abs(car.userData.speed) < 1.3) {
        car.userData.speed = 0;
        car.userData.officerState = "approaching";
        if (car.userData.driver) car.userData.driver.visible = false;
        const side = V(Math.cos(car.rotation.y), 0, -Math.sin(car.rotation.y));
        officer.position.copy(car.position).addScaledVector(side, 1.85);
        officer.position.y = .02;
        officer.rotation.y = Math.atan2(-(finalTarget.x - officer.position.x), -(finalTarget.z - officer.position.z));
        officer.visible = true;
      }
      if (car.userData.officerState === "approaching" && officer?.visible) {
        const approach = V(finalTarget.x - officer.position.x, 0, finalTarget.z - officer.position.z);
        const footDistance = approach.length();
        if (footDistance > .82) {
          approach.normalize();
          officer.position.addScaledVector(approach, Math.min(footDistance - .82, 5.4 * dt));
          officer.rotation.y = Math.atan2(-approach.x, -approach.z);
          animateHuman(officer, 1, performance.now() * .001);
        } else animateHuman(officer, .04, performance.now() * .001);

        const playerCanBeStopped = !state.playerInCar || Math.abs(state.playerCar.userData.speed) < 1.25;
        const verticalTouch = Math.abs(finalTarget.y - officer.position.y) < 2.25;
        if (footDistance <= 1.02 && verticalTouch && playerCanBeStopped) { arrestPlayer(); return; }
      }
    });
  }

  function updateTraffic(dt) {
    trafficCars.forEach((car) => {
      if (car === state.playerCar || !car.userData.traffic) return;
      const axis = car.userData.axis; const amount = car.userData.trafficSpeed * car.userData.direction * dt;
      if (axis === "x") car.position.x += amount; else car.position.z += amount;
      if (car.position.x > 170) car.position.x = -170; if (car.position.x < -170) car.position.x = 170;
      if (car.position.z > 170) car.position.z = -170; if (car.position.z < -170) car.position.z = 170;
      car.userData.wheels.forEach((wheel) => { wheel.rotation.x -= car.userData.trafficSpeed * dt * 1.1; });
    });
  }

  function updatePedestrians(dt) {
    pedestrians.forEach((npc) => {
      if (npc.userData.dead) return;
      const u = npc.userData.walk; const amount = u.speed * u.direction * dt;
      if (u.horizontal) npc.position.x += amount; else npc.position.z += amount;
      if (npc.position.x > 153) npc.position.x = -153; if (npc.position.x < -153) npc.position.x = 153;
      if (npc.position.z > 153) npc.position.z = -153; if (npc.position.z < -153) npc.position.z = 153;
      npc.position.y = .02 + Math.abs(Math.sin(performance.now() * .006 + u.phase)) * .018;
      npc.rotation.y = u.horizontal ? (u.direction > 0 ? -Math.PI / 2 : Math.PI / 2) : (u.direction > 0 ? Math.PI : 0);
      const nearCar = state.playerInCar && npc.position.distanceTo(getPlayerPosition()) < 8;
      if (nearCar) { u.direction = u.horizontal ? (getPlayerPosition().x > npc.position.x ? -1 : 1) : (getPlayerPosition().z > npc.position.z ? -1 : 1); u.speed = 2.2; }
      else u.speed = Math.min(u.speed + dt * .5, u.baseSpeed ?? 1.25);
      animateHuman(npc, Math.min(1, u.speed / 3), performance.now() * .001);
    });
    officers.forEach((officer) => {
      if (officer.userData.dead) return;
      const u = officer.userData.walk;
      const amount = u.speed * u.direction * dt;
      if (u.horizontal) officer.position.x += amount; else officer.position.z += amount;
      if (officer.position.distanceTo(officer.userData.patrolPoint) > 7) u.direction *= -1;
      officer.rotation.y = u.horizontal ? (u.direction > 0 ? -Math.PI / 2 : Math.PI / 2) : (u.direction > 0 ? Math.PI : 0);
      animateHuman(officer, .28, performance.now() * .001);
    });
  }

  function updateMission(dt) {
    if (state.mission.active) {
      state.mission.elapsed += dt;
      const job = missionCatalog[state.mission.index];
      const distance = getPlayerPosition().distanceTo(state.mission.target);
      const progress = clamp(1 - distance / 180, 0, 1); $("mission-progress-fill").style.width = `${progress * 100}%`;
      const remaining = Math.max(0, job.limit - Math.floor(state.mission.elapsed));
      if (Math.floor(state.mission.elapsed) !== state.mission.lastShownSecond) { state.mission.lastShownSecond = Math.floor(state.mission.elapsed); $("mission-objective").textContent = `Reach ${job.destination} // ${remaining}s`; }
      if (distance < 8) completeMission();
      else if (state.mission.elapsed > job.limit) { state.mission.active = false; state.wanted = 0; state.mission.complete = false; showToast("DELIVERY MISSED // JOB LOST"); updateMissionUI(); }
    }
    if (missionMarker) { missionMarker.rotation.y += dt * .65; missionMarker.position.y = .25 + Math.sin(performance.now() * .003) * .1; }
  }

  function toggleDayNight() {
    const currentOrTargetTime = state.timeTarget ?? state.clockHours;
    const daytime = currentOrTargetTime >= 6 && currentOrTargetTime < 18;
    state.timeTarget = daytime ? 20.4 : 12.3;
    showToast(daytime ? "NIGHTFALL // LIGHTS COMING ON" : "DAYBREAK // SUNCOAST IN DAYLIGHT");
    blip("ui");
  }

  function updateLighting(dt) {
    if (state.timeTarget !== null) {
      const gap = ((state.timeTarget - state.clockHours + 36) % 24) - 12;
      const step = Math.min(Math.abs(gap), dt * 2.5);
      state.clockHours = (state.clockHours + Math.sign(gap) * step + 24) % 24;
      if (Math.abs(gap) <= step) { state.clockHours = state.timeTarget; state.timeTarget = null; }
    } else state.clockHours = (state.clockHours + dt * .04) % 24;
    const phase = (state.clockHours - 6) / 24 * Math.PI * 2;
    const daylight = clamp(Math.sin(phase) * .9 + .3, .06, 1);
    const night = 1 - daylight;
    sun.position.set(Math.cos(phase) * 135, Math.sin(phase) * 125, 80);
    sun.intensity = .04 + daylight * 3.0; sun.color.copy(skyColors.mixed.copy(skyColors.daySun).lerp(skyColors.nightSun, night));
    hemi.intensity = 1.15 + daylight * 1.4; hemi.color.setHSL(.58, .44, .82); hemi.groundColor.setHSL(.68, .32, .29);
    moon.intensity = night * .38;
    const sky = new THREE.Color().setHSL(.64 + night * .08, .5, .075 + daylight * .17); scene.background.copy(sky); scene.fog.color.copy(sky);
    skyMaterial.uniforms.zenith.value.copy(skyColors.mixed.copy(skyColors.dayZenith).lerp(skyColors.nightZenith, night));
    skyMaterial.uniforms.horizon.value.copy(skyColors.mixed.copy(skyColors.dayHorizon).lerp(skyColors.nightHorizon, night * .9));
    skyMaterial.uniforms.under.value.copy(skyColors.mixed.copy(skyColors.dayUnder).lerp(skyColors.nightUnder, night));
    const sunPhase = (state.clockHours - 6) / 24 * Math.PI * 2;
    sunDisc.position.set(Math.cos(sunPhase) * 185, Math.sin(sunPhase) * 98, -205); sunDisc.material.opacity = clamp(daylight * 1.3, 0, .96); sunDisc.scale.setScalar(.72 + daylight * .5);
    moonDisc.position.set(-Math.cos(sunPhase) * 178, Math.max(16, -Math.sin(sunPhase) * 92), -206); moonDisc.material.opacity = night * .8;
    starField.material.opacity = night * .9;
    scene.userData.cloudSprites?.forEach((cloud) => { cloud.position.x += dt * cloud.userData.drift; if (cloud.position.x > 220) cloud.position.x = -220; cloud.material.opacity = .12 + daylight * .5; cloud.material.color.copy(skyColors.mixed.copy(skyColors.dayHorizon).lerp(skyColors.nightHorizon, night)); });
    renderer.toneMappingExposure = 1.48 + daylight * .28;
    streetLights.forEach((light) => { light.intensity = night * 3.8; });
    neonMaterials.forEach((mat, i) => { if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = .35 + night * .7; if (mat.transparent) mat.opacity = .34 + night * .42 + Math.sin(performance.now() * .003 + i) * .035; });
    cars.forEach((car) => car.userData.lampCones.forEach((cone) => { cone.material.opacity = night * .075; }));
    if (water) water.position.y = .1 + Math.sin(performance.now() * .0008) * .035;
    if (rainStreaks) rainStreaks.visible = state.raining;
    mats.asphalt.roughness = state.raining ? .27 : .8; mats.asphalt.metalness = state.raining ? .42 : .12;
    if (waveLines) waveLines.material.opacity = state.raining ? .33 : .2;
    trafficSignals.forEach((signal) => {
      const cycle = (state.clockHours * 3600 + signal.userData.phase) % 42;
      const active = cycle < 19 ? 2 : cycle < 21 ? 1 : 0;
      const colors = [0xff334e, 0xffc764, 0x55ffb0]; const dim = [0x381923, 0x352b1a, 0x153428];
      signal.userData.lenses.forEach((lens, index) => lens.material.color.setHex(index === active ? colors[index] : dim[index]));
    });
    $("clock-label").textContent = `${String(Math.floor(state.clockHours)).padStart(2, "0")}:${String(Math.floor((state.clockHours % 1) * 60)).padStart(2, "0")}`;
    const h = state.clockHours; $("district-label").textContent = h > 18 || h < 5 ? "NEON COAST // NIGHT SHIFT" : h > 12 ? "SUNSET DISTRICT" : "PALM HEIGHTS";
    const dayNightButton = $("day-night-btn");
    dayNightButton.textContent = night > .55 ? "☼" : "☾";
    dayNightButton.title = night > .55 ? "Switch to day (T)" : "Switch to night (T)";
  }

  function updateWeather(dt) {
    if (rainStreaks?.visible) {
      const positions = rainStreaks.geometry.attributes.position.array; const center = getPlayerPosition();
      for (let i = 0; i < positions.length; i += 6) {
        positions[i + 1] -= 42 * dt; positions[i + 4] -= 42 * dt;
        if (positions[i + 1] < .2) {
          const x = center.x + (rand() - .5) * 180; const z = center.z + (rand() - .5) * 180; const y = 80 + rand() * 50;
          positions[i] = x; positions[i + 1] = y; positions[i + 2] = z; positions[i + 3] = x - .15; positions[i + 4] = y - 1.8; positions[i + 5] = z;
        }
      }
      rainStreaks.geometry.attributes.position.needsUpdate = true;
    }
    if (waveLines) {
      const dummy = new THREE.Object3D();
      waveLines.userData.offsets.forEach((wave, i) => {
        wave.x += wave.speed * dt; if (wave.x > 485) wave.x = -485;
        dummy.position.set(wave.x, .22 + Math.sin(performance.now() * .001 + wave.phase) * .04, wave.z);
        dummy.scale.set(wave.length, 1, 1); dummy.rotation.y = wave.angle; dummy.updateMatrix(); waveLines.setMatrixAt(i, dummy.matrix);
      });
      waveLines.instanceMatrix.needsUpdate = true;
    }
  }

  function updateVehicleDetails(dt) {
    const now = performance.now();
    cars.forEach((car) => {
      const open = now < (car.userData.doorOpenUntil || 0);
      car.userData.doors.forEach((door) => {
        const target = open ? door.side * .78 : 0;
        door.angle += (target - door.angle) * Math.min(1, dt * 9);
        door.group.rotation.y = door.angle;
      });
    });
  }

  function updateCamera(dt) {
    const targetObj = state.playerCar || player; const pos = targetObj.position.clone();
    const isCar = !!state.playerCar; let distance = isCar ? (state.cameraMode === 1 ? 12 : 9.3) : 8.2; let height = isCar ? (state.cameraMode === 1 ? 4.8 : 4.2) : 3.8;
    if (state.cameraMode === 2 && isCar) { distance = 3.2; height = 2.45; }
    const angle = isCar ? targetObj.rotation.y : -state.mouseYaw;
    const desired = pos.clone().add(V(Math.sin(angle) * distance, height + state.mousePitch * 2.0, Math.cos(angle) * distance));
    desired.y = Math.max(1.4, desired.y);
    camera.position.lerp(desired, 1 - Math.pow(.001, dt));
    const look = pos.clone().add(V(0, isCar ? 1.05 : 1.55, 0));
    const ray = desired.clone().sub(look); const length = ray.length(); ray.normalize();
    for (let step = 1; step <= 10; step++) {
      const probe = look.clone().addScaledVector(ray, length * step / 10);
      const blocked = buildingColliders.some((b) => probe.x > b.minX && probe.x < b.maxX && probe.z > b.minZ && probe.z < b.maxZ && probe.y > b.minY && probe.y < b.maxY);
      if (blocked) { desired.lerpVectors(look, desired, Math.max(.12, (step - 1) / 10)); break; }
    }
    camera.lookAt(look);
    if (!isCar && state.cameraMode === 1) camera.fov = 74; else camera.fov = window.innerWidth < 760 ? 70 : 62; camera.updateProjectionMatrix();
  }

  function updateHUD() {
    const pos = getPlayerPosition(); const nearest = cars.filter((car) => !car.userData.police && car.visible && car !== state.playerCar).sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))[0];
    const nearDistance = nearest ? nearest.position.distanceTo(pos) : Infinity;
    if (!state.playerInCar && nearest && nearDistance < 5.5) { $("prompt").classList.remove("hidden"); $("prompt-key").textContent = "E"; $("prompt-copy").textContent = `Enter ${nearest.userData.name}`; }
    else if (state.playerInCar) { $("prompt").classList.remove("hidden"); $("prompt-key").textContent = "F"; $("prompt-copy").textContent = "Exit vehicle"; }
    else $("prompt").classList.add("hidden");
    $("wanted-stars").textContent = "★".repeat(state.wanted) + "☆".repeat(5 - state.wanted);
    $("cash-value").textContent = `$${state.cash.toLocaleString("en-US")}`;
    $("vehicle-panel").classList.toggle("hidden", !state.playerInCar);
    if (state.playerInCar) {
      $("vehicle-name").textContent = state.playerCar.userData.name;
      $("speed-label").textContent = String(Math.round(Math.abs(state.playerCar.userData.speed) * 3.1)).padStart(3, "0");
      const onWater = state.seaways && state.playerCar.position.z < -177;
      $("vehicle-mode").textContent = state.flightMode ? "FLIGHT MODE" : onWater ? "SEA MODE" : "ROAD MODE";
    }
  }

  function drawMap(targetCanvas, big = false) {
    const ctx = targetCanvas.getContext("2d"); const w = targetCanvas.width; const h = targetCanvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#0a1530"; ctx.fillRect(0, 0, w, h);
    const scale = big ? Math.min(w, h) / (CITY_HALF * 2.15) : w / 86; const center = getPlayerPosition();
    const toMap = (x, z) => ({ x: (x - center.x) * scale + w / 2, y: (z - center.z) * scale + h / 2 });
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(0); ctx.translate(-w / 2, -h / 2);
    ctx.strokeStyle = "rgba(142,164,206,.18)"; ctx.lineWidth = big ? 6 : 2;
    for (let i = -5; i <= 5; i++) { const a = toMap(i * ROAD_STEP, center.z); ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, h); ctx.stroke(); const b = toMap(center.x, i * ROAD_STEP); ctx.beginPath(); ctx.moveTo(0, b.y); ctx.lineTo(w, b.y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(124,236,255,.32)"; ctx.lineWidth = big ? 8 : 3; const coast = toMap(0, -156); ctx.beginPath(); ctx.moveTo(0, coast.y); ctx.lineTo(w, coast.y); ctx.stroke();
    if (state.mission.active && missionMarker.visible) { const m = toMap(state.mission.target.x, state.mission.target.z); ctx.fillStyle = "#ff6dbe"; ctx.beginPath(); ctx.arc(m.x, m.y, big ? 9 : 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(255,109,190,.3)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, big ? 19 : 8, 0, Math.PI * 2); ctx.stroke(); }
    policeCars.forEach((car) => { if (!car.visible) return; const p = toMap(car.position.x, car.position.z); ctx.fillStyle = "#ff516d"; ctx.fillRect(p.x - (big ? 5 : 2), p.y - (big ? 5 : 2), big ? 10 : 4, big ? 10 : 4); });
    const you = toMap(center.x, center.z); ctx.translate(you.x, you.y); ctx.rotate(-(state.playerCar ? state.playerCar.rotation.y : player.rotation.y)); ctx.fillStyle = "#7cecff"; ctx.beginPath(); ctx.moveTo(0, big ? -14 : -6); ctx.lineTo(big ? 9 : 4, big ? 10 : 4); ctx.lineTo(big ? -9 : -4, big ? 10 : 4); ctx.closePath(); ctx.fill(); ctx.restore();
    if (!big) { ctx.strokeStyle = "rgba(124,236,255,.3)"; ctx.strokeRect(0, 0, w, h); }
  }

  function showToast(text) { const el = $("toast"); el.textContent = text; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200); }

  function togglePause(force) {
    if (!state.started || state.mapOpen || state.arrested) return;
    state.paused = force ?? !state.paused; $("pause-overlay").classList.toggle("hidden", !state.paused); if (state.paused) blip("ui");
  }
  function toggleMap() {
    if (!state.started || state.paused) return;
    state.mapOpen = !state.mapOpen; $("map-overlay").classList.toggle("hidden", !state.mapOpen); if (state.mapOpen) drawMap($("big-map"), true); blip("ui");
  }

  function enterExitCar() {
    const pos = getPlayerPosition();
    if (state.playerInCar) {
      const car = state.playerCar; car.userData.doorOpenUntil = performance.now() + 520; const side = V(Math.cos(car.rotation.y), 0, -Math.sin(car.rotation.y)); player.position.copy(car.position).addScaledVector(side, 2.1); player.position.y = 0; player.rotation.y = car.rotation.y; state.mouseYaw = -car.rotation.y; player.visible = true; car.userData.playerSeat.visible = false; state.playerInCar = false; state.playerCar = null; showToast("ON FOOT // CITY IS YOURS"); blip("ui"); return;
    }
    const available = cars.filter((car) => !car.userData.police && car.visible && car.position.distanceTo(pos) < 5.6).sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))[0];
    if (!available) { showToast("NO VEHICLE IN RANGE"); return; }
    state.playerCar = available; state.playerInCar = true; player.visible = false; available.userData.doorOpenUntil = performance.now() + 520; available.userData.playerSeat.visible = true; if (available.userData.driver) available.userData.driver.visible = false; available.userData.traffic = false; available.userData.parked = false; available.userData.hasSpawned = false; setWanted(Math.max(state.wanted, 1)); showToast(`VEHICLE ACQUIRED // ${available.userData.name}`); blip("success");
  }

  function saveGame() {
    const pos = getPlayerPosition(); const car = state.playerCar;
    const save = {
      version: 1, cash: state.cash, health: state.health, clockHours: state.clockHours, raining: state.raining,
      player: { x: player.position.x, y: player.position.y, z: player.position.z, yaw: player.rotation.y },
      vehicle: car ? { name: car.userData.name, x: car.position.x, y: car.position.y, z: car.position.z, yaw: car.rotation.y, speed: car.userData.speed } : null,
      mission: { index: state.mission.index, active: state.mission.active, complete: state.mission.complete, elapsed: state.mission.elapsed },
      wanted: state.wanted, savedAt: new Date().toISOString(), position: { x: pos.x, z: pos.z },
    };
    try { localStorage.setItem("tideline-save", JSON.stringify(save)); $("save-btn").textContent = "SAVED ✓"; setTimeout(() => { $("save-btn").textContent = "SAVE CITY"; }, 1800); blip("success"); }
    catch (error) { showToast("SAVE FAILED // BROWSER STORAGE UNAVAILABLE"); }
  }

  function loadGame() {
    let save;
    try { save = JSON.parse(localStorage.getItem("tideline-save") || localStorage.getItem("neon-horizon-save") || "null"); }
    catch { showToast("SAVE FILE COULD NOT BE READ"); return; }
    if (!save || save.version !== 1 || !save.player) { $("load-btn").textContent = "NO SAVE FOUND"; setTimeout(() => { $("load-btn").textContent = "LOAD SAVE"; }, 1800); return; }
    state.cash = Math.max(0, Number(save.cash) || 0); state.health = clamp(Number(save.health) || 100, 1, 100); state.clockHours = Number.isFinite(save.clockHours) ? save.clockHours : 17.65; state.timeTarget = null;
    state.raining = !!save.raining; document.getElementById("game-shell").classList.toggle("raining", state.raining);
    state.mission.index = clamp(Math.floor(Number(save.mission?.index) || 0), 0, missionCatalog.length - 1);
    state.mission.active = !!save.mission?.active; state.mission.complete = !!save.mission?.complete && !state.mission.active; state.mission.elapsed = Math.max(0, Number(save.mission?.elapsed) || 0);
    state.mission.target.copy(missionCatalog[state.mission.index].target); missionMarker.position.set(state.mission.target.x,.28,state.mission.target.z); missionMarker.visible = state.mission.active;
    state.wanted = state.mission.active ? clamp(Number(save.wanted) || 1, 1, 5) : 0; state.wantedCooldown = 0;
    player.position.set(Number(save.player.x) || 0, Math.max(0,Number(save.player.y)||0), Number(save.player.z) || 0); player.rotation.y = Number(save.player.yaw) || 0; state.mouseYaw = -player.rotation.y;
    if (state.playerCar) { state.playerCar.userData.playerSeat.visible = false; state.playerCar = null; }
    state.playerInCar = false; player.visible = true; state.flightMode = false; state.seaways = false;
    if (save.vehicle) {
      const car = cars.find((entry) => !entry.userData.police && entry.userData.name === save.vehicle.name) || cars.find((entry) => entry.userData.name === "VAPOR GT");
      if (car) {
        car.position.set(Number(save.vehicle.x)||0,0,Number(save.vehicle.z)||0); car.rotation.y = Number(save.vehicle.yaw)||0; car.userData.speed = Number(save.vehicle.speed)||0; car.userData.traffic = false;
        car.userData.playerSeat.visible = true; if (car.userData.driver) car.userData.driver.visible = false; state.playerCar = car; state.playerInCar = true; player.visible = false;
      }
    }
    updateMissionUI(); updateHUD(); updateLighting(0); ensurePolice(); updateCamera(1); $("load-btn").textContent = "LOADED ✓"; setTimeout(() => { $("load-btn").textContent = "LOAD SAVE"; }, 1800); blip("success");
  }

  function restart() { window.location.reload(); }

  function activateCheat(code) {
    if (code === "seaways") {
      state.seaways = !state.seaways;
      if (!state.seaways && state.playerCar && state.playerCar.position.z < -164) { state.playerCar.position.z = -158; state.playerCar.position.y = 0; state.playerCar.userData.speed = 0; }
      showToast(state.seaways ? "SEAWAYS ON // YOUR CAR CAN FLOAT" : "SEAWAYS OFF // BACK TO THE BEACH");
    } else {
      state.flightMode = !state.flightMode;
      if (state.playerCar) { state.playerCar.position.y = state.flightMode ? Math.max(1.45, state.playerCar.position.y) : 0; state.playerCar.userData.flightVelocity = 0; }
      showToast(state.flightMode ? "FLIGHT ON // SPACE CLIMB · 420M CEILING" : "FLIGHT OFF");
    }
    blip("success");
  }

  function consumeCheatKey(key) {
    const now = performance.now();
    if (now - state.lastCheatInput > 1250) state.cheatBuffer = "";
    state.lastCheatInput = now;
    const candidate = state.cheatBuffer + key;
    for (const code of ["seaways", "fly"]) {
      if (candidate.endsWith(code)) { state.cheatBuffer = ""; activateCheat(code); return true; }
    }
    let suffix = "";
    for (let length = 1; length <= Math.min(candidate.length, 6); length++) {
      const part = candidate.slice(-length);
      if (["seaways", "fly"].some((code) => code.startsWith(part))) suffix = part;
    }
    state.cheatBuffer = suffix;
    return !!suffix;
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
    if (key === "escape") { state.cheatBuffer = ""; togglePause(); return; }
    if (!state.started) return;
    if (state.arrested) { if (key === "enter" && !event.repeat) returnFromArrest(); return; }
    if (event.repeat && state.cheatBuffer) return;
    if (key === "f" && state.playerInCar && !event.repeat) { state.cheatBuffer = ""; enterExitCar(); return; }
    if (/^[a-z]$/.test(key) && !event.repeat && consumeCheatKey(key)) return;
    if (!/^[a-z]$/.test(key)) state.cheatBuffer = "";
    if (key === "m" && !event.repeat) { toggleMap(); return; }
    if (key === "e" || key === "f") { if (!event.repeat) enterExitCar(); return; }
    if (key === "c" && !event.repeat) { state.cameraMode = (state.cameraMode + 1) % 3; showToast(`CAMERA // ${state.cameraMode === 0 ? "FOLLOW" : state.cameraMode === 1 ? "CINEMATIC" : "HOOD"}`); return; }
    if (key === "j" && !event.repeat) { acceptMission(); return; }
    if (key === "t" && !event.repeat) { toggleDayNight(); return; }
    if (key === "y" && !event.repeat) { state.raining = !state.raining; document.getElementById("game-shell").classList.toggle("raining", state.raining); showToast(state.raining ? "WEATHER // COASTAL RAIN" : "WEATHER // CLEAR SKIES"); blip("ui"); return; }
    if (key === "r" && !event.repeat && state.playerInCar) { state.playerCar.position.set(-18, 0, -144.5); state.playerCar.rotation.y = -Math.PI / 2; state.playerCar.userData.speed = 0; showToast("RIDE RESET"); return; }
    state.keys[key === " " ? "space" : key] = true;
  }

  function onKeyUp(event) { const key = event.key.toLowerCase(); state.keys[key === " " ? "space" : key] = false; if (key === " ") state.keys._space = false; }

  let dragging = false; let lastPointer = null;
  function onPointerDown(event) { if (!state.started || state.paused || state.mapOpen) return; dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture?.(event.pointerId); }
  function onPointerMove(event) { if (!dragging || !lastPointer) return; const dx = event.clientX - lastPointer.x; const dy = event.clientY - lastPointer.y; lastPointer = { x: event.clientX, y: event.clientY }; state.mouseYaw -= dx * .006; state.mousePitch = clamp(state.mousePitch - dy * .004, -.25, .7); }
  function onPointerUp() { dragging = false; lastPointer = null; }

  function runTouchAction(action) {
    if (action === "enter") enterExitCar();
    else if (action === "horn") playHorn();
    else if (action === "seaways" || action === "fly") activateCheat(action);
    else if (action === "mission") acceptMission();
    else if (action === "camera") {
      state.cameraMode = (state.cameraMode + 1) % 3;
      showToast(`CAMERA // ${state.cameraMode === 0 ? "FOLLOW" : state.cameraMode === 1 ? "CINEMATIC" : "HOOD"}`);
    }
  }

  function bindTouchControls() {
    document.querySelectorAll("[data-touch-key]").forEach((button) => {
      const key = button.dataset.touchKey;
      const release = (event) => { event.preventDefault(); state.keys[key] = false; button.classList.remove("is-held"); };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault(); state.keys[key] = true; button.classList.add("is-held");
        try { button.setPointerCapture(event.pointerId); } catch { /* The press still works without pointer capture. */ }
      });
      button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release);
    });
    document.querySelectorAll("[data-touch-action]").forEach((button) => button.addEventListener("pointerdown", (event) => {
      event.preventDefault(); runTouchAction(button.dataset.touchAction);
    }));
  }

  function begin() {
    state.started = true; $("intro-screen").classList.add("gone"); document.querySelectorAll(".hud").forEach((el) => el.classList.remove("hidden")); initAudio(); startBackgroundMusic(); showToast("WELCOME TO TIDELINE // J FOR A JOB · TYPE SEAWAYS OR FLY"); updateMissionUI(); ensurePolice(); canvas.focus?.();
  }
  launchGame = begin;

  function update(dt) {
    if (state.arrested) return;
    if (!state.playerInCar) moveOnFoot(dt); else drivePlayer(dt);
    updateBloodEffects(dt);
    updatePolice(dt);
    if (state.arrested) return;
    updateTraffic(dt); updatePedestrians(dt); updateMission(dt); updateWanted(dt); updateLighting(dt); updateWeather(dt); updateVehicleDetails(dt); updateCamera(dt); updateHUD(); drawMap($("minimap"));
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    if (document.visibilityState === "hidden") return;
    const staticScene = !state.started || state.paused || state.mapOpen || state.arrested;
    if (staticScene && now - lastRenderAt < 100) return;
    if (state.started && !state.paused && !state.mapOpen && !state.arrested) update(dt);
    if (state.started) updateAudio();
    renderer.render(scene, camera);
    lastRenderAt = now;
  }

  function onResize() { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }

  function init() {
    try {
      makeRenderer(); makeScene();
      bindTouchControls();
      $("audio-btn").addEventListener("click", () => { initAudio(); if (audio) { audio.enabled = !audio.enabled; audio.master.gain.value = audio.enabled ? .18 : 0; if (audio.enabled && state.started) startBackgroundMusic(); else audio.backgroundMusic.pause(); $("audio-btn").textContent = audio.enabled ? "♫" : "∅"; showToast(audio.enabled ? "AUDIO ONLINE" : "AUDIO MUTED"); } });
      $("day-night-btn").addEventListener("click", toggleDayNight); $("arrest-return-btn").addEventListener("click", returnFromArrest);
      $("map-btn").addEventListener("click", toggleMap); $("map-close").addEventListener("click", toggleMap); $("pause-btn").addEventListener("click", () => togglePause()); $("resume-btn").addEventListener("click", () => togglePause(false)); $("save-btn").addEventListener("click", saveGame); $("load-btn").addEventListener("click", loadGame); $("restart-btn").addEventListener("click", restart);
      window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("resize", onResize); canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove); canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp);
      updateMissionUI(); animate(performance.now());
    } catch (error) {
      console.error(error.stack || error); $("error-banner").textContent = `Game boot error: ${error.message}`; $("error-banner").classList.remove("hidden");
    }
  }
  init();
})();

export function startGame() { launchGame?.(); }
