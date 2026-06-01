/* =====================================================================
   INPUT — клавиатура, мышь и СЕНСОР (плавающий джойстик).
   На телефоне: первый палец = база джойстика, драг от базы = вектор
   движения; тап = клик по UI. Без библиотек.
   ===================================================================== */

const Input = {
  keys: {},
  mouseX: 0, mouseY: 0,
  mouseDown: false,
  clicked: false,        // одиночный клик/тап в этом кадре (UI)
  pressed: {},           // нажатия-в-этом-кадре (для меню)
  // сенсор
  isTouch: false,
  touchId: null,
  touchActive: false,
  baseX: 0, baseY: 0, curX: 0, curY: 0,
  deadzone: 14,
  maxRadius: 72,

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      const k = this._norm(e.key);
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[this._norm(e.key)] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    canvas.addEventListener('mousemove', (e) => {
      const p = this._toGame(e.clientX, e.clientY, canvas);
      this.mouseX = p.x; this.mouseY = p.y;
    });
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; this.clicked = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });

    // ----- сенсор -----
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isTouch = true;
      const t = e.changedTouches[0];
      const p = this._toGame(t.clientX, t.clientY, canvas);
      this.mouseX = p.x; this.mouseY = p.y;   // для UI-тапа (hover+click)
      this.clicked = true;
      if (this.touchId === null) {            // джойстик — первый палец
        this.touchId = t.identifier;
        this.touchActive = true;
        this.baseX = this.curX = p.x;
        this.baseY = this.curY = p.y;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          const p = this._toGame(t.clientX, t.clientY, canvas);
          this.curX = p.x; this.curY = p.y;
          this.mouseX = p.x; this.mouseY = p.y;
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) { this.touchId = null; this.touchActive = false; }
      }
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  },

  // клиентские координаты → игровые (логические px), не зависит от DPR
  _toGame(cx, cy, canvas) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (cx - r.left) * (Game.viewW / r.width),
      y: (cy - r.top) * (Game.viewH / r.height),
    };
  },

  _norm(k) { return k.toLowerCase(); },

  // Вектор движения: сенсор (если активен) или WASD/стрелки
  moveVector() {
    if (this.touchActive) {
      const dx = this.curX - this.baseX, dy = this.curY - this.baseY;
      const d = Math.hypot(dx, dy);
      if (d < this.deadzone) return { x: 0, y: 0 };
      const mag = Math.min(1, d / this.maxRadius);
      return { x: (dx / d) * mag, y: (dy / d) * mag };
    }
    let x = 0, y = 0;
    if (this.keys['w'] || this.keys['arrowup']) y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) y += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (x && y) { const inv = 1 / Math.SQRT2; x *= inv; y *= inv; }
    return { x, y };
  },

  wasPressed(k) { return !!this.pressed[k]; },

  // вызвать в конце кадра
  endFrame() {
    this.clicked = false;
    this.pressed = {};
  },
};
