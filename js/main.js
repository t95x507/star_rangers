import { Net, randomCode } from './net.js';
import * as Sim from './sim.js';
import { View, DAY_MS } from './render.js';
import * as UI from './ui.js';
import * as Audio from './audio.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'star-rangers-p2p-save';
const ROOM_KEY = 'star-rangers-p2p-room';

const G = {
  st: null, me: null, isHost: false, sel: null, paused: false, speed: 1,
  net: new Net(), view: null, planetTab: 'market', planetHidden: null,
};
window.G = G; // handy for debugging from the console

// ---------------------------------------------------------------- lobby

const params = new URLSearchParams(location.search);
$('l-name').value = localStorage.getItem('sr-name') || 'Пилот' + Math.floor(Math.random() * 900 + 100);
$('l-color').value = localStorage.getItem('sr-color') || '#4cff9a';
if (params.get('room')) $('l-code').value = params.get('room').toUpperCase();
if (localStorage.getItem(SAVE_KEY)) $('l-continue').hidden = false;

const lobbyStatus = t => { $('l-status').textContent = t; };
const myName = () => { const n = $('l-name').value.trim() || 'Пилот'; localStorage.setItem('sr-name', n); return n; };
const myColor = () => { localStorage.setItem('sr-color', $('l-color').value); return parseInt($('l-color').value.slice(1), 16); };

// audio may only start after a user gesture
addEventListener('pointerdown', () => Audio.initAudio(), { once: true });
addEventListener('keydown', () => Audio.initAudio(), { once: true });

$('l-host').onclick = () => startHost(Sim.newGame());
$('l-continue').onclick = () => {
  try { startHost(JSON.parse(localStorage.getItem(SAVE_KEY))); }
  catch (e) { lobbyStatus('Сохранение повреждено'); }
};
$('l-join').onclick = startClient;
$('l-code').addEventListener('keydown', e => { if (e.key === 'Enter') startClient(); });

function setBusy(b) { for (const id of ['l-host', 'l-join', 'l-continue']) $(id).disabled = b; }

// ---------------------------------------------------------------- host

async function startHost(state) {
  setBusy(true);
  lobbyStatus('Создаём комнату…');
  const name = myName(), color = myColor();
  // Reuse the previous room code so friends' links survive a page reload of the host.
  let code = null;
  const saved = localStorage.getItem(ROOM_KEY);
  for (let i = 0; i < 8 && !code; i++) {
    const want = saved && i < 5 ? saved : randomCode();
    try { code = await G.net.host(want); }
    catch (e) {
      if (e.type !== 'unavailable-id') { lobbyStatus('Сеть недоступна (' + (e.type || e.message) + '). Играем без мультиплеера.'); break; }
      // the old tab may still hold the id for a few seconds
      if (want === saved) { lobbyStatus('Занимаем прежний код комнаты ' + saved + '…'); await new Promise(r => setTimeout(r, 2000)); }
    }
  }
  if (code) localStorage.setItem(ROOM_KEY, code);
  G.isHost = true;
  G.code = code;
  G.st = Sim.migrate(state);
  for (const id in state.players) Object.assign(state.players[id], { online: false, pause: false });
  G.me = Sim.addPlayer(state, name, color);
  G.peers = new Map();
  G.acc = 0; G.lastStep = performance.now(); G.lastFull = 0; G.lastTick = 0; G.ev = null;
  document.body.classList.add('is-host');

  G.seen = new Map();
  G.net.onMessage = (peer, m) => {
    G.seen.set(peer, performance.now());
    if (m.t === 'pong') return;
    if (m.t === 'hello') {
      const name = String(m.name || 'Пилот').slice(0, 16);
      if (G.st.players[G.me].name === name) { G.net.sendTo(peer, { t: 'reject', why: 'Имя «' + name + '» занято хостом — выберите другое' }); return; }
      // Same name from a new connection = the player reloaded the page: hand the ship over.
      for (const [oldPeer, oldPid] of G.peers) {
        if (oldPeer !== peer && G.st.players[oldPid]?.name === name) { G.peers.delete(oldPeer); G.net.sendTo(oldPeer, { t: 'kicked' }); setTimeout(() => G.net.drop(oldPeer), 300); }
      }
      const pid = Sim.addPlayer(G.st, name, m.color | 0);
      G.peers.set(peer, pid);
      G.net.sendTo(peer, { t: 'welcome', you: pid });
      hostLog(name + ' подключился');
      dirty();
      return;
    }
    const pid = G.peers.get(peer);
    if (pid) hostHandle(pid, m);
  };
  G.net.onLeave = peer => {
    G.seen.delete(peer);
    const pid = G.peers.get(peer);
    if (!pid) return;
    G.peers.delete(peer);
    G.st.players[pid].online = false;
    G.st.players[pid].pause = false;
    hostLog(G.st.players[pid].name + ' отключился');
    dirty();
  };
  G.net.onStatus = t => UI.toast(t);
  G.send = m => hostHandle(G.me, m);
  startClock(hostTick);
  // heartbeat: WebRTC notices dead peers very late, so drop anyone silent for 15 s
  setInterval(() => {
    G.net.broadcast({ t: 'ping' });
    const now = performance.now();
    for (const peer of [...G.net.conns.keys()]) {
      if (!G.seen.has(peer)) G.seen.set(peer, now);
      else if (now - G.seen.get(peer) > 15000) { G.net.drop(peer); G.net.onLeave(peer); }
    }
  }, 3000);
  enterGame();
  sendTick(); sendFull();
}

