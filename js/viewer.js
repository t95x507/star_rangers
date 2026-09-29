// Ship model showroom: every hull for every faction, dominators and the citadel.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShipModel, attachEngineGlows, buildStation } from './models.js';
import { HULLS, KIND_NAMES, KIND_COLORS, BOSSES, STATIONS } from './data.js';

const $ = id => document.getElementById(id);
const container = $('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
container.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050c);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.add(new THREE.AmbientLight(0x8899bb, 0.35));
const key = new THREE.DirectionalLight(0xfff0d8, 2.2); key.position.set(600, 900, 500); scene.add(key);
const rim = new THREE.DirectionalLight(0x5a8cff, 1.4); rim.position.set(-700, 300, -800); scene.add(rim);

const camera = new THREE.PerspectiveCamera(45, 1, 5, 20000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.85));
composer.addPass(new OutputPass());

// faint starfield
{
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set(new THREE.Vector3().randomDirection().multiplyScalar(8000 + Math.random() * 4000).toArray(), i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0x9fb4d8 })));
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = glowTexture();

// sections of the showroom: each is a row (or two) of models
const BASE = HULLS.filter(h => ['h1', 'h2', 'h3', 'h4', 'h5'].includes(h.id)).map(h => h.id);
const SECTIONS = [
  { name: 'Игрок: все корпуса', items: HULLS.map(h => ({ kind: 'player', hull: h.id })) },
  { name: 'Торговцы', items: ['h1', 'h2', 'h6', 'h8'].map(h => ({ kind: 'trader', hull: h })) },
  { name: 'Пираты', items: BASE.map(h => ({ kind: 'pirate', hull: h })) },
  { name: 'Военные', items: BASE.map(h => ({ kind: 'militia', hull: h })) },
  { name: 'Доминаторы', items: [...BASE.map(h => ({ kind: 'dom', hull: h })), { kind: 'citadel', hull: 'h5', label: 'Цитадель' }] },
  { name: 'Чудовища', items: Object.keys(BOSSES).map(k => ({ kind: k === 'swarm' ? 'swarm' : 'boss', boss: k, hull: 'h5', label: BOSSES[k].name })) },
  { name: 'Станции', items: Object.keys(STATIONS).map(k => ({ station: k, label: STATIONS[k].name })) },
];
const GAP_X = 260, GAP_Z = 260;
let playerColor = 0x4cff9a;
const items = []; // { sec, i, holder, model, engines, radius, label, info }

function makeItem(it, x, z) {
  let model, engines = [];
  const holder = new THREE.Group();
  holder.position.set(x, 0, z);
  if (it.station) model = buildStation(it.station);
  else model = buildShipModel({ kind: it.kind, boss: it.boss, eq: { hull: it.hull }, color: it.kind === 'player' ? playerColor : KIND_COLORS[it.kind] || 0xffffff });
  holder.add(model.group);
  if (!it.station) engines = attachEngineGlows(model, holder, glowTex);
  // monsters and stations are much bigger: shrink them to fit the grid, the focus zooms in anyway
  const k = Math.min(1, 110 / model.radius);
  holder.scale.setScalar(k);
  scene.add(holder);
  const el = document.createElement('div');
  el.className = 'lbl model';
  const hl = HULLS.find(h => h.id === it.hull);
  el.innerHTML = it.label ? esc(it.label) : `${hl.name}<small>${KIND_NAMES[it.kind]}</small>`;
  const lo = new CSS2DObject(el); lo.position.set(0, -model.radius * 0.35, model.radius * 0.8); lo.center.set(0.5, 0);
  holder.add(lo);
  return { ...it, holder, model, engines, radius: model.radius * k, label: lo };
}
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function build() {
  for (const it of items) { it.label.element.remove(); scene.remove(it.holder); }
  items.length = 0;
  let row = 0;
  SECTIONS.forEach((sec, si) => {
    sec.items.forEach((it, i) => {
      const r = row + Math.floor(i / 5), c = i % 5;
      items.push({ ...makeItem(it, (c - 2) * GAP_X, r * GAP_Z), sec: si, i });
    });
    row += Math.ceil(sec.items.length / 5);
  });
}
build();

// ---- panel: jump to any model
function panel() {
  let h = '';
  SECTIONS.forEach((sec, si) => {
    h += `<h3>${sec.name}</h3><div class="grid">`;
    sec.items.forEach((it, i) => {
      const name = it.label || HULLS.find(x => x.id === it.hull).name;
      h += `<button data-sec="${si}" data-i="${i}" title="${esc(name)}">${esc(name.replace(/[«»]/g, '').slice(0, 6))}</button>`;
    });
    h += '</div>';
  });
  $('vlist').innerHTML = h;
}
panel();

let focusAnim = null;
function focusOn(it) {
  document.querySelectorAll('#vlist button').forEach(b => b.classList.toggle('on', !!it && +b.dataset.sec === it.sec && +b.dataset.i === it.i));
  const target = it ? it.holder.position.clone() : new THREE.Vector3(0, 0, 1300);
  const dist = it ? it.radius * 3.2 + 60 : 3000;
  const dir = it ? new THREE.Vector3(0.9, 0.7, 1).normalize() : new THREE.Vector3(0, 0.75, 0.66).normalize();
  focusAnim = { t0: performance.now(), fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: target.clone().add(dir.multiplyScalar(dist)) };
  if (it) {
    const hl = HULLS.find(h => h.id === it.hull);
    let t = `<b>${esc(it.label || hl.name)}</b>`;
    if (it.station) t += `<br>${STATIONS[it.station].desc}`;
    else if (it.boss) t += `<br>${BOSSES[it.boss].desc || 'трутень Матки Роя'}`;
    else if (it.kind === 'dom') t += ' · доминатор<br>кристаллический корабль';
    else if (it.kind === 'citadel') t += '<br>стационарная крепость доминаторов';
    else t += ` · ${KIND_NAMES[it.kind]}<br>прочность ${hl.hp}, броня ${hl.armor}, трюм ${hl.cargo}, слотов ${hl.slots}+${hl.mods}`;
    $('vinfo').innerHTML = t;
  }
}
$('vlist').addEventListener('click', e => {
  const b = e.target.closest('button[data-sec]');
  if (b) focusOn(items.find(it => it.sec === +b.dataset.sec && it.i === +b.dataset.i));
});
$('vall').onclick = () => focusOn(null);
$('vcolor').oninput = e => { playerColor = parseInt(e.target.value.slice(1), 16); build(); };

camera.position.set(0, 2400, 3300);
controls.target.set(0, 0, 1300);

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now(), spin = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if ($('vspin').checked) spin += dt * 0.35;
  for (const it of items) {
    it.model.group.rotation.y = it.kind === 'citadel' || it.station ? spin * 0.5 : spin;
    if (it.model.anim) it.model.anim(now / 1000);
    // engine sprites live on the holder, so rotate their positions with the model
    it.model.engines.forEach((e, i) => {
      const p = e.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), it.model.group.rotation.y);
      it.engines[i].position.copy(p);
      it.engines[i].scale.setScalar(it.engines[i].userData.base * (0.85 + Math.random() * 0.3));
    });
  }
  if (focusAnim) {
    const k = Math.min(1, (now - focusAnim.t0) / 700), e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(focusAnim.fromT, focusAnim.toT, e);
    camera.position.lerpVectors(focusAnim.fromP, focusAnim.toP, e);
    if (k >= 1) focusAnim = null;
  }
  controls.update();
  composer.render();
  labels.render(scene, camera);
});
