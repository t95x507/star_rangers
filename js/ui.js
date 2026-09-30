// DOM user interface: HUD, inventory, planet and station screens, selection, log, galaxy map.
import * as D from './data.js';
import * as Audio from './audio.js';
import { QUESTS, questStart, questNode, questText, questChoices, questChoose, questParams, questFill } from './quests.js';
import { SUB, stats, dps, cargoUsed, itemsUsed, sysDist, jumpCost, jumpDays, findPlanet, planetsOf, sellPrice, hostileTo, dist, planetPos, tNow, UPGRADE_MAX, upgradeCost, buffPrice, amnestyPrice } from './sim.js';

const $ = id => document.getElementById(id);
const hex = c => '#' + c.toString(16).padStart(6, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.floor(n).toLocaleString('ru-RU');

export function toast(text) {
  const t = $('toast');
  t.textContent = text; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2500);
}

export function hud(G) {
  const st = G.st, s = st.ships[G.me];
  if (!s) return;
  const S = stats(s);
  const where = s.jump ? 'Гиперпрыжок → ' + st.systems[s.jump.to].name : st.systems[s.sys].name + (s.landed ? ' · ' + findPlanet(st, s.landed).name : '');
  $('hud').innerHTML =
    `<span>День <b>${st.day}</b></span><span>${esc(where)}</span>` +
    `<span>💰 <b>${fmt(s.credits)}</b></span>` +
    `<span>Корпус <span class="bar"><i style="width:${s.hull / S.maxHull * 100}%;background:${s.hull / S.maxHull < 0.3 ? 'var(--bad)' : ''}"></i></span> ${Math.ceil(s.hull)}/${S.maxHull}</span>` +
    (S.shieldMax ? `<span title="щит">◈ ${Math.round(s.shield || 0)}/${S.shieldMax}</span>` : '') +
    `<span>⛽ ${Math.floor(s.fuel)}/${S.maxFuel}</span>` +
    `<span>📦 ${cargoUsed(s)}/${S.cargoCap}</span>` +
    `<span>⚔ ${Math.round(dps(s))}/день</span>` +
    (s.contract ? `<span title="${esc(s.contract.name)}">📜 ${s.contract.got}/${s.contract.need}</span>` : '') +
    (s.quest ? `<span title="Задание «${esc(QUESTS[s.quest.q].title)}» — до дня ${s.quest.until}">✉ ${esc((findPlanet(st, s.quest.dest) || {}).name || '')}</span>` : '') +
    (s.wanted > 0 ? `<span class="wanted">РОЗЫСК ${s.wanted} дн.</span>` : '');
  $('hyper').hidden = !s.jump;
  if (s.jump) $('hyper').innerHTML = `Гиперпространство<br><small>${esc(st.systems[s.jump.from].name)} → ${esc(st.systems[s.jump.to].name)} · осталось ${Math.ceil(s.jump.left / SUB)} дн.</small>`;
}

export function players(G) {
  const st = G.st;
  let h = '';
  for (const pid in st.players) {
    const p = st.players[pid], s = st.ships[pid];
    const loc = !s ? '' : s.jump ? '⇢ ' + st.systems[s.jump.to].name : st.systems[s.sys].name;
    const [label, cls] = !p.online ? ['offline', ''] : p.pause ? ['⏸ пауза', 'warn'] : ['▶ в игре', 'ok'];
    h += `<div class="p ${p.online ? '' : 'off'}"><span class="dot" style="background:${hex(p.color)}"></span>${esc(p.name)}${pid === G.me ? ' (вы)' : ''}<span class="st ${cls}" title="${esc(loc)}">${label}</span></div>`;
  }
  setHtml($('players'), h);
  const me = st.players[G.me];
  const bt = $('endturn');
  bt.classList.toggle('ready', !!(me && me.pause));
  bt.textContent = me && me.pause ? '▶ Снять паузу [Пробел]' : '⏸ Пауза [Пробел]';
  bt.title = 'Время останавливается, когда паузу нажали все игроки. Нажмите ещё раз, чтобы снять свою.';
  if ($('speed').value !== String(G.speed)) $('speed').value = String(G.speed);
}

// Time strip at the top: in-game date, how far into the day, pause status.
export function turnInfo(G) {
  const box = $('bigtimer'), st = G.st;
  const T = G.view ? G.view.T : tNow(st) * SUB; // what is on screen right now, in substeps
  const on = Object.values(st.players).filter(p => p.online), asked = on.filter(p => p.pause);
  const c = gameClock(T / SUB);
  let cap;
  if (G.paused) cap = 'ПАУЗА · Пробел — продолжить';
  else if (asked.length) cap = `паузу просят: ${asked.map(p => p.name).join(', ')} (${asked.length} из ${on.length})`;
  else cap = 'Пробел — пауза' + (G.speed !== 1 ? ' · скорость ×' + G.speed : '');
  if (box.dataset.k !== cap) { box.dataset.k = cap; box.querySelector('.cap').textContent = cap; }
  const line = (G.paused ? '⏸ ' : '') + c.date;
  if (box.dataset.c !== line) { box.dataset.c = line; box.querySelector('.date').textContent = line; }
  box.querySelector('.bar i').style.width = (T % SUB) / SUB * 100 + '%'; // how far into the day
  box.classList.toggle('paused', !!G.paused);
  box.classList.toggle('urgent', !G.paused && asked.length > 0);
  box.classList.toggle('fast', !G.paused && G.speed > 1);
}

// In-game calendar: day 0 = 1 January 3301.
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function gameClock(t) {
  let d = Math.floor(t), year = 3301 + Math.floor(d / 365), m = 0;
  d %= 365;
  while (d >= MDAYS[m]) d -= MDAYS[m++];
  return { date: `${d + 1} ${MONTHS[m]} ${year} · день ${Math.floor(t)}` };
}

export function log(G) {
  const st = G.st;
  const items = st.log.filter(e => !e.to || e.to === G.me);
  const key = items.length + ':' + (items.length ? items[items.length - 1].text : '');
  if (key === G._logKey) return;
  G._logKey = key;
  const el = $('log');
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
  el.innerHTML = items.slice(-60).map(e => `<div class="${e.to ? 'me' : ''} ${e.chat ? 'chat' : ''}"><span class="day">[${e.day}]</span> ${esc(e.text)}</div>`).join('');
  if (stick) el.scrollTop = el.scrollHeight;
}

// ---------------------------------------------------------------- music player

export function openPlayer(on = true) {
  $('player').hidden = !on;
  if (on) { Audio.initAudio(); player(); }
}

export function player() {
  if ($('player').hidden) return;
  const np = Audio.nowPlaying();
  const key = np.mode + '|' + np.name;
  if ($('player').dataset.k === key) return;
  $('player').dataset.k = key;
  $('player').querySelector('.pnow').innerHTML = `Сейчас играет: <b>${esc(np.name)}</b>${np.mode === 'auto' ? ' <small>(авто)</small>' : ''}`;
  $('plist').innerHTML = Audio.TRACKS.map(t => {
    const sel = t.id === np.mode, playing = np.mode === 'auto' && t.id !== 'auto' && (t.id === 'battle' ? np.battle : !np.battle && t.id === np.theme);
    return `<button class="ptrack ${sel ? 'on' : ''}" data-track="${t.id}"><span class="pi">${sel ? '▶' : playing ? '♪' : ''}</span><span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span></button>`;
  }).join('');
}

export function bindPlayer() {
  const pick = id => { Audio.playTrack(id); player(); };
  $('playerbtn').onclick = () => openPlayer($('player').hidden);
  $('playerclose').onclick = () => openPlayer(false);
  $('plist').addEventListener('click', e => {
    const b = e.target.closest('[data-track]');
    if (b) pick(/^\d+$/.test(b.dataset.track) ? +b.dataset.track : b.dataset.track);
  });
  const step = d => {
    const ids = Audio.TRACKS.map(t => t.id), np = Audio.nowPlaying();
    const cur = np.mode === 'auto' ? (np.battle ? 'battle' : np.theme) : np.mode;
    const i = ids.indexOf(cur);
    let j = (i + d + ids.length) % ids.length;
    if (ids[j] === 'auto') j = (j + d + ids.length) % ids.length; // prev/next walk through real tracks
    pick(ids[j]);
  };
  $('pprev').onclick = () => step(-1);
  $('pnext').onclick = () => step(1);
}

// ---------------------------------------------------------------- equipment descriptions

const bar = (v, max, col) => `<span class="sbar"><i style="width:${Math.max(0, Math.min(100, v / max * 100))}%;background:${col}"></i></span>`;
export const rcol = r => D.RARITY[r || 0].col;
// tech tier as stars; exotics get their own mark
const stars = d => d.rarity === D.EXOTIC ? '<span class="tier exo">✦ ЭКЗОТИКА</span>' : '<span class="tier">' + '★'.repeat(d.tier + 1) + '<s>' + '★'.repeat(4 - d.tier) + '</s></span>';
const rname = d => `<span style="color:${rcol(d.rarity)}">${D.RARITY[d.rarity].name}</span>`;

