// Ship models assembled from primitives. Forward is +x, up is +y.
// Every builder returns { group, engines: [Vector3], radius, mats: [Material] }.
import * as THREE from 'three';

const PI = Math.PI;
const geoCache = new Map();
const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };

// ---- geometry helpers (all cached, smooth-shaded unless noted)
const capsuleX = (r, len) => cached(`cap${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 8, 20).rotateZ(PI / 2));
// cylinder along x; rFront is the radius at +x
const cylX = (rFront, rBack, len, seg = 20) => cached(`cyl${rFront}_${rBack}_${len}_${seg}`, () => new THREE.CylinderGeometry(rFront, rBack, len, seg).rotateZ(-PI / 2));
const sphere = r => cached(`sph${r}`, () => new THREE.SphereGeometry(r, 32, 20));
const box = (x, y, z) => cached(`box${x}_${y}_${z}`, () => new THREE.BoxGeometry(x, y, z));
const torus = (r, t) => cached(`tor${r}_${t}`, () => new THREE.TorusGeometry(r, t, 12, 48));
const cone = (r, h, seg = 12) => cached(`cone${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg).rotateZ(-PI / 2)); // tip points +x
// flat plate in the x/z plane from [x, z] points, `thick` tall
function plate(key, pts, thick) {
  return cached('plate' + key, () => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 1 });
    g.translate(0, 0, -thick / 2);
    g.rotateX(PI / 2);
    return g;
  });
}
// vertical fin in the x/y plane
function fin(key, pts, thick) {
  return cached('fin' + key, () => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: thick, bevelEnabled: false });
    g.translate(0, 0, -thick / 2);
    return g;
  });
}
const mirrorZ = pts => pts.map(([x, z]) => [x, -z]);

// ---- materials (per ship, so each can fade independently)
function palette(color, engineColor) {
  const c = new THREE.Color(color);
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.35, ...o });
  return {
    hull: std({ color: c, emissive: c, emissiveIntensity: 0.18 }),
    trim: std({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.45), emissive: c, emissiveIntensity: 0.1, metalness: 0.5 }),
    dark: std({ color: 0x2c333f, metalness: 0.7, roughness: 0.45 }),
    glass: std({ color: 0x9fdcff, emissive: 0x2a6aa0, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.08 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(engineColor).multiplyScalar(2.2) }),
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
  // engine housing + glowing nozzle; glow sprite is attached later by the renderer
  engine(x, y, z, r, len) {
    this.add(cylX(r, r * 1.2, len), 'dark', x, y, z);
    this.add(cylX(r * 0.95, r * 0.95, 1.5), 'glow', x - len / 2 - 0.5, y, z);
    this.engines.push({ pos: new THREE.Vector3(x - len / 2 - 3, y, z), size: r });
  }
  turret(x, y, z, r = 6) {
    this.add(cylX(r, r, r * 0.9, 16), 'dark', x, y, z, { rot: [0, 0, PI / 2] });
    this.add(sphere(r * 0.75), 'trim', x, y + r * 0.35, z, { scale: [1, 0.6, 1] });
    this.add(cylX(1.4, 1.4, r * 2.6, 8), 'dark', x + r * 1.4, y + r * 0.45, z);
  }
  done(radius) {
    const mats = new Set();
    this.group.traverse(o => { if (o.material) mats.add(o.material); });
    return { group: this.group, engines: this.engines, radius, mats: [...mats] };
  }
}

// ---- hulls

function scout(b) { // h1: small capsule with swept wings
  b.add(capsuleX(9, 42), 'hull');
  b.add(sphere(7), 'glass', 13, 6, 0, { scale: [1.7, 0.8, 0.9] });
  b.add(plate('s1', [[8, 3], [-12, 30], [-21, 30], [-17, 3]], 3), 'trim');
  b.add(plate('s1m', mirrorZ([[8, 3], [-12, 30], [-21, 30], [-17, 3]]), 3), 'trim');
  b.add(sphere(3), 'glow', -17, 0, 30);
  b.add(sphere(3), 'glow', -17, 0, -30);
  b.engine(-30, 0, 0, 7, 12);
  return b.done(48);
}

function courier(b) { // h2: body with a cargo pod and twin engines
  b.add(capsuleX(12, 48), 'hull');
  b.add(box(42, 14, 32), 'dark', -6, -7, 0);
  b.add(box(30, 3, 34), 'trim', -6, 1, 0);
  b.add(sphere(9), 'glass', 26, 8, 0, { scale: [1.5, 0.7, 1] });
  b.add(plate('c1', [[2, 14], [-20, 30], [-32, 30], [-26, 14]], 4), 'hull');
  b.add(plate('c1m', mirrorZ([[2, 14], [-20, 30], [-32, 30], [-26, 14]]), 4), 'hull');
  b.engine(-34, 0, 13, 6, 16);
  b.engine(-34, 0, -13, 6, 16);
  return b.done(56);
}

function ranger(b) { // h3: arrowhead with outrigger nacelles and a tail fin
  b.add(plate('r1', [[56, 0], [-28, 36], [-16, 0], [-28, -36]], 8), 'hull');
  b.add(capsuleX(10, 50), 'trim', 2, 5, 0);
  b.add(sphere(9), 'glass', 24, 13, 0, { scale: [1.8, 0.7, 1] });
  b.add(fin('r2', [[-6, 0], [-30, 24], [-38, 24], [-30, 0]], 3), 'hull', 0, 8, 0);
  for (const z of [30, -30]) {
    b.add(capsuleX(7, 26), 'dark', -14, 0, z);
    b.add(sphere(2.5), 'glow', 8, 0, z);
    b.engine(-34, 0, z, 6, 10);
  }
  b.engine(-26, 5, 0, 8, 12);
  return b.done(66);
}

