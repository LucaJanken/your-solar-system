// Solar System: app state, main loop and controls.
import * as THREE from '../vendor/three.min.js';
import { snapshot, AU_KM } from './astro/ephemeris.js';
import { EventTimeline, eventService } from './astro/events.js';
import { BODIES, BY_NAME, meanRadius } from './data/bodies.js';
import { DisplayScale, toScene } from './scene/scale.js';
import { BodyViews } from './scene/bodies.js';
import { Orbits } from './scene/orbits.js';
import { Stars } from './scene/stars.js';
import { View } from './scene/view.js';
import { Labels } from './scene/labels.js';
import { SunGlare } from './scene/glare.js';
import { SUN_INTENSITY } from './scene/shaders.js';
import { InfoPanel } from './ui/info.js';
import { HudVisibility, onTap } from './ui/hud.js';
import { fmtDate, fmtTime, tzName, localInput, parseLocalInput, civil, fmtRate } from './ui/format.js';

const $ = id => document.getElementById(id);
const DAY_MS = 86400000;
// 1 Jan 1000 in the Julian calendar (6 Jan proleptic Gregorian) to 31 Dec 2999
const MIN_MS = Date.UTC(1000, 0, 6), MAX_MS = Date.UTC(2999, 11, 31, 23, 59);
const VALID_FROM = Date.UTC(1800, 0, 1), VALID_TO = Date.UTC(2051, 0, 1);
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The speed slider runs forward only and is logarithmic: its value is log10 |rate|, from real time
// (0) to about five years per second. The direction is a separate switch (reverse).
const SPEED_MAX = 8.2;

// ---------------------------------------------------------------- state
const state = {
  simMs: Date.now(),
  playing: !REDUCED_MOTION,
  speed: 0,          // log10 |simulated seconds per real second|: 0 is real time
  dir: 1,            // +1 forward, −1 backward (the reverse button)
  // the switches in the settings (with view.lock, the scale and nightLight, kept across reloads: see saveSettings)
  show: { orbits: true, labels: true, moons: true, axis: true, stars: true, milkyWay: true, glare: true, cities: true },
  nightLight: 0,     // the Night sides slider: 0 real (black), 1 lit

  scaleTarget: 1,
  selected: 'Sun',
};

// ---------------------------------------------------------------- renderer and scene
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 1e-6, 1e7);
const DEFAULT_FOV = 45;

// The Sun is the only light, so night sides are black, as a camera exposed for daylight sees them.
// Decay 0 keeps distant worlds visible (see the guide). The Night sides slider adds a dim light from
// the viewer (shaders.js), outside the shadow computation.
const sunLight = new THREE.PointLight(0xfff6ea, SUN_INTENSITY, 0, 0);
scene.add(sunLight);

// uniforms of every body material, set from the settings: Earth's city lights, and the Night sides light
const shared = { nightOn: { value: 1 }, bright: { value: 0 } };
// The Night sides light at the slider's right end, in the sunlight's units: at normal incidence 30%
// of SUN_INTENSITY (3.4). Squared along the slider: the sRGB encoding (about light^(1/2.2)) then
// makes equal steps of the slider look about equally bright, where a linear light would jump at
// the start and barely change toward the end.
const NIGHT_LIGHT_MAX = 1.0;
const scale = new DisplayScale();
const bodies = new BodyViews(scene, renderer, shared);
const orbits = new Orbits(scene);
const stars = new Stars();
const glare = new SunGlare();
const view = new View(camera, renderer.domElement);
const info = new InfoPanel();
// a clicked label chooses its body, unless a body's dot is right under the pointer (see bodyAt); a
// label pressed from the keyboard (no pointer, detail 0) always chooses its own
const labels = new Labels($('labels'), BODIES, (name, e) => select(e.detail && bodyAt(e.clientX, e.clientY, true) || name, true), () => updateHover());

// ---------------------------------------------------------------- display positions
let snap = null, snapMs = NaN, disp = {};
// the ephemeris at the displayed time, recomputed only when the time changes
function refreshSnap() { if (snapMs !== state.simMs) { snap = snapshot(state.simMs); snapMs = state.simMs; } }
function computeDisplay() {
  disp = { Sun: [0, 0, 0] };
  for (const b of BODIES) {
    if (b.parent !== 'Sun') continue;
    const p = toScene(snap.bodies[b.name].pos), r = Math.hypot(...p), k = scale.helio(r) / r;
    disp[b.name] = [p[0] * k, p[1] * k, p[2] * k];
  }
  for (const b of BODIES) {
    if (!b.parent || b.parent === 'Sun') continue;
    const rel = toScene(snap.bodies[b.name].rel.pos), r = Math.hypot(...rel);
    const k = scale.moon(b.name, b.parent, meanRadius(BY_NAME[b.parent]), r) / r, pp = disp[b.parent];
    disp[b.name] = [pp[0] + rel[0] * k, pp[1] + rel[1] * k, pp[2] + rel[2] * k];
  }
}
// orbit samples (km, scene axes, relative to the body's primary) → display offsets from the body
// itself: centre + p · radial(|p|) / |p|, as computeDisplay places the body
function orbitMapping(name) {
  const def = BY_NAME[name], me = disp[name];
  if (def.parent === 'Sun') return { centre: [-me[0], -me[1], -me[2]], radial: r => scale.helio(r) };
  const pp = disp[def.parent], R = meanRadius(BY_NAME[def.parent]);
  return { centre: [pp[0] - me[0], pp[1] - me[1], pp[2] - me[2]], radial: r => scale.moon(name, def.parent, R, r) };
}
const drawnRadius = name => scale.size(meanRadius(BY_NAME[name]));
// The view of the whole system: Neptune's orbit, with a margin, fits the part of the screen the panels
// leave free (clear of the side panel on computers), seen from SYSTEM_ELEV above the ecliptic.
const SYSTEM_ELEV = 0.30;
const SYSTEM_DIR = new THREE.Vector3(0, Math.sin(SYSTEM_ELEV), -Math.cos(SYSTEM_ELEV));
function systemDistance() {
  const W = stage.clientWidth || 1, H = stage.clientHeight || 1, R = 1.08 * scale.helio(30.1 * AU_KM);
  // the bodies list is in the way where it reaches down toward the middle of the screen (on
  // computers), the toolbar across the top corner is not
  const col = $('bodies').getBoundingClientRect();
  const right = !hud.hidden && col.bottom > H * 0.4 ? col.left - 12 : W;
  const tanV = Math.tan(DEFAULT_FOV * Math.PI / 360);
  const tanX = tanV * Math.max(40, Math.min(W / 2, right - W / 2)) / (H / 2);
  const tanY = tanV * Math.min(H, free.bottom - free.top) / H;
  // the near side of the orbit is the farthest up or down the screen
  return Math.max(R / tanX, R * Math.cos(SYSTEM_ELEV) + R * Math.sin(SYSTEM_ELEV) / tanY);
}
// The overview's viewing direction: from the side the camera is on now, at SYSTEM_ELEV above the
// ecliptic, for which systemDistance is fitted (from a close look at a planet's lit side the camera
// is often nearly in the ecliptic, and the orbits would be seen edge-on).
function systemDir() {
  const c = camera.position.clone().sub(view.controls.target).setY(0);
  if (c.lengthSq() < 1e-24) return SYSTEM_DIR.clone();
  return c.normalize().multiplyScalar(Math.cos(SYSTEM_ELEV)).setY(Math.sin(SYSTEM_ELEV));
}
// largest drawn radius (equatorial, for flattened planets)
const drawnExtent = name => { const d = BY_NAME[name]; return drawnRadius(name) * Math.max(...d.shape) / meanRadius(d); };
const focusDistance = name => name === 'Sun' ? systemDistance() : closeDistance(name);
// A comfortable distance to look at a body from: it spans about 40% of the narrower side of the
// part of the screen the panels leave free (so a phone held upright does not crop it), Saturn's
// rings included.
function closeDistance(name) {
  const d = BY_NAME[name], W = stage.clientWidth || 1, H = stage.clientHeight || 1;
  const extent = Math.max(drawnExtent(name), d.rings && d.rings.outerKm ? drawnRadius(name) * d.rings.outerKm / meanRadius(d) : 0);
  const side = Math.min(W, H, free.bottom - free.top);
  return extent / Math.sin(Math.atan(0.4 * Math.tan(DEFAULT_FOV * Math.PI / 360) * side / H));
}
// How far out the camera may go: far enough for the whole of Pluto's orbit (out to 49 AU from the
// Sun) to fit, with a margin, in the narrower side of the part of the screen the panels leave free,
// wherever the view is centred (the orbit can reach that much farther from an outer planet).
function maxDistance() {
  const W = stage.clientWidth || 1, H = stage.clientHeight || 1, t = view.controls.target, o = view.origin;
  const r = scale.helio(50 * AU_KM) + Math.hypot(t.x + o[0], t.y + o[1], t.z + o[2]);   // + the Sun's distance from the target
  const side = Math.min(W, H, free.bottom - free.top);
  return Math.max(3.2 * scale.helio(50 * AU_KM), 1.15 * r / Math.sin(Math.atan(Math.tan(DEFAULT_FOV * Math.PI / 360) * side / H)));
}
// The viewing direction for that close look: the user's own, turned toward the Sun just enough that
// the body is seen at most 60° from full phase (three quarters lit) rather than as a dark disc.
const MAX_PHASE = Math.PI / 3;
function litSide(name) {
  if (name === 'Sun') return null;
  const s = new THREE.Vector3(...disp[name]).negate().normalize();
  const c = camera.position.clone().sub(view.controls.target).normalize(), cos = c.dot(s);
  if (cos >= Math.cos(MAX_PHASE)) return c;
  const perp = c.addScaledVector(s, -cos);
  // straight from behind: come round over the body's north side of the ecliptic
  if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0).addScaledVector(s, -s.y);
  return s.multiplyScalar(Math.cos(MAX_PHASE)).addScaledVector(perp.normalize(), Math.sin(MAX_PHASE));
}

