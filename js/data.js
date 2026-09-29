// Static game data: goods, economies, equipment and rarity, bosses, stations, names.

export const GOODS = [
  { id: 'food', name: 'Еда', base: 40 },
  { id: 'meds', name: 'Медикаменты', base: 120 },
  { id: 'alco', name: 'Алкоголь', base: 90 },
  { id: 'mins', name: 'Минералы', base: 60 },
  { id: 'tech', name: 'Техника', base: 210 },
  { id: 'lux', name: 'Роскошь', base: 340 },
  { id: 'arms', name: 'Оружие', base: 270 },
  // dropped by dominators; not traded on markets, Ranger Centres take it
  { id: 'proto', name: 'Протоплазма', base: 0, special: true },
];
export const TRADE_GOODS = GOODS.filter(g => !g.special);

export const ECON = {
  agro: { name: 'Аграрная', mult: { food: 0.45, meds: 1.3, alco: 0.75, mins: 1.25, tech: 1.5, lux: 1.15, arms: 1.35 } },
  ind:  { name: 'Промышленная', mult: { food: 1.55, meds: 0.85, alco: 1.25, mins: 1.45, tech: 0.55, lux: 1.0, arms: 0.7 } },
  mine: { name: 'Добывающая', mult: { food: 1.45, meds: 1.25, alco: 1.45, mins: 0.4, tech: 1.25, lux: 1.4, arms: 1.05 } },
  rich: { name: 'Курортная', mult: { food: 1.15, meds: 1.0, alco: 0.65, mins: 1.5, tech: 1.15, lux: 0.5, arms: 1.55 } },
};

export const RACES = [
  { id: 'terr', name: 'Терране' },
  { id: 'krog', name: 'Кроги' },
  { id: 'veil', name: 'Вейлы' },
  { id: 'syth', name: 'Ситхары' },
  { id: 'omni', name: 'Омнийцы' },
];

// ---------------------------------------------------------------- rarity
// Any piece of equipment can come in a better grade: its main stats and price go up.
// Exotic items are unique named things from bosses, with their own stats and a special ability.
export const RARITY = [
  { name: 'Обычное', col: '#9aa7b8', mult: 1, price: 1 },
  { name: 'Улучшенное', col: '#5fd17a', mult: 1.1, price: 1.5 },
  { name: 'Редкое', col: '#4aa8ff', mult: 1.22, price: 2.2 },
  { name: 'Эпическое', col: '#c07bff', mult: 1.36, price: 3.4 },
  { name: 'Легендарное', col: '#ffb040', mult: 1.55, price: 5.5 },
  { name: 'Экзотическое', col: '#ff4fd8', mult: 1, price: 1 },
];
export const EXOTIC = 5;

// ---------------------------------------------------------------- equipment
// tier = tech level needed to buy it (0..4, exotics 5). size = cargo units while it lies in the hold.
// shop: false — never sold at planets. npc — monster weapons, never dropped.

