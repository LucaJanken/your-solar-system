// Fit the precessing-ellipse models of js/astro/satellites.js to Horizons vectors.
//
//   python3 tests/fetch_horizons.py 606 401 402
//   node tests/fit-satellites.mjs 606 15.945448 x 0.0334442282     # Titan  (id, period d, -, planet mean motion °/d)
//   node tests/fit-satellites.mjs 401 0.31891023 nd 0.5240207766   # Phobos ('nd': also fit tidal acceleration)
//   node tests/fit-satellites.mjs 402 1.2624407 x 0.5240207766     # Deimos
//   POLE=119.4,-43.5 node tests/fit-satellites.mjs 801 5.876854 x 0.0059811   # Triton (seed pole: its orbit
//                                                   # sweeps around Neptune's pole in ~700 years)
//   node tests/fit-satellites.mjs 901 6.3872273 x 0.0039753        # Charon
//
// Saturn's other moons need periodic perturbation terms as well (resonances, the Sun, each other).
// They are fitted to vectors at 12,000 random times (python3 tests/fetch_horizons.py --dense …, which
// writes tests/horizons-dense/): on a regular grid a term cannot be told from its aliases.
//   export REF=tests/horizons-dense PMIN=3 S=0.0334442282
//   AUTO=12 TERMS=L26124.7658,L8601.1081 node tests/fit-satellites.mjs 601 0.942421813 x $S   # Mimas
//   AUTO=8 TERMS=L4037,L1418.92 node tests/fit-satellites.mjs 602 1.370217855 x $S           # Enceladus
//   AUTO=8 TERMS=L25802,L8610 node tests/fit-satellites.mjs 603 1.887802160 x $S             # Tethys
//   AUTO=8 TERMS=L4039,L1418.92 node tests/fit-satellites.mjs 604 2.736914742 x $S           # Dione
//   AUTO=8 node tests/fit-satellites.mjs 605 4.517500436 x $S                                # Rhea
//   AUTO=10 TERMS=L80.5159,R80.5159,L79.92,Z79.92,L78.75,R78.75 node tests/fit-satellites.mjs 608 79.3302 x $S   # Iapetus
// Each term is a type and a seed period in days: L adds to the mean longitude, R scales the radius,
// Z moves the moon out of its orbital plane. Amplitudes and frequencies are fitted. The seeds are the
// resonances (Mimas–Tethys: 71 years and its third harmonic; Enceladus–Dione: 11 and 3.9 years) and,
// for Iapetus, the Sun's terms at its orbital frequency ± once and twice Saturn's. With AUTO=n the
// fit then adds n more terms itself, one at a time: each is the strongest peak of the residuals'
// periodogram (along-track → L, radial → R, cross-track → Z, periods ≥ PMIN days), after which
// everything is refitted. The TERMS it ends with are printed, to be pasted back for a rerun.
//
// Levenberg–Marquardt on all 3-D positions, seeded from osculating elements. Prints the RMS and
// maximum error and the parameters (angles in degrees, rates per day; reduce L0, node0, peri0 mod 360).
import fs from 'fs';
const REF = process.env.REF || new URL('./horizons-full', import.meta.url).pathname, D = Math.PI / 180, J2000 = 2451545.0;
const [key, P0] = [process.argv[2], +process.argv[3]];
const NP = (+process.argv[5] || 0) * Math.PI / 180;
const PMIN = +(process.env.PMIN || 60), AUTO = +(process.env.AUTO || 0);
const data = JSON.parse(fs.readFileSync(`${REF}/${key}.json`)).map(r => ({ t: r[0] - J2000, r: r.slice(1, 4), v: r.slice(4, 7) }));
const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
const norm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// 1. Laplace pole guess = mean orbit normal
let hs = [0, 0, 0]; data.forEach(d => { const h = norm(cross(d.r, d.v)); hs = hs.map((x, i) => x + h[i]); });
const p0 = process.env.POLE ? (([ra, de]) => [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)])(process.env.POLE.split(',').map(x => +x * D)) : norm(hs);
const ra0 = Math.atan2(p0[1], p0[0]), de0 = Math.asin(p0[2]);
function frame(ra, de) { // Laplace frame: x = ascending node on ICRF equator, z = pole
  const z = [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)];
  const x = [-Math.sin(ra), Math.cos(ra), 0]; const y = cross(z, x); return [x, y, z];
}
// params: ra, de, a, e, i, O0, Odot, w0(peri long), wdot, L0, n, ndot, 6 long-period longitude terms,
// then [c, s, ω (rad/day)] for each extra term, whose types are in `types`
const types = [];
const seeds = (process.env.TERMS || '').split(',').filter(Boolean).map(s => {
  const m = /^([LRZ]?)([\d.]+)$/.exec(s); types.push(m[1] || 'L'); return 2 * Math.PI / +m[2];
});
function model(p, t) {
  const [ra, de, a, e, inc, O0, Od, W0, Wd, L0, n, nd, c1, s1, c2, s2, c3, s3] = p;
  const f = NP * t, Oa = O0 + Od * t;
  const O = O0 + Od * t, W = W0 + Wd * t;
  let L = L0 + n * t + 0.5 * nd * t * t + c1 * Math.cos(f) + s1 * Math.sin(f) + c2 * Math.cos(2 * f) + s2 * Math.sin(2 * f) + c3 * Math.cos(Oa) + s3 * Math.sin(Oa);
  let dr = 0, dz = 0;
  for (let k = 18, j = 0; k < p.length; k += 3, j++) {
    const x = p[k] * Math.cos(p[k + 2] * t) + p[k + 1] * Math.sin(p[k + 2] * t);
    if (types[j] === 'L') L += x; else if (types[j] === 'R') dr += x; else dz += x;
  }
  const M = L - W, w = W - O;
  let E = M; for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e) * (1 + dr), yp = a * Math.sqrt(1 - e * e) * Math.sin(E) * (1 + dr);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const rz = dz * Math.hypot(xp, yp);   // out of the orbital plane, along its normal
  const X = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp + si * sO * rz;
  const Y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp - si * cO * rz;
  const Z = (sw * si) * xp + (cw * si) * yp + ci * rz;
  const [fx, fy, fz] = frame(ra, de);
  return [0, 1, 2].map(k => fx[k] * X + fy[k] * Y + fz[k] * Z);
}
// 2. seed from osculating elements in the Laplace frame, with unwrapped linear trends
const GM = key[0] === '6' ? 37931207.7 : key[0] === '7' ? 5793951.3 : { '401': 42828.37, '402': 42828.37, '801': 6835099.97, '901': 975.5 }[key];
const [fx, fy, fz] = frame(ra0, de0);
const loc = a => [dot(a, fx), dot(a, fy), dot(a, fz)];
const osc = data.map(d => {
  const r = loc(d.r), v = loc(d.v), R = Math.hypot(...r), h = cross(r, v), H = Math.hypot(...h);
  const ev = cross(v, h).map((x, k) => x / GM - r[k] / R);
  const inc = Math.acos(h[2] / H), O = Math.atan2(h[0], -h[1]);
  const e = Math.hypot(...ev);
  // longitude of pericentre and true longitude measured in the plane (node-referenced, then + O)
  const nvec = [Math.cos(O), Math.sin(O), 0], m = cross(h.map(x => x / H), nvec);
  const w = Math.atan2(dot(ev, m), dot(ev, nvec)), u = Math.atan2(dot(r, m), dot(r, nvec));
  const nu = u - w, E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)), M = E - e * Math.sin(E);
  return { t: d.t, e, inc, O, W: O + w, L: O + w + M };
});
function linfit(key, rate0) { // unwrap successive samples against an expected rate, then least squares
  let prev = null; const ys = [];
  osc.forEach((o, i) => { let y = o[key]; if (prev !== null) { const exp = prev + rate0 * (o.t - osc[i - 1].t); y = exp + wrap(y - exp); } ys.push(y); prev = y; });
  let sx = 0, sy = 0, sxx = 0, sxy = 0; const N = ys.length;
  osc.forEach((o, i) => { sx += o.t; sy += ys[i]; sxx += o.t * o.t; sxy += o.t * ys[i]; });
  const b = (N * sxy - sx * sy) / (N * sxx - sx * sx); return [(sy - b * sx) / N, b];
}
const mean = k => osc.reduce((s, o) => s + o[k], 0) / osc.length;
const n0 = 2 * Math.PI / P0;
const [L0g, ng] = linfit('L', n0);
const [O0g, Odg] = linfit('O', 0), [W0g, Wdg] = linfit('W', 0);
console.log('seed', key, { e: mean('e'), i: mean('inc') / D, Odot: Odg / D, Wdot: Wdg / D, n: ng / D });
let p = [ra0, de0, data.reduce((s, d) => s + Math.hypot(...d.r), 0) / data.length, mean('e'), mean('inc'), O0g, Odg, W0g, Wdg, L0g, ng, 0, 0, 0, 0, 0, 0, 0, ...seeds.flatMap(w => [0, 0, w])];
const baseMask = p.slice(0, 18).map((_, i) => i === 11 ? (process.argv[4] === 'nd' ? 1 : 0) : i >= 16 ? 1 : i >= 12 ? (NP ? 1 : 0) : 1);
function resid(p) { const out = new Float64Array(data.length * 3); data.forEach((d, i) => { const m = model(p, d.t); out[3 * i] = m[0] - d.r[0]; out[3 * i + 1] = m[1] - d.r[1]; out[3 * i + 2] = m[2] - d.r[2]; }); return out; }
const rms = r => { let s = 0; for (const x of r) s += x * x; return Math.sqrt(s / (r.length / 3)); };
const baseScale = [1e-6, 1e-6, 1, 1e-6, 1e-6, 1e-4, 1e-9, 1e-4, 1e-9, 1e-5, 1e-11, 1e-16, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6];

