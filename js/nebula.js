// Procedural nebula textures: domain-warped fractal noise with ragged edges,
// dark dust lanes and a hot core. Every star system gets its own seeded clouds.
import * as THREE from 'three';

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function valueNoise(rand) {
  const perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rand(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y) => val[perm[(x & 255) + perm[y & 255]]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(n, x, y, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); f *= 2.02; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const PALETTES = [
  [0x3a1c71, 0xd76d77, 0xffc59b], // violet → rose → peach
  [0x0b2a3a, 0x2c7a94, 0x9ff5ec], // deep teal → cyan
  [0x2a1450, 0x8d4bc4, 0xf0b0ff], // purple → lilac
  [0x0f3a33, 0x3fa37a, 0xd8ff9a], // green → lime
  [0x4a0a18, 0xc0392b, 0xffc26b], // crimson → amber
  [0x141f5c, 0x4a69bd, 0xbdf6ff], // navy → sky
  [0x3a2408, 0xb86b1f, 0xfff0b0], // bronze → gold
];

// size×size RGBA texture; `dustiness` controls how much the dark lanes cut in
export function nebulaTexture(seed, palette, size = 320, dustiness = 0.75, scale = 3) {
  const rand = rng(seed);
  const n1 = valueNoise(rand), n2 = valueNoise(rand);
  const ox = rand() * 100, oy = rand() * 100;
  const [A, B, C] = palette.map(c => new THREE.Color(c));
  const img = new ImageData(size, size), d = img.data;
  const col = new THREE.Color();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size - 0.5, v = y / size - 0.5;
    const px = u * scale + ox, py = v * scale + oy;
    const wx = fbm(n1, px, py, 4), wy = fbm(n1, px + 5.2, py + 1.3, 4);
    const den = fbm(n1, px + 2.2 * wx, py + 2.2 * wy, 6);
    const rad = Math.sqrt(u * u + v * v) * 2;
    const edge = 1 - smooth(0.3, 1.0, rad + (fbm(n2, px * 1.4, py * 1.4, 3) - 0.5) * 0.9);
    let a = Math.pow(Math.max(0, (den - 0.42) * 2.4), 1.7) * edge;
    const dust = fbm(n2, px * 2.2 + wx, py * 2.2 + wy, 5);
    a *= 1 - dustiness * smooth(0.5, 0.66, dust);
    a = Math.min(1, a);
    const t = smooth(0.25, 0.75, wx * 0.6 + den * 0.6);
    col.copy(A).lerp(B, t).lerp(C, smooth(0.62, 0.85, den) * edge);
    const i = (y * size + x) * 4;
    d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255; d[i + 3] = a * 255;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const cache = new Map();
// A group of layered nebula planes far below the system plane.
export function buildNebulae(sysId, dominated) {
  const rand = rng(sysId * 7919 + 17);
  const group = new THREE.Group();
  const main = dominated ? 2 : Math.floor(rand() * PALETTES.length);
  const second = (main + 1 + Math.floor(rand() * (PALETTES.length - 1))) % PALETTES.length;
  const layers = [
    { pal: main, size: 34000, y: -9000, op: 0.55, dust: 0.8, scale: 3 },
    { pal: main, size: 20000, y: -6500, op: 0.38, dust: 0.6, scale: 2.4 },
    { pal: second, size: 16000, y: -5500, op: 0.35, dust: 0.7, scale: 3.2 },
    { pal: 5, size: 50000, y: -12000, op: 0.22, dust: 0.3, scale: 1.6 }, // faint galactic haze
  ];
  layers.forEach((L, i) => {
    const key = `${sysId}_${i}_${L.pal}`;
    if (!cache.has(key)) cache.set(key, nebulaTexture(sysId * 101 + i * 13 + 1, PALETTES[L.pal], i === 3 ? 192 : 320, L.dust, L.scale));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L.size, L.size), new THREE.MeshBasicMaterial({
      map: cache.get(key), transparent: true, opacity: L.op, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.rotation.set(-Math.PI / 2, 0, rand() * Math.PI * 2);
    m.position.set((rand() - 0.5) * 8000, L.y, (rand() - 0.5) * 8000);
    m.renderOrder = -10;
    group.add(m);
  });
  return group;
}