// Background tabs throttle timers to once a second; a worker's timer keeps the world
// running at full speed even while the host's tab is hidden.
function startClock(fn) {
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 20)'], { type: 'text/javascript' })));
    w.onmessage = fn;
  } catch (e) { setInterval(fn, 20); }
}

function hostLog(text) { G.st.log.push({ day: G.st.day, text, to: null }); }

function hostHandle(pid, m) {
  const st = G.st, pl = st.players[pid];
  if (!pl) return;
  switch (m.t) {
    case 'order': Sim.setOrder(st, pid, m.o); break;
    case 'act': Sim.act(st, pid, m.a); break;
    case 'pause': pl.pause = !!m.v; break;
    case 'chat': st.log.push({ day: st.day, text: pl.name + ': ' + String(m.text).slice(0, 200), to: null, chat: 1 }); break;
  }
  dirty();
}

function dirty() { G.dirty = true; }

// The world runs in real time: the host advances the simulation one substep (1/SUB of a day)
// at a time and streams small "tick" messages (ship positions and events) to everyone.
// The whole state goes out once a day and whenever something besides movement changed.
// Time stops only while every online player has asked for a pause.
const FULL_EVERY = 250; // ms, at most this often
const TICK_EVERY = 90;  // ms

function hostTick() {
  const st = G.st, now = performance.now();
  const dt = now - G.lastStep;
  G.lastStep = now;
  const paused = Sim.allPaused(st);
  if (paused !== G.paused) { G.paused = paused; dirty(); }
  let stepped = false, newDay = false;
  if (!paused) {
    const subMs = DAY_MS / G.speed / Sim.SUB;
    G.acc = Math.min(G.acc + dt, subMs * Sim.SUB); // after a long stall, don't try to catch up more than a day
    while (G.acc >= subMs) {
      G.acc -= subMs;
      const tail = st.log[st.log.length - 1], nLoot = st.loot.length;
      const ev = Sim.step(st);
      stepped = true;
      if (!G.ev) G.ev = ev; else for (const k in ev) G.ev[k].push(...ev[k]);
      if (ev.booms.length || ev.pickups.length || ev.jumps.length || st.log[st.log.length - 1] !== tail || st.loot.length !== nLoot) G.dirty = true;
      if (st.sub === 0) newDay = true;
    }
  } else G.acc = 0;
  if (newDay) {
    G.dirty = true;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* storage full or blocked */ }
  }
  if ((stepped || G.ev) && now - G.lastTick >= TICK_EVERY) sendTick();
  if (G.dirty && (newDay || now - G.lastFull >= FULL_EVERY)) sendFull();
}