// Levenberg–Marquardt. The extra terms' frequencies are held for the first `holdW` iterations, until
// their amplitudes are near.
function fit(p, maxIt = 300) {
  const nT = (p.length - 18) / 3, holdW = nT ? 30 : 0;
  const mask = [...baseMask, ...Array.from({ length: nT }, () => [1, 1, 1]).flat()];
  const scale = [...baseScale, ...Array.from({ length: nT }, () => [1e-6, 1e-6, 1e-10]).flat()];
  let lam = 1e-3, r = resid(p), cost = rms(r), still = 0;
  for (let it = 0; it < maxIt; it++) {
    const idx = mask.map((m, i) => m && !(it < holdW && i >= 18 && (i - 18) % 3 === 2) ? i : -1).filter(i => i >= 0);
    const J = idx.map(i => { const q = p.slice(); q[i] += scale[i]; const rq = resid(q); return rq.map((x, k) => (x - r[k]) / scale[i]); });
    const m = idx.length, A = Array.from({ length: m }, () => new Array(m).fill(0)), g = new Array(m).fill(0);
    for (let a = 0; a < m; a++) { const Ja = J[a]; for (let b = 0; b <= a; b++) { const Jb = J[b]; let s = 0; for (let k = 0; k < r.length; k++) s += Ja[k] * Jb[k]; A[a][b] = A[b][a] = s; } let s = 0; for (let k = 0; k < r.length; k++) s += Ja[k] * r[k]; g[a] = -s; }
    let improved = false;
    for (let tries = 0; tries < 12 && !improved; tries++) {
      const M = A.map((row, a) => row.map((x, b) => a === b ? x * (1 + lam) : x)), bb = g.slice();
      for (let c = 0; c < m; c++) { let piv = c; for (let rr = c + 1; rr < m; rr++) if (Math.abs(M[rr][c]) > Math.abs(M[piv][c])) piv = rr; [M[c], M[piv]] = [M[piv], M[c]]; [bb[c], bb[piv]] = [bb[piv], bb[c]]; for (let rr = c + 1; rr < m; rr++) { const f = M[rr][c] / M[c][c]; for (let k = c; k < m; k++) M[rr][k] -= f * M[c][k]; bb[rr] -= f * bb[c]; } }
      const dx = new Array(m); for (let c = m - 1; c >= 0; c--) { let s = bb[c]; for (let k = c + 1; k < m; k++) s -= M[c][k] * dx[k]; dx[c] = s / M[c][c]; }
      const q = p.slice(); idx.forEach((i, k) => q[i] += dx[k]); if (q[3] < 0) { q[3] = -q[3]; q[7] += Math.PI; }
      const rq = resid(q), cq = rms(rq);
      if (cq < cost) { still = it >= holdW && (cost - cq) / cost < 1e-7 ? still + 1 : 0; p = q; r = rq; cost = cq; lam = Math.max(lam / 5, 1e-9); improved = true; } else lam *= 8;
    }
    // converged with the frequencies held: release them at once, with the damping reset
    if (it < holdW && !improved) { it = holdW - 1; lam = 1e-3; continue; }
    if (it >= holdW && (!improved || still >= 3)) break;
  }
  return { p, r, cost };
}

