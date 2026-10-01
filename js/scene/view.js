// Camera: orbit controls around the focused body, a floating origin, smooth focus changes.
//
// Floating origin: the focused body is always at the scene origin, and everything else is placed
// relative to it (subtracted in double precision on the CPU). GPU float32 precision is therefore
// best exactly where the camera is looking, from a 10 km moon to the whole Solar System.

import * as THREE from '../../vendor/three.min.js';

const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _q = new THREE.Quaternion();

export class View {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new THREE.OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // the wheel and a pinch zoom through _wheel and _touchPan instead
    this.controls.enableZoom = false;
    this.zoomSpeed = 1.2;
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
    // since it only translates and adds the user's own rotation, zoom and pan on top. It yields to
    // a wheel turn or a drag once that has moved, not to a bare press: a click or tap on the body
    // that chooses it again must still find the fly under way (the same 5 px as onTap in hud.js).
    this._yield = () => { if (this.tween && this.tween.cancelable) this.tween = null; };
    const pressed = new Map();   // pointerId → where it went down
    dom.addEventListener('pointerdown', e => pressed.set(e.pointerId, [e.clientX, e.clientY]));
    window.addEventListener('pointermove', e => {
      const p = pressed.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 5) { pressed.delete(e.pointerId); this._yield(); }
    }, { passive: true });
    for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, e => pressed.delete(e.pointerId), { passive: true });
    this._touchPan();
    this._wheel();
  }

  /**
   * Wheel zoom, eased and accelerated. OrbitControls jumped a fixed step per wheel event. Here each
   * event adds to the zoom still to be made (`zoomLeft`, in log distance, so a notch is the same
   * factor at every scale), and update() makes a share of it each frame (time constant ZOOM_EASE),
   * so a notch glides instead of jumping. A running measure of how much has just been scrolled the
   * same way (`heat`, in notches, fading over ZOOM_HEAT) enlarges the steps: a notch now and then
   * still moves by the usual 6%, but a fast spin of the wheel or a flick on a trackpad grows them up
   * to ZOOM_GAIN times, so the 10⁵ between a close look and the whole system is a few turns of the
   * wheel rather than a few hundred notches. A trackpad pinch (a wheel event marked ctrlKey without
   * the Ctrl key down) follows the fingers at once, like a pinch on a touch screen.
   */
  _wheel() {
    const ZOOM_EASE = 90, ZOOM_HEAT = 350, ZOOM_GAIN = 8;
    const step = this.zoomSpeed * Math.log(1 / 0.95);   // per notch, as OrbitControls
    let heat = 0, heatT = 0, heatDir = 0, ctrlHeld = false;
    this.zoomLeft = 0;
    // a pinch arrives with ctrlKey set but no Ctrl key down (as OrbitControls tells them apart)
    for (const ev of ['keydown', 'keyup']) window.addEventListener(ev, e => { if (e.key === 'Control') ctrlHeld = ev === 'keydown'; });
    window.addEventListener('blur', () => { ctrlHeld = false; });
    this.dom.addEventListener('wheel', e => {
      e.preventDefault();
      // in notches: Chrome gives 100 px per notch; lines and pages as OrbitControls counts them
      const n = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1) / 100;
      if (!n) return;   // sideways only (a trackpad): no zoom, and a flight goes on
      this._yield();
      if (e.ctrlKey && !ctrlHeld) { this.zoomBy(10 * n * step); return; }
      const now = performance.now(), dir = Math.sign(n);
      // the page may have been resting (no update() calls): the easing starts from this event
      if (!this.zoomLeft) this._last = now;
      heat = dir === heatDir ? heat * Math.exp(-(now - heatT) / ZOOM_HEAT) : 0;
      heatT = now; heatDir = dir;
      this.zoomLeft += n * step * Math.min(ZOOM_GAIN, 1 + 0.15 * heat * heat);
      heat += Math.abs(n);
    }, { passive: false });
    this._zoomStep = dt => {
      if (!this.zoomLeft) return;
      const k = Math.abs(this.zoomLeft) < 1e-4 ? 1 : 1 - Math.exp(-dt / ZOOM_EASE);
      this.zoomBy(this.zoomLeft * k);
      this.zoomLeft -= this.zoomLeft * k;
    };
  }

  /** move the camera nearer (x < 0) or farther by a factor e^x; update() keeps it within the limits */
  zoomBy(x) {
    const c = this.camera, t = this.controls.target;
    _o.subVectors(c.position, t).multiplyScalar(Math.exp(x));
    c.position.copy(t).add(_o);
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
        _o.subVectors(c.position, t).multiplyScalar(Math.pow(g.last.sep / Math.max(m.sep, 1), this.zoomSpeed));
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
      fromDist: D, toDist: D < minDist ? safeDist : D, lastDist: D,
    };
  }

  /**
   * An explicit move: target to the origin, camera to distance `dist`, optionally from direction
   * `dir`, which it turns to by a rotation along the shorter arc (blending the two directions
   * instead passed through the body when they were nearly opposite)
   */
  flyTo(dist, { dir = null, ms = 1400, cancelable = true } = {}) {
    const c = this.camera, t = this.controls.target;
    this.zoomLeft = 0;   // the rest of a wheel zoom would carry the camera past where it flies to
    const fromDir = c.position.clone().sub(t).normalize(), toDir = dir ? dir.clone().normalize() : null;
    let turn = null;
    if (toDir) {
      turn = new THREE.Quaternion().setFromUnitVectors(fromDir, toDir);
      // straight round: setFromUnitVectors would pick an arbitrary axis; take the vertical one
      if (fromDir.dot(toDir) < -0.9999) {
        const axis = _d.set(0, 1, 0).projectOnPlane(fromDir);
        if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0).projectOnPlane(fromDir);
        turn.setFromAxisAngle(axis.normalize(), Math.PI);
      }
    }
    this.tween = {
      kind: 'fly', t0: performance.now(), ms, cancelable,
      fromTarget: t.clone(), fromDist: this.distance(), toDist: dist, fromDir, toDir, turn,
    };
  }

  /**
   * Keep the view framing the same thing when the display scale changes: `map` takes a camera
   * distance at the old scale to the one at the new scale (mapDistance in main.js), for the camera
   * and for both ends of a flight under way.
   */
  rescale(map) {
    const t = this.controls.target, D = this.distance(), f = D > 0 ? map(D) / D : 1;
    this.camera.position.sub(t).multiplyScalar(f).add(t.multiplyScalar(f));
    const tw = this.tween;
    if (!tw) return;
    tw.fromDist = map(tw.fromDist); tw.toDist = map(tw.toDist);
    if (tw.kind === 'fly') tw.fromTarget.multiplyScalar(f);
    else { tw.from.multiplyScalar(f); tw.lastDist = map(tw.lastDist); }
  }

  /** per frame, after display positions are known */
  update(disp, focusRadius, maxDist) {
    const now = performance.now(), dt = Math.min(100, now - (this._last || now));   // ms
    this._last = now;
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
        // also only this frame's share of the change, so a zoom by hand meanwhile is kept
        const dist = tw.fromDist * Math.pow(tw.toDist / tw.fromDist, e);
        _o.subVectors(c.position, t).multiplyScalar(dist / tw.lastDist);
        c.position.copy(t).add(_o);
        tw.lastDist = dist;
      }
      if (k >= 1) this.tween = null;
    } else if (tw) {
      const k = ease((performance.now() - tw.t0) / tw.ms);
      t.copy(tw.fromTarget).multiplyScalar(1 - k);
      const dist = tw.fromDist * Math.pow(tw.toDist / tw.fromDist, k);
      const dir = tw.turn ? tw.fromDir.clone().applyQuaternion(_q.identity().slerp(tw.turn, k)) : c.position.clone().sub(t).normalize();
      if (dir.lengthSq() < 0.5) dir.copy(tw.toDir || new THREE.Vector3(0, 0.4, 1)).normalize();
      c.position.copy(t).addScaledVector(dir, dist);
      if (k >= 1) this.tween = null;
    }
    const nearFocus = t.length() < focusRadius * 0.5;
    this.controls.minDistance = nearFocus ? focusRadius * 1.02 : 1e-9;
    this.controls.maxDistance = maxDist;
    this._zoomStep(dt);
    this.controls.update();
    const cd = this.distance();
    // at a limit, the rest of a wheel zoom is dropped, or turning back would first have to undo it
    if (this.zoomLeft < 0 ? cd <= this.controls.minDistance * 1.001 : cd >= maxDist * 0.999) this.zoomLeft = 0;
    // logarithmic depth buffer: a generous range costs nothing, but the near plane must stay in
    // front of the closest surface
    const near = Math.max(1e-9, (nearFocus ? cd - focusRadius : cd) * 1e-3);
    if (Math.abs(c.near / near - 1) > 0.05) { c.near = near; c.far = 1e7; c.updateProjectionMatrix(); }
  }
}