// positions of every ship in the systems players are looking at: [id, sys, x, y, heading*100, hull, landed, shield]
function snapShips(st) {
  const watch = new Set();
  for (const pid in st.players) { const s = st.ships[pid]; if (s && st.players[pid].online) watch.add(s.jump ? s.jump.to : s.sys); }
  const out = [];
  for (const id in st.ships) {
    const s = st.ships[id];
    if (s.jump || s.sys == null || !Sim.alive(s) || !watch.has(s.sys)) continue;
    out.push([id, s.sys, Math.round(s.x), Math.round(s.y), s.hd == null ? null : Math.round(s.hd * 100), Math.ceil(s.hull), s.landed ? 1 : 0, Math.round(s.shield || 0)]);
  }
  return out;
}

function sendTick() {
  const msg = { t: 'tick', T: Sim.nowT(G.st), subMs: DAY_MS / G.speed / Sim.SUB, s: snapShips(G.st), ev: G.ev };
  G.ev = null;
  G.lastTick = performance.now();
  if (G.net.conns.size) G.net.broadcast(msg);
  applyTick(msg);
}

function sendFull() {
  G.dirty = false;
  G.lastFull = performance.now();
  const st = G.st;
  if (st.log.length > 150) st.log.splice(0, st.log.length - 150);
  const msg = { t: 'state', st, paused: G.paused, speed: G.speed };
  if (G.net.conns.size) G.net.broadcast(msg);
  applyState(msg);
}

// ---------------------------------------------------------------- client

async function startClient() {
  const code = $('l-code').value.trim().toUpperCase();
  if (code.length !== 5) return lobbyStatus('Введите код комнаты из 5 символов');
  setBusy(true);
  lobbyStatus('Подключаемся к ' + code + '…');
  G.name = myName(); G.color = myColor();
  try {
    await joinRoom(code);
  } catch (e) {
    lobbyStatus(e.message || String(e));
    setBusy(false);
  }
}

async function joinRoom(code) {
  const net = G.net;
  net.onMessage = (_, m) => {
    if (m.t === 'ping') { net.send({ t: 'pong' }); return; }
    if (m.t === 'welcome') { G.me = m.you; }
    else if (m.t === 'reject') { lobbyStatus(m.why); setBusy(false); G.rejected = true; }
    else if (m.t === 'kicked') { G.rejected = true; UI.toast('Вы зашли в игру с другой вкладки или устройства'); $('turninfo').textContent = 'Сессия открыта в другом месте.'; }
    else if (m.t === 'state') {
      const first = !G.view;
      applyState(m);
      if (first && G.me) enterGame();
    } else if (m.t === 'tick') applyTick(m);
  };
  net.onLeave = () => { if (G.net === net && !G.rejected) reconnect(code); };
  net.onStatus = t => UI.toast(t);
  await net.join(code);
  G.code = code;
  G.send = m => G.net.send(m);
  net.send({ t: 'hello', name: G.name, color: G.color });
}

