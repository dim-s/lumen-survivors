/* =====================================================================
   INPUT — клавиатура + мышь. Нормализованный вектор движения.
   ===================================================================== */

const Input = {
  keys: {},
  mouseX: 0, mouseY: 0,
  mouseDown: false,
  clicked: false,        // одиночный клик в этом кадре (UI)
  pressed: {},           // нажатия-в-этом-кадре (для меню)

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
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width) / (window.devicePixelRatio || 1);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height) / (window.devicePixelRatio || 1);
    });
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; this.clicked = true; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
  },

  _norm(k) { return k.length === 1 ? k.toLowerCase() : k.toLowerCase(); },

  // Вектор движения из WASD/стрелок, нормализованный
  moveVector() {
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
