// The info card: the focused body's description, in a speech bubble beside it while the camera is
// close (main.js decides when and where, and moves the view aside to make room). It is drawn as if
// it hung in space next to the body: scaled with the body's size on screen, about the body, but
// always upright and facing the viewer. With the card on, it stands in for the information panel,
// which a click anywhere on it opens (its More data names that; × closes the card instead).
//
// The bubble and its tail are one outline: an SVG path draws its fill and edge, and the same shape
// clips the element, so the blur behind it ends at the outline too (a CSS border cannot follow a tail,
// and a tail laid over a translucent box doubled the tint where the two overlapped).
import { BY_NAME } from '../data/bodies.js';

export const TAIL = 13;   // px from the bubble's edge to the tail's tip
const BASE = 9;           // half the width of the tail where it leaves the bubble
const PERSPECTIVE = 2.5;  // the viewer's distance for a tilted card, in bubble widths
const FADE_MS = 350;      // the card's fade (.card's opacity transition)

export class InfoCard {
  constructor(el, { onClose, onMore }) {
    this.el = el;
    this.body = el.querySelector('.card-body');
    this.shape = el.querySelector('.card-shape');
    this.path = this.shape.querySelector('path');
    this.name = el.querySelector('.card-name');
    this.type = el.querySelector('.card-type');
    this.desc = el.querySelector('.card-desc');
    this.current = null;   // the body whose text is in the card
    this.next = null;      // the body it is about (show), and the width to set out its text at (setWidth)
    this.width = null;
    this.alpha = -1;
    this.hiddenAt = -Infinity;
    this.drawn = '';
    el.addEventListener('transitionend', e => { if (e.target === el && e.propertyName === 'opacity' && this.alpha === 0) this.apply(); });
    el.querySelector('.card-close').addEventListener('click', e => { e.stopPropagation(); onClose(); });
    // (not the click that ends dragging across the text to select it)
    el.addEventListener('click', () => { if (getSelection().isCollapsed) onMore(); });
  }

  // A newly chosen body's text and width wait while the card fades out where it was, so they do not
  // appear in the previous body's card; they are put in once it is gone, or as it shows again.
  show(name) {
    this.next = name;
    if (this.gone()) this.apply();
  }

  setWidth(w) {
    this.width = w;
    if (this.gone()) this.apply();
  }

  gone() { return this.alpha <= 0 && performance.now() - this.hiddenAt >= FADE_MS; }

  apply() {
    if (this.next !== this.current) this.fill(this.current = this.next);
    const w = this.width ? this.width + 'px' : '';
    if (this.body.style.width !== w) this.body.style.width = w;
  }

  fill(name) {
    const d = BY_NAME[name];
    this.name.textContent = d.name;
    this.type.textContent = d.type;
    this.desc.textContent = d.desc;
    this.el.setAttribute('aria-label', 'About ' + d.name);
  }

  /** the bubble's size (without its tail) at a given width (px), or as styled with none, with the text
   * of the body it is about (shown or still to come) */
  measure(width = null) {
    const s = this.body.style, old = s.width, swap = this.next !== this.current;
    if (swap) this.fill(this.next);
    s.width = width ? width + 'px' : '';
    const r = { w: this.body.offsetWidth, h: this.body.offsetHeight };
    s.width = old;
    if (swap) this.fill(this.current);
    return r;
  }

  /**
   * Places the bubble's top left corner at (x, y) (px in the view), drawn `scale` times its size, its
   * tail on its left side ('left') or bottom ('down') pointing toward (px, py), the body's centre,
   * and fades it to `alpha` (0 hides it; the fade is CSS). `tilt`: degrees about the screen's x and y
   * axes, turned about the tail's tip, in a perspective of PERSPECTIVE bubble widths (main.js swings it).
   */
  set(x, y, alpha, side = 'left', px = 0, py = 0, scale = 1, tilt = [0, 0]) {
    if (alpha > 0) {
      this.apply();
      const w = this.body.offsetWidth, h = this.body.offsetHeight, left = side === 'left';
      // the tail leaves the bubble across from the body's centre (kept off the corners) and leans toward it
      const along = (left ? py - y : px - x) / scale, len = left ? h : w;
      const b = Math.round(Math.max(BASE + 6, Math.min(len - BASE - 6, along)));
      const tip = Math.round(b + Math.max(-10, Math.min(10, (along - b) * 0.4)));
      const key = [side, w, h, b, tip].join();
      if (key !== this.drawn) {
        this.drawn = key;
        // the outline in the element's own pixels: the bubble, after the tail if that is on the left
        const X = left ? TAIL : 0, W = X + w, H = left ? h : h + TAIL;
        const pts = [[X, 0], [W, 0], [W, h]];
        if (left) pts.push([X, h], [X, b + BASE], [0, tip], [X, b - BASE]);
        else pts.push([b + BASE, h], [tip, H], [b - BASE, h], [0, h]);
        this.el.style.width = W + 'px'; this.el.style.height = H + 'px';
        this.el.classList.toggle('tail-left', left);
        this.el.style.clipPath = `polygon(${pts.map(([a, c]) => a + 'px ' + c + 'px').join(',')})`;
        // the edge drawn half a pixel inside the clip, so its 1 px line is crisp and whole
        this.shape.setAttribute('viewBox', `0 0 ${W} ${H}`);
        this.path.setAttribute('d', 'M' + pts.map(([a, c]) => (a + Math.sign(W / 2 - a) * 0.5) + ' ' + (c + Math.sign(H / 2 - c) * 0.5)).join('L') + 'Z');
        this.tip = left ? [0, tip] : [tip, H];
      }
      let tf = `translate(${(left ? x - TAIL * scale : x).toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      // (flat when still, so the text is drawn as crisply as without any tilt)
      if (Math.abs(tilt[0]) + Math.abs(tilt[1]) > 0.01) {
        const [tx, ty] = this.tip;
        tf += ` translate(${tx}px, ${ty}px) perspective(${PERSPECTIVE * w}px) rotateX(${tilt[0].toFixed(2)}deg) rotateY(${tilt[1].toFixed(2)}deg) translate(${-tx}px, ${-ty}px)`;
      }
      this.el.style.transform = tf;
    }
    const a = Math.round(alpha * 50) / 50;
    if (a === this.alpha) return;
    this.alpha = a;
    if (a === 0) this.hiddenAt = performance.now();
    this.el.style.opacity = a;
    // only answers the pointer (and the keyboard) when it can be read
    this.el.classList.toggle('on', a > 0.5);
    this.el.classList.toggle('off', a === 0);
  }
}
