import { Game } from './game';
import { CONFIG } from './config';
import { Render } from './render';
import { Audio2 } from './audio';
import { Input } from './input';
import { Meta } from './meta';
import { rand, clamp, TAU, weaponDef, fmtTime } from './utils';

/* =====================================================================
   UI — весь рендер: мир, HUD, оверлеи (меню / драфт / пауза / итоги).
   ===================================================================== */

export const UI: any = {
  // 2D-ОВЕРЛЕЙ (поверх pixi-канваса с миром+тьмой). Рисует только текст/бары/меню;
  // мир, тьму и глинты рисует PixiRenderer снизу. Холст очищается прозрачно, чтобы
  // pixi-мир просвечивал; для меню-экранов кладём собственный фон.
  // Тряска (Game.shakeX/Y) считается здесь через seeded rand (часть детерминизма) —
  // pixi-рендер мира её ЧИТАЕТ. Поэтому UI.render зовётся ДО PixiRenderer.render().
  render(ctx) {
    const W = Game.viewW, H = Game.viewH;
    // вычислить тряску один раз за кадр
    if (Game.shake > 0) {
      Game.shakeX = rand(-Game.shake, Game.shake);
      Game.shakeY = rand(-Game.shake, Game.shake);
    } else { Game.shakeX = 0; Game.shakeY = 0; }

    ctx.clearRect(0, 0, W, H);

    if (Game.state === 'menu') { this.drawBg(ctx); this.drawMenu(ctx); return; }
    if (Game.state === 'charselect') { this.drawBg(ctx); this.drawCharSelect(ctx); return; }
    if (Game.state === 'shop') { this.drawBg(ctx); this.drawShop(ctx); return; }

    this.drawWorldUI(ctx);   // числа урона, HP-бары танков/боссов (мировое простр.)
    this.drawHUD(ctx);
    this.drawBanner(ctx);
    if (Game.state === 'playing') this.drawJoystick(ctx);

    if (Game.state === 'levelup') this.drawDraft(ctx);
    else if (Game.state === 'paused') this.drawPaused(ctx);
    else if (Game.state === 'gameover') this.drawGameOver(ctx);
    else if (Game.state === 'win') this.drawWin(ctx);
  },

  // непрозрачный фон под меню-экранами (в игре фон даёт pixi-канвас)
  drawBg(ctx) { ctx.fillStyle = CONFIG.colors.bg; ctx.fillRect(0, 0, Game.viewW, Game.viewH); },

  // 2D-слой над миром: числа урона + HP-бары танков/боссов (текст и тонкие бары
  // остаются на Canvas2D, чтобы не тащить PIXI.Text; затемнение тьмой для них опущено
  // — несущественно, они появляются у целей в освещённой зоне боя).
  drawWorldUI(ctx) {
    for (const e of Game.enemies.active) {
      if (e.dead) continue;
      if (e.isBoss) { this.drawBossBar(ctx, e); continue; }
      if (e.typeKey === 'tank' && e.hp < e.maxHp) {
        const X = this.sx(e.x), Y = this.sy(e.y), w = e.radius * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(X - w / 2, Y - e.radius - 9, w, 4);
        ctx.fillStyle = CONFIG.colors.hp;
        ctx.fillRect(X - w / 2, Y - e.radius - 9, w * (e.hp / e.maxHp), 4);
      }
    }
    ctx.textAlign = 'center';
    for (const d of Game.dmgNumbers.active) {
      if (d.dead) continue;
      const a = clamp(d.life / CONFIG.feel.dmgNumberLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = (d.crit ? 'bold 22px ' : 'bold 15px ') + 'Consolas, monospace';
      ctx.fillStyle = d.color;
      ctx.fillText(d.value, this.sx(d.x), this.sy(d.y));
      ctx.globalAlpha = 1;
    }
  },

  // координаты мир->экран
  sx(x) { return x - Game.player.x + Game.viewW / 2 + Game.shakeX; },
  sy(y) { return y - Game.player.y + Game.viewH / 2 + Game.shakeY; },

  drawBossBar(ctx, e) {
    const W = Game.viewW;
    const bw = Math.min(560, W - 80), bh = 12;
    const x = (W - bw) / 2, y = 54;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = CONFIG.colors.boss;
    ctx.fillRect(x, y, bw * clamp(e.hp / e.maxHp, 0, 1), bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1; ctx.strokeRect(x, y, bw, bh);
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillStyle = '#fff';
    const bn = CONFIG.enemies[e.typeKey] ? CONFIG.enemies[e.typeKey].name.toUpperCase() : 'БОСС';
    ctx.fillText(bn, W / 2, y - 4);
  },

  // ----------------------------- HUD -----------------------------
  drawHUD(ctx) {
    const W = Game.viewW, H = Game.viewH, p = Game.player;
    // XP-бар сверху во всю ширину
    const xpFrac = clamp(p.xp / p.xpNext, 0, 1);
    ctx.fillStyle = 'rgba(255,206,94,0.10)';
    ctx.fillRect(0, 0, W, 7);
    ctx.fillStyle = CONFIG.colors.xpbar;
    ctx.fillRect(0, 0, W * xpFrac, 7);
    // пульс при подборе искры
    const xpPulse = Game.effects.find(e => e.kind === 'xppulse');
    if (xpPulse) {
      const a = clamp(xpPulse.life / xpPulse.maxLife, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * a).toFixed(3) + ')';
      ctx.fillRect(0, 0, W * xpFrac, 7);
      ctx.globalCompositeOperation = 'source-over';
    }

    // уровень (слева)
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.fillStyle = CONFIG.colors.text;
    ctx.fillText('УР. ' + p.level, 12, 28);

    // глубина + активные аномалии (слева под уровнем)
    const rm = Game.runMods;
    if (rm) {
      let label = '';
      if (rm.depth > 0 && CONFIG.depths[rm.depth - 1]) label += CONFIG.depths[rm.depth - 1].name;
      if (rm.anomalies && rm.anomalies.length) {
        const icons = rm.anomalies.map(a => a.icon).join(' ');
        label += (label ? '  ' : '') + icons;
      }
      if (label) {
        ctx.font = '12px Consolas, monospace';
        ctx.fillStyle = CONFIG.colors.boss;
        ctx.fillText(label, 12, 46);
      }
    }

    // таймер (центр)
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Consolas, monospace';
    ctx.fillStyle = CONFIG.colors.text;
    ctx.fillText(fmtTime(Game.time), W / 2, 32);

    // киллы (справа)
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Consolas, monospace';
    ctx.fillStyle = CONFIG.colors.danger;
    ctx.fillText('☠ ' + p.kills, W - 12, 26);

    // HP-бар (низ слева)
    const hbw = 240, hbh = 16, hx = 14, hy = H - 30;
    ctx.fillStyle = CONFIG.colors.hpBack;
    ctx.fillRect(hx, hy, hbw, hbh);
    const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = CONFIG.colors.hp;
    ctx.fillRect(hx, hy, hbw * hpFrac, hbh);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1; ctx.strokeRect(hx, hy, hbw, hbh);
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(p.hp) + ' / ' + p.maxHp, hx + 6, hy + 12);

    // иконки оружия/пассивок (над HP-баром)
    this.drawLoadout(ctx, hx, hy - 30);
  },

  drawLoadout(ctx, x, y) {
    const p = Game.player;
    let cx = x;
    ctx.textAlign = 'center';
    for (const w of p.weapons) {
      const def = weaponDef(w.key);
      this.drawSlot(ctx, cx, y, def.icon, def.color, w.level);
      cx += 30;
    }
    cx += 8;
    for (const key in p.passives) {
      const def = CONFIG.passives[key];
      this.drawSlot(ctx, cx, y, def.icon, def.color, p.passives[key]);
      cx += 30;
    }
  },

  drawSlot(ctx, x, y, icon, color, level) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, 26, 26);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1; ctx.strokeRect(x, y, 26, 26);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = '15px serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, x + 13, y + 18);
    // пип уровня
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillText(level, x + 21, y + 25);
  },

  drawBanner(ctx) {
    if (Game.bannerTime <= 0) return;
    const a = clamp(Game.bannerTime / Game.bannerMax, 0, 1);
    const pop = 1 + (1 - a) * 0.0;
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px Consolas, monospace';
    ctx.fillStyle = CONFIG.colors.boss;
    ctx.fillText(Game.bannerText, Game.viewW / 2, Game.viewH * 0.3);
    ctx.globalAlpha = 1;
  },

  // визуал сенсорного джойстика
  drawJoystick(ctx) {
    if (!Input.touchActive) return;
    const bx = Input.baseX, by = Input.baseY, max = Input.maxRadius;
    let dx = Input.curX - bx, dy = Input.curY - by;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = CONFIG.colors.player; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, max, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = CONFIG.colors.player;
    ctx.beginPath(); ctx.arc(bx + dx, by + dy, 24, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  },

  // ----------------------------- ОВЕРЛЕИ -----------------------------
  dim(ctx, a = 0.66) {
    ctx.fillStyle = 'rgba(4,6,12,' + a + ')';
    ctx.fillRect(0, 0, Game.viewW, Game.viewH);
  },

  drawMenu(ctx) {
    const W = Game.viewW, H = Game.viewH;
    // фоновый антураж
    ctx.textAlign = 'center';
    ctx.globalCompositeOperation = 'lighter';
    const glow = Render.glowDot(CONFIG.colors.player, 60);
    Render.blit(ctx, glow, W / 2, H * 0.34, 0, 1, 0.5);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'bold 76px Consolas, monospace';
    ctx.fillText('LUMEN', W / 2, H * 0.34);
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '18px Consolas, monospace';
    ctx.fillText('S U R V I V O R S', W / 2, H * 0.34 + 36);
    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'italic 17px Consolas, monospace';
    ctx.fillText('Сдержи тьму. Стань рассветом.', W / 2, H * 0.34 + 66);

    ctx.fillStyle = CONFIG.colors.text;
    ctx.font = '20px Consolas, monospace';
    const blink = (Math.floor(Game.clock * 2) % 2) === 0;
    if (blink) ctx.fillText('▶  ПРОБЕЛ  или  КЛИК  —  НАЧАТЬ', W / 2, H * 0.56);
    // кликабельная кнопка магазина (мышь)
    const shopHover = Input.mouseX >= W / 2 - 150 && Input.mouseX <= W / 2 + 150 &&
                      Input.mouseY >= H * 0.56 + 16 && Input.mouseY <= H * 0.56 + 44;
    ctx.fillStyle = shopHover ? CONFIG.colors.player : CONFIG.colors.gold;
    ctx.font = '17px Consolas, monospace';
    ctx.fillText('M  /  клик  —  магазин света', W / 2, H * 0.56 + 34);
    Game._menuShopRect = { x: W / 2 - 150, y: H * 0.56 + 16, w: 300, h: 28 };

    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    const touch = ('ontouchstart' in window) || Input.isTouch;
    ctx.fillText(touch ? 'тащи палец — движение      оружие стреляет само'
                       : 'WASD / стрелки — движение      оружие стреляет само', W / 2, H * 0.68);
    ctx.fillText('собирай искры → новый уровень → выбирай улучшение', W / 2, H * 0.68 + 24);
    ctx.fillText('выживи 10 минут', W / 2, H * 0.68 + 48);

    if (typeof Meta !== 'undefined' && Meta.data.best) {
      ctx.fillStyle = CONFIG.colors.gold;
      ctx.font = '14px Consolas, monospace';
      ctx.fillText('лучший забег: ' + fmtTime(Meta.data.best), W / 2, H * 0.86);
      const codexN = Object.keys(Meta.data.codex || {}).length;
      const totalTypes = Object.keys(CONFIG.enemies).length;
      const parts: any[] = [];
      if (Meta.data.maxDepth > 0) parts.push('глубина: ' + Meta.data.maxDepth + '/' + CONFIG.depths.length);
      parts.push('кодекс: ' + codexN + '/' + totalTypes);
      ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace';
      ctx.fillText(parts.join('     ·     '), W / 2, H * 0.86 + 22);
    }
  },

  drawCharSelect(ctx) {
    const W = Game.viewW, H = Game.viewH;
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'bold 42px Consolas, monospace';
    ctx.fillText('ВЫБОР ИСКРЫ', W / 2, H * 0.2);
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('← →  выбрать   ·   Enter / клик — в бой', W / 2, H * 0.2 + 28);

    const keys = Object.keys(CONFIG.characters);
    const n = keys.length, gap = 24, ch = 264;
    const cw = Math.min(238, (W - 80 - (n - 1) * gap) / n);   // адаптивно под число героев
    const totalW = n * cw + (n - 1) * gap, x0 = (W - totalW) / 2, y0 = H * 0.28;
    Game._charRects = [];
    for (let i = 0; i < n; i++) {
      const c = CONFIG.characters[keys[i]];
      const locked = (typeof Meta !== 'undefined') && !Meta.isUnlocked(keys[i]);
      const x = x0 + i * (cw + gap);
      const sel = i === Game.charIndex;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(x, y0, cw, ch);
      if (sel && !locked) {
        ctx.globalCompositeOperation = 'lighter';
        Render.blit(ctx, Render.glowDot(c.color, 48), x + cw / 2, y0 + 84, 0, 1, 0.4);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = sel ? (locked ? CONFIG.colors.textDim : c.color) : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeRect(x, y0, cw, ch);
      ctx.textAlign = 'center';
      if (locked) {
        // заперт: замок + условие открытия
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '54px serif';
        ctx.fillText('🔒', x + cw / 2, y0 + 100);
        ctx.globalAlpha = 1;
        ctx.fillStyle = CONFIG.colors.textDim; ctx.font = 'bold 22px Consolas, monospace';
        ctx.fillText('???', x + cw / 2, y0 + 150);
        const ud = CONFIG.unlocks.find(u => u.key === keys[i]);
        ctx.fillStyle = CONFIG.colors.gold; ctx.font = '12px Consolas, monospace';
        this.wrapText(ctx, ud ? ud.hint : 'заперт', x + cw / 2, y0 + 184, cw - 26, 17);
      } else {
        ctx.fillStyle = c.color; ctx.font = '58px serif';
        ctx.fillText(c.icon, x + cw / 2, y0 + 102);
        ctx.fillStyle = CONFIG.colors.text; ctx.font = 'bold 22px Consolas, monospace';
        ctx.fillText(c.name, x + cw / 2, y0 + 148);
        ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '12px Consolas, monospace';
        this.wrapText(ctx, c.desc, x + cw / 2, y0 + 178, cw - 26, 17);
      }
      Game._charRects.push({ x, y: y0, w: cw, h: ch });
    }

    // выбор Глубины Тьмы (ascension) — открывается победами
    const maxD = (typeof Meta !== 'undefined') ? Meta.data.maxDepth : 0;
    const dy = y0 + ch + 42;
    Game.selectedDepth = clamp(Game.selectedDepth, 0, maxD);
    const dn = Game.selectedDepth === 0 ? 'Поверхность' : CONFIG.depths[Game.selectedDepth - 1].name;
    ctx.textAlign = 'center';
    Game._depthRects = null;
    if (maxD > 0) {
      ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace';
      ctx.fillText('ГЛУБИНА ТЬМЫ   ( ↑ ↓  или клик ◂ ▸ )', W / 2, dy - 18);
      ctx.fillStyle = Game.selectedDepth ? CONFIG.colors.boss : CONFIG.colors.xp;
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.fillText('◂  ' + dn + '  ▸', W / 2, dy + 8);
      // кликабельные стрелки изменения глубины
      Game._depthRects = {
        left:  { x: W / 2 - 150, y: dy - 12, w: 70, h: 34 },
        right: { x: W / 2 + 80,  y: dy - 12, w: 70, h: 34 },
      };
      if (Game.selectedDepth > 0) {
        ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '12px Consolas, monospace';
        ctx.fillText(CONFIG.depths[Game.selectedDepth - 1].desc + '   ·   награда ×' +
          CONFIG.depths[Game.selectedDepth - 1].reward.toFixed(2), W / 2, dy + 28);
      }
    } else {
      ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '12px Consolas, monospace';
      ctx.fillText('переживи 10:00 — откроется Глубина Тьмы (больше угроз и наград)', W / 2, dy);
    }
  },

  drawShop(ctx) {
    const W = Game.viewW, H = Game.viewH;
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'bold 40px Consolas, monospace';
    ctx.fillText('МАГАЗИН СВЕТА', W / 2, H * 0.12);
    // кнопка «назад» (мышь)
    const backHover = this._hover(24, 20, 110, 32);
    ctx.textAlign = 'left';
    ctx.strokeStyle = backHover ? CONFIG.colors.player : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5; ctx.strokeRect(24, 20, 110, 32);
    ctx.fillStyle = backHover ? CONFIG.colors.player : CONFIG.colors.text;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('← НАЗАД', 40, 41);
    Game._shopBackRect = { x: 24, y: 20, w: 110, h: 32 };
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillText('◆ ' + (typeof Meta !== 'undefined' ? Meta.data.gold : 0), W / 2, H * 0.12 + 34);
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '14px Consolas, monospace';
    ctx.fillText('↑ ↓  выбрать   ·   Enter / клик — купить   ·   Esc / M — назад', W / 2, H * 0.12 + 60);

    const rowW = Math.min(620, W - 80), rowH = 64, gap = 12;
    const x = (W - rowW) / 2;
    let y = H * 0.28;
    Game._shopRects = [];
    for (let i = 0; i < CONFIG.shop.length; i++) {
      const u = CONFIG.shop[i];
      const lv = Meta.upgLevel(u.key), cost = Meta.upgCost(u.key);
      const sel = i === Game.shopIndex;
      const afford = cost != null && Meta.data.gold >= cost;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)';
      ctx.fillRect(x, y, rowW, rowH);
      ctx.strokeStyle = sel ? u.color : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = sel ? 2.5 : 1;
      ctx.strokeRect(x, y, rowW, rowH);
      // иконка
      ctx.fillStyle = u.color; ctx.font = '30px serif'; ctx.textAlign = 'left';
      ctx.fillText(u.icon, x + 16, y + 42);
      // имя + описание
      ctx.fillStyle = CONFIG.colors.text; ctx.font = 'bold 18px Consolas, monospace';
      ctx.fillText(u.name, x + 56, y + 26);
      ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace';
      ctx.fillText(u.desc, x + 56, y + 46);
      // пипы уровня
      const pipW = 13, px = x + rowW - 230;
      for (let k = 0; k < u.max; k++) {
        ctx.fillStyle = k < lv ? u.color : 'rgba(255,255,255,0.12)';
        ctx.fillRect(px + k * pipW, y + rowH / 2 - 4, pipW - 4, 8);
      }
      // цена / статус
      ctx.textAlign = 'right'; ctx.font = 'bold 15px Consolas, monospace';
      if (cost == null) { ctx.fillStyle = CONFIG.colors.xp; ctx.fillText('МАКС', x + rowW - 16, y + rowH / 2 + 5); }
      else { ctx.fillStyle = afford ? CONFIG.colors.gold : CONFIG.colors.textDim; ctx.fillText('◆ ' + cost, x + rowW - 16, y + rowH / 2 + 5); }
      Game._shopRects.push({ x, y, w: rowW, h: rowH });
      y += rowH + gap;
    }
  },

  drawDraft(ctx) {
    const W = Game.viewW, H = Game.viewH;
    this.dim(ctx, 0.72);
    ctx.textAlign = 'center';
    const isEv = Game._draftIsEvent;
    ctx.fillStyle = isEv ? CONFIG.colors.boss : CONFIG.colors.gold;
    ctx.font = 'bold 30px Consolas, monospace';
    ctx.fillText(isEv ? 'РАЗВИЛКА ТЬМЫ' : 'УРОВЕНЬ ' + Game.player.level, W / 2, H * 0.2);
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText(isEv ? 'выбери путь  ·  без правильного ответа  ·  1 / 2 / 3'
                      : 'выбери улучшение  ·  1 / 2 / 3  или  клик', W / 2, H * 0.2 + 28);

    const n = Game.offers.length;
    const cw = 200, gap = 26, ch = 248;
    const totalW = n * cw + (n - 1) * gap;
    const x0 = (W - totalW) / 2;
    const y0 = H * 0.3;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (cw + gap);
      this.drawCard(ctx, Game.offers[i], x, y0, cw, ch, i === Game.selIndex);
    }
    Game._cardRects = [];
    for (let i = 0; i < n; i++)
      Game._cardRects.push({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch });
  },

  offerDisplay(o) {
    if (o.type === 'event') {
      const d = o.def;
      return { icon: d.icon, color: d.color, name: d.name, kind: 'РАЗВИЛКА',
               desc: d.desc, lvl: 0, isNew: false };
    }
    if (o.type === 'evolve') {
      const d = CONFIG.evolutions[o.into];
      return { icon: d.icon, color: d.color, name: d.name, kind: '★ ЭВОЛЮЦИЯ ★',
               desc: d.desc, lvl: 0, isNew: false, evo: true };
    }
    if (o.type === 'weapon') {
      const d = CONFIG.weapons[o.key];
      return { icon: d.icon, color: d.color, name: d.name, kind: 'ОРУЖИЕ',
               desc: o.isNew ? d.desc : 'Ур. ' + (o.resLvl - 1) + ' → ' + o.resLvl, lvl: o.resLvl, isNew: o.isNew };
    }
    if (o.type === 'passive') {
      const d = CONFIG.passives[o.key];
      return { icon: d.icon, color: d.color, name: d.name, kind: 'ПАССИВ',
               desc: o.isNew ? d.desc : 'Ур. ' + (o.resLvl - 1) + ' → ' + o.resLvl, lvl: o.resLvl, isNew: o.isNew };
    }
    return { icon: '✚', color: CONFIG.colors.xp, name: 'Лечение', kind: 'БОНУС',
             desc: 'Восстановить 40% HP', lvl: 0, isNew: false };
  },

  drawCard(ctx, o, x, y, w, h, sel) {
    const d = this.offerDisplay(o);
    const evo = d.evo;
    ctx.fillStyle = sel ? 'rgba(255,255,255,0.10)' : (evo ? 'rgba(255,208,118,0.07)' : 'rgba(255,255,255,0.04)');
    ctx.fillRect(x, y, w, h);
    // эволюция светится постоянно (пейофф читается сразу), выбор — усиливает
    if (evo || sel) {
      ctx.globalCompositeOperation = 'lighter';
      const g = Render.glowDot(d.color, evo ? 52 : 40);
      Render.blit(ctx, g, x + w / 2, y + 70, 0, 1, evo ? (sel ? 0.5 : 0.32) : 0.35);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = (sel || evo) ? d.color : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = sel ? 3 : (evo ? 2.5 : 1.5);
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = d.color;
    ctx.font = '52px serif';
    ctx.fillText(d.icon, x + w / 2, y + 86);

    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText(d.kind + (d.isNew ? '  ·  НОВОЕ' : ''), x + w / 2, y + 118);

    ctx.fillStyle = CONFIG.colors.text;
    ctx.font = 'bold 21px Consolas, monospace';
    ctx.fillText(d.name, x + w / 2, y + 150);

    // описание (перенос)
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '13px Consolas, monospace';
    this.wrapText(ctx, d.desc, x + w / 2, y + 180, w - 28, 18);

    // пипы уровня
    if (d.lvl > 0) {
      const pipW = 14, total = 5 * pipW, sx = x + w / 2 - total / 2;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < d.lvl ? d.color : 'rgba(255,255,255,0.12)';
        ctx.fillRect(sx + i * pipW, y + h - 26, pipW - 4, 6);
      }
    }
  },

  wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy); line = wd; yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  },

  drawPaused(ctx) {
    this.dim(ctx, 0.74);
    const W = Game.viewW, H = Game.viewH, p = Game.player;
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.text;
    ctx.font = 'bold 44px Consolas, monospace';
    ctx.fillText('ПАУЗА', W / 2, H * 0.22);

    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('Ур. ' + p.level + '   ·   ' + fmtTime(Game.time) + '   ·   ☠ ' + p.kills + '   ·   свет ' + Math.round(p.light),
                 W / 2, H * 0.22 + 34);

    // билд: оружие
    ctx.fillStyle = CONFIG.colors.textDim; ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText('ОРУЖИЕ', W / 2, H * 0.36 - 12);
    let sx = W / 2 - (p.weapons.length * 30) / 2;
    for (const w of p.weapons) { const def = weaponDef(w.key); this.drawSlot(ctx, sx, H * 0.36, def.icon, def.color, w.level); sx += 30; }

    // билд: пассивы
    const pk = Object.keys(p.passives);
    ctx.fillStyle = CONFIG.colors.textDim; ctx.font = 'bold 12px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('ПАССИВЫ', W / 2, H * 0.46 - 12);
    if (pk.length) {
      let sx2 = W / 2 - (pk.length * 30) / 2;
      for (const key of pk) { const def = CONFIG.passives[key]; this.drawSlot(ctx, sx2, H * 0.46, def.icon, def.color, p.passives[key]); sx2 += 30; }
    } else { ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace'; ctx.fillText('—', W / 2, H * 0.46 + 16); }

    // громкость (полоса кликабельна — клик задаёт уровень)
    const bw = 160, bx = W / 2 - bw / 2, by = H * 0.6;
    ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace';
    ctx.fillText('громкость', W / 2, by - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = CONFIG.colors.player; ctx.fillRect(bx, by, bw * Audio2.volume, 8);
    Game._volRect = { x: bx, y: by - 8, w: bw, h: 24 };
    ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '12px Consolas, monospace';
    ctx.fillText('[  −    +  ]   ·   M — без звука', W / 2, by + 28);

    // кликабельные кнопки продолжить / в меню
    const btnY = H * 0.74, bh = 30;
    const contW = 220, quitW = 180;
    const contX = W / 2 - contW - 12, quitX = W / 2 + 12;
    const contHover = this._hover(contX, btnY - bh / 2, contW, bh);
    const quitHover = this._hover(quitX, btnY - bh / 2, quitW, bh);
    ctx.lineWidth = 1.5; ctx.font = '16px Consolas, monospace';
    ctx.strokeStyle = contHover ? CONFIG.colors.player : 'rgba(255,255,255,0.2)';
    ctx.strokeRect(contX, btnY - bh / 2, contW, bh);
    ctx.fillStyle = contHover ? CONFIG.colors.player : CONFIG.colors.text;
    ctx.fillText('▶ ПРОДОЛЖИТЬ (ESC)', contX + contW / 2, btnY + 5);
    ctx.strokeStyle = quitHover ? CONFIG.colors.danger : 'rgba(255,255,255,0.2)';
    ctx.strokeRect(quitX, btnY - bh / 2, quitW, bh);
    ctx.fillStyle = quitHover ? CONFIG.colors.danger : CONFIG.colors.text;
    ctx.fillText('В МЕНЮ (Q)', quitX + quitW / 2, btnY + 5);
    Game._pauseRects = { resume: { x: contX, y: btnY - bh / 2, w: contW, h: bh },
                         quit:   { x: quitX, y: btnY - bh / 2, w: quitW, h: bh } };
  },

  _hover(x, y, w, h) {
    return Input.mouseX >= x && Input.mouseX <= x + w && Input.mouseY >= y && Input.mouseY <= y + h;
  },

  drawGameOver(ctx) {
    this.dim(ctx, 0.74);
    this.drawResults(ctx, 'ТЫ ПАЛ', CONFIG.colors.danger);
  },

  drawWin(ctx) {
    this.dim(ctx, 0.74);
    const finale = Game.depthIndex >= CONFIG.depths.length;   // покорено самое дно
    this.drawResults(ctx, finale ? 'ДНО ТЬМЫ ПОКОРЕНО' : 'ТЫ ВЫЖИЛ!', finale ? CONFIG.colors.gold : CONFIG.colors.xp);
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'italic 18px Consolas, monospace';
    ctx.fillText(finale ? '★ Тьмы больше нет. Ты — вечный Рассвет. ★'
                        : 'Свет одолел тьму. Стал рассветом.', Game.viewW / 2, Game.viewH * 0.28 + 34);
  },

  drawResults(ctx, title, color) {
    const W = Game.viewW, H = Game.viewH, p = Game.player;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 52px Consolas, monospace';
    ctx.fillText(title, W / 2, H * 0.28);

    const rows = [
      ['Прожито', fmtTime(Game.time)],
      ['Уровень', p.level],
      ['Убито', p.kills],
      ['Очки', Game.score],
      ['Золото', '+' + Game.runGold],
    ];
    ctx.font = '20px Consolas, monospace';
    let y = H * 0.42;
    for (const [k, v] of rows) {
      ctx.textAlign = 'right'; ctx.fillStyle = CONFIG.colors.textDim;
      ctx.fillText(k, W / 2 - 14, y);
      ctx.textAlign = 'left'; ctx.fillStyle = CONFIG.colors.text;
      ctx.fillText('' + v, W / 2 + 14, y);
      y += 32;
    }
    // разблокировки этого забега
    if (Game.newUnlocks && Game.newUnlocks.length) {
      const names = Game.newUnlocks.map(k => {
        const wd = CONFIG.weapons[k] || CONFIG.evolutions[k];
        const ch = CONFIG.characters[k];
        return wd ? wd.name : (ch ? ch.name : k);
      }).join(', ');
      ctx.fillStyle = CONFIG.colors.xp; ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillText('✦ ОТКРЫТО: ' + names, W / 2, y + 6);
      y += 30;
    }

    ctx.textAlign = 'center';
    // кнопка рестарта (клик где угодно тоже работает)
    const rsHover = this._hover(W / 2 - 170, y + 6, 340, 28);
    ctx.fillStyle = rsHover ? CONFIG.colors.player : CONFIG.colors.text;
    ctx.font = '20px Consolas, monospace';
    const blink = (Math.floor(Game.clock * 2) % 2) === 0;
    if (blink || rsHover) ctx.fillText('▶  ПРОБЕЛ / КЛИК  —  ЕЩЁ ЗАБЕГ', W / 2, y + 24);
    // кликабельная кнопка меню
    const mHover = this._hover(W / 2 - 150, y + 38, 300, 26);
    ctx.fillStyle = mHover ? CONFIG.colors.gold : CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('M  /  клик  —  меню и магазин', W / 2, y + 52);
    Game._resultMenuRect = { x: W / 2 - 150, y: y + 38, w: 300, h: 26 };
  },
};