const ICONS = {
  hull: '<path d="M8 1.5 14 13 8 10.5 2 13z"/>',
  engine: '<path d="M4 2h8l-2 6H6z"/><path d="M6.5 10.5q1.5 4 3 0"/>',
  tank: '<rect x="4" y="3.5" width="8" height="11" rx="2"/><path d="M6 3.5v-2h4v2M4 8h8"/>',
  droid: '<circle cx="8" cy="8" r="6"/><path d="M8 5v6M5 8h6"/>',
  weapon: '<circle cx="8" cy="8" r="4.5"/><path d="M8 1v4M8 11v4M1 8h4M11 8h4"/>',
  module: '<rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M6 1v2M10 1v2M6 13v2M10 13v2M1 6h2M1 10h2M13 6h2M13 10h2"/>',
  goods: '<path d="M2 5 8 2l6 3v7l-6 3-6-3zM2 5l6 3 6-3M8 8v7"/>',
};
export const icon = (kind, col) => `<svg class="ic" viewBox="0 0 16 16" style="stroke:${col}">${ICONS[kind] || ICONS.module}</svg>`;
const SLOT_NAMES = { hull: 'Корпус', engine: 'Двигатель', tank: 'Бак', droid: 'Ремдроид', weapon: 'Оружие', module: 'Модуль' };

export function shortStat(kind, d) {
  switch (kind) {
    case 'weapon': return `${d.dmg} урона · ${d.range}`;
    case 'engine': return `${d.speed} · ${d.jump} св.л.`;
    case 'tank': return `${d.fuel} топлива`;
    case 'droid': return `+${d.rep} в день`;
    case 'hull': return `${d.hp} · бр ${d.armor} · ${d.slots}+${d.mods} сл.`;
    case 'module': return modStat(d, true);
  }
  return '';
}
function modStat(d, short = false) {
  const p = [];
  if (d.shield) p.push(short ? `щит ${d.shield}` : `щит ${d.shield}, восстановление ${d.regen} в день`);
  if (d.armor) p.push(`броня +${d.armor}`);
  if (d.dmgPct) p.push(`урон +${d.dmgPct}%`);
  if (d.rangePct) p.push(`дальность +${d.rangePct}%`);
  if (d.speedPct) p.push(`скорость +${d.speedPct}%`);
  if (d.cargo) p.push(`трюм +${d.cargo}`);
  if (d.evade) p.push(`уклонение ${d.evade}%`);
  if (d.hullPct) p.push(`корпус +${d.hullPct}%`);
  if (d.rep) p.push(`ремонт +${d.rep}/день`);
  return p.join(' · ');
}
function fullStat(kind, d) {
  switch (kind) {
    case 'weapon': return `урон ${d.dmg} в день (${d.shots} × ${Math.round(d.dmg / d.shots)}) · дальность ${d.range}`;
    case 'engine': return `скорость ${d.speed} · прыжок ${d.jump} св.л.`;
    case 'tank': return `вмещает ${d.fuel} ед. топлива`;
    case 'droid': return `чинит ${d.rep} ед. корпуса в день`;
    case 'hull': return `прочность ${d.hp} · броня ${d.armor} · трюм ${d.cargo} · оружейных слотов ${d.slots} · модулей ${d.mods}${d.spd ? ` · скорость ×${d.spd}` : ''}`;
    case 'module': return (D.MOD_TYPES[d.mtype] ? D.MOD_TYPES[d.mtype].name + ': ' : '') + modStat(d);
  }
  return '';
}
const extra = d => (d.desc ? `<br><span class="fxd">${esc(d.desc[0].toUpperCase() + d.desc.slice(1))}</span>` : '');

// "+80 скорости, −5 прыжка" against what is installed now
function compare(s, id) {
  const d = D.itemDef(id);
  if (!d) return '';
  const diff = (label, a, b) => { const v = Math.round((a || 0) - (b || 0)); return v ? `<span class="${v > 0 ? 'good' : 'badp'}">${v > 0 ? '+' : '−'}${Math.abs(v)} ${label}</span>` : ''; };
  let cur = null, parts;
  const S = stats(s);
  if (d.kind === 'weapon') {
    if (s.weapons.length < S.slots) return '<span class="good">есть свободный оружейный слот</span>';
    cur = s.weapons.map(w => D.eqDef(w)).sort((a, b) => a.dmg - b.dmg)[0]; // the natural one to replace
    parts = [diff('урона', d.def.dmg, cur.dmg), diff('дальности', d.def.range, cur.range)];
  } else if (d.kind === 'module') {
    const same = (s.mods || []).find(m => D.eqDef(m).mtype === d.def.mtype);
    if (!same) return (s.mods || []).length < S.mods ? '<span class="good">есть свободный слот модуля</span>' : '<span class="badp">все слоты модулей заняты</span>';
    cur = D.eqDef(same);
    parts = ['shield', 'armor', 'dmgPct', 'speedPct', 'cargo', 'evade', 'rep', 'hullPct'].map(k => diff({ shield: 'щита', armor: 'брони', dmgPct: '% урона', speedPct: '% скорости', cargo: 'трюма', evade: '% уклонения', rep: 'ремонта', hullPct: '% корпуса' }[k], d.def[k], cur[k]));
  } else if (d.kind === 'hull') {
    cur = D.eqDef(s.eq.hull);
    parts = [diff('прочности', d.def.hp, cur.hp), diff('брони', d.def.armor, cur.armor), diff('трюма', d.def.cargo, cur.cargo), diff('оруж. слотов', d.def.slots, cur.slots), diff('слотов модулей', d.def.mods, cur.mods)];
  } else {
    cur = s.eq[d.kind] ? D.eqDef(s.eq[d.kind]) : null;
    if (d.kind === 'engine') parts = [diff('скорости', d.def.speed, cur.speed), diff('прыжка', d.def.jump, cur.jump)];
    else if (d.kind === 'tank') parts = [diff('топлива', d.def.fuel, cur.fuel)];
    else parts = [diff('ремонта', d.def.rep, cur ? cur.rep : 0)];
  }
  parts = parts.filter(Boolean);
  return (cur ? `против «${cur.name}»: ` : 'сейчас не установлено: ') + (parts.join(', ') || 'то же самое');
}

// the one-line name of an item for lists: coloured by rarity, with its tier
const itemLine = (id, withStat = true) => { const d = D.itemDef(id); return `${icon(d.kind, rcol(d.rarity))} <span style="color:${rcol(d.rarity)}">${esc(d.def.name)}</span> ${stars(d)}${withStat ? ` <small style="color:var(--dim)">${shortStat(d.kind, d.def)}</small>` : ''}`; };

// ---------------------------------------------------------------- ship & inventory
// Installed equipment sits in slots; spare equipment and goods lie in the hold as tiles.
// Tiles can be dragged: hold -> slot installs (swapping the old part into the hold),
// slot -> hold removes, hold -> the drop strip jettisons it (or sells it on a planet).

export function openShip(G, on = true) {
  $('ship').hidden = !on;
  if (!on) hideTip();
  if (on) ship(G);
}

// Resolve a tile key ("hold:i12", "slot:engine", "slot:weapon:1", "slot:module:0", "goods:food") against the ship.
function invRef(s, key) {
  if (!key) return null;
  const [src, a, b] = key.split(':');
  if (src === 'hold') {
    const it = (s.items || []).find(x => x.u === a);
    const d = it && D.itemDef(it.id);
    return d ? { key, src, u: a, id: it.id, ...d } : null;
  }
  if (src === 'slot') {
    const idx = a === 'weapon' || a === 'module' ? +b : undefined;
    const id = a === 'weapon' ? s.weapons[idx] : a === 'module' ? (s.mods || [])[idx] : s.eq[a];
    return id ? { key, src, slot: a, idx, id, ...D.itemDef(id) } : { key, src, slot: a, idx, kind: a, empty: true };
  }
  if (src === 'goods') {
    const q = s.cargo[a];
    return q ? { key, src, good: a, qty: q, kind: 'goods', def: D.byId(D.GOODS, a) } : null;
  }
  return null;
}

function tile(G, r, o = {}) {
  const col = r.empty ? '#33415a' : r.kind === 'goods' ? '#6ab8ff' : rcol(r.rarity);
  const drag = r.src === 'hold' || r.src === 'goods' || (r.src === 'slot' && !r.empty && (r.kind === 'weapon' || r.kind === 'module' || r.kind === 'droid'));
  let attrs = `data-key="${r.key}" style="--tc:${col}"` + (drag ? ' draggable="true"' : '');
  if (r.src === 'slot') attrs += ` data-zone="slot" data-accept="${r.kind}"`;
  const name = r.empty ? 'пусто' : r.def.name;
  let sub = '';
  if (r.kind === 'goods') sub = r.def.special ? 'не для рынка' : `${r.def.base} кр/ед.`;
  else if (!r.empty) sub = stars(r) + (r.src === 'hold' ? ` <span class="sz">${r.def.size} ед.</span>` : '') + `<br>${shortStat(r.kind, r.def)}`;
  else sub = o.hint || '';
  return `<div class="it ${r.empty ? 'empty' : ''} ${r.rarity === D.EXOTIC ? 'exo' : ''} ${G.invSel === r.key ? 'sel' : ''}" ${attrs}>` +
    (o.cap ? `<div class="sn">${o.cap}</div>` : '') +
    `<div class="nm">${icon(r.kind, col)}<span>${esc(name)}</span></div>` +
    (sub ? `<div class="sub">${sub}</div>` : '') +
    (r.kind === 'goods' ? `<b class="q">${r.qty}</b>` : '') + '</div>';
}