// residuals split into radial, along-track and cross-track components (km)
function components(r) {
  const comp = { rad: new Float64Array(data.length), along: new Float64Array(data.length), cross: new Float64Array(data.length) };
  data.forEach((d, i) => {
    const R = norm(d.r), H = norm(cross(d.r, d.v)), T = cross(H, R), e = [r[3 * i], r[3 * i + 1], r[3 * i + 2]];
    comp.rad[i] = dot(e, R); comp.along[i] = dot(e, T); comp.cross[i] = dot(e, H);
  });
  return comp;
}
// amplitude (km) and phase projections of a component at period P
function spectrum(v, P) {
  const w = 2 * Math.PI / P; let c = 0, s = 0;
  data.forEach((d, i) => { c += v[i] * Math.cos(w * d.t); s += v[i] * Math.sin(w * d.t); });
  return { A: 2 * Math.hypot(c, s) / v.length, c: 2 * c / v.length, s: 2 * s / v.length, P };
}
// The strongest period in PMIN … 30,000 days. Frequencies are scanned evenly, a quarter of the
// resolution 1/T of the data's span apart, so no peak falls between them (a grid even in period
// would be too coarse at short periods); the sines are stepped by rotation, not recomputed.
function peak(v) {
  const t0 = (data[0].t + data[data.length - 1].t) / 2, T = data[data.length - 1].t - data[0].t;
  const f0 = 1 / 30000, df = 1 / (4 * T), K = Math.ceil((1 / PMIN - f0) / df);
  const C = new Float64Array(K), S = new Float64Array(K);
  data.forEach((d, i) => {
    const t = d.t - t0, x = v[i], cd = Math.cos(2 * Math.PI * df * t), sd = Math.sin(2 * Math.PI * df * t);
    let c = Math.cos(2 * Math.PI * f0 * t), s = Math.sin(2 * Math.PI * f0 * t);
    for (let k = 0; k < K; k++) { C[k] += x * c; S[k] += x * s; const cn = c * cd - s * sd; s = s * cd + c * sd; c = cn; }
  });
  let kb = 0; for (let k = 1; k < K; k++) if (C[k] * C[k] + S[k] * S[k] > C[kb] * C[kb] + S[kb] * S[kb]) kb = k;
  // refine between the neighbouring grid frequencies
  let best = { A: 0 };
  for (let j = -10; j <= 10; j++) { const q = spectrum(v, 1 / (f0 + (kb + j / 10) * df)); if (q.A > best.A) best = q; }
  return best;
}

