// The Sun's glare: what an eye or a camera exposed for the planets does with a source ~10¹⁰ times
// brighter. Drawn in screen space over the finished picture, and sized in pixels relative to the
// Sun's drawn disc:
//   bloom   a rim of light hugging the limb, a few percent of the disc radius wide, at every size;
//   halo    a soft glow and a wide faint veil while the disc is small on screen. It fades out as the
//           disc grows, so a close or telescope view (the Sun seen through a filter) keeps its limb
//           darkening and the planets crossing it;
//   corona  fine radial streaks through the halo, like the "ciliary corona" of an eye, whose light
//           is scattered by fibres and particles in the lens and so changes with every movement of
//           the eye: each streak brightens and fades as the view turns, and slowly also while it is
//           held still, since an eye never is (tremor, microsaccades, the tear film), which keeps the
//           Sun looking alive.
// There are no diffraction spikes or lens ghosts: both are fixed to the camera, so they looked like
// a sticker following the Sun around. The glare lights only empty sky (its quad sits at the far plane
// and is depth tested), never the disc or a body in front of it, and scales with the fraction of the
// disc not hidden by one.

// Add colour but leave alpha alone: the canvas is transparent over the page's sky gradient, and
// writing alpha would paint that sky black wherever something is added.
export const ADD_KEEP_ALPHA = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};

import * as THREE from '../../vendor/three.min.js';