// On phones the clock covers the top of the screen and the information panel and time controls
// the lower half, right where the focused body would be. The projection is shifted (a view offset,
// so orbiting still turns about the body) to put the focus in the middle of the part left free.
const free = { top: 0, bottom: Infinity };
let viewShift = 0, shiftTarget = 0, shiftApplied = null;
function measureFree() {
  const W = stage.clientWidth, H = stage.clientHeight, cx = W / 2;
  free.top = 0; free.bottom = H;
  if (hud.hidden) { shiftTarget = 0; return; }
  for (const el of [document.querySelector('header.time'), $('info'), document.querySelector('.timectl')]) {
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    // only panels across the middle of the screen are in the way (the desktop layout keeps to the sides)
    if (r.left > cx || r.right < cx) continue;
    if (r.top < H / 2 && r.bottom < H * 0.4) free.top = Math.max(free.top, r.bottom);
    else free.bottom = Math.min(free.bottom, r.top);
  }
  if (free.bottom - free.top < H * 0.2) { free.top = 0; free.bottom = H; }
  shiftTarget = H / 2 - (free.top + free.bottom) / 2;
}
function applyShift(dt) {
  const W = stage.clientWidth, H = stage.clientHeight;
  viewShift += (shiftTarget - viewShift) * Math.min(1, dt * 8);
  if (Math.abs(shiftTarget - viewShift) < 0.5) viewShift = shiftTarget;
  const key = W + 'x' + H + ':' + viewShift.toFixed(1);
  if (key === shiftApplied) return;
  shiftApplied = key;
  if (Math.abs(viewShift) < 0.5) camera.clearViewOffset();
  else camera.setViewOffset(W, H, 0, viewShift, W, H);
}

// ---------------------------------------------------------------- selection and focus
function select(name, fly) {
  wake();
  const again = name === state.selected;
  state.selected = name;
  openSystemOf(name);
  info.show(name);
  info.update(snap);
  paintList();
  if (fly) {
    camera.fov = DEFAULT_FOV; camera.updateProjectionMatrix();
    const R = drawnExtent(name);
    // chosen again after the view was moved sideways off it: back to the centre first, at the same zoom
    if (again && view.focus === name && !view.centred()) view.glide({ minDist: R * 1.2, safeDist: R * 3 });
    else if (again) closeLook(name);
    else {
      // otherwise only the target moves; zoom and angle stay the user's, unless the camera would be inside the body
      view.setFocus(name, disp, { minDist: R * 1.2, safeDist: R * 3 });
      // the view on arrival is the one a close look returns to; moving on from a close look to a
      // body that is then about as close (Earth to Venus, Io to Jupiter) stays in it, with the way
      // back it had, but not to one still far off (Jupiter to Io: that one's close look is next)
      const arrival = aimedView();
      if (!closeUp.close || arrival.dist > closeDistance(name) * 2) closeUp = { back: arrival, close: false };
    }
  } else closeUp = { back: null, close: false };
  bodies.setAxis(name);
  hudDirty = true;
}

// Choosing the selected body again flies in to a comfortable view of it, from its lit side; choosing
// it once more, while still that close, flies back out to where the camera was when the flight in
// began, at that distance and from that side (if it was already about as close, zoomed in by hand,
// to where it was when the body was chosen). Zoomed out by hand from the close look, choosing it
// flies in again, and the way back is then to where it was zoomed out to. Choosing another body
// nearby during the close look keeps the way back. Distances are judged by where the camera is
// heading, so that choosing the body again during either flight turns it round, and the way back
// stays the one from before the first flight in.
let closeUp = { back: null, close: false };   // back: { dist, dir } | null; close: flown in since
const aimedView = () => {
  const tw = view.tween;
  return tw ? { dist: tw.toDist, dir: tw.toDir || camDir() } : { dist: view.distance() * Math.exp(view.zoomLeft), dir: camDir() };
};
const camDir = () => camera.position.clone().sub(view.controls.target).normalize();
function closeLook(name) {
  const close = closeDistance(name), now = aimedView(), prev = closeUp.back;
  const far = v => v && v.dist > close * 1.1;
  // in the close look (or nearer, zoomed in by hand): back out
  if (closeUp.close && now.dist < close * 1.1) {
    closeUp = { back: null, close: false };
    view.setFocus(name, disp, far(prev) ? prev : neighbourhood(name));
    return;
  }
  // in, remembering where the camera is now; if it is already about as close (zoomed in by hand
  // since the body was chosen), the view on arrival instead
  closeUp = { back: far(now) ? now : far(prev) ? prev : neighbourhood(name), close: true };
  view.setFocus(name, disp, { dist: close, dir: litSide(name) });
}
// where the way back out of a close look leads when there is no view to return to: the body's
// surroundings, which for a moon are its planet and orbit, for a planet its moons, and for the Sun
// the whole system (a moonless planet: 30 close-look distances, well clear of the body)
function neighbourhood(name) {
  const def = BY_NAME[name], close = closeDistance(name);
  if (name === 'Sun') return { dist: systemDistance(), dir: systemDir() };
  const span = (a, b) => Math.hypot(disp[a][0] - disp[b][0], disp[a][1] - disp[b][1], disp[a][2] - disp[b][2]);
  let r = 0;
  if (def.parent !== 'Sun') r = span(name, def.parent);
  else for (const m of BODIES) if (m.parent === name) r = Math.max(r, span(m.name, name));
  return { dist: r ? Math.max(3 * r, close * 4) : close * 30, dir: null };
}

