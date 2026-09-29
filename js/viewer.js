// Ship model showroom: every hull for every faction, dominators and the citadel.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShipModel, attachEngineGlows } from './models.js';
import { HULLS, KIND_NAMES, KIND_COLORS } from './data.js';

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

const ROWS = [
  { kind: 'player', name: 'Игрок' },
  { kind: 'trader', name: 'Торговец' },
  { kind: 'pirate', name: 'Пират' },
  { kind: 'militia', name: 'Военный' },
  { kind: 'dom', name: 'Доминатор' },
];
const GAP_X = 230, GAP_Z = 210;
let playerColor = 0x4cff9a;
const items = []; // { key, kind, hull, holder, model, engines, radius, label }

function makeItem(kind, hull, x, z) {
  const color = kind === 'player' ? playerColor : KIND_COLORS[kind] || 0xffffff;
  const model = buildShipModel({ kind, eq: { hull }, color });
  const holder = new THREE.Group();
  holder.position.set(x, 0, z);
  holder.add(model.group);
  const engines = attachEngineGlows(model, holder, glowTex);
  scene.add(holder);
  const el = document.createElement('div');
  el.className = 'lbl model';
  el.innerHTML = kind === 'citadel' ? 'Цитадель доминаторов' : `${HULLS.find(h => h.id === hull).name}<small>${KIND_NAMES[kind]}</small>`;
  const lo = new CSS2DObject(el); lo.position.set(0, -model.radius * 0.35, model.radius * 0.55); lo.center.set(0.5, 0);
  holder.add(lo);
  return { kind, hull, holder, model, engines, radius: model.radius, label: lo };
}

function build() {
  for (const it of items) { it.label.element.remove(); scene.remove(it.holder); }
  items.length = 0;
  ROWS.forEach((row, r) => HULLS.forEach((h, c) => items.push(makeItem(row.kind, h.id, (c - 2) * GAP_X, (r - 2) * GAP_Z))));
  const cit = makeItem('citadel', 'h5', 0, (ROWS.length - 2) * GAP_Z + 420);
  cit.holder.scale.setScalar(0.55);
  items.push(cit);
}
build();

// ---- panel: jump to any model
function panel() {
  let h = '';
  for (const row of ROWS) {
    h += `<h3>${row.name}</h3><div class="grid">`;
    HULLS.forEach(hl => { h += `<button data-kind="${row.kind}" data-hull="${hl.id}" title="${hl.name}">${hl.name.slice(0, 5)}</button>`; });
    h += '</div>';
  }
  h += '<h3>Боссы</h3><button data-kind="citadel" data-hull="h5">Цитадель доминаторов</button>';
  $('vlist').innerHTML = h;
}
panel();

let focusAnim = null;
function focusOn(it) {
  document.querySelectorAll('#vlist button').forEach(b => b.classList.toggle('on', !!it && b.dataset.kind === it.kind && b.dataset.hull === it.hull));
  const target = it ? it.holder.position.clone() : new THREE.Vector3(0, 0, 150);
  const dist = it ? it.radius * it.holder.scale.x * 3.2 + 60 : 1500;
  const dir = it ? new THREE.Vector3(0.9, 0.7, 1).normalize() : new THREE.Vector3(0, 0.75, 0.66).normalize();
  focusAnim = { t0: performance.now(), fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: target.clone().add(dir.multiplyScalar(dist)) };
  if (it) {
    const hl = HULLS.find(h => h.id === it.hull);
    $('vinfo').innerHTML = it.kind === 'citadel' ? '<b>Цитадель доминаторов</b><br>стационарная крепость, 3 орудия' :
      `<b>${hl.name}</b> · ${KIND_NAMES[it.kind]}<br>${it.kind === 'dom' ? 'кристаллический корабль' : `корпус ${hl.hp}, трюм ${hl.cargo}, слотов ${hl.slots}`}`;
  }
}
$('vlist').addEventListener('click', e => {
  const b = e.target.closest('button[data-kind]');
  if (b) focusOn(items.find(it => it.kind === b.dataset.kind && it.hull === b.dataset.hull));
});
$('vall').onclick = () => focusOn(null);
$('vcolor').oninput = e => { playerColor = parseInt(e.target.value.slice(1), 16); build(); };

camera.position.set(0, 1100, 1150);
controls.target.set(0, 0, 150);

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
    it.model.group.rotation.y = it.kind === 'citadel' ? spin * 0.5 : spin;
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