// Lost the host: keep retrying with the same name, the host hands our ship back.
async function reconnect(code) {
  if (G.reconnecting) return;
  G.reconnecting = true;
  for (let i = 1; ; i++) {
    UI.toast('Связь с хостом потеряна, переподключение… (' + i + ')');
    $('turninfo').textContent = 'Нет связи с хостом, переподключаемся…';
    try { G.net.peer && G.net.peer.destroy(); } catch (e) { /* already gone */ }
    G.net = new Net();
    try { await joinRoom(code); UI.toast('Связь восстановлена'); $('turninfo').textContent = ''; break; }
    catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
  G.reconnecting = false;
}

// ---------------------------------------------------------------- shared

function applyState(m) {
  // (the host's state is the same object it keeps mutating, so remember the flags we saw last time)
  const prev = G.prevMe;
  const prevLanded = prev && prev.landed, prevJump = prev && prev.jump;
  G.st = m.st;
  const cur = G.st.ships[G.me];
  G.prevMe = cur && { landed: cur.landed, jump: !!cur.jump };
  G.paused = !!m.paused;
  G.speed = m.speed || 1;
  if (!G.view) return;
  // joined while the world stands still: no ticks are coming, so take positions from the state itself
  const last = G.view.snaps[G.view.snaps.length - 1];
  if (!last || last.T < Sim.nowT(G.st)) G.view.pushTick({ T: Sim.nowT(G.st), subMs: DAY_MS / G.speed / Sim.SUB, s: snapShips(G.st) });
  const me = G.st.ships[G.me];
  if (me && me.landed !== prevLanded) { G.planetHidden = null; if (me.landed) G.sel = null; }
  if (me && prev) {
    if (!prevLanded && me.landed) Audio.ui('land');
    else if (prevLanded && !me.landed && !me.jump) Audio.ui('takeoff');
    if (!prevJump && me.jump) Audio.ui('jump');
    else if (prevJump && !me.jump) Audio.ui('arrive');
  }
  logSounds();
  refreshUI();
}

// play a cue for fresh log lines addressed to us (or important global news)
const LOG_SOUNDS = [
  [/ПОБЕДА|освобождена|Чудовище повержено|Контракт выполнен/, 'victory'], [/захвачена|Галактика пала/, 'bad'], [/⚠|☠/, 'alert'],
  [/Награда|Продано|Сдано протоплазмы/, 'coin'], [/Установлено|Куплено|Улучшено|Контракт принят/, 'buyEq'],
  [/Недостаточно|Нет денег|не поместится|Нет свободных|Нет места|слоты заняты|Сначала сним|нельзя снять|отказала|невозможна|Не хватает|Слишком далеко/, 'error'],
];
// Positions between full states: patch the state we have and feed the renderer.
function applyTick(m) {
  if (!G.st) return;
  if (!G.isHost) {
    G.st.day = Math.floor(m.T / Sim.SUB); G.st.sub = m.T % Sim.SUB;
    for (const e of m.s) { const s = G.st.ships[e[0]]; if (s) { s.x = e[2]; s.y = e[3]; if (e[4] != null) s.hd = e[4] / 100; s.hull = e[5]; s.shield = e[7]; } }
  }
  if (G.view) G.view.pushTick(m);
}

function logSounds() {
  const log = G.st.log;
  const key = e => e.day + '|' + e.text + '|' + e.to;
  let i = log.length;
  if (G._lastLog) { while (i > 0 && key(log[i - 1]) !== G._lastLog) i--; if (i === 0) i = log.length; }
  else i = log.length;
  const fresh = log.slice(i);
  if (log.length) G._lastLog = key(log[log.length - 1]);
  let played = 0;
  for (const e of fresh) {
    if (played > 1 || (e.to && e.to !== G.me)) continue;
    if (e.chat) { Audio.ui('click'); played++; continue; }
    for (const [re, snd] of LOG_SOUNDS) if (re.test(e.text)) { Audio.ui(snd); played++; break; }
  }
}

function refreshUI() {
  if (!G.st || !G.st.ships[G.me]) return;
  UI.hud(G); UI.players(G); UI.planet(G); UI.selinfo(G); UI.log(G); UI.drawMap(G); UI.ship(G);
}

G.order = o => {
  G.send({ t: 'order', o });
  Audio.ui('order');
  const me = G.st.ships[G.me];
  if (me) {
    if (!G.isHost) me.order = o; // optimistic, the host will confirm
    if (o && o.type !== 'jump') G.planetHidden = me.landed;
  }
  refreshUI();
};

function enterGame() {
  $('lobby').hidden = true;
  $('ui').hidden = false;
  G.view = new View($('game'));
  if (G.code) {
    const link = location.origin + location.pathname + '?room=' + G.code;
    $('room').innerHTML = `Комната: <b>${G.code}</b> <button id="copylink">копировать ссылку</button>`;
    $('copylink').onclick = () => { navigator.clipboard.writeText(link); UI.toast('Ссылка скопирована — отправьте друзьям'); };
  } else $('room').textContent = 'Одиночная игра (офлайн)';
  if (!G.isHost) $('room').innerHTML = `Комната: <b>${G.code}</b>`;

  UI.bindPlanet(G); UI.bindSel(G); UI.bindMap(G); UI.bindShip(G); UI.bindPlayer();
  $('endturn').onclick = togglePause;
  $('planetbtn').onclick = togglePlanet;
  const vs = Audio.getSettings();
  for (const kind of ['music', 'sfx']) {
    const el = $('vol-' + kind);
    el.value = vs[kind];
    el.oninput = () => { Audio.initAudio(); Audio.setVolume(kind, +el.value); if (kind === 'sfx') Audio.ui('click'); };
  }
  $('speed').onchange = e => { G.speed = +e.target.value; dirty(); };
  $('chat').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const t = e.target.value.trim(); if (t) G.send({ t: 'chat', text: t }); e.target.value = ''; e.target.blur(); }
    if (e.key === 'Escape') e.target.blur();
    e.stopPropagation();
  });

  const cv = G.view.renderer.domElement;
  let down = null;
  cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  cv.addEventListener('pointerup', e => {
    if (!down || down.b !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    click(e.clientX, e.clientY);
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  // hover info: remember the cursor, the render loop re-picks it a few times per second
  cv.addEventListener('pointermove', e => { G.hover = { x: e.clientX, y: e.clientY, drag: e.buttons !== 0, t: G.hover ? G.hover.t : 0 }; });
  cv.addEventListener('pointerleave', () => { G.hover = null; UI.tooltip(G, null); });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.code === 'KeyM') UI.openMap(G, $('map').hidden);
    else if (e.code === 'KeyI') UI.openShip(G, $('ship').hidden);
    else if (e.code === 'KeyP') togglePlanet();
    else if (e.code === 'KeyF') { if (G.sel) G.focusSel(); else focusMe(); } // selection first, otherwise own ship
    else if (e.code === 'Enter') $('chat').focus();
    else if (e.code === 'Escape') { G.sel = null; UI.openMap(G, false); UI.openShip(G, false); UI.openPlayer(false); refreshUI(); }
  });
  refreshUI();
  requestAnimationFrame(loop);
}