// ---------------------------------------------------------------- scale changes
let scaleAnim = null;
function setScale(s, animate = true) {
  wake();
  s = Math.max(0, Math.min(1, s));
  state.scaleTarget = s;
  saveSettings();
  if (animate && !REDUCED_MOTION) scaleAnim = { from: scale.s, to: s, t0: performance.now(), ms: 2200 };
  else { scaleAnim = null; applyScale(s); }
}
// keep the camera framing the same thing while every length changes: from beyond Neptune's orbit,
// the whole system (the two agree at the orbit itself)
function applyScale(s) {
  const f = view.focus, cd = view.distance(), NEPTUNE_KM = 30.1 * AU_KM;
  const before = { r: drawnRadius(f), d: helioInverse(cd), n: scale.helio(NEPTUNE_KM) };
  scale.s = s;
  let factor;
  if (f !== 'Sun' && cd < 12 * before.r) factor = drawnRadius(f) / before.r;
  else if (cd > before.n) factor = scale.helio(NEPTUNE_KM) / before.n;
  else factor = scale.helio(before.d) / cd;
  if (Number.isFinite(factor) && factor > 0) { view.rescale(factor); if (closeUp.back) closeUp.back.dist *= factor; }
  // the slider has real scale on the left
  $('scale').value = 1 - s;
  $('scale').setAttribute('aria-valuetext', s === 1 ? 'real scale' : s === 0 ? 'overview' : Math.round((1 - s) * 100) + '% toward the overview');
  $('scaleMin').classList.toggle('on', s === 0);
  $('scaleMax').classList.toggle('on', s === 1);
}
// The Night sides slider: 0 leaves them as the Sun does (black), 1 lights them fully. Like the
// scale, state.nightLight is where it is going (saved), nightShown what is drawn; the end labels
// glide there, as Real and Overview do.
let nightAnim = null, nightShown = 0;
function setNightLight(x, animate = false) {
  wake();
  x = Math.max(0, Math.min(1, x));
  state.nightLight = x;
  if (animate && !REDUCED_MOTION) nightAnim = { from: nightShown, to: x, t0: performance.now(), ms: 2200 };
  else { nightAnim = null; applyNightLight(x); }
  saveSettings();
}
function applyNightLight(x) {
  nightShown = x;
  $('night').value = x;
  $('night').setAttribute('aria-valuetext', x === 0 ? 'real, dark' : Math.round(x * 100) + '% lit');
  $('nightReal').classList.toggle('on', x === 0);
  $('nightLit').classList.toggle('on', x === 1);
}
// heliocentric distance (km) whose drawn distance is `units`, at the current scale
function helioInverse(units) {
  let lo = 1e3, hi = 1e12;
  for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (scale.helio(m) < units) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}

// ---------------------------------------------------------------- time
function setTime(ms, { pause = false } = {}) {
  state.simMs = Math.max(MIN_MS, Math.min(MAX_MS, ms));
  if (pause) state.playing = false;
  hudDirty = true;
  wake();
}
const setRate = () => state.dir * Math.pow(10, state.speed);   // the rate while playing
const rate = () => state.playing ? setRate() : 0;
function setSpeed(x) { state.speed = Math.max(0, Math.min(SPEED_MAX, +x.toFixed(2))); hudDirty = true; }
// [ and ] move the speed slider one step, slower or faster; paused, time stays paused
const stepSpeed = sign => setSpeed(state.speed + 0.25 * sign);
function setPlaying(on) { state.playing = on; hudDirty = true; }
function setReverse(on) { state.dir = on ? -1 : 1; hudDirty = true; }
// the time step of the former ◂ ▸ stepper, no longer used
try { localStorage.removeItem('solarSystem.step'); } catch {}

// ---------------------------------------------------------------- main loop
let last = performance.now(), lastHud = 0, hudDirty = true, frameDt = 1 / 60, whenOpen = false;
let hudBoxes = null, screenPos = [];
// Render on demand: while time is paused and nobody interacts, nothing changes on screen, so an
// idle page draws nothing (laptop and phone batteries). Input, loads and state changes wake it.
let wakeUntil = performance.now() + 3000;
function wake(ms = 1500) { wakeUntil = Math.max(wakeUntil, performance.now() + ms); }
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = (now - last) / 1000, dt = Math.min(0.1, elapsed);
  last = now;
  const active = state.playing || view.tween || view.zoomLeft || scaleAnim || nightAnim || now < wakeUntil || viewShift !== shiftTarget;
  if (!active) {
    if (hudDirty) { lastHud = now; hudDirty = false; updateHud(); }
    return;
  }
  frameDt = frameDt * 0.9 + dt * 0.1;
  // At real time the clock keeps pace with the wall clock, also across slow frames and a hidden
  // tab (no frames at all); faster rates are capped so that a hiccup cannot skip years.
  const dtSim = rate() * (Math.abs(rate()) <= 1 ? elapsed : dt);
  if (dtSim) {
    const next = state.simMs + dtSim * 1000;
    if (next <= MIN_MS || next >= MAX_MS) { state.playing = false; toast('The model covers the years 1000–3000.'); }
    state.simMs = Math.max(MIN_MS, Math.min(MAX_MS, next));
  }

  refreshSnap();
  if (scaleAnim) {
    const k = Math.min(1, (now - scaleAnim.t0) / scaleAnim.ms), e = k * k * (3 - 2 * k);
    // interpolate in the exponent, so the morph looks even across the ~5 decades of change
    applyScale(scaleAnim.from + (scaleAnim.to - scaleAnim.from) * e);
    if (k >= 1) scaleAnim = null;
  }
  if (nightAnim) {
    const k = Math.min(1, (now - nightAnim.t0) / nightAnim.ms), e = k * k * (3 - 2 * k);
    applyNightLight(nightAnim.from + (nightAnim.to - nightAnim.from) * e);
    if (k >= 1) nightAnim = null;
  }
  computeDisplay();
  view.update(disp, drawnExtent(view.focus), maxDistance());
  applyShift(dt);
  // OrbitControls turns the camera with lookAt, which leaves the view matrix one orientation
  // behind until the render; the labels, picking and glare below project with it
  camera.updateMatrixWorld();
  const origin = view.origin;
  // simulated time per rendered frame, for rotation blur and to hide bodies that would strobe
  const perFrame = rate() * frameDt;
  bodies.update(snap, disp, origin, scale, perFrame);
  for (const def of BODIES) {
    const v = bodies.views[def.name];
    const isMoon = def.parent && def.parent !== 'Sun';
    const tooFast = def.periodD && Math.abs(perFrame) / (def.periodD * 86400) > 0.1;
    v.group.visible = !(isMoon && !state.show.moons) && !tooFast;
    v.tooFast = tooFast;
  }
  // display positions depend only on the time and the scale, so camera moves reuse the lines
  orbits.update(snap, disp, origin, n => state.show.orbits && (state.show.moons || BY_NAME[n].parent === 'Sun'), orbitMapping, state.simMs + '/' + scale.s);
  sunLight.position.set(-origin[0], -origin[1], -origin[2]);

  stars.setEpoch((snap.tt) / 365.25);
  stars.showStars = state.show.stars;
  stars.showMilkyWay = state.show.milkyWay;
  shared.nightOn.value = state.show.cities ? 1 : 0;
  shared.bright.value = NIGHT_LIGHT_MAX * nightShown ** 2;

  // labels (and screen positions for picking)
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!hudBoxes) {
    hudBoxes = hud.hidden ? [] : [...document.querySelectorAll('[data-hud]')].filter(e => e.offsetParent).map(e => {
      const r = e.getBoundingClientRect(); return { left: r.left - 4, right: r.right + 4, top: r.top - 4, bottom: r.bottom + 4 };
    });
    measureFree();
  }
  const entries = BODIES.map((def, i) => {
    const v = bodies.views[def.name];
    const isMoon = def.parent && def.parent !== 'Sun';
    // moon labels only when their planet's system is spread out enough on screen
    let prio = def.name === state.selected ? 100 : !def.parent ? 90 : isMoon ? 10 : 50 - i * 0.1;
    // a body hidden because it moves too fast to draw takes its label with it, which would
    // otherwise jump around its orbit from frame to frame
    return { name: def.name, pos: v.group.position, R: v.R || drawnRadius(def.name), show: v.group.visible, label: state.show.labels, prio, isMoon, parent: def.parent };
  });
  const labelled = [];
  for (const e of entries) {
    if (!e.isMoon || moonSpread(e)) { labelled.push(e); continue; }
    const it = labels.items[e.name];
    if (it.shown) { it.el.style.display = 'none'; it.shown = false; }
  }
  screenPos = labels.update(camera, W, H, labelled, hudBoxes, state.selected);
  updateHover();
  // the selected body's spin axis, once the body is big enough on screen for it to mean anything
  const sp = screenPos.find(p => p.name === state.selected);
  bodies.axis.visible = state.show.axis && bodies.views[state.selected].group.visible && !!sp && sp.rpx > 5;

  bodies.loadVisible(camera, H);
  // swap in the high-resolution Earth when it fills the screen
  const se = screenPos.find(s => s.name === 'Earth');
  if (se && se.onScreen && se.rpx > 350) bodies.upgrade('Earth');

  const sunV = bodies.views.Sun;
  if (state.show.glare) glare.update(camera, sunV.group.position, sunV.R, W, H, renderer.getPixelRatio(),
    BODIES.filter(d => d.parent).map(d => { const v = bodies.views[d.name]; return { pos: v.group.position, R: v.R, visible: v.group.visible }; }),
    REDUCED_MOTION ? 0 : dt);
  else glare.on = false;
  stars.setGlare(glare.on ? 0.75 * glare.vis * glare.halo : 0, glare.dir);

  renderer.clear();
  stars.render(renderer, camera, renderer.getPixelRatio());
  renderer.clearDepth();
  renderer.render(scene, camera);
  glare.render(renderer);

  if (hudDirty || now - lastHud > 125) { lastHud = now; hudDirty = false; updateHud(); }
}