// description shared by the hover tip and the details box
function invInfo(G, s, r) {
  if (r.kind === 'goods') {
    const st = G.st, sys = s.sys != null && !s.jump ? st.systems[s.sys] : null;
    const trade = sys && sys.owner !== 'dom' && !r.def.special, here = s.landed ? findPlanet(st, s.landed) : null;
    let h = `<div class="t">${icon('goods', '#6ab8ff')} ${r.def.name} <small style="color:var(--dim)">× ${r.qty}</small></div><div class="d">`;
    if (r.def.special) return h + `Добыча с доминаторов. Рейнджерский центр меняет её на редкое снаряжение или платит ${D.PROTO_PRICE} кр за единицу.</div>`;
    h += `Товар · базовая цена ${r.def.base} кр`;
    if (here && here.prices && trade) h += `<br>Здесь купят по <b>${sellPrice(here.prices[r.good])}</b> (всего ${fmt(r.qty * sellPrice(here.prices[r.good]))} кр)`;
    if (trade) {
      let best = null;
      for (const p of planetsOf(sys)) { const v = sellPrice(p.prices[r.good]); if (!best || v > best.v) best = { v, n: p.name }; }
      if (best) h += `<br>Лучшая цена в системе: <span class="good">${best.v}</span> — ${esc(best.n)}`;
    }
    return h + '</div>';
  }
  const cap = (r.kind === 'weapon' || r.kind === 'module') && r.src === 'slot' ? SLOT_NAMES[r.kind] + ', слот ' + (r.idx + 1) : SLOT_NAMES[r.kind];
  if (r.empty) return `<div class="t">${cap}: пусто</div><div class="d">Перетащите сюда ${{ weapon: 'оружие', module: 'модуль', droid: 'ремдроида' }[r.kind] || 'снаряжение'} из трюма или купите на верфи.</div>`;
  const col = rcol(r.rarity);
  let h = `<div class="t" style="color:${col}">${icon(r.kind, col)} ${esc(r.def.name)} ${stars(r)}</div><div class="d">${rname(r)} · ${D.ITEM_KIND_NAMES[r.kind]}<br>${fullStat(r.kind, r.def)}${extra(r.def)}`;
  h += `<br>Место в трюме: ${r.def.size} ед. · продажа: ${fmt(D.itemSell(r.id))} кр`;
  if (r.kind === 'hull' && r.src === 'hold') h += '<br><span class="warnp">Чертёж корпуса: сменить корпус можно только на планете или станции</span>';
  h += r.src === 'hold' ? '<br>' + compare(s, r.id) : '<br><span style="color:var(--acc)">✓ установлено</span>';
  return h + '</div>';
}

function invActions(G, s, r) {
  const S = stats(s);
  const b = (label, a, cls = '') => `<button class="${cls}" data-act='${JSON.stringify(a)}'>${esc(label)}</button>`;
  const space = !s.landed && !s.jump && s.sys != null;
  const dock = s.landed ? findPlanet(G.st, s.landed) : null;
  const shop = !!dock && G.st.systems[s.sys].owner !== 'dom';
  const k = dock && dock.station === 'pirate' ? 0.7 : 0.5;
  let h = '';
  if (r.src === 'hold') {
    const arr = r.kind === 'weapon' ? s.weapons : r.kind === 'module' ? s.mods || [] : null;
    const full = arr && arr.length >= (r.kind === 'weapon' ? S.slots : S.mods);
    const same = r.kind === 'module' && (s.mods || []).find(m => D.eqDef(m).mtype === r.def.mtype);
    if (same) h += b('Заменить «' + D.eqDef(same).name + '»', { type: 'equip', u: r.u }, 'primary');
    else if (arr && full) arr.forEach((w, i) => { h += b('Вместо «' + D.eqDef(w).name + '»', { type: 'equip', u: r.u, idx: i }); });
    else h += b(s.eq[r.kind] && !arr ? 'Заменить «' + D.eqDef(s.eq[r.kind]).name + '»' : 'Установить', { type: 'equip', u: r.u }, 'primary');
    if (shop) h += b(D.itemSell(r.id, k) ? 'Продать за ' + fmt(D.itemSell(r.id, k)) + ' кр' : 'Сдать в утиль', { type: 'sellItem', u: r.u });
    else if (space) h += b('Выбросить за борт', { type: 'dropItem', u: r.u });
  } else if (r.src === 'slot' && !r.empty) {
    if (r.kind === 'weapon' || r.kind === 'module' || r.kind === 'droid') h += b('Снять в трюм', { type: 'unequip', slot: r.kind, idx: r.idx });
    if ((r.kind === 'weapon' || r.kind === 'module') && shop) h += b('Продать за ' + fmt(D.itemSell(r.id, k)) + ' кр', { type: 'sellInst', slot: r.kind, idx: r.idx });
    if (r.kind === 'engine' || r.kind === 'tank') h += '<span class="meta">Снять нельзя — только заменить другим из трюма или на верфи.</span>';
    if (r.kind === 'hull') h += '<span class="meta">Корпус меняется на верфи или чертежом из трюма (на планете или станции).</span>';
  } else if (r.src === 'goods') {
    if (shop && dock.prices && !r.def.special) h += b('Продать 1', { type: 'sell', good: r.good, qty: 1 }) + b('Продать всё', { type: 'sell', good: r.good, qty: 9999 });
    else if (space) h += b('−1 за борт', { type: 'drop', good: r.good, qty: 1 }) + b('Всё за борт', { type: 'drop', good: r.good, qty: 9999 });
  }
  return h ? `<div class="btns">${h}</div>` : '';
}

function invDetail(G) {
  const el = $('invdetail'), s = G.st.ships[G.me];
  if (!el || !s) return;
  const r = invRef(s, G.invSel);
  if (!r) { G.invSel = null; el.innerHTML = '<div class="meta">Выберите предмет, чтобы увидеть подробности и действия.</div>'; return; }
  el.innerHTML = invInfo(G, s, r) + invActions(G, s, r);
}

const KIND_ORDER = { weapon: 0, module: 1, hull: 2, engine: 3, tank: 4, droid: 5 };

export function ship(G) {
  if ($('ship').hidden || G.drag) return; // never rebuild under a dragged tile
  const st = G.st, s = st.ships[G.me];
  if (!s) return;
  const S = stats(s);
  const hull = D.itemDef(s.eq.hull);
  const hpRel = s.hull / S.maxHull;
  const hpCol = hpRel < 0.3 ? 'var(--bad)' : hpRel < 0.6 ? 'var(--warn)' : 'var(--acc)';
  const eqIds = [s.eq.hull, s.eq.engine, s.eq.tank, s.eq.droid, ...s.weapons, ...(s.mods || [])].filter(Boolean);
  const eqValue = eqIds.reduce((a, id) => a + D.eqDef(id).price, 0);
  let h = `<h2 style="color:${hex(s.color)}">${esc(s.name)}</h2><div class="meta"><span style="color:${rcol(hull.rarity)}">${hull.def.name}</span> · сбито кораблей: ${s.kills} · оснащение ≈ ${fmt(eqValue)} кр${s.wanted > 0 ? ` · <span class="badp">в розыске ${s.wanted} дн.</span>` : ''}</div>`;
  const dmg = dps(s);
  h += `<div class="stats">
    <div>Корпус</div><div>${bar(s.hull, S.maxHull, hpCol)}</div><div>${Math.ceil(s.hull)} / ${S.maxHull}</div>
    ${S.shieldMax ? `<div>Щит</div><div>${bar(s.shield || 0, S.shieldMax, '#66ccff')}</div><div>${Math.round(s.shield || 0)} / ${S.shieldMax}</div>` : ''}
    <div>Топливо</div><div>${bar(s.fuel, S.maxFuel, '#ffc857')}</div><div>${Math.floor(s.fuel)} / ${S.maxFuel}</div>
  </div><div class="chips">
    <span title="урон всего оружия за день с учётом модулей">⚔ ${Math.round(dmg)}/день</span>
    <span title="срезается с каждого попадания">🛡 броня ${S.armor}</span>
    ${S.shieldMax ? `<span title="восстанавливается вне боя">◈ щит +${Math.round(S.shieldRegen)}/день</span>` : ''}
    ${S.evade ? `<span>↯ уклонение ${Math.round(S.evade * 100)}%</span>` : ''}
    <span>➤ ${Math.round(S.speed)}/день</span><span>⇢ ${S.jumpRange} св.л.</span>
    <span>✚ ${S.repair ? '+' + Math.round(S.repair) + '/день' : 'нет ремонта'}</span>
  </div>`;
  const buffs = Object.entries(s.buffs || {});
  if (buffs.length) h += `<div class="meta">Процедуры: ${buffs.map(([k, v]) => `<span class="good">${D.BUFFS[k].name}</span> (${v} дн.)`).join(', ')}</div>`;
  if (s.contract) h += `<div class="meta">Контракт: <b style="color:#fff">${esc(s.contract.name)}</b> — ${s.contract.got} из ${s.contract.need}, награда ${fmt(s.contract.reward)} кр, до дня ${s.contract.until} <button data-act='{"type":"dropContract"}' title="Отказаться от контракта">✕</button></div>`;
  h += '<h3>Оборудование</h3><div class="inv">';
  for (const slot of ['hull', 'engine', 'tank', 'droid']) h += tile(G, invRef(s, 'slot:' + slot), { cap: SLOT_NAMES[slot], hint: 'перетащите из трюма' });
  h += `</div><h3>Вооружение <small>· ${s.weapons.length} из ${S.slots}</small></h3><div class="inv">`;
  for (let i = 0; i < S.slots; i++) h += tile(G, invRef(s, 'slot:weapon:' + i), { cap: 'Слот ' + (i + 1), hint: 'перетащите из трюма' });
  h += `</div><h3>Модули <small>· ${(s.mods || []).length} из ${S.mods}, по одному каждого типа</small></h3><div class="inv">`;
  for (let i = 0; i < S.mods; i++) h += tile(G, invRef(s, 'slot:module:' + i), { cap: 'Модуль ' + (i + 1), hint: 'щит, броня, прицел…' });
  h += '</div>';

  const used = cargoUsed(s), eqUsed = itemsUsed(s);
  h += `<h3>Трюм <small>· ${used} / ${S.cargoCap}</small></h3>`;
  h += `<div class="capbar" title="Товары ${used - eqUsed} ед., снаряжение ${eqUsed} ед."><i style="width:${(used - eqUsed) / S.cargoCap * 100}%;background:#6ab8ff"></i><i style="width:${eqUsed / S.cargoCap * 100}%;background:#5fe0d0"></i></div>`;
  const items = (s.items || []).map(it => invRef(s, 'hold:' + it.u)).filter(Boolean)
    .sort((a, b) => b.rarity - a.rarity || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.tier - a.tier);
  const goods = D.GOODS.filter(g => s.cargo[g.id]).map(g => invRef(s, 'goods:' + g.id));
  h += '<div class="inv hold" data-zone="hold">';
  h += items.map(r => tile(G, r)).join('') + goods.map(r => tile(G, r)).join('');
  if (!items.length && !goods.length) h += '<div class="holdempty">Трюм пуст</div>';
  h += '</div>';
  const shop = s.landed && st.systems[s.sys].owner !== 'dom';
  const zone = s.jump ? '' : shop ? '💰 Перетащите сюда, чтобы продать' : s.landed ? '' : '⤓ Перетащите сюда, чтобы выбросить за борт';
  if (zone) h += `<div class="outzone" data-zone="out">${zone}</div>`;
  h += '<div id="invdetail" class="detail"></div>';
  h += `<div class="meta" style="margin-top:6px">💰 Кредиты: <b style="color:#fff">${fmt(s.credits)}</b>${s.bank && (s.bank.dep || s.bank.debt) ? ` · вклад ${fmt(s.bank.dep)} · долг ${fmt(s.bank.debt)}` : ''} · двойной клик — установить / снять</div>`;
  setHtml($('shipbody'), h);
  invDetail(G);
}

