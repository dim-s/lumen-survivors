/* =====================================================================
   UI — весь рендер: мир, HUD, оверлеи (меню / драфт / пауза / итоги).
   ===================================================================== */

const UI = {
  render(ctx) {
    const W = Game.viewW, H = Game.viewH;
    // вычислить тряску один раз за кадр
    if (Game.shake > 0) {
      Game.shakeX = rand(-Game.shake, Game.shake);
      Game.shakeY = rand(-Game.shake, Game.shake);
    } else { Game.shakeX = 0; Game.shakeY = 0; }

    ctx.fillStyle = CONFIG.colors.bg;
    ctx.fillRect(0, 0, W, H);

    if (Game.state === 'menu') { this.drawMenu(ctx); return; }
    if (Game.state === 'charselect') { this.drawCharSelect(ctx); return; }
    if (Game.state === 'shop') { this.drawShop(ctx); return; }

    this.drawGrid(ctx);
    this.drawWorld(ctx);
    this.drawDarkness(ctx);
    this.drawDarkGlints(ctx);
    this.drawVignette(ctx);
    this.drawHUD(ctx);
    this.drawBanner(ctx);
    if (Game.state === 'playing') this.drawJoystick(ctx);

    if (Game.state === 'levelup') this.drawDraft(ctx);
    else if (Game.state === 'paused') this.drawPaused(ctx);
    else if (Game.state === 'gameover') this.drawGameOver(ctx);
    else if (Game.state === 'win') this.drawWin(ctx);
  },

  // координаты мир->экран
  sx(x) { return x - Game.player.x + Game.viewW / 2 + Game.shakeX; },
  sy(y) { return y - Game.player.y + Game.viewH / 2 + Game.shakeY; },

  drawGrid(ctx) {
    const W = Game.viewW, H = Game.viewH, g = 64;
    const px = Game.player.x, py = Game.player.y;
    const left = px - W / 2, top = py - H / 2;
    const fx = Math.floor(left / g) * g;
    const fy = Math.floor(top / g) * g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = fx; x < left + W + g; x += g) {
      const s = x - px + W / 2 + Game.shakeX;
      ctx.moveTo(s, 0); ctx.lineTo(s, H);
    }
    for (let y = fy; y < top + H + g; y += g) {
      const s = y - py + H / 2 + Game.shakeY;
      ctx.moveTo(0, s); ctx.lineTo(W, s);
    }
    ctx.strokeStyle = CONFIG.colors.grid;
    ctx.stroke();
  },

  drawWorld(ctx) {
    // ----- pickups -----
    ctx.globalCompositeOperation = 'lighter';
    for (const k of Game.pickups.active) {
      if (k.dead) continue;
      const r = k.type === 'xpbig' ? 7 : k.type === 'gold' ? 6 : 4;
      const dot = Render.glowDot(k.color, r);
      Render.blit(ctx, dot, this.sx(k.x), this.sy(k.y), 0, 1, 0.95);
    }
    ctx.globalCompositeOperation = 'source-over';

    // ----- nova-эффекты (под врагами) -----
    for (const e of Game.effects) {
      if (e.kind !== 'nova') continue;
      const a = clamp(e.life / e.maxLife, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 3 + a * 7;
      ctx.beginPath();
      ctx.arc(this.sx(e.x), this.sy(e.y), e.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // ----- враги -----
    const t = Game.time;
    for (const e of Game.enemies.active) {
      if (e.dead) continue;
      const X = this.sx(e.x), Y = this.sy(e.y);
      if (X < -60 || X > Game.viewW + 60 || Y < -60 || Y > Game.viewH + 60) continue;
      const spr = Render.glowShape(e.color, e.radius, e.shape);
      const rot = e.isBoss ? t * 0.4 : (e.wob + t * 0.8);
      Render.blit(ctx, spr, X, Y, rot, 1, 1);
      // hp-бар у танков и боссов
      if (e.isBoss) this.drawBossBar(ctx, e);
      else if (e.typeKey === 'tank' && e.hp < e.maxHp) {
        const w = e.radius * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(X - w / 2, Y - e.radius - 9, w, 4);
        ctx.fillStyle = CONFIG.colors.hp;
        ctx.fillRect(X - w / 2, Y - e.radius - 9, w * (e.hp / e.maxHp), 4);
      }
      // флеш при попадании
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const fd = Render.glowDot('#ffffff', e.radius * 0.9);
        Render.blit(ctx, fd, X, Y, 0, 1, clamp(e.flash / CONFIG.feel.hitFlash, 0, 1) * 0.8);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // ----- снаряды -----
    ctx.globalCompositeOperation = 'lighter';
    for (const p of Game.projectiles.active) {
      if (p.dead) continue;
      const X = this.sx(p.x), Y = this.sy(p.y);
      if (p.kind === 'bolt') {
        const dot = Render.glowDot(p.color, p.radius);
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.scale(1.7, 0.8);
        ctx.drawImage(dot, -dot._off, -dot._off);
        ctx.restore();
      } else if (p.kind === 'mine') {
        const dot = Render.glowDot(p.color, 5);
        Render.blit(ctx, dot, X, Y, 0, 1 + Math.sin(Game.clock * 8) * 0.15, 0.95);
        ctx.strokeStyle = 'rgba(255,210,122,0.14)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X, Y, p.trigger, 0, TAU); ctx.stroke();
      } else {
        Render.blit(ctx, Render.glowDot(p.color, p.radius), X, Y, 0, 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // ----- цепь-молния -----
    for (const e of Game.effects) {
      if (e.kind !== 'chain') continue;
      const a = clamp(e.life / e.maxLife, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = e.color; ctx.globalAlpha = a; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < e.pts.length; i++) {
        const sx = this.sx(e.pts[i].x), sy = this.sy(e.pts[i].y);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // ----- whip-эффекты -----
    for (const e of Game.effects) {
      if (e.kind !== 'whip') continue;
      const a = clamp(e.life / e.maxLife, 0, 1);
      const X = this.sx(e.x), Y = this.sy(e.y);
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(e.ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.85;
      const grd = ctx.createLinearGradient(0, 0, e.len, 0);
      grd.addColorStop(0, e.color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, -e.wide * 0.3);
      ctx.quadraticCurveTo(e.len * 0.6, -e.wide, e.len, 0);
      ctx.quadraticCurveTo(e.len * 0.6, e.wide, 0, e.wide * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // ----- орбита (щиты) -----
    for (const w of Game.player.weapons) {
      if (w._nodes && weaponDef(w.key).kind === 'orbit') {
        const def = weaponDef(w.key);
        const spr = Render.glowShape(def.color, def.radius, 'circle');
        for (let i = 0; i < w._nodeCount; i++) {
          const nd = w._nodes[i];
          ctx.globalCompositeOperation = 'lighter';
          Render.blit(ctx, spr, this.sx(nd.x), this.sy(nd.y), t * 3, 1, 0.95);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    // ----- игрок -----
    this.drawPlayer(ctx);

    // ----- частицы -----
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of Game.particles.active) {
      if (pt.dead) continue;
      const dot = Render.glowDot(pt.color, pt.size);
      Render.blit(ctx, dot, this.sx(pt.x), this.sy(pt.y), 0, pt.fade, pt.fade);
    }
    ctx.globalCompositeOperation = 'source-over';

    // ----- числа урона -----
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

  drawPlayer(ctx) {
    const p = Game.player;
    const X = this.sx(p.x), Y = this.sy(p.y);
    let alpha = 1;
    if (p.invuln > 0) alpha = (Math.floor(Game.time * 20) % 2) ? 0.35 : 1;
    const spr = Render.glowShape(CONFIG.colors.player, p.radius, 'diamond');
    const ang = Math.atan2(p.lastDir.y, p.lastDir.x) + Math.PI / 2;
    Render.blit(ctx, spr, X, Y, ang, 1, alpha);
    // яркое ядро
    ctx.globalCompositeOperation = 'lighter';
    const core = Render.glowDot(CONFIG.colors.playerCore, 5 + Math.sin(Game.time * 6) * 1.2);
    Render.blit(ctx, core, X, Y, 0, 1, alpha);
    // радиус подбора (еле заметно)
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,206,94,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(X, Y, p.pickupRadius, 0, TAU);
    ctx.stroke();
  },

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

  // наступающая тьма: ясно в радиусе света игрока, темно за его краем
  drawDarkness(ctx) {
    const p = Game.player;
    const W = Game.viewW, H = Game.viewH;
    const cx = W / 2 + Game.shakeX, cy = H / 2 + Game.shakeY;
    const r = p.light;
    const grd = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r * 1.28);
    grd.addColorStop(0, 'rgba(3,4,10,0)');
    grd.addColorStop(0.55, 'rgba(3,4,10,0.45)');
    grd.addColorStop(0.85, 'rgba(2,3,8,0.86)');
    grd.addColorStop(1, 'rgba(1,2,6,0.975)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    // тёплый ореол на самой кромке света
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, cy, r * 0.86, cx, cy, r * 1.04);
    halo.addColorStop(0, 'rgba(255,206,94,0)');
    halo.addColorStop(0.7, 'rgba(255,176,80,0.05)');
    halo.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
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

  // глинты поверх тьмы: враги — точки-угрозы, осколки — награда видны в темноте
  drawDarkGlints(ctx) {
    const L = CONFIG.light, W = Game.viewW, H = Game.viewH;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of Game.enemies.active) {
      if (e.dead) continue;
      const X = this.sx(e.x), Y = this.sy(e.y);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const r = e.isBoss ? L.glintRadius * 2.6 : (e.radius > 18 ? L.glintRadius * 1.5 : L.glintRadius);
      Render.blit(ctx, Render.glowDot(e.color, r), X, Y, 0, 1, L.glintAlpha);
    }
    for (const k of Game.pickups.active) {
      if (k.dead) continue;
      const X = this.sx(k.x), Y = this.sy(k.y);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      Render.blit(ctx, Render.glowDot(k.color, k.type === 'xpbig' ? 5 : 4), X, Y, 0, 1, 0.85);
    }
    // снаряды видны в темноте (куда летят пули; вражеские — ярче, чтоб уклоняться)
    for (const pr of Game.projectiles.active) {
      if (pr.dead || pr.kind === 'mine') continue;
      const X = this.sx(pr.x), Y = this.sy(pr.y);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      Render.blit(ctx, Render.glowDot(pr.color, L.glintRadius), X, Y, 0, 1, pr.hostile ? L.shotGlintAlpha : L.glintAlpha);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  drawVignette(ctx) {
    const p = Game.player;
    const frac = p.hp / p.maxHp;
    if (frac >= 0.35) return;
    const W = Game.viewW, H = Game.viewH;
    const intensity = (0.35 - frac) / 0.35;
    const pulse = 0.5 + 0.5 * Math.sin(Game.time * 6);
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    grd.addColorStop(0, 'rgba(255,30,60,0)');
    grd.addColorStop(1, 'rgba(255,30,60,' + (0.28 * intensity * (0.6 + 0.4 * pulse)).toFixed(3) + ')');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
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
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.font = '17px Consolas, monospace';
    ctx.fillText('M  —  магазин света', W / 2, H * 0.56 + 34);

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
    const n = keys.length, cw = 250, gap = 32, ch = 270;
    const totalW = n * cw + (n - 1) * gap, x0 = (W - totalW) / 2, y0 = H * 0.3;
    Game._charRects = [];
    for (let i = 0; i < n; i++) {
      const c = CONFIG.characters[keys[i]];
      const x = x0 + i * (cw + gap);
      const sel = i === Game.charIndex;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(x, y0, cw, ch);
      if (sel) {
        ctx.globalCompositeOperation = 'lighter';
        Render.blit(ctx, Render.glowDot(c.color, 48), x + cw / 2, y0 + 84, 0, 1, 0.4);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = sel ? c.color : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeRect(x, y0, cw, ch);
      ctx.fillStyle = c.color; ctx.font = '60px serif'; ctx.textAlign = 'center';
      ctx.fillText(c.icon, x + cw / 2, y0 + 104);
      ctx.fillStyle = CONFIG.colors.text; ctx.font = 'bold 24px Consolas, monospace';
      ctx.fillText(c.name, x + cw / 2, y0 + 150);
      ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace';
      this.wrapText(ctx, c.desc, x + cw / 2, y0 + 182, cw - 30, 18);
      Game._charRects.push({ x, y: y0, w: cw, h: ch });
    }
  },

  drawShop(ctx) {
    const W = Game.viewW, H = Game.viewH;
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'bold 40px Consolas, monospace';
    ctx.fillText('МАГАЗИН СВЕТА', W / 2, H * 0.12);
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
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.font = 'bold 30px Consolas, monospace';
    ctx.fillText('УРОВЕНЬ ' + Game.player.level, W / 2, H * 0.2);
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('выбери улучшение  ·  1 / 2 / 3  или  клик', W / 2, H * 0.2 + 28);

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
    if (o.type === 'evolve') {
      const d = CONFIG.evolutions[o.into];
      return { icon: d.icon, color: d.color, name: d.name, kind: '★ ЭВОЛЮЦИЯ ★',
               desc: d.desc, lvl: 0, isNew: false, evo: true };
    }
    if (o.type === 'weapon') {
      const d = CONFIG.weapons[o.key];
      return { icon: d.icon, color: d.color, name: d.name, kind: 'ОРУЖИЕ',
               desc: o.isNew ? d.desc : 'Усиление до ур. ' + o.resLvl, lvl: o.resLvl, isNew: o.isNew };
    }
    if (o.type === 'passive') {
      const d = CONFIG.passives[o.key];
      return { icon: d.icon, color: d.color, name: d.name, kind: 'ПАССИВ',
               desc: o.isNew ? d.desc : 'Усиление до ур. ' + o.resLvl, lvl: o.resLvl, isNew: o.isNew };
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

    // громкость
    const bw = 160, bx = W / 2 - bw / 2, by = H * 0.6;
    ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '13px Consolas, monospace';
    ctx.fillText('громкость', W / 2, by - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = CONFIG.colors.player; ctx.fillRect(bx, by, bw * Audio2.volume, 8);
    ctx.fillStyle = CONFIG.colors.textDim; ctx.font = '12px Consolas, monospace';
    ctx.fillText('[  −    +  ]   ·   M — без звука', W / 2, by + 28);

    ctx.fillStyle = CONFIG.colors.text; ctx.font = '16px Consolas, monospace';
    ctx.fillText('ESC / P — продолжить          Q — выйти в меню', W / 2, H * 0.74);
  },

  drawGameOver(ctx) {
    this.dim(ctx, 0.74);
    this.drawResults(ctx, 'ТЫ ПАЛ', CONFIG.colors.danger);
  },

  drawWin(ctx) {
    this.dim(ctx, 0.74);
    this.drawResults(ctx, 'ТЫ ВЫЖИЛ!', CONFIG.colors.xp);
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.player;
    ctx.font = 'italic 18px Consolas, monospace';
    ctx.fillText('Свет одолел тьму. Стал рассветом.', Game.viewW / 2, Game.viewH * 0.28 + 34);
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
    ctx.textAlign = 'center';
    ctx.fillStyle = CONFIG.colors.text;
    ctx.font = '20px Consolas, monospace';
    const blink = (Math.floor(Game.clock * 2) % 2) === 0;
    if (blink) ctx.fillText('▶  ПРОБЕЛ  —  ЕЩЁ ЗАБЕГ', W / 2, y + 24);
    ctx.fillStyle = CONFIG.colors.textDim;
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('M  —  меню и магазин', W / 2, y + 52);
  },
};
