/* =====================================================================
   LUMEN — Survivors  ::  CONFIG
   Единственный источник правды по балансу и кривым.
   Тюнинг происходит ТОЛЬКО здесь — никакие магические числа в логике.
   ===================================================================== */

const CONFIG = {
  // ---- Мир / сессия ----
  runDuration: 600,          // секунд до победы (10:00)
  bossTimes: [300, 570],     // боссы: Жнец на 5:00, Затмение на 9:30 (за 30с до победы)

  // ---- Палитра: тёплое пламя игрока против холодной ночи ----
  colors: {
    bg:        '#03040a',
    grid:      'rgba(60, 90, 160, 0.08)',
    gridBold:  'rgba(70, 110, 200, 0.16)',
    player:    '#ffce5e',     // тёплый огонёк-свет
    playerCore:'#fffdf0',
    xp:        '#ffdca0',     // тёплые мотыльки-очаги света
    xpBig:     '#ffd24a',
    gold:      '#ffd24a',
    hp:        '#ff4d6d',
    hpBack:    'rgba(255,77,109,0.18)',
    xpbar:     '#ffce5e',
    text:      '#e6ecff',
    textDim:   '#7f8db0',
    boss:      '#ff5bd0',
    danger:    '#ff4d6d',
    dark:      '#03040a',     // цвет наступающей тьмы
  },

  // ---- Твист: СВЕТ. Игрок = источник света, тьма наступает с краёв.
  // Радиус света растёт с уровнем (Хаос→Порядок), проседает при уроне.
  // Враги во тьме быстрее (рвутся из теней) и нормальны в свете. ----
  light: {
    base: 250,            // стартовый радиус света (видно ближний рой)
    perLevel: 16,         // прирост за уровень
    max: 540,             // потолок
    min: 120,             // не уходит ниже (всегда видно угрозу рядом)
    hitLoss: 55,          // на сколько тьма наступает при ударе
    recover: 75,          // восстановление света, px/сек
    darkSpeedMult: 1.35,  // ускорение врагов вне света
    glintRadius: 3,       // размер точки-глинта врага/осколка во тьме (читаемость)
    glintAlpha: 0.6,      // яркость глинта
    shotGlintAlpha: 0.8,  // яркость глинта вражеского снаряда (виднее — уклоняться)
    // врагов во тьме НЕ видно — лишь редкие вспышки-молнии выхватывают их силуэты,
    // а на кромке тлеет «пульс угрозы» (чувствуешь рой, но не видишь где)
    flashPeriod: 4.0,     // период вспышки, сек
    flashDur: 0.26,       // длительность вспышки, сек
    threatRange: 200,     // на сколько за кромкой света считаем «угрозу рядом»
  },

  // ---- Игрок (базовые статы; модифицируются пассивками) ----
  player: {
    radius: 14,
    maxHp: 100,
    moveSpeed: 215,        // px/сек
    pickupRadius: 140,     // радиус магнита
    regen: 0,              // hp/сек (растёт пассивкой)
    iframes: 0.5,          // неуязвимость после удара, сек
    damageMult: 1,
    contactKnockback: 220, // насколько игрок отталкивает врага при контакте
  },

  // ---- Кривая опыта ----
  xp: {
    base: 5,               // XP до 2 уровня
    growth: 1.32,          // множитель на уровень
    gemValue: 1,           // обычный осколок
    gemBigValue: 5,        // крупный осколок (с танков/боссов)
  },

  /* ---------------------------------------------------------------
     КРИВАЯ ЭСКАЛАЦИИ — несущий параметр Хаос→Порядок.
     Каждая фаза активна с tStart (сек). Берётся последняя подходящая.
     spawnInterval — пауза между волнами спавна (сек)
     batch        — сколько врагов за одну волну
     cap          — максимум врагов на экране
     hpMult/spdMult/dmgMult — масштаб статов врага в этой фазе
     weights      — вероятностные веса по типам врага
     --------------------------------------------------------------- */
  // Кривая вводит НОВЫЕ механики по одной за фазу (не стеком): мягкая кривая обучения.
  // splitter@150 → spitter/ranged@240 → devourer/drain@300 → leech+anchor@375 → brute@460.
  phases: [
    { tStart: 0,   spawnInterval: 0.85, batch: 1, cap: 30,  hpMult: 1.0, spdMult: 1.0, dmgMult: 1.0,
      weights: { chaser: 1 } },
    { tStart: 60,  spawnInterval: 0.55, batch: 2, cap: 70,  hpMult: 1.25, spdMult: 1.05, dmgMult: 1.0,
      weights: { chaser: 3, swarm: 2 } },
    { tStart: 150, spawnInterval: 0.42, batch: 3, cap: 110, hpMult: 1.7, spdMult: 1.1, dmgMult: 1.1,
      weights: { chaser: 3, swarm: 3, tank: 1, splitter: 1 } },
    { tStart: 240, spawnInterval: 0.34, batch: 4, cap: 150, hpMult: 2.3, spdMult: 1.15, dmgMult: 1.2,
      weights: { chaser: 3, swarm: 4, tank: 2, splitter: 2, spitter: 1 } },                       // дальник
    { tStart: 300, spawnInterval: 0.30, batch: 4, cap: 185, hpMult: 2.9, spdMult: 1.18, dmgMult: 1.28,
      weights: { chaser: 3, swarm: 4, tank: 2, splitter: 2, spitter: 2, devourer: 1 } },           // высасывание света
    { tStart: 375, spawnInterval: 0.26, batch: 5, cap: 215, hpMult: 3.6, spdMult: 1.21, dmgMult: 1.36,
      weights: { chaser: 2, swarm: 5, tank: 3, spitter: 2, splitter: 2, devourer: 1, leech: 1, anchor: 1 } }, // подавление + пятна
    { tStart: 460, spawnInterval: 0.22, batch: 6, cap: 260, hpMult: 4.8, spdMult: 1.25, dmgMult: 1.5,
      weights: { chaser: 2, swarm: 5, tank: 4, spitter: 3, splitter: 3, devourer: 2, anchor: 2, leech: 2, brute: 2 } },
  ],

  /* ---------------------------------------------------------------
     ГЛУБИНЫ ТЬМЫ — ascension-лестница. depth 0 = базовый забег.
     depth N>=1 берёт depths[N-1]: стек модификаторов поверх фаз.
     Открывается победой на предыдущей глубине. Несущий мотор «ещё забег».
     --------------------------------------------------------------- */
  depths: [
    { name: 'Глубина I',   hp: 1.30, spd: 1.04, dmg: 1.10, light: 0.94, reward: 1.35, desc: 'Тьма гуще. Свет слабее.' },
    { name: 'Глубина II',  hp: 1.70, spd: 1.08, dmg: 1.20, light: 0.88, reward: 1.75, desc: 'Враги крепче, ночь ближе.' },
    { name: 'Глубина III', hp: 2.20, spd: 1.12, dmg: 1.32, light: 0.82, reward: 2.20, desc: 'Свет едва держится.' },
    { name: 'Глубина IV',  hp: 2.90, spd: 1.16, dmg: 1.46, light: 0.76, reward: 2.80, desc: 'Бездна смотрит в ответ.' },
    { name: 'Глубина V',   hp: 3.80, spd: 1.20, dmg: 1.62, light: 0.70, reward: 3.60, desc: 'Только рассвет спасёт.' },
    { name: 'Глубина VI',  hp: 5.00, spd: 1.25, dmg: 1.80, light: 0.64, reward: 4.60, desc: 'Конец света.' },
  ],

  /* ---------------------------------------------------------------
     АНОМАЛИИ ТЬМЫ — модификаторы правил, роллятся на старте через RNG.
     Делают каждый забег непохожим. Применяются множителями к системам.
     Число активных растёт с глубиной (см. Game.rollAnomalies).
     --------------------------------------------------------------- */
  anomalies: [
    { key: 'twilight',  name: 'Сумрак',        desc: 'Радиус света −22%',                    icon: '◑', light: 0.78 },
    { key: 'longnight', name: 'Долгая ночь',   desc: 'Удар сильнее гасит свет',              icon: '☾', hitLoss: 1.7, recover: 0.8 },
    { key: 'swarmtide', name: 'Прилив роя',    desc: 'Вдвое больше мелких тварей',           icon: '∴', weightMul: { swarm: 2.6, splitter: 1.8 } },
    { key: 'frenzy',    name: 'Неистовство',   desc: 'Враги быстрее, но золота больше',      icon: '⚡', enemySpd: 1.16, reward: 1.4 },
    { key: 'gloom',     name: 'Морок',         desc: 'Магнит слабее, зато опыт жирнее',      icon: '◍', pickup: 0.65, xp: 1.5 },
    { key: 'embertide', name: 'Угли',          desc: 'Свет растёт быстрее, но тьма давит',   icon: '✸', recover: 1.6, darkSpeed: 1.22 },
    { key: 'famine',    name: 'Голод',         desc: 'Тьма плодит крупных тварей',           icon: '◆', weightMul: { devourer: 3, anchor: 2.4 } },
    { key: 'fragile',   name: 'Хрупкость',     desc: 'Враги бьют больнее, но мрут легче',    icon: '✕', enemyHp: 0.7, enemyDmg: 1.35, reward: 1.3 },
  ],

  // ---- Маятник День/Ночь: радиус света дышит, частота растёт к финалу ----
  cycle: { period: 96, periodEnd: 46, swing: 0.13 },

  /* ---------------------------------------------------------------
     СОБЫТИЯ ТЬМЫ — развилка-выбор без правильного ответа (на таймере).
     Переиспользует UI драфта. Каждый выбор — характерный риск/награда.
     --------------------------------------------------------------- */
  eventTimes: [205, 415],   // 3:25 и 6:55 — между боссами, не в их момент
  darkEvents: [
    { kind: 'eliteWave', icon: '⚔', color: '#ff5bd0', name: 'Прорыв теней',  desc: 'Волна крепких тварей разом — но щедрый дождь золота' },
    { kind: 'curse',     icon: '☾', color: '#a64dff', name: 'Сгущение тьмы', desc: 'Новая аномалия до конца забега — взамен +15% урона навсегда' },
    { kind: 'respite',   icon: '✚', color: '#7CFFB2', name: 'Затишье',       desc: 'Развеять ближнюю тьму, +50% HP, свет вспыхнёт' },
    { kind: 'fortune',   icon: '◆', color: '#ffd24a', name: 'Россыпь',       desc: 'Богатый дождь золота и искра здоровья' },
  ],

  // ---- Разблокировки: контент за вехами. Питает «ещё забег» (мета-петля) ----
  // cond: { survive, level, totalKills, killBoss, win, depth } — любое из условий.
  unlocks: [
    { key: 'beam',      kind: 'weapon', cond: { survive: 240 },      hint: 'Доживи до 4:00' },
    { key: 'lantern',   kind: 'weapon', cond: { killBoss: true },    hint: 'Срази первого босса' },
    { key: 'duskblade', kind: 'weapon', cond: { totalKills: 1500 },  hint: 'Убей 1500 тварей (всего)' },
    { key: 'ricochet',  kind: 'weapon', cond: { level: 14 },         hint: 'Достигни 14 уровня в забеге' },
    { key: 'dawnflash', kind: 'weapon', cond: { win: true },         hint: 'Переживи 10 минут' },
    { key: 'umbra',     kind: 'char',   cond: { killBoss: true },    hint: 'Срази босса' },
    { key: 'mirror',    kind: 'char',   cond: { depth: 1 },          hint: 'Войди в Глубину Тьмы' },
  ],

  // ---- Типы врагов ----
  enemies: {
    chaser: {
      name: 'Тень', radius: 13, hp: 10, speed: 70, damage: 8,
      color: '#6b7bff', shape: 'tri', xp: 1, score: 1,
    },
    swarm: {
      name: 'Морок', radius: 9, hp: 5, speed: 128, damage: 5,
      color: '#5fe0ff', shape: 'diamond', xp: 1, score: 1,
    },
    tank: {
      name: 'Гнёт', radius: 22, hp: 70, speed: 42, damage: 16,
      color: '#b06bff', shape: 'hex', xp: 5, bigGem: true, score: 3,
    },
    spitter: {
      name: 'Плевун', radius: 14, hp: 24, speed: 46, damage: 6,
      color: '#9b6bff', shape: 'diamond', xp: 2, score: 2,
      ranged: true, shotDmg: 6, shotSpeed: 235, shotCd: 2.8, shotRange: 430, shotRadius: 6,
    },
    // Пожиратель: пока жив и близко — высасывает твой радиус света (приоритет «убить первым»)
    devourer: {
      name: 'Пожиратель', radius: 19, hp: 58, speed: 50, damage: 12,
      color: '#a64dff', shape: 'hex', xp: 4, bigGem: true, score: 4,
      drainLight: 46, drainRange: 230,
    },
    // Дробитель: при смерти распадается на 3 быстрых Осколка (дилемма «где убивать»)
    splitter: {
      name: 'Дробитель', radius: 16, hp: 34, speed: 66, damage: 10,
      color: '#4dd0e1', shape: 'diamond', xp: 2, score: 2,
      split: 'splitling', splitCount: 3,
    },
    // Осколок: дочерний враг Дробителя (не спавнится волнами, только при разделении)
    splitling: {
      name: 'Осколок', radius: 9, hp: 8, speed: 104, damage: 6,
      color: '#80deea', shape: 'diamond', xp: 1, score: 1,
    },
    // Якорь: при смерти роняет пятно тьмы, гасящее рост света на участке (геометрия тьмы)
    anchor: {
      name: 'Якорь', radius: 20, hp: 82, speed: 30, damage: 14,
      color: '#6a3dd6', shape: 'hex', xp: 5, bigGem: true, score: 5,
      anchorOnDeath: true, anchorRadius: 150, anchorLife: 9,
    },
    // Рассеиватель: аура глушит ВОССТАНОВЛЕНИЕ света, пока рядом (тьма не отступает)
    leech: {
      name: 'Рассеиватель', radius: 15, hp: 40, speed: 58, damage: 8,
      color: '#7ad1ff', shape: 'tri', xp: 3, score: 3,
      suppressLight: true, suppressRange: 210,
    },
    // Громада: тяжёлый бугай поздних фаз/глубин — давит массой
    brute: {
      name: 'Громада', radius: 28, hp: 160, speed: 36, damage: 22,
      color: '#c05bff', shape: 'hex', xp: 8, bigGem: true, score: 8,
    },
    boss: {
      name: 'Жнец', radius: 48, hp: 2600, speed: 58, damage: 28,
      color: '#ff5bd0', shape: 'hex', xp: 40, bigGem: true, score: 50,
      isBoss: true,
    },
    boss2: {
      name: 'Затмение', radius: 56, hp: 6000, speed: 50, damage: 36,
      color: '#7a3cff', shape: 'hex', xp: 70, bigGem: true, score: 90,
      isBoss: true,
    },
    // Владыка Затмения: аура постоянно высасывает твой свет, при смерти роняет якори
    boss3: {
      name: 'Владыка Затмения', radius: 54, hp: 9000, speed: 54, damage: 34,
      color: '#a64dff', shape: 'hex', xp: 90, bigGem: true, score: 110,
      isBoss: true, drainLight: 60, drainRange: 380,
      anchorOnDeath: true, anchorRadius: 230, anchorLife: 7,
    },
    // Нулевая Точка: пульсирует кольцами тьмы — радиальные залпы по таймеру
    boss4: {
      name: 'Нулевая Точка', radius: 50, hp: 11000, speed: 30, damage: 30,
      color: '#6a3dd6', shape: 'hex', xp: 110, bigGem: true, score: 140,
      isBoss: true, ring: true, ringCd: 3.2, ringShots: 14, ringSpeed: 205, ringDmg: 14, ringRadius: 7,
    },
  },

  // ---- Персонажи: разный старт и статы (выбор перед забегом) ----
  // shape — форма-силуэт героя (в палитре света/огня), различает их визуально
  characters: {
    spark: {
      name: 'Искра', desc: 'Равновесие во всём. Старт: Импульс.',
      icon: '✦', color: '#ffce5e', shape: 'diamond', start: 'bolt', mods: {},
    },
    ember: {
      name: 'Уголёк', desc: 'Стекло-пушка: +25% урона, но меньше HP и света. Старт: Импульс.',
      icon: '✺', color: '#ff7a5c', shape: 'tri', start: 'bolt',
      mods: { damageMult: 1.25, moveSpeedMul: 1.05, maxHp: 72, lightBonus: -40 },
    },
    // Угасающий: горит ярко, но недолго. Свет тает со временем, каждый убитый — ещё миг света.
    umbra: {
      name: 'Угасающий', desc: 'Последняя вспышка: свет тает, но каждый убитый враг — ещё миг. Старт: Импульс.',
      icon: '☄', color: '#ff9b4d', shape: 'hex', start: 'bolt',
      mods: { lightMode: 'decay', lightDecay: 7, killLight: 4, damageMult: 1.12 },
    },
    // Зеркало: свет только из осколков убийств; урон бьёт по ним. Агрессия — единственный путь.
    mirror: {
      name: 'Зеркало', desc: 'Свет рождается из убийств; урон гасит осколки. Старт: Ореол.',
      icon: '◇', color: '#ffe1a8', shape: 'circle', start: 'orbit',
      mods: { lightMode: 'mirror', mirrorPer: 22, moveSpeedMul: 1.05 },
    },
  },

  // ---- Магазин: перманентные апгрейды за золото (localStorage) ----
  shop: [
    { key: 'maxhp',  name: 'Закалка',        desc: '+12 макс. HP за уровень',  icon: '❤', color: '#ff4d6d', max: 5, cost: [40, 70, 110, 160, 230] },
    { key: 'power',  name: 'Ярость',         desc: '+5% урона за уровень',      icon: '✸', color: '#ff7a5c', max: 5, cost: [50, 90, 140, 210, 300] },
    { key: 'speed',  name: 'Прыть',          desc: '+4% скорости за уровень',   icon: '➤', color: '#5ef2ff', max: 5, cost: [45, 80, 130, 190, 270] },
    { key: 'light',  name: 'Сияние',         desc: '+20 света за уровень',      icon: '☀', color: '#ffce5e', max: 5, cost: [40, 75, 120, 180, 260] },
    { key: 'revive', name: 'Второе дыхание', desc: 'Восстать при гибели (раз)', icon: '✚', color: '#7CFFB2', max: 2, cost: [220, 600] },
  ],

  // ---- Оружие (lvl 1..5; stats масштабируются по уровню) ----
  // dmg/cooldown/count и т.п. — массивы по уровням (индекс = lvl-1)
  weapons: {
    bolt: {
      name: 'Импульс', desc: 'Снаряд бьёт в ближайшего врага',
      icon: '✦', color: '#5ef2ff', kind: 'bolt',
      cooldown: [0.62, 0.55, 0.48, 0.40, 0.32],
      dmg:      [9, 12, 15, 19, 24],
      count:    [1, 1, 2, 2, 3],
      speed: 480, pierce: 0, radius: 5, life: 1.2, knockback: 90,
      evolveWith: 'power', evolveInto: 'dawnray',
    },
    orbit: {
      name: 'Ореол', desc: 'Щиты вращаются вокруг тебя',
      icon: '◌', color: '#ffb35c', kind: 'orbit',
      cooldown: [0, 0, 0, 0, 0],
      dmg:      [6, 8, 11, 14, 18],
      count:    [2, 2, 3, 3, 4],
      orbitRadius: 64, orbitSpeed: 2.6, radius: 11, tick: 0.25, knockback: 60,
      evolveWith: 'magnet', evolveInto: 'corona',
    },
    nova: {
      name: 'Нова', desc: 'Взрывная волна вокруг тебя',
      icon: '✺', color: '#ff9bf0', kind: 'nova',
      cooldown: [2.6, 2.3, 2.0, 1.7, 1.4],
      dmg:      [12, 17, 23, 30, 40],
      count:    [1, 1, 1, 1, 1],
      novaRadius: [95, 115, 135, 155, 185], knockback: 260,
      evolveWith: 'vigor', evolveInto: 'supernova',
    },
    whip: {
      name: 'Хлыст', desc: 'Рассекающий удар по направлению движения',
      icon: '⟿', color: '#ffd24a', kind: 'whip',
      cooldown: [1.0, 0.88, 0.74, 0.60, 0.46],
      dmg:      [14, 19, 25, 33, 44],
      count:    [1, 1, 2, 2, 2],
      whipLen: [150, 165, 180, 200, 230], whipWide: 46, knockback: 140,
      evolveWith: 'speed', evolveInto: 'solaredge',
    },
    chain: {
      name: 'Разряд', desc: 'Молния света скачет между врагами',
      icon: '⚡', color: '#9fd8ff', kind: 'chain',
      cooldown: [1.1, 0.98, 0.85, 0.72, 0.6],
      dmg:      [10, 13, 17, 22, 28],
      count:    [2, 3, 3, 4, 5],          // число прыжков
      hopRange: 175, firstRange: 340, knockback: 40,
      evolveWith: 'regen', evolveInto: 'tempest',
    },
    mine: {
      name: 'Светляк', desc: 'Свет-ловушка, вспыхивает вблизи врага',
      icon: '✲', color: '#ffd27a', kind: 'mine',
      cooldown: [2.0, 1.8, 1.6, 1.4, 1.2],
      dmg:      [18, 24, 31, 40, 52],
      count:    [1, 1, 2, 2, 3],          // мин за раз
      mineRadius: 72, mineLife: 6, mineTrigger: 46, knockback: 210,
      evolveWith: 'magnet', evolveInto: 'beacon',
    },
    // Луч-маяк: постоянный жгущий луч в ближайшего; светит — оружие и фонарь разом
    beam: {
      name: 'Луч-маяк', desc: 'Постоянный луч жжёт по направлению взгляда',
      icon: '⌖', color: '#fff0a0', kind: 'beam',
      cooldown: [0, 0, 0, 0, 0],
      dmg:      [5, 7, 9, 12, 16],         // урон за тик
      count:    [1, 1, 1, 1, 2],           // число лучей
      beamLen: [220, 250, 285, 320, 360], beamWide: 15, tick: 0.12, knockback: 28,
      evolveWith: 'power', evolveInto: 'sunlance',
    },
    // Пульс-фонарь: ставит фонарь — свет-зона замедляет тварей и жжёт их
    lantern: {
      name: 'Пульс-фонарь', desc: 'Ставит фонарь: свет-зона тормозит тьму',
      icon: '☼', color: '#ffd27a', kind: 'lantern',
      cooldown: [3.2, 2.9, 2.6, 2.3, 2.0],
      dmg:      [0, 0, 0, 0, 0],
      count:    [1, 1, 1, 2, 2],           // фонарей за раз
      lanternRadius: [92, 106, 120, 135, 152], lanternLife: [5, 5.5, 6, 6.5, 7],
      slow: 0.52, tickDmg: [3, 4, 5, 7, 9], tick: 0.4,
      evolveWith: 'vigor', evolveInto: 'lighthouse',
    },
    // Сумеречный клинок: чем меньше твой свет (ближе к тьме) — тем больнее бьёт
    duskblade: {
      name: 'Сумеречный клинок', desc: 'Нож из тьмы: бьёт тем сильнее, чем меньше твой свет',
      icon: '†', color: '#c08bff', kind: 'bolt',
      cooldown: [0.9, 0.8, 0.7, 0.6, 0.5],
      dmg:      [16, 21, 27, 35, 46],
      count:    [1, 1, 2, 2, 3],
      speed: 560, pierce: 1, radius: 5, life: 0.9, knockback: 80, edgeBonus: 0.8,
      evolveWith: 'speed', evolveInto: 'eclipseblade',
    },
    // Отражённый луч: снаряд отскакивает от кромки тьмы и с каждым отскоком крепчает
    ricochet: {
      name: 'Отражённый луч', desc: 'Снаряд отскакивает от кромки тьмы, набирая силу',
      icon: '⟁', color: '#5fe0ff', kind: 'ricochet',
      cooldown: [1.2, 1.05, 0.9, 0.78, 0.66],
      dmg:      [12, 16, 20, 26, 33],
      count:    [1, 1, 1, 2, 2],
      speed: 430, radius: 5, life: 3.0, bounces: [2, 2, 3, 3, 4], bounceGain: 0.25, knockback: 70,
      evolveWith: 'power', evolveInto: 'prism',
    },
    // Рассветная вспышка: ульта — взрыв света по экрану + радиус вспыхивает до макс.
    dawnflash: {
      name: 'Рассветная вспышка', desc: 'Ульта: взрыв света по экрану, радиус вспыхивает',
      icon: '☀', color: '#fff0a0', kind: 'nova',
      cooldown: [15, 14, 13, 12, 11],
      dmg:      [40, 55, 72, 92, 120],
      count:    [1, 1, 1, 1, 1],
      novaRadius: [260, 290, 320, 350, 390], knockback: 300, lightBurst: true,
      evolveWith: 'vigor', evolveInto: 'daybreak',
    },
  },

  // ---- Эволюции: макс. оружие (ур.5) + нужная пассивка → супер-оружие.
  // Появляются отдельной картой в драфте. Один уровень (массивы длины 1). ----
  evolutions: {
    dawnray: {
      name: 'Луч Зари', desc: 'Залп самонаводящихся лучей, пробивает насквозь',
      icon: '☀', color: '#fff0a0', kind: 'bolt', base: 'bolt',
      cooldown: [0.22], dmg: [34], count: [5], speed: 660, pierce: 3, radius: 7, life: 1.4, knockback: 120,
    },
    corona: {
      name: 'Корона', desc: 'Кольцо солнц вращается вокруг тебя',
      icon: '❂', color: '#ffd27a', kind: 'orbit', base: 'orbit',
      cooldown: [0], dmg: [26], count: [6], orbitRadius: 98, orbitSpeed: 3.4, radius: 17, tick: 0.16, knockback: 90,
    },
    supernova: {
      name: 'Сверхновая', desc: 'Опустошающая волна света по всему экрану',
      icon: '✸', color: '#ffb0f0', kind: 'nova', base: 'nova',
      cooldown: [1.1], dmg: [58], count: [1], novaRadius: [270], knockback: 440,
    },
    solaredge: {
      name: 'Солнечный Клинок', desc: 'Рассекает во все стороны разом',
      icon: '✶', color: '#ffe066', kind: 'whip', base: 'whip',
      cooldown: [0.5], dmg: [50], count: [6], whipLen: [255], whipWide: 58, knockback: 160, radial: true,
    },
    tempest: {
      name: 'Гроза', desc: 'Молнии бьют по всем рядом разом',
      icon: '☇', color: '#bfeaff', kind: 'chain', base: 'chain',
      cooldown: [0.45], dmg: [34], count: [8], hopRange: 215, firstRange: 380, knockback: 60,
    },
    beacon: {
      name: 'Протуберанец', desc: 'Поле взрывных светочей',
      icon: '❉', color: '#ffe066', kind: 'mine', base: 'mine',
      cooldown: [0.7], dmg: [58], count: [3], mineRadius: 98, mineLife: 5, mineTrigger: 60, knockback: 260,
    },
    sunlance: {
      name: 'Солнечное Копьё', desc: 'Широкий луч прожигает целый строй насквозь',
      icon: '⟱', color: '#ffe066', kind: 'beam', base: 'beam',
      cooldown: [0], dmg: [20], count: [2], beamLen: [460], beamWide: 24, tick: 0.09, knockback: 60,
    },
    lighthouse: {
      name: 'Маяк', desc: 'Исполинский фонарь — свет-крепость держит ночь',
      icon: '☀', color: '#ffe9a8', kind: 'lantern', base: 'lantern',
      cooldown: [1.6], dmg: [0], count: [2], lanternRadius: [205], lanternLife: [8.5],
      slow: 0.38, tickDmg: [15], tick: 0.3,
    },
    eclipseblade: {
      name: 'Клинок Затмения', desc: 'Веер ножей тьмы прошивает строй насквозь',
      icon: '✠', color: '#a64dff', kind: 'bolt', base: 'duskblade',
      cooldown: [0.36], dmg: [40], count: [4], speed: 640, pierce: 3, radius: 6, life: 1.0, knockback: 110, edgeBonus: 1.0,
    },
    prism: {
      name: 'Призма', desc: 'Луч дробится и рикошетит без устали',
      icon: '◈', color: '#bfeaff', kind: 'ricochet', base: 'ricochet',
      cooldown: [0.5], dmg: [30], count: [3], speed: 520, radius: 6, life: 3.5, bounces: [6], bounceGain: 0.3, knockback: 90,
    },
    daybreak: {
      name: 'Рассвет', desc: 'Свет-взрыв во весь экран ослепляет тьму',
      icon: '✺', color: '#ffe9a8', kind: 'nova', base: 'dawnflash',
      cooldown: [7], dmg: [150], count: [1], novaRadius: [460], knockback: 480, lightBurst: true,
    },
  },

  // ---- Пассивки (lvl 1..5) ----
  passives: {
    speed:  { name: 'Ускорение', desc: '+скорость движения', icon: '➤', color: '#5ef2ff',
              stat: 'moveSpeed', mode: 'mult', val: [1.10, 1.18, 1.26, 1.34, 1.42] },
    power:  { name: 'Мощь', desc: '+весь урон', icon: '✸', color: '#ff7a5c',
              stat: 'damageMult', mode: 'mult', val: [1.12, 1.24, 1.36, 1.50, 1.66] },
    regen:  { name: 'Регенерация', desc: '+восстановление HP', icon: '✚', color: '#7CFFB2',
              stat: 'regen', mode: 'add', val: [0.8, 1.6, 2.6, 3.8, 5.2] },
    magnet: { name: 'Магнит', desc: '+радиус подбора', icon: '◎', color: '#ffd24a',
              stat: 'pickupRadius', mode: 'mult', val: [1.4, 1.8, 2.3, 2.9, 3.6] },
    vigor:  { name: 'Стойкость', desc: '+макс. HP', icon: '❤', color: '#ff4d6d',
              stat: 'maxHp', mode: 'addMaxHp', val: [25, 50, 80, 115, 155] },
  },

  // ---- Juice / feel ----
  feel: {
    shakeOnHit: 5,
    shakeOnNova: 7,
    shakeOnBossDeath: 22,
    shakeDecay: 9,
    hitFlash: 0.09,
    dmgNumberLife: 0.7,
    deathParticles: 7,
    bossDeathParticles: 60,
  },
};