function showPlanet() {
  const me = G.st.ships[G.me];
  if (!me || !me.landed) return;
  if (me.order && me.order.type !== 'land') G.order(null); // cancel a pending take-off
  G.planetHidden = null;
  refreshUI();
}

function focusMe() { G.view.focusOn({ type: 'ship', id: G.me }); }
G.focusSel = () => { if (G.sel) G.view.focusOn(G.sel); };

function togglePlanet() {
  const me = G.st.ships[G.me];
  if (me && me.landed && G.planetHidden !== me.landed) { G.planetHidden = me.landed; refreshUI(); }
  else showPlanet();
}

// Space asks for a pause; time stops once every online player has asked.
function togglePause() {
  const pl = G.st.players[G.me];
  const v = !pl.pause;
  G.send({ t: 'pause', v });
  pl.pause = v;
  Audio.ui('click');
  UI.players(G);
}

function click(x, y) {
  const me = G.st.ships[G.me];
  if (!me || me.jump) return;
  const hit = G.view.pick(x, y);
  if (!hit) return;
  if (hit.type === 'point') { G.sel = null; G.order({ type: 'move', x: hit.x, y: hit.y }); return; }
  G.sel = hit;
  if (hit.type === 'planet' && me.landed === hit.id && !(me.order && me.order.type !== 'land')) { showPlanet(); return; } // our own planet: reopen its screen
  if (hit.type === 'planet') G.order({ type: 'land', planet: hit.id });
  else if (hit.type === 'loot') G.order({ type: 'loot', id: hit.id });
  else if (hit.type === 'ship') {
    const s = G.st.ships[hit.id];
    if (s && s.id !== G.me && Sim.hostileTo(me, s) && !s.landed) G.order({ type: 'attack', target: s.id });
  }
  refreshUI();
}

let lastUi = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!G.st || !G.st.ships[G.me]) return;
  G.view.update(G.st, G.me, G.sel);
  UI.turnInfo(G);
  if (G.hover && now - G.hover.t > 120) {
    G.hover.t = now;
    const hit = G.hover.drag ? null : G.view.pick(G.hover.x, G.hover.y);
    UI.tooltip(G, hit, G.hover.x, G.hover.y);
    G.view.renderer.domElement.style.cursor = hit && hit.type !== 'point' ? 'pointer' : 'crosshair';
  }
  if (now - lastUi > 250) {
    lastUi = now;
    UI.player();
    UI.hud(G);
    const me = G.st.ships[G.me];
    Audio.setTension(!!(me && !me.jump && !me.landed && Object.values(G.st.ships).some(c =>
      c.sys === me.sys && c !== me && !c.landed && !c.jump && (Sim.hostileTo(c, me) || Sim.hostileTo(me, c)) && Math.hypot(c.x - me.x, c.y - me.y) < 2200)));
  }
}