export const HULLS = [
  { id: 'h1', name: 'Скаут', tier: 0, hp: 110, armor: 0, cargo: 40, slots: 1, mods: 1, model: 'scout', price: 0, size: 3 },
  { id: 'h2', name: 'Курьер', tier: 1, hp: 180, armor: 1, cargo: 70, slots: 2, mods: 1, model: 'courier', price: 5000, size: 3 },
  { id: 'h6', name: 'Тягач', tier: 1, hp: 210, armor: 1, cargo: 150, slots: 1, mods: 1, spd: 0.85, model: 'hauler', price: 6500, size: 3 },
  { id: 'h3', name: 'Рейнджер', tier: 2, hp: 280, armor: 2, cargo: 100, slots: 3, mods: 2, model: 'ranger', price: 14000, size: 3 },
  { id: 'h7', name: 'Штурмовик', tier: 2, hp: 330, armor: 3, cargo: 60, slots: 3, mods: 2, spd: 0.95, model: 'assault', price: 17000, size: 3 },
  { id: 'h4', name: 'Корвет', tier: 3, hp: 440, armor: 3, cargo: 140, slots: 4, mods: 3, model: 'corvette', price: 32000, size: 3 },
  { id: 'h8', name: 'Караван', tier: 3, hp: 470, armor: 3, cargo: 320, slots: 2, mods: 2, spd: 0.85, model: 'caravan', price: 30000, size: 3 },
  { id: 'h5', name: 'Крейсер', tier: 4, hp: 680, armor: 4, cargo: 200, slots: 5, mods: 3, model: 'cruiser', price: 70000, size: 3 },
  { id: 'h9', name: 'Линкор', tier: 4, hp: 820, armor: 5, cargo: 160, slots: 5, mods: 4, spd: 0.88, model: 'battleship', price: 95000, size: 3, shop: false },
  { id: 'hx1', name: 'Немезида', tier: 5, rarity: 5, hp: 1150, armor: 8, cargo: 220, slots: 6, mods: 5, spd: 0.95, model: 'nemesis', price: 240000, size: 4, shop: false, from: 'nemesis', desc: 'корпус древнего дредноута: 6 оружейных и 5 модульных слотов' },
];
export const ENGINES = [
  { id: 'e1', name: 'Ионный', tier: 0, speed: 320, jump: 20, price: 0, size: 8 },
  { id: 'e2', name: 'Плазменный', tier: 1, speed: 400, jump: 25, price: 3500, size: 10 },
  { id: 'e3', name: 'Фотонный', tier: 2, speed: 480, jump: 30, price: 10000, size: 12 },
  { id: 'e6', name: 'Форсажный', tier: 2, speed: 545, jump: 24, price: 11000, size: 12 },
  { id: 'e4', name: 'Варп-3', tier: 3, speed: 570, jump: 36, price: 24000, size: 14 },
  { id: 'e7', name: 'Дальнобой', tier: 3, speed: 500, jump: 46, price: 26000, size: 14 },
  { id: 'e5', name: 'Сингулярный', tier: 4, speed: 680, jump: 44, price: 50000, size: 16 },
  { id: 'ex1', name: 'Кротовая нора', tier: 5, rarity: 5, speed: 780, jump: 70, price: 180000, size: 16, shop: false, from: 'leviathan', desc: 'прокалывает пространство: прыжок на 70 св.л.' },
];
export const TANKS = [
  { id: 't1', name: 'Бак 25', tier: 0, fuel: 25, price: 0, size: 4 },
  { id: 't2', name: 'Бак 40', tier: 1, fuel: 40, price: 2000, size: 5 },
  { id: 't3', name: 'Бак 60', tier: 2, fuel: 60, price: 6000, size: 6 },
  { id: 't4', name: 'Бак 85', tier: 3, fuel: 85, price: 14000, size: 8 },
  { id: 't5', name: 'Бак 120', tier: 4, fuel: 120, price: 30000, size: 10 },
];
export const DROIDS = [
  { id: 'd1', name: 'Дроид М1', tier: 0, rep: 6, price: 2500, size: 3 },
  { id: 'd2', name: 'Дроид М2', tier: 1, rep: 12, price: 7000, size: 4 },
  { id: 'd3', name: 'Дроид М3', tier: 2, rep: 22, price: 16000, size: 5 },
  { id: 'd4', name: 'Дроид М4', tier: 3, rep: 35, price: 32000, size: 6 },
  { id: 'd5', name: 'Нанофабрика', tier: 4, rep: 55, price: 60000, size: 8 },
  { id: 'dx1', name: 'Рой наноботов', tier: 5, rarity: 5, rep: 110, price: 170000, size: 6, shop: false, from: 'hive', desc: 'колония наноботов из улья: латает корпус прямо в бою' },
];
// style: how the shot looks; snd: its sound; fx: special effect
export const WEAPONS = [
  { id: 'w1', name: 'Лазер', tier: 0, dmg: 16, range: 260, shots: 4, style: 'beam', snd: 'laser', color: 0xff4444, price: 1500, size: 4 },
  { id: 'w6', name: 'Пулемёт «Шквал»', tier: 0, dmg: 18, range: 200, shots: 6, style: 'mg', snd: 'mg', color: 0xffdd66, price: 1800, size: 4 },
  { id: 'w2', name: 'Осколочник', tier: 1, dmg: 24, range: 210, shots: 3, style: 'tracer', snd: 'frag', color: 0xffaa33, price: 4500, size: 6 },
  { id: 'w7', name: 'Ионный излучатель', tier: 1, dmg: 20, range: 280, shots: 3, style: 'ion', snd: 'ion', color: 0x66aaff, fx: 'ion', price: 5000, size: 6, desc: 'урон по щитам ×2,5' },
  { id: 'w3', name: 'Плазмомёт', tier: 2, dmg: 34, range: 290, shots: 2, style: 'proj', snd: 'plasma', color: 0x44ffcc, price: 11000, size: 8 },
  { id: 'w8', name: 'Рельсотрон', tier: 2, dmg: 32, range: 430, shots: 1, style: 'rail', snd: 'rail', color: 0xe0f4ff, fx: 'rail', price: 12500, size: 8, desc: 'почти не замечает брони' },
  { id: 'w4', name: 'Ракетница', tier: 3, dmg: 46, range: 390, shots: 2, style: 'missile', snd: 'missile', color: 0xffee66, price: 22000, size: 10 },
  { id: 'w9', name: 'Торпедный аппарат', tier: 3, dmg: 56, range: 340, shots: 1, style: 'torp', snd: 'torp', color: 0xff8844, fx: 'splash', price: 25000, size: 10, desc: 'взрыв задевает врагов рядом с целью' },
  { id: 'w5', name: 'Аннигилятор', tier: 4, dmg: 64, range: 330, shots: 1, style: 'anni', snd: 'anni', color: 0xcc66ff, price: 45000, size: 12 },
  { id: 'w10', name: 'Фотонная пушка', tier: 4, dmg: 60, range: 300, shots: 5, style: 'pulse', snd: 'photon', color: 0x88ffff, price: 42000, size: 12 },
  // exotics
  { id: 'wx1', name: 'Щупальце Кракена', tier: 5, rarity: 5, dmg: 100, range: 330, shots: 4, style: 'tentacle', snd: 'tentacle', color: 0xff5aa0, fx: 'drain', price: 150000, size: 10, shop: false, from: 'kraken', desc: 'высасывает жизнь: 30% нанесённого урона чинят ваш корпус' },
  { id: 'wx2', name: 'Жало Матки', tier: 5, rarity: 5, dmg: 108, range: 270, shots: 8, style: 'swarm', snd: 'swarm', color: 0xaaff44, fx: 'pierce', price: 150000, size: 10, shop: false, from: 'hive', desc: 'иглы проходят сквозь любые щиты' },
  { id: 'wx3', name: 'Искра Сверхновой', tier: 5, rarity: 5, dmg: 124, range: 380, shots: 2, style: 'nova', snd: 'nova', color: 0xffcc55, fx: 'splash', price: 170000, size: 12, shop: false, from: 'citadel', desc: 'взрыв накрывает всех врагов рядом с целью' },
  // monsters' own weapons, never dropped
  { id: 'wb1', name: 'Щупальца', tier: 5, dmg: 84, range: 330, shots: 6, style: 'tentacle', snd: 'tentacle', color: 0xff5aa0, fx: 'slow', npc: true, price: 0, size: 0 },
  { id: 'wb2', name: 'Кислотный плевок', tier: 5, dmg: 50, range: 300, shots: 3, style: 'acid', snd: 'spit', color: 0x9aff3a, npc: true, price: 0, size: 0 },
  { id: 'wb3', name: 'Главный калибр', tier: 5, dmg: 90, range: 560, shots: 1, style: 'rail', snd: 'rail', color: 0xff6040, fx: 'rail', npc: true, price: 0, size: 0 },
  { id: 'wb4', name: 'Зенитный пояс', tier: 5, dmg: 55, range: 260, shots: 5, style: 'mg', snd: 'mg', color: 0xff9955, npc: true, price: 0, size: 0 },
  { id: 'wb5', name: 'Резонанс', tier: 5, dmg: 70, range: 450, shots: 3, style: 'wave', snd: 'res', color: 0x9fe8ff, fx: 'chain', npc: true, price: 0, size: 0 },
  { id: 'wb6', name: 'Жвала', tier: 1, dmg: 14, range: 180, shots: 4, style: 'mg', snd: 'mg', color: 0xaaff44, npc: true, price: 0, size: 0 },
];

