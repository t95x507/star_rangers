// Authoritative game simulation. Runs only on the host, in real time:
// a day is SUB substeps, the host advances one substep at a time and streams the result.
import * as D from './data.js';

export const SUB = 20;
export const ARRIVE_R = 2500;
const R = Math.random;
const rnd = (a, b) => a + R() * (b - a);
const rint = (a, b) => Math.floor(a + R() * (b - a + 1));
const pick = a => a[Math.floor(R() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function planetPos(p, t) {
  const a = p.a0 + p.w * t;
  return [Math.cos(a) * p.r, Math.sin(a) * p.r];
}

export function stats(s) {
  const e = s.eq;
  const hull = D.byId(D.HULLS, e.hull), eng = D.byId(D.ENGINES, e.engine), tank = D.byId(D.TANKS, e.tank);
  const droid = e.droid ? D.byId(D.DROIDS, e.droid) : null;
  return {
    maxHull: Math.round(hull.hp * (s.hpMul || 1)), cargoCap: hull.cargo, slots: hull.slots,
    speed: eng.speed * (s.spdMul ?? 1), jumpRange: eng.jump, maxFuel: tank.fuel, repair: droid ? droid.rep : 0,
  };
}
// Uninstalled equipment lies in the hold as items { u: unique id, id: equipment id } and takes cargo space.
export const itemSize = id => { const d = D.itemDef(id); return d ? d.def.size : 0; };
export const itemsUsed = s => (s.items || []).reduce((a, it) => a + itemSize(it.id), 0);
export const cargoUsed = s => Object.values(s.cargo).reduce((a, b) => a + b, 0) + itemsUsed(s);
const newItem = (st, id) => ({ u: 'i' + (st.nextId++), id });
export const sysDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const jumpCost = d => Math.ceil(d);
export const jumpDays = d => Math.max(1, Math.ceil(d / 9));
export const alive = s => s.dead == null;
export const nowT = st => st.day * SUB + (st.sub || 0); // global time in substeps
export const tNow = st => nowT(st) / SUB;                 // the same in days
export const sellPrice = p => Math.floor(p * 0.9);

export function findPlanet(st, pid) {
  for (const sys of st.systems) for (const p of sys.planets) if (p.id === pid) return p;
  return null;
}

export function hostileTo(a, b) {
  if (a.aggro && a.aggro[b.id]) return true;
  const k = b.kind;
  switch (a.kind) {
    case 'dom': case 'citadel': return k !== 'dom' && k !== 'citadel';
    case 'pirate': return k === 'player' || k === 'trader' || k === 'militia' || k === 'dom';
    case 'militia': return k === 'pirate' || k === 'dom' || k === 'citadel' || (k === 'player' && b.wanted > 0);
    case 'player': return k === 'pirate' || k === 'dom' || k === 'citadel' || (k === 'militia' && a.wanted > 0);
  }
  return false;
}

function shipsIn(st, sysId) {
  const r = [];
  for (const id in st.ships) { const s = st.ships[id]; if (s.sys === sysId && !s.jump && alive(s)) r.push(s); }
  return r;
}
function nearest(list, pred, s, maxD) {
  let best = null, bd = maxD;
  for (const c of list) {
    if (c === s || !alive(c) || !pred(c)) continue;
    const d = dist(c.x, c.y, s.x, s.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
export function neighbors(st, sysId, range) {
  const a = st.systems[sysId];
  return st.systems.filter(b => b.id !== sysId && sysDist(a, b) <= range);
}

function log(st, text, to = null) {
  st.log.push({ day: st.day, text, to });
  if (st.log.length > 120) st.log.splice(0, st.log.length - 120);
}

// ---------------------------------------------------------------- generation

function makePlanet(st, sysId, r, i) {
  const econ = pick(Object.keys(D.ECON));
  const p = {
    id: 'p' + (st.nextId++), sys: sysId,
    name: pick(D.PLANET_PARTS_A) + pick(D.PLANET_PARTS_B),
    r, a0: rnd(0, Math.PI * 2), w: 0.22 * Math.pow(600 / r, 1.5) * (R() < 0.5 ? 1 : -1) * 0.8,
    size: rint(55, 120), color: pick(D.PLANET_COLORS), race: pick(D.RACES).id, econ,
    tech: Math.min(4, rint(0, 3) + (i === 0 ? 1 : 0)), prices: {}, ring: R() < 0.2,
  };
  for (const g of D.GOODS) p.prices[g.id] = Math.round(g.base * D.ECON[econ].mult[g.id] * rnd(0.85, 1.15));
  return p;
}

export function newGame() {
  const st = { v: 1, day: 0, nextId: 1, systems: [], ships: {}, loot: [], log: [], players: {}, raidTimer: 60, victory: false };
  const N = 16;
  // grow the galaxy outward so every system is reachable with the starting engine (jump 20)
  let systems = [];
  const names = shuffle([...D.SYSTEM_NAMES]);
  for (let tries = 0; tries < 50 && systems.length < N; tries++) {
    systems = [{ id: 0, name: names[0], x: rnd(10, 30), y: rnd(10, 70) }];
    let att = 0;
    while (systems.length < N && att++ < 6000) {
      const base = pick(systems), a = rnd(0, Math.PI * 2), d = rnd(13, 18);
      const x = base.x + Math.cos(a) * d, y = base.y + Math.sin(a) * d;
      if (x < 4 || x > 116 || y < 4 || y > 76) continue;
      if (systems.every(s => Math.hypot(s.x - x, s.y - y) > 12.5)) systems.push({ id: systems.length, name: names[systems.length], x, y });
    }
  }
  st.systems = systems;
  for (const sys of systems) {
    sys.owner = 'coal';
    sys.cap = 0;
    sys.star = { color: pick(D.STAR_COLORS), size: rint(160, 260) };
    sys.planets = [];
    const np = rint(2, 4);
    let r = rnd(550, 750);
    for (let i = 0; i < np; i++) { sys.planets.push(makePlanet(st, sys.id, Math.round(r), i)); r += rnd(380, 620); }
  }
  systems[0].planets[0].tech = Math.max(1, systems[0].planets[0].tech);
  // Dominators take the 3 systems furthest from the start
  const far = [...systems].sort((a, b) => sysDist(b, systems[0]) - sysDist(a, systems[0])).slice(0, 3);
  for (const sys of far) captureSystem(st, sys, true);
  // initial population
  for (const sys of systems) {
    if (sys.owner !== 'coal') continue;
    for (let i = rint(1, 3); i > 0; i--) spawnTrader(st, sys);
    if (R() < 0.7 || sys.id === 0) spawnMilitia(st, sys);
    if (sys.id !== 0 && R() < 0.3) spawnPirate(st, sys);
  }
  log(st, 'Галактика в опасности: доминаторы захватили системы ' + far.map(s => s.name).join(', ') + '. Уничтожьте их цитадели!');
  return st;
}

// ---------------------------------------------------------------- ships

function makeShip(st, kind, sys, x, y, o = {}) {
  const id = 's' + (st.nextId++);
  const s = {
    id, kind, name: o.name || D.KIND_NAMES[kind], sys, x, y,
    eq: o.eq || { hull: 'h1', engine: 'e1', tank: 't1', droid: null }, weapons: o.weapons || [],
    cargo: o.cargo || {}, items: o.items || [], credits: o.credits || 0, fuel: 0, hull: 0,
    order: null, landed: null, jump: null, ai: {}, aggro: {}, wanted: 0,
    color: o.color || D.KIND_COLORS[kind] || 0xffffff, hpMul: o.hpMul || 1, spdMul: o.spdMul ?? 1, kills: 0,
  };
  const S = stats(s);
  s.hull = S.maxHull; s.fuel = S.maxFuel;
  st.ships[id] = s;
  return s;
}
const tierNow = st => Math.min(4, Math.floor(st.day / 30));
const eqT = (t, e = t) => ({ hull: D.HULLS[Math.min(4, t)].id, engine: D.ENGINES[Math.min(4, e)].id, tank: 't2', droid: null });
function randCargo(n, amt) {
  const c = {};
  for (let i = 0; i < n; i++) { const g = pick(D.GOODS).id; c[g] = (c[g] || 0) + rint(amt[0], amt[1]); }
  return c;
}
// a random piece of equipment up to the given tier (never the worthless starter engine/tank)
function randomItemId(maxTier) {
  const list = pick([D.WEAPONS, D.WEAPONS, D.ENGINES, D.TANKS, D.DROIDS]);
  const t = rint(Math.max(0, maxTier - 2), maxTier);
  return list[Math.max(t, list[0].price ? 0 : 1)].id;
}
function edgePos() { const a = rnd(0, Math.PI * 2); return [Math.cos(a) * ARRIVE_R, Math.sin(a) * ARRIVE_R]; }

function spawnTrader(st, sys) {
  const p = pick(sys.planets);
  const [x, y] = planetPos(p, tNow(st));
  const s = makeShip(st, 'trader', sys.id, x, y, { name: pick(D.TRADER_NAMES) + ' ' + rint(10, 99), eq: eqT(rint(0, 2), 0), cargo: randCargo(2, [8, 30]), credits: rint(300, 1500), spdMul: 0.85 });
  s.landed = p.id; s.ai.wait = rint(0, 3);
  return s;
}
function spawnMilitia(st, sys) {
  const p = pick(sys.planets);
  const [x, y] = planetPos(p, tNow(st));
  const t = Math.min(3, 1 + Math.floor(tierNow(st) / 2));
  return makeShip(st, 'militia', sys.id, x + 80, y, { name: 'Патруль ' + rint(100, 999), eq: eqT(t, 1), weapons: t > 1 ? ['w2', 'w1'] : ['w1'], credits: 200 });
}
function spawnPirate(st, sys) {
  const [x, y] = edgePos();
  // pirates roughly match a player of the same stage: a fight should take 4-5 days
  const t = Math.min(4, tierNow(st) + (R() < 0.25 ? 1 : 0));
  const w = [];
  for (let i = 0; i < 1 + Math.floor(t / 2); i++) w.push(D.WEAPONS[rint(Math.max(0, t - 1), t)].id);
  const items = R() < 0.25 ? [newItem(st, randomItemId(Math.min(4, t + 1)))] : []; // plunder from earlier raids
  return makeShip(st, 'pirate', sys.id, x, y, { name: pick(D.PIRATE_NAMES), eq: eqT(t, Math.min(3, t)), weapons: w, hpMul: 0.7, credits: rint(300, 1200) + t * 500, cargo: randCargo(1, [5, 20]), items });
}
function spawnDom(st, sys, x, y) {
  const t = Math.min(4, 1 + Math.floor(tierNow(st) / 1.5));
  const w = [];
  for (let i = 0; i < 1 + Math.floor(t / 2); i++) w.push(D.WEAPONS[rint(Math.max(1, t - 1), t)].id);
  return makeShip(st, 'dom', sys.id, x + rnd(-150, 150), y + rnd(-150, 150), { name: pick(D.DOM_NAMES) + '-' + rint(1, 99), eq: eqT(t, 1), weapons: w, hpMul: 0.8, cargo: { tech: rint(3, 12), mins: rint(3, 12) }, credits: 400 });
}
function captureSystem(st, sys, initial = false) {
  sys.owner = 'dom';
  sys.cap = 0;
  sys.domTimer = 0;
  const a = rnd(0, Math.PI * 2);
  const c = makeShip(st, 'citadel', sys.id, Math.cos(a) * 420, Math.sin(a) * 420, { name: 'Цитадель', eq: { hull: 'h5', engine: 'e1', tank: 't1', droid: 'd3' }, weapons: ['w4', 'w3', 'w3'], hpMul: initial ? 3 : 1.6, spdMul: 0, credits: 5000 });
  sys.citadel = c.id;
  for (let i = 0; i < (initial ? 3 : 1); i++) spawnDom(st, sys, c.x, c.y);
}

export function addPlayer(st, name, color) {
  for (const id in st.players) if (st.players[id].name === name) { st.players[id].online = true; st.players[id].color = color; return id; }
  const sys = st.systems[0];
  const p = pick(sys.planets);
  const [x, y] = planetPos(p, tNow(st));
  const s = makeShip(st, 'player', 0, x, y, { name, color, weapons: ['w1'], credits: 3000 });
  s.landed = p.id;
  st.players[s.id] = { name, color, pause: false, online: true };
  log(st, name + ' вступил в ряды рейнджеров.');
  return s.id;
}

// ---------------------------------------------------------------- orders & instant actions

export function setOrder(st, pid, o) {
  const s = st.ships[pid];
  if (!s || s.jump) return;
  if (o && o.type === 'jump') {
    const S = stats(s), a = st.systems[s.sys], b = st.systems[o.to];
    if (!b || b.id === s.sys) return;
    const d = sysDist(a, b);
    if (d > S.jumpRange) { log(st, 'Слишком далеко для двигателя (' + d.toFixed(1) + ' > ' + S.jumpRange + ')', pid); return; }
    if (s.fuel < jumpCost(d)) { log(st, 'Не хватает топлива для прыжка', pid); return; }
  }
  s.order = o;
}

const itemName = id => D.itemDef(id).def.name;

// Install an item from the hold. Whatever it replaces goes back into the hold (if it fits).
function equipItem(st, s, a, say) {
  const i = s.items.findIndex(it => it.u === a.u);
  const d = i >= 0 && D.itemDef(s.items[i].id);
  if (!d) return;
  const S = stats(s), room = S.cargoCap - cargoUsed(s) + d.def.size; // free space once the item leaves the hold
  let old = null;
  if (d.kind === 'weapon') {
    const want = Number.isInteger(a.idx) ? a.idx : -1;
    const slot = want >= 0 && want < s.weapons.length ? want : s.weapons.length < S.slots ? s.weapons.length : -1;
    if (slot < 0) return say('Все оружейные слоты заняты — перетащите оружие на слот, чтобы заменить');
    old = s.weapons[slot] || null;
    if (old && itemSize(old) > room) return say('Нет места в трюме для снятого: ' + itemName(old));
    s.weapons[slot] = s.items[i].id;
  } else {
    old = s.eq[d.kind] || null;
    if (old && itemSize(old) > room) return say('Нет места в трюме для снятого: ' + itemName(old));
    s.eq[d.kind] = s.items[i].id;
    if (d.kind === 'tank') s.fuel = Math.min(s.fuel, d.def.fuel);
  }
  s.items.splice(i, 1);
  if (old) s.items.push(newItem(st, old));
  say('Установлено: ' + d.def.name + (old ? ' (' + itemName(old) + ' — в трюм)' : ''));
}

function unequipItem(st, s, a, say) {
  if (a.slot !== 'weapon' && a.slot !== 'droid') return say('Двигатель и бак нельзя снять — только заменить другим');
  const id = a.slot === 'weapon' ? (Number.isInteger(a.idx) ? s.weapons[a.idx] : null) : s.eq.droid;
  if (!id) return;
  if (itemSize(id) > stats(s).cargoCap - cargoUsed(s)) return say('Нет места в трюме для ' + itemName(id));
  if (a.slot === 'weapon') s.weapons.splice(a.idx, 1); else s.eq.droid = null;
  s.items.push(newItem(st, id));
  say('Снято в трюм: ' + itemName(id));
}

export function act(st, pid, a) {
  const s = st.ships[pid];
  if (!s) return;
  const say = t => log(st, t, pid);
  s.items ||= [];
  // things you can do anywhere: jettison, swap equipment
  switch (a.type) {
    case 'drop': {
      const q = Math.min(a.qty, s.cargo[a.good] || 0);
      if (q <= 0 || s.jump || s.sys == null) return;
      s.cargo[a.good] -= q;
      if (!s.cargo[a.good]) delete s.cargo[a.good];
      if (!s.landed) st.loot.push({ id: 'l' + (st.nextId++), sys: s.sys, x: s.x + rnd(-40, 40), y: s.y + rnd(-40, 40), credits: 0, cargo: { [a.good]: q }, items: [], ttl: 20, t0: nowT(st) });
      return say('Выброшено за борт: ' + q + ' ' + D.byId(D.GOODS, a.good).name);
    }
    case 'dropItem': {
      const i = s.items.findIndex(it => it.u === a.u);
      if (i < 0 || s.jump || s.sys == null || s.landed) return;
      const [it] = s.items.splice(i, 1);
      st.loot.push({ id: 'l' + (st.nextId++), sys: s.sys, x: s.x + rnd(-40, 40), y: s.y + rnd(-40, 40), credits: 0, cargo: {}, items: [it], ttl: 30, t0: nowT(st) });
      return say('Выброшено за борт: ' + itemName(it.id));
    }
    case 'equip': return equipItem(st, s, a, say);
    case 'unequip': return unequipItem(st, s, a, say);
  }
  if (!s.landed) return;
  const p = findPlanet(st, s.landed);
  const S = stats(s);
  switch (a.type) {
    case 'buy': {
      const price = p.prices[a.good];
      let q = Math.min(a.qty, S.cargoCap - cargoUsed(s), Math.floor(s.credits / price));
      if (q <= 0) return say('Нет денег или места в трюме');
      s.credits -= q * price;
      s.cargo[a.good] = (s.cargo[a.good] || 0) + q;
      p.prices[a.good] = Math.round(price * (1 + 0.003 * q));
      break;
    }
    case 'sell': {
      const q = Math.min(a.qty, s.cargo[a.good] || 0);
      if (q <= 0) return;
      s.credits += q * sellPrice(p.prices[a.good]);
      s.cargo[a.good] -= q;
      if (!s.cargo[a.good]) delete s.cargo[a.good];
      p.prices[a.good] = Math.max(5, Math.round(p.prices[a.good] * (1 - 0.003 * q)));
      break;
    }
    case 'repair': {
      const miss = S.maxHull - s.hull, per = 3;
      const q = Math.min(miss, Math.floor(s.credits / per));
      s.hull += q; s.credits -= q * per;
      break;
    }
    case 'refuel': {
      const miss = Math.floor(S.maxFuel - s.fuel), per = 12;
      const q = Math.min(miss, Math.floor(s.credits / per));
      s.fuel += q; s.credits -= q * per;
      break;
    }
    case 'buyEq': {
      const list = D.EQ[a.slot];
      const tier = D.tierOf(list, a.id);
      if (tier < 0 || tier > p.tech) return;
      const item = list[tier];
      const old = s.eq[a.slot] ? D.byId(list, s.eq[a.slot]) : null;
      const cost = item.price - (old ? Math.floor(old.price * 0.5) : 0);
      if (s.credits < cost) return say('Недостаточно кредитов');
      if (a.slot === 'hull') {
        if (cargoUsed(s) > item.cargo) return say('Груз не поместится в новый корпус');
        if (s.weapons.length > item.slots) return say('Сначала снимите или продайте лишнее оружие');
      }
      const oldMax = S.maxHull;
      s.credits -= cost;
      s.eq[a.slot] = item.id;
      if (a.slot === 'hull') s.hull = Math.max(1, Math.round(s.hull / oldMax * item.hp));
      if (a.slot === 'tank') s.fuel = Math.min(s.fuel, item.fuel);
      say('Установлено: ' + item.name);
      break;
    }
    case 'buyW': {
      const tier = D.tierOf(D.WEAPONS, a.id);
      if (tier < 0 || tier > p.tech) return;
      const w = D.WEAPONS[tier];
      if (s.credits < w.price) return say('Недостаточно кредитов');
      if (s.weapons.length < S.slots) s.weapons.push(w.id);
      else if (w.size <= S.cargoCap - cargoUsed(s)) { s.items.push(newItem(st, w.id)); say(w.name + ' — в трюм: все оружейные слоты заняты'); }
      else return say('Нет свободных оружейных слотов и места в трюме');
      s.credits -= w.price;
      break;
    }
    case 'sellW': {
      const id = s.weapons[a.idx];
      if (!id) return;
      s.weapons.splice(a.idx, 1);
      s.credits += D.itemSell(id);
      say('Продано: ' + itemName(id) + ' за ' + D.itemSell(id) + ' кр.');
      break;
    }
    case 'sellItem': {
      const i = s.items.findIndex(it => it.u === a.u);
      if (i < 0) return;
      const [it] = s.items.splice(i, 1);
      s.credits += D.itemSell(it.id);
      say(D.itemSell(it.id) ? 'Продано: ' + itemName(it.id) + ' за ' + D.itemSell(it.id) + ' кр.' : 'Сдано в утиль: ' + itemName(it.id));
      break;
    }
    case 'takeoff': {
      s.landed = null; s.order = null;
      const a2 = rnd(0, Math.PI * 2);
      s.x += Math.cos(a2) * (p.size + 60); s.y += Math.sin(a2) * (p.size + 60);
      break;
    }
  }
}

// ---------------------------------------------------------------- pause votes

// Time stops only while every online player asks for a pause.
export function allPaused(st) {
  const on = Object.values(st.players).filter(p => p.online);
  return on.length > 0 && on.every(p => p.pause);
}

// ---------------------------------------------------------------- AI

function aiThink(st, s) {
  if (s.jump || s.kind === 'player' || s.kind === 'citadel') return;
  const sys = st.systems[s.sys];
  const here = shipsIn(st, s.sys);
  const flee = () => {
    const nb = neighbors(st, s.sys, 22).filter(x => x.owner === 'coal');
    if (nb.length) { s.landed = null; s.order = { type: 'jump', to: pick(nb).id }; return true; }
    return false;
  };
  const threatened = () => nearest(here, c => hostileTo(c, s) && !c.landed, s, 900);
  switch (s.kind) {
    case 'trader': {
      if (s.landed) {
        if (--s.ai.wait <= 0) {
          if (R() < 0.3 && flee()) return;
          const ps = sys.planets.filter(p => p.id !== s.landed);
          if (ps.length) s.order = { type: 'land', planet: pick(ps).id };
        }
      } else if (sys.owner === 'dom') flee();
      else if (threatened() && s.hull < stats(s).maxHull * 0.6 && R() < 0.5) {
        let best = null, bd = 1e9;
        for (const p of sys.planets) { const [px, py] = planetPos(p, tNow(st)); const d = dist(px, py, s.x, s.y); if (d < bd) { bd = d; best = p; } }
        s.order = { type: 'land', planet: best.id };
      } else if (!s.order) s.order = { type: 'land', planet: pick(sys.planets).id };
      break;
    }
    case 'pirate': {
      if (s.landed) s.landed = null;
      if (s.hull < stats(s).maxHull * 0.25 && !s.ai.fled) { s.ai.fled = 1; if (flee()) return; }
      const cur = s.order && s.order.type === 'attack' && st.ships[s.order.target];
      if (!cur || !alive(cur) || cur.sys !== s.sys || cur.landed || cur.jump) {
        const tg = nearest(here, c => (c.kind === 'trader' || c.kind === 'player') && !c.landed, s, 1900);
        if (tg) s.order = { type: 'attack', target: tg.id };
        else if (!s.order || s.order.type !== 'move') {
          if (R() < 0.06) flee();
          else s.order = { type: 'move', x: rnd(-2200, 2200), y: rnd(-2200, 2200) };
        }
      }
      break;
    }
    case 'militia': {
      if (s.landed) { if (--s.ai.wait > 0) return; s.landed = null; }
      const tg = nearest(here, c => hostileTo(s, c) && !c.landed, s, 2800);
      if (tg) s.order = { type: 'attack', target: tg.id };
      else if (!s.order || s.order.type === 'attack') {
        if (s.hull < stats(s).maxHull * 0.5) { s.order = { type: 'land', planet: pick(sys.planets).id }; s.ai.wait = 3; }
        else s.order = { type: 'move', x: rnd(-1800, 1800), y: rnd(-1800, 1800) };
      }
      break;
    }
    case 'dom': {
      if (s.landed) s.landed = null;
      if (s.order && s.order.type === 'jump') return;
      const tg = nearest(here, c => hostileTo(s, c) && !c.landed, s, 3200);
      if (tg) s.order = { type: 'attack', target: tg.id };
      else if (!s.order || s.order.type === 'attack') {
        const c = st.ships[sys.citadel];
        const cx = c ? c.x : 0, cy = c ? c.y : 0;
        s.order = { type: 'move', x: cx + rnd(-1200, 1200), y: cy + rnd(-1200, 1200) };
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- navigation
// Ships turn at a limited rate (and slow down in hard turns), lead orbiting planets
// to meet them, and fly around the star along tangents (planets are not obstacles).

const TURN = 0.45;       // max heading change per substep, radians
const SUN_PAD = 260;     // keep-out margin around the star when just passing by
const SUN_NEAR = 40;     // how close to the star's surface a direct order can take a player
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

function obstaclesAt(st, sysId) {
  return [{ x: 0, y: 0, r: st.systems[sysId].star.size + SUN_PAD }];
}

// Aim point to meet a planet that keeps moving along its orbit: refine the travel time a few times.
function intercept(p, t, sx, sy, speed) {
  let T = 0;
  for (let i = 0; i < 6; i++) { const [x, y] = planetPos(p, t + T); T = Math.min(3, dist(sx, sy, x, y) / speed); }
  return planetPos(p, t + T);
}

// Unit direction to fly: straight at the goal, or along a tangent of the first obstacle in the way.
function steer(sx, sy, tx, ty, obs) {
  const L = Math.hypot(tx - sx, ty - sy) || 1, ux = (tx - sx) / L, uy = (ty - sy) / L;
  let block = null, bd = Infinity;
  for (const o of obs) {
    const ox = o.x - sx, oy = o.y - sy;
    if (Math.hypot(ox, oy) < o.r) { block = o; break; } // already inside a keep-out zone
    const proj = ox * ux + oy * uy;
    if (proj <= 0 || proj > L) continue;
    if (Math.abs(ox * uy - oy * ux) < o.r && proj < bd) { block = o; bd = proj; }
  }
  if (!block) return [ux, uy];
  const ox = block.x - sx, oy = block.y - sy, d = Math.hypot(ox, oy);
  if (d <= block.r) { // inside: slide outwards along the tangent that points towards the goal
    const nx = -ox / d, ny = -oy / d;
    let tx2 = -ny, ty2 = nx;
    if (tx2 * ux + ty2 * uy < 0) { tx2 = -tx2; ty2 = -ty2; }
    const k = Math.hypot(tx2 + nx * 0.5, ty2 + ny * 0.5);
    return [(tx2 + nx * 0.5) / k, (ty2 + ny * 0.5) / k];
  }
  const base = Math.atan2(oy, ox), a = Math.asin(Math.min(1, block.r / d));
  const ang = ux * oy - uy * ox > 0 ? base - a : base + a; // obstacle on the left -> pass it on the right
  return [Math.cos(ang), Math.sin(ang)];
}

// Advances one ship by one substep along its order. Mutates x, y and heading `hd`.
// Returns null while travelling, { cancel } if the order became invalid, { arrived, tx, ty } on arrival.
export function stepShip(st, s, t, predicting = false) {
  const o = s.order;
  const speed = stats(s).speed, step = speed / SUB;
  let tx, ty, stop = 0;
  if (o.type === 'move') { tx = o.x; ty = o.y; }
  else if (o.type === 'follow' || o.type === 'attack') {
    const tg = st.ships[o.target];
    if (!tg || !alive(tg) || tg.sys !== s.sys || tg.jump || tg.landed) return { cancel: true };
    tx = tg.x; ty = tg.y;
    stop = o.type === 'follow' ? 140 : Math.max(80, 0.75 * Math.min(...s.weapons.map(w => D.byId(D.WEAPONS, w).range), 400));
  } else if (o.type === 'land') {
    const p = findPlanet(st, o.planet);
    if (!p || p.sys !== s.sys) return { cancel: true };
    const [px, py] = planetPos(p, t);
    if (dist(s.x, s.y, px, py) <= step + p.size * 0.5) return { arrived: true, tx: px, ty: py };
    [tx, ty] = intercept(p, t, s.x, s.y, speed);
  } else if (o.type === 'loot') {
    const l = st.loot.find(l => l.id === o.id);
    if (!l) return { cancel: true };
    tx = l.x; ty = l.y;
  } else return { cancel: true };
  const obs = obstaclesAt(st, s.sys);
  // dogfight: once in weapons range, circle-strafe around the target instead of parking next to it
  if (o.type === 'attack') {
    const d = dist(s.x, s.y, tx, ty);
    if (d <= stop * 1.6) {
      if (predicting) return { arrived: true, tx, ty };
      if (!s.ai.orbit || R() < 0.025) s.ai.orbit = s.ai.orbit ? -s.ai.orbit : (R() < 0.5 ? 1 : -1); // sometimes break the other way
      const rx = (s.x - tx) / (d || 1), ry = (s.y - ty) / (d || 1);
      const k = Math.max(-1, Math.min(1, (d - stop) / stop)) * 1.6; // pull in if too far, push out if too close
      let mx = -ry * s.ai.orbit - rx * k, my = rx * s.ai.orbit - ry * k;
      // circling right by the star: never dive into it
      const sr = st.systems[s.sys].star.size + SUN_NEAR, cd = Math.hypot(s.x, s.y);
      if (cd < sr + 60) { const nx = s.x / (cd || 1), ny = s.y / (cd || 1), inward = mx * nx + my * ny; if (inward < 0) { mx -= inward * nx; my -= inward * ny; } }
      const ml = Math.hypot(mx, my) || 1;
      return fly(s, Math.atan2(my / ml, mx / ml), step * 0.8);
    }
  }
  const sun = obs[0];
  let gd = Math.hypot(tx, ty);
  // a player sent right next to the star on purpose: only the star's body is in the way then
  if (s.kind === 'player' && gd < sun.r) sun.r = st.systems[s.sys].star.size + SUN_NEAR;
  if (gd < sun.r) { // goal inside the star: stop at its edge, on the goal's side (facing the ship if it's the very centre)
    if (gd < sun.r * 0.3) { tx = s.x; ty = s.y; gd = Math.hypot(tx, ty) || 1; }
    tx *= sun.r / gd; ty *= sun.r / gd;
  }
  if (o.type !== 'land') {
    const d = dist(s.x, s.y, tx, ty);
    if (d - stop <= step) {
      if (d > stop) { const f = (d - stop) / d; s.x += (tx - s.x) * f; s.y += (ty - s.y) * f; }
      return { arrived: true, tx, ty };
    }
  }
  const [dx, dy] = steer(s.x, s.y, tx, ty, obs);
  return fly(s, Math.atan2(dy, dx), step);
}

// turn towards `want` at a limited rate and move, braking in hard turns
function fly(s, want, step) {
  if (s.hd == null) s.hd = want;
  s.hd = wrapA(s.hd + Math.max(-TURN, Math.min(TURN, wrapA(want - s.hd))));
  const f = Math.max(0.35, Math.cos(wrapA(want - s.hd)));
  s.x += Math.cos(s.hd) * step * f;
  s.y += Math.sin(s.hd) * step * f;
  return null;
}

// Where a ship will go under its current order (no combat), for drawing the planned route.
export function predictPath(st, ship, days = 3) {
  const pts = [[ship.x, ship.y]];
  if (!ship.order || ship.jump || ship.sys == null || ship.order.type === 'jump') return pts;
  if (ship.landed && ship.order.type === 'land' && ship.order.planet === ship.landed) return pts;
  const s = { ...ship, landed: null, order: { ...ship.order }, ai: { ...ship.ai } };
  for (let k = 1; k <= days * SUB; k++) {
    const r = stepShip(st, s, tNow(st) + k / SUB, true);
    if (r && r.cancel) break;
    pts.push(r && r.tx != null && ship.order.type === 'land' ? [r.tx, r.ty] : [s.x, s.y]);
    if (r) break;
  }
  return pts;
}

// ---------------------------------------------------------------- deaths

function dropLoot(st, s, T) {
  const player = s.kind === 'player';
  const cargo = {};
  for (const g in s.cargo) { const q = Math.floor(s.cargo[g] * (player ? 0.7 : 1)); if (q > 0) cargo[g] = q; }
  const credits = Math.floor(s.credits * (player ? 0.15 : 0.6));
  // equipment: a player's wreck spills part of the hold (the installed kit survives in the escape pod);
  // NPCs sometimes leave their installed guns and modules intact, a citadel always does
  const items = [];
  if (player) { for (const it of s.items || []) if (R() < 0.7) items.push(it); }
  else {
    const boss = s.kind === 'citadel';
    for (const w of s.weapons) if (boss || R() < 0.3) items.push(newItem(st, w));
    for (const slot of ['engine', 'tank', 'droid']) {
      const id = s.eq[slot];
      if (id && D.itemDef(id).def.price > 0 && (boss || R() < 0.12)) items.push(newItem(st, id));
    }
    items.push(...(s.items || []));
  }
  if (!credits && !Object.keys(cargo).length && !items.length) return;
  st.loot.push({ id: 'l' + (st.nextId++), sys: s.sys, x: s.x, y: s.y, credits, cargo, items, ttl: items.length ? 30 : 20, t0: T });
}

function destroy(st, s, T, killer, ev) {
  s.dead = T;
  ev.booms.push({ sys: s.sys, x: Math.round(s.x), y: Math.round(s.y), T, big: s.kind === 'citadel' ? 3 : 1 });
  dropLoot(st, s, T);
  const kp = killer && killer.kind === 'player' ? killer : null;
  if (kp) {
    kp.kills++;
    const bounty = s.kind === 'pirate' ? 700 + tierNow(st) * 300 : s.kind === 'dom' ? 1500 + tierNow(st) * 400 : 0;
    if (bounty) { kp.credits += bounty; log(st, 'Награда за уничтожение ' + s.name + ': ' + bounty + ' кр.', kp.id); }
  }
  if (s.kind === 'player') log(st, s.name + ' уничтожен' + (killer ? ' (' + killer.name + ')' : '') + '!');
  if (s.kind === 'citadel') {
    const sys = st.systems[s.sys];
    sys.owner = 'coal'; sys.citadel = null; sys.cap = 0;
    for (const o of shipsIn(st, sys.id)) if (o.kind === 'dom') { o.dead = T; ev.booms.push({ sys: o.sys, x: Math.round(o.x), y: Math.round(o.y), T: T + 2, big: 1 }); }
    const heroes = shipsIn(st, sys.id).filter(o => o.kind === 'player');
    for (const h of heroes) h.credits += 10000;
    log(st, '★ Система ' + sys.name + ' освобождена от доминаторов! ' + heroes.map(h => h.name).join(', ') + ' получают по 10000 кр.');
    if (!st.systems.some(x => x.owner === 'dom')) { st.victory = true; log(st, '★★★ ПОБЕДА! Все цитадели доминаторов уничтожены! ★★★'); }
  }
}

function respawn(st, s) {
  const from = st.systems[s.sys] || st.systems[0];
  const cands = st.systems.filter(x => x.owner === 'coal').sort((a, b) => sysDist(a, from) - sysDist(b, from));
  const sys = cands[0] || st.systems[0];
  const p = pick(sys.planets);
  const [x, y] = planetPos(p, tNow(st));
  const S = stats(s);
  Object.assign(s, { dead: undefined, sys: sys.id, x, y, landed: p.id, order: null, jump: null, hull: S.maxHull, fuel: S.maxFuel, cargo: {}, items: [], credits: Math.floor(s.credits * 0.75), wanted: 0, aggro: {} });
  log(st, 'Спасательная капсула доставила вас на ' + p.name + ' (' + sys.name + '). Груз потерян.', s.id);
}

// ---------------------------------------------------------------- real-time simulation
// The world advances in substeps (SUB per day); the host calls step() on a real-time clock,
// so orders take effect on the very next substep. What happens is reported as events stamped
// with the global substep time T (day * SUB + substep) for the clients to animate.

const DEATH_LINGER = 10; // substeps a wreck stays in the state, so clients see the explosion first

export function step(st) {
  const ev = { shots: [], booms: [], pickups: [], jumps: [] };
  st.sub ||= 0;
  const T = nowT(st) + 1; // the moment this step brings the world to
  const t = T / SUB;      // the same in days (planet orbits)
  const ships = Object.values(st.ships);
  if (st.sub === 0) for (const s of ships) if (alive(s)) aiThink(st, s);

  // take-offs, jump starts and hyperspace travel
  for (const s of ships) {
    if (!alive(s)) continue;
    if (s.jump) {
      if (--s.jump.left > 0) continue;
      const a = st.systems[s.jump.from], b = st.systems[s.jump.to];
      const ang = Math.atan2(a.y - b.y, a.x - b.x) + rnd(-0.3, 0.3);
      s.sys = b.id; s.x = Math.cos(ang) * ARRIVE_R; s.y = Math.sin(ang) * ARRIVE_R; s.hd = ang + Math.PI;
      s.jump = null;
      if (s.kind === 'player') log(st, s.name + ' прибыл в систему ' + b.name);
      continue;
    }
    if (s.landed && s.order && !(s.order.type === 'land' && s.order.planet === s.landed)) {
      const p = findPlanet(st, s.landed);
      s.landed = null;
      const a = rnd(0, Math.PI * 2);
      if (p) { s.x += Math.cos(a) * (p.size + 40); s.y += Math.sin(a) * (p.size + 40); s.hd = a; }
    }
    if (s.order && s.order.type === 'jump') {
      const a = st.systems[s.sys], b = st.systems[s.order.to];
      const d = sysDist(a, b);
      if (s.kind === 'player') {
        if (d > stats(s).jumpRange || s.fuel < jumpCost(d)) { s.order = null; continue; }
        s.fuel -= jumpCost(d);
      }
      ev.jumps.push({ id: s.id, sys: s.sys, x: Math.round(s.x), y: Math.round(s.y), T });
      s.jump = { from: a.id, to: b.id, left: jumpDays(d) * SUB, total: jumpDays(d) * SUB }; // in substeps
      s.order = null;
      s.sys = null;
      if (s.kind === 'player') log(st, s.name + ' уходит в гиперпрыжок: ' + a.name + ' → ' + b.name);
    }
  }

  const active = ships.filter(s => s.sys != null && !s.jump && alive(s));
  const bySys = {};
  for (const s of active) (bySys[s.sys] ||= []).push(s);

  // movement
  for (const s of active) {
    if (s.landed) { const p = findPlanet(st, s.landed); if (p) [s.x, s.y] = planetPos(p, t); continue; }
    const o = s.order;
    if (!o) continue;
    const r = stepShip(st, s, t);
    if (!r) continue;
    if (r.cancel) { s.order = null; continue; }
    if (o.type === 'move') s.order = null;
    else if (o.type === 'land') {
      const sys = st.systems[s.sys];
      if (sys.owner === 'dom' && s.kind !== 'dom') { s.order = null; if (s.kind === 'player') log(st, 'Планета оккупирована доминаторами — посадка невозможна', s.id); }
      else if (s.kind === 'player' && s.wanted > 0) { s.order = null; log(st, 'Вы в розыске — планета отказала в посадке (ещё ' + s.wanted + ' дн.)', s.id); }
      else {
        s.landed = o.planet; s.order = null; s.ai.wait = rint(1, 3);
        [s.x, s.y] = [r.tx, r.ty];
        if (s.kind === 'player') log(st, 'Посадка на ' + findPlanet(st, o.planet).name, s.id);
      }
    }
  }

  // loot pickup: only by an explicit "pick up" order, never automatically
  for (const s of active) {
    if (s.kind !== 'player' || s.landed || !s.order || s.order.type !== 'loot') continue;
    for (const l of st.loot) {
      if (l.id !== s.order.id || l.taken || dist(l.x, l.y, s.x, s.y) > 70) continue;
      const cap = stats(s).cargoCap;
      const got = [], left = [];
      let gotEq = false;
      if (l.credits) { s.credits += l.credits; got.push(l.credits + ' кр.'); l.credits = 0; }
      // equipment first (worth more per unit of space), then goods into whatever room is left
      const li = l.items ||= [];
      for (let j = 0; j < li.length; j++) {
        if (itemSize(li[j].id) > cap - cargoUsed(s)) { left.push(itemName(li[j].id)); continue; }
        (s.items ||= []).push(li[j]);
        got.push(itemName(li[j].id)); gotEq = true;
        li.splice(j--, 1);
      }
      for (const g in l.cargo) {
        const q = Math.min(l.cargo[g], cap - cargoUsed(s));
        if (q > 0) { s.cargo[g] = (s.cargo[g] || 0) + q; l.cargo[g] -= q; got.push(q + ' ' + D.byId(D.GOODS, g).name); }
        if (!l.cargo[g]) delete l.cargo[g];
        else left.push(l.cargo[g] + ' ' + D.byId(D.GOODS, g).name);
      }
      if (!Object.keys(l.cargo).length && !li.length) l.taken = true;
      if (got.length) {
        log(st, 'Подобрано: ' + got.join(', '), s.id);
        ev.pickups.push({ sys: s.sys, id: l.id, x: Math.round(l.x), y: Math.round(l.y), ship: s.id, T, text: '+' + got.join(', +'), all: !!l.taken, eq: gotEq });
      }
      if (left.length) log(st, 'Не хватает места в трюме: ' + left.join(', '), s.id);
      s.order = null;
      break;
    }
  }
  st.loot = st.loot.filter(l => !l.taken);

  // combat: every weapon fires `shots` times a day (its daily damage split between them)
  // and then cools down for SUB / shots substeps
  for (const s of active) {
    if (!alive(s) || s.landed || !s.weapons.length) continue;
    if (!s.cd || s.cd.length !== s.weapons.length) s.cd = s.weapons.map(() => rint(1, 3));
    const list = bySys[s.sys];
    for (let wi = 0; wi < s.weapons.length; wi++) {
      if (s.cd[wi] > 0 && --s.cd[wi] > 0) continue;
      const W = D.byId(D.WEAPONS, s.weapons[wi]);
      let tg = null;
      if (s.order && s.order.type === 'attack') {
        const c = st.ships[s.order.target];
        if (c && alive(c) && c.sys === s.sys && !c.landed && !c.jump && dist(c.x, c.y, s.x, s.y) <= W.range) tg = c;
      }
      if (!tg) tg = nearest(list, c => !c.landed && hostileTo(s, c), s, W.range);
      if (!tg) continue; // stays loaded until something comes into range
      s.cd[wi] = Math.floor(SUB / W.shots);
      const dmg = Math.max(1, Math.round(W.dmg / W.shots * rnd(0.8, 1.2)));
      tg.hull -= dmg;
      // spread the volleys of one substep a little so guns don't all go off on the same frame
      ev.shots.push({ sys: s.sys, a: s.id, b: tg.id, T: T + Math.floor(R() * 8) / 10, w: W.id, d: dmg });
      if (tg.kind === 'player' && !tg.aggro[s.id]) log(st, hostileTo(tg, s) ? '⚔ Бой: ' + s.name + ' открыл огонь' : '⚠ ' + s.name + ' атакует вас!', tg.id);
      tg.aggro[s.id] = 4;
      if (s.kind === 'player' && (tg.kind === 'trader' || tg.kind === 'militia')) {
        if (!s.wanted) log(st, s.name + ' напал на ' + tg.name + ' и объявлен в розыск!');
        s.wanted = 20;
      }
      if (tg.hull <= 0) destroy(st, tg, T, s, ev);
    }
  }

  // slow repairs: droids (and NPC crews) patch the hull a little every substep
  for (const s of active) {
    if (!alive(s)) continue;
    const S = stats(s);
    const rep = (S.repair + (s.kind !== 'player' ? Math.ceil(S.maxHull * 0.03) : 0)) / SUB;
    if (rep && s.hull < S.maxHull) s.hull = Math.min(S.maxHull, s.hull + rep);
  }

  // wrecks: NPCs vanish, players get the escape pod
  for (const s of ships) {
    if (alive(s) || T - s.dead < DEATH_LINGER) continue;
    if (s.kind === 'player') respawn(st, s);
    else delete st.ships[s.id];
  }

  if (++st.sub >= SUB) endOfDay(st);
  return ev;
}

function endOfDay(st) {
  st.day++;
  st.sub = 0;
  for (const s of Object.values(st.ships)) {
    if (!alive(s)) continue;
    for (const k in s.aggro) if (--s.aggro[k] <= 0) delete s.aggro[k];
    if (s.wanted > 0) s.wanted--;
  }
  for (const l of st.loot) l.ttl--;
  st.loot = st.loot.filter(l => l.ttl > 0);
  // economy drift
  for (const sys of st.systems) for (const p of sys.planets) for (const g of D.GOODS) {
    const target = g.base * D.ECON[p.econ].mult[g.id];
    p.prices[g.id] = Math.max(5, Math.round(p.prices[g.id] + (target - p.prices[g.id]) * 0.07 + target * rnd(-0.03, 0.03)));
  }
  worldTick(st);
}

// A whole day at once (tests and tools): all its events merged.
export function runDay(st) {
  const all = { shots: [], booms: [], pickups: [], jumps: [] };
  do { const ev = step(st); for (const k in all) all[k].push(...ev[k]); } while (st.sub !== 0);
  return all;
}

function worldTick(st) {
  const all = Object.values(st.ships).filter(s => !s.jump);
  const count = (sysId, kind) => all.filter(s => s.sys === sysId && s.kind === kind).length;
  let pirates = Object.values(st.ships).filter(s => s.kind === 'pirate').length;
  for (const sys of st.systems) {
    if (sys.owner === 'coal') {
      if (count(sys.id, 'trader') < 3 && R() < 0.3) spawnTrader(st, sys);
      const doms0 = count(sys.id, 'dom');
      if (count(sys.id, 'militia') < (doms0 ? 3 : sys.id === 0 ? 2 : 1) && R() < (doms0 ? 0.5 : 0.12)) spawnMilitia(st, sys);
      const doms = count(sys.id, 'dom');
      if (doms >= 3) {
        sys.cap++;
        if (sys.cap === 1) log(st, '⚠ Доминаторы атакуют систему ' + sys.name + '! Если их не остановить, система падёт через 10 дней.');
        if (sys.cap >= 10) { captureSystem(st, sys); log(st, '☠ Система ' + sys.name + ' захвачена доминаторами!'); }
      } else sys.cap = Math.max(0, sys.cap - 1);
    } else {
      const c = st.ships[sys.citadel];
      if (c && count(sys.id, 'dom') < 4 && st.day % 3 === 0) spawnDom(st, sys, c.x, c.y);
    }
  }
  if (!st.defeat && !st.systems.some(s => s.owner === 'coal')) {
    st.defeat = true;
    log(st, '☠☠☠ Галактика пала. Доминаторы победили… Но рейнджеры не сдаются — отбейте системы обратно!');
  }
  if (pirates < 6 && R() < 0.25) {
    const cands = st.systems.filter(s => s.owner === 'coal' && (s.id !== 0 || st.day > 15));
    if (cands.length) spawnPirate(st, pick(cands));
  }
  // dominator raids
  if (--st.raidTimer <= 0) {
    st.raidTimer = rint(25, 35) + 6 * st.systems.filter(s => s.owner === 'dom').length;
    const opts = [];
    for (const sys of st.systems) if (sys.owner === 'dom') for (const nb of neighbors(st, sys.id, 26)) if (nb.owner === 'coal') opts.push([sys, nb]);
    if (opts.length) {
      const [src, dst] = pick(opts);
      const c = st.ships[src.citadel];
      const group = all.filter(s => s.sys === src.id && s.kind === 'dom').slice(0, 3 + Math.floor(st.day / 80));
      while (group.length < 3 && c) group.push(spawnDom(st, src, c.x, c.y));
      for (const s of group) { s.landed = null; s.order = { type: 'jump', to: dst.id }; }
      log(st, '⚠ Флот доминаторов (' + group.length + ') выдвигается из ' + src.name + ' в сторону ' + dst.name + '!');
    }
  }
}
