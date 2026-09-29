// DOM user interface: HUD, planet screens, selection, log, galaxy map.
import * as D from './data.js';
import * as Audio from './audio.js';
import { stats, cargoUsed, sysDist, jumpCost, jumpDays, findPlanet, sellPrice, hostileTo, dist, planetPos } from './sim.js';

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
    `<span>⛽ ${Math.floor(s.fuel)}/${S.maxFuel}</span>` +
    `<span>📦 ${cargoUsed(s)}/${S.cargoCap}</span>` +
    `<span>⚔ ${s.weapons.length ? s.weapons.map(w => D.byId(D.WEAPONS, w).name).join(', ') : '—'}</span>` +
    (s.wanted > 0 ? `<span class="wanted">РОЗЫСК ${s.wanted} дн.</span>` : '');
  $('hyper').hidden = !s.jump;
  if (s.jump) $('hyper').innerHTML = `Гиперпространство<br><small>${esc(st.systems[s.jump.from].name)} → ${esc(st.systems[s.jump.to].name)} · осталось ${s.jump.left} дн.</small>`;
}

export function players(G) {
  const st = G.st;
  let h = '';
  for (const pid in st.players) {
    const p = st.players[pid], s = st.ships[pid];
    const loc = !s ? '' : s.jump ? '⇢ ' + st.systems[s.jump.to].name : st.systems[s.sys].name;
    const rd = G.rd && G.rd[pid];
    const [label, ok] = !p.online ? ['offline', 0] : rd === 'skip' ? ['⏩ ускорить', 1] : ['⏱ обычное', 0];
    h += `<div class="p ${p.online ? '' : 'off'}"><span class="dot" style="background:${hex(p.color)}"></span>${esc(p.name)}${pid === G.me ? ' (вы)' : ''}<span class="st ${ok ? 'ok' : ''}" title="${esc(loc)}">${label}</span></div>`;
  }
  $('players').innerHTML = h;
  const me = st.players[G.me];
  const bt = $('endturn');
  bt.classList.toggle('ready', !!(me && me.ready));
  bt.textContent = me && me.ready ? '⏩ Ускорение ВКЛ [Пробел]' : '⏱ Ускорить время [Пробел]';
  bt.title = 'Время ускоряется, только когда ускорение включили все игроки. Нажмите ещё раз, чтобы выключить.';
}

export function turnInfo(G, animating) {
  const box = $('bigtimer');
  const left = G.timerEnd ? Math.max(0, G.timerEnd - performance.now()) : 0;
  let num, cap, frac;
  if (animating) { num = '▶'; cap = 'день ' + G.st.day; frac = 1; }
  else if (G.paused) { num = '⏸'; cap = (G.paused === 'landed' ? 'пауза — все на планетах' : 'пауза — никто не отдал приказ') + ' · Пробел — пустить время'; frac = 0; }
  else if (G.fast) { num = '⏩'; cap = 'все включили ускорение'; frac = left / 1000; }
  else if (!G.timerPeriod) { num = '⏸'; cap = 'ждём, пока все включат ускорение'; frac = 0; }
  else { num = Math.ceil(left / 1000); cap = 'до следующего дня'; frac = left / G.timerPeriod; }
  const key = num + '|' + cap;
  if (box.dataset.k !== key) { box.dataset.k = key; box.querySelector('.num').textContent = num; box.querySelector('.cap').textContent = cap; }
  box.querySelector('.bar i').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  const clock = gameClock(animating && G.view.anim ? G.view.anim.day + G.view.animFrac() : G.st.day);
  if (box.dataset.c !== clock) { box.dataset.c = clock; box.querySelector('.date').textContent = clock; }
  box.classList.toggle('paused', !!G.paused && !animating);
  box.classList.toggle('urgent', !animating && !G.fast && !G.paused && G.timerPeriod > 0 && left < 3000);
  box.classList.toggle('fast', !!G.fast);
}