// Modules: extra systems in the hull's module slots, one of each type.
export const MOD_TYPES = {
  shield: { name: 'Щит', desc: 'поглощает урон и восстанавливается вне боя' },
  armor: { name: 'Броня', desc: 'срезает урон каждого попадания' },
  aim: { name: 'Прицел', desc: 'усиливает всё оружие' },
  boost: { name: 'Форсаж', desc: 'прибавляет скорость' },
  cargo: { name: 'Грузовой отсек', desc: 'расширяет трюм' },
  ecm: { name: 'РЭБ', desc: 'шанс увернуться от выстрела' },
  heart: { name: 'Сердце', desc: 'живая ткань корпуса' },
};
const modLine = (mtype, prefix, names, vals, prices, sizes) => names.map((name, i) => ({ id: prefix + (i + 1), name, tier: i, mtype, ...vals[i], price: prices[i], size: sizes[i] }));
export const MODULES = [
  ...modLine('shield', 'ms', ['Щит «Кокон»', 'Щит «Заслон»', 'Щит «Бастион»', 'Щит «Эгида»', 'Щит «Цитадель»'],
    [{ shield: 40, regen: 30 }, { shield: 80, regen: 50 }, { shield: 130, regen: 75 }, { shield: 200, regen: 110 }, { shield: 300, regen: 160 }],
    [2500, 6000, 14000, 28000, 55000], [3, 4, 5, 6, 8]),
  ...modLine('armor', 'ma', ['Бронепластины', 'Композитная броня', 'Керамитовая броня', 'Нейтрониевая броня', 'Броня «Монолит»'],
    [{ armor: 1 }, { armor: 2 }, { armor: 3 }, { armor: 4 }, { armor: 6 }], [1500, 4000, 10000, 22000, 45000], [5, 6, 8, 10, 12]),
  ...modLine('aim', 'mt', ['Прицел «Сокол»', 'Баллистический вычислитель', 'Боевой ИИ «Ястреб»', 'Боевой ИИ «Оракул»', 'Квантовый прицел'],
    [{ dmgPct: 8 }, { dmgPct: 12 }, { dmgPct: 17 }, { dmgPct: 23 }, { dmgPct: 30 }], [2000, 5000, 12000, 26000, 50000], [2, 2, 3, 3, 4]),
  ...modLine('boost', 'mf', ['Форсаж-1', 'Форсаж-2', 'Форсаж-3', 'Гиперфорсаж', 'Форсаж «Комета»'],
    [{ speedPct: 8 }, { speedPct: 12 }, { speedPct: 16 }, { speedPct: 21 }, { speedPct: 27 }], [1500, 4000, 9000, 20000, 40000], [3, 4, 5, 6, 7]),
  ...modLine('cargo', 'mc', ['Грузовой отсек S', 'Грузовой отсек M', 'Грузовой отсек L', 'Грузовой отсек XL', 'Гипертрюм'],
    [{ cargo: 15 }, { cargo: 30 }, { cargo: 50 }, { cargo: 75 }, { cargo: 110 }], [1000, 3000, 7000, 15000, 30000], [4, 6, 8, 10, 12]),
  ...modLine('ecm', 'me', ['РЭБ «Помеха»', 'РЭБ «Туман»', 'РЭБ «Мираж»', 'РЭБ «Фантом»', 'РЭБ «Призрак»'],
    [{ evade: 5 }, { evade: 8 }, { evade: 11 }, { evade: 14 }, { evade: 18 }], [2500, 6000, 13000, 27000, 52000], [2, 3, 3, 4, 5]),
  // exotics
  { id: 'mx1', name: 'Сердце Левиафана', tier: 5, rarity: 5, mtype: 'heart', hullPct: 30, rep: 40, price: 190000, size: 6, shop: false, from: 'leviathan', desc: 'живой кристалл: +30% к корпусу и +40 ремонта в день' },
  { id: 'mx2', name: 'Фазовый кокон', tier: 5, rarity: 5, mtype: 'shield', shield: 380, regen: 300, price: 180000, size: 6, shop: false, from: 'nemesis', desc: 'щит дредноута, мгновенно восстанавливается после боя' },
  { id: 'mx3', name: 'Око Бездны', tier: 5, rarity: 5, mtype: 'aim', dmgPct: 35, rangePct: 15, price: 175000, size: 4, shop: false, from: 'citadel', desc: 'видит слабые места: +35% урона и +15% дальности' },
  { id: 'mx4', name: 'Чернильный мешок', tier: 5, rarity: 5, mtype: 'ecm', evade: 28, speedPct: 10, price: 160000, size: 5, shop: false, from: 'kraken', desc: 'облако чернил: 28% выстрелов уходят мимо, +10% скорости' },
];

