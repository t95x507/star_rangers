// Three.js star-system view.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as D from './data.js';
import { SUB, planetPos, stats } from './sim.js';
import { buildShipModel } from './models.js';
import * as Audio from './audio.js';

export const ANIM_MS = 1700;

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

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.35));
    this._background();
    this.sysGroup = new THREE.Group(); this.scene.add(this.sysGroup);
    this.shipGroup = new THREE.Group(); this.scene.add(this.shipGroup);
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
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
    this.animKey = null;
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
    const n = 4000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(30000 + Math.random() * 10000);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.2, 0.4, 0.5 + Math.random() * 0.5);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));
    for (let i = 0; i < 6; i++) {
      const hue = Math.random();
      const tex = glowTexture(`hsla(${hue * 360},70%,40%,0.5)`, `hsla(${hue * 360},60%,25%,0.18)`);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
      sp.position.set((Math.random() - 0.5) * 30000, -6000 - Math.random() * 4000, (Math.random() - 0.5) * 30000);
      sp.scale.setScalar(12000 + Math.random() * 12000);
      this.scene.add(sp);
    }
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
    this._clearGroup(this.shipGroup);
    this.ships.clear(); this.loot.clear(); this.planets.clear();
    this.sysId = sys.id; this.sysOwner = sys.owner;
    const g = this.sysGroup;
    const starCol = new THREE.Color(sys.star.color);
    const star = new THREE.Mesh(new THREE.SphereGeometry(sys.star.size, 48, 24), new THREE.MeshBasicMaterial({ color: starCol.clone().multiplyScalar(2.2) }));
    g.add(star);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: starCol, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(sys.star.size * 5.5);
    g.add(glow);
    const light = new THREE.PointLight(starCol, 3.2, 0, 0);
    g.add(light);
    if (sys.owner === 'dom') {
      const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x8020ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      haze.scale.setScalar(9000); haze.position.y = -600;
      g.add(haze);
    }
    sys.planets.forEach((p, i) => {
      const orbit = new THREE.LineLoop(this._circleGeo(p.r, 160), new THREE.LineBasicMaterial({ color: sys.owner === 'dom' ? 0x553377 : 0x2a3a5a, transparent: true, opacity: 0.6 }));
      g.add(orbit);
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.size, 40, 20), new THREE.MeshStandardMaterial({ map: planetTexture(p.color, i + p.r), roughness: 0.95, metalness: 0 }));
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

  _makeShip(s) {
    const g = new THREE.Group();
    const model = buildShipModel(s);
    const body = new THREE.Group();
    body.add(model.group);
    const engines = [];
    for (const e of model.engines) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: model.engineColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
      sp.position.copy(e.pos);
      sp.userData.base = e.size * 4;
      sp.scale.setScalar(sp.userData.base);
      body.add(sp);
      engines.push(sp);
      model.mats.push(sp.material);
    }
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
    el.className = 'lbl ship ' + s.kind;
    el.innerHTML = '<span class="n"></span><div class="hp"><i></i></div>';
    el.style.color = '#' + new THREE.Color(s.color).getHexString();
    const lo = new CSS2DObject(el); lo.position.set(0, 0, Math.max(60, model.radius + 15)); lo.center.set(0.5, 0);
    g.add(lo);
    g.userData = { body, label: lo, el, heading: Math.random() * 6.28, id: s.id, mats: model.mats, engines, hull: s.eq.hull, radius: model.radius };
    this.shipGroup.add(g);
    this.ships.set(s.id, g);
    return g;
  }

  _makeLoot(l) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 1.2 }));
    const hit = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), this.hitMat);
    hit.userData = { type: 'loot', id: l.id };
    m.add(hit);
    this.shipGroup.add(m);
    this.loot.set(l.id, m);
    return m;
  }

  // A turn that arrives while the previous one is still playing waits in a queue,
  // so fast-forwarded days chain seamlessly instead of cutting each other off.
  startAnim(anim) {
    const now = performance.now();
    if (anim && this.anim && now - this.animStart < ANIM_MS) {
      (this.queue ||= []).push(anim);
      if (this.queue.length > 2) this.queue.splice(0, this.queue.length - 2); // badly behind (hidden tab): skip ahead
      return;
    }
    this._beginAnim(anim, now);
  }

  _beginAnim(anim, start) {
    for (const f of this.fx) this.fxGroup.remove(f.obj);
    this.fx = [];
    this.anim = anim;
    this.animStart = start;
    if (!anim) return;
    for (const sh of anim.shots) {
      if (sh.sys !== this.sysId) continue;
      const W = D.byId(D.WEAPONS, sh.w);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: new THREE.Color(W.color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending }));
      line.frustumCulled = false; line.visible = false;
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boomTex, color: W.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      spark.visible = false; spark.scale.setScalar(90);
      this.fxGroup.add(line, spark);
      this.fx.push({ obj: line, kind: 'shot', sh, spark });
      this.fx.push({ obj: spark, kind: 'none' });
    }
    for (const b of anim.booms) {
      if (b.sys !== this.sysId) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boomTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(b.x, 0, b.y); sp.visible = false;
      this.fxGroup.add(sp);
      this.fx.push({ obj: sp, kind: 'boom', b });
    }
  }

  animFrac() { return this.anim ? Math.min(1, (performance.now() - this.animStart) / ANIM_MS) : 1; }

  // Interpolated position of a ship during a turn animation.
  _animPos(id, f) {
    const fr = this.anim && this.anim.frames[id];
    if (!fr || fr.sys !== this.sysId) return null;
    const n = fr.p.length / 3;
    const x = f * SUB, i = Math.floor(x);
    if (fr.out) return { x: fr.p[0], y: fr.p[1], v: 1, a: Math.max(0, 1 - f * 2.5), dx: 0, dy: 0 };
    if (i >= n - 1) {
      const j = (n - 1) * 3;
      const dead = n < SUB + 1;
      return { x: fr.p[j], y: fr.p[j + 1], v: dead ? 0 : fr.p[j + 2], a: 1, dx: n > 1 ? fr.p[j] - fr.p[j - 3] : 0, dy: n > 1 ? fr.p[j + 1] - fr.p[j - 2] : 0 };
    }
    const u = x - i, j = i * 3;
    return { x: fr.p[j] + (fr.p[j + 3] - fr.p[j]) * u, y: fr.p[j + 1] + (fr.p[j + 4] - fr.p[j + 1]) * u, v: fr.p[j + 5] && fr.p[j + 2], a: 1, dx: fr.p[j + 3] - fr.p[j], dy: fr.p[j + 4] - fr.p[j + 1] };
  }

  update(st, meId, selected) {
    const me = st.ships[meId];
    const viewSys = me ? (me.jump ? me.jump.to : me.sys) : 0;
    const sys = st.systems[viewSys];
    if (this.sysId !== viewSys || this.sysOwner !== sys.owner) this.buildSystem(sys);

    const now = performance.now();
    if (this.queue && this.queue.length && (!this.anim || now - this.animStart >= ANIM_MS)) {
      // continue exactly where the previous day ended, unless we fell far behind
      const end = this.anim ? this.animStart + ANIM_MS : now;
      this._beginAnim(this.queue.shift(), now - end < ANIM_MS / 2 ? end : now);
    }
    const f = this.anim ? Math.min(1, (now - this.animStart) / ANIM_MS) : 1;
    const animating = this.anim && f < 1;
    const t = animating ? this.anim.day + f : st.day;
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const sc = Math.max(1, camDist / 3800);

    for (const p of sys.planets) {
      const m = this.planets.get(p.id);
      const [x, y] = planetPos(p, t);
      m.position.set(x, 0, y);
      m.rotation.y = t * 0.6;
    }

    // ships
    const seen = new Set();
    const ids = new Set(Object.keys(st.ships));
    if (animating) for (const id in this.anim.frames) if (this.anim.frames[id].sys === this.sysId) ids.add(id);
    for (const id of ids) {
      const s = st.ships[id];
      let pos = null;
      if (animating) pos = this._animPos(id, f);
      if (!pos) {
        if (!s || s.sys !== this.sysId || s.jump || s.dead != null) continue;
        const fresh = animating && !(this.anim.frames[id]);
        pos = { x: s.x, y: s.y, v: s.landed ? 0 : 1, a: fresh ? Math.max(0, (f - 0.6) / 0.4) : 1, dx: 0, dy: 0 };
      }
      const info = s || (this._ghost && this._ghost[id]);
      if (!info) continue;
      let g = this.ships.get(id);
      if (g && g.userData.hull !== info.eq.hull) { g.userData.el.remove(); this.shipGroup.remove(g); this.ships.delete(id); g = null; } // hull upgraded
      g ||= this._makeShip(info);
      seen.add(id);
      g.visible = !!pos.v && pos.a > 0.01;
      g.userData.label.visible = g.visible;
      g.position.set(pos.x, 0, pos.y);
      if (Math.abs(pos.dx) + Math.abs(pos.dy) > 0.5) g.userData.heading = Math.atan2(-pos.dy, pos.dx);
      else if (!animating && s && s.order && info.kind !== 'citadel') {
        const tp = this.orderPoint(st, s, t);
        if (tp && Math.hypot(tp[0] - s.x, tp[1] - s.y) > 5) g.userData.heading = Math.atan2(-(tp[1] - s.y), tp[0] - s.x);
      }
      const body = g.userData.body;
      body.rotation.y = info.kind === 'citadel' ? t * 0.8 : g.userData.heading;
      body.scale.setScalar(sc);
      for (const m of g.userData.mats) {
        if (m.isSpriteMaterial) continue;
        m.opacity = pos.a;
        if (m.transparent !== pos.a < 1) { m.transparent = pos.a < 1; m.needsUpdate = true; }
      }
      for (const e of g.userData.engines) {
        e.material.opacity = 0.85 * pos.a;
        e.scale.setScalar(e.userData.base * (0.85 + Math.random() * 0.3));
      }
      const S = stats(info);
      const hp = s ? s.hull : 0;
      const el = g.userData.el;
      el.querySelector('.n').textContent = info.name + (info.wanted > 0 ? ' ⚠' : '');
      el.querySelector('.hp i').style.width = Math.max(0, Math.min(100, (animating ? g.userData.lastHp ?? hp : hp) / S.maxHull * 100)) + '%';
      if (!animating) g.userData.lastHp = hp;
      el.classList.toggle('me', id === meId);
      el.classList.toggle('sel', !!selected && selected.id === id);
    }
    for (const [id, g] of this.ships) if (!seen.has(id)) { g.userData.el.remove(); this.shipGroup.remove(g); this.ships.delete(id); }
    // keep info about ships that died this turn so they can still be drawn during the animation
    if (!animating) this._ghost = {};
    for (const id in st.ships) (this._ghost ||= {})[id] = st.ships[id];

    // loot
    const lseen = new Set();
    for (const l of st.loot) {
      if (l.sys !== this.sysId) continue;
      const m = this.loot.get(l.id) || this._makeLoot(l);
      lseen.add(l.id);
      m.position.set(l.x, 0, l.y);
      m.rotation.set(now / 700, now / 900, 0);
      m.visible = !animating || f > 0.5 || !this._lootBefore || this._lootBefore.has(l.id);
      m.scale.setScalar(sc);
    }
    for (const [id, m] of this.loot) if (!lseen.has(id)) { this.shipGroup.remove(m); this.loot.delete(id); }
    if (!animating) this._lootBefore = new Set(lseen);

    // effects
    for (const fx of this.fx) {
      if (fx.kind === 'shot') {
        const tt = fx.sh.k / SUB;
        const on = f >= tt - 0.02 && f <= tt + 0.07;
        fx.obj.visible = on; fx.spark.visible = on;
        if (on && !fx.played) { fx.played = true; const a = this.ships.get(fx.sh.a); if (a) Audio.weapon(fx.sh.w, this._hearing(a.position)); }
        if (on) {
          const a = this.ships.get(fx.sh.a), b = this.ships.get(fx.sh.b);
          if (a && b) {
            fx.obj.geometry.setFromPoints([a.position.clone().setY(5), b.position.clone().setY(5)]);
            fx.spark.position.copy(b.position);
            fx.spark.scale.setScalar(sc * (60 + fx.sh.d * 2));
          } else { fx.obj.visible = fx.spark.visible = false; }
        }
      } else if (fx.kind === 'boom') {
        const el = (now - this.animStart) / ANIM_MS - fx.b.k / SUB;
        fx.obj.visible = el >= 0 && el < 0.6;
        if (el >= 0 && !fx.played) { fx.played = true; Audio.explosion(fx.b.big, this._hearing(fx.obj.position)); }
        if (fx.obj.visible) {
          const q = el / 0.6;
          fx.obj.scale.setScalar((150 + q * 550) * fx.b.big * sc);
          fx.obj.material.opacity = 1 - q;
        }
      }
    }

    // own ship helpers
    const mg = me && this.ships.get(meId);
    if (me && mg && mg.visible && !me.jump) {
      const range = Math.max(0, ...me.weapons.map(w => D.byId(D.WEAPONS, w).range));
      this.rangeRing.visible = range > 0;
      this.rangeRing.position.copy(mg.position);
      this.rangeRing.scale.setScalar(range);
      const tp = this.orderPoint(st, me, t);
      this.orderLine.visible = !!tp;
      if (tp) {
        this.orderLine.geometry.setFromPoints([mg.position.clone().setY(2), new THREE.Vector3(tp[0], 2, tp[1])]);
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

    this.controls.update();
    this.composer.render();
    this.labels.render(this.scene, this.camera);
    return { animating, f };
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
