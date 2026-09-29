// Static game data: goods, economies, equipment, names.

export const GOODS = [
  { id: 'food', name: 'Еда', base: 40 },
  { id: 'meds', name: 'Медикаменты', base: 120 },
  { id: 'alco', name: 'Алкоголь', base: 90 },
  { id: 'mins', name: 'Минералы', base: 60 },
  { id: 'tech', name: 'Техника', base: 210 },
  { id: 'lux', name: 'Роскошь', base: 340 },
  { id: 'arms', name: 'Оружие', base: 270 },
];

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

// Equipment tiers. Index = tech level required (0..4).
export const HULLS = [
  { id: 'h1', name: 'Скаут', hp: 110, cargo: 40, slots: 1, price: 0 },
  { id: 'h2', name: 'Курьер', hp: 180, cargo: 70, slots: 2, price: 5000 },
  { id: 'h3', name: 'Рейнджер', hp: 280, cargo: 100, slots: 3, price: 14000 },
  { id: 'h4', name: 'Корвет', hp: 440, cargo: 140, slots: 4, price: 32000 },
  { id: 'h5', name: 'Крейсер', hp: 680, cargo: 200, slots: 5, price: 70000 },
];
export const ENGINES = [
  { id: 'e1', name: 'Ионный', speed: 320, jump: 20, price: 0 },
  { id: 'e2', name: 'Плазменный', speed: 400, jump: 25, price: 3500 },
  { id: 'e3', name: 'Фотонный', speed: 480, jump: 30, price: 10000 },
  { id: 'e4', name: 'Варп-3', speed: 570, jump: 36, price: 24000 },
  { id: 'e5', name: 'Сингулярный', speed: 680, jump: 44, price: 50000 },
];
export const TANKS = [
  { id: 't1', name: 'Бак 25', fuel: 25, price: 0 },
  { id: 't2', name: 'Бак 40', fuel: 40, price: 2000 },
  { id: 't3', name: 'Бак 60', fuel: 60, price: 6000 },
  { id: 't4', name: 'Бак 85', fuel: 85, price: 14000 },
  { id: 't5', name: 'Бак 120', fuel: 120, price: 30000 },
];
export const DROIDS = [
  { id: 'd1', name: 'Дроид М1', rep: 6, price: 2500 },
  { id: 'd2', name: 'Дроид М2', rep: 12, price: 7000 },
  { id: 'd3', name: 'Дроид М3', rep: 22, price: 16000 },
  { id: 'd4', name: 'Дроид М4', rep: 35, price: 32000 },
  { id: 'd5', name: 'Нанофабрика', rep: 55, price: 60000 },
];
export const WEAPONS = [
  { id: 'w1', name: 'Лазер', dmg: 16, range: 260, shots: 4, price: 1500, color: 0xff4444 },
  { id: 'w2', name: 'Осколочник', dmg: 24, range: 210, shots: 3, price: 4500, color: 0xffaa33 },
  { id: 'w3', name: 'Плазмомёт', dmg: 34, range: 290, shots: 2, price: 11000, color: 0x44ffcc },
  { id: 'w4', name: 'Ракетница', dmg: 46, range: 390, shots: 2, price: 22000, color: 0xffee66 },
  { id: 'w5', name: 'Аннигилятор', dmg: 64, range: 330, shots: 1, price: 45000, color: 0xcc66ff },
];

export const EQ = { hull: HULLS, engine: ENGINES, tank: TANKS, droid: DROIDS };
export const EQ_NAMES = { hull: 'Корпус', engine: 'Двигатель', tank: 'Топливный бак', droid: 'Ремдроид' };

export const byId = (list, id) => list.find(x => x.id === id);
export const tierOf = (list, id) => list.findIndex(x => x.id === id);

export const SYSTEM_NAMES = ['Альдебар', 'Вега-Прим', 'Кассиопа', 'Дзета Рыб', 'Эридан', 'Фомальгаут', 'Гелиос', 'Икар', 'Ксандр', 'Лира', 'Мирах', 'Нова Терра', 'Орион-5', 'Процион', 'Ригель', 'Сирин', 'Тау Кита', 'Ураний', 'Фарос', 'Хадар', 'Церера', 'Шедар'];
export const PLANET_PARTS_A = ['Ар', 'Бел', 'Вир', 'Гал', 'Дор', 'Ел', 'Жан', 'Зор', 'Ил', 'Кар', 'Лум', 'Мер', 'Нор', 'Ос', 'Пир', 'Рен', 'Сол', 'Тал', 'Ур', 'Фен', 'Хар', 'Цен'];
export const PLANET_PARTS_B = ['ада', 'ион', 'ея', 'ус', 'ара', 'он', 'ита', 'акс', 'ен', 'ория', 'ис', 'ум'];
export const PIRATE_NAMES = ['Кривой Джо', 'Чёрный Рей', 'Мясник', 'Шрам', 'Гадюка', 'Барон Кид', 'Рыжая Мэг', 'Косой', 'Штырь', 'Бешеный Пёс'];
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
};
export const KIND_NAMES = {
  player: 'Рейнджер', trader: 'Торговец', pirate: 'Пират', militia: 'Военный', dom: 'Доминатор', citadel: 'Цитадель доминаторов',
};
