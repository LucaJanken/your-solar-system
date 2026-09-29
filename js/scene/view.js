// Camera: orbit controls around the focused body, a floating origin, smooth focus changes.
//
// Floating origin: the focused body is always at the scene origin, and everything else is placed
// relative to it (subtracted in double precision on the CPU). GPU float32 precision is therefore
// best exactly where the camera is looking, from a 10 km moon to the whole Solar System.

import * as THREE from '../../vendor/three.min.js';

const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const _d = new THREE.Vector3(), _o = new THREE.Vector3();

export class View {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new THREE.OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomSpeed = 1.2;
    this.controls.listenToKeyEvents(window);
    // one finger turns the view about the focus (the stars wheel past, so it reads as moving
    // around it), two fingers pinch to zoom or drag to move the view sideways: _touchPan handles
    // those, OrbitControls ignores them (no mode for TWO)
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null };
    this.dom = dom;
    this.focus = 'Sun';
    // Locked, the camera travels with the focus body, also when the view has been moved sideways
    // off it: the offset is kept, so the body stays where it is on screen while time runs.
    this.lock = true;
    this.origin = [0, 0, 0];
    this.tween = null;
    // an explicit fly (distance and direction) gives way to the user; a glide does not need to,
    // since it only translates and adds the user's own rotation, zoom and pan on top
    this._yield = () => { if (this.tween && this.tween.cancelable) this.tween = null; };
    this.controls.addEventListener('start', this._yield);
    this._touchPan();
  }

  /**
   * Two fingers either pinch (zoom only) or drag (pan only), never both: OrbitControls' pan with
   * every drift of the fingers' midpoint during a pinch easily took the view off the body. Each
   * gesture is classified once, then kept until a finger is added or lifted. Nothing moves while it
   * is undecided; on the decision the view catches up with the fingers, so no motion is lost and
   * none goes the wrong way (a zoom shown and then undone reads as the view wanting to zoom).
   *
   * Measured from the gesture's start: the midpoint's travel `moved` and the change of separation
   * `stretched`. A drag moves the midpoint and keeps the separation; a pinch changes the separation
   * and, with one finger held still, moves the midpoint half as far. A drag is taken once the
   * midpoint has moved 10 px and more than 1.5 times the stretch. A pinch needs 20 px of stretch
   * and, unless the fingers clearly move apart or together (opposite directions, 8 px suffice), a
   * stretch at least 1.5 times the midpoint's travel. The wait matters for fingers side by side
   * dragged along their line: one finger usually starts first, and until the other follows, that
   * looks exactly like a pinch with one finger still. Across their line the same head start barely
   * changes the separation, which is why only that direction used to work.
   *
   * The fingers are judged together, once per frame (in update), not per pointer event: each
   * finger's move arrives as its own event, and in between only the first finger has moved.
   */
  _touchPan() {
    const touches = new Map();
    let g = null;
    const measure = () => {
      const [a, b] = touches.values();
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, sep: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    const regroup = () => {
      g = touches.size === 2 ? { start: measure(), from: [...touches.values()].map(p => ({ ...p })), mode: null } : null;
    };
    this.dom.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      regroup();
    });
    window.addEventListener('pointermove', e => {
      const p = touches.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
    }, { passive: true });
    const lift = e => { if (touches.delete(e.pointerId)) regroup(); };
    window.addEventListener('pointerup', lift, { passive: true });
    window.addEventListener('pointercancel', lift, { passive: true });
    this._touchStep = () => {
      if (!g) return;
      const m = measure();
      if (!g.mode) {
        const moved = Math.hypot(m.x - g.start.x, m.y - g.start.y), stretched = Math.abs(m.sep - g.start.sep);
        const [d1, d2] = [...touches.values()].map((p, i) => [p.x - g.from[i].x, p.y - g.from[i].y]);
        const opposed = d1[0] * d2[0] + d1[1] * d2[1] < 0 && Math.hypot(...d1) > 3 && Math.hypot(...d2) > 3;
        if (moved >= 10 && moved > 1.5 * stretched) g.mode = 'pan';
        else if (stretched >= (opposed ? 8 : 20) && (opposed || stretched >= 1.5 * moved)) g.mode = 'pinch';
        else return;
        g.last = g.start;
        this._yield();
      }
      if (g.mode === 'pan') this.panBy(m.x - g.last.x, m.y - g.last.y);
      else {
        // as OrbitControls zooms on a pinch; its update then keeps the distance within its limits
        const c = this.camera, t = this.controls.target;
        _o.subVectors(c.position, t).multiplyScalar(Math.pow(g.last.sep / Math.max(m.sep, 1), this.controls.zoomSpeed));
        c.position.copy(t).add(_o);
      }
      g.last = m;
    };
  }

  /** whether the view is on the focus body (target within 2% of the camera distance, a few pixels) or on its way there */
  centred() { return !!this.tween || this.controls.target.length() < 0.02 * this.distance(); }

  /** move camera and target sideways by (dx, dy) pixels so the scene follows the fingers, as OrbitControls pans */
  panBy(dx, dy) {
    const c = this.camera, t = this.controls.target;
    const k = 2 * this.distance() * Math.tan(c.fov * Math.PI / 360) / (this.dom.clientHeight || 1);
    _d.setFromMatrixColumn(c.matrix, 0).multiplyScalar(-dx * k);
    _o.setFromMatrixColumn(c.matrix, 1).multiplyScalar(dy * k);
    c.position.add(_d).add(_o); t.add(_d).add(_o);
  }

  distance() { return this.camera.position.distanceTo(this.controls.target); }

  /** move the view to a new focus body; the view does not jump, it travels from where it is */
  setFocus(name, disp, opts = {}) {
    const o = disp[name], old = this.origin;
    const shift = new THREE.Vector3(old[0] - o[0], old[1] - o[1], old[2] - o[2]);
    this.camera.position.add(shift); this.controls.target.add(shift);
    this.origin = o.slice();
    this.focus = name;
    if (opts.dist) this.flyTo(opts.dist, opts);
    else this.glide(opts);
  }

  /**
   * Translate the camera and its target together until the target is on the focus body (the
   * origin). Distance and viewing direction stay as they are, unless the camera would end up
   * inside or grazing the body (closer than `minDist`): then it backs off to `safeDist`.
   *
   * The travel eases in log space: the remaining distance, in units of the camera distance, is
   * (R + 1)^(1 − e) − 1, so a trip of a thousand camera distances takes about as long to settle as
   * one of ten, and the body arrives smoothly instead of rushing in over the last few frames.
   */
  glide({ minDist = 0, safeDist = minDist, ms } = {}) {
    const t = this.controls.target, D = this.distance();
    const R = t.length() / Math.max(D, 1e-12);
    if (R < 1e-6 && D >= minDist) { this.tween = null; return; }
    this.tween = {
      kind: 'glide', t0: performance.now(), cancelable: false,
      ms: ms || Math.min(1500, 950 + 160 * Math.log10(1 + R)),
      from: t.clone(), R, last: 1,
      fromDist: D, toDist: D < minDist ? safeDist : D,
    };
  }

  /** an explicit move: target to the origin, camera to distance `dist`, optionally from direction `dir` */
  flyTo(dist, { dir = null, ms = 1400, cancelable = true } = {}) {
    const c = this.camera, t = this.controls.target;
    this.tween = {
      kind: 'fly', t0: performance.now(), ms, cancelable,
      fromTarget: t.clone(), fromDist: this.distance(), toDist: dist,
      fromDir: c.position.clone().sub(t).normalize(), toDir: dir ? dir.clone().normalize() : null,
    };
  }

  /** scale the camera offset when the display scale changes, so the view keeps framing the same thing */
  rescale(f) {
    const t = this.controls.target;
    this.camera.position.sub(t).multiplyScalar(f).add(t.multiplyScalar(f));
    const tw = this.tween;
    if (!tw) return;
    if (tw.kind === 'fly') { tw.fromDist *= f; tw.toDist *= f; tw.fromTarget.multiplyScalar(f); }
    else { tw.from.multiplyScalar(f); tw.fromDist *= f; tw.toDist *= f; }
  }

  /** per frame, after display positions are known */
  update(disp, focusRadius, maxDist) {
    this._touchStep();
    const o = disp[this.focus];
    const d = [o[0] - this.origin[0], o[1] - this.origin[1], o[2] - this.origin[2]];
    this.origin = o.slice();
    const c = this.camera, t = this.controls.target;
    if (!this.lock && !this.tween) {
      // inertial camera: the world moves by -d relative to the new origin
      c.position.x -= d[0]; c.position.y -= d[1]; c.position.z -= d[2];
      t.x -= d[0]; t.y -= d[1]; t.z -= d[2];
    }
    const tw = this.tween;
    if (tw && tw.kind === 'glide') {
      const k = Math.min(1, (performance.now() - tw.t0) / tw.ms), e = ease(k);
      const left = tw.R > 1e-6 ? (Math.pow(tw.R + 1, 1 - e) - 1) / tw.R : 0;   // fraction of the trip remaining
      // move by this frame's step only, so the user's own rotation, zoom or pan during the trip is kept
      _d.copy(tw.from).multiplyScalar(left - tw.last);
      tw.last = left;
      t.add(_d); c.position.add(_d);
      if (tw.toDist !== tw.fromDist) {
        const dist = tw.fromDist * Math.pow(tw.toDist / tw.fromDist, e);
        _o.subVectors(c.position, t).setLength(dist);
        c.position.copy(t).add(_o);
      }
      if (k >= 1) this.tween = null;
    } else if (tw) {
      const k = ease((performance.now() - tw.t0) / tw.ms);
      t.copy(tw.fromTarget).multiplyScalar(1 - k);
      const dist = tw.fromDist * Math.pow(tw.toDist / tw.fromDist, k);
      const dir = tw.toDir ? tw.fromDir.clone().lerp(tw.toDir, k).normalize() : c.position.clone().sub(t).normalize();
      if (dir.lengthSq() < 0.5) dir.copy(tw.toDir || new THREE.Vector3(0, 0.4, 1)).normalize();
      c.position.copy(t).addScaledVector(dir, dist);
      if (k >= 1) this.tween = null;
    }
    const nearFocus = t.length() < focusRadius * 0.5;
    this.controls.minDistance = nearFocus ? focusRadius * 1.02 : 1e-9;
    this.controls.maxDistance = maxDist;
    this.controls.update();
    const cd = this.distance();
    // logarithmic depth buffer: a generous range costs nothing, but the near plane must stay in
    // front of the closest surface
    const near = Math.max(1e-9, (nearFocus ? cd - focusRadius : cd) * 1e-3);
    if (Math.abs(c.near / near - 1) > 0.05) { c.near = near; c.far = 1e7; c.updateProjectionMatrix(); }
  }
}
