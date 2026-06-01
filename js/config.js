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
    xp:        '#8effc2',     // искры света
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
  phases: [
    { tStart: 0,   spawnInterval: 0.85, batch: 1, cap: 30,  hpMult: 1.0, spdMult: 1.0, dmgMult: 1.0,
      weights: { chaser: 1 } },
    { tStart: 60,  spawnInterval: 0.55, batch: 2, cap: 70,  hpMult: 1.25, spdMult: 1.05, dmgMult: 1.0,
      weights: { chaser: 3, swarm: 2 } },
    { tStart: 150, spawnInterval: 0.42, batch: 3, cap: 110, hpMult: 1.7, spdMult: 1.1, dmgMult: 1.1,
      weights: { chaser: 3, swarm: 3, tank: 1 } },
    { tStart: 240, spawnInterval: 0.32, batch: 4, cap: 160, hpMult: 2.4, spdMult: 1.15, dmgMult: 1.2,
      weights: { chaser: 3, swarm: 4, tank: 2 } },
    { tStart: 330, spawnInterval: 0.26, batch: 5, cap: 210, hpMult: 3.4, spdMult: 1.2, dmgMult: 1.3,
      weights: { chaser: 2, swarm: 5, tank: 3, spitter: 2 } },
    { tStart: 450, spawnInterval: 0.22, batch: 6, cap: 260, hpMult: 4.8, spdMult: 1.25, dmgMult: 1.5,
      weights: { chaser: 2, swarm: 5, tank: 4, spitter: 2 } },
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
  },

  // ---- Персонажи: разный старт и статы (выбор перед забегом) ----
  characters: {
    spark: {
      name: 'Искра', desc: 'Равновесие во всём. Старт: Импульс.',
      icon: '✦', color: '#ffce5e', start: 'bolt', mods: {},
    },
    ember: {
      name: 'Уголёк', desc: 'Стекло-пушка: +25% урона, но меньше HP и света. Старт: Импульс.',
      icon: '✺', color: '#ff7a5c', start: 'bolt',
      mods: { damageMult: 1.25, moveSpeedMul: 1.05, maxHp: 72, lightBonus: -40 },
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
      icon: '◌', color: '#7CFFB2', kind: 'orbit',
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
