import { Net, randomCode } from './net.js';
import * as Sim from './sim.js';
import { View, ANIM_MS } from './render.js';
import * as UI from './ui.js';
import * as Audio from './audio.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'star-rangers-p2p-save';
const ROOM_KEY = 'star-rangers-p2p-room';

const G = {
  st: null, me: null, isHost: false, rd: {}, sel: null, timerEnd: 0,
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
  G.st = state;
  for (const id in state.players) state.players[id].online = false;
  G.me = Sim.addPlayer(state, name, color);
  G.peers = new Map();
  G.turnTimer = 10;
  G.turnLock = 0;
  G.nextTurnAt = performance.now() + G.turnTimer * 1000;
  G.fastAt = 0;
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
    G.st.players[pid].ready = false;
    hostLog(G.st.players[pid].name + ' отключился');
    dirty();
  };
  G.net.onStatus = t => UI.toast(t);
  G.send = m => hostHandle(G.me, m);
  setInterval(hostTick, 40);
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
  broadcast();
}

function hostLog(text) { G.st.log.push({ day: G.st.day, text, to: null }); }

function hostHandle(pid, m) {
  const st = G.st, pl = st.players[pid];
  if (!pl) return;
  switch (m.t) {
    case 'order': Sim.setOrder(st, pid, m.o); break;
    case 'act': Sim.act(st, pid, m.a); break;
    case 'ready': pl.ready = !!m.v; break;
    case 'chat': st.log.push({ day: st.day, text: pl.name + ': ' + String(m.text).slice(0, 200), to: null, chat: 1 }); break;
  }
  dirty();
}

function dirty() { G.dirty = true; }

function readiness() {
  const rd = {};
  for (const pid in G.st.players) rd[pid] = Sim.readyReason(G.st, pid);
  return rd;
}

// World time is authoritative: a turn fires every G.turnTimer seconds no matter what.
// If every online player switched "skip" on, days play back-to-back with no pause.
// If every online player sits on a planet (and isn't taking off), time stops completely.
// In fast mode the next day is computed a bit before the current animation ends,
// so it reaches every player in time and days play back-to-back without a pause.
const FAST_LEAD = 300;

function allDone(rd) {
  const online = Object.keys(G.st.players).filter(p => G.st.players[p].online);
  return online.length > 0 && online.every(p => rd[p]);
}

// Time stops while nobody has anything to do: every online player is either
// sitting on a planet or floating in space without an order.
// Returns '' (time runs), 'landed' (all on planets) or 'idle' (all stand still).
function pauseReason() {
  const online = Object.keys(G.st.players).filter(p => G.st.players[p].online);
  if (!online.length) return '';
  let allLanded = true;
  for (const p of online) {
    const s = G.st.ships[p];
    if (!s || s.jump) return '';
    const landed = s.landed && !(s.order && !(s.order.type === 'land' && s.order.planet === s.landed));
    if (!landed && s.order) return '';
    if (!landed) allLanded = false;
  }
  return allLanded ? 'landed' : 'idle';
}

function hostTick() {
  const now = performance.now();
  // Entering the "nobody is doing anything" state resets everyone's skip flag and stops time.
  // Anyone switching skip on while idle starts the clock again (all of them = fast-forward).
  const idle = pauseReason();
  if (idle && !G.wasIdle) {
    for (const p in G.st.players) G.st.players[p].ready = false;
    dirty();
  }
  G.wasIdle = !!idle;
  const anySkip = Object.values(G.st.players).some(p => p.online && p.ready);
  const paused = idle && !anySkip ? idle : '';
  if (paused !== (G.paused || '')) {
    G.paused = paused;
    if (!paused) G.nextTurnAt = Math.max(now + G.turnTimer * 1000, G.turnLock + 1000); // full turn after unpausing
    dirty();
  }
  if (paused) { if (G.dirty) broadcast(); return; }
  if (now >= G.turnLock) {
    const rd = readiness();
    if (allDone(rd) && now >= G.fastAt) return doTurn();
    if (G.turnTimer > 0 && now >= G.nextTurnAt) return doTurn();
    if (JSON.stringify(rd) !== JSON.stringify(G.rd)) dirty();
  }
  if (G.dirty) broadcast();
}