// a moon's label is worth showing once it separates from its planet on screen
function moonSpread(e) {
  const pv = bodies.views[e.parent].group.position, mv = bodies.views[e.name].group.position;
  const d = camera.position.distanceTo(pv);
  const px = pv.distanceTo(mv) / d * stage.clientHeight / 2 / Math.tan(camera.fov * Math.PI / 360);
  return px > 26 || e.name === state.selected;
}

// ---------------------------------------------------------------- picking and hover
// The body a click, tap or hover at a screen point (client pixels) means: one whose drawn disc (or,
// if tiny, its dot) is under it, the front one if several; else a label there; else the nearest body
// within a generous halo. Dots come before labels because a label sits beside its own body and can
// cover another's: from the overview, Mercury's covers Earth. With `dotsOnly`, only a disc or dot
// counts (over a label, which then means its own body unless a dot is right under the pointer).
function bodyAt(cx, cy, dotsOnly = false) {
  const r = renderer.domElement.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
  let on = null, near = null, nearD = Infinity;
  for (const s of screenPos) {
    if (!s.onScreen || !bodies.views[s.name].group.visible) continue;
    const d = Math.hypot(s.px - x, s.py - y);
    if (d < Math.max(s.rpx, 4)) { if (!on || s.dist < on.dist) on = s; }
    else if (d < Math.max(s.rpx, 12) && d < nearD) { near = s; nearD = d; }
  }
  if (on || dotsOnly) return on ? on.name : null;
  return labels.at(cx, cy) || (near || {}).name || null;
}
let pointer = null, hovered = null;   // the mouse over the view or a label, client pixels
const hoverRing = $('hoverRing');
function updateHover() {
  const name = labels.hover ? (pointer && bodyAt(...pointer, true)) || labels.hover : pointer && bodyAt(...pointer);
  const s = name && screenPos.find(p => p.name === name);
  if (name !== hovered) { hovered = name; renderer.domElement.style.cursor = pointer && name ? 'pointer' : ''; }
  // a thin ring just outside the drawn disc; bodies larger than the screen need none
  if (!s || !s.onScreen || s.rpx > stage.clientHeight * 0.45) { hoverRing.classList.remove('on'); return; }
  const r = Math.max(s.rpx + 5, 11);
  hoverRing.style.transform = `translate(${s.px - r}px, ${s.py - r}px)`;
  hoverRing.style.width = hoverRing.style.height = 2 * r + 'px';
  hoverRing.style.borderColor = `color-mix(in oklab, ${BY_NAME[name].color} var(--chart-tint), var(--chart-ink))`;
  hoverRing.classList.add('on');
}

// ---------------------------------------------------------------- HUD
// The clock shows local time, UTC, or UTC with the astronomical time scales ("scientific").
// The model takes UTC to be UT1 (they never differ by more than 0.9 s).
const TIME_MODES = ['Local', 'UTC', 'Scientific'];
let timeMode = 'Local';
try { const m = localStorage.getItem('solarSystem.timeMode'); if (TIME_MODES.includes(m)) timeMode = m; } catch {}
function setTimeMode(m) {
  timeMode = m;
  try { localStorage.setItem('solarSystem.timeMode', m); } catch {}
  $('timeMode').textContent = m;
  $('timeDetails').hidden = m !== 'Scientific';
  // the date field is typed in the same time as the clock shows
  $('when').setAttribute('aria-label', m === 'Local' ? 'Date and time (local)' : 'Date and time (UTC)');
  // and so are the times in the events list
  if (!$('events').hidden) rebuildEvents();
  hudBoxes = null; hudDirty = true; wake();
}
const timeEls = { clock: $('clock'), date: $('date'), tz: $('tzLabel'), badge: $('badge') };
const dayTag = n => n ? `<span class="dtag" title="${n > 0 ? 'the next' : 'the previous'} day">${n > 0 ? '+' : '−'}${Math.abs(n)} d</span>` : '';
function updateHud() {
  const d = new Date(state.simMs), utc = timeMode !== 'Local';
  timeEls.clock.textContent = fmtTime(d, utc);
  timeEls.date.textContent = fmtDate(d, utc);
  const julian = civil(d, utc).julian ? 'Julian calendar' : '';
  // Scientific shows UT (UT1), which the model takes UTC to be; the two differ by under 0.9 s
  timeEls.tz.textContent = [timeMode === 'Local' ? tzName(d) : timeMode === 'Scientific' ? 'UT' : '', julian].filter(Boolean).join(' · ');
  // empty (UTC in the Gregorian calendar), it would still take a gap in the row
  timeEls.tz.hidden = !timeEls.tz.textContent;
  // nothing to say while inside the validated range
  timeEls.badge.hidden = state.simMs >= VALID_FROM && state.simMs < VALID_TO;
  if (timeMode === 'Scientific' && snap) {
    // TT runs about a minute ahead of UT, so near midnight it is already on the next day
    const ttMs = state.simMs + snap.deltaT * 1000;
    $('tdTT').innerHTML = fmtTime(new Date(ttMs), true) + dayTag(Math.floor(ttMs / DAY_MS) - Math.floor(state.simMs / DAY_MS));
    $('tdDT').textContent = snap.deltaT.toFixed(1) + ' s';
    $('tdJD').textContent = (snap.tt + 2451545).toFixed(5);
  }
  const when = $('when');
  // (not while it is being edited: in the popover, or in a phone's picker)
  if (!whenOpen && document.activeElement !== when) when.value = localInput(d, utc);
  const play = $('playBtn');
  play.classList.toggle('on', state.playing);
  play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  $('revBtn').setAttribute('aria-pressed', state.dir < 0);
  // paused, the rate stays visible (dimmed): it is what Play resumes at
  const rateEl = $('rate');
  rateEl.textContent = fmtRate(setRate());
  rateEl.classList.toggle('paused', !state.playing);
  const speed = $('speed');
  if (document.activeElement !== speed) speed.value = state.speed;
  speed.setAttribute('aria-valuetext', fmtRate(Math.pow(10, state.speed)) + (state.dir < 0 ? ', backward' : '') + (state.playing ? '' : ', paused'));
  if (snap) info.update(snap);
}

