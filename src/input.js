// Keyboard (arrows / WASD / space) and touch swipe input -> discrete actions.
export class Input {
  constructor(target) {
    this.queue = [];
    this.enabled = false;
    this.onPause = null;
    window.addEventListener('keydown', (e) => {
      const map = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
        ArrowDown: 'slide', KeyS: 'slide',
      };
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
        return;
      }
      const a = map[e.code];
      if (a && this.enabled) {
        e.preventDefault();
        if (!e.repeat) this.queue.push(a);
      }
    });

    let sx = 0, sy = 0, st = 0, fired = false;
    target.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = performance.now();
      fired = false;
    }, { passive: true });
    target.addEventListener('touchmove', (e) => {
      if (!this.enabled || fired) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const th = Math.min(40, window.innerWidth * 0.06);
      if (Math.abs(dx) > th || Math.abs(dy) > th) {
        this.queue.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'slide' : 'jump');
        fired = true; // fire mid-swipe for responsiveness
      }
    }, { passive: false });
    target.addEventListener('touchend', () => {
      // quick tap = jump
      if (this.enabled && !fired && performance.now() - st < 200) this.queue.push('jump');
    }, { passive: true });
  }

  consume() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