export class SunGlare {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      uSun: { value: new THREE.Vector2() },   // Sun centre, device pixels
      uR: { value: 1 },                       // disc radius, CSS pixels
      uPx: { value: 1 },                      // device pixel ratio
      uHalo: { value: 1 },                    // 0..1: how much of the wide glare to show
      uVis: { value: 1 },                     // visible fraction of the disc
      uPhase: { value: new THREE.Vector2() }, // the view direction and the time, which set the corona's streaks
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthTest: true, depthWrite: false, ...ADD_KEEP_ALPHA,
      vertexShader: /* glsl */`void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec2 uSun; uniform float uR; uniform float uPx; uniform float uHalo; uniform float uVis; uniform vec2 uPhase;
        // value noise, periodic in x with period n (so the streaks close up all the way round) and in
        // y with period 64 (so the drift in time can wrap round, see update)
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noiseP(vec2 p, float n) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float x0 = mod(i.x, n), x1 = mod(i.x + 1.0, n), y0 = mod(i.y, 64.0), y1 = mod(i.y + 1.0, 64.0);
          return mix(mix(hash(vec2(x0, y0)), hash(vec2(x1, y0)), f.x), mix(hash(vec2(x0, y1)), hash(vec2(x1, y1)), f.x), f.y);
        }
        void main() {
          vec2 q = (gl_FragCoord.xy - uSun) / uPx;
          // Full strength right up to the limb: the depth test already confines the glare to sky,
          // per antialiasing sample, so a pixel on the edge blends the limb with the glare beside
          // it. Fading the glare in there instead left those pixels darker than both, a dark ring
          // (several device pixels wide on a phone).
          float x = max(length(q) - uR, 0.0);
          // display values (added to the finished sRGB picture, so no colour-space conversion)
          // once the disc is large its limb is visibly darker (limb darkening): the rim of bloom must
          // stay below it, or it reads as a white outline
          float bloom = (0.12 + 0.33 * uHalo) * exp(-x / (2.0 + 0.05 * uR));
          float halo = 0.25 * exp(-x / (8.0 + 0.8 * uR)) + 0.05 / (1.0 + pow(x / (40.0 + 2.0 * uR), 2.0));
          // two octaves of streaks around the disc; their brightness varies with uPhase
          float u = atan(q.y, q.x) / 6.2831853 + 0.5;
          float s1 = pow(noiseP(vec2(u * 72.0, uPhase.x), 72.0), 3.0), s2 = pow(noiseP(vec2(u * 167.0, uPhase.y), 167.0), 2.0);
          // Near a small disc the streaks are narrower than a pixel: sampled there, they flickered as
          // the Sun drifted across the screen by fractions of a pixel (time running, view held
          // still). Each octave fades to its mean (0.197 for noise³, 0.299 for noise²) where one
          // noise cell spans less than 1–2.5 device pixels, which takes the change per pixel for a
          // 0.15 px drift from up to 11/255 to about 1/255, as for a disc large enough to resolve them.
          float circ = 6.2831853 * length(gl_FragCoord.xy - uSun);
          s1 = mix(0.197, s1, smoothstep(1.0, 2.5, circ / 72.0));
          s2 = mix(0.299, s2, smoothstep(1.0, 2.5, circ / 167.0));
          float st = 0.65 * s1 + 0.35 * s2;
          float corona = 0.16 * st * exp(-x / (22.0 + 1.2 * uR)) * min(x / 3.0, 1.0);
          float I = (bloom + uHalo * (halo + corona)) * uVis;
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.88) * I, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.on = false;
    this.halo = 0; this.vis = 0; this.dir = new THREE.Vector3();   // for dimming the stars
    this.t = 0;   // seconds of the corona's drift
  }

  /**
   * @param sunPos  Sun's position in the scene; R its drawn radius
   * @param occluders [{ pos: Vector3, R, visible }] spheres that can hide it
   * @param dt      seconds since the last frame, by which the corona drifts (0 holds it still)
   */
  update(camera, sunPos, R, W, H, pixelRatio, occluders, dt = 0) {
    // wrapped after 640 s, when both drifts below have moved by whole periods (64 cells) of the noise
    this.t = (this.t + dt) % 640;
    const v = _v.copy(sunPos).project(camera);
    const d = camera.position.distanceTo(sunPos), tanF = Math.tan(camera.fov * Math.PI / 360);
    // radius of the silhouette: a sphere seen from close by looks wider than R/d
    const rpx = R / Math.sqrt(Math.max(d * d - R * R, 1e-24)) * (H / 2) / tanF;
    const x = (v.x * 0.5 + 0.5) * W, y = (v.y * 0.5 + 0.5) * H;
    // behind the camera, or so far off screen that not even the glare reaches in
    const reach = 150 + 3 * rpx;
    this.on = v.z < 1 && x > -reach && x < W + reach && y > -reach && y < H + reach;
    if (!this.on) { this.vis = 0; return; }
    this.vis = visibleFraction(camera, sunPos, R, occluders);
    this.on = this.vis > 0.001;
    this.halo = Math.max(0, Math.min(1, (90 - rpx) / 60));
    this.dir.copy(sunPos).sub(camera.position).normalize();
    const u = this.uniforms;
    u.uSun.value.set(x * pixelRatio, y * pixelRatio);
    u.uR.value = rpx; u.uPx.value = pixelRatio; u.uHalo.value = this.halo; u.uVis.value = this.vis;
    // The corona's pattern follows the direction the camera looks in, so it shimmers as the view
    // turns, also while orbiting the Sun with it held in the centre (an eye's pattern changes with
    // every movement of the eye). 5 noise cells per radian: turning 10° renews about one streak in ten.
    // On top of that a drift in time, 0.3 and 0.5 cells a second, so a streak takes a few seconds
    // to brighten or fade even with the view held still.
    camera.getWorldDirection(_c);
    u.uPhase.value.set(5 * (_c.x + 0.6 * _c.y - 0.3 * _c.z) + 0.3 * this.t, 5 * (_c.z + 0.6 * _c.x - 0.4 * _c.y) + 0.5 * this.t);
  }

  render(renderer) { if (this.on) renderer.render(this.scene, this.camera); }
}

// fraction of the Sun's disc not hidden by the drawn spheres, sampled at the centre and two rings
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _ray = new THREE.Vector3(), _oc = new THREE.Vector3(), _t = new THREE.Vector3();
const _c = new THREE.Vector3();
function visibleFraction(camera, sunPos, R, occluders) {
  const cam = camera.position;
  _ray.subVectors(sunPos, cam).normalize();
  _u.set(0, 1, 0).cross(_ray); if (_u.lengthSq() < 1e-6) _u.set(1, 0, 0).cross(_ray);
  _u.normalize(); _w.crossVectors(_ray, _u);
  let seen = 0, n = 0;
  for (const [rr, k] of [[0, 1], [0.5, 6], [0.9, 8]]) {
    for (let i = 0; i < k; i++) {
      const a = 2 * Math.PI * i / k;
      _s.copy(sunPos).addScaledVector(_u, R * rr * Math.cos(a)).addScaledVector(_w, R * rr * Math.sin(a));
      n++;
      if (!hidden(cam, _s, occluders)) seen++;
    }
  }
  return seen / n;
}
function hidden(cam, p, occluders) {
  _oc.subVectors(p, cam);
  const L = _oc.length(), dir = _oc.divideScalar(L);
  for (const o of occluders) {
    if (!o.visible) continue;
    const t = _t.subVectors(o.pos, cam).dot(dir);
    if (t <= 0 || t >= L) continue;
    if (_t.lengthSq() - t * t < o.R * o.R) return true;
  }
  return false;
}