// ---------------------------------------------------------------- body list
// planets whose moons are listed: the selected body's system opens by itself, and each planet's
// arrow opens or closes its moons, so a moon can be chosen without flying to the planet first. A
// system opened by selection closes again when a body of another system is selected, so going
// through the planets one by one leaves only the current one open; one opened with its arrow
// stays open until its arrow closes it.
const openSystems = new Set();
let autoOpened = null;   // the system that selection opened (none if it was open already)
function openSystemOf(name) {
  const sys = systemOf(name);
  if (autoOpened && autoOpened !== sys) openSystems.delete(autoOpened);
  if (autoOpened !== sys) autoOpened = openSystems.has(sys) ? null : sys;
  openSystems.add(sys);
}
const systemOf = name => BY_NAME[name].parent && BY_NAME[name].parent !== 'Sun' ? BY_NAME[name].parent : name;
function buildList() {
  const ul = $('bodyList');
  for (const def of BODIES) {
    const isMoon = def.parent && def.parent !== 'Sun';
    const li = document.createElement('li');
    li.className = 'body-item' + (isMoon ? ' moon' : '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'body-btn';
    btn.dataset.body = def.name;
    if (isMoon) li.dataset.parent = def.parent;
    btn.innerHTML = `<span class="dot" style="background:${def.color}"></span><span>${def.name}</span>`;
    // the menu stays open, so several bodies can be visited in a row; tapping the view closes it
    btn.addEventListener('click', () => select(def.name, true));
    li.appendChild(btn);
    const nMoons = BODIES.filter(b => b.parent === def.name).length;
    if (nMoons && def.name !== 'Sun') {
      const exp = document.createElement('button');
      exp.type = 'button';
      exp.className = 'exp';
      exp.dataset.system = def.name;
      exp.setAttribute('aria-label', `${def.name}: ${nMoons} ${nMoons > 1 ? 'moons' : 'moon'}`);
      exp.innerHTML = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2.25 1 5.75 4 2.25 7z"/></svg>';
      exp.addEventListener('click', () => {
        if (openSystems.has(def.name)) openSystems.delete(def.name); else openSystems.add(def.name);
        // either way the arrow now decides: an opened system stays, a closed one is not reopened
        if (autoOpened === def.name) autoOpened = null;
        paintList();
      });
      li.appendChild(exp);
    }
    ul.appendChild(li);
  }
}
// The top-right panel shows the list of bodies, the settings, or only its heading, whose Bodies and
// Settings tabs each show their own content, or fold the panel if it is already shown (Esc, in the
// settings, goes back to what was there before). On computers the list starts as it was left;
// on phones the panel starts folded, and tapping the view folds it again, as it covers much of the
// screen there.
// the compact layout of style.css (phones, and tablets held upright)
const PHONE = matchMedia('(max-width: 959px), (max-height: 480px)');
let panel = null, beforeSettings = null;   // 'bodies', 'settings' or null (folded)
function setPanel(v, remember = false) {
  panel = v;
  const el = $('bodies');
  el.classList.toggle('folded', !v);
  $('bodyList').hidden = v !== 'bodies';
  $('settings').hidden = v !== 'settings';
  $('bodiesTab').setAttribute('aria-expanded', v === 'bodies');
  $('settingsTab').setAttribute('aria-expanded', v === 'settings');
  if (remember && !PHONE.matches) try { localStorage.setItem('solarSystem.bodies', v === 'bodies' ? 'open' : 'folded'); } catch {}
  evenPanes();
  hudBoxes = null; wake();
}
// The settings are padded at the bottom to at least the height of the list (its planets alone), so
// that opening them does not pull the panel's lower edge up; moons opened in the list still lengthen
// it. The list itself is never padded: where the settings are the taller (they are now, with ten
// switches), empty space under Pluto would look like a missing entry, so the panel grows instead.
// scrollHeight is the content's height even where the panel squeezes them (phones).
function evenPanes() {
  const el = $('bodies'), list = $('bodyList'), set = $('settings'), shown = [list.hidden, set.hidden];
  el.style.setProperty('--set-pad', '0px');
  list.hidden = set.hidden = false;
  let h = list.scrollHeight;
  for (const li of list.querySelectorAll('.body-item[data-parent]:not([hidden])')) h -= li.offsetHeight;
  const d = set.scrollHeight - h;
  [list.hidden, set.hidden] = shown;
  el.style.setProperty('--set-pad', Math.max(-d, 0) + 'px');
}
const openSettings = () => { beforeSettings = panel; setPanel('settings'); };
let bodiesOpen = !PHONE.matches;
try { if (bodiesOpen && localStorage.getItem('solarSystem.bodies') === 'folded') bodiesOpen = false; } catch {}
function paintList() {
  const sel = state.selected, moons = state.show.moons;
  for (const li of document.querySelectorAll('.body-item')) {
    const btn = li.querySelector('.body-btn'), exp = li.querySelector('.exp');
    btn.setAttribute('aria-current', btn.dataset.body === sel);
    li.classList.toggle('cur', btn.dataset.body === sel);
    if (li.dataset.parent) li.hidden = !(moons && openSystems.has(li.dataset.parent));
    if (exp) {
      const open = moons && openSystems.has(exp.dataset.system);
      exp.setAttribute('aria-expanded', open);
      // with moons hidden there is nothing to open
      exp.hidden = !moons;
    }
  }
  hudBoxes = null;
}

// ---------------------------------------------------------------- events (eclipses, transits)
// A list that opens at the displayed date and grows in both directions as it is scrolled: each end
// that comes within reach asks for one more step of events. The searches run in a worker, one step
// at a time, so scrolling never waits for them.
const EV_KINDS = ['solar', 'lunar', 'transit'];
const EV_COLOR = { solar: BY_NAME.Sun.color, lunar: '#c8683f' };   // the Sun; the eclipsed Moon's copper
let evKinds = new Set(EV_KINDS);
try { const k = JSON.parse(localStorage.getItem('solarSystem.evKinds')); if (Array.isArray(k)) evKinds = new Set(k.filter(x => EV_KINDS.includes(x))); } catch {}
// gen: which list the replies belong to (a new one starts when the list is rebuilt); busy: a step
// is being searched; anchor: the instant to bring to the top once the first rows arrive
const ev = { gen: 0, at: 0, anchor: null, busy: false, atStart: true, atEnd: true, on: false, queued: false };
// Times are given as the clock shows them, in local time or UTC (UT in Scientific), and the rows
// are grouped by the year in that time (local time can put an event in the next or previous year)
const evUtc = () => timeMode !== 'Local';
const evYear = t => civil(new Date(t), evUtc()).y;
const evZone = d => timeMode === 'Local' ? tzName(d) : timeMode === 'Scientific' ? 'UT' : 'UTC';
const evWhen = (d, sep) => fmtDate(d, evUtc()) + sep + fmtTime(d, evUtc(), false) + ' ' + evZone(d);

// the worker (started on first use), or if it cannot start, the same searches on the page
let evPost = m => {
  const serve = eventService();
  const local = m => setTimeout(() => evReply(serve(m)));
  let pending = [];
  try {
    const w = new Worker(new URL('./astro/events-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = e => { pending.shift(); evReply(e.data); };
    // an error (module workers unsupported): replay what was asked, on the page
    w.onerror = () => { w.terminate(); evPost = local; const p = pending; pending = []; p.forEach(local); };
    evPost = m => { pending.push(m); w.postMessage(m); };
  } catch { evPost = local; }
  evPost(m);
};

function openEvents() {
  openSheet('events');
  ev.at = Math.min(Math.max(state.simMs, MIN_MS), MAX_MS - 1);
  buildEvents(ev.at);
}

// (re)start the list at instant `anchor`, which is scrolled to the top once its rows are in
function buildEvents(anchor) {
  const list = $('evList');
  for (const n of list.querySelectorAll('.ev-group')) n.remove();
  ev.gen++; ev.anchor = anchor; ev.on = evKinds.size > 0;
  ev.atStart = ev.atEnd = !ev.on;
  ev.busy = ev.on;
  if (ev.on) evPost({ gen: ev.gen, later: true, start: { kinds: [...evKinds], at: anchor, min: MIN_MS, max: MAX_MS } });
  paintEvEdges();
}

function evReply(r) {
  if (r.gen !== ev.gen) return;   // for a list since rebuilt
  ev.busy = false; ev.atStart = r.atStart; ev.atEnd = r.atEnd;
  addEvents(r.later, r.events.map(e => ({ ...e, date: new Date(e.date) })), r.span);
  if (ev.anchor !== null) {
    const list = $('evList'), row = [...list.querySelectorAll('.ev, .ev-now')].find(n => +n.dataset.t >= ev.anchor);
    const head = list.querySelector('.ev-year');
    list.scrollTop = row ? row.offsetTop - (head ? head.offsetHeight : 0) : list.scrollHeight;
    ev.anchor = null;
  }
  paintEvEdges();
  queueEvFill();
}

// rows for one step of events after (later) or before those shown, which cover the span [a, b).
// Rows are grouped by year, each group under a heading that stays at the top while its rows pass.
function addEvents(later, items, [a, b]) {
  const list = $('evList');
  // the displayed date's marker, in the step that covers it
  if (ev.at >= a && ev.at < b) {
    const i = items.findIndex(e => e.date > ev.at);
    items.splice(i < 0 ? items.length : i, 0, null);
  }
  if (!items.length) return;
  // rows added above those in view move the view down by as much as the list grew
  const h0 = list.scrollHeight;
  const groups = [...list.querySelectorAll('.ev-group')];
  const first = groups[0] || $('evEnd');
  let group = later ? groups[groups.length - 1] : null, anchor = null;
  for (const e of items) {
    const y = evYear(e ? e.date.getTime() : ev.at);
    if (!group || +group.dataset.y !== y) {
      const old = later ? null : list.querySelector(`.ev-group[data-y="${y}"]`);
      if (old) { group = old; anchor = old.querySelector('.ev-year').nextSibling; }   // the year continues into the old rows
      else {
        group = document.createElement('div');
        group.className = 'ev-group'; group.dataset.y = y;
        group.innerHTML = `<div class="ev-year">${y}</div>`;
        list.insertBefore(group, later ? $('evEnd') : first);
        anchor = null;
      }
    }
    group.insertBefore(e ? eventRow(e) : nowRow(), anchor);
  }
  if (!later) list.scrollTop += list.scrollHeight - h0;
}

function eventRow(e) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'ev';
  b.dataset.t = e.date.getTime();
  const cur = e.start <= ev.at && ev.at <= e.end;
  if (cur) b.setAttribute('aria-current', 'true');
  else if (e.date < ev.at) b.classList.add('past');
  const color = EV_COLOR[e.kind] || BY_NAME[e.sub].color;
  b.innerHTML = `<span class="d">${evWhen(e.date, '<br>')}</span><span class="t"><i class="k" style="background:${color}"></i>${e.title}${cur ? '<span class="tag">shown</span>' : ''}</span><span class="w">${e.detail}</span>`;
  b.addEventListener('click', () => { closeSheets(); jumpToEvent(e); });
  return b;
}
function nowRow() {
  const d = document.createElement('div');
  d.className = 'ev-now'; d.dataset.t = ev.at;
  d.textContent = `Displayed · ${evWhen(new Date(ev.at), ' ')}`;
  return d;
}
function paintEvEdges() {
  $('evTop').textContent = !ev.on ? '' : ev.atStart ? 'The model begins in the year 1000.' : 'Searching earlier events…';
  $('evEnd').textContent = !ev.on ? 'Choose at least one kind of event.' : ev.atEnd ? 'The model ends in the year 2999.' : 'Searching later events…';
  for (const b of document.querySelectorAll('[data-evkind]')) b.setAttribute('aria-pressed', evKinds.has(b.dataset.evkind));
}
// ask for a step wherever an end of the list is within reach, one step at a time
function evFill() {
  ev.queued = false;
  if (ev.busy || !ev.on || $('events').hidden) return;
  const r = $('evList').getBoundingClientRect(), reach = 800;
  let later;
  if (!ev.atEnd && $('evEnd').getBoundingClientRect().top < r.bottom + reach) later = true;
  else if (!ev.atStart && $('evTop').getBoundingClientRect().bottom > r.top - reach) later = false;
  else return;
  ev.busy = true;
  evPost({ gen: ev.gen, later });
}
function queueEvFill() { if (!ev.queued) { ev.queued = true; requestAnimationFrame(evFill); } }
function setEvKind(k) {
  if (evKinds.has(k)) evKinds.delete(k); else evKinds.add(k);
  try { localStorage.setItem('solarSystem.evKinds', JSON.stringify([...evKinds])); } catch {}
  rebuildEvents();
}
// rebuild the list, keeping the place: restart from the first row in view
function rebuildEvents() {
  const list = $('evList'), head = list.querySelector('.ev-year');
  const top = list.getBoundingClientRect().top + (head ? head.offsetHeight : 0);
  const row = [...list.querySelectorAll('.ev, .ev-now')].find(n => n.getBoundingClientRect().bottom > top);
  buildEvents(row ? +row.dataset.t : ev.at);
}

function jumpToEvent(e) {
  setTime(e.date.getTime(), { pause: true });
  // a playback rate at which the event takes tens of seconds instead of passing in one frame
  setSpeed(Math.log10({ solar: 120, lunar: 600, transit: 600 }[e.kind]));
  state.dir = 1;
  refreshSnap();
  setScale(1, false);
  computeDisplay();
  camera.fov = DEFAULT_FOV; camera.updateProjectionMatrix();
  const P = n => new THREE.Vector3(...toScene(snap.bodies[n].pos));
  if (e.kind === 'solar') {
    // look down on the point where the shadow axis (Sun → Moon) meets Earth
    const earth = P('Earth'), moon = P('Moon'), ax = moon.clone().normalize();
    const b = ax.dot(earth), R = meanRadius(BY_NAME.Earth), disc = b * b - (earth.lengthSq() - R * R);
    const hit = disc >= 0 ? ax.clone().multiplyScalar(b - Math.sqrt(disc)) : ax.clone().multiplyScalar(b);
    const dir = hit.sub(earth).normalize();
    select('Earth', false);
    view.lock = true; paintToggles();
    view.setFocus('Earth', disp, { dist: drawnRadius('Earth') * 2.6, dir });
  } else if (e.kind === 'lunar') {
    // view the Moon from the Earth side, where it is seen during the eclipse
    const dir = P('Earth').sub(P('Moon')).normalize();
    select('Moon', false);
    view.lock = true; paintToggles();
    view.setFocus('Moon', disp, { dist: drawnRadius('Moon') * 5, dir: dir.add(new THREE.Vector3(0, 0.25, 0)).normalize() });
  } else {
    // a transit: telescope view from Earth toward the Sun
    const earth = P('Earth');
    select(e.sub, false);
    view.setFocus('Sun', disp, { dist: 1 });
    view.tween = null;
    const k = scale.helio(earth.length()) / earth.length();
    camera.position.copy(earth.multiplyScalar(k * 0.9995));
    view.controls.target.set(0, 0, 0);
    camera.fov = 1.1; camera.updateProjectionMatrix();
    toast('Telescope view from Earth toward the Sun. Press Esc to return.');
  }
  hudDirty = true;
}

// ---------------------------------------------------------------- sheets, toasts, links
// The guide and the list of events: each one's button opens it and closes it again, as do a click or
// tap outside it and Esc. The button is lit while its sheet is open.
const SHEET_BTN = { guide: 'guideBtn', events: 'eventsBtn' };
const openSheetEl = () => document.querySelector('.sheet:not([hidden])');
function paintSheetBtns() { for (const [id, btn] of Object.entries(SHEET_BTN)) $(btn).setAttribute('aria-expanded', !$(id).hidden); }
// Where the panels leave no room for it (phones, tablets held upright), the bodies panel and then
// the information panel fold while the sheet is open, and open again when it closes. A press on the
// Bodies or Settings tab closes the sheet without reopening the bodies panel, which the tab's own
// click then sets (reopened first, the Bodies tab would fold it again at once).
let unfoldAfterSheet = null;
function openSheet(id) {
  closeSheets();
  $(id).hidden = false;
  if (!placeSheet()) {
    unfoldAfterSheet = { panel, info: !info.min };
    if (panel) setPanel(null);
    if (!placeSheet() && !info.min) { info.setMin(true); placeSheet(); }
  }
  paintSheetBtns(); $(id).querySelector('[data-close]').focus();
}
function closeSheets({ keepPanel = false } = {}) {
  for (const s of document.querySelectorAll('.sheet')) s.hidden = true;
  paintSheetBtns();
  const u = unfoldAfterSheet;
  unfoldAfterSheet = null;
  if (u?.panel && !keepPanel) setPanel(u.panel);
  if (u?.info) info.setMin(false);
}
// An open sheet sits in the space the panels leave free, so it covers none of them: beside them
// where there is room (right of the clock and the information panel, left of the bodies panel, above
// the time controls), otherwise between the panels at the top and those at the bottom (phones, and
// tablets held upright). Where neither leaves enough room it is centred over everything (style.css),
// and this returns false.
function placeSheet() {
  const s = openSheetEl();
  if (!s) return true;
  s.style.left = s.style.top = s.style.width = s.style.maxHeight = s.style.height = s.style.transform = '';
  if (hud.hidden) return true;
  const app = $('app').getBoundingClientRect(), gap = parseFloat(getComputedStyle($('app')).getPropertyValue('--gap')) || 20;
  const box = el => { const r = el.getBoundingClientRect(); return { l: r.left - app.left, r: r.right - app.left, t: r.top - app.top, b: r.bottom - app.top }; };
  const time = document.querySelector('header.time'), ctl = document.querySelector('.timectl');
  let top = gap, bottom = box(ctl).t - gap, left = gap, right = app.width - gap;
  if (!PHONE.matches) {
    for (const el of [time, $('info')]) {
      const r = box(el);
      if (el.offsetParent && r.b > top && r.t < bottom) left = Math.max(left, r.r + gap);
    }
    const rc = box($('right'));
    if (rc.b > top && rc.t < bottom) right = Math.min(right, rc.l - gap);
  }
  if (PHONE.matches || right - left < Math.min(420, s.offsetWidth)) {
    left = gap; right = app.width - gap;
    top = Math.max(box(time).b, box($('right')).b) + gap;
    bottom = Math.min(bottom, box($('info')).t - gap);
  }
  // its own size, as style.css sets it, fitted into that space
  const cs = getComputedStyle(s), w = Math.min(s.offsetWidth, right - left);
  const h = Math.min(s.id === 'events' ? parseFloat(cs.height) : s.offsetHeight, bottom - top);
  if (right - left < Math.min(420, s.offsetWidth) || h < 320) return false;
  s.style.transform = 'none';
  s.style.width = w + 'px';
  s.style.left = left + (right - left - w) / 2 + 'px';
  s.style.top = top + (bottom - top - h) / 2 + 'px';
  if (s.id === 'events') s.style.height = h + 'px'; else s.style.maxHeight = h + 'px';
  return true;
}
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3200); }