export const EQ = { hull: HULLS, engine: ENGINES, tank: TANKS, droid: DROIDS, weapon: WEAPONS, module: MODULES };
export const EQ_NAMES = { hull: 'Корпус', engine: 'Двигатель', tank: 'Топливный бак', droid: 'Ремдроид', weapon: 'Оружие', module: 'Модуль' };
export const ITEM_KIND_NAMES = EQ_NAMES;

export const byId = (list, id) => list.find(x => x.id === id);

const BASE = new Map(); // base id -> [kind, def]
for (const kind in EQ) for (const d of EQ[kind]) BASE.set(d.id, [kind, d]);

// a better grade of a base item: main stats scaled by the rarity
function derive(kind, b, r) {
  const m = RARITY[r].mult;
  const d = { ...b, id: b.id + '~' + r, rarity: r, price: Math.round((b.price || 1200) * RARITY[r].price) };
  const sc = k => { if (b[k]) d[k] = Math.round(b[k] * m); };
  switch (kind) {
    case 'weapon': sc('dmg'); d.range = Math.round(b.range * (1 + (m - 1) * 0.3)); break;
    case 'hull': sc('hp'); d.armor = b.armor + r; d.cargo = Math.round(b.cargo * (1 + (m - 1) * 0.5)); break;
    case 'engine': d.speed = Math.round(b.speed * (1 + (m - 1) * 0.5)); d.jump = b.jump + r * 2; break;
    case 'tank': sc('fuel'); break;
    case 'droid': sc('rep'); break;
    case 'module': for (const k of ['shield', 'regen', 'dmgPct', 'speedPct', 'cargo', 'evade']) sc(k); if (b.armor) d.armor = b.armor + r; break;
  }
  return d;
}

