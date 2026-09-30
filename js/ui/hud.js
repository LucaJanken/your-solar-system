// The interface around the view: hiding all of it, and telling a click or tap on the view from a
// drag, a pinch or a long drag that happens to end where it began.

/**
 * Hides the whole HUD (H or the eye button), leaving the view and its labels. Turning, zooming and
 * picking bodies go on working; only a click or tap on empty space brings the interface back (see
 * onTap). A hint says so for a few seconds. Not remembered: every visit starts with it shown.
 */
export class HudVisibility {
  constructor(app, hint, onChange) {
    this.app = app; this.hint = hint; this.onChange = onChange;
    this.hidden = false;
    this.timer = 0;
    // the pointer last used decides between "click" and "tap"; until then, the device's main one
    this.touch = matchMedia('(hover: none)').matches;
    window.addEventListener('pointerdown', e => { this.touch = e.pointerType !== 'mouse'; }, { capture: true, passive: true });
  }

  toggle(byKey = false) { this.set(!this.hidden, byKey); }

  set(hidden, byKey = false) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.app.classList.toggle('hud-off', hidden);
    clearTimeout(this.timer);
    if (hidden) {
      // focus must not stay on a button nobody can see
      if (this.app.contains(document.activeElement)) document.activeElement.blur();
      const touch = this.touch && !byKey;
      this.hint.textContent = touch ? 'Tap empty space to show the interface' : 'Click empty space or press H to show the interface';
      this.hint.classList.add('on');
      this.timer = setTimeout(() => this.hint.classList.remove('on'), 3000);
    } else this.hint.classList.remove('on');
    this.onChange(hidden);
  }
}

/**
 * Calls `cb(event)` for a click or tap on `el`: one primary pointer, pressed and released without
 * moving more than `slop` px at any time in between. A drag that returns to where it began, a pinch
 * or a two-finger drag (a second pointer at any point) and a right- or middle-button drag (which pan)
 * are not taps.
 */
export function onTap(el, cb, slop = 5) {
  const down = new Map();   // pointerId → where it went down
  let spoilt = false;
  el.addEventListener('pointerdown', e => {
    if (!down.size) spoilt = false;
    down.set(e.pointerId, [e.clientX, e.clientY]);
    if (down.size > 1 || e.button !== 0) spoilt = true;
  });
  window.addEventListener('pointermove', e => {
    const p = down.get(e.pointerId);
    if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > slop) spoilt = true;
  }, { passive: true });
  window.addEventListener('pointerup', e => {
    if (!down.delete(e.pointerId)) return;
    if (!spoilt && !down.size && e.target === el) cb(e);
  }, { passive: true });
  window.addEventListener('pointercancel', e => { if (down.delete(e.pointerId)) spoilt = true; }, { passive: true });
}