function doTurn() {
  const anim = Sim.resolveTurn(G.st);
  const now = performance.now();
  // playback of this day starts when the previous one ends (chained) or right now
  const start = G.playEnd && G.playEnd > now ? G.playEnd : now;
  G.playEnd = start + ANIM_MS;
  G.turnLock = G.playEnd - FAST_LEAD;
  G.fastAt = G.playEnd - FAST_LEAD;
  G.nextTurnAt = start + Math.max(G.turnTimer * 1000, ANIM_MS);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.st)); } catch (e) { /* storage full or blocked */ }
  broadcast(anim);
}

function broadcast(anim = null) {
  G.dirty = false;
  const st = G.st;
  if (st.log.length > 150) st.log.splice(0, st.log.length - 150);
  const now = performance.now(), rd = readiness();
  const fast = allDone(rd);
  const timer = G.turnTimer > 0 ? Math.max(0, (fast ? Math.max(G.fastAt, G.turnLock) : G.nextTurnAt) - now) : 0;
  const msg = { t: 'state', st, anim, rd, timer, period: G.turnTimer * 1000, fast, paused: G.paused || '' };
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
    }
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
  const prev = G.st && G.st.ships[G.me];
  const prevLanded = prev && prev.landed, prevJump = prev && !!prev.jump;
  G.st = m.st;
  G.rd = m.rd || {};
  G.timerEnd = m.timer ? performance.now() + m.timer : 0;
  G.timerPeriod = m.period || 0;
  G.fast = !!m.fast;
  G.paused = m.paused || '';
  if (m.anim && G.view) G.view.startAnim(m.anim);
  if (!G.view) return;
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
  [/ПОБЕДА|освобождена/, 'victory'], [/захвачена|Галактика пала/, 'bad'], [/⚠/, 'alert'],
  [/Подобрано/, 'pickup'], [/Награда/, 'coin'], [/Установлено/, 'buyEq'],
  [/Недостаточно|Нет денег|не поместится|Нет свободных|Сначала продайте|отказала|невозможна|Не хватает|Слишком далеко/, 'error'],
];
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
  $('endturn').onclick = toggleReady;
  $('planetbtn').onclick = togglePlanet;
  const vs = Audio.getSettings();
  for (const kind of ['music', 'sfx']) {
    const el = $('vol-' + kind);
    el.value = vs[kind];
    el.oninput = () => { Audio.initAudio(); Audio.setVolume(kind, +el.value); if (kind === 'sfx') Audio.ui('click'); };
  }
  $('timer').onchange = e => { G.turnTimer = +e.target.value; G.nextTurnAt = performance.now() + G.turnTimer * 1000; dirty(); };
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
    if (e.code === 'Space') { e.preventDefault(); toggleReady(); }
    else if (e.code === 'KeyM') UI.openMap(G, $('map').hidden);
    else if (e.code === 'KeyI') UI.openShip(G, $('ship').hidden);
    else if (e.code === 'KeyP') togglePlanet();
    else if (e.code === 'KeyF') { const g = G.view.ships.get(G.me); if (g) G.view.focus(g.position); }
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

function togglePlanet() {
  const me = G.st.ships[G.me];
  if (me && me.landed && G.planetHidden !== me.landed) { G.planetHidden = me.landed; refreshUI(); }
  else showPlanet();
}

function toggleReady() {
  const pl = G.st.players[G.me];
  const v = !pl.ready;
  G.send({ t: 'ready', v });
  pl.ready = v;
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

let lastUi = 0, wasAnimating = false;
function loop(now) {
  requestAnimationFrame(loop);
  if (!G.st || !G.st.ships[G.me]) return;
  const { animating } = G.view.update(G.st, G.me, G.sel);
  UI.turnInfo(G, animating);
  if (G.hover && now - G.hover.t > 120) {
    G.hover.t = now;
    const hit = G.hover.drag ? null : G.view.pick(G.hover.x, G.hover.y);
    UI.tooltip(G, hit, G.hover.x, G.hover.y);
    G.view.renderer.domElement.style.cursor = hit && hit.type !== 'point' ? 'pointer' : 'crosshair';
  }
  if (now - lastUi > 250 || wasAnimating !== animating) {
    lastUi = now;
    UI.player();
    const me = G.st.ships[G.me];
    Audio.setTension(!!(me && !me.jump && !me.landed && Object.values(G.st.ships).some(c =>
      c.sys === me.sys && c !== me && !c.landed && !c.jump && (Sim.hostileTo(c, me) || Sim.hostileTo(me, c)) && Math.hypot(c.x - me.x, c.y - me.y) < 2200)));
    if (wasAnimating && !animating) refreshUI();
    wasAnimating = animating;
  }
}
