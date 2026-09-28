// DOM user interface: HUD, planet screens, selection, log, galaxy map.
import * as D from './data.js';
import { stats, cargoUsed, sysDist, jumpCost, jumpDays, findPlanet, sellPrice, hostileTo, dist } from './sim.js';

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
    h += `<div class="p ${p.online ? '' : 'off'}"><span class="dot" style="background:${hex(p.color)}"></span>${esc(p.name)}${pid === G.me ? ' (вы)' : ''}<span class="st ${rd ? 'ok' : ''}" title="${esc(loc)}">${!p.online ? 'offline' : rd ? (p.ready ? '✔ готов' : '⟳ авто') : 'думает…'}</span></div>`;
  }
  $('players').innerHTML = h;
  const me = st.players[G.me];
  const bt = $('endturn');
  bt.classList.toggle('ready', !!(me && me.ready));
  bt.textContent = me && me.ready ? 'Ждём остальных… (отмена)' : 'Конец хода [Пробел]';
  $('auto').checked = !!(me && me.auto);
}

export function turnInfo(G, animating) {
  let t = '';
  if (animating) t = 'Идёт ход…';
  else if (G.timerEnd) t = 'Авто-ход через ' + Math.max(0, Math.ceil((G.timerEnd - performance.now()) / 1000)) + ' с';
  $('turninfo').textContent = t;
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

// ---------------------------------------------------------------- planet

export function planet(G) {
  const st = G.st, s = st.ships[G.me];
  const box = $('planet');
  if (!s || !s.landed || G.planetHidden === s.landed) { box.hidden = true; return; }
  const p = findPlanet(st, s.landed);
  const sys = st.systems[p.sys];
  const S = stats(s);
  box.hidden = false;
  const tab = G.planetTab || 'market';
  const btn = (label, a, dis) => `<button data-act='${JSON.stringify(a)}' ${dis ? 'disabled' : ''}>${label}</button>`;
  let h = `<h2>${esc(p.name)}</h2><div class="meta">${D.RACES.find(r => r.id === p.race).name} · ${D.ECON[p.econ].name} экономика · техуровень ${p.tech + 1}${sys.owner === 'dom' ? ' · <span class="badp">ОККУПИРОВАНА</span>' : ''}</div>`;
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
  h += `<div class="row">${btn('🚀 Взлететь сейчас', { type: 'takeoff' })}<button data-hide="1">Скрыть панель</button></div>`;
  box.innerHTML = h;
}

export function bindPlanet(G) {
  $('planet').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { G.planetTab = b.dataset.tab; planet(G); return; }
    if (b.dataset.hide) { G.planetHidden = G.st.ships[G.me].landed; planet(G); return; }
    if (b.dataset.act) G.send({ t: 'act', a: JSON.parse(b.dataset.act) });
  });
}

// ---------------------------------------------------------------- selection

export function selinfo(G) {
  const box = $('selinfo');
  const st = G.st, sel = G.sel, me = st.ships[G.me];
  if (!sel || !me || me.jump) { box.hidden = true; return; }
  let h = '';
  const btn = (label, o) => `<button data-order='${JSON.stringify(o)}'>${label}</button>`;
  if (sel.type === 'ship') {
    const s = st.ships[sel.id];
    if (!s || s.sys !== me.sys || s.jump) { box.hidden = true; G.sel = null; return; }
    const S = stats(s);
    const d = Math.round(dist(s.x, s.y, me.x, me.y));
    h = `<div class="t" style="color:${hex(s.color)}">${esc(s.name)} <small style="color:var(--dim)">${D.KIND_NAMES[s.kind]}${s.id === G.me ? ' (вы)' : ''}</small></div>`;
    h += `<div class="d">Корпус ${Math.ceil(s.hull)}/${S.maxHull} · ${D.byId(D.HULLS, s.eq.hull).name} · скорость ${Math.round(S.speed)}<br>Оружие: ${s.weapons.map(w => D.byId(D.WEAPONS, w).name).join(', ') || 'нет'} · дистанция ${d}${s.landed ? ' · на планете' : ''}${s.wanted > 0 ? ' · <span class="badp">в розыске</span>' : ''}</div>`;
    if (s.id !== G.me && !s.landed) {
      const peaceful = !hostileTo(me, s) && (s.kind === 'trader' || s.kind === 'militia');
      h += '<div class="btns">' + btn(peaceful ? '⚠ Атаковать (розыск!)' : '⚔ Атаковать', { type: 'attack', target: s.id }) + btn('Следовать', { type: 'follow', target: s.id }) + '</div>';
    }
  } else if (sel.type === 'planet') {
    const p = findPlanet(st, sel.id);
    if (!p || p.sys !== me.sys) { box.hidden = true; G.sel = null; return; }
    h = `<div class="t">${esc(p.name)}</div><div class="d">${D.RACES.find(r => r.id === p.race).name} · ${D.ECON[p.econ].name} · техуровень ${p.tech + 1}</div>`;
    h += '<div class="btns">' + btn('Сесть', { type: 'land', planet: p.id }) + '</div>';
  } else if (sel.type === 'loot') {
    const l = st.loot.find(l => l.id === sel.id);
    if (!l) { box.hidden = true; G.sel = null; return; }
    const items = Object.entries(l.cargo).map(([g, q]) => q + ' ' + D.byId(D.GOODS, g).name);
    if (l.credits) items.unshift(l.credits + ' кр.');
    h = `<div class="t">Контейнер</div><div class="d">${items.join(', ')} · исчезнет через ${l.ttl} дн.</div><div class="btns">${btn('Подобрать', { type: 'loot', id: l.id })}</div>`;
  }
  box.hidden = !h;
  box.innerHTML = h;
}

export function bindSel(G) {
  $('selinfo').addEventListener('click', e => {
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
