// input.js — Keyboard, mouse (pointer lock), touch

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys   = new Set();
    this.dx = 0; this.dy = 0;        // accumulated mouse delta this frame
    this._dx = 0; this._dy = 0;      // raw accumulator
    this.mouseButtons = new Set();
    this.locked = false;
    this.scrollY = 0;

    document.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    document.addEventListener('keyup',   e => this.keys.delete(e.code));

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this._dx -= e.movementX;
      this._dy += e.movementY;
    });

    canvas.addEventListener('mousedown', e => this.mouseButtons.add(e.button));
    canvas.addEventListener('mouseup',   e => this.mouseButtons.delete(e.button));
    canvas.addEventListener('wheel', e => { this.scrollY += e.deltaY; e.preventDefault(); },
                            { passive: false });

    // Prevent right-click menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Call once per frame to snapshot deltas and reset accumulators
  poll() {
    this.dx = this._dx;
    this.dy = this._dy;
    this._dx = 0;
    this._dy = 0;
    const s = this.scrollY;
    this.scrollY = 0;
    return s;
  }

  is(code)   { return this.keys.has(code); }
  mouse(btn) { return this.mouseButtons.has(btn); }

  axis(neg, pos) {
    return (this.is(pos) ? 1 : 0) - (this.is(neg) ? 1 : 0);
  }
}