function corvette(b) { // h4: long armoured hull, side sponsons, turrets
  b.add(cylX(12, 18, 92), 'hull', 4, 0, 0);
  b.add(cylX(1, 12, 24), 'hull', 62, 0, 0);
  b.add(box(64, 8, 26), 'trim', 0, 13, 0);
  b.add(sphere(8), 'glass', 38, 13, 0, { scale: [1.8, 0.8, 1.1] });
  for (const z of [27, -27]) {
    b.add(box(54, 12, 14), 'dark', -12, 0, z);
    b.add(capsuleX(6, 44), 'trim', -12, 7, z);
    const sgn = Math.sign(z);
    b.add(plate('k' + sgn, [[4, 33 * sgn], [-18, 46 * sgn], [-30, 46 * sgn], [-26, 33 * sgn]], 3), 'hull');
    b.engine(-45, 0, z, 8, 14);
  }
  b.engine(-48, 0, 0, 10, 16);
  b.turret(22, 17, 0, 7);
  b.turret(-14, 17, 0, 7);
  return b.done(80);
}

function cruiser(b) { // h5: capital ship with a bridge tower, big wings and batteries
  b.add(cylX(14, 22, 124), 'hull', 0, 0, 0);
  b.add(cylX(2, 14, 32), 'hull', 78, 0, 0);
  b.add(box(96, 10, 46), 'dark', -6, -8, 0);
  b.add(box(70, 6, 30), 'trim', 4, 16, 0);
  b.add(box(20, 22, 16), 'trim', -30, 26, 0);
  b.add(sphere(7), 'glass', -20, 32, 0, { scale: [1.2, 0.6, 1.6] });
  b.add(fin('x1', [[-20, 0], [-48, 30], [-58, 30], [-50, 0]], 3), 'hull', 0, 30, 0);
  for (const z of [1, -1]) {
    b.add(plate('w' + z, [[16, 20 * z], [-40, 64 * z], [-62, 64 * z], [-52, 20 * z]], 5), 'hull', 0, -2, 0);
    b.add(capsuleX(7, 34), 'trim', -48, -2, 64 * z);
    b.add(sphere(3), 'glow', -26, -2, 64 * z);
    b.engine(-64, 0, 13 * z, 10, 18);
    b.engine(-66, -2, 40 * z, 8, 14);
    b.turret(-6, 4, 24 * z, 6);
  }
  b.turret(44, 20, 0, 8);
  b.turret(16, 20, 0, 8);
  return b.done(100);
}

const HULL_BUILDERS = { h1: scout, h2: courier, h3: ranger, h4: corvette, h5: cruiser };
const HULL_SCALE = { h1: 0.85, h2: 0.9, h3: 0.95, h4: 1, h5: 1.05 };

// pirates bolt jagged blades onto whatever hull they stole
function pirateMods(b, r) {
  for (const z of [1, -1]) b.add(cone(4, r * 0.55, 4), 'dark', r * 0.55, -2, 10 * z, { rot: [0, -0.35 * z, 0] });
  b.add(fin('pj', [[0, 0], [-10, 12], [-24, 12], [-16, 0]], 2), 'trim', 0, 8, 0);
}

// Dominators: faceted crystal core, forward spikes, a halo ring
function dominator(b, tier) {
  const size = 16 + tier * 4;
  const crystal = new THREE.MeshStandardMaterial({ color: 0x6a20c8, emissive: 0x7a2cff, emissiveIntensity: 0.55, flatShading: true, metalness: 0.4, roughness: 0.3 });
  b.add(cached('ico' + size, () => new THREE.IcosahedronGeometry(size, 0)), crystal, 0, 0, 0, { scale: [1.5, 0.8, 1] });
  const spikes = 3 + tier;
  for (let i = 0; i < spikes; i++) {
    const a = (i / (spikes - 1) - 0.5) * 1.6;
    const len = size * (i === (spikes - 1) / 2 ? 2.6 : 1.8);
    b.add(cone(size * 0.22, len, 5), crystal, Math.cos(a) * size, 0, Math.sin(a) * size * 1.1, { rot: [0, -a, 0] }).position.x += len * 0.35;
  }
  b.add(torus(size * 1.3, 2), 'trim', -size * 0.3, 0, 0, { rot: [PI / 2, 0, 0], scale: [1, 1.3, 1] });
  b.add(sphere(size * 0.28), 'glow', size * 1.1, size * 0.35, 0);
  b.engines.push({ pos: new THREE.Vector3(-size * 1.4, 0, 0), size: size * 0.5 });
  return b.done(size * 2.6);
}

function citadel(b) {
  const crystal = new THREE.MeshStandardMaterial({ color: 0x7020c0, emissive: 0x6010ff, emissiveIntensity: 0.9, flatShading: true });
  b.add(cached('oct170', () => new THREE.OctahedronGeometry(150, 0)), crystal);
  b.add(torus(210, 7), 'trim', 0, 0, 0, { rot: [PI / 2, 0, 0] });
  b.add(torus(260, 5), 'trim', 0, 0, 0, { rot: [PI / 2 + 0.5, 0.3, 0] });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2;
    b.add(cone(18, 110, 5), crystal, Math.cos(a) * 190, 0, Math.sin(a) * 190, { rot: [0, -a, 0] });
  }
  b.add(sphere(40), 'glow', 0, 160, 0);
  return b.done(280);
}

const ENGINE_COLORS = { player: 0x66ddff, trader: 0xffd070, pirate: 0xff6a3a, militia: 0x6ab8ff, dom: 0xc070ff, citadel: 0xc070ff };

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
export { ENGINE_COLORS };