// Equipment ids are the base id plus an optional grade: 'w3' (common), 'w3~2' (rare).
// itemDef returns { kind, tier, rarity, list, def } with the stats of that grade (cached).
const DEFS = new Map();
export function itemDef(id) {
  if (id == null) return null;
  let v = DEFS.get(id);
  if (v !== undefined) return v;
  const [base, rs] = String(id).split('~');
  const e = BASE.get(base);
  const r = e ? (e[1].rarity || Math.max(0, Math.min(4, +rs || 0))) : 0;
  v = e ? { kind: e[0], list: EQ[e[0]], tier: e[1].tier, rarity: r, def: r && !e[1].rarity ? derive(e[0], e[1], r) : e[1] } : null;
  DEFS.set(id, v);
  return v;
}
export const eqDef = id => { const d = itemDef(id); return d && d.def; };
export const itemSell = (id, k = 0.5) => Math.floor(itemDef(id).def.price * k);
export const baseId = id => String(id).split('~')[0];
export const withRarity = (id, r) => (r > 0 ? baseId(id) + '~' + r : baseId(id));

// what a planet shipyard of this tech level sells
export const shopItems = (kind, maxTier, minTier = 0) => EQ[kind].filter(d => d.shop !== false && !d.npc && !d.rarity && d.tier <= maxTier && d.tier >= minTier);

