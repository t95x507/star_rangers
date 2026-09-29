// Hard-surface ship models built from convex hulls and primitives. Forward is +x, up is +y.
// Every builder returns { group, engines: [{pos, size}], radius, mats: [Material] }.
// Style: faceted gunmetal hulls, faction colour only on accent panels and lights.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { eqDef, BOSSES, STATIONS } from './data.js';

const PI = Math.PI;
const geoCache = new Map();
const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };

// ---- geometry helpers (cached; convex hulls come out flat-faceted)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// points mirrored across the centre line (z = 0)
const symm = pts => pts.flatMap(([x, y, z]) => (z ? [[x, y, z], [x, y, -z]] : [[x, y, z]]));
// one side of a symmetric part: `s` = +1 / -1
const side = (pts, s) => pts.map(([x, y, z]) => [x, y, z * s]);
const hull = (key, pts) => cached('cx' + key, () => new ConvexGeometry(pts.map(p => V(...p))));
const box = (x, y, z) => cached(`box${x}_${y}_${z}`, () => new THREE.BoxGeometry(x, y, z));
// cylinder along x; rFront is the radius at +x
const cylX = (rFront, rBack, len, seg = 8) => cached(`cyl${rFront}_${rBack}_${len}_${seg}`, () => new THREE.CylinderGeometry(rFront, rBack, len, seg).rotateZ(-PI / 2));
const cylY = (r, h, seg = 6) => cached(`cyly${r}_${h}_${seg}`, () => new THREE.CylinderGeometry(r, r * 1.15, h, seg));
const sphere = r => cached(`sph${r}`, () => new THREE.SphereGeometry(r, 32, 20)); // smooth
const cone = (r, h, seg = 5) => cached(`cone${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg).rotateZ(-PI / 2)); // tip +x

// ---- materials (per ship, so each can fade independently)
function palette(color, engineColor) {
  const c = new THREE.Color(color);
  const metal = new THREE.Color(0x5a616c).lerp(c, 0.12);
  const std = o => new THREE.MeshStandardMaterial({ flatShading: true, metalness: 0.7, roughness: 0.38, envMapIntensity: 0.9, ...o });
  return {
    hull: std({ color: metal }),
    plate: std({ color: metal.clone().multiplyScalar(0.62), roughness: 0.5 }),
    dark: std({ color: 0x1d2128, metalness: 0.8, roughness: 0.55 }),
    accent: std({ color: c, emissive: c, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.35 }),
    glass: std({ color: 0x06141e, emissive: 0x2a8ccc, emissiveIntensity: 0.3, metalness: 0.95, roughness: 0.08 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(engineColor).multiplyScalar(2.4) }),
    navR: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(2) }),
    navG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2aff6a).multiplyScalar(2) }),
  };
}

class Builder {
  constructor(m) { this.group = new THREE.Group(); this.m = m; this.engines = []; }
  add(geo, mat, x = 0, y = 0, z = 0, opts = {}) {
    const mesh = new THREE.Mesh(geo, this.m[mat] || mat);
    mesh.position.set(x, y, z);
    if (opts.rot) mesh.rotation.set(...opts.rot);
    if (opts.scale) mesh.scale.set(...opts.scale);
    this.group.add(mesh);
    return mesh;
  }
  // octagonal nozzle with a glowing throat; the glow sprite is attached by the renderer
  engine(x, y, z, r, len = r * 1.4) {
    this.add(cylX(r * 0.9, r * 1.1, len), 'dark', x, y, z);
    this.add(cylX(r * 1.12, r * 1.12, len * 0.25), 'plate', x + len * 0.3, y, z);
    this.add(cylX(r * 0.8, r * 0.8, 0.6), 'glow', x - len / 2 - 0.2, y, z);
    this.engines.push({ pos: new THREE.Vector3(x - len / 2 - 2, y, z), size: r });
  }
  // angular gun turret with twin barrels, facing +x
  turret(x, y, z, r = 5) {
    this.add(cylY(r, r * 0.5, 6), 'dark', x, y + r * 0.25, z);
    this.add(hull('tur' + r, symm([[r * 1.2, r * 0.5, r * 0.5], [r * 0.6, r * 1.1, r * 0.7], [-r, r * 1.1, r * 0.8], [-r * 1.1, r * 0.5, r * 0.9]])), 'plate', x, y, z);
    for (const s of [1, -1]) this.add(cylX(r * 0.16, r * 0.2, r * 2.6, 6), 'dark', x + r * 2, y + r * 0.8, z + s * r * 0.35);
  }
  nav(x, y, z) { // wingtip navigation lights: red port (+z), green starboard (-z)
    this.add(box(1.6, 1.6, 1.6), 'navR', x, y, z);
    this.add(box(1.6, 1.6, 1.6), 'navG', x, y, -z);
  }
  done(radius) {
    const mats = new Set();
    this.group.traverse(o => { if (o.material) mats.add(o.material); });
    return { group: this.group, engines: this.engines, radius, mats: [...mats] };
  }
}

// ---- hulls

function scout(b) { // h1 «Скаут»: needle-nosed interceptor with forward-raked wings
  b.add(hull('sc_body', symm([[44, 0.5, 0], [22, 4.5, 4], [22, -3, 4], [-6, 6, 7], [-6, -4, 7.5], [-24, 5, 7], [-24, -3.5, 7], [-30, 1, 3]])), 'hull');
  b.add(hull('sc_can', symm([[26, 4, 0], [16, 7.5, 2.8], [4, 7.8, 3.2], [-2, 6, 3.5], [18, 4, 3.5]])), 'glass');
  b.add(hull('sc_spine', symm([[-2, 7.6, 0.8], [-24, 7, 1.2], [-24, 5, 2.5], [-2, 6, 2.5]])), 'plate');
  for (const s of [1, -1]) {
    b.add(hull('sc_w' + s, side([[8, 1, 6], [8, -1.5, 6], [-16, 1, 7], [-16, -1.5, 7], [-8, 0.4, 30], [-8, -0.8, 30], [-15, 0.4, 31], [-15, -0.8, 31]], s)), 'hull');
    b.add(hull('sc_wa' + s, side([[4, 1.3, 9], [-2, 1.3, 9], [-10, 0.9, 26], [-6, 0.9, 26], [4, 1.8, 9], [-2, 1.8, 9], [-10, 1.4, 26], [-6, 1.4, 26]], s)), 'accent');
    b.add(cylX(0.7, 0.9, 16, 6), 'dark', 14, -2, s * 6);
  }
  b.add(hull('sc_fin', [[-12, 6, 0.8], [-12, 6, -0.8], [-26, 14, 0.6], [-26, 14, -0.6], [-30, 14, 0.6], [-30, 14, -0.6], [-28, 5, 0.8], [-28, 5, -0.8]]), 'accent');
  b.nav(-12, 0, 31);
  b.engine(-31, 1, 0, 5, 7);
  return b.done(48);
}

function courier(b, pods = 4) { // h2 «Курьер»: armoured cab, spine and a rack of cargo containers
  const dx = -(pods - 4) * 14.5; // longer racks push the engine block back
  b.add(hull('co_cab', symm([[44, 0, 0], [36, 6, 6], [36, -5, 6], [26, 9, 9], [26, -7, 9], [12, 9, 9], [12, -7, 9], [40, 2, 4]])), 'hull');
  b.add(hull('co_win', symm([[38, 4.2, 3], [30, 8.2, 6], [30, 6.2, 7.6], [36, 3, 5.2]])), 'glass');
  b.add(box(70 - dx, 7, 7), 'dark', -18 + dx / 2, 0, 0);
  for (let i = 0; i < pods; i++) for (const s of [1, -1]) {
    const x = 3 - i * 14.5;
    b.add(box(13, 11, 11), (i + (s > 0 ? 0 : 1)) % 2 ? 'accent' : 'plate', x, 1.5, s * 7);
    b.add(box(13.4, 1, 11.4), 'dark', x, 7.3, s * 7);
  }
  b.add(hull('co_eng', symm([[-48, 7, 9], [-48, -6, 9], [-58, 6, 8], [-58, -5, 8], [-44, 7, 6], [-44, -6, 6]])), 'hull', dx);
  for (const s of [1, -1]) {
    b.add(box(14, 0.8, 11), 'plate', -50 + dx, 0, s * 15);
    b.add(box(14, 0.8, 11), 'plate', -50 + dx, 3, s * 15);
    b.engine(-60 + dx, 0.5, s * 4.5, 4, 6);
  }
  b.add(cylY(0.5, 10, 4), 'dark', 18, 13, 0);
  b.add(box(3, 0.6, 3), 'accent', 18, 18, 0);
  b.nav(-50 + dx, 1.5, 20.5);
  return b.done(62 - dx * 0.5);
}

function hauler(b) { // «Тягач»: a courier cab pulling a long train of containers
  courier(b, 6);
  for (const s of [1, -1]) b.add(box(80, 2, 2), 'dark', -30, -5, s * 13);
  return b.done(80);
}

function caravan(b) { // «Караван»: a bulk freighter with a double rack and a dorsal crane
  courier(b, 7);
  for (let i = 0; i < 7; i++) b.add(box(13, 9, 11), i % 2 ? 'plate' : 'accent', 3 - i * 14.5, 12, 0);
  b.add(box(4, 4, 30), 'dark', -40, 18, 0);
  b.add(cylY(1, 14, 4), 'dark', -40, 10, 14);
  return b.done(88);
}

function ranger(b) { // h3 «Рейнджер»: multirole arrowhead, canted twin tails, underslung gun pods
  b.add(hull('ra_body', symm([[56, 0, 0], [30, 6, 6], [30, -4, 7], [0, 8, 12], [0, -5, 13], [-30, 7, 13], [-30, -5, 13], [-38, 3, 9], [-38, -3, 9]])), 'hull');
  b.add(hull('ra_can', symm([[32, 5.8, 0], [20, 9.5, 3], [8, 10, 3.5], [2, 8, 4.5], [24, 6, 4]])), 'glass');
  b.add(hull('ra_ridge', symm([[2, 10, 1.5], [-26, 9, 2], [-26, 7, 5], [2, 8, 5]])), 'plate');
  for (const s of [1, -1]) {
    b.add(hull('ra_w' + s, side([[6, 1, 11], [6, -2, 11], [-28, 1, 13], [-28, -2, 13], [-20, 0.5, 38], [-20, -1, 38], [-30, 0.5, 38], [-30, -1, 38]], s)), 'hull');
    b.add(hull('ra_wa' + s, side([[2, 1.4, 15], [-4, 1.4, 15], [-19, 0.9, 34], [-15, 0.9, 34], [2, 2, 15], [-4, 2, 15], [-19, 1.5, 34], [-15, 1.5, 34]], s)), 'accent');
    b.add(hull('ra_tail' + s, side([[-16, 7, 7], [-16, 7, 5], [-34, 21, 12], [-34, 21, 10.5], [-39, 21, 12], [-39, 21, 10.5], [-38, 6, 8], [-38, 6, 6]], s)), 'hull');
    b.add(box(14, 5, 4), 'dark', 12, -2, s * 12);
    b.add(cylX(2, 2.6, 20, 8), 'plate', -6, -4, s * 25);
    b.add(cylX(0.7, 0.7, 12, 6), 'dark', 10, -4, s * 25);
    b.engine(-41, 2, s * 6, 4.5, 6);
  }
  b.nav(-24, 0, 38.5);
  return b.done(64);
}

function assault(b) { // «Штурмовик»: the Ranger frame under slabs of armour, with a ram and a dorsal turret
  ranger(b);
  for (const s of [1, -1]) {
    b.add(hull('as_pl' + s, side([[26, 5, 7], [26, -4, 8], [-6, 7, 14], [-6, -5, 15], [-22, 7, 14], [-22, -5, 14], [10, 8, 11]], s)), 'plate');
    b.add(box(18, 3, 3), 'accent', -8, -1, s * 16);
  }
  b.add(cone(6, 22, 4), 'dark', 62, -1, 0);
  b.turret(-6, 10, 0, 4.5);
  return b.done(68);
}

function corvette(b) { // h4 «Корвет»: wedge warship with stepped superstructure and turrets
  b.add(hull('cv_hull', symm([[72, 0, 0], [50, 6, 8], [50, -6, 8], [10, 10, 16], [10, -9, 16], [-42, 10, 18], [-42, -9, 18], [-54, 8, 14], [-54, -7, 14]])), 'hull');
  b.add(hull('cv_keel', symm([[40, -5, 0], [-40, -12, 0], [-40, -8, 8], [30, -4, 6]])), 'plate');
  b.add(hull('cv_deck', symm([[10, 10, 10], [10, 15, 7], [-30, 16, 9], [-30, 10, 13], [-40, 10, 12], [-40, 15, 8]])), 'plate');
  b.add(hull('cv_bridge', symm([[6, 15, 5], [4, 21, 3.5], [-12, 23, 5], [-14, 15, 7]])), 'hull');
  b.add(hull('cv_win', symm([[5.4, 17, 0], [4.2, 20.4, 3], [5.6, 17, 4.6], [4, 19, 0]])), 'glass');
  b.add(cylY(0.5, 12, 4), 'dark', -8, 28, 0);
  b.add(box(6, 0.6, 0.6), 'dark', -8, 32, 0);
  for (const s of [1, -1]) {
    b.add(hull('cv_sp' + s, side([[18, 3, 16], [18, -5, 16], [10, 3, 24], [10, -5, 24], [-56, 3, 26], [-56, -5, 26], [-56, 3, 16], [-56, -5, 16]], s)), 'hull');
    b.add(box(52, 0.8, 5), 'accent', -22, 3.4, s * 21);
    b.add(box(26, 1, 12), 'dark', -30, -1, s * 31);
    b.engine(-59, -1, s * 21, 5, 7);
  }
  b.engine(-56, 1, 0, 7, 8);
  b.turret(32, 7, 0, 5);
  b.turret(-22, 16, 0, 5);
  b.nav(-40, 0, 26.5);
  return b.done(82);
}

function cruiser(b) { // h5 «Крейсер»: dagger-shaped capital ship
  b.add(hull('cr_hull', symm([[88, 0, 0], [40, 8, 14], [40, -7, 14], [-40, 12, 34], [-40, -10, 34], [-70, 12, 34], [-70, -10, 34], [-76, 8, 20], [-76, -8, 20]])), 'hull');
  b.add(hull('cr_keel', symm([[60, -4, 0], [-60, -18, 0], [-70, -12, 10], [-40, -10, 18], [40, -6, 8]])), 'plate');
  b.add(box(64, 1.6, 27.5), 'accent', -36, 12.4, 0);
  b.add(box(60, 6, 26), 'plate', -36, 16, 0);
  b.add(box(36, 6, 18), 'hull', -44, 22, 0);
  b.add(hull('cr_bridge', symm([[-30, 25, 8], [-33, 32, 6], [-54, 32, 6], [-56, 25, 8]])), 'hull');
  b.add(box(1.2, 2.4, 11), 'glass', -30.8, 28, 0);
  b.add(box(40, 3, 20), 'dark', 30, -5, 0); // hangar slot
  for (const s of [1, -1]) {
    b.add(box(22, 12, 0.8), 'plate', -60, 18, s * 20);
    b.add(box(22, 0.8, 8), 'dark', -60, 12, s * 30);
    b.turret(36, 6, s * 9, 5);
    b.turret(6, 9, s * 18, 5);
    b.engine(-80, 0, s * 8, 8, 10);
    b.engine(-76, -3, s * 26, 6, 8);
  }
  b.turret(-10, 19, 0, 6);
  b.add(cylY(0.6, 14, 4), 'dark', -46, 39, 0);
  b.nav(-60, 0, 34.5);
  return b.done(100);
}

function battleship(b) { // «Линкор»: a cruiser with gun sponsons on both flanks
  cruiser(b);
  for (const s of [1, -1]) {
    b.add(hull('bs_sp' + s, side([[20, 6, 36], [20, -6, 36], [-60, 8, 40], [-60, -8, 40], [-60, 8, 52], [-60, -8, 52], [10, 4, 48], [10, -4, 48]], s)), 'hull');
    b.add(box(60, 1.2, 3), 'accent', -22, 8, s * 47);
    b.turret(-5, 8, s * 45, 5);
    b.turret(-38, 8, s * 45, 5);
    b.engine(-64, 0, s * 46, 6, 8);
  }
  return b.done(112);
}

// «Немезида»: a forked dreadnought with a burning core between the prongs (the boss, and the exotic hull)
function nemesis(b) {
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4020).multiplyScalar(2.2) });
  b.add(hull('nm_body', symm([[60, 0, 0], [20, 10, 16], [20, -8, 16], [-60, 12, 22], [-60, -10, 22], [-92, 8, 14], [-92, -6, 14]])), 'hull');
  b.add(hull('nm_keel', symm([[40, -6, 0], [-80, -18, 0], [-86, -10, 10], [20, -6, 8]])), 'plate');
  for (const s of [1, -1]) {
    b.add(hull('nm_pr' + s, side([[126, 2, 18], [126, -2, 18], [40, 9, 12], [40, -7, 12], [40, 9, 32], [40, -7, 32], [96, 4, 28], [96, -3, 28]], s)), 'hull');
    b.add(box(70, 1.2, 2), 'accent', 70, 5, s * 22);
    b.turret(10, 10, s * 15, 6);
    b.turret(-24, 13, s * 18, 6);
    b.engine(-96, 0, s * 11, 9, 12);
  }
  b.add(hull('nm_brg', symm([[-30, 12, 7], [-36, 32, 4], [-58, 32, 4], [-62, 12, 9]])), 'plate');
  b.add(box(1.2, 3, 7), 'glass', -35.6, 27, 0);
  b.turret(-46, 33, 0, 5);
  b.add(sphere(11), core, 58, 1, 0);
  b.add(cylX(3, 3, 60, 6), core, 90, 1, 0);
  b.engine(-94, 1, 0, 11, 14);
  return b.done(130);
}

const HULL_BUILDERS = { scout, courier, hauler, ranger, assault, corvette, caravan, cruiser, battleship, nemesis };
const HULL_SCALE = { scout: 0.9, courier: 0.9, hauler: 0.95, ranger: 0.95, assault: 0.98, corvette: 1, caravan: 1.2, cruiser: 1.05, battleship: 1.15, nemesis: 1.15 };

// pirates bolt on scrap: a ram with jagged blades and a mismatched armour plate
function pirateMods(b, r) {
  for (const s of [1, -1]) b.add(cone(2.5, r * 0.5, 4), 'dark', r * 0.62, -1.5, s * 5, { rot: [0, -0.25 * s, 0] });
  b.add(hull('pj_plate' + r, [[r * 0.2, 5, 4], [r * 0.2, -3, 9], [-r * 0.3, 7, 6], [-r * 0.3, -3, 12], [-r * 0.1, 8, 9]]), 'accent');
  b.add(hull('pj_fin', [[-4, 6, 0.6], [-4, 6, -0.6], [-14, 16, 0.5], [-14, 16, -0.5], [-22, 7, 0.6], [-22, 7, -0.6]]), 'dark');
}

// Dominators: an elongated crystal body with a crown of shards and glowing veins
function dominator(b, tier) {
  const s = 1 + tier * 0.22;
  const crystal = new THREE.MeshStandardMaterial({ color: 0x3a1470, emissive: 0x7a2cff, emissiveIntensity: 0.5, flatShading: true, metalness: 0.6, roughness: 0.25 });
  const vein = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc070ff).multiplyScalar(2) });
  b.add(hull('dm_core', symm([[40, 0, 0], [12, 7, 8], [12, -7, 8], [-18, 9, 10], [-18, -9, 10], [-34, 0, 4]])), crystal, 0, 0, 0, { scale: [s, s, s] });
  b.add(hull('dm_vein', symm([[36, 0.6, 0], [10, 7.6, 1], [-16, 9.6, 1], [-16, 9.6, 0.1]])), vein, 0, 0, 0, { scale: [s, s, s] });
  const shards = 2 + tier;
  for (let i = 0; i < shards; i++) for (const sd of [1, -1]) {
    const x = 16 - i * 12, len = 26 - i * 3;
    b.add(hull('dm_sh' + i + sd, side([[x + len, 0, 10 + i * 2], [x, 3, 8], [x, -3, 8], [x - 6, 0, 7], [x + len * 0.5, 0, 16 + i * 4]], sd)), crystal, 0, 0, 0, { scale: [s, s, s] });
  }
  b.add(sphere(3.5), 'glow', 30 * s, 2 * s, 0);
  b.engines.push({ pos: new THREE.Vector3(-36 * s, 0, 0), size: 7 * s });
  return b.done(48 * s);
}

function citadel(b) {
  const crystal = new THREE.MeshStandardMaterial({ color: 0x4a1890, emissive: 0x6010ff, emissiveIntensity: 0.8, flatShading: true, metalness: 0.6, roughness: 0.3 });
  b.add(cached('oct150', () => new THREE.OctahedronGeometry(150, 0)), crystal);
  b.add(cached('tor210', () => new THREE.TorusGeometry(210, 7, 6, 12)), 'accent', 0, 0, 0, { rot: [PI / 2, 0, 0] });
  b.add(cached('tor260', () => new THREE.TorusGeometry(260, 5, 6, 12)), 'accent', 0, 0, 0, { rot: [PI / 2 + 0.5, 0.3, 0] });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2;
    b.add(cone(18, 110, 5), crystal, Math.cos(a) * 190, 0, Math.sin(a) * 190, { rot: [0, -a, 0] });
  }
  b.add(sphere(40), 'glow', 0, 160, 0);
  return b.done(280);
}

// ---- monsters (organic parts are smooth-shaded; some have an `anim(t)` for living motion)

// deterministic pseudo-random numbers, so every copy of a model looks the same
function rng(seed) { let x = seed; return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646; }

// a tentacle: a chain of tapering segments, each hinged on the previous one, trailing towards -x
function tentacle(parent, mat, n, len, r0, club, spotMat) {
  const segs = [];
  let at = parent;
  for (let j = 0; j < n; j++) {
    const g = new THREE.Group();
    g.position.x = j ? -len : 0;
    const r1 = r0 * (1 - j / n), r2 = r0 * (1 - (j + 1) / n) + 0.6;
    const m = new THREE.Mesh(cached(`tn${r1.toFixed(1)}_${r2.toFixed(1)}_${len}`, () => new THREE.CylinderGeometry(r2, r1, len, 10).rotateZ(PI / 2)), mat);
    m.position.x = -len / 2;
    g.add(m);
    if (spotMat && j % 2) { const sp = new THREE.Mesh(sphere(r1 * 0.35), spotMat); sp.position.set(-len / 2, r1 * 0.8, 0); g.add(sp); }
    at.add(g);
    at = g;
    segs.push(g);
  }
  if (club) { const c = new THREE.Mesh(sphere(r0 * 1.1), mat); c.position.x = -len; c.scale.set(1.8, 0.8, 1.1); at.add(c); }
  return segs;
}

function kraken(b) { // Космический Кракен: a giant squid, mantle first, arms trailing and writhing
  const skin = new THREE.MeshStandardMaterial({ color: 0x8c2848, emissive: 0x3a0818, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.15 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xd07090, emissive: 0x401020, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.1 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5aa0).multiplyScalar(2.2) });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe070).multiplyScalar(2.4) });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x050005 });
  const mantle = b.add(sphere(60), skin, 60, 6, 0, { scale: [2.5, 0.9, 1.05] });
  b.add(sphere(56), belly, 55, -4, 0, { scale: [2.3, 0.7, 0.95] });
  for (const s of [1, -1]) b.add(hull('kr_fin' + s, side([[210, 3, 0], [210, -3, 0], [150, 3, 0], [150, -3, 0], [170, 2, 80], [165, -2, 80], [135, 2, 30], [135, -2, 30]], s)), skin);
  for (let i = 0; i < 7; i++) for (const s of [1, -1]) b.add(sphere(4), glow, 130 - i * 22, 30 - Math.abs(i - 3) * 2, s * (26 + (i % 2) * 8));
  b.add(sphere(46), skin, -60, 0, 0, { scale: [1.2, 0.85, 1.15] });
  for (const s of [1, -1]) { b.add(sphere(11), eye, -52, 14, s * 44); b.add(sphere(5.5), pupil, -54, 16, s * 53); }
  const arms = [];
  for (let i = 0; i < 10; i++) {
    const long = i >= 8, a = long ? (i === 8 ? 0.5 : -0.5) : (i / 8) * PI * 2;
    const root = new THREE.Group();
    root.position.set(-100, Math.sin(a) * 18, Math.cos(a) * 26);
    root.rotation.set(0, -Math.cos(a) * 0.3, Math.sin(a) * 0.25);
    b.group.add(root);
    arms.push({ segs: tentacle(root, i % 2 ? skin : belly, long ? 11 : 8, long ? 34 : 28, long ? 7 : 11, long, glow), ph: i * 0.9 });
  }
  const res = b.done(250);
  res.anim = t => {
    mantle.scale.x = 2.5 + Math.sin(t * 1.4) * 0.1;
    for (const arm of arms) arm.segs.forEach((g, j) => {
      g.rotation.z = Math.sin(t * 1.5 + arm.ph + j * 0.55) * 0.17;
      g.rotation.y = Math.cos(t * 1.05 + arm.ph * 1.3 + j * 0.5) * 0.13;
    });
  };
  return res;
}

function hive(b) { // Матка Роя: a pulsing lump of chitin and flesh, bristling with spines and glowing pores
  const r = rng(7);
  const flesh = new THREE.MeshStandardMaterial({ color: 0x4a5a1a, emissive: 0x1a2a05, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0.15 });
  const chitin = new THREE.MeshStandardMaterial({ color: 0x1e2410, roughness: 0.35, metalness: 0.5, flatShading: true });
  const pore = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9aff3a).multiplyScalar(2) });
  const sac = new THREE.MeshStandardMaterial({ color: 0x6aff40, emissive: 0x3aa010, emissiveIntensity: 1.1, roughness: 0.3 });
  const geo = cached('hive_body', () => {
    const g = new THREE.IcosahedronGeometry(100, 4), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.13 * Math.sin(v.x * 0.06 + 1) * Math.cos(v.y * 0.07) + 0.08 * Math.sin(v.z * 0.11 + v.x * 0.03);
      p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
    return g;
  });
  const body = b.add(geo, flesh, 0, 0, 0, { scale: [1.35, 0.85, 1.1] });
  const dir = new THREE.Vector3(), q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < 18; i++) {
    dir.set(r() * 2 - 1, r() * 1.2 - 0.3, r() * 2 - 1).normalize();
    const m = b.add(cone(9 + r() * 6, 50 + r() * 40, 5), chitin, dir.x * 118, dir.y * 78, dir.z * 100);
    m.quaternion.copy(q.setFromUnitVectors(X, dir));
  }
  const pores = [];
  for (let i = 0; i < 26; i++) {
    dir.set(r() * 2 - 1, r() * 1.4 - 0.4, r() * 2 - 1).normalize();
    pores.push(b.add(sphere(5 + r() * 4), pore, dir.x * 132, dir.y * 84, dir.z * 108));
  }
  const sacs = [[-120, 20, 40], [-130, -10, -30], [-100, 50, -10]].map(([x, y, z]) => b.add(sphere(26), sac, x, y, z));
  const res = b.done(170);
  res.anim = t => {
    const k = 1 + Math.sin(t * 2.1) * 0.035;
    body.scale.set(1.35 * k, 0.85 / k, 1.1 * k);
    sacs.forEach((m, i) => m.scale.setScalar(1 + Math.sin(t * 2.6 + i * 2) * 0.12));
    pores.forEach((m, i) => m.scale.setScalar(0.7 + 0.5 * Math.max(0, Math.sin(t * 3 + i))));
  };
  return res;
}

function leviathan(b) { // Кристальный Левиафан: a whale of living crystal with a glowing heart
  const crystal = new THREE.MeshStandardMaterial({ color: 0x86d8ff, emissive: 0x2476b0, emissiveIntensity: 0.75, metalness: 0.35, roughness: 0.12, flatShading: true });
  const deep = new THREE.MeshStandardMaterial({ color: 0x3a6ab0, emissive: 0x14306a, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.2, flatShading: true });
  const heart = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe8ff).multiplyScalar(2.4) });
  b.add(hull('lv_body', symm([[190, 0, 0], [150, 32, 28], [150, -26, 30], [60, 48, 56], [60, -42, 58], [-40, 42, 50], [-40, -36, 50], [-140, 22, 24], [-140, -16, 24], [-200, 8, 10], [-200, -6, 10]])), crystal);
  b.add(hull('lv_jaw', symm([[184, -8, 0], [140, -30, 26], [60, -44, 50], [100, -30, 40]])), deep);
  for (let i = 0; i < 6; i++) b.add(cone(10, 50 - i * 5, 4), crystal, 110 - i * 40, 44 - i * 4, 0, { rot: [0, 0, PI / 2 - 0.5] });
  b.add(hull('lv_vein', symm([[150, 33, 2], [60, 49, 3], [-40, 43, 3], [-140, 23, 2], [-140, 21, 0.1]])), heart);
  b.add(sphere(20), heart, 40, 10, 0);
  for (const s of [1, -1]) b.add(sphere(6), heart, 150, 12, s * 30);
  const fins = [1, -1].map(s => {
    const g = new THREE.Group(); g.position.set(40, -20, s * 50); b.group.add(g);
    g.add(new THREE.Mesh(hull('lv_fin' + s, side([[20, 3, 0], [20, -3, 0], [-20, 3, 0], [-20, -3, 0], [-60, 1, 110], [-80, -1, 100]], s)), deep));
    return g;
  });
  const tail = new THREE.Group(); tail.position.set(-195, 0, 0); b.group.add(tail);
  tail.add(new THREE.Mesh(hull('lv_tail', symm([[10, 6, 8], [10, -5, 8], [-40, 4, 10], [-40, -3, 10], [-90, 2, 110], [-70, 1, 30], [-110, 1, 90]])), crystal));
  const res = b.done(250);
  res.anim = t => {
    tail.rotation.y = Math.sin(t * 1.1) * 0.35;
    fins.forEach((f, i) => { f.rotation.x = (i ? -1 : 1) * Math.sin(t * 1.1 + 1) * 0.25; });
  };
  return res;
}

function drone(b) { // трутень: a buzzing insect the size of a fighter
  const chitin = new THREE.MeshStandardMaterial({ color: 0x3a4a14, emissive: 0x142205, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9aff3a).multiplyScalar(2) });
  const wingM = new THREE.MeshBasicMaterial({ color: 0x9aff3a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  b.add(sphere(8), chitin, -4, 0, 0, { scale: [2.2, 0.9, 1.1] });
  b.add(sphere(6), chitin, 14, 1, 0);
  for (const s of [1, -1]) b.add(sphere(2), glow, 18, 3, s * 3.5);
  b.add(cone(2.5, 12, 5), chitin, -26, 0, 0, { rot: [0, PI, 0] });
  const wings = [];
  for (const s of [1, -1]) for (const x of [4, -6]) {
    const g = new THREE.Group(); g.position.set(x, 5, s * 3); b.group.add(g);
    const w = new THREE.Mesh(box(10, 0.4, 20), wingM); w.position.z = s * 10; g.add(w);
    wings.push([g, s]);
  }
  const res = b.done(26);
  res.anim = t => wings.forEach(([g, s], i) => { g.rotation.x = s * (0.2 + Math.sin(t * 38 + i) * 0.6); });
  return res;
}

const MONSTERS = { kraken: [kraken, 1.3], hive: [hive, 1.25], nemesis: [nemesis, 3], leviathan: [leviathan, 1.3], swarm: [drone, 1] };

// ---- stations: orbital structures you can dock at, dressed in the colour of their service

function station(b, type, glow) {
  const r = rng(type.length * 31 + 5);
  const ring = (rad, tube, mat, rot = [PI / 2, 0, 0]) => b.add(cached(`tor${rad}_${tube}`, () => new THREE.TorusGeometry(rad, tube, 8, 40)), mat, 0, 0, 0, { rot });
  const spin = [];
  switch (type) {
    case 'ranger': { // a four-armed star with a bright heart
      b.add(cached('oct20', () => new THREE.OctahedronGeometry(22, 0)), 'accent');
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a);
        b.add(box(56, 5, 7), 'plate', c * 30, 0, s * 30, { rot: [0, -a, 0] });
        b.add(box(12, 12, 12), 'hull', c * 60, 0, s * 60, { rot: [0, -a, 0] });
        b.add(box(3, 3, 3), glow, c * 67, 6, s * 67);
      }
      spin.push(ring(72, 2.5, 'accent'));
      b.add(cylY(1, 40, 4), 'dark', 0, 20, 0);
      break;
    }
    case 'military': { // an armoured hexagon bristling with turrets
      b.add(cached('hex48', () => new THREE.CylinderGeometry(48, 52, 14, 6)), 'hull');
      b.add(cached('hex30', () => new THREE.CylinderGeometry(28, 34, 12, 6)), 'plate', 0, 12, 0);
      for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.turret(Math.cos(a) * 40, 7, Math.sin(a) * 40, 5); }
      for (const s of [1, -1]) { b.add(cylY(2.5, 44, 6), 'dark', s * 14, 30, 0); b.add(box(4, 4, 4), glow, s * 14, 53, 0); }
      ring(53, 1.8, 'accent');
      for (const s of [1, -1]) b.add(box(30, 4, 10), 'dark', s * 62, 0, 0);
      break;
    }
    case 'science': { // a glass sphere inside a spinning ring, with dishes and solar wings
      b.add(sphere(26), 'glass');
      spin.push(ring(56, 4, 'hull'));
      for (const s of [1, -1]) {
        b.add(box(3, 1.2, 70), 'dark', s * 44, 0, 0);
        b.add(box(24, 0.8, 60), 'glass', s * 70, 0, 0);
        b.add(cylY(16, 3, 16), 'plate', s * 18, 32, 0, { rot: [0, 0, s * 0.6] });
      }
      b.add(cylY(1, 36, 4), 'dark', 0, 34, 0);
      b.add(sphere(3), glow, 0, 53, 0);
      break;
    }
    case 'pirate': { // scrap welded onto a hollowed-out asteroid
      const rock = new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 0.95, metalness: 0.05, flatShading: true });
      b.add(cached('ast40', () => new THREE.DodecahedronGeometry(40, 1)), rock, 0, 0, 0, { scale: [1.3, 0.8, 1] });
      for (let i = 0; i < 7; i++) {
        const a = r() * PI * 2, d = 36 + r() * 20;
        b.add(box(12 + r() * 20, 8 + r() * 12, 10 + r() * 16), r() < 0.5 ? 'plate' : 'dark', Math.cos(a) * d, r() * 20 - 6, Math.sin(a) * d, { rot: [r() * 0.5, a, r() * 0.4] });
      }
      for (let i = 0; i < 5; i++) { const a = r() * PI * 2; b.add(cone(4, 30, 4), 'dark', Math.cos(a) * 58, 4, Math.sin(a) * 58, { rot: [0, -a, 0] }); }
      for (let i = 0; i < 6; i++) { const a = i * 1.1; b.add(box(3, 3, 3), 'navR', Math.cos(a) * 50, 16, Math.sin(a) * 50); }
      b.add(cylY(1.2, 30, 4), 'dark', 10, 26, -8);
      break;
    }
    case 'medical': { // a white wheel with glowing crosses
      const white = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.3, roughness: 0.35, flatShading: true });
      spin.push(b.add(cached('tor50_8', () => new THREE.TorusGeometry(50, 8, 8, 32)), white, 0, 0, 0, { rot: [PI / 2, 0, 0] }));
      b.add(cached('cyl16', () => new THREE.CylinderGeometry(16, 16, 30, 12)), white);
      for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.add(box(34, 3, 3), white, Math.cos(a) * 32, 0, Math.sin(a) * 32, { rot: [0, -a, 0] }); }
      b.add(box(24, 2, 7), glow, 0, 16, 0);
      b.add(box(7, 2, 24), glow, 0, 16, 0);
      break;
    }
    case 'business': { // a golden tower ringed with pods
      const gold = new THREE.MeshStandardMaterial({ color: 0xd8a830, emissive: 0x3a2400, emissiveIntensity: 0.4, metalness: 0.9, roughness: 0.25, flatShading: true });
      for (let i = 0; i < 4; i++) b.add(cached('bt' + i, () => new THREE.CylinderGeometry(20 - i * 4, 22 - i * 4, 18, 8)), i % 2 ? gold : 'hull', 0, -14 + i * 17, 0);
      b.add(cone(6, 22, 8), gold, 0, 60, 0, { rot: [0, 0, PI / 2] });
      spin.push(ring(52, 2.2, gold));
      for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.add(box(12, 10, 12), 'glass', Math.cos(a) * 52, 0, Math.sin(a) * 52); b.add(box(30, 1.5, 1.5), 'dark', Math.cos(a) * 36, 0, Math.sin(a) * 36, { rot: [0, -a, 0] }); }
      break;
    }
  }
  const res = b.done(80);
  res.anim = t => spin.forEach(m => { m.rotation.z = t * 0.4; });
  return res;
}

export function buildStation(type) {
  const col = (STATIONS[type] || STATIONS.ranger).col;
  const b = new Builder(palette(col, col));
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2) });
  return station(b, type, glow);
}

export const ENGINE_COLORS = { player: 0x66ddff, trader: 0xffd070, pirate: 0xff6a3a, militia: 0x6ab8ff, dom: 0xc070ff, citadel: 0xc070ff, boss: 0xff5040, swarm: 0x9aff3a };

export function buildShipModel(ship) {
  const hd = eqDef(ship.eq && ship.eq.hull) || eqDef('h1');
  const tier = Math.min(4, hd.tier);
  const engineColor = ENGINE_COLORS[ship.kind] || 0x66ddff;
  const b = new Builder(palette(ship.kind === 'dom' ? 0x8a50e0 : ship.kind === 'citadel' ? 0xb080ff : ship.kind === 'boss' ? 0x9a3020 : ship.color, engineColor));
  if (ship.kind === 'citadel') return { ...citadel(b), engineColor };
  if (ship.kind === 'dom') return { ...dominator(b, tier), engineColor };
  if (ship.kind === 'boss' || ship.kind === 'swarm') {
    const [make, k] = MONSTERS[ship.boss] || MONSTERS.swarm;
    const res = make(b);
    res.group.scale.setScalar(k);
    res.radius *= k;
    for (const e of res.engines) { e.pos.multiplyScalar(k); e.size *= k; }
    res.engineColor = engineColor;
    return res;
  }
  const res = (HULL_BUILDERS[hd.model] || scout)(b);
  if (ship.kind === 'pirate') pirateMods(b, res.radius);
  const k = HULL_SCALE[hd.model] || 1;
  res.group.scale.setScalar(k);
  res.radius *= k;
  for (const e of res.engines) { e.pos.multiplyScalar(k); e.size *= k; }
  res.mats = b.done(res.radius).mats; // pirate parts added materials
  res.engineColor = engineColor;
  return res;
}

// Engine glow sprites shared by the game renderer and the ship viewer.
export function attachEngineGlows(model, parent, glowTex) {
  const sprites = [];
  for (const e of model.engines) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: model.engineColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
    sp.position.copy(e.pos);
    sp.userData.base = e.size * 4;
    sp.scale.setScalar(sp.userData.base);
    parent.add(sp);
    sprites.push(sp);
    model.mats.push(sp.material);
  }
  return sprites;
}