let res = fit(p);
p = res.p;
const TYPE = { along: 'L', rad: 'R', cross: 'Z' };
for (let k = 0; k < AUTO; k++) {
  const comp = components(res.r);
  let best = null;
  for (const [name, v] of Object.entries(comp)) { const q = peak(v); if (!best || q.A > best.A) best = { ...q, name }; }
  // a term that cancels the residual: minus its projection, in radians of the mean orbital radius
  types.push(TYPE[best.name]);
  p = [...p, -best.c / p[2], -best.s / p[2], 2 * Math.PI / best.P];
  res = fit(p, 120);
  p = res.p;
  console.log(`+ ${TYPE[best.name]}${best.P.toFixed(2)} (${best.A.toFixed(0)} km ${best.name})  → rms ${res.cost.toFixed(1)} km`);
}
const r = res.r, cost = res.cost;

const errs = []; data.forEach((d, i) => errs.push([d.t, Math.hypot(r[3 * i], r[3 * i + 1], r[3 * i + 2])]));
const pre = errs.filter(e => e[0] < -36525).map(e => e[1]), post = errs.filter(e => e[0] >= -36525).map(e => e[1]);
console.log(key, 'rms km', cost.toFixed(1), 'max km <1900', Math.max(...pre).toFixed(0), '>=1900', Math.max(...post).toFixed(0));
const [ra, de, a, e, inc, O0, Od, W0, Wd, L0, n, nd, c1, s1, c2, s2, c3, s3] = p;
const extra = types.map((ty, k) => [ty, +(2 * Math.PI / p[20 + 3 * k]).toPrecision(12), p[18 + 3 * k] / (ty === 'R' ? 1 : D), p[19 + 3 * k] / (ty === 'R' ? 1 : D)]);
if (types.length) console.log('TERMS=' + extra.map(x => x[0] + x[1].toFixed(4)).join(','));
console.log(JSON.stringify({ lonTerms: [c1, s1, c2, s2, c3, s3].map(x => x / D), NPdeg: NP / D, poleRA: ra / D, poleDec: de / D, a, e, i: inc / D, node0: O0 / D, nodeRate: Od / D, peri0: W0 / D, periRate: Wd / D, L0: L0 / D, n: n / D, ndot: nd / D, ...(types.length ? { terms: extra } : {}) }));
{ // residual decomposition + dominant period of each component
  const comp = components(r);
  for (const [k, v] of Object.entries(comp)) {
    const best = peak(v, 1.01);
    let s = 0; for (const x of v) s += x * x;
    console.log(k, 'rms', Math.sqrt(s / v.length).toFixed(1), 'peak amp', best.A.toFixed(1), 'km at period', best.P.toFixed(0), 'd');
  }
}