// In-game calendar: day 0 = 1 January 3301, hours tick along while a day is animated.
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function gameClock(t) {
  let d = Math.floor(t), year = 3301 + Math.floor(d / 365), m = 0;
  d %= 365;
  while (d >= MDAYS[m]) d -= MDAYS[m++];
  const mins = Math.floor((t - Math.floor(t)) * 24 * 60 / 10) * 10;
  const hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
  return `${d + 1} ${MONTHS[m]} ${year} · ${hh}:${mm} · день ${Math.floor(t)}`;
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

// ---------------------------------------------------------------- ship & cargo

export function openShip(G, on = true) {
  $('ship').hidden = !on;
  if (on) ship(G);
}

const bar = (v, max, col) => `<span class="sbar"><i style="width:${Math.max(0, Math.min(100, v / max * 100))}%;background:${col}"></i></span>`;
const stars = (list, id) => { const t = D.tierOf(list, id); return '<span class="tier">' + '★'.repeat(t + 1) + '<s>' + '★'.repeat(list.length - t - 1) + '</s></span>'; };

export function ship(G) {
  if ($('ship').hidden) return;
  const st = G.st, s = st.ships[G.me];
  if (!s) return;
  const S = stats(s);
  const hull = D.byId(D.HULLS, s.eq.hull), eng = D.byId(D.ENGINES, s.eq.engine), tank = D.byId(D.TANKS, s.eq.tank);
  const droid = s.eq.droid ? D.byId(D.DROIDS, s.eq.droid) : null;
  const hpRel = s.hull / S.maxHull;
  const hpCol = hpRel < 0.3 ? 'var(--bad)' : hpRel < 0.6 ? 'var(--warn)' : 'var(--acc)';
  const eqValue = [hull, eng, tank, droid].reduce((a, x) => a + (x ? x.price : 0), 0) + s.weapons.reduce((a, w) => a + D.byId(D.WEAPONS, w).price, 0);
  let h = `<h2 style="color:${hex(s.color)}">${esc(s.name)}</h2><div class="meta">${hull.name} · уничтожено кораблей: ${s.kills} · оснащение ≈ ${fmt(eqValue)} кр${s.wanted > 0 ? ` · <span class="badp">в розыске ${s.wanted} дн.</span>` : ''}</div>`;
  h += `<div class="stats">
    <div>Корпус</div><div>${bar(s.hull, S.maxHull, hpCol)}</div><div>${Math.ceil(s.hull)} / ${S.maxHull}</div>
    <div>Топливо</div><div>${bar(s.fuel, S.maxFuel, '#ffc857')}</div><div>${Math.floor(s.fuel)} / ${S.maxFuel}</div>
    <div>Трюм</div><div>${bar(cargoUsed(s), S.cargoCap, '#6ab8ff')}</div><div>${cargoUsed(s)} / ${S.cargoCap}</div>
    <div>Скорость</div><div></div><div>${Math.round(S.speed)} / день</div>
    <div>Прыжок</div><div></div><div>${S.jumpRange} св.л.</div>
    <div>Ремонт</div><div></div><div>${S.repair ? '+' + S.repair + ' / день' : '—'}</div>
  </div>`;
  const slot = (name, list, it, desc) => `<div class="slot ${it ? '' : 'empty'}"><div class="sn">${name}</div><div class="si">${it ? it.name + ' ' + stars(list, it.id) : 'пусто'}</div><div class="sd">${it ? desc : 'можно купить на верфи'}</div></div>`;
  h += '<h3>Оборудование</h3><div class="slots">';
  h += slot('Корпус', D.HULLS, hull, `${hull.hp} брони · трюм ${hull.cargo} · оружейных слотов ${hull.slots}`);
  h += slot('Двигатель', D.ENGINES, eng, `скорость ${eng.speed} · прыжок ${eng.jump} св.л.`);
  h += slot('Топливный бак', D.TANKS, tank, `${tank.fuel} ед. топлива`);
  h += slot('Ремдроид', D.DROIDS, droid, droid ? `чинит ${droid.rep} ед./день` : '');
  h += '</div><h3>Вооружение</h3><div class="slots">';
  let dmg = 0;
  for (let i = 0; i < S.slots; i++) {
    const W = s.weapons[i] ? D.byId(D.WEAPONS, s.weapons[i]) : null;
    if (W) dmg += W.dmg;
    h += `<div class="slot ${W ? '' : 'empty'}"><div class="sn">Слот ${i + 1}</div><div class="si">${W ? `<span style="color:${hex(W.color)}">■</span> ${W.name} ${stars(D.WEAPONS, W.id)}` : 'пусто'}</div><div class="sd">${W ? `урон ${W.dmg} · дальность ${W.range}` : 'можно купить на верфи'}</div></div>`;
  }
  h += `</div><div class="meta">Суммарный урон за день: ${dmg}</div>`;

  const sys = s.sys != null && !s.jump ? st.systems[s.sys] : null;
  const here = s.landed ? findPlanet(st, s.landed) : null;
  const trade = sys && sys.owner !== 'dom';
  const goods = D.GOODS.filter(g => s.cargo[g.id]);
  h += '<h3>Трюм</h3>';
  if (!goods.length) h += '<div class="meta">Трюм пуст.</div>';
  else {
    h += `<table><tr><th>Товар</th><th>Кол-во</th><th>${here ? 'Продать здесь' : 'Базовая цена'}</th><th>Лучшая в системе</th><th></th></tr>`;
    let total = 0;
    for (const g of goods) {
      const q = s.cargo[g.id];
      const pr = here && trade ? sellPrice(here.prices[g.id]) : g.base;
      let best = null;
      if (trade) for (const p of sys.planets) { const v = sellPrice(p.prices[g.id]); if (!best || v > best.v) best = { v, n: p.name }; }
      total += q * pr;
      const drop = qty => JSON.stringify({ type: 'drop', good: g.id, qty });
      h += `<tr><td>${g.name}</td><td>${q}</td><td>${pr} <small style="color:var(--dim)">(${fmt(q * pr)})</small></td>` +
        `<td>${best ? `<span class="${best.v > pr ? 'good' : ''}">${best.v}</span> <small style="color:var(--dim)">${esc(best.n)}</small>` : '—'}</td>` +
        `<td><button data-drop='${drop(1)}' title="Выбросить 1">−1</button><button data-drop='${drop(9999)}' title="Выбросить всё за борт">✕</button></td></tr>`;
    }
    h += `</table><div class="meta">Оценка груза: ${fmt(total)} кр. Груз, выброшенный в космосе, остаётся контейнером.</div>`;
  }
  h += `<div class="meta" style="margin-top:8px">💰 Кредиты: <b style="color:#fff">${fmt(s.credits)}</b></div>`;
  $('shipbody').innerHTML = h;
}

export function bindShip(G) {
  $('shipbtn').onclick = () => openShip(G, $('ship').hidden);
  $('shipclose').onclick = () => openShip(G, false);
  $('ship').addEventListener('click', e => {
    const b = e.target.closest('button[data-drop]');
    if (b) G.send({ t: 'act', a: JSON.parse(b.dataset.drop) });
  });
}

// ---------------------------------------------------------------- planet

export function planet(G) {
  const st = G.st, s = st.ships[G.me];
  const box = $('planet');
  $('planetbtn').disabled = !(s && s.landed);
  $('planetbtn').title = s && s.landed ? '' : 'Сначала сядьте на планету';
  if (!s || !s.landed || G.planetHidden === s.landed) { box.hidden = true; return; }
  const p = findPlanet(st, s.landed);
  const sys = st.systems[p.sys];
  const S = stats(s);
  box.hidden = false;
  const tab = G.planetTab || 'market';
  const btn = (label, a, dis) => `<button data-act='${JSON.stringify(a)}' ${dis ? 'disabled' : ''}>${label}</button>`;
  let h = `<button class="close" data-hide="1" title="Закрыть [P]">✕</button><h2>${esc(p.name)}</h2><div class="meta">${D.RACES.find(r => r.id === p.race).name} · ${D.ECON[p.econ].name} экономика · техуровень ${p.tech + 1}${sys.owner === 'dom' ? ' · <span class="badp">ОККУПИРОВАНА</span>' : ''}</div>`;
  h += `<div class="tabs">${[['market', 'Рынок'], ['yard', 'Верфь'], ['service', 'Сервис']].map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  if (sys.owner === 'dom') {
    h += '<p>Доминаторы контролируют систему. Торговля недоступна.</p>' + btn('Взлететь', { type: 'takeoff' });
  } else if (tab === 'market') {
    const free = S.cargoCap - cargoUsed(s);
    h += `<div class="meta">Трюм: ${cargoUsed(s)}/${S.cargoCap} · Кредиты: ${fmt(s.credits)}</div><table><tr><th>Товар</th><th>Купить</th><th>Продать</th><th>В трюме</th><th></th></tr>`;
    for (const g of D.GOODS) {
      const pr = p.prices[g.id], have = s.cargo[g.id] || 0;
      const rel = pr / g.base;
      const cls = rel < 0.75 ? 'good' : rel > 1.25 ? 'badp' : '';
      h += `<tr><td>${g.name}</td><td class="${cls}">${pr}</td><td class="${rel > 1.25 ? 'good' : ''}">${sellPrice(pr)}</td><td>${have || ''}</td><td>` +
        btn('+1', { type: 'buy', good: g.id, qty: 1 }, !free || s.credits < pr) + btn('+10', { type: 'buy', good: g.id, qty: 10 }, !free || s.credits < pr) + btn('макс', { type: 'buy', good: g.id, qty: 9999 }, !free || s.credits < pr) + ' ' +
        btn('−1', { type: 'sell', good: g.id, qty: 1 }, !have) + btn('всё', { type: 'sell', good: g.id, qty: 9999 }, !have) + '</td></tr>';
    }
    h += '</table><div class="meta" style="margin-top:6px">Зелёным — выгодно. Цены восстанавливаются со временем.</div>';
  } else if (tab === 'yard') {
    for (const slot of ['hull', 'engine', 'tank', 'droid']) {
      const list = D.EQ[slot];
      const cur = s.eq[slot] ? D.byId(list, s.eq[slot]) : null;
      const refund = cur ? Math.floor(cur.price * 0.5) : 0;
      h += `<div class="eq"><h4>${D.EQ_NAMES[slot]}: <span class="cur">${cur ? cur.name : 'нет'}</span></h4>`;
      list.forEach((it, i) => {
        if (i > p.tech || (cur && it.id === cur.id)) return;
        const cost = it.price - refund;
        const desc = slot === 'hull' ? `${it.hp} ед. корпуса, трюм ${it.cargo}, слотов ${it.slots}` : slot === 'engine' ? `скорость ${it.speed}, прыжок ${it.jump} св.л.` : slot === 'tank' ? `${it.fuel} ед. топлива` : `ремонт ${it.rep}/день`;
        h += `<div class="opt"><span>${it.name} <small style="color:var(--dim)">${desc}</small></span>${btn((cost >= 0 ? '' : '+') + fmt(Math.abs(cost)) + ' кр', { type: 'buyEq', slot, id: it.id }, s.credits < cost)}</div>`;
      });
      h += '</div>';
    }
    h += `<div class="eq"><h4>Оружие (${s.weapons.length}/${S.slots} слотов)</h4>`;
    s.weapons.forEach((w, i) => { const W = D.byId(D.WEAPONS, w); h += `<div class="opt"><span class="cur">${W.name} <small>урон ${W.dmg}, дальность ${W.range}</small></span>${btn('Продать +' + fmt(W.price / 2), { type: 'sellW', idx: i })}</div>`; });
    D.WEAPONS.forEach((W, i) => {
      if (i > p.tech) return;
      h += `<div class="opt"><span>${W.name} <small style="color:var(--dim)">урон ${W.dmg}, дальность ${W.range}</small></span>${btn(fmt(W.price) + ' кр', { type: 'buyW', id: W.id }, s.credits < W.price || s.weapons.length >= S.slots)}</div>`;
    });
    h += `</div><div class="meta">Старое оборудование сдаётся за 50%. Выбор ограничен техуровнем планеты.</div>`;
  } else {
    const rc = Math.ceil((S.maxHull - s.hull) * 3), fc = Math.ceil((S.maxFuel - s.fuel) * 12);
    h += `<div class="eq"><div class="opt"><span>Ремонт корпуса ${Math.ceil(s.hull)}/${S.maxHull}</span>${btn(rc ? fmt(rc) + ' кр' : 'цел', { type: 'repair' }, !rc)}</div>`;
    h += `<div class="opt"><span>Заправка ${Math.floor(s.fuel)}/${S.maxFuel}</span>${btn(fc ? fmt(fc) + ' кр' : 'полон', { type: 'refuel' }, !fc)}</div></div>`;
    h += `<p class="meta">Статистика: уничтожено кораблей — ${s.kills}.</p>`;
  }
  h += `<div class="row">${btn('🚀 Взлететь сейчас', { type: 'takeoff' })}</div>`;
  box.innerHTML = h;
}

export function bindPlanet(G) {
  $('planet').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { Audio.ui('click'); G.planetTab = b.dataset.tab; planet(G); return; }
    if (b.dataset.hide) { G.planetHidden = G.st.ships[G.me].landed; planet(G); return; }
    if (b.dataset.act) {
      const act = JSON.parse(b.dataset.act);
      Audio.ui({ buy: 'coin', sell: 'coin', buyW: 'buyEq', sellW: 'coin', repair: 'click', refuel: 'click' }[act.type] || 'click');
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
  if (s.landed) { const p = findPlanet(st, s.landed); return 'на планете ' + (p ? p.name : ''); }
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

const hpBar = (v, max) => {
  const r = Math.max(0, Math.min(1, v / max));
  return `<span class="sbar"><i style="width:${r * 100}%;background:${r < 0.3 ? 'var(--bad)' : r < 0.6 ? 'var(--warn)' : 'var(--acc)'}"></i></span>`;
};

// Returns HTML describing a ship / planet / loot container, or '' if it is not visible to us.
export function describe(G, obj) {
  const st = G.st, me = st.ships[G.me];
  if (!obj || !me || me.jump) return '';
  if (obj.type === 'ship') {
    const s = st.ships[obj.id];
    if (!s || s.sys !== me.sys || s.jump) return '';
    const S = stats(s);
    const [rel, relCol] = RELATION[s.id === G.me ? 'ally' : relation(me, s)];
    let h = `<div class="t" style="color:${hex(s.color)}">${esc(s.name)} <small style="color:var(--dim)">${D.KIND_NAMES[s.kind]}${s.id === G.me ? ' (вы)' : ''}</small>`;
    if (s.id !== G.me) h += ` <small style="color:${relCol}">· ${rel}</small>`;
    h += '</div><div class="d">';
    h += `<div class="hpline">${hpBar(s.hull, S.maxHull)}<span>${Math.ceil(s.hull)}/${S.maxHull}</span></div>`;
    h += `${D.byId(D.HULLS, s.eq.hull).name} · ${D.byId(D.ENGINES, s.eq.engine).name} (скорость ${Math.round(S.speed)})`;
    if (s.eq.droid) h += ` · ${D.byId(D.DROIDS, s.eq.droid).name}`;
    const ws = s.weapons.map(w => D.byId(D.WEAPONS, w));
    h += '<br>Оружие: ' + (ws.length ? ws.map(W => `${W.name} <small>(${W.dmg}/${W.range})</small>`).join(', ') + ` · <b>${ws.reduce((a, W) => a + W.dmg, 0)}</b> урона/день` : 'нет');
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
    let h = `<div class="t">${esc(p.name)} <small style="color:var(--dim)">планета</small></div><div class="d">`;
    h += `${D.RACES.find(r => r.id === p.race).name} · ${D.ECON[p.econ].name} экономика · техуровень ${p.tech + 1}`;
    if (sys.owner === 'dom') h += '<br><span class="badp">Оккупирована доминаторами — посадка невозможна</span>';
    else {
      const rel = D.GOODS.map(g => ({ g, r: p.prices[g.id] / g.base }));
      const cheap = rel.filter(x => x.r < 0.8).sort((a, b) => a.r - b.r).slice(0, 3);
      const dear = rel.filter(x => x.r > 1.2).sort((a, b) => b.r - a.r).slice(0, 3);
      if (cheap.length) h += '<br>Дёшево: ' + cheap.map(x => `<span class="good">${x.g.name} ${p.prices[x.g.id]}</span>`).join(', ');
      if (dear.length) h += '<br>Дорого берут: ' + dear.map(x => `<span class="good">${x.g.name} ${sellPrice(p.prices[x.g.id])}</span>`).join(', ');
      const mine = D.GOODS.filter(g => me.cargo[g.id]).map(g => `${g.name} ${sellPrice(p.prices[g.id])}`);
      if (mine.length) h += '<br>Ваш груз здесь: ' + mine.join(', ');
      const eq = [D.HULLS, D.ENGINES, D.WEAPONS].map(l => l[p.tech].name);
      h += `<br>Верфь: до ${eq.join(', ')}`;
    }
    const landed = Object.values(st.ships).filter(s => s.landed === p.id);
    if (landed.length) h += '<br>На планете: ' + landed.map(s => `<span style="color:${hex(s.color)}">${esc(s.name)}</span>`).join(', ');
    const [px, py] = planetPos(p, st.day);
    if (me.landed !== p.id) h += `<br>Дистанция ${Math.round(dist(px, py, me.x, me.y))}`;
    return h + '</div>';
  }
  if (obj.type === 'loot') {
    const l = st.loot.find(l => l.id === obj.id);
    if (!l) return '';
    const items = Object.entries(l.cargo).map(([g, q]) => q + ' ' + D.byId(D.GOODS, g).name);
    if (l.credits) items.unshift(l.credits + ' кр.');
    const value = l.credits + Object.entries(l.cargo).reduce((a, [g, q]) => a + q * D.byId(D.GOODS, g).base, 0);
    return `<div class="t" style="color:#ffcc44">Контейнер</div><div class="d">${items.join(', ') || 'пусто'}<br>Ценность ≈ ${fmt(value)} кр · исчезнет через ${l.ttl} дн. · дистанция ${Math.round(dist(l.x, l.y, me.x, me.y))}</div>`;
  }
  return '';
}

export function selinfo(G) {
  const box = $('selinfo');
  const st = G.st, sel = G.sel, me = st.ships[G.me];
  let h = describe(G, sel);
  if (!h) { box.hidden = true; if (sel && me && !me.jump) G.sel = null; return; }
  const btn = (label, o) => `<button data-order='${JSON.stringify(o)}'>${label}</button>`;
  let acts = '';
  if (sel.type === 'ship') {
    const s = st.ships[sel.id];
    if (s.id !== G.me && !s.landed) {
      const peaceful = !hostileTo(me, s) && (s.kind === 'trader' || s.kind === 'militia');
      acts = btn(peaceful ? '⚠ Атаковать (розыск!)' : '⚔ Атаковать', { type: 'attack', target: s.id }) + (s.kind === 'citadel' ? '' : btn('Следовать', { type: 'follow', target: s.id }));
    }
  } else if (sel.type === 'planet') { if (me.landed !== sel.id) acts = btn('Сесть', { type: 'land', planet: sel.id }); }
  else if (sel.type === 'loot') acts = btn('Подобрать', { type: 'loot', id: sel.id });
  h += '<div class="btns"><button data-focus="1" title="Навести камеру на объект">🎯 Фокус [G]</button>' + acts + '</div>';
  box.hidden = false;
  box.innerHTML = h;
}

// Hover tooltip that follows the cursor over the 3D view.
export function tooltip(G, hit, x, y) {
  const tip = $('tip');
  const h = hit && hit.type !== 'point' ? describe(G, hit) : '';
  if (!h) { tip.hidden = true; tip.dataset.k = ''; return; }
  if (tip.dataset.k !== h) { tip.dataset.k = h; tip.innerHTML = h; }
  tip.hidden = false;
  const w = tip.offsetWidth, hh = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, x + 18) + 'px';
  tip.style.top = (y + 18 + hh > innerHeight ? y - hh - 12 : y + 18) + 'px';
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
  if (G.mapSel == null) { info.innerHTML = '<span style="color:var(--dim)">Кликните по системе. Зелёный круг — дальность прыжка, жёлтый — хватит топлива.</span>'; return; }
  const sys = st.systems[G.mapSel];
  let h = `<b>${esc(sys.name)}</b> — ${sys.owner === 'dom' ? '<span class="badp">доминаторы</span>' : 'Коалиция'}${sys.cap > 0 ? ' <span style="color:var(--warn)">(под атакой)</span>' : ''}<br><small>Планет: ${sys.planets.length}</small>`;
  if (here && here.id !== sys.id) {
    const d = sysDist(here, sys), cost = jumpCost(d);
    const ok = d <= S.jumpRange && me.fuel >= cost;
    h += `<br>Расстояние ${d.toFixed(1)} · топливо ${cost} · ${jumpDays(d)} дн.<br>`;
    h += ok ? `<button id="jumpbtn" class="primary">Прыжок (в конце хода)</button>` : `<span class="badp">${d > S.jumpRange ? 'Вне дальности двигателя' : 'Не хватает топлива'}</span>`;
    if (me.order && me.order.type === 'jump' && me.order.to === sys.id) h += '<br><span class="good">Курс проложен ✓</span>';
  }
  info.innerHTML = h;
  const jb = $('jumpbtn');
  if (jb) jb.onclick = () => { G.order({ type: 'jump', to: sys.id }); toast('Прыжок в ' + sys.name + ' начнётся после конца хода'); };
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
