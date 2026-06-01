/* =====================================================================
   RENDER — неоновый рендер через кэш glow-спрайтов.
   Спрайты рендерятся один раз в offscreen-canvas и переиспользуются
   через drawImage (быстро), вместо shadowBlur каждый кадр.
   ===================================================================== */

const Render = {
  spriteCache: new Map(),

  // Глоу-точка (радиальный градиент) — для частиц, снарядов, осколков
  glowDot(color, radius) {
    const key = 'dot|' + color + '|' + radius;
    let c = this.spriteCache.get(key);
    if (c) return c;
    const pad = radius * 3;
    const size = Math.ceil(pad * 2);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const cx = size / 2;
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, pad);
    grd.addColorStop(0, color);
    grd.addColorStop(0.25, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cx, pad, 0, TAU);
    g.fill();
    c._off = cx;
    this.spriteCache.set(key, c);
    return c;
  },

  // Неоновая фигура с обводкой и свечением (враги, игрок)
  glowShape(color, radius, shape) {
    const key = 'shape|' + color + '|' + radius + '|' + shape;
    let c = this.spriteCache.get(key);
    if (c) return c;
    const pad = radius + 14;
    const size = Math.ceil(pad * 2);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const cx = size / 2;
    g.translate(cx, cx);

    // мягкое внешнее свечение
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.lineWidth = 2.5;
    g.strokeStyle = color;
    g.fillStyle = this._fillFor(color);

    this._path(g, radius, shape);
    g.fill();
    g.stroke();

    // яркое ядро
    g.shadowBlur = 0;
    g.globalAlpha = 0.9;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    this._path(g, radius * 0.5, shape);
    g.fill();

    c._off = cx;
    this.spriteCache.set(key, c);
    return c;
  },

  _fillFor(color) {
    // полупрозрачная заливка того же оттенка
    return 'rgba(0,0,0,0.35)';
  },

  _path(g, r, shape) {
    g.beginPath();
    if (shape === 'tri') {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * TAU / 3;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    } else if (shape === 'diamond') {
      g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath();
    } else if (shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    } else if (shape === 'square') {
      g.rect(-r, -r, r * 2, r * 2);
    } else { // circle
      g.arc(0, 0, r, 0, TAU);
    }
  },

  // Нарисовать кэш-спрайт с центром в (x,y), опц. поворот/масштаб/альфа
  blit(ctx, sprite, x, y, rot = 0, scale = 1, alpha = 1) {
    const off = sprite._off;
    ctx.globalAlpha = alpha;
    if (rot === 0 && scale === 1) {
      ctx.drawImage(sprite, x - off, y - off);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.drawImage(sprite, -off, -off);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};
