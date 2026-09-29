// Hard-surface ship models built from convex hulls and primitives. Forward is +x, up is +y.
// Every builder returns { group, engines: [{pos, size}], radius, mats: [Material] }.
// Style: faceted gunmetal hulls, faction colour only on accent panels and lights.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

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

function courier(b) { // h2 «Курьер»: armoured cab, spine and a rack of cargo containers
  b.add(hull('co_cab', symm([[44, 0, 0], [36, 6, 6], [36, -5, 6], [26, 9, 9], [26, -7, 9], [12, 9, 9], [12, -7, 9], [40, 2, 4]])), 'hull');
  b.add(hull('co_win', symm([[38, 4.2, 3], [30, 8.2, 6], [30, 6.2, 7.6], [36, 3, 5.2]])), 'glass');
  b.add(box(70, 7, 7), 'dark', -18, 0, 0);
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
    const x = 3 - i * 14.5;
    b.add(box(13, 11, 11), (i + (s > 0 ? 0 : 1)) % 2 ? 'accent' : 'plate', x, 1.5, s * 7);
    b.add(box(13.4, 1, 11.4), 'dark', x, 7.3, s * 7);
  }
  b.add(hull('co_eng', symm([[-48, 7, 9], [-48, -6, 9], [-58, 6, 8], [-58, -5, 8], [-44, 7, 6], [-44, -6, 6]])), 'hull');
  for (const s of [1, -1]) {
    b.add(box(14, 0.8, 11), 'plate', -50, 0, s * 15);
    b.add(box(14, 0.8, 11), 'plate', -50, 3, s * 15);
    b.engine(-60, 0.5, s * 4.5, 4, 6);
  }
  b.add(cylY(0.5, 10, 4), 'dark', 18, 13, 0);
  b.add(box(3, 0.6, 3), 'accent', 18, 18, 0);
  b.nav(-50, 1.5, 20.5);
  return b.done(62);
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

const HULL_BUILDERS = { h1: scout, h2: courier, h3: ranger, h4: corvette, h5: cruiser };
const HULL_SCALE = { h1: 0.9, h2: 0.9, h3: 0.95, h4: 1, h5: 1.05 };

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

export const ENGINE_COLORS = { player: 0x66ddff, trader: 0xffd070, pirate: 0xff6a3a, militia: 0x6ab8ff, dom: 0xc070ff, citadel: 0xc070ff };

export function buildShipModel(ship) {
  const tier = ['h1', 'h2', 'h3', 'h4', 'h5'].indexOf(ship.eq.hull);
  const engineColor = ENGINE_COLORS[ship.kind] || 0x66ddff;
  const b = new Builder(palette(ship.kind === 'dom' ? 0x8a50e0 : ship.kind === 'citadel' ? 0xb080ff : ship.color, engineColor));
  if (ship.kind === 'citadel') return { ...citadel(b), engineColor };
  if (ship.kind === 'dom') return { ...dominator(b, Math.max(0, tier)), engineColor };
  const res = (HULL_BUILDERS[ship.eq.hull] || scout)(b);
  if (ship.kind === 'pirate') pirateMods(b, res.radius);
  const k = HULL_SCALE[ship.eq.hull] || 1;
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
