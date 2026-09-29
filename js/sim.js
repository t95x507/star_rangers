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

// ---------------------------------------------------------------- ship stats
// Everything derived from the hull, engine, tank, droid, modules and medical buffs.
export function stats(s) {
  if (s.boss) {
    const B = D.BOSSES[s.boss], k = s.pow || 1; // monsters grow along with the rangers hunting them
    return { maxHull: Math.round(B.hp * k), armor: B.armor, cargoCap: 999, slots: 9, mods: 0, speed: B.speed * (s.slow > 0 ? 0.6 : 1), jumpRange: 99, maxFuel: 99, repair: 0, shieldMax: Math.round((B.shield || 0) * k), shieldRegen: (B.regen || 0) * k, dmgMul: 1 + (k - 1) * 0.6, rangeMul: 1, evade: 0 };
  }
  const e = s.eq;
  const hull = D.eqDef(e.hull), eng = D.eqDef(e.engine), tank = D.eqDef(e.tank), droid = e.droid ? D.eqDef(e.droid) : null;
  const m = { armor: hull.armor || 0, shield: 0, regen: 0, dmgPct: 0, rangePct: 0, speedPct: 0, cargo: 0, evade: 0, hullPct: 0, rep: droid ? droid.rep : 0 };
  for (const id of s.mods || []) { const d = D.eqDef(id); if (d) for (const k in m) if (d[k]) m[k] += d[k]; }
  const b = s.buffs || {};
  if (b.dmg > 0) m.dmgPct += 20;
  if (b.spd > 0) m.speedPct += 15;
  if (b.rep > 0) m.rep += 15;
  if (b.hull > 0) m.hullPct += 15;
  return {
    maxHull: Math.round(hull.hp * (s.hpMul || 1) * (1 + m.hullPct / 100)), armor: m.armor,
    cargoCap: hull.cargo + m.cargo, slots: hull.slots, mods: hull.mods,
    speed: eng.speed * (s.spdMul ?? 1) * (hull.spd || 1) * (1 + m.speedPct / 100) * (s.slow > 0 ? 0.6 : 1),
    jumpRange: eng.jump, maxFuel: tank.fuel, repair: m.rep,
    shieldMax: Math.round(m.shield), shieldRegen: m.regen,
    dmgMul: 1 + m.dmgPct / 100, rangeMul: 1 + m.rangePct / 100, evade: Math.min(0.5, m.evade / 100),
  };
}
export const dps = s => s.weapons.reduce((a, w) => a + D.eqDef(w).dmg, 0) * stats(s).dmgMul;
// rough fighting strength, for AI decisions: what it can take times what it deals
export const power = s => (Math.max(0, s.hull) + (s.shield || 0) + stats(s).armor * 30) * Math.max(4, dps(s));
// how well a player is equipped, on the tech-tier scale (0..4, more with good rarities and exotics)
export function gearScore(s) {
  const part = id => { const d = D.itemDef(id); return d ? d.tier + d.rarity * 0.25 : 0; };
  const w = s.weapons.length ? s.weapons.reduce((a, id) => a + part(id), 0) / s.weapons.length : 0;
  return (part(s.eq.hull) + part(s.eq.engine) + 2 * w) / 4;
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
export const planetsOf = sys => sys.planets.filter(p => !p.station);

export function findPlanet(st, pid) {
  for (const sys of st.systems) for (const p of sys.planets) if (p.id === pid) return p;
  return null;
}

const monster = k => k === 'boss' || k === 'swarm';
export function hostileTo(a, b) {
  if (a.aggro && a.aggro[b.id]) return true;
  const k = b.kind, levi = k === 'boss' && b.boss === 'leviathan';
  switch (a.kind) {
    case 'dom': case 'citadel': return k !== 'dom' && k !== 'citadel' && !levi;
    // pirates leave wanted players alone: they are one of them now
    case 'pirate': return (k === 'player' && !(b.wanted > 0)) || k === 'trader' || k === 'militia' || k === 'dom';
    case 'militia': return k === 'pirate' || k === 'dom' || k === 'citadel' || (k === 'player' && b.wanted > 0) || (monster(k) && !levi);
    case 'player': return (k === 'pirate' && !(a.wanted > 0)) || k === 'dom' || k === 'citadel' || (k === 'militia' && a.wanted > 0) || (monster(k) && !levi);
    case 'boss': return a.boss !== 'leviathan' && !monster(k);
    case 'swarm': return !monster(k);
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
  for (const g of D.TRADE_GOODS) p.prices[g.id] = Math.round(g.base * D.ECON[econ].mult[g.id] * rnd(0.85, 1.15));
  return p;
}

// Stations orbit the star in the gaps between planets, like planets you can dock at.
function addStation(st, sys, type) {
  const maxR = Math.max(...sys.planets.map(p => p.r));
  let r = 0;
  for (let i = 0; i < 60; i++) { r = rint(480, maxR + 380); if (sys.planets.every(p => Math.abs(p.r - r) > 150)) break; }
  const used = new Set(st.systems.flatMap(x => x.planets.filter(p => p.station).map(p => p.name)));
  let name;
  for (let i = 0; i < 20; i++) { name = D.STATIONS[type].name + ' «' + pick(D.STATION_NAMES) + '»'; if (!used.has(name)) break; }
  const p = { id: 'p' + (st.nextId++), sys: sys.id, station: type, name, r, a0: rnd(0, Math.PI * 2), w: 0.13 * Math.pow(600 / r, 1.5) * (R() < 0.5 ? 1 : -1), size: 60 };
  sys.planets.push(p);
  stockStation(st, p);
  return p;
}
function addStations(st) {
  const home = st.systems[0];
  addStation(st, home, 'military'); // contracts right from the start
  const plan = ['ranger', 'science', 'medical', 'business', 'military', 'pirate', 'ranger', 'science', 'medical', 'business', 'military', 'pirate'];
  const count = sys => sys.planets.filter(p => p.station).length;
  for (const type of plan) {
    let pool = st.systems.filter(s => s.id !== 0 && !s.planets.some(p => p.station === type));
    // pirates hide away from the start and from the military
    if (type === 'pirate') pool = pool.filter(s => sysDist(s, home) > 20 && !s.planets.some(p => p.station === 'military') && s.owner === 'coal');
    if (!pool.length) continue;
    const least = Math.min(...pool.map(count));
    addStation(st, pick(pool.filter(s => count(s) === least)), type);
  }
}

export function newGame() {
  const st = { v: 2, day: 0, nextId: 1, systems: [], ships: {}, loot: [], log: [], players: {}, raidTimer: 60, victory: false, bosses: {} };
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
  addStations(st);
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

// Old saves: add what later versions introduced.
export function migrate(st) {
  for (const s of Object.values(st.ships)) { s.mods ||= []; s.items ||= []; if (s.shield == null) s.shield = stats(s).shieldMax; }
  for (const sys of st.systems) for (const p of sys.planets) if (p.prices) for (const g of D.TRADE_GOODS) p.prices[g.id] ??= g.base;
  if (!st.systems.some(sys => sys.planets.some(p => p.station))) addStations(st);
  st.bosses ||= {};
  st.v = 2;
  return st;
}

// ---------------------------------------------------------------- ships

function makeShip(st, kind, sys, x, y, o = {}) {
  const id = 's' + (st.nextId++);
  const s = {
    id, kind, name: o.name || D.KIND_NAMES[kind], sys, x, y,
    eq: o.eq || { hull: 'h1', engine: 'e1', tank: 't1', droid: null }, weapons: o.weapons || [], mods: o.mods || [],
    cargo: o.cargo || {}, items: o.items || [], credits: o.credits || 0, fuel: 0, hull: 0, shield: 0,
    order: null, landed: null, jump: null, ai: {}, aggro: {}, wanted: 0,
    color: o.color || D.KIND_COLORS[kind] || 0xffffff, hpMul: o.hpMul || 1, spdMul: o.spdMul ?? 1, kills: 0,
  };
  if (o.boss) s.boss = o.boss;
  if (o.rank) s.rank = o.rank;
  const S = stats(s);
  s.hull = S.maxHull; s.fuel = S.maxFuel; s.shield = S.shieldMax;
  st.ships[id] = s;
  return s;
}
const tierNow = st => Math.min(4, Math.floor(st.day / 30));
const clampT = t => Math.max(0, Math.min(4, Math.round(t)));

// How strong the pirates of the galaxy are: the players' own gear, with a floor that rises over time,
// so a well-armed ranger still meets worthy opponents and a poor one isn't hunted by cruisers.
export function threat(st) {
  const g = Object.keys(st.players).filter(id => st.players[id].online && st.ships[id]).map(id => gearScore(st.ships[id]));
  return Math.max(g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0, st.day / 50);
}

// A loadout around a tech tier. luck rolls the rarity of each part (see D.rollRarity).
function npcGear(t, { weapons = 1, luck = 0, mods = [], hulls = null, engineUp = 0 } = {}) {
  const roll = id => D.withRarity(id, D.rollRarity(luck));
  const pickShop = (kind, tt) => { const l = D.shopItems(kind, tt, tt); return pick(l.length ? l : D.shopItems(kind, tt)); };
  const hullDef = hulls ? D.eqDef(pick(hulls)) : pick(D.shopItems('hull', t, t).filter(h => h.model !== 'hauler' && h.model !== 'caravan'));
  const w = [];
  for (let i = 0; i < Math.min(weapons, hullDef.slots); i++) w.push(roll(pickShop('weapon', t).id));
  const m = mods.slice(0, hullDef.mods).map(type => roll(D.MODULES.find(x => x.mtype === type && x.tier === t && !x.rarity).id));
  return { eq: { hull: roll(hullDef.id), engine: roll(pickShop('engine', Math.min(4, t + engineUp)).id), tank: 't2', droid: null }, weapons: w, mods: m };
}
function randCargo(n, amt) {
  const c = {};
  for (let i = 0; i < n; i++) { const g = pick(D.TRADE_GOODS).id; c[g] = (c[g] || 0) + rint(amt[0], amt[1]); }
  return c;
}
function edgePos() { const a = rnd(0, Math.PI * 2); return [Math.cos(a) * ARRIVE_R, Math.sin(a) * ARRIVE_R]; }

function spawnTrader(st, sys) {
  const p = pick(planetsOf(sys));
  const [x, y] = planetPos(p, tNow(st));
  const g = npcGear(rint(0, 2), { weapons: 0, hulls: ['h1', 'h2', 'h6', 'h6', 'h8'] });
  g.eq.engine = pick(['e1', 'e2']);
  const s = makeShip(st, 'trader', sys.id, x, y, { name: pick(D.TRADER_NAMES) + ' ' + rint(10, 99), ...g, cargo: randCargo(2, [8, 30]), credits: rint(300, 1500), spdMul: 0.85 });
  s.landed = p.id; s.ai.wait = rint(0, 3);
  return s;
}
function spawnMilitia(st, sys) {
  const base = sys.planets.find(p => p.station === 'military') || pick(planetsOf(sys));
  const [x, y] = planetPos(base, tNow(st));
  const t = clampT(Math.max(1, threat(st)));
  return makeShip(st, 'militia', sys.id, x + 80, y, { name: 'Патруль ' + rint(100, 999), ...npcGear(t, { weapons: 1 + Math.floor(t / 2), mods: ['armor'] }), credits: 200 });
}
// Pirates come in three kinds: jackals (weak, fast, cowardly), raiders, and gang leaders with good
// (rare) gear, shields and an escort. Their strength follows the players' equipment.
function spawnPirate(st, sys, rank) {
  const th = threat(st);
  rank ||= R() < 0.3 ? 'jackal' : 'raider';
  let t = clampT(th + rnd(-0.9, 0.3));
  // rangers who outgrew the tech ladder meet pirates with rare and epic gear
  const over = Math.max(0, th - 4);
  const o = { name: pick(D.PIRATE_NAMES), hpMul: 0.7, credits: rint(300, 1200) + t * 500, cargo: randCargo(1, [5, 20]), rank, items: [] };
  let g;
  if (rank === 'jackal') { t = Math.max(0, t - 1); g = npcGear(t, { weapons: 1, engineUp: 1 }); o.hpMul = 0.6; o.credits = Math.round(o.credits / 2); }
  else if (rank === 'raider') g = npcGear(t, { weapons: 1 + Math.floor(t / 2), luck: over > 0.3 ? 1 : 0, mods: t >= 2 && R() < 0.5 ? ['shield', 'armor'] : t >= 1 && R() < 0.5 ? ['armor'] : [] });
  else { g = npcGear(t, { weapons: Math.max(2, t), luck: over > 0.5 ? 2 : 1, mods: ['shield', 'armor'] }); o.hpMul = 0.8; o.name = 'Главарь «' + o.name + '»'; o.credits *= 3; }
  if (R() < (rank === 'elite' ? 0.7 : rank === 'raider' ? 0.25 : 0.1)) o.items.push(newItem(st, D.randomItem(t, rank === 'elite' ? 1 : 0))); // plunder from earlier raids
  const [x, y] = edgePos();
  const s = makeShip(st, 'pirate', sys.id, x, y, { ...o, ...g });
  s.tier = t;
  return s;
}
function spawnPirateGang(st, sys) {
  const lead = spawnPirate(st, sys, 'elite');
  for (let i = 0; i < 2; i++) {
    const j = spawnPirate(st, sys, 'jackal');
    j.x = lead.x + rnd(-160, 160); j.y = lead.y + rnd(-160, 160);
    j.ai.leader = lead.id;
  }
  return lead;
}
function spawnDom(st, sys, x, y) {
  const t = Math.min(4, 1 + Math.floor(tierNow(st) / 1.5));
  return makeShip(st, 'dom', sys.id, x + rnd(-150, 150), y + rnd(-150, 150), { name: pick(D.DOM_NAMES) + '-' + rint(1, 99), ...npcGear(t, { weapons: 1 + Math.floor(t / 2), mods: t >= 2 ? ['armor'] : [] }), hpMul: 0.8, cargo: { tech: rint(3, 12), mins: rint(3, 12) }, credits: 400 });
}
function captureSystem(st, sys, initial = false) {
  sys.owner = 'dom';
  sys.cap = 0;
  sys.domTimer = 0;
  const a = rnd(0, Math.PI * 2);
  const c = makeShip(st, 'citadel', sys.id, Math.cos(a) * 420, Math.sin(a) * 420, { name: 'Цитадель', eq: { hull: 'h5', engine: 'e1', tank: 't1', droid: 'd3' }, weapons: ['w4', 'w3', 'w3'], mods: ['ms3'], hpMul: initial ? 3 : 1.6, spdMul: 0, credits: 5000 });
  sys.citadel = c.id;
  for (let i = 0; i < (initial ? 3 : 1); i++) spawnDom(st, sys, c.x, c.y);
}

function spawnBoss(st, key) {
  const B = D.BOSSES[key];
  const cands = st.systems.filter(x => x.owner === 'coal' && (x.id !== 0 || st.day > 40));
  if (!cands.length) return;
  const sys = pick(cands);
  const [x, y] = edgePos();
  const s = makeShip(st, 'boss', sys.id, x, y, { name: B.name, boss: key, eq: { hull: 'h5', engine: 'e1', tank: 't5', droid: null }, weapons: [...B.weapons], color: B.color });
  s.pow = Math.round((1 + Math.max(0, threat(st) - 3) * 0.35) * 100) / 100;
  const S = stats(s);
  s.hull = S.maxHull; s.shield = S.shieldMax;
  st.bosses[key] = { id: s.id };
  log(st, '☠ В системе ' + sys.name + ' появилось чудовище — ' + B.name + '. ' + B.desc[0].toUpperCase() + B.desc.slice(1) + '.');
}
function spawnDrone(st, mother) {
  const s = makeShip(st, 'swarm', mother.sys, mother.x + rnd(-140, 140), mother.y + rnd(-140, 140), { name: 'Трутень', boss: 'swarm', eq: { hull: 'h1', engine: 'e1', tank: 't1', droid: null }, weapons: ['wb6'], color: D.BOSSES.swarm.color });
  s.ai.mother = mother.id;
  return s;
}

export function addPlayer(st, name, color) {
  for (const id in st.players) if (st.players[id].name === name) { st.players[id].online = true; st.players[id].color = color; return id; }
  const sys = st.systems[0];
  const p = pick(planetsOf(sys));
  const [x, y] = planetPos(p, tNow(st));
  const s = makeShip(st, 'player', 0, x, y, { name, color, weapons: ['w1'], mods: ['ms1'], credits: 3000 });
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

const itemName = id => D.eqDef(id).name;
const slotList = (s, kind) => (kind === 'weapon' ? s.weapons : (s.mods ||= []));

// Install an item from the hold. Whatever it replaces goes back into the hold (if it fits).
function equipItem(st, s, a, say) {
  const i = s.items.findIndex(it => it.u === a.u);
  const d = i >= 0 && D.itemDef(s.items[i].id);
  if (!d) return;
  const id = s.items[i].id;
  const S = stats(s), room = S.cargoCap - cargoUsed(s) + d.def.size; // free space once the item leaves the hold
  let old = null;
  if (d.kind === 'weapon' || d.kind === 'module') {
    const arr = slotList(s, d.kind), cap = d.kind === 'weapon' ? S.slots : S.mods;
    let slot = -1;
    if (d.kind === 'module') slot = arr.findIndex(m => D.eqDef(m).mtype === d.def.mtype); // one module of a type: replace it
    if (slot < 0) { const want = Number.isInteger(a.idx) ? a.idx : -1; slot = want >= 0 && want < arr.length ? want : arr.length < cap ? arr.length : -1; }
    if (slot < 0) return say(d.kind === 'weapon' ? 'Все оружейные слоты заняты — перетащите оружие на слот, чтобы заменить' : 'Все слоты модулей заняты — перетащите модуль на слот, чтобы заменить');
    old = arr[slot] || null;
    if (old && itemSize(old) > room) return say('Нет места в трюме для снятого: ' + itemName(old));
    arr[slot] = id;
    if (d.kind === 'weapon') s.cd = null;
  } else if (d.kind === 'hull') {
    if (!s.landed) return say('Корпус меняют только на верфи — сядьте на планету или станцию');
    const H = d.def;
    if (s.weapons.length > H.slots) return say('В новом корпусе меньше оружейных слотов — сначала снимите лишнее оружие');
    if (s.mods.length > H.mods) return say('В новом корпусе меньше слотов модулей — сначала снимите лишние модули');
    old = s.eq.hull;
    const newCap = H.cargo + (S.cargoCap - D.eqDef(old).cargo);
    if (cargoUsed(s) - d.def.size + itemSize(old) > newCap) return say('Груз не поместится в новый корпус');
    s.eq.hull = id;
    s.hull = Math.max(1, Math.round(s.hull / S.maxHull * stats(s).maxHull));
  } else {
    old = s.eq[d.kind] || null;
    if (old && itemSize(old) > room) return say('Нет места в трюме для снятого: ' + itemName(old));
    s.eq[d.kind] = id;
    if (d.kind === 'tank') s.fuel = Math.min(s.fuel, d.def.fuel);
  }
  s.items.splice(i, 1);
  if (old) s.items.push(newItem(st, old));
  say('Установлено: ' + d.def.name + (old ? ' (' + itemName(old) + ' — в трюм)' : ''));
}

function unequipItem(st, s, a, say) {
  if (a.slot !== 'weapon' && a.slot !== 'module' && a.slot !== 'droid') return say('Корпус, двигатель и бак нельзя снять — только заменить другим');
  const id = a.slot === 'droid' ? s.eq.droid : (Number.isInteger(a.idx) ? slotList(s, a.slot)[a.idx] : null);
  if (!id) return;
  if (itemSize(id) > stats(s).cargoCap - cargoUsed(s)) return say('Нет места в трюме для ' + itemName(id));
  if (a.slot === 'droid') s.eq.droid = null; else slotList(s, a.slot).splice(a.idx, 1);
  if (a.slot === 'weapon') s.cd = null;
  s.items.push(newItem(st, id));
  say('Снято в трюм: ' + itemName(id));
}

// the equipment an action points at: a hold item (u) or an installed part (slot [+ idx])
function refItem(s, a) {
  if (a.u) { const it = s.items.find(x => x.u === a.u); return it && [it.id, v => { it.id = v; }]; }
  if (a.slot === 'weapon' || a.slot === 'module') { const arr = slotList(s, a.slot); return arr[a.idx] && [arr[a.idx], v => { arr[a.idx] = v; }]; }
  if (['hull', 'engine', 'tank', 'droid'].includes(a.slot) && s.eq[a.slot]) return [s.eq[a.slot], v => { s.eq[a.slot] = v; }];
  return null;
}
export const UPGRADE_MAX = 3; // the lab can raise gear up to epic
export const upgradeCost = id => { const d = D.itemDef(id); return Math.round((D.eqDef(D.baseId(id)).price || 1200 * (d.tier + 1)) * [0.6, 1.2, 2.4][d.rarity]); };
export const buffPrice = (st, k) => Math.round(D.BUFFS[k].price * (1 + tierNow(st) * 0.4));
export const amnestyPrice = s => 1500 + s.wanted * 150;

// where a bought weapon or module goes: a free slot, or the hold
function placeNew(s, d) {
  const S = stats(s), arr = slotList(s, d.kind);
  if (d.kind === 'module' && arr.some(m => D.eqDef(m).mtype === d.def.mtype)) return S.cargoCap - cargoUsed(s) >= d.def.size ? 'hold' : null;
  if (arr.length < (d.kind === 'weapon' ? S.slots : S.mods)) return 'slot';
  return S.cargoCap - cargoUsed(s) >= d.def.size ? 'hold' : null;
}

export function act(st, pid, a) {
  const s = st.ships[pid];
  if (!s) return;
  const say = t => log(st, t, pid);
  s.items ||= []; s.mods ||= [];
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
    case 'dropContract': if (s.contract) { say('Контракт отменён: ' + s.contract.name); s.contract = null; } return;
  }
  if (!s.landed) return;
  const p = findPlanet(st, s.landed);
  const S = stats(s);
  const pay = c => { if (s.credits < c) { say('Недостаточно кредитов'); return false; } s.credits -= c; return true; };
  switch (a.type) {
    case 'buy': {
      if (!p.prices || !(a.good in p.prices)) return;
      const price = p.prices[a.good];
      let q = Math.min(a.qty, S.cargoCap - cargoUsed(s), Math.floor(s.credits / price));
      if (q <= 0) return say('Нет денег или места в трюме');
      s.credits -= q * price;
      s.cargo[a.good] = (s.cargo[a.good] || 0) + q;
      p.prices[a.good] = Math.round(price * (1 + 0.003 * q));
      break;
    }
    case 'sell': {
      if (!p.prices || !(a.good in p.prices)) return;
      const q = Math.min(a.qty, s.cargo[a.good] || 0);
      if (q <= 0) return;
      s.credits += q * sellPrice(p.prices[a.good]);
      s.cargo[a.good] -= q;
      if (!s.cargo[a.good]) delete s.cargo[a.good];
      p.prices[a.good] = Math.max(5, Math.round(p.prices[a.good] * (1 - 0.003 * q)));
      break;
    }
    case 'repair': {
      const miss = S.maxHull - s.hull, per = p.station === 'military' ? 2 : 3;
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
    // planet shipyard: engines, tanks, droids and hulls are traded in; weapons and modules go to a slot or the hold
    case 'buyItem': {
      const d = D.itemDef(a.id);
      if (p.station || !d || d.rarity || d.def.shop === false || d.def.npc || d.tier > p.tech) return;
      const item = d.def;
      if (d.kind === 'weapon' || d.kind === 'module') {
        const where = placeNew(s, d);
        if (!where) return say('Нет свободных слотов и места в трюме');
        if (!pay(item.price)) return;
        if (where === 'slot') { slotList(s, d.kind).push(item.id); if (d.kind === 'weapon') s.cd = null; say('Установлено: ' + item.name); }
        else { s.items.push(newItem(st, item.id)); say(item.name + ' — в трюм: ' + (d.kind === 'weapon' ? 'все оружейные слоты заняты' : 'слоты модулей заняты или такой модуль уже стоит')); }
        break;
      }
      const old = s.eq[d.kind] ? D.eqDef(s.eq[d.kind]) : null;
      const cost = item.price - (old ? Math.floor(old.price * 0.5) : 0);
      if (d.kind === 'hull') {
        if (cargoUsed(s) > item.cargo + (S.cargoCap - old.cargo)) return say('Груз не поместится в новый корпус');
        if (s.weapons.length > item.slots) return say('Сначала снимите или продайте лишнее оружие');
        if (s.mods.length > item.mods) return say('Сначала снимите или продайте лишние модули');
      }
      if (!pay(cost)) return;
      s.eq[d.kind] = item.id;
      if (d.kind === 'hull') s.hull = Math.max(1, Math.round(s.hull / S.maxHull * stats(s).maxHull));
      if (d.kind === 'tank') s.fuel = Math.min(s.fuel, item.fuel);
      say('Установлено: ' + item.name);
      break;
    }
    case 'sellInst': { // sell an installed weapon or module
      const arr = a.slot === 'weapon' || a.slot === 'module' ? slotList(s, a.slot) : null;
      const id = arr && arr[a.idx];
      if (!id) return;
      arr.splice(a.idx, 1);
      if (a.slot === 'weapon') s.cd = null;
      const v = D.itemSell(id, p.station === 'pirate' ? 0.7 : 0.5);
      s.credits += v;
      say('Продано: ' + itemName(id) + ' за ' + v + ' кр.');
      break;
    }
    case 'sellItem': {
      const i = s.items.findIndex(it => it.u === a.u);
      if (i < 0) return;
      const [it] = s.items.splice(i, 1);
      const v = D.itemSell(it.id, p.station === 'pirate' ? 0.7 : 0.5); // the pirates' fence pays more
      s.credits += v;
      say(v ? 'Продано: ' + itemName(it.id) + ' за ' + v + ' кр.' : 'Сдано в утиль: ' + itemName(it.id));
      break;
    }
    // ---- stations
    case 'stBuy': {
      const it = p.stock && p.stock[a.i];
      if (!it) return;
      const d = D.itemDef(it.id);
      if (d.def.size > S.cargoCap - cargoUsed(s)) return say('Нет места в трюме');
      if (it.proto) {
        if ((s.cargo.proto || 0) < it.proto) return say('Не хватает протоплазмы');
        s.cargo.proto -= it.proto;
        if (!s.cargo.proto) delete s.cargo.proto;
      } else if (!pay(it.price)) return;
      s.items.push(newItem(st, it.id));
      p.stock.splice(a.i, 1);
      say('Куплено: ' + d.def.name + ' (' + D.RARITY[d.rarity].name.toLowerCase() + ') — лежит в трюме');
      break;
    }
    case 'protoSell': {
      if (p.station !== 'ranger') return;
      const q = Math.min(a.qty, s.cargo.proto || 0);
      if (q <= 0) return;
      s.cargo.proto -= q;
      if (!s.cargo.proto) delete s.cargo.proto;
      s.credits += q * D.PROTO_PRICE;
      say('Сдано протоплазмы: ' + q + ' за ' + q * D.PROTO_PRICE + ' кр.');
      break;
    }
    case 'contract': {
      const offer = p.station === 'military' && p.offers && p.offers[a.i];
      if (!offer) return;
      if (s.contract) return say('Сначала выполните или отмените текущий контракт');
      s.contract = { ...offer, got: 0, until: st.day + 40, base: p.name };
      p.offers.splice(a.i, 1);
      say('Контракт принят: ' + offer.name + '. Награда ' + offer.reward + ' кр., срок 40 дней.');
      break;
    }
    case 'upgrade': {
      if (p.station !== 'science') return;
      const ref = refItem(s, a);
      if (!ref) return;
      const d = D.itemDef(ref[0]);
      if (d.def.npc || d.rarity >= UPGRADE_MAX) return say('Лаборатория улучшает снаряжение только до эпического');
      if (!pay(upgradeCost(ref[0]))) return;
      const nid = D.withRarity(ref[0], d.rarity + 1);
      ref[1](nid);
      if (a.slot === 'hull') s.hull = Math.min(s.hull, stats(s).maxHull);
      say('Улучшено: ' + d.def.name + ' — теперь ' + D.RARITY[d.rarity + 1].name.toLowerCase());
      break;
    }
    case 'amnesty': {
      if (p.station !== 'pirate' || !s.wanted) return;
      if (!pay(amnestyPrice(s))) return;
      s.wanted = 0;
      if (s.bank) s.bank.late = 0;
      say('Ваше досье «потерялось». Вы больше не в розыске.');
      break;
    }
    case 'buff': {
      if (p.station !== 'medical' || !D.BUFFS[a.k]) return;
      if (!pay(buffPrice(st, a.k))) return;
      (s.buffs ||= {})[a.k] = D.BUFF_DAYS;
      say(D.BUFFS[a.k].name + ': ' + D.BUFFS[a.k].desc + ' на ' + D.BUFF_DAYS + ' дней');
      break;
    }
    case 'bank': {
      if (p.station !== 'business') return;
      const b = s.bank ||= { dep: 0, debt: 0, due: 0 };
      const amt = Math.max(0, Math.floor(a.amt || 0));
      if (a.op === 'deposit') { const q = Math.min(amt, s.credits); if (q <= 0) return; s.credits -= q; b.dep += q; say('Вклад пополнен на ' + q + ' кр.'); }
      else if (a.op === 'withdraw') { const q = Math.min(amt, Math.floor(b.dep)); if (q <= 0) return; b.dep -= q; s.credits += q; say('Снято со вклада: ' + q + ' кр.'); }
      else if (a.op === 'loan') {
        if (b.debt > 0) return say('Сначала погасите текущий кредит');
        if (amt <= 0 || amt > 30000) return;
        b.debt = amt; b.due = st.day + 30; b.late = 0; s.credits += amt;
        say('Выдан кредит ' + amt + ' кр. под 1,2% в день. Вернуть до дня ' + b.due + '.');
      } else if (a.op === 'repay') {
        const q = Math.min(amt, s.credits, Math.ceil(b.debt));
        if (q <= 0) return;
        s.credits -= q; b.debt -= q;
        if (b.debt < 1) { b.debt = 0; if (b.late) { b.late = 0; s.wanted = 0; } say('Кредит погашен полностью.'); }
        else say('Погашено ' + q + ' кр., осталось ' + Math.ceil(b.debt) + ' кр.');
      }
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

// ---------------------------------------------------------------- stations

// Stock of the station shops and military contracts, refreshed every couple of weeks.
function stockStation(st, p) {
  const t = clampT(threat(st) + 0.4);
  const make = (kinds, luck, n, mark) => Array.from({ length: n }, () => {
    const id = D.randomItem(t + (R() < 0.3 ? 1 : 0), luck, R, kinds);
    return { id, price: Math.round(D.eqDef(id).price * mark) };
  });
  switch (p.station) {
    case 'military': p.stock = make(['weapon', 'weapon', 'module', 'hull'], 1, 6, 1.25); p.offers = makeOffers(st); break;
    case 'science': p.stock = make(['module'], 1, 6, 1.2); break;
    case 'pirate': p.stock = make(['weapon', 'weapon', 'module', 'engine', 'droid'], 1, 6, 1.5); break;
    case 'ranger': p.stock = make(['weapon', 'weapon', 'module', 'module', 'engine', 'droid', 'hull'], 3, 6, 1).map(x => ({ id: x.id, proto: Math.max(6, Math.round(D.eqDef(x.id).price / 1100)) })); break;
  }
  p.stockDay = st.day;
}
function makeOffers(st) {
  const t = clampT(threat(st));
  const np = rint(2, 4), nd = rint(2, 3);
  const o = [
    { kind: 'pirate', need: np, reward: np * (900 + 450 * t), name: 'уничтожить пиратов: ' + np },
    { kind: 'dom', need: nd, reward: nd * (1800 + 700 * t), name: 'уничтожить доминаторов: ' + nd },
  ];
  const boss = Object.values(st.ships).find(s => s.kind === 'boss');
  if (boss) o.push({ kind: 'boss', need: 1, reward: 15000, name: 'уничтожить чудовище: ' + boss.name });
  return o;
}

function progressContract(st, p, s) {
  const c = p.contract;
  if (!c) return;
  const hit = c.kind === 'pirate' ? s.kind === 'pirate' : c.kind === 'dom' ? s.kind === 'dom' || s.kind === 'citadel' : s.kind === 'boss';
  if (!hit) return;
  if (++c.got >= c.need) { p.credits += c.reward; log(st, '★ Контракт выполнен (' + c.name + '): награда ' + c.reward + ' кр.', p.id); p.contract = null; }
  else log(st, 'Контракт «' + c.name + '»: ' + c.got + ' из ' + c.need, p.id);
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
  const wander = r => { if (!s.order || s.order.type !== 'move') s.order = { type: 'move', x: rnd(-r, r), y: rnd(-r, r) }; };
  switch (s.kind) {
    case 'trader': {
      const ps = planetsOf(sys);
      if (s.landed) {
        if (--s.ai.wait <= 0) {
          if (R() < 0.3 && flee()) return;
          const other = ps.filter(p => p.id !== s.landed);
          if (other.length) s.order = { type: 'land', planet: pick(other).id };
        }
      } else if (sys.owner === 'dom') flee();
      else if (threatened() && s.hull < stats(s).maxHull * 0.6 && R() < 0.5) {
        let best = null, bd = 1e9;
        for (const p of ps) { const [px, py] = planetPos(p, tNow(st)); const d = dist(px, py, s.x, s.y); if (d < bd) { bd = d; best = p; } }
        s.order = { type: 'land', planet: best.id };
      } else if (!s.order) s.order = { type: 'land', planet: pick(ps).id };
      break;
    }
    case 'pirate': {
      const S = stats(s), pw = power(s);
      if (s.landed) { // licking wounds at a pirate base
        if (s.hull < S.maxHull * 0.9 && --s.ai.wait > 0) return;
        s.landed = null; s.order = null; s.ai.fled = 0;
      }
      if (s.hull < S.maxHull * (s.rank === 'jackal' ? 0.4 : 0.25) && !s.ai.fled) {
        s.ai.fled = 1;
        const base = sys.planets.find(p => p.station === 'pirate');
        if (base) { s.order = { type: 'land', planet: base.id }; s.ai.wait = 4; return; }
        if (flee()) return;
      }
      // a ranger far out of their league: don't pick that fight
      if (!s.ai.fled && s.rank !== 'elite' && nearest(here, c => c.kind === 'player' && !c.landed && hostileTo(s, c) && power(c) > pw * 3, s, 900)) { s.ai.fled = 1; if (flee()) return; }
      const lead = s.ai.leader && st.ships[s.ai.leader];
      const leadOk = lead && alive(lead) && lead.sys === s.sys && !lead.jump;
      const cur = s.order && s.order.type === 'attack' && st.ships[s.order.target];
      if (cur && alive(cur) && cur.sys === s.sys && !cur.landed && !cur.jump) break;
      let tg = leadOk && lead.order && lead.order.type === 'attack' ? st.ships[lead.order.target] : null;
      if (!tg || !alive(tg)) tg = nearest(here, c => (c.kind === 'trader' || c.kind === 'player') && !c.landed && hostileTo(s, c) && pw >= power(c) * 0.5, s, 1900);
      if (tg) { s.order = { type: 'attack', target: tg.id }; break; }
      if (leadOk) { s.order = { type: 'follow', target: lead.id }; break; }
      // pick up what a fight left behind
      const l = st.loot.find(l => l.sys === s.sys && !l.pirateSkip && dist(l.x, l.y, s.x, s.y) < 1600);
      if (l) { s.order = { type: 'loot', id: l.id }; break; }
      if (R() < 0.06) flee(); else wander(2200);
      break;
    }
    case 'militia': {
      if (s.landed) { if (--s.ai.wait > 0) return; s.landed = null; }
      const tg = nearest(here, c => hostileTo(s, c) && !c.landed, s, 2800);
      if (tg) s.order = { type: 'attack', target: tg.id };
      else if (!s.order || s.order.type === 'attack') {
        if (s.hull < stats(s).maxHull * 0.5) {
          const base = sys.planets.find(p => p.station === 'military') || pick(planetsOf(sys));
          s.order = { type: 'land', planet: base.id }; s.ai.wait = 3;
        } else s.order = { type: 'move', x: rnd(-1800, 1800), y: rnd(-1800, 1800) };
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
    case 'boss': {
      if (s.order && s.order.type === 'jump') return;
      const tg = nearest(here, c => hostileTo(s, c) && !c.landed, s, 2600);
      if (tg) s.order = { type: 'attack', target: tg.id };
      else {
        // monsters roam the galaxy, but stay away from the dominators
        if (sys.owner === 'dom' || R() < 0.07) {
          const nb = neighbors(st, s.sys, 24).filter(x => x.owner === 'coal' && (x.id !== 0 || st.day > 40));
          if (nb.length) { s.order = { type: 'jump', to: pick(nb).id }; return; }
        }
        wander(2000);
      }
      if (s.boss === 'hive') { // the hive breeds drones every other day
        const kids = Object.values(st.ships).filter(c => c.kind === 'swarm' && c.ai.mother === s.id && alive(c)).length;
        if (kids < 6 && (s.ai.brood = (s.ai.brood || 0) + 1) % 2 === 0) for (let i = 0; i < 2; i++) spawnDrone(st, s);
      }
      break;
    }
    case 'swarm': { // drones stay with their mother and hunt whatever she hunts
      const m = st.ships[s.ai.mother];
      if (!m || !alive(m)) break;
      if (m.jump || m.sys !== s.sys) { s.order = { type: 'jump', to: m.jump ? m.jump.to : m.sys }; break; }
      let tg = m.order && m.order.type === 'attack' ? st.ships[m.order.target] : null;
      if (!tg || !alive(tg) || tg.sys !== s.sys) tg = nearest(here, c => hostileTo(s, c) && !c.landed, s, 1400);
      s.order = tg ? { type: 'attack', target: tg.id } : { type: 'follow', target: m.id };
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
  const S = stats(s), speed = S.speed, step = speed / SUB;
  let tx, ty, stop = 0;
  if (o.type === 'move') { tx = o.x; ty = o.y; }
  else if (o.type === 'follow' || o.type === 'attack') {
    const tg = st.ships[o.target];
    if (!tg || !alive(tg) || tg.sys !== s.sys || tg.jump || tg.landed) return { cancel: true };
    tx = tg.x; ty = tg.y;
    stop = o.type === 'follow' ? 140 : Math.max(80, 0.75 * Math.min(...s.weapons.map(w => D.eqDef(w).range * S.rangeMul), 400));
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

// ---------------------------------------------------------------- combat

// One shot. It may miss (ECM), the shield soaks it first (ion weapons drain shields faster,
// piercing ones ignore them), armour cuts the rest (rails barely notice it), but at least
// 30% of a hit always gets through. `per` is the shot's damage before modifiers.
function shoot(st, a, tg, W, per, T, ev, splash = false) {
  const A = stats(a), S = stats(tg);
  const shot = { sys: a.sys, a: a.id, b: tg.id, T, w: W.id, d: 0 };
  if (splash) shot.sp = 1;
  if (S.evade && R() < S.evade) { shot.miss = 1; ev.shots.push(shot); return; }
  let raw = per * A.dmgMul * rnd(0.85, 1.15);
  if (tg.shield > 0 && W.fx !== 'pierce') {
    const k = W.fx === 'ion' ? 2.5 : 1;
    const sd = Math.min(tg.shield, raw * k);
    tg.shield -= sd; raw -= sd / k;
    shot.sd = Math.round(sd);
  }
  const d = raw > 0.01 ? Math.max(raw * 0.3, raw - S.armor * (W.fx === 'rail' ? 0.25 : 1)) : 0;
  tg.hull -= d;
  tg.shHit = T; // shields don't recharge in the middle of a fight
  shot.d = Math.round(d);
  if (W.fx === 'drain' && d > 0) a.hull = Math.min(A.maxHull, a.hull + d * 0.3);
  if (W.fx === 'slow') tg.slow = SUB;
  ev.shots.push(shot);
  if (tg.kind === 'player' && !tg.aggro[a.id]) log(st, hostileTo(tg, a) ? '⚔ Бой: ' + a.name + ' открыл огонь' : '⚠ ' + a.name + ' атакует вас!', tg.id);
  tg.aggro[a.id] = 4;
  if (a.kind === 'player' && (tg.kind === 'trader' || tg.kind === 'militia')) {
    if (!a.wanted) log(st, a.name + ' напал на ' + tg.name + ' и объявлен в розыск!');
    a.wanted = 20;
  }
  if (tg.hull <= 0 && alive(tg)) destroy(st, tg, T, a, ev);
}

// ---------------------------------------------------------------- deaths

function dropLoot(st, s, T) {
  if (s.kind === 'swarm') return;
  const player = s.kind === 'player';
  const cargo = {};
  for (const g in s.cargo) { const q = Math.floor(s.cargo[g] * (player ? 0.7 : 1)); if (q > 0) cargo[g] = q; }
  let credits = Math.floor(s.credits * (player ? 0.15 : 0.6));
  // equipment: a player's wreck spills part of the hold (the installed kit survives in the escape pod);
  // NPCs sometimes leave their installed guns and modules intact, a citadel always does
  const items = [];
  if (player) { for (const it of s.items || []) if (R() < 0.7) items.push(it); }
  else if (s.kind === 'boss') {
    const B = D.BOSSES[s.boss];
    items.push(newItem(st, pick(B.exotics)));
    for (let i = 0; i < 3; i++) items.push(newItem(st, D.randomItem(rint(3, 4), 2)));
    credits = 0; // the bounty is paid out directly
  } else {
    const boss = s.kind === 'citadel', elite = s.rank === 'elite';
    for (const w of s.weapons) if (boss || R() < (elite ? 0.6 : 0.3)) items.push(newItem(st, w));
    for (const m of s.mods || []) if (boss || R() < (elite ? 0.5 : 0.2)) items.push(newItem(st, m));
    for (const slot of ['engine', 'tank', 'droid']) {
      const id = s.eq[slot];
      if (id && D.eqDef(id).price > 0 && (boss || R() < 0.12)) items.push(newItem(st, id));
    }
    if (boss && R() < 0.25) items.push(newItem(st, pick(['wx3', 'mx3'])));
    items.push(...(s.items || []));
  }
  if (s.kind === 'dom') cargo.proto = (cargo.proto || 0) + rint(2, 5);
  if (s.kind === 'citadel') cargo.proto = (cargo.proto || 0) + 40;
  if (!credits && !Object.keys(cargo).length && !items.length) return;
  st.loot.push({ id: 'l' + (st.nextId++), sys: s.sys, x: s.x, y: s.y, credits, cargo, items, ttl: items.length ? 30 : 20, t0: T });
}

const PIRATE_BOUNTY = { jackal: [350, 150], raider: [700, 300], elite: [2500, 700] };

function destroy(st, s, T, killer, ev) {
  s.dead = T;
  ev.booms.push({ sys: s.sys, x: Math.round(s.x), y: Math.round(s.y), T, big: s.kind === 'citadel' ? 3 : s.kind === 'boss' ? 4 : s.kind === 'swarm' ? 0.5 : 1 });
  dropLoot(st, s, T);
  const kp = killer && killer.kind === 'player' ? killer : null;
  // everyone who shot at it recently took part (contracts, monster bounties)
  const crew = Object.keys(st.players).map(id => st.ships[id]).filter(p => p && alive(p) && (p === kp || s.aggro[p.id]));
  if (kp) {
    kp.kills++;
    const pb = PIRATE_BOUNTY[s.rank || 'raider'];
    const bounty = s.kind === 'pirate' ? pb[0] + (s.tier ?? tierNow(st)) * pb[1] : s.kind === 'dom' ? 1500 + tierNow(st) * 400 : s.kind === 'swarm' ? 150 : 0;
    if (bounty) { kp.credits += bounty; log(st, 'Награда за уничтожение ' + s.name + ': ' + bounty + ' кр.', kp.id); }
  }
  for (const p of crew) progressContract(st, p, s);
  if (s.kind === 'player') log(st, s.name + ' уничтожен' + (killer ? ' (' + killer.name + ')' : '') + '!');
  if (s.kind === 'boss') {
    const B = D.BOSSES[s.boss];
    st.bosses[s.boss] = { next: st.day + rint(45, 70) };
    for (const p of crew) p.credits += B.bounty;
    log(st, '★ Чудовище повержено: ' + B.name + '!' + (crew.length ? ' ' + crew.map(p => p.name).join(', ') + ' получают по ' + B.bounty + ' кр.' : '') + ' Среди обломков — экзотическая добыча.');
    for (const c of Object.values(st.ships)) if (c.kind === 'swarm' && c.ai.mother === s.id && alive(c)) { c.dead = T; ev.booms.push({ sys: c.sys, x: Math.round(c.x), y: Math.round(c.y), T: T + 2, big: 0.5 }); }
  }
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
  const p = pick(planetsOf(sys));
  const [x, y] = planetPos(p, tNow(st));
  const S = stats(s);
  Object.assign(s, { dead: undefined, sys: sys.id, x, y, landed: p.id, order: null, jump: null, hull: S.maxHull, fuel: S.maxFuel, shield: S.shieldMax, cargo: {}, items: [], credits: Math.floor(s.credits * 0.75), wanted: 0, aggro: {} });
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
    if (s.slow > 0) s.slow--;
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
      if (s.kind === 'boss') log(st, '☠ ' + s.name + ' покидает систему ' + a.name + ' и движется в ' + b.name);
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
      const sys = st.systems[s.sys], p = findPlanet(st, o.planet);
      const welcome = !p.station || p.station === 'pirate' || p.station === 'business'; // who takes wanted rangers
      if (sys.owner === 'dom' && s.kind !== 'dom') { s.order = null; if (s.kind === 'player') log(st, (p.station ? 'Станция' : 'Планета') + ' оккупирована доминаторами — посадка невозможна', s.id); }
      else if (s.kind === 'player' && s.wanted > 0 && !(p.station && welcome)) { s.order = null; log(st, 'Вы в розыске — посадка запрещена ещё ' + s.wanted + ' дн. Примут только на пиратской базе или в бизнес-центре', s.id); }
      else {
        s.landed = o.planet; s.order = null; s.ai.wait = s.ai.wait > 1 ? s.ai.wait : rint(1, 3);
        [s.x, s.y] = [r.tx, r.ty];
        if (s.kind === 'player') log(st, (p.station ? 'Стыковка: ' : 'Посадка на ') + p.name, s.id);
      }
    }
  }

  // loot pickup: players only by an explicit "pick up" order; pirates scavenge after fights
  for (const s of active) {
    if ((s.kind !== 'player' && s.kind !== 'pirate') || s.landed || !s.order || s.order.type !== 'loot') continue;
    const me = s.kind === 'player';
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
        if (me) log(st, 'Подобрано: ' + got.join(', '), s.id);
        ev.pickups.push({ sys: s.sys, id: l.id, x: Math.round(l.x), y: Math.round(l.y), ship: s.id, T, text: '+' + got.join(', +'), all: !!l.taken, eq: gotEq });
      }
      if (me && left.length) log(st, 'Не хватает места в трюме: ' + left.join(', '), s.id);
      if (!me && !l.taken) l.pirateSkip = 1;
      s.order = null;
      break;
    }
  }
  st.loot = st.loot.filter(l => !l.taken);

  // combat: every weapon fires `shots` times a day and then cools down; a shot carries its
  // share of the weapon's daily damage, so the damage per day stays exactly `dmg`
  for (const s of active) {
    if (!alive(s) || s.landed || !s.weapons.length) continue;
    if (!s.cd || s.cd.length !== s.weapons.length) s.cd = s.weapons.map(() => rint(1, 3));
    const S = stats(s), list = bySys[s.sys];
    for (let wi = 0; wi < s.weapons.length; wi++) {
      if (!alive(s)) break;
      if (s.cd[wi] > 0 && --s.cd[wi] > 0) continue;
      const W = D.eqDef(s.weapons[wi]), range = W.range * S.rangeMul;
      const inRange = c => c !== s && alive(c) && c.sys === s.sys && !c.landed && !c.jump && dist(c.x, c.y, s.x, s.y) <= range;
      let tg = null;
      if (s.order && s.order.type === 'attack') { const c = st.ships[s.order.target]; if (c && inRange(c)) tg = c; }
      if (!tg) tg = nearest(list, c => !c.landed && hostileTo(s, c), s, range);
      if (!tg) continue; // stays loaded until something comes into range
      const cool = Math.max(1, Math.round(SUB / W.shots));
      s.cd[wi] = cool;
      const per = W.dmg * cool / SUB;
      // spread the volleys of one substep a little so guns don't all go off on the same frame
      const Ts = T + Math.floor(R() * 8) / 10;
      if (W.fx === 'chain') { // resonance: every enemy in range at once
        for (const c of list.filter(c => inRange(c) && (c === tg || hostileTo(s, c))).slice(0, 5)) shoot(st, s, c, W, per, Ts, ev);
        continue;
      }
      const tx = tg.x, ty = tg.y;
      shoot(st, s, tg, W, per, Ts, ev);
      if (W.fx === 'splash') for (const c of list) if (c !== tg && c !== s && alive(c) && !c.landed && hostileTo(s, c) && dist(c.x, c.y, tx, ty) < 200) shoot(st, s, c, W, per * 0.5, Ts, ev, true);
    }
  }

  // slow repairs: droids (and NPC crews) patch the hull a little every substep; shields recharge out of combat
  for (const s of active) {
    if (!alive(s)) continue;
    const S = stats(s);
    let rep = S.repair + (s.kind !== 'player' ? Math.ceil(S.maxHull * 0.03) : 0);
    if (s.landed && s.kind === 'pirate') rep += S.maxHull * 0.25; // patched up at the pirate base
    if (rep && s.hull < S.maxHull) s.hull = Math.min(S.maxHull, s.hull + rep / SUB);
    if (s.shield > S.shieldMax) s.shield = S.shieldMax;
    if (S.shieldMax && (s.shield || 0) < S.shieldMax && T - (s.shHit ?? -1e9) > SUB / 2) s.shield = Math.min(S.shieldMax, (s.shield || 0) + S.shieldRegen / SUB);
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
    if (s.buffs) for (const k in s.buffs) if (--s.buffs[k] <= 0) delete s.buffs[k];
  }
  // players' money matters: interest, loans, contracts
  for (const id in st.players) {
    const s = st.ships[id];
    if (!s) continue;
    const b = s.bank;
    if (b) {
      if (b.dep > 0) b.dep = Math.round(b.dep * 1.004 * 100) / 100;
      if (b.debt > 0) {
        b.debt = Math.round(b.debt * 1.012);
        if (st.day > b.due) {
          s.wanted = Math.max(s.wanted, 5);
          if (!b.late) { b.late = 1; log(st, '⚠ Кредит просрочен — бизнес-центр объявил вас в розыск до погашения', id); }
        }
      }
    }
    if (s.contract && st.day > s.contract.until) { log(st, 'Контракт провален — срок вышел: ' + s.contract.name, id); s.contract = null; }
  }
  for (const l of st.loot) l.ttl--;
  st.loot = st.loot.filter(l => l.ttl > 0);
  // economy drift
  for (const sys of st.systems) for (const p of sys.planets) {
    if (!p.prices) continue;
    for (const g of D.TRADE_GOODS) {
      const target = g.base * D.ECON[p.econ].mult[g.id];
      p.prices[g.id] = Math.max(5, Math.round(p.prices[g.id] + (target - p.prices[g.id]) * 0.07 + target * rnd(-0.03, 0.03)));
    }
  }
  // station shops restock every couple of weeks
  for (const sys of st.systems) for (const p of sys.planets) if (p.station && st.day - (p.stockDay ?? -99) >= 14) stockStation(st, p);
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
  const pirates = Object.values(st.ships).filter(s => s.kind === 'pirate').length;
  for (const sys of st.systems) {
    if (sys.owner === 'coal') {
      if (count(sys.id, 'trader') < 3 && R() < 0.3) spawnTrader(st, sys);
      const doms0 = count(sys.id, 'dom');
      const mb = sys.planets.some(p => p.station === 'military');
      if (count(sys.id, 'militia') < (doms0 ? 3 : sys.id === 0 || mb ? 2 : 1) && R() < (doms0 ? 0.5 : 0.12)) spawnMilitia(st, sys);
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
  // pirates: more of them around their bases; gangs with a leader once rangers are well armed
  const bases = st.systems.filter(s => s.owner === 'coal' && s.planets.some(p => p.station === 'pirate'));
  if (pirates < 6 + bases.length * 2 && R() < 0.3) {
    const cands = st.systems.filter(s => s.owner === 'coal' && (s.id !== 0 || st.day > 15));
    const sys = bases.length && R() < 0.4 ? pick(bases) : cands.length ? pick(cands) : null;
    const th = threat(st);
    if (sys) { if (th >= 1.5 && R() < (th >= 3 ? 0.25 : 0.15)) spawnPirateGang(st, sys); else spawnPirate(st, sys); }
  }
  // wandering monsters: each comes back a while after it was killed; at most two at a time
  st.bosses ||= {};
  let monsters = Object.values(st.ships).filter(s => s.kind === 'boss').length;
  D.BOSS_KEYS.forEach((key, i) => {
    const b = st.bosses[key] ||= { next: 18 + i * 20 + rint(0, 10) };
    if (b.id && !st.ships[b.id]) st.bosses[key] = { next: st.day + 30 };
    else if (!b.id && st.day >= b.next && monsters < 2) { spawnBoss(st, key); monsters++; }
  });
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

// for balance tests and tools
export const _spawn = { pirate: spawnPirate, gang: spawnPirateGang, dom: spawnDom, boss: spawnBoss, militia: spawnMilitia };