// A view given in the URL hash (#t=…&focus=…&sel=…&scale=…&speed=…&dir=-1&play=0&cam=…&fov=…), as
// the former Share view wrote it. Still read, for old links and the screenshot script; never written.
function readUrl() {
  const q = new URLSearchParams(location.hash.slice(1));
  const t = Date.parse(q.get('t') || '');
  if (!Number.isNaN(t)) setTime(t);
  const num = k => q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : null;
  // speed: log10 |rate|; dir=-1 turns on reverse (links without it ran forward)
  if (num('speed') !== null) state.speed = Math.max(0, Math.min(SPEED_MAX, num('speed')));
  state.dir = num('dir') === -1 ? -1 : 1;
  if (q.has('play')) state.playing = q.get('play') === '1';
  if (num('scale') !== null) setScale(num('scale'), false);
  const focus = q.get('focus');
  return { focus: BY_NAME[focus] ? focus : null, sel: BY_NAME[q.get('sel')] ? q.get('sel') : null, cam: (q.get('cam') || '').split(',').map(Number), fov: num('fov') };
}

// ---------------------------------------------------------------- controls wiring
function paintToggles() {
  wake();
  for (const b of document.querySelectorAll('[data-toggle]')) {
    const k = b.dataset.toggle;
    const on = k === 'lock' ? view.lock : state.show[k];
    b.setAttribute('aria-checked', on);
  }
  saveSettings();
}
// The settings survive a reload: the switches, Lock, the scale and Night sides. Saved only once startup is
// over, so neither the defaults painted then nor a view from the URL hash (which overrides the
// saved scale, readUrl running after restoreSettings) is written back by itself.
const SETTINGS_KEY = 'solarSystem.settings';
let settingsRestored = false;
function saveSettings() {
  if (!settingsRestored) return;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ show: state.show, lock: view.lock, scale: state.scaleTarget, night: state.nightLight })); } catch {}
}
function restoreSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (v && typeof v === 'object') {
      // only switches that still exist, so a renamed or removed one falls back to its default
      if (v.show) for (const k of Object.keys(state.show)) if (typeof v.show[k] === 'boolean') state.show[k] = v.show[k];
      if (typeof v.lock === 'boolean') view.lock = v.lock;
      if (Number.isFinite(v.scale)) setScale(v.scale, false);
      if (Number.isFinite(v.night)) setNightLight(v.night);
    }
  } catch {}
}
function wire() {
  // anything the user does, and anything that finishes loading, may change the picture
  for (const ev of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'click', 'touchstart']) window.addEventListener(ev, () => wake(), { capture: true, passive: true });
  window.addEventListener('pointermove', e => { if (e.buttons) wake(); }, { passive: true });
  document.addEventListener('visibilitychange', () => wake());
  // iOS Safari zooms the page on a pinch even where touch-action forbids it; its own gesture events
  // (not the pointer events the 3D view uses) can still be cancelled
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  // Labels lie over the 3D view: the wheel and a trackpad pinch there zoom the view, as they do
  // next to them. Elsewhere (the panels) a pinch, which arrives as a wheel event with Ctrl held,
  // must not zoom the page; a plain wheel still scrolls lists and sheets.
  $('labels').addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    renderer.domElement.dispatchEvent(new WheelEvent('wheel', e));
  }, { passive: false });
  window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  // Labels answer the mouse (hover, pointer cursor, click) but let a finger or pen through to the
  // view. Decided by the pointer in use, not by (hover: none), which touchscreen laptops report even
  // with a mouse; until a pointer is seen, that guess stands. A touch that lands on a label while
  // they answer the mouse is left to finish as a click (the browser places a tap's click afresh).
  const labelsTouch = on => $('labels').classList.toggle('touch', on);
  labelsTouch(matchMedia('(hover: none)').matches);
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') labelsTouch(false); }, { capture: true, passive: true });
  window.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && !e.target.closest('.lbl')) labelsTouch(true); }, { capture: true, passive: true });
  view.controls.addEventListener('change', () => wake(300));   // includes damping after a drag
  THREE.DefaultLoadingManager.onProgress = () => wake();
  bodies.onChange = () => wake();
  stars.ready.then(() => wake());
  document.fonts && document.fonts.ready.then(() => { labels.remeasure(); wake(); });

  for (const b of document.querySelectorAll('[data-toggle]')) b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    // re-locking brings the camera back onto the body it drifted away from
    if (k === 'lock') { view.lock = !view.lock; if (view.lock) view.glide(); }
    else state.show[k] = !state.show[k];
    if (k === 'moons') paintList();
    paintToggles();
  });
  $('scale').addEventListener('input', e => setScale(1 - e.target.value, false));
  $('scaleMin').addEventListener('click', () => setScale(0));
  $('scaleMax').addEventListener('click', () => setScale(1));
  $('night').addEventListener('input', e => setNightLight(+e.target.value));
  $('nightReal').addEventListener('click', () => setNightLight(0, true));
  $('nightLit').addEventListener('click', () => setNightLight(1, true));
  $('playBtn').addEventListener('click', () => setPlaying(!state.playing));
  $('revBtn').addEventListener('click', () => setReverse(state.dir > 0));
  $('nowBtn').addEventListener('click', () => setTime(Date.now()));
  // the slider sets the speed only: a pause stays a pause
  $('speed').addEventListener('input', e => setSpeed(+e.target.value));

  // The calendar button. On touchscreens the date input lies invisibly over it (style.css), so a tap
  // opens the system's own picker, and the date it sets is applied at once. On computers the button
  // opens the input as a popover: a date typed or picked there is applied with Set or Enter, and Esc
  // (or a click elsewhere) leaves it.
  const when = $('when'), whenForm = $('whenForm'), whenBtn = $('whenBtn');
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const setWhenOpen = on => { whenOpen = on; whenForm.classList.toggle('open', on); whenBtn.setAttribute('aria-expanded', on); if (!on) hudDirty = true; };
  // in the clock's time (local or UTC), Julian calendar before 1582
  const goToWhen = () => {
    const t = parseLocalInput(when.value, timeMode !== 'Local');
    if (Number.isNaN(t) || t < MIN_MS || t > MAX_MS) { toast('Choose a date between the years 1000 and 2999.'); return false; }
    setTime(t); return true;
  };
  whenBtn.addEventListener('click', () => {
    if (whenOpen) { setWhenOpen(false); return; }
    when.value = localInput(new Date(state.simMs), timeMode !== 'Local');
    setWhenOpen(true);
    when.focus();
    // on computers the popover is the picker (typing, or the field's own calendar icon); opening the
    // system's picker as well put two calendars on screen
    if (touch()) try { when.showPicker(); } catch {}
  });
  whenForm.addEventListener('submit', e => { e.preventDefault(); if (goToWhen()) { setWhenOpen(false); when.blur(); } });
  when.addEventListener('change', () => { if (touch() && when.value) goToWhen(); });
  when.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setWhenOpen(false); when.blur(); }
  });
  window.addEventListener('pointerdown', e => { if (whenOpen && !e.target.closest('#whenForm, #whenBtn')) setWhenOpen(false); }, true);
  $('timeMode').addEventListener('click', () => setTimeMode(TIME_MODES[(TIME_MODES.indexOf(timeMode) + 1) % TIME_MODES.length]));
  $('badge').addEventListener('click', () => { openSheet('guide'); $('guideAccuracy').open = true; $('guideAccuracy').scrollIntoView({ block: 'start' }); });
  $('eventsBtn').addEventListener('click', () => $('events').hidden ? openEvents() : closeSheets());
  $('evList').addEventListener('scroll', queueEvFill, { passive: true });
  for (const b of document.querySelectorAll('[data-evkind]')) b.addEventListener('click', () => setEvKind(b.dataset.evkind));
  $('guideBtn').addEventListener('click', () => $('guide').hidden ? openSheet('guide') : closeSheets());
  // a press outside the open sheet closes it (its own button toggles it instead)
  document.addEventListener('pointerdown', e => {
    const s = openSheetEl();
    if (s && !s.contains(e.target) && !e.target.closest('#guideBtn, #eventsBtn, #badge')) closeSheets({ keepPanel: !!e.target.closest('#bodiesTab, #settingsTab') });
  }, true);
  $('settingsTab').addEventListener('click', () => panel === 'settings' ? setPanel(null) : openSettings());
  $('hideBtn').addEventListener('click', () => hud.set(true));
  $('bodiesTab').addEventListener('click', () => setPanel(panel === 'bodies' ? null : 'bodies', true));
  for (const c of document.querySelectorAll('[data-close]')) c.addEventListener('click', () => closeSheets());
  // the info panel changes height when "More data" opens or (on phones) when it expands
  $('more').addEventListener('toggle', () => { hudBoxes = null; });
  $('info').addEventListener('click', () => { hudBoxes = null; });

  // A click or tap on the view picks the body under it; on empty space, with the interface hidden,
  // it brings the interface back. Drags, pinches and two-finger drags do neither.
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', () => { if (PHONE.matches && !hud.hidden) setPanel(null); });
  onTap(cv, e => {
    // the labels let touches through to the view (see style.css), so a tap on one
    // is found here
    const name = bodyAt(e.clientX, e.clientY);
    if (name) select(name, true);
    else if (hud.hidden) hud.set(false);
  });
  // hover: a faint ring and a pointer cursor say that bodies can be clicked (over a label too,
  // which may have a dot under it that a click would choose instead)
  const hover = e => {
    pointer = e.pointerType !== 'mouse' || e.buttons ? null : [e.clientX, e.clientY];
    updateHover();
  };
  cv.addEventListener('pointermove', hover, { passive: true });
  $('labels').addEventListener('pointermove', hover, { passive: true });
  for (const el of [cv, $('labels')]) el.addEventListener('pointerleave', () => { pointer = null; updateHover(); });

  // whether focus was last moved with the keyboard (Tab) rather than by clicking
  let keyboardNav = false;
  window.addEventListener('pointerdown', () => { keyboardNav = false; }, true);
  window.addEventListener('keydown', e => {
    if (e.key === 'Tab') keyboardNav = true;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key.startsWith('Arrow')) e.stopImmediatePropagation(); return; }
    if (e.key.startsWith('Arrow') && e.target.closest && e.target.closest('.sheet')) { e.stopImmediatePropagation(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let used = true;
    switch (e.key) {
      // Space presses a button reached with the keyboard; after a click it is play/pause again
      case ' ': if ((tag === 'BUTTON' || tag === 'SUMMARY') && keyboardNav) { used = false; break; } setPlaying(!state.playing); break;
      case '[': stepSpeed(-1); break;
      case ']': stepSpeed(1); break;
      case 'r': case 'R': setReverse(state.dir > 0); break;
      case 'h': case 'H': hud.toggle(true); break;
      case 'n': case 'N': setTime(Date.now()); break;
      case 't': case 'T': setScale(scale.s < 0.5 ? 1 : 0); break;
      case 'Escape':
        // an open sheet first, then the settings, then back to the whole system
        if (openSheetEl()) { closeSheets(); break; }
        if (panel === 'settings') { setPanel(beforeSettings); break; }
        camera.fov = DEFAULT_FOV; camera.updateProjectionMatrix();
        select('Sun', false);
        view.setFocus('Sun', disp, { dist: systemDistance(), dir: systemDir() });
        break;
      default: used = false;
    }
    if (used) { e.preventDefault(); hudDirty = true; }
  }, true);

  const resize = () => {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    hudBoxes = null;
    placeSheet();
    wake();
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  // the phone layout stacks the information panel on the time controls, whose height depends on
  // how their rows wrap
  const ctl = document.querySelector('.timectl');
  new ResizeObserver(() => { $('app').style.setProperty('--ctl-h', ctl.offsetHeight + 'px'); hudBoxes = null; }).observe(ctl);
  // and the part of the screen the panels leave free changes with them
  new ResizeObserver(() => { hudBoxes = null; wake(); }).observe($('info'));
  // the panels above the information panel, and the bodies heading the clock must keep clear of on phones
  // the compact layout's rows are taller
  PHONE.addEventListener('change', evenPanes);
  const layout = new ResizeObserver(layoutPanels);
  for (const el of [stage, document.querySelector('header.time'), $('right'), $('bodiesBar')]) layout.observe(el);
}