// Rarity rolls. luck 0: ordinary ships' gear; 1: elites and station stock; 2: boss loot; 3: Ranger Centre stock.
const RARITY_ODDS = [[78, 17, 4.5, 0.5, 0], [20, 40, 28, 10, 2], [0, 0, 25, 50, 25], [0, 0, 45, 40, 15]];
export function rollRarity(luck = 0, rand = Math.random) {
  let x = rand() * 100;
  const odds = RARITY_ODDS[luck];
  for (let r = 0; r < odds.length; r++) { if ((x -= odds[r]) < 0) return r; }
  return 0;
}
// a random droppable item around a tech tier
export function randomItem(tier, luck = 0, rand = Math.random, kinds = ['weapon', 'weapon', 'weapon', 'module', 'module', 'engine', 'droid', 'tank', 'hull']) {
  const kind = kinds[Math.floor(rand() * kinds.length)];
  const t = Math.max(0, Math.min(4, tier));
  let pool = shopItems(kind, t, Math.max(0, t - 1)).filter(d => d.price > 0);
  if (!pool.length) pool = EQ[kind].filter(d => !d.npc && !d.rarity && d.price > 0 && d.tier <= 4);
  return withRarity(pool[Math.floor(rand() * pool.length)].id, rollRarity(luck, rand));
}

// ---------------------------------------------------------------- bosses
// Wandering monsters: much stronger than anything else, always drop one of their exotics.
export const BOSSES = {
  kraken: { name: 'Космический Кракен', hp: 3400, armor: 3, speed: 300, weapons: ['wb1', 'wb1'], color: 0xff5aa0, exotics: ['wx1', 'mx4'], bounty: 9000, desc: 'гигантский спрут: хватает корабли щупальцами и замедляет их' },
  hive: { name: 'Матка Роя', hp: 2400, armor: 2, speed: 240, weapons: ['wb2', 'wb2'], color: 0x9aff3a, exotics: ['wx2', 'dx1'], bounty: 8000, desc: 'живой улей: каждые пару дней выпускает трутней' },
  nemesis: { name: 'Дредноут «Немезида»', hp: 2800, armor: 9, shield: 500, regen: 260, speed: 220, weapons: ['wb3', 'wb4'], color: 0xff6040, exotics: ['hx1', 'mx2'], bounty: 10000, desc: 'древний дредноут под управлением обезумевшего ИИ: тяжёлая броня и щит — слабое оружие бесполезно' },
  leviathan: { name: 'Кристальный Левиафан', hp: 4000, armor: 5, speed: 200, weapons: ['wb5'], color: 0x9fe8ff, exotics: ['mx1', 'ex1'], bounty: 9000, neutral: true, desc: 'мирный исполин из живого кристалла — пока его не тронуть. Резонанс бьёт всех обидчиков сразу' },
  swarm: { name: 'Трутень', hp: 60, armor: 0, speed: 520, weapons: ['wb6'], color: 0x9aff3a, minion: true },
};
export const BOSS_KEYS = ['kraken', 'hive', 'nemesis', 'leviathan'];