function canDrop(zone, r) {
  switch (zone.dataset.zone) {
    case 'slot': return r.src === 'hold' && zone.dataset.accept === r.kind;
    case 'hold': return r.src === 'slot' && (r.kind === 'weapon' || r.kind === 'module' || r.kind === 'droid');
    case 'out': return r.src === 'hold' || r.src === 'goods';
  }
  return false;
}

export function bindShip(G) {
  const box = $('ship');
  const send = a => { Audio.ui(/^sell/.test(a.type) ? 'coin' : 'click'); G.send({ t: 'act', a }); };
  $('shipbtn').onclick = () => openShip(G, $('ship').hidden);
  $('shipclose').onclick = () => openShip(G, false);
  const select = key => {
    G.invSel = G.invSel === key ? null : key;
    box.querySelectorAll('.it').forEach(t => t.classList.toggle('sel', t.dataset.key === G.invSel));
    invDetail(G);
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (b) { send(JSON.parse(b.dataset.act)); return; }
    const t = e.target.closest('.it[data-key]');
    if (t) select(t.dataset.key);
  });
  box.addEventListener('dblclick', e => {
    const t = e.target.closest('.it[data-key]'), s = G.st.ships[G.me];
    const r = t && s && invRef(s, t.dataset.key);
    if (!r || r.empty) return;
    if (r.src === 'hold') {
      const S = stats(s);
      if (r.kind === 'weapon' && s.weapons.length >= S.slots) return toast('Все оружейные слоты заняты — перетащите оружие на слот, чтобы заменить');
      send({ type: 'equip', u: r.u });
    } else if (r.src === 'slot' && (r.kind === 'weapon' || r.kind === 'module' || r.kind === 'droid')) send({ type: 'unequip', slot: r.kind, idx: r.idx });
  });
  // drag & drop
  let over = null;
  const mark = z => { if (over !== z) { if (over) over.classList.remove('over'); over = z; if (z) z.classList.add('over'); } };
  box.addEventListener('dragstart', e => {
    const t = e.target.closest('.it[data-key]'), s = G.st.ships[G.me];
    const r = t && s && invRef(s, t.dataset.key);
    if (!r) { e.preventDefault(); return; }
    G.drag = r;
    hideTip();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', r.key);
    box.classList.add('dragging');
    box.querySelectorAll('[data-zone]').forEach(z => z.classList.toggle('ok', canDrop(z, r)));
  });
  box.addEventListener('dragover', e => {
    const z = e.target.closest('[data-zone]');
    if (G.drag && z && canDrop(z, G.drag)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; mark(z); } else mark(null);
  });
  box.addEventListener('drop', e => {
    const z = e.target.closest('[data-zone]'), r = G.drag, s = G.st.ships[G.me];
    if (!r || !z || !canDrop(z, r)) return;
    e.preventDefault();
    const zt = z.dataset.zone;
    if (zt === 'slot') {
      const idx = z.dataset.key.split(':')[2];
      send(idx != null ? { type: 'equip', u: r.u, idx: +idx } : { type: 'equip', u: r.u });
    } else if (zt === 'hold') send({ type: 'unequip', slot: r.kind, idx: r.idx });
    else if (r.src === 'hold') send({ type: s.landed ? 'sellItem' : 'dropItem', u: r.u });
    else send({ type: s.landed ? 'sell' : 'drop', good: r.good, qty: 9999 });
  });
  box.addEventListener('dragend', () => {
    G.drag = null; mark(null);
    box.classList.remove('dragging');
    ship(G);
  });
  // hover tip over tiles
  box.addEventListener('mousemove', e => {
    const t = !G.drag && e.target.closest('.it[data-key]'), s = G.st.ships[G.me];
    const r = t && s && invRef(s, t.dataset.key);
    if (r) showTip(invInfo(G, s, r), e.clientX, e.clientY); else hideTip();
  });
  box.addEventListener('mouseleave', hideTip);
}

// ---------------------------------------------------------------- planet & station screens