// The information panel keeps at least the same gap to the panels above it (the clock and the
// bodies panel, where they lie over it) as to those below: --info-top is how far down they reach,
// and the panel's height is capped by it (style.css), so it scrolls inside rather than closing in.
function layoutPanels() {
  const app = $('app'), info = $('info').getBoundingClientRect();
  let top = 0;
  for (const el of [document.querySelector('header.time'), $('right')]) {
    const r = el.getBoundingClientRect();
    if (r.height && r.right > info.left && r.left < info.right) top = Math.max(top, r.bottom);
  }
  app.style.setProperty('--info-top', Math.ceil(top) + 'px');
  app.style.setProperty('--tb-w', Math.ceil($('bodiesBar').getBoundingClientRect().width) + 'px');
}

// ---------------------------------------------------------------- start
const hud = new HudVisibility($('app'), $('hudHint'), hidden => {
  if (hidden) closeSheets();
  hudBoxes = null; wake();
});
buildList();
setPanel(bodiesOpen ? 'bodies' : null);
wire();
setTimeMode(timeMode);
setNightLight(state.nightLight);
restoreSettings();
const fromUrl = readUrl();
settingsRestored = true;
refreshSnap();
computeDisplay();
measureFree();
camera.position.copy(SYSTEM_DIR).multiplyScalar(systemDistance());
select(fromUrl.sel || 'Sun', false);
if (fromUrl.focus) {
  view.setFocus(fromUrl.focus, disp, { dist: focusDistance(fromUrl.focus), ms: 1 });
  if (fromUrl.cam.length === 3 && fromUrl.cam.every(Number.isFinite)) {
    view.tween = null;
    view.controls.target.set(0, 0, 0);
    camera.position.set(...fromUrl.cam);
  }
  if (fromUrl.fov > 0 && fromUrl.fov < 120) { camera.fov = fromUrl.fov; camera.updateProjectionMatrix(); }
}
paintToggles();
applyScale(scale.s);
stars.ready.then(() => { stars.setEpoch(snap.tt / 365.25); });
if (REDUCED_MOTION) toast('Reduced motion is on: time starts paused.');
requestAnimationFrame(t => { last = t; frame(t); });

// for debugging from the console
// look at a body from a direction given relative to the Sun direction ('sun'), or as a scene vector
function look(name, dir = 'sun', k = 5) {
  select(name, false);
  const me = new THREE.Vector3(...toScene(snap.bodies[name].pos));
  let d = dir === 'sun' ? me.clone().negate().normalize() : new THREE.Vector3(...dir).normalize();
  if (dir === 'sun') d.add(new THREE.Vector3(0, 0.35, 0)).normalize();
  view.setFocus(name, disp, { dist: drawnRadius(name) * k, dir: d });
}
window.solarSystem = { look, state, view, scale, bodies, orbits, glare, renderer, snapshotAt: ms => snapshot(ms), setTime, setScale, select, jumpToEvent, EventTimeline, openEvents };
