// Engine trails: a glowing ribbon through the recent positions of a nozzle,
// tapering and fading with age. Lives in world space, fed once per frame.
import * as THREE from 'three';

const MAX = 48;          // stored points per trail
const MIN_STEP = 5;      // world units between stored points
const TELEPORT = 600;    // a jump larger than this resets the trail

// shared index buffer: a triangle strip written as a list
const INDEX = (() => {
  const idx = [];
  for (let i = 0; i < MAX; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return idx;
})();

export class Trail {
  // life: seconds (of turn-animation time) a point stays visible
  constructor(color, life = 1.3) {
    this.life = life;
    this.pts = []; // {x, y, z, t}
    this.pos = new Float32Array((MAX + 1) * 2 * 3);
    this.col = new Float32Array((MAX + 1) * 2 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(INDEX);
    g.setDrawRange(0, 0);
    this.color = new THREE.Color(color).multiplyScalar(1.1);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  reset() { this.pts.length = 0; this.mesh.geometry.setDrawRange(0, 0); }

  // p: current nozzle world position; emitting: whether the ship is visible and flying
  update(p, now, emitting, width, opacity = 1) {
    const t = now / 1000, pts = this.pts;
    const last = pts[pts.length - 1];
    if (emitting) {
      if (last && Math.hypot(p.x - last.x, p.z - last.z) > TELEPORT) pts.length = 0;
      if (!pts.length || Math.hypot(p.x - pts[pts.length - 1].x, p.z - pts[pts.length - 1].z) >= MIN_STEP) {
        pts.push({ x: p.x, y: p.y, z: p.z, t });
        if (pts.length > MAX) pts.shift();
      }
    }
    while (pts.length && t - pts[0].t > this.life) pts.shift();
    // the live head follows the nozzle every frame so the ribbon never lags behind the ship
    const all = emitting && pts.length ? [...pts, { x: p.x, y: p.y, z: p.z, t }] : pts;
    const n = all.length;
    if (n < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const a = all[Math.max(0, i - 1)], b = all[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      const age = Math.min(1, (t - all[i].t) / this.life);
      const fresh = i / (n - 1); // 0 = tail, 1 = nozzle
      const w = width * (0.25 + 0.75 * fresh) * (1 - age * 0.5);
      const alpha = Math.pow(1 - age, 1.6) * Math.pow(fresh, 0.7) * 0.75 * opacity;
      const px = -dz * w, pz = dx * w, o = i * 6, c = i * 8;
      this.pos[o] = all[i].x + px; this.pos[o + 1] = all[i].y; this.pos[o + 2] = all[i].z + pz;
      this.pos[o + 3] = all[i].x - px; this.pos[o + 4] = all[i].y; this.pos[o + 5] = all[i].z - pz;
      for (const k of [0, 4]) { this.col[c + k] = this.color.r; this.col[c + k + 1] = this.color.g; this.col[c + k + 2] = this.color.b; this.col[c + k + 3] = alpha; }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
