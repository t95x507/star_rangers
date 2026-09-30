// Three.js star-system view.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as D from './data.js';
import { SUB, planetPos, stats, predictPath } from './sim.js';
import { buildShipModel, attachEngineGlows, buildStation } from './models.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as Audio from './audio.js';
import { buildNebulae } from './nebula.js';
import { Trail } from './trails.js';

export const DAY_MS = 3000; // one game day at normal speed (effects and trails run on game time)

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,200,120,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function planetTexture(color, seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 256, 128);
  const banded = rand() < 0.5;
  for (let i = 0; i < (banded ? 26 : 60); i++) {
    const col = base.clone().offsetHSL((rand() - 0.5) * 0.08, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3);
    g.fillStyle = '#' + col.getHexString();
    g.globalAlpha = 0.25 + rand() * 0.4;
    if (banded) g.fillRect(0, rand() * 128, 256, 2 + rand() * 12);
    else { g.beginPath(); g.ellipse(rand() * 256, rand() * 128, 6 + rand() * 30, 4 + rand() * 16, 0, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// how each weapon looks: beams are instant, tracers/projectiles travel (times in fractions of a game day)
const SHOT_STYLE = {
  beam: { type: 'beam', travel: 0, show: 0.03 },
  pulse: { type: 'beam', travel: 0, show: 0.012 },
  ion: { type: 'beam', travel: 0, show: 0.045 },
  rail: { type: 'beam', travel: 0, show: 0.06 },
  anni: { type: 'beam', travel: 0, show: 0.07 },
  tentacle: { type: 'beam', travel: 0, show: 0.05 },
  wave: { type: 'beam', travel: 0, show: 0.06 },
  mg: { type: 'tracer', travel: 0.01 },
  tracer: { type: 'tracer', travel: 0.015 },
  swarm: { type: 'tracer', travel: 0.02 },
  proj: { type: 'proj', travel: 0.035, size: 70 },
  acid: { type: 'proj', travel: 0.05, size: 60 },
  missile: { type: 'proj', travel: 0.06, size: 45 },
  torp: { type: 'proj', travel: 0.1, size: 90 },
  nova: { type: 'proj', travel: 0.05, size: 120 },
};

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

export class View {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(r.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.camera = new THREE.PerspectiveCamera(50, 1, 10, 80000);
    this.camera.position.set(0, 2800, 1800);
    const ctl = this.controls = new OrbitControls(this.camera, r.domElement);
    ctl.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    ctl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    ctl.screenSpacePanning = false;
    ctl.maxPolarAngle = 1.25; ctl.minDistance = 500; ctl.maxDistance = 14000;
    ctl.enableDamping = true; ctl.dampingFactor = 0.12;
    ctl.addEventListener('start', () => { this.focusAnim = null; }); // manual camera move cancels a focus flight

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // the star is the key light; only a faint cold fill keeps shadow sides from going pitch black
    this.scene.add(new THREE.HemisphereLight(0x6a86c0, 0x0a0c14, 0.12));
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.02));
    // soft studio reflections so metal hulls catch highlights instead of looking like plastic
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.06;
    this._background();
    this.sysGroup = new THREE.Group(); this.scene.add(this.sysGroup);
    this.shipGroup = new THREE.Group(); this.scene.add(this.shipGroup);
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
    this.trailGroup = new THREE.Group(); this.scene.add(this.trailGroup);
    this._tmpV = new THREE.Vector3();
    this.glowTex = glowTexture();
    this.boomTex = glowTexture('rgba(255,255,220,1)', 'rgba(255,120,30,0.6)');
    this.hitGeo = new THREE.SphereGeometry(95, 8, 6);
    this.hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.ships = new Map();
    this.loot = new Map();
    this.planets = new Map();
    this.sysId = null; this.sysOwner = null;

    const lineMat = new THREE.LineDashedMaterial({ color: 0x66ffaa, dashSize: 40, gapSize: 30, transparent: true, opacity: 0.8 });
    this.orderLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    this.orderLine.frustumCulled = false;
    this.scene.add(this.orderLine);
    this.rangeRing = new THREE.LineLoop(this._circleGeo(1, 96), new THREE.LineBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.35 }));
    this.scene.add(this.rangeRing);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.selRing);

    this.raycaster = new THREE.Raycaster();
    this.fx = [];
    this.floaters = [];
    this.lootGeo = new THREE.BoxGeometry(30, 30, 30);
    this.lootEqGeo = new THREE.OctahedronGeometry(26);
    this.snaps = [];            // snapshots streamed by the host: { T, ships: Map(id -> [id, sys, x, y, hd*100, hull, landed]) }
    this.T = 0;                 // render time in substeps
    this.clockOff = null;
    this.subMs = DAY_MS / SUB;  // real ms per substep at the host's current speed
    this.lastFight = new Map(); // ship id -> T of its last shot fired or taken
    this.pickedLoot = new Set();
    this.info = {};             // last known data of every drawn ship (outlives a wreck's removal)
    this.focusPending = true;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  _circleGeo(r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  _background() {
    // two star layers: many faint pinpoints and fewer bright coloured stars
    const layer = (n, size, bright) => {
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(30000 + Math.random() * 10000);
        pos.set([v.x, v.y, v.z], i * 3);
        const c = new THREE.Color().setHSL(Math.random() < 0.3 ? 0.08 + Math.random() * 0.06 : 0.55 + Math.random() * 0.12, bright ? 0.6 : 0.35, bright ? 0.75 : 0.45 + Math.random() * 0.45);
        col.set([c.r, c.g, c.b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: bright ? this.starDot : null, transparent: bright, depthWrite: false, blending: bright ? THREE.AdditiveBlending : THREE.NormalBlending })));
    };
    this.starDot = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.25)');
    layer(5000, 1.4, false);
    layer(350, 7, true);
    this.nebulaGroup = new THREE.Group();
    this.scene.add(this.nebulaGroup);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _clearGroup(g) {
    for (const o of [...g.children]) {
      o.traverse(x => { if (x.isCSS2DObject) x.element.remove(); });
      g.remove(o);
    }
  }

  buildSystem(sys) {
    this._clearGroup(this.sysGroup);
    for (const g of this.ships.values()) this._dropTrails(g);
    this._clearGroup(this.shipGroup);
    this.ships.clear(); this.loot.clear(); this.planets.clear();
    this._clearFx();
    this.sysId = sys.id; this.sysOwner = sys.owner;
    this._clearGroup(this.nebulaGroup);
    this.nebulaGroup.add(buildNebulae(sys.id, sys.owner === 'dom'));
    const g = this.sysGroup;
    const starCol = new THREE.Color(sys.star.color);
    const star = new THREE.Mesh(new THREE.SphereGeometry(sys.star.size, 48, 24), new THREE.MeshBasicMaterial({ color: starCol.clone().multiplyScalar(2.2) }));
    g.add(star);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: starCol, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(sys.star.size * 5.5);
    g.add(glow);
    const light = new THREE.PointLight(starCol.clone().lerp(new THREE.Color(0xffffff), 0.35), 7, 0, 0);
    light.position.y = 450; // a bit above the plane so the top of hulls (what the camera sees) catches the light
    g.add(light);
    if (sys.owner === 'dom') {
      const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x8020ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      haze.scale.setScalar(9000); haze.position.y = -600;
      g.add(haze);
    }
    sys.planets.forEach((p, i) => {
      if (p.station) return this._makeStation(g, sys, p);
      const orbit = new THREE.LineLoop(this._circleGeo(p.r, 160), new THREE.LineBasicMaterial({ color: sys.owner === 'dom' ? 0x553377 : 0x2a3a5a, transparent: true, opacity: 0.6 }));
      g.add(orbit);
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.size, 40, 20), new THREE.MeshStandardMaterial({ map: planetTexture(p.color, i + p.r), roughness: 0.95, metalness: 0, envMapIntensity: 0.15 }));
      m.userData = { type: 'planet', id: p.id };
      if (p.ring) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(p.size * 1.4, p.size * 2.1, 64), new THREE.MeshBasicMaterial({ color: 0xccbb99, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2 + 0.35;
        m.add(ring);
      }
      const hit = new THREE.Mesh(new THREE.SphereGeometry(p.size + 60, 12, 8), this.hitMat);
      hit.userData = m.userData;
      m.add(hit);
      const lbl = document.createElement('div');
      lbl.className = 'lbl planet';
      lbl.textContent = p.name;
      const lo = new CSS2DObject(lbl); lo.position.set(0, -p.size - 20, 0); lo.center.set(0.5, 0);
      m.add(lo);
      g.add(m);
      this.planets.set(p.id, m);
    });
    this.focusPending = true;
  }

  // a station: its own model standing still, picked and docked like a planet
  _makeStation(g, sys, p) {
    const col = D.STATIONS[p.station].col;
    const model = buildStation(p.station);
    const m = new THREE.Group();
    m.add(model.group);
    m.userData = { type: 'planet', id: p.id, station: true, anim: model.anim };
    const hit = new THREE.Mesh(new THREE.SphereGeometry(p.size + 60, 12, 8), this.hitMat);
    hit.userData = { type: 'planet', id: p.id };
    m.add(hit);
    const lbl = document.createElement('div');
    lbl.className = 'lbl planet station';
    lbl.textContent = p.name;
    lbl.style.color = '#' + new THREE.Color(col).getHexString();
    const lo = new CSS2DObject(lbl); lo.position.set(0, -p.size - 30, 0); lo.center.set(0.5, 0);
    m.add(lo);
    g.add(m);
    this.planets.set(p.id, m);
  }

  _dropTrails(g) {
    for (const tr of g.userData.trails || []) { this.trailGroup.remove(tr.mesh); tr.dispose(); }
  }

  _dropShip(id, g) {
    g.userData.el.remove();
    this._dropTrails(g);
    this.shipGroup.remove(g);
    this.ships.delete(id);
  }

  _makeShip(s) {
    const g = new THREE.Group();
    const model = buildShipModel(s);
    const body = new THREE.Group();
    body.add(model.group);
    const engines = attachEngineGlows(model, body, this.glowTex);
    if (s.kind === 'citadel') {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xa040ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(900); g.add(halo);
    }
    g.add(body);
    const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
    hit.userData = { type: 'ship', id: s.id };
    hit.scale.setScalar(Math.max(1, model.radius * 1.3 / 95));
    g.add(hit);
    const el = document.createElement('div');
    el.className = 'lbl ship ' + s.kind + (s.rank === 'elite' ? ' elite' : '');
    el.innerHTML = '<span class="n"></span><div class="sh"><i></i></div><div class="hp"><i></i></div>';
    el.style.color = '#' + new THREE.Color(s.color).getHexString();
    const lo = new CSS2DObject(el); lo.position.set(0, 0, Math.max(60, model.radius + 15)); lo.center.set(0.5, 0);
    g.add(lo);
    const trails = s.kind === 'citadel' ? [] : engines.map(() => new Trail(model.engineColor, DAY_MS / 1000 * 0.75));
    for (const tr of trails) this.trailGroup.add(tr.mesh);
    g.userData = { body, label: lo, el, heading: Math.random() * 6.28, fresh: true, id: s.id, mats: model.mats, engines, trails, hull: s.eq.hull, radius: model.radius, anim: model.anim };
    this.shipGroup.add(g);
    this.ships.set(s.id, g);
    return g;
  }

  // goods: a golden crate; equipment (weapons, modules): a cyan crystal, so valuable drops stand out
  _lootMesh(eq) {
    return eq
      ? new THREE.Mesh(this.lootEqGeo, new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x1aa8ff, emissiveIntensity: 1.4, flatShading: true }))
      : new THREE.Mesh(this.lootGeo, new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 1.2 }));
  }

  _makeLoot(l) {
    const eq = !!(l.items && l.items.length);
    const m = this._lootMesh(eq);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), this.hitMat);
    hit.userData = { type: 'loot', id: l.id };
    m.add(hit);
    m.userData.eq = eq;
    this.shipGroup.add(m);
    this.loot.set(l.id, m);
    return m;
  }

  // ---------------------------------------------------------------- real-time stream
  // The host streams snapshots ({ T, ships }) every ~100 ms. We draw the world a little in the past
  // (one snapshot interval plus a jitter buffer) and interpolate between the two snapshots around
  // the render time `this.T` (in substeps). Events carry their own T and play when we reach it.

  pushTick(m) {
    const now = performance.now();
    const last = this.snaps[this.snaps.length - 1];
    if (last && m.T < last.T - SUB) { this.snaps = []; this.clockOff = null; this.T = m.T; } // the host restarted from an older save
    if (!last || m.T > last.T || !this.snaps.length) { // (a snapshot for the same moment may already have come with the full state)
      const ships = new Map();
      for (const e of m.s) ships.set(e[0], e);
      this.snaps.push({ T: m.T, ships });
      if (this.snaps.length > 40) this.snaps.shift();
      // map sim time onto our clock: network jitter is smoothed, pauses and speed changes resync
      if (m.subMs && m.subMs !== this.subMs) { this.subMs = m.subMs; this.clockOff = null; }
      const off = now - m.T * this.subMs;
      if (this.clockOff == null || Math.abs(off - this.clockOff) > 300) this.clockOff = off;
      else this.clockOff += (off - this.clockOff) * 0.05;
    }
    const ev = m.ev;
    if (!ev) return;
    for (const sh of ev.shots) { this.lastFight.set(sh.a, sh.T); this.lastFight.set(sh.b, sh.T); if (sh.sys === this.sysId) this._addShot(sh); }
    for (const b of ev.booms) if (b.sys === this.sysId) this._addBoom(b);
    for (const pk of ev.pickups) if (pk.sys === this.sysId) this._addPickup(pk);
    for (const j of ev.jumps) if (j.sys === this.sysId) this._addWarp(j);
  }

  // render time: behind the newest snapshot by the buffer, never extrapolated, never backwards
  _advanceClock(now, st) {
    const last = this.snaps[this.snaps.length - 1];
    if (!last) { this.T = st.day * SUB + (st.sub || 0); return; }
    const delay = Math.max(this.subMs, 100) + 150;
    let T = Math.min(last.T, (now - this.clockOff - delay) / this.subMs);
    T = Math.max(T, this.snaps[0].T);
    if (T < this.T && this.T - T < SUB) T = Math.min(this.T, last.T);
    this.T = T;
  }

  // index of the last snapshot at or before T
  _snapIdx(T) {
    for (let i = this.snaps.length - 1; i >= 0; i--) if (this.snaps[i].T <= T) return i;
    return 0;
  }

  _shipPos(id, i) {
    const a = this.snaps[i], b = this.snaps[i + 1];
    const ea = a && a.ships.get(id);
    if (!ea) return null;
    const eb = b && b.ships.get(id);
    let x = ea[2], y = ea[3], hd = ea[4] != null ? ea[4] / 100 : null, moving = false;
    if (eb && eb[1] === ea[1] && Math.hypot(eb[2] - ea[2], eb[3] - ea[3]) < 800) { // same system, not a jump
      const u = Math.max(0, Math.min(1, (this.T - a.T) / (b.T - a.T)));
      x += (eb[2] - ea[2]) * u; y += (eb[3] - ea[3]) * u;
      if (hd != null && eb[4] != null) hd += wrapAngle(eb[4] / 100 - hd) * u;
      moving = Math.hypot(eb[2] - ea[2], eb[3] - ea[3]) > 0.5;
    }
    return { sys: ea[1], x, y, hd, landed: !!ea[6], moving };
  }

  _clearFx() {
    for (const f of this.fx) this.fxGroup.remove(f.obj);
    this.fx = [];
  }

  _addShot(sh) {
    const W = D.eqDef(sh.w), base = SHOT_STYLE[W.style] || SHOT_STYLE.beam;
    const style = sh.sp ? { type: 'none', travel: base.travel + base.show * 0.5 || 0.03 } : base; // splash: only the blast at the target
    const tt = sh.T / SUB, hit = tt + style.travel;
    const col = new THREE.Color(W.color).multiplyScalar(3);
    const fx = { kind: 'shot', sh, style, tt, hit, W, end: hit + 0.06 };
    if (style.type === 'beam' || style.type === 'tracer') {
      fx.obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending }));
      fx.obj.frustumCulled = false;
    } else {
      fx.obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boomTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    }
    fx.obj.visible = false;
    fx.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boomTex, color: W.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fx.spark.visible = false;
    fx.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x66ccff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fx.bubble.visible = false;
    this.fxGroup.add(fx.obj, fx.spark, fx.bubble);
    this.fx.push(fx, { obj: fx.spark, kind: 'none', end: fx.end }, { obj: fx.bubble, kind: 'none', end: fx.end });
  }

  _addBoom(b) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boomTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(b.x, 0, b.y); sp.visible = false;
    this.fxGroup.add(sp);
    const len = 1000 / DAY_MS; // explosions last ~1 s at normal speed
    this.fx.push({ obj: sp, kind: 'boom', b, tt: b.T / SUB, len, end: b.T / SUB + len });
  }

  _addPickup(pk) {
    // the animated copy takes over from the container's own mesh
    if (pk.all) { this.pickedLoot.add(pk.id); if (this.loot.has(pk.id)) { this.shipGroup.remove(this.loot.get(pk.id)); this.loot.delete(pk.id); } }
    const box = this._lootMesh(pk.eq);
    box.position.set(pk.x, 0, pk.y); box.visible = false;
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(0x66ddff).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending }));
    beam.frustumCulled = false; beam.visible = false;
    this.fxGroup.add(box, beam);
    const tt = pk.T / SUB;
    this.fx.push({ obj: box, kind: 'pickup', pk, beam, tt, end: tt + 0.25 }, { obj: beam, kind: 'none', end: tt + 0.25 });
  }

  // a ship leaving for hyperspace: a bright flash where it was
  _addWarp(j) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x9fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(j.x, 0, j.y); sp.visible = false;
    this.fxGroup.add(sp);
    this.fx.push({ obj: sp, kind: 'warp', j, tt: j.T / SUB, end: j.T / SUB + 0.25 });
  }

  // floating text (damage numbers, picked-up cargo) that rises and fades in world space
  _floater(text, pos, color, big = false) {
    const el = document.createElement('div');
    el.className = 'lbl float' + (big ? ' big' : '');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    el.style.color = typeof color === 'number' ? '#' + new THREE.Color(color).getHexString() : color;
    const o = new CSS2DObject(el);
    o.position.copy(pos).setY(20);
    o.center.set(0.5, 1);
    this.scene.add(o);
    this.floaters.push({ o, t0: performance.now(), life: big ? 1800 : 900 });
  }

  update(st, meId, selected) {
    this.meId = meId;
    const me = st.ships[meId];
    const viewSys = me ? (me.jump ? me.jump.to : me.sys) : 0;
    const sys = st.systems[viewSys];
    if (this.sysId !== viewSys || this.sysOwner !== sys.owner) this.buildSystem(sys);

    const now = performance.now();
    const frameDt = this._lastFrame ? Math.min(100, now - this._lastFrame) : 0;
    this._lastFrame = now;
    const prevT = this.T;
    this._advanceClock(now, st);
    const running = this.T > prevT; // world time is moving on screen (not paused, not waiting)
    const t = this.T / SUB;         // days, for orbits and effects
    const trailNow = this.T * (DAY_MS / SUB); // trails age on game time only: frozen during a pause
    const si = this._snapIdx(this.T), hullSnap = this.snaps[this._snapIdx(this.T - 1)];
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const sc = Math.max(1, camDist / 3800);

    for (const p of sys.planets) {
      const m = this.planets.get(p.id);
      const [x, y] = planetPos(p, t);
      m.position.set(x, 0, y);
      if (m.userData.station) { m.rotation.y = t * 0.25; m.userData.anim(t); }
      else m.rotation.y = t * 0.6;
    }

    // ships
    for (const id in st.ships) this.info[id] = st.ships[id];
    const seen = new Set();
    const cur = this.snaps[si];
    for (const id of cur ? cur.ships.keys() : []) {
      const pos = this._shipPos(id, si);
      const info = this.info[id];
      if (!pos || pos.sys !== this.sysId || !info) continue;
      let g = this.ships.get(id);
      if (g && g.userData.hull !== info.eq.hull) { this._dropShip(id, g); g = null; } // hull upgraded
      g ||= this._makeShip(info);
      seen.add(id);
      const ud = g.userData;
      const vis = !pos.landed;
      if (vis && !g.visible) ud.shownAt = now; // take-off, arrival, spawn: fade in
      g.visible = vis;
      ud.label.visible = vis;
      const alpha = vis ? Math.min(1, (now - (ud.shownAt || 0)) / 400) : 0;
      g.position.set(pos.x, 0, pos.y);
      if (pos.hd != null && info.kind !== 'citadel') { // turn smoothly towards the simulated course
        const want = -pos.hd;
        if (ud.fresh) ud.heading = want;
        else ud.heading += wrapAngle(want - ud.heading) * (1 - Math.exp(-frameDt / 1000 * 10));
      }
      ud.fresh = false;
      const body = ud.body;
      body.rotation.y = info.kind === 'citadel' ? t * 0.8 : ud.heading;
      if (info.kind !== 'citadel') {
        // bank into turns, and now and then throw a barrel roll in a dogfight
        const dts = Math.max(0.001, frameDt / 1000);
        const turnRate = wrapAngle(ud.heading - (ud.prevHead ?? ud.heading)) / dts;
        ud.prevHead = ud.heading;
        ud.bank = (ud.bank || 0) + (Math.max(-0.9, Math.min(0.9, -turnRate * 0.45)) - (ud.bank || 0)) * (1 - Math.exp(-dts * 5));
        const fighting = this.T - (this.lastFight.get(id) ?? -1e9) < SUB;
        if (!ud.rollT && running && fighting && Math.random() < dts * 0.3) { ud.rollT = now; ud.rollDir = Math.random() < 0.5 ? 1 : -1; }
        let roll = 0;
        if (ud.rollT) {
          const q = (now - ud.rollT) / 700;
          if (q >= 1) ud.rollT = 0;
          else roll = ud.rollDir * Math.PI * 2 * (q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q));
        }
        body.rotation.order = 'YXZ';
        body.rotation.x = ud.bank + roll;
      }
      body.scale.setScalar(sc);
      if (ud.anim) ud.anim(now / 1000); // tentacles, wings, pulsing flesh
      for (const m of ud.mats) {
        if (m.isSpriteMaterial) continue;
        m.opacity = alpha;
        if (m.transparent !== alpha < 1) { m.transparent = alpha < 1; m.needsUpdate = true; }
      }
      for (const e of ud.engines) {
        e.material.opacity = 0.85 * alpha;
        e.scale.setScalar(e.userData.base * (0.85 + Math.random() * 0.3));
      }
      if (ud.trails.length) {
        g.updateMatrixWorld(true);
        const emitting = vis && alpha > 0.3 && pos.moving;
        ud.engines.forEach((e, i) => ud.trails[i].update(e.getWorldPosition(this._tmpV), trailNow, emitting, e.userData.base * 0.4 * sc, alpha));
      }
      // the hull bar lags a substep behind so it drops when the shot lands, not when it is fired
      const S = stats(info);
      const hs = hullSnap && hullSnap.ships.get(id);
      const hp = hs ? hs[5] : cur.ships.get(id)[5];
      const el = ud.el;
      el.querySelector('.n').textContent = info.name + (info.wanted > 0 ? ' ⚠' : '');
      el.querySelector('.hp i').style.width = Math.max(0, Math.min(100, hp / S.maxHull * 100)) + '%';
      const shEl = el.querySelector('.sh');
      shEl.hidden = !S.shieldMax;
      if (S.shieldMax) shEl.firstChild.style.width = Math.max(0, Math.min(100, ((hs || cur.ships.get(id))[7] || 0) / S.shieldMax * 100)) + '%';
      el.classList.toggle('me', id === meId);
      el.classList.toggle('sel', !!selected && selected.id === id);
    }
    for (const [id, g] of this.ships) if (!seen.has(id)) this._dropShip(id, g);
    for (const id in this.info) if (!st.ships[id] && !seen.has(id)) delete this.info[id];

    // loot: new containers appear once the explosion that made them has played
    const lseen = new Set();
    for (const l of st.loot) {
      if (l.sys !== this.sysId || this.pickedLoot.has(l.id) || (l.t0 != null && this.T < l.t0)) continue;
      let m = this.loot.get(l.id);
      if (m && m.userData.eq !== !!(l.items && l.items.length)) { this.shipGroup.remove(m); m = null; } // equipment taken, goods left
      m ||= this._makeLoot(l);
      lseen.add(l.id);
      m.position.set(l.x, 0, l.y);
      m.rotation.set(now / 700, now / 900, 0);
      m.visible = true;
      m.scale.setScalar(sc);
    }
    for (const [id, m] of this.loot) if (!lseen.has(id)) { this.shipGroup.remove(m); this.loot.delete(id); }
    for (const id of this.pickedLoot) if (!st.loot.some(l => l.id === id)) this.pickedLoot.delete(id);

    // effects
    const nowF = t;
    for (const fx of this.fx) {
      if (fx.kind === 'shot') {
        const tt = fx.tt, sty = fx.style;
        const a = this.ships.get(fx.sh.a), b = this.ships.get(fx.sh.b);
        if (!a || !b) { fx.obj.visible = fx.spark.visible = fx.bubble.visible = false; continue; }
        if (nowF >= tt && !fx.played && sty.type !== 'none') { fx.played = true; Audio.weapon(fx.W.snd, this._hearing(a.position)); }
        const A = a.position.clone().setY(5), B = b.position.clone().setY(5);
        if (sty.type === 'none') fx.obj.visible = false;
        else if (sty.type === 'beam') {
          fx.obj.visible = nowF >= tt && nowF <= tt + sty.show;
          if (fx.obj.visible) fx.obj.geometry.setFromPoints([A, B]);
        } else {
          const q = (nowF - tt) / Math.max(0.001, sty.travel);
          fx.obj.visible = q >= 0 && q < 1;
          if (fx.obj.visible) {
            const P = A.clone().lerp(B, q);
            if (sty.type === 'tracer') fx.obj.geometry.setFromPoints([P, A.clone().lerp(B, Math.min(1, q + 0.25))]);
            else { fx.obj.position.copy(P); fx.obj.scale.setScalar(sty.size * sc); }
          }
        }
        const h = nowF - fx.hit;
        fx.spark.visible = h >= 0 && h < 0.05 && !fx.sh.miss && fx.sh.d > 0;
        if (fx.spark.visible) { fx.spark.position.copy(B); fx.spark.scale.setScalar(sc * (50 + fx.sh.d * 3) * (1 - h * 10)); }
        // a shield taking the hit flashes as a blue bubble around the target
        fx.bubble.visible = h >= 0 && h < 0.05 && fx.sh.sd > 0;
        if (fx.bubble.visible) { fx.bubble.position.copy(B); fx.bubble.scale.setScalar((b.userData.radius * 3.2 + 40) * sc); fx.bubble.material.opacity = 0.7 * (1 - h * 20); }
        if (h >= 0 && !fx.numbered) {
          fx.numbered = true;
          if (fx.sh.miss) this._floater('мимо', B, '#8a9ab0');
          else {
            if (fx.sh.sd) this._floater('-' + fx.sh.sd, B.clone().setX(B.x - 30 * sc), '#66ccff');
            if (fx.sh.d) this._floater('-' + fx.sh.d, B, fx.W.color);
          }
        }
      } else if (fx.kind === 'boom') {
        const el = nowF - fx.tt;
        fx.obj.visible = el >= 0 && el < fx.len;
        if (el >= 0 && !fx.played) { fx.played = true; Audio.explosion(fx.b.big, this._hearing(fx.obj.position)); }
        if (fx.obj.visible) {
          const q = el / fx.len;
          fx.obj.scale.setScalar((150 + q * 550) * fx.b.big * sc);
          fx.obj.material.opacity = 1 - q;
        }
      } else if (fx.kind === 'warp') {
        const q = (nowF - fx.tt) / 0.25;
        fx.obj.visible = q >= 0 && q < 1;
        if (fx.obj.visible) { fx.obj.scale.setScalar(sc * (120 + 380 * Math.sqrt(q))); fx.obj.material.opacity = 1 - q; }
        if (q >= 0 && !fx.played) { fx.played = true; if (fx.j.id !== this.meId) Audio.ui('jump', this._hearing(fx.obj.position) * 0.6); }
      } else if (fx.kind === 'pickup') {
        // the container waits, then a tractor beam pulls it into the ship
        const q = (nowF - fx.tt) / 0.2;
        const ship = this.ships.get(fx.pk.ship);
        const box = fx.obj;
        box.rotation.set(now / 700, now / 900, 0);
        if (q < 0) { box.visible = fx.pk.all; box.position.set(fx.pk.x, 0, fx.pk.y); box.scale.setScalar(sc); fx.beam.visible = false; }
        else if (q < 1 && ship) {
          const e = q * q;
          box.visible = true;
          box.position.set(fx.pk.x + (ship.position.x - fx.pk.x) * e, 0, fx.pk.y + (ship.position.z - fx.pk.y) * e);
          box.scale.setScalar(sc * (1 - 0.75 * q));
          fx.beam.visible = true;
          fx.beam.geometry.setFromPoints([ship.position.clone().setY(3), box.position.clone().setY(3)]);
        } else {
          box.visible = fx.beam.visible = false;
          if (!fx.done && ship) { fx.done = true; this._floater(fx.pk.text, ship.position, '#ffd66b', true); Audio.ui('pickup', fx.pk.ship === this.meId ? 1 : this._hearing(ship.position)); }
        }
      }
    }
    // drop finished effects
    if (this.fx.some(f => nowF > f.end)) {
      this.fx = this.fx.filter(f => { if (nowF <= f.end) return true; this.fxGroup.remove(f.obj); return false; });
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const fl = this.floaters[i], age = (now - fl.t0) / fl.life;
      if (age >= 1) { this.scene.remove(fl.o); this.floaters.splice(i, 1); continue; }
      const span = fl.o.element.firstChild;
      span.style.transform = 'translateY(' + (-age * 45) + 'px)';
      span.style.opacity = String(1 - age * age);
    }

    // own ship helpers
    const mg = me && this.ships.get(meId);
    if (me && mg && mg.visible && !me.jump) {
      const range = Math.max(0, ...me.weapons.map(w => D.eqDef(w).range)) * stats(me).rangeMul;
      this.rangeRing.visible = range > 0;
      this.rangeRing.position.copy(mg.position);
      this.rangeRing.scale.setScalar(range);
      // planned route, simulated with the same navigation code the host uses
      const key = me.order && JSON.stringify(me.order) + '|' + Math.round(me.x) + ',' + Math.round(me.y);
      if (key !== this._routeKey) { this._routeKey = key; this._route = me.order && me.order.type !== 'jump' ? predictPath(st, me, 20) : null; }
      const route = this._route;
      this.orderLine.visible = !!(route && route.length > 1);
      if (this.orderLine.visible) {
        const pts = [mg.position.clone().setY(2)];
        for (let i = 1; i < route.length; i++) pts.push(new THREE.Vector3(route[i][0], 2, route[i][1]));
        this.orderLine.geometry.dispose();
        this.orderLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        this.orderLine.computeLineDistances();
        this.orderLine.material.color.set(me.order.type === 'attack' ? 0xff5555 : me.order.type === 'land' ? 0x66ccff : 0x66ffaa);
      }
      if (this.focusPending) { this.focus(mg.position); this.focusPending = false; }
    } else { this.rangeRing.visible = false; this.orderLine.visible = false; }

    // selection ring
    let selObj = null, selR = 120;
    if (selected) {
      if (selected.type === 'ship') selObj = this.ships.get(selected.id);
      else if (selected.type === 'planet') { selObj = this.planets.get(selected.id); const p = sys.planets.find(p => p.id === selected.id); if (p) selR = p.size + 40; }
      else if (selected.type === 'loot') selObj = this.loot.get(selected.id);
    }
    this.selRing.visible = !!(selObj && selObj.visible);
    if (this.selRing.visible) {
      this.selRing.position.copy(selObj.position);
      this.selRing.scale.setScalar((selected.type === 'planet' ? selR : selR * sc) * (1 + 0.05 * Math.sin(now / 200)));
    }

    if (this.focusAnim) {
      const p = this._objPos(this.focusAnim.obj);
      if (!p) this.focusAnim = null;
      else {
        const done = now - this.focusAnim.t0 > 700;
        const d = p.clone().setY(0).sub(this.controls.target).multiplyScalar(done ? 1 : 1 - Math.exp(-frameDt / 1000 * 9));
        this.controls.target.add(d);
        this.camera.position.add(d);
        if (done) this.focusAnim = null;
      }
    }
    this.controls.update();
    this.composer.render();
    this.labels.render(this.scene, this.camera);
    return { T: this.T };
  }

  orderPoint(st, s, t) {
    const o = s.order;
    if (!o) return null;
    if (o.type === 'move') return [o.x, o.y];
    if (o.type === 'follow' || o.type === 'attack') { const g = this.ships.get(o.target); return g ? [g.position.x, g.position.z] : null; }
    if (o.type === 'land') { const p = st.systems[s.sys]?.planets.find(p => p.id === o.planet); return p ? planetPos(p, t) : null; }
    if (o.type === 'loot') { const l = st.loot.find(l => l.id === o.id); return l ? [l.x, l.y] : null; }
    return null;
  }

  // how loud something at world position p is: fades with distance from the camera's focus point
  _hearing(p) {
    const d = p.distanceTo(this.controls.target);
    const zoom = this.camera.position.distanceTo(this.controls.target);
    return Math.max(0, 1 - d / (2500 + zoom * 0.6)) * Math.min(1, 3500 / zoom);
  }

  // Smoothly fly the camera to a ship / planet / loot container, tracking it if it moves.
  focusOn(obj) {
    this.focusAnim = obj ? { obj, t0: performance.now() } : null;
  }

  _objPos(obj) {
    const o = obj.type === 'ship' ? this.ships.get(obj.id) : obj.type === 'planet' ? this.planets.get(obj.id) : obj.type === 'loot' ? this.loot.get(obj.id) : null;
    return o ? o.position : null;
  }

  focus(v) {
    const d = v.clone().sub(this.controls.target);
    this.controls.target.add(d);
    this.camera.position.add(d);
  }

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const objs = [];
    for (const g of this.ships.values()) if (g.visible) objs.push(g);
    for (const m of this.loot.values()) if (m.visible) objs.push(m);
    for (const m of this.planets.values()) objs.push(m);
    const hits = this.raycaster.intersectObjects(objs, true).filter(h => h.object.userData && h.object.userData.type);
    // prefer ships/loot over planets
    hits.sort((a, b) => (a.object.userData.type === 'planet') - (b.object.userData.type === 'planet') || a.distance - b.distance);
    if (hits.length) return { ...hits[0].object.userData };
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return { type: 'point', x: Math.round(p.x), y: Math.round(p.z) };
    return null;
  }
}