// ---------------------------------------------------------------- stations
export const STATIONS = {
  ranger: { name: 'Рейнджерский центр', col: 0x4cff9a, desc: 'меняет протоплазму доминаторов на редкое снаряжение' },
  military: { name: 'Военная база', col: 0x4aa8ff, desc: 'контракты на пиратов, доминаторов и чудовищ, военный арсенал' },
  science: { name: 'Научная станция', col: 0x88ffff, desc: 'улучшает снаряжение до более высокой редкости, продаёт модули' },
  pirate: { name: 'Пиратская база', col: 0xff4a4a, desc: 'чёрный рынок, скупка краденого, амнистия; принимает разыскиваемых' },
  medical: { name: 'Медицинский центр', col: 0xff7ab8, desc: 'стимуляторы и процедуры на несколько дней' },
  business: { name: 'Бизнес-центр', col: 0xffd070, desc: 'вклады под процент и кредиты' },
};
export const STATION_NAMES = ['Альфа', 'Бета', 'Гамма', 'Дельта', 'Сигма', 'Омега', 'Вектор', 'Зенит', 'Орбита', 'Рубеж', 'Аврора', 'Полюс', 'Кварц', 'Горизонт'];
export const BUFFS = {
  dmg: { name: 'Боевой стимулятор', desc: '+20% к урону', price: 3000 },
  spd: { name: 'Нейроускоритель', desc: '+15% к скорости', price: 2500 },
  rep: { name: 'Регенерационная терапия', desc: '+15 ремонта корпуса в день', price: 2000 },
  hull: { name: 'Нанопокров', desc: '+15% к прочности корпуса', price: 3500 },
};
export const BUFF_DAYS = 12;
export const PROTO_PRICE = 250; // what a Ranger Centre pays for a unit of protoplasm

export const SYSTEM_NAMES = ['Альдебар', 'Вега-Прим', 'Кассиопа', 'Дзета Рыб', 'Эридан', 'Фомальгаут', 'Гелиос', 'Икар', 'Ксандр', 'Лира', 'Мирах', 'Нова Терра', 'Орион-5', 'Процион', 'Ригель', 'Сирин', 'Тау Кита', 'Ураний', 'Фарос', 'Хадар', 'Церера', 'Шедар'];
export const PLANET_PARTS_A = ['Ар', 'Бел', 'Вир', 'Гал', 'Дор', 'Ел', 'Жан', 'Зор', 'Ил', 'Кар', 'Лум', 'Мер', 'Нор', 'Ос', 'Пир', 'Рен', 'Сол', 'Тал', 'Ур', 'Фен', 'Хар', 'Цен'];
export const PLANET_PARTS_B = ['ада', 'ион', 'ея', 'ус', 'ара', 'он', 'ита', 'акс', 'ен', 'ория', 'ис', 'ум'];
export const PIRATE_NAMES = ['Кривой Джо', 'Чёрный Рей', 'Мясник', 'Шрам', 'Гадюка', 'Барон Кид', 'Рыжая Мэг', 'Косой', 'Штырь', 'Бешеный Пёс', 'Хромой Ли', 'Сизый', 'Зуб', 'Вдова'];
export const TRADER_NAMES = ['Караван', 'Грузовоз', 'Транспорт', 'Торговец', 'Баржа'];
export const DOM_NAMES = ['Эгемон', 'Блазер', 'Келлер', 'Терон', 'Ирвин', 'Мегалон'];

export const PLANET_COLORS = [0x6a9bd8, 0xc98a4b, 0x7cc46b, 0xd6c07a, 0xb05a4a, 0x9a7bd1, 0x5fc3b8, 0xd38fb0, 0x8a8f99];
export const STAR_COLORS = [0xfff1c4, 0xffd27a, 0xffa15c, 0xbcd4ff, 0xff7a5c, 0xffffff];

export const KIND_COLORS = {
  trader: 0xe8d36a,
  pirate: 0xff4a4a,
  militia: 0x4aa8ff,
  dom: 0xc05cff,
  citadel: 0xa040ff,
  boss: 0xff3060,
  swarm: 0x9aff3a,
};
export const KIND_NAMES = {
  player: 'Рейнджер', trader: 'Торговец', pirate: 'Пират', militia: 'Военный', dom: 'Доминатор', citadel: 'Цитадель доминаторов', boss: 'Чудовище', swarm: 'Трутень',
};
export const PIRATE_RANKS = { jackal: 'шакал', raider: 'налётчик', elite: 'главарь' };