const btn = (label, a, dis, cls = '') => `<button class="${cls}" data-act='${JSON.stringify(a)}' ${dis ? 'disabled' : ''}>${label}</button>`;
const tabs = (list, cur, attr = 'tab') => `<div class="tabs">${list.map(([k, n, cls = '']) => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''} ${cls}">${n}</button>`).join('')}</div>`;

export function planet(G) {
  const st = G.st, s = st.ships[G.me];
  const box = $('planet');
  $('planetbtn').disabled = !(s && s.landed);
  $('planetbtn').title = s && s.landed ? '' : 'Сначала сядьте на планету или пристыкуйтесь к станции';
  if (!s || !s.landed || G.planetHidden === s.landed) { box.hidden = true; return; }
  const p = findPlanet(st, s.landed);
  box.hidden = false;
  const h = p.station ? stationScreen(G, s, p) : planetScreen(G, s, p);
  setHtml(box, h + `<div class="row">${btn('🚀 Взлететь сейчас', { type: 'takeoff' })}</div>`);
}

function serviceTab(s, S, p) {
  const per = p.station === 'military' ? 2 : 3;
  const rc = Math.ceil((S.maxHull - s.hull) * per), fc = Math.ceil((S.maxFuel - s.fuel) * 12);
  let h = `<div class="eq"><div class="opt"><span>Ремонт корпуса ${Math.ceil(s.hull)}/${S.maxHull}${per < 3 ? ' <small class="good">(со скидкой военных)</small>' : ''}</span>${btn(rc ? fmt(rc) + ' кр' : 'цел', { type: 'repair' }, !rc)}</div>`;
  h += `<div class="opt"><span>Заправка ${Math.floor(s.fuel)}/${S.maxFuel}</span>${btn(fc ? fmt(fc) + ' кр' : 'полон', { type: 'refuel' }, !fc)}</div></div>`;
  return h + `<p class="meta">Статистика: сбито кораблей — ${s.kills}.</p>`;
}

function planetScreen(G, s, p) {
  const st = G.st, sys = st.systems[p.sys], S = stats(s);
  const tab = G.planetTab || 'market';
  let h = `<button class="close" data-hide="1" title="Закрыть [P]">✕</button><h2>${esc(p.name)}</h2><div class="meta">${D.RACES.find(r => r.id === p.race).name} · ${D.ECON[p.econ].name} экономика · техуровень ${p.tech + 1}${sys.owner === 'dom' ? ' · <span class="badp">ОККУПИРОВАНА</span>' : ''}</div>`;
  h += tabs([['market', 'Рынок'], ['yard', 'Верфь'], ['gov', 'Правительство', p.offer && !s.quest || s.quest && s.quest.dest === p.id ? 'hot' : ''], ['service', 'Сервис']], tab);
  if (sys.owner === 'dom') return h + '<p>Доминаторы контролируют систему. Торговля недоступна.</p>';
  if (tab === 'market') {
    const free = S.cargoCap - cargoUsed(s);
    h += `<div class="meta">Трюм: ${cargoUsed(s)}/${S.cargoCap} · Кредиты: ${fmt(s.credits)}</div><table><tr><th>Товар</th><th>Купить</th><th>Продать</th><th>В трюме</th><th></th></tr>`;
    for (const g of D.TRADE_GOODS) {
      const pr = p.prices[g.id], have = s.cargo[g.id] || 0;
      const rel = pr / g.base;
      const cls = rel < 0.75 ? 'good' : rel > 1.25 ? 'badp' : '';
      h += `<tr><td>${g.name}</td><td class="${cls}">${pr}</td><td class="${rel > 1.25 ? 'good' : ''}">${sellPrice(pr)}</td><td>${have || ''}</td><td>` +
        btn('+1', { type: 'buy', good: g.id, qty: 1 }, !free || s.credits < pr) + btn('+10', { type: 'buy', good: g.id, qty: 10 }, !free || s.credits < pr) + btn('макс', { type: 'buy', good: g.id, qty: 9999 }, !free || s.credits < pr) + ' ' +
        btn('−1', { type: 'sell', good: g.id, qty: 1 }, !have) + btn('всё', { type: 'sell', good: g.id, qty: 9999 }, !have) + '</td></tr>';
    }
    return h + '</table><div class="meta" style="margin-top:6px">Зелёным — выгодно. Цены восстанавливаются со временем.</div>';
  }
  if (tab === 'service') return h + serviceTab(s, S, p);
  if (tab === 'gov') return h + govTab(G, s, p);
  // shipyard, by category
  const yt = G.yardTab || 'weapon';
  h += tabs([['weapon', 'Оружие'], ['module', 'Модули'], ['hull', 'Корпуса'], ['engine', 'Двигатели и баки'], ['sell', 'Продать']], yt, 'ytab');
  const lo = Math.max(0, p.tech - 1), free = S.cargoCap - cargoUsed(s);
  const buyRow = (it, cost, dis, note = '') => `<div class="opt"><span>${itemLine(it.id)}${note}</span>${btn((cost >= 0 ? '' : '+') + fmt(Math.abs(cost)) + ' кр', { type: 'buyItem', id: it.id }, dis)}</div>`;
  if (yt === 'weapon' || yt === 'module') {
    const arr = yt === 'weapon' ? s.weapons : s.mods || [], cap = yt === 'weapon' ? S.slots : S.mods;
    h += `<div class="eq"><h4>Установлено (${arr.length} из ${cap})</h4>`;
    arr.forEach((id, i) => { h += `<div class="opt"><span class="cur">${itemLine(id)}</span>${btn('Продать +' + fmt(D.itemSell(id)), { type: 'sellInst', slot: yt, idx: i })}</div>`; });
    if (!arr.length) h += '<div class="meta">пусто</div>';
    h += `</div><div class="eq"><h4>В продаже</h4>`;
    for (const it of D.shopItems(yt, p.tech, lo)) {
      const dup = yt === 'module' && arr.some(m => D.eqDef(m).mtype === it.mtype);
      const toHold = dup || arr.length >= cap;
      h += buyRow(it, it.price, s.credits < it.price || (toHold && free < it.size), toHold ? ' <small class="warnp">→ в трюм</small>' : '');
    }
    h += '</div>';
  } else if (yt === 'hull' || yt === 'engine') {
    const kinds = yt === 'hull' ? ['hull'] : ['engine', 'tank', 'droid'];
    for (const kind of kinds) {
      const cur = s.eq[kind] ? D.eqDef(s.eq[kind]) : null;
      const refund = cur ? Math.floor(cur.price * 0.5) : 0;
      h += `<div class="eq"><h4>${D.EQ_NAMES[kind]}: <span class="cur">${cur ? itemLine(s.eq[kind], false) : 'нет'}</span></h4>`;
      for (const it of D.shopItems(kind, p.tech, kind === 'hull' ? 0 : lo)) if (!cur || it.id !== D.baseId(s.eq[kind])) h += buyRow(it, it.price - refund, s.credits < it.price - refund);
      h += '</div>';
    }
    h += '<div class="meta">Старое оборудование при покупке сдаётся за 50%.</div>';
  } else {
    h += '<div class="eq"><h4>Снаряжение в трюме</h4>';
    for (const it of s.items || []) h += `<div class="opt"><span>${itemLine(it.id)}</span>${btn('Продать +' + fmt(D.itemSell(it.id)), { type: 'sellItem', u: it.u })}</div>`;
    if (!(s.items || []).length) h += '<div class="meta">В трюме нет снаряжения.</div>';
    h += '</div>';
  }
  return h + `<div class="meta">Выбор ограничен техуровнем планеты (${p.tech + 1}). Редкое снаряжение — на станциях и в добыче.</div>`;
}

// Planet government: text quest jobs.
function govTab(G, s, p) {
  const st = G.st, where = id => { const d = findPlanet(st, id); return d ? `${esc(d.name)} (${esc(st.systems[d.sys].name)})` : '?'; };
  let h = '';
  if (s.quest) {
    const Q = QUESTS[s.quest.q], here = s.quest.dest === p.id;
    h += `<div class="eq"><h4>Ваше задание</h4><div class="qoffer"><b>«${esc(Q.title)}»</b> — ${here ? '<span class="good">вы на месте!</span>' : 'цель: ' + where(s.quest.dest)} · награда ${fmt(s.quest.reward)} кр · до дня ${s.quest.until}<br><small style="color:var(--dim)">выдано: ${esc(s.quest.from)}</small></div><div class="row">`;
    h += here ? `<button class="primary" data-qopen="1">${G.qrun && G.qrun.uid === s.quest.uid ? 'Продолжить задание' : 'Приступить к заданию'}</button>` : btn('Бросить задание', { type: 'dropQuest' });
    h += '</div></div>';
  }
  const o = p.offer;
  if (o && !(s.quest && s.quest.dest === p.id)) {
    const d = findPlanet(st, o.dest);
    const ctx = { planet: d ? d.name : '?', system: d ? st.systems[d.sys].name : '?', from: p.name, name: s.name };
    h += `<div class="eq"><h4>Правительство планеты ${esc(p.name)} просит о помощи</h4><div class="qoffer"><b>«${esc(QUESTS[o.q].title)}»</b><br>${esc(questFill(QUESTS[o.q].brief, ctx))}<br>Награда <b>${fmt(o.reward)} кр</b>, срок ${o.days} дн.</div><div class="row">${btn('Взять задание', { type: 'takeQuest' }, !!s.quest)}</div>${s.quest ? '<div class="meta">Одновременно можно выполнять одно задание.</div>' : ''}</div>`;
  }
  if (!s.quest && !o) h += '<p class="meta">Сейчас у правительства нет для вас поручений. Загляните позже — или на соседние планеты.</p>';
  return h;
}

// ---------------------------------------------------------------- text quest window

export function openQuest(G, on = true) {
  const s = G.st.ships[G.me];
  if (on && !(s && s.quest && s.landed === s.quest.dest)) on = false;
  $('quest').hidden = !on;
  if (!on) return;
  if (!G.qrun || G.qrun.uid !== s.quest.uid) {
    const d = findPlanet(G.st, s.quest.dest);
    G.qrun = questStart(s.quest.q, { planet: d.name, system: G.st.systems[d.sys].name, from: s.quest.from, name: s.name });
    G.qrun.uid = s.quest.uid;
  }
  renderQuest(G);
}

function renderQuest(G) {
  const run = G.qrun, box = $('quest');
  if (!run || box.hidden) return;
  const Q = QUESTS[run.id], n = questNode(run);
  let h = `<div class="qhead"><b>${esc(Q.title)}</b><button class="close" data-qclose="1" title="Отложить (прогресс сохранится, пока вы на планете) [Esc]">✕</button></div>`;
  const ps = questParams(run);
  if (ps.length) h += '<div class="qparams">' + ps.map(([k, v, danger]) => `<span class="${danger ? 'danger' : ''}">${esc(k)}: <b>${esc(v)}</b></span>`).join('') + '</div>';
  h += `<div class="qtext">${esc(questText(run))}</div>`;
  if (n.end) {
    const s = G.st.ships[G.me], win = n.end === 'win';
    const r = s && s.quest ? Math.round(s.quest.reward * (n.reward || 1)) : 0;
    h += `<div class="qresult ${win ? 'good' : 'badp'}">${win ? `★ Задание выполнено! Награда ${fmt(r)} кр${n.item ? ' и подарок' : ''}` : 'Задание провалено'}</div>`;
    h += '<div class="qchoices"><button class="primary" data-qend="1">Завершить [1]</button></div>';
  } else {
    h += '<div class="qchoices">' + questChoices(run).map((c, i) => `<button data-qc="${i}"><span class="qn">${i + 1}</span>${esc(questFill(c.t, run.ctx))}</button>`).join('') + '</div>';
  }
  box.innerHTML = h;
  box.querySelector('.qtext').scrollTop = 0;
}

// pick choice i (keys 1-9 or clicks); on an ending, report it to the host
export function questPick(G, i) {
  const run = G.qrun;
  if (!run || $('quest').hidden) return false;
  if (questNode(run).end) {
    if (i !== 0) return true;
    G.send({ t: 'act', a: { type: 'questEnd', node: run.node } });
    Audio.ui(questNode(run).end === 'win' ? 'victory' : 'bad');
    G.qrun = null;
    $('quest').hidden = true;
    return true;
  }
  if (i >= questChoices(run).length) return true;
  Audio.ui('click');
  questChoose(run, i);
  renderQuest(G);
  return true;
}

export function bindQuest(G) {
  $('quest').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.qclose) { $('quest').hidden = true; planet(G); return; }
    if (b.dataset.qend) return questPick(G, 0);
    if (b.dataset.qc != null) questPick(G, +b.dataset.qc);
  });
  $('planet').addEventListener('click', e => { if (e.target.closest('button[data-qopen]')) openQuest(G); });
}

const STATION_TABS = {
  ranger: [['shop', 'Обмен'], ['service', 'Сервис']],
  military: [['contracts', 'Контракты'], ['shop', 'Арсенал'], ['service', 'Сервис']],
  science: [['lab', 'Лаборатория'], ['shop', 'Модули'], ['service', 'Сервис']],
  pirate: [['shop', 'Чёрный рынок'], ['fence', 'Скупка'], ['amnesty', 'Амнистия'], ['service', 'Сервис']],
  medical: [['med', 'Процедуры'], ['service', 'Сервис']],
  business: [['bank', 'Банк'], ['service', 'Сервис']],
};

function stationScreen(G, s, p) {
  const st = G.st, sys = st.systems[p.sys], S = stats(s), T = D.STATIONS[p.station];
  const list = STATION_TABS[p.station];
  if (!G.stationTab || G.stationTab.type !== p.station || !list.some(t => t[0] === G.stationTab.tab)) G.stationTab = { type: p.station, tab: list[0][0] };
  const tab = G.stationTab.tab;
  let h = `<button class="close" data-hide="1" title="Закрыть [P]">✕</button><h2 style="color:${hex(T.col)}">${esc(p.name)}</h2><div class="meta">${T.desc}${sys.owner === 'dom' ? ' · <span class="badp">ОККУПИРОВАНА</span>' : ''}</div>`;
  h += tabs(list, tab, 'stab');
  if (sys.owner === 'dom') return h + '<p>Станция захвачена доминаторами и не работает.</p>';
  const free = S.cargoCap - cargoUsed(s);
  switch (tab) {
    case 'service': return h + serviceTab(s, S, p);
    case 'shop': {
      const proto = p.station === 'ranger';
      if (proto) {
        const have = s.cargo.proto || 0;
        h += `<div class="eq"><h4>Протоплазма: у вас ${have} ед.</h4><div class="opt"><span>Сдать за ${D.PROTO_PRICE} кр за единицу</span>${btn('Сдать 10', { type: 'protoSell', qty: 10 }, have < 1)}${btn('Сдать всё', { type: 'protoSell', qty: 9999 }, have < 1)}</div></div>`;
      }
      h += `<div class="eq"><h4>${proto ? 'Снаряжение за протоплазму' : 'В продаже'}</h4>`;
      (p.stock || []).forEach((it, i) => {
        const d = D.eqDef(it.id);
        const price = proto ? it.proto + ' прот.' : fmt(it.price) + ' кр';
        const can = (proto ? (s.cargo.proto || 0) >= it.proto : s.credits >= it.price) && free >= d.size;
        h += `<div class="opt"><span>${itemLine(it.id)}</span>${btn(price, { type: 'stBuy', i }, !can)}</div>`;
      });
      if (!(p.stock || []).length) h += '<div class="meta">Всё раскупили — завоз примерно раз в две недели.</div>';
      h += `</div><div class="meta">Покупки кладутся в трюм. Ассортимент обновляется каждые 14 дней (последний завоз — день ${p.stockDay ?? '?'}).</div>`;
      return h;
    }
    case 'contracts': {
      if (s.contract) h += `<div class="eq"><h4>Текущий контракт</h4><div class="opt"><span><b>${esc(s.contract.name)}</b> — ${s.contract.got} из ${s.contract.need} · награда ${fmt(s.contract.reward)} кр · до дня ${s.contract.until}</span>${btn('Отказаться', { type: 'dropContract' })}</div></div>`;
      h += '<div class="eq"><h4>Предложения</h4>';
      (p.offers || []).forEach((o, i) => { h += `<div class="opt"><span>${esc(o.name[0].toUpperCase() + o.name.slice(1))} <small style="color:var(--dim)">срок 40 дней</small></span>${btn(fmt(o.reward) + ' кр', { type: 'contract', i }, !!s.contract)}</div>`; });
      if (!(p.offers || []).length) h += '<div class="meta">Новых заданий пока нет.</div>';
      return h + '</div><div class="meta">Засчитываются корабли, по которым вы стреляли перед их гибелью, — можно работать вместе с друзьями.</div>';
    }
    case 'lab': {
      h += '<div class="eq"><h4>Улучшение снаряжения</h4>';
      const rows = [];
      const add = (id, a, where) => {
        const d = D.itemDef(id);
        if (!d || d.rarity >= UPGRADE_MAX) return;
        const cost = upgradeCost(id);
        rows.push(`<div class="opt"><span>${itemLine(id, false)} <small style="color:var(--dim)">${where}</small><br><small>→ <span style="color:${rcol(d.rarity + 1)}">${D.RARITY[d.rarity + 1].name}</span></small></span>${btn(fmt(cost) + ' кр', { type: 'upgrade', ...a }, s.credits < cost)}</div>`);
      };
      for (const k of ['hull', 'engine', 'tank', 'droid']) if (s.eq[k]) add(s.eq[k], { slot: k }, 'установлен');
      s.weapons.forEach((id, i) => add(id, { slot: 'weapon', idx: i }, 'установлено'));
      (s.mods || []).forEach((id, i) => add(id, { slot: 'module', idx: i }, 'установлен'));
      for (const it of s.items || []) add(it.id, { u: it.u }, 'в трюме');
      h += rows.join('') || '<div class="meta">Нечего улучшать: всё уже эпическое или лучше.</div>';
      return h + '</div><div class="meta">Лаборатория поднимает редкость на ступень — до эпической. Легендарное и экзотическое снаряжение добывается только в бою.</div>';
    }
    case 'fence': {
      h += '<div class="eq"><h4>Скупка краденого — 70% цены, без вопросов</h4>';
      for (const it of s.items || []) h += `<div class="opt"><span>${itemLine(it.id)}</span>${btn('+' + fmt(D.itemSell(it.id, 0.7)), { type: 'sellItem', u: it.u })}</div>`;
      if (!(s.items || []).length) h += '<div class="meta">В трюме нет снаряжения.</div>';
      return h + '</div>';
    }
    case 'amnesty': {
      if (!s.wanted) return h + '<p class="meta">Вы не в розыске. Приходите, когда понадобится «потерять» досье.</p>';
      return h + `<div class="eq"><div class="opt"><span>Снять розыск (ещё ${s.wanted} дн.)</span>${btn(fmt(amnestyPrice(s)) + ' кр', { type: 'amnesty' }, s.credits < amnestyPrice(s))}</div></div>`;
    }
    case 'med': {
      h += '<div class="eq"><h4>Процедуры на ' + D.BUFF_DAYS + ' дней</h4>';
      for (const k in D.BUFFS) {
        const B = D.BUFFS[k], left = (s.buffs || {})[k], price = buffPrice(st, k);
        h += `<div class="opt"><span>${B.name} <small style="color:var(--dim)">${B.desc}</small>${left ? ` <small class="good">действует ещё ${left} дн.</small>` : ''}</span>${btn(fmt(price) + ' кр', { type: 'buff', k }, s.credits < price)}</div>`;
      }
      return h + '</div>';
    }
    case 'bank': {
      const b = s.bank || { dep: 0, debt: 0, due: 0 };
      h += `<div class="eq"><h4>Вклад под 0,4% в день: ${fmt(b.dep)} кр</h4><div class="opt"><span>Положить</span>${btn('1 000', { type: 'bank', op: 'deposit', amt: 1000 }, s.credits < 1000)}${btn('10 000', { type: 'bank', op: 'deposit', amt: 10000 }, s.credits < 10000)}${btn('всё', { type: 'bank', op: 'deposit', amt: s.credits }, s.credits < 1)}</div>`;
      h += `<div class="opt"><span>Снять</span>${btn('1 000', { type: 'bank', op: 'withdraw', amt: 1000 }, b.dep < 1000)}${btn('всё', { type: 'bank', op: 'withdraw', amt: Math.floor(b.dep) }, b.dep < 1)}</div></div>`;
      h += `<div class="eq"><h4>Кредит под 1,2% в день на 30 дней${b.debt ? `: долг ${fmt(b.debt)} кр, вернуть до дня ${b.due}` : ''}</h4>`;
      if (!b.debt) h += `<div class="opt"><span>Взять</span>${btn('5 000', { type: 'bank', op: 'loan', amt: 5000 })}${btn('15 000', { type: 'bank', op: 'loan', amt: 15000 })}${btn('30 000', { type: 'bank', op: 'loan', amt: 30000 })}</div>`;
      else h += `<div class="opt"><span>Погасить</span>${btn('1 000', { type: 'bank', op: 'repay', amt: 1000 }, s.credits < 1000)}${btn('всё', { type: 'bank', op: 'repay', amt: Math.ceil(b.debt) }, s.credits < 1)}</div>`;
      return h + '</div><div class="meta">Просроченный кредит — и бизнес-центр объявит вас в розыск, пока не расплатитесь.</div>';
    }
  }
  return h;
}

export function bindPlanet(G) {
  $('planet').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { Audio.ui('click'); G.planetTab = b.dataset.tab; planet(G); return; }
    if (b.dataset.ytab) { Audio.ui('click'); G.yardTab = b.dataset.ytab; planet(G); return; }
    if (b.dataset.stab) { Audio.ui('click'); G.stationTab.tab = b.dataset.stab; planet(G); return; }
    if (b.dataset.hide) { G.planetHidden = G.st.ships[G.me].landed; planet(G); return; }
    if (b.dataset.act) {
      const act = JSON.parse(b.dataset.act);
      Audio.ui({ buy: 'coin', sell: 'coin' }[act.type] || 'click');
      G.send({ t: 'act', a: act });
    }
  });
}

// ---------------------------------------------------------------- object descriptions (hover + selection)

const RELATION = { enemy: ['враг', 'var(--bad)'], neutral: ['нейтрал', 'var(--dim)'], ally: ['союзник', 'var(--acc)'] };

function relation(me, s) {
  if (s.kind === 'player') return me.aggro && me.aggro[s.id] ? 'enemy' : 'ally';
  if (hostileTo(me, s) || hostileTo(s, me)) return 'enemy';
  return s.kind === 'militia' ? 'ally' : 'neutral';
}

function activity(st, s) {
  if (s.landed) { const p = findPlanet(st, s.landed); return (p && p.station ? 'на станции ' : 'на планете ') + (p ? p.name : ''); }
  const o = s.order;
  if (!o) return s.kind === 'citadel' ? 'охраняет систему' : 'дрейфует';
  const tgt = o.target && st.ships[o.target];
  switch (o.type) {
    case 'attack': return tgt ? 'атакует ' + tgt.name : 'в бою';
    case 'follow': return tgt ? 'следует за ' + tgt.name : 'летит';
    case 'land': { const p = findPlanet(st, o.planet); return 'летит на ' + (p ? p.name : 'планету'); }
    case 'loot': return 'летит к контейнеру';
    case 'jump': return 'готовится к прыжку в ' + st.systems[o.to].name;
    default: return 'летит';
  }
}

const hpBar = (v, max, col) => {
  const r = Math.max(0, Math.min(1, v / max));
  return `<span class="sbar"><i style="width:${r * 100}%;background:${col || (r < 0.3 ? 'var(--bad)' : r < 0.6 ? 'var(--warn)' : 'var(--acc)')}"></i></span>`;
};

// Returns HTML describing a ship / planet / station / loot container, or '' if it is not visible to us.
export function describe(G, obj) {
  const st = G.st, me = st.ships[G.me];
  if (!obj || !me || me.jump) return '';
  if (obj.type === 'ship') {
    const s = st.ships[obj.id];
    if (!s || s.sys !== me.sys || s.jump || s.dead != null) return '';
    const S = stats(s);
    const [rel, relCol] = RELATION[s.id === G.me ? 'ally' : relation(me, s)];
    const B = s.boss ? D.BOSSES[s.boss] : null;
    const kind = B ? (B.minion ? 'трутень Матки' : 'чудовище') : s.kind === 'pirate' && s.rank ? 'пират · ' + D.PIRATE_RANKS[s.rank] : D.KIND_NAMES[s.kind];
    let h = `<div class="t" style="color:${hex(s.color)}">${esc(s.name)} <small style="color:var(--dim)">${kind}${s.id === G.me ? ' (вы)' : ''}</small>`;
    if (s.id !== G.me) h += ` <small style="color:${relCol}">· ${B && B.neutral && rel !== 'враг' ? 'мирный' : rel}</small>`;
    h += '</div><div class="d">';
    h += `<div class="hpline">${hpBar(s.hull, S.maxHull)}<span>${Math.ceil(s.hull)}/${S.maxHull}</span></div>`;
    if (S.shieldMax) h += `<div class="hpline">${hpBar(s.shield || 0, S.shieldMax, '#66ccff')}<span>щит ${Math.round(s.shield || 0)}/${S.shieldMax}</span></div>`;
    if (B) h += (B.desc ? esc(B.desc[0].toUpperCase() + B.desc.slice(1)) + '<br>' : '') + `Броня ${S.armor} · скорость ${Math.round(S.speed)}${s.pow > 1 ? ` · окреп ×${s.pow}` : ''}`;
    else {
      h += `${itemLine(s.eq.hull, false)} · броня ${S.armor} · скорость ${Math.round(S.speed)}`;
      if ((s.mods || []).length) h += '<br>Модули: ' + s.mods.map(m => `<span style="color:${rcol(D.itemDef(m).rarity)}">${esc(D.eqDef(m).name)}</span>`).join(', ');
    }
    const ws = s.weapons.map(w => D.itemDef(w));
    h += '<br>Оружие: ' + (ws.length ? ws.map(d => `<span style="color:${rcol(d.rarity)}">${d.def.name}</span> <small>(${d.def.dmg}/${d.def.range})</small>`).join(', ') + ` · <b>${Math.round(dps(s))}</b> урона/день` : 'нет');
    h += `<br>${activity(st, s)}`;
    if (s.id !== G.me) h += ` · дистанция ${Math.round(dist(s.x, s.y, me.x, me.y))}`;
    if (s.kind === 'trader' || s.kind === 'pirate') { const q = cargoUsed(s); if (q) h += ` · в трюме ~${q} ед.`; }
    if (s.kind === 'player' && s.id !== G.me) h += ` · сбито кораблей: ${s.kills}`;
    if (s.wanted > 0) h += ' · <span class="badp">в розыске</span>';
    return h + '</div>';
  }
  if (obj.type === 'planet') {
    const p = findPlanet(st, obj.id);
    if (!p || p.sys !== me.sys) return '';
    const sys = st.systems[p.sys];
    const [px, py] = planetPos(p, tNow(st));
    const far = me.landed !== p.id ? `<br>Дистанция ${Math.round(dist(px, py, me.x, me.y))}` : '';
    if (p.station) {
      const T = D.STATIONS[p.station];
      let h = `<div class="t" style="color:${hex(T.col)}">${esc(p.name)} <small style="color:var(--dim)">станция</small></div><div class="d">${T.desc[0].toUpperCase() + T.desc.slice(1)}`;
      if (sys.owner === 'dom') h += '<br><span class="badp">Захвачена доминаторами</span>';
      else if (me.wanted > 0) h += p.station === 'pirate' || p.station === 'business' ? '<br><span class="good">Примет вас, даже в розыске</span>' : '<br><span class="badp">Вы в розыске — стыковку не разрешат</span>';
      if (p.station === 'pirate') h += '<br><span class="warnp">Вокруг базы рыщут пираты</span>';
      return h + far + '</div>';
    }
    let h = `<div class="t">${esc(p.name)} <small style="color:var(--dim)">планета</small></div><div class="d">`;
    h += `${D.RACES.find(r => r.id === p.race).name} · ${D.ECON[p.econ].name} экономика · техуровень ${p.tech + 1}`;
    if (sys.owner === 'dom') h += '<br><span class="badp">Оккупирована доминаторами — посадка невозможна</span>';
    else {
      const rel = D.TRADE_GOODS.map(g => ({ g, r: p.prices[g.id] / g.base }));
      const cheap = rel.filter(x => x.r < 0.8).sort((a, b) => a.r - b.r).slice(0, 3);
      const dear = rel.filter(x => x.r > 1.2).sort((a, b) => b.r - a.r).slice(0, 3);
      if (cheap.length) h += '<br>Дёшево: ' + cheap.map(x => `<span class="good">${x.g.name} ${p.prices[x.g.id]}</span>`).join(', ');
      if (dear.length) h += '<br>Дорого берут: ' + dear.map(x => `<span class="good">${x.g.name} ${sellPrice(p.prices[x.g.id])}</span>`).join(', ');
      const mine = D.TRADE_GOODS.filter(g => me.cargo[g.id]).map(g => `${g.name} ${sellPrice(p.prices[g.id])}`);
      if (mine.length) h += '<br>Ваш груз здесь: ' + mine.join(', ');
      const best = k => { const l = D.shopItems(k, p.tech, p.tech); return l.length ? l.map(x => x.name).join('/') : ''; };
      h += `<br>Верфь: до ${[best('hull'), best('weapon')].filter(Boolean).join(', ')}`;
    }
    const landed = Object.values(st.ships).filter(s => s.landed === p.id);
    if (landed.length) h += '<br>На планете: ' + landed.map(s => `<span style="color:${hex(s.color)}">${esc(s.name)}</span>`).join(', ');
    return h + far + '</div>';
  }
  if (obj.type === 'loot') {
    const l = st.loot.find(l => l.id === obj.id);
    if (!l) return '';
    const eq = (l.items || []).map(it => D.itemDef(it.id)).filter(Boolean).sort((a, b) => b.rarity - a.rarity);
    const goods = Object.entries(l.cargo).map(([g, q]) => q + ' ' + D.byId(D.GOODS, g).name);
    if (l.credits) goods.unshift(l.credits + ' кр.');
    const size = eq.reduce((a, d) => a + d.def.size, 0) + Object.values(l.cargo).reduce((a, q) => a + q, 0);
    const value = l.credits + Object.entries(l.cargo).reduce((a, [g, q]) => a + q * D.byId(D.GOODS, g).base, 0) + eq.reduce((a, d) => a + D.itemSell(d.def.id), 0);
    const top = eq.length ? eq[0].rarity : -1;
    let h = `<div class="t" style="color:${top >= 2 ? rcol(top) : eq.length ? '#66e0ff' : '#ffcc44'}">${eq.length ? 'Контейнер со снаряжением' : 'Контейнер'}</div><div class="d">`;
    if (eq.length) h += eq.map(d => `<div>${itemLine(d.def.id)}</div>`).join('');
    if (goods.length) h += goods.join(', ') + '<br>';
    const free = stats(me).cargoCap - cargoUsed(me);
    h += `Объём ${size} ед.${size > free ? ` <span class="badp">(свободно ${free})</span>` : ''} · ценность ≈ ${fmt(value)} кр<br>Исчезнет через ${l.ttl} дн. · дистанция ${Math.round(dist(l.x, l.y, me.x, me.y))}`;
    return h + '</div>';
  }
  return '';
}

export function selinfo(G) {
  const box = $('selinfo');
  const st = G.st, sel = G.sel, me = st.ships[G.me];
  let h = describe(G, sel);
  if (!h) { box.hidden = true; if (sel && me && !me.jump) G.sel = null; return; }
  const ob = (label, o) => `<button data-order='${JSON.stringify(o)}'>${label}</button>`;
  let acts = '';
  if (sel.type === 'ship') {
    const s = st.ships[sel.id];
    if (s.id !== G.me && !s.landed) {
      const peaceful = !hostileTo(me, s) && (s.kind === 'trader' || s.kind === 'militia');
      const levi = s.boss === 'leviathan' && !hostileTo(me, s);
      acts = ob(peaceful ? '⚠ Атаковать (розыск!)' : levi ? '⚔ Атаковать (он ответит!)' : '⚔ Атаковать', { type: 'attack', target: s.id }) + (s.kind === 'citadel' ? '' : ob('Следовать', { type: 'follow', target: s.id }));
    }
  } else if (sel.type === 'planet') { const p = findPlanet(st, sel.id); if (me.landed !== sel.id) acts = ob(p && p.station ? 'Пристыковаться' : 'Сесть', { type: 'land', planet: sel.id }); }
  else if (sel.type === 'loot') acts = ob('Подобрать', { type: 'loot', id: sel.id });
  const btns = '<button data-focus="1" title="Навести камеру на объект">🎯 Фокус [F]</button>' + acts;
  box.hidden = false;
  // the description (distance, hull) changes all the time; the buttons are rebuilt only when they change,
  // so a click never lands on a button that was just replaced
  if (!box.firstElementChild || !box.firstElementChild.classList.contains('info')) box.innerHTML = '<div class="info"></div><div class="btns"></div>';
  setHtml(box.firstElementChild, h);
  setHtml(box.lastElementChild, btns);
}

// replace an element's contents only when they actually changed
function setHtml(el, h) {
  if (el._h === h) return;
  el._h = h;
  el.innerHTML = h;
}

// Hover tooltip that follows the cursor (3D view, inventory tiles).
function showTip(h, x, y) {
  const tip = $('tip');
  if (!h) return hideTip();
  if (tip.dataset.k !== h) { tip.dataset.k = h; tip.innerHTML = h; }
  tip.hidden = false;
  const w = tip.offsetWidth, hh = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 18)) + 'px';
  tip.style.top = (y + 18 + hh > innerHeight ? y - hh - 12 : y + 18) + 'px';
}
function hideTip() { const tip = $('tip'); tip.hidden = true; tip.dataset.k = ''; }

export function tooltip(G, hit, x, y) {
  showTip(hit && hit.type !== 'point' ? describe(G, hit) : '', x, y);
}

export function bindSel(G) {
  $('selinfo').addEventListener('click', e => {
    if (e.target.closest('button[data-focus]')) { G.focusSel(); return; }
    const b = e.target.closest('button[data-order]');
    if (b) G.order(JSON.parse(b.dataset.order));
  });
}

// ---------------------------------------------------------------- galaxy map

export function openMap(G, on = true) {
  $('map').hidden = !on;
  if (on) { G.mapSel = G.mapSel ?? null; drawMap(G); }
}

function mapTransform(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sc = Math.min((w - 60) / 120, (h - 60) / 80);
  const ox = (w - 120 * sc) / 2, oy = (h - 80 * sc) / 2;
  return { sc, fx: x => ox + x * sc, fy: y => oy + y * sc, w, h };
}

export function drawMap(G) {
  if ($('map').hidden) return;
  const cv = $('mapc');
  const dpr = devicePixelRatio || 1;
  if (cv.width !== cv.clientWidth * dpr) { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const T = mapTransform(cv);
  const st = G.st, me = st.ships[G.me];
  const S = stats(me);
  g.clearRect(0, 0, T.w, T.h);
  const here = me.jump ? null : st.systems[me.sys];
  if (here) {
    g.strokeStyle = 'rgba(76,255,154,0.35)'; g.setLineDash([6, 6]);
    g.beginPath(); g.arc(T.fx(here.x), T.fy(here.y), S.jumpRange * T.sc, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,200,80,0.25)';
    g.beginPath(); g.arc(T.fx(here.x), T.fy(here.y), Math.min(S.jumpRange, me.fuel) * T.sc, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
  }
  // links
  g.strokeStyle = 'rgba(60,90,140,0.25)';
  for (const a of st.systems) for (const b of st.systems) if (a.id < b.id && sysDist(a, b) < 19) { g.beginPath(); g.moveTo(T.fx(a.x), T.fy(a.y)); g.lineTo(T.fx(b.x), T.fy(b.y)); g.stroke(); }
  const monsters = Object.values(st.ships).filter(s => s.kind === 'boss' && !s.jump && s.dead == null);
  for (const s of st.systems) {
    const x = T.fx(s.x), y = T.fy(s.y);
    const dom = s.owner === 'dom';
    if (dom) { g.fillStyle = 'rgba(160,60,255,0.25)'; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill(); }
    if (s.cap > 0) { g.strokeStyle = '#ff9933'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 16, 0, 7); g.stroke(); g.lineWidth = 1; }
    g.fillStyle = dom ? '#b060ff' : hex(s.star.color);
    g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
    if (G.mapSel === s.id) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.stroke(); }
    if (here && here.id === s.id) { g.strokeStyle = '#4cff9a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); g.lineWidth = 1; }
    g.fillStyle = dom ? '#d0a0ff' : '#9fb8d8';
    g.font = '12px Segoe UI, sans-serif'; g.textAlign = 'center';
    g.fillText(s.name + (dom ? ' ☠' : ''), x, y + 20);
    // stations: small squares in their colours above the star
    const sts = s.planets.filter(p => p.station);
    sts.forEach((p, i) => { g.fillStyle = hex(D.STATIONS[p.station].col); g.fillRect(x - sts.length * 4 + i * 8, y - 17, 6, 6); });
    if (monsters.some(m => m.sys === s.id)) { g.fillStyle = '#ff3060'; g.font = 'bold 14px Segoe UI, sans-serif'; g.fillText('☠', x + 15, y - 8); }
    const qd = me.quest && findPlanet(st, me.quest.dest);
    if (qd && qd.sys === s.id) { g.fillStyle = '#ffd66b'; g.font = 'bold 13px Segoe UI, sans-serif'; g.fillText('✉', x - 16, y - 8); }
  }
  // players
  let i = 0;
  for (const pid in st.players) {
    const s = st.ships[pid];
    if (!s) continue;
    let x, y;
    if (s.jump) {
      const a = st.systems[s.jump.from], b = st.systems[s.jump.to];
      const k = (s.jump.total - s.jump.left + 0.5) / s.jump.total;
      x = T.fx(a.x + (b.x - a.x) * k); y = T.fy(a.y + (b.y - a.y) * k);
    } else { const a = st.systems[s.sys]; const ang = i * 1.3; x = T.fx(a.x) + Math.cos(ang) * 13; y = T.fy(a.y) + Math.sin(ang) * 13; }
    g.fillStyle = hex(st.players[pid].color);
    g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y + 4); g.lineTo(x - 4, y + 4); g.closePath(); g.fill();
    i++;
  }
  // info
  const info = $('mapinfo');
  if (G.mapSel == null) { info.innerHTML = '<span style="color:var(--dim)">Кликните по системе. Зелёный круг — дальность прыжка, жёлтый — хватит топлива. Цветные квадратики — станции, ☠ — чудовище, ✉ — цель вашего задания.</span>'; return; }
  const sys = st.systems[G.mapSel];
  let h = `<b>${esc(sys.name)}</b> — ${sys.owner === 'dom' ? '<span class="badp">доминаторы</span>' : 'Коалиция'}${sys.cap > 0 ? ' <span style="color:var(--warn)">(под атакой)</span>' : ''}<br><small>Планет: ${planetsOf(sys).length}</small>`;
  for (const p of sys.planets.filter(p => p.station)) h += `<br><small style="color:${hex(D.STATIONS[p.station].col)}">■ ${esc(p.name)}</small>`;
  for (const m of monsters.filter(m => m.sys === sys.id)) h += `<br><small class="badp">☠ ${esc(m.name)}</small>`;
  if (here && here.id !== sys.id) {
    const d = sysDist(here, sys), cost = jumpCost(d);
    const ok = d <= S.jumpRange && me.fuel >= cost;
    h += `<br>Расстояние ${d.toFixed(1)} · топливо ${cost} · ${jumpDays(d)} дн.<br>`;
    h += ok ? `<button id="jumpbtn" class="primary">Прыжок</button>` : `<span class="badp">${d > S.jumpRange ? 'Вне дальности двигателя' : 'Не хватает топлива'}</span>`;
    if (me.order && me.order.type === 'jump' && me.order.to === sys.id) h += '<br><span class="good">Курс проложен ✓</span>';
  }
  info.innerHTML = h;
  const jb = $('jumpbtn');
  if (jb) jb.onclick = () => { G.order({ type: 'jump', to: sys.id }); toast('Прыжок в ' + sys.name); };
}

export function bindMap(G) {
  $('mapc').addEventListener('click', e => {
    const r = e.target.getBoundingClientRect();
    const T = mapTransform(e.target);
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 25;
    for (const s of G.st.systems) { const d = Math.hypot(T.fx(s.x) - mx, T.fy(s.y) - my); if (d < bd) { bd = d; best = s; } }
    G.mapSel = best ? best.id : null;
    drawMap(G);
  });
  $('mapclose').onclick = () => openMap(G, false);
  $('mapbtn').onclick = () => openMap(G, $('map').hidden);
}
