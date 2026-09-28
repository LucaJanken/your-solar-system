// Orbits of the moons astronomy-engine does not provide: Saturn's (Mimas, Enceladus, Tethys, Dione,
// Rhea, Titan, Iapetus), Triton, Charon, Phobos and Deimos.
//
// Each is a precessing Keplerian ellipse in its own Laplace plane, with a few long-period terms in
// mean longitude (solar perturbation at the planet's orbital frequency, and a term in the node).
// Saturn's moons other than Titan also carry `terms`, periodic perturbations fitted with their
// periods: [type, period (days), cos and sin amplitudes], where type L adds to the mean longitude
// (degrees), R scales the radius (a fraction) and Z moves the moon out of its orbital plane (degrees
// as seen from Saturn). The largest are resonances: Mimas and Tethys, locked in a 4:2 resonance,
// swing 44° and 2° back and forth along their orbits every 71 years (with harmonics, as a pendulum
// that swings far does), and the Enceladus–Dione 2:1 resonance gives both an 11-year term; Iapetus,
// far out, is perturbed mostly by the Sun, at periods close to its own orbit's.
// The parameters were least-squares fitted to JPL Horizons state vectors (SAT441 for Saturn's moons,
// NEP097 for Triton, PLU058 for Charon, MAR097 for the Martian moons) over 1800–2050: sampled every 37
// days, or for Saturn's moons other than Titan at 12,000 random times, since on any regular grid a
// short-period term cannot be told from its aliases (a fit to a 3-day grid missed Dione by 900 km
// between the samples). Maximum position error over that span: Phobos 20 km, Deimos 56 km, Titan
// 900 km (0.04° of its orbit), Mimas 330 km (0.10°), Enceladus 110 km, Tethys 270 km, Dione 210 km,
// Rhea 260 km, Iapetus 2,000 km (0.03°; 1,200 km since 1900), Triton 96 km, Charon 1 km.
// Triton orbits backwards: its fitted Laplace pole points away from Neptune's north pole, about
// which the orbit swings every ~690 years. Charon's position is relative to Pluto's centre. The fit
// script lives in tests/fit-satellites.mjs.
//
// Angles in degrees, rates in degrees per day, time t in TT days since J2000.0.

const D = Math.PI / 180;

const FITS = {
  Phobos: {
    poleRA: 317.751424229654, poleDec: 52.938925256828, a: 9374.922336127434, e: 0.015122931805, i: 1.074631736163,
    node0: 169.077447229898, nodeRate: -0.435789589061, peri0: 25.560092669661, periRate: 0.435182825618,
    L0: 215.124995544553, n: 1128.844756219671, ndot: 1.8888e-8, NP: 0.5240207766,
    lon: [-0.0017624746, -0.005558537, -0.0002625944, 0.0032235464, 0.0012349737, -0.0016087006],
  },
  Deimos: {
    poleRA: 316.735446052753, poleDec: 53.573631511346, a: 23457.533265726943, e: 0.000261056624, i: 1.794056064035,
    node0: 54.594476557352, nodeRate: -0.018067530695, peri0: 248.61336108756, periRate: 0.017919721049,
    L0: 259.340410802513, n: 285.161886979726, ndot: 0, NP: 0.5240207766,
    lon: [-0.006951281, -0.0222075182, -0.0010923097, 0.0117049738, 0.1883176323, -0.1950654029],
  },
  Mimas: {
    poleRA: 40.6114332428, poleDec: 83.5404645731, a: 185535.244684, e: 0.0196632529515, i: 1.57378395184,
    node0: 172.988695382, nodeRate: -0.999499910486, peri0: 145.575578937, periRate: 1.00091820568,
    L0: 160.384190015, n: 381.994500181, ndot: 0, NP: 0.0334442282,
    lon: [-0.02734862456, 0.004881182333, -0.002346470029, -0.001413942735, 0.0003142127215, -0.00007421540062],
    terms: [
      ['L', 26033.6215885, 40.16724604, -42.30264505],
      ['L', 8600.67628237, 0.6304335789, 0.3247239221],
      ['L', 225.057433662, -0.1255641954, 0.04347885285],
      ['L', 223.109822032, 0.05567105848, 0.02045891058],
      ['L', 227.037376157, -0.03218500031, 0.05215196115],
      ['L', 22335.539926, -0.2598992695, -0.3080161485],
      ['L', 13553.0105657, -0.02871002658, -0.02171404996],
      ['L', 26621.8761321, -12.44815832, 8.919708697],
      ['L', 5126.76159369, -0.0007847020433, 0.0197213704],
      ['L', 221.204964568, -0.005897366475, -0.01079025121],
      ['L', 229.059942779, 0.001691509689, 0.01198248509],
      ['L', 11204.6287224, 0.02728393745, 0.01980258656],
      ['L', 457.065145227, -0.006095056414, 0.004482832781],
      ['L', 441.56064038, 0.003776747958, 0.005249003131],
    ],
  },
  Enceladus: {
    poleRA: 40.6091964214, poleDec: 83.5407208452, a: 238035.944121, e: 0.00473583969546, i: 0.000255986441325,
    node0: 301.558505899, nodeRate: -0.371714996095, peri0: 171.518325725, periRate: 0.337964233073,
    L0: 182.239123113, n: 262.731897313, ndot: 0, NP: 0.0334442282,
    lon: [0.001083267835, -0.001384689917, -0.00256241811, 0.000742660129, -0.00007517422611, -0.0002082949844],
    terms: [
      ['L', 4035.30145729, 0.2506740934, 0.07290756188],
      ['L', 1418.90848762, -0.1286417911, 0.1375701176],
      ['L', 1069.45243702, -0.002336125561, 0.00420733643],
      ['L', 2877.1521457, -0.002010635263, -0.001454643606],
      ['L', 709.514522322, -0.001946758173, 0.000003630712598],
      ['L', 4.99764455178, 0.00005659158832, -0.00146256015],
      ['L', 32400.2997616, 0.03125679296, 0.04434241577],
      ['L', 31853.7187507, 0.1576115555, 0.06643648299],
      ['L', 32011.8683366, -0.1906993863, -0.1125444384],
      ['L', 97929.4636328, 0.008016666061, 0.005537404901],
    ],
  },
  Tethys: {
    poleRA: 40.6037448038, poleDec: 83.5416170808, a: 294673.237838, e: 0.00000324759165767, i: 1.09127154315,
    node0: 259.818866205, nodeRate: -0.197848637436, peri0: 112.148202918, periRate: 0.512195170342,
    L0: 188.391384421, n: 190.697912544, ndot: 0, NP: 0.0334442282,
    lon: [-0.0006521388335, -0.001050416783, -0.0004161202644, 0.0005779957303, 0.000207691587, -0.000244373051],
    terms: [
      ['L', 25885.9911002, -1.852378988, 1.009248554],
      ['L', 8599.61571889, -0.02985742964, -0.0159949658],
      ['L', 225.057788978, 0.006216869645, -0.002254860696],
      ['L', 16147.465065, -0.2441140745, 0.3885708137],
      ['L', 25763.2138147, 0.540506571, 0.5622662218],
      ['L', 18392.8503814, 0.6322827127, 0.1503606457],
      ['L', 223.107518887, -0.003101961051, -0.001440258015],
      ['L', 17624.8221299, -1.280419244, 0.2007726883],
      ['L', 16707.5606662, 0.888155238, -0.7019075451],
      ['L', 227.019024719, 0.001458710899, -0.002345190616],
    ],
  },
  Dione: {
    poleRA: 40.5813257773, poleDec: 83.5449978726, a: 377415.06682, e: 0.00219588561615, i: 0.0279434534846,
    node0: 290.745832141, nodeRate: -0.0841683899973, peri0: 214.715463499, periRate: 0.0842493020859,
    L0: 176.925493587, n: 131.534931109, ndot: 0, NP: 0.0334442282,
    lon: [0.001614915345, -0.001601502776, -0.001479401345, 0.000601385068, 0.0002291446985, -0.0001259241747],
    terms: [
      ['L', 4035.4002331, -0.01949231946, -0.005871373306],
      ['L', 1418.91394847, 0.01025827389, -0.01075680858],
      ['L', 3.47189760547, 0.003874735348, 0.001589373597],
      ['L', 3.04244492646, 0.001444208047, 0.003478113266],
      ['L', 27811.0009375, 0.3406984093, 0.04644776838],
      ['L', 26954.7823125, -0.1672263423, 0.008569000823],
      ['L', 3.30402698693, -0.0002896795971, 0.002186947668],
      ['L', 6.94376894525, -0.001515829697, 0.001151105133],
      ['L', 28719.2291502, -0.1711487762, -0.05707543992],
      ['R', 3.04244259604, -0.0000290845077, 0.00001435981394],
    ],
  },
  Rhea: {
    poleRA: 40.1851355873, poleDec: 83.5850268521, a: 527067.565805, e: 0.000971764929654, i: 0.332102153059,
    node0: 351.117232507, nodeRate: -0.0275114137946, peri0: 204.339488315, periRate: 0.00139270487716,
    L0: 52.5810916489, n: 79.6900469722, ndot: 0, NP: 0.0334442282,
    lon: [0.003671907996, -0.002471783139, -0.002921346299, 0.00119887469, 0.002123485914, -0.001165274943],
    terms: [
      ['L', 4.51906720922, 0.002013329536, -0.01640090148],
      ['Z', 4.51744904675, 0.01429119026, 0.03459040199],
      ['R', 4.51906466464, 0.0001425882711, 0.00001617530428],
      ['L', 6.30328261881, -0.004690928048, -0.004806458741],
      ['L', 3.15164374483, 0.006742244739, 0.000154539647],
      ['L', 23742.555267, 0.1247102973, -0.1541404575],
      ['L', 23618.2884481, -0.1185721887, 0.1578853364],
      ['R', 3.15164307829, -0.000001969565098, 0.00007339586471],
    ],
  },
  Titan: {
    poleRA: 36.205839202865, poleDec: 83.970831212178, a: 1221865.0992359817, e: 0.028887730519, i: 0.323742928336,
    node0: 28.830087346249, nodeRate: -0.001378537559, peri0: 208.371584950542, periRate: 0.001394905332,
    L0: 11.901906562503, n: 22.576975420102, ndot: 0, NP: 0.0334442282,
    lon: [0.0071009769, -0.0077018183, -0.0110931591, 0.0045091952, 0.031107251, -0.0228031997],
  },
  Iapetus: {
    poleRA: -75.1470808982, poleDec: 78.834551769, a: 3560852.49469, e: 0.0286395964227, i: 8.27922145212,
    node0: 80.1699395253, nodeRate: -0.000289848850282, peri0: 354.139432825, periRate: 0.000315238466852,
    L0: 194.078960452, n: 4.53797762471, ndot: 0, NP: 0.0334442282,
    lon: [0.04152527338, -0.04548023018, -0.003235794921, 0.02200369619, -4.021549723, 10.77352516],
    terms: [
      ['L', 80.51315284, 0.03645971779, -0.02593166592],
      ['R', 80.5129926039, 0.0002212255408, 0.0003128355607],
      ['L', 79.9180404067, -0.003743691748, -0.00216825672],
      ['Z', 79.9203959425, -0.004692457718, 0.004326422506],
      ['L', 78.7567815944, -0.00006994963047, 0.001302971854],
      ['R', 78.760006707, -0.00001107880637, -0.00000239027505],
      ['Z', 80.5205642604, -0.04191583637, -0.006351798394],
      ['L', 79.364503907, 0.04338795925, 0.03925753648],
      ['L', 79.3064348162, 0.02347893657, -0.04187857051],
      ['R', 79.364435098, -0.0003424610213, 0.0003755890142],
      ['L', 3200.76026283, -0.005468004516, 0.005928779985],
      ['R', 79.306566336, 0.0003635762117, 0.000207149103],
      ['Z', 78.7484785014, 0.003441943661, 0.005776379094],
      ['L', 81.1200583358, 0.001174353953, -0.005557439746],
      ['Z', 81.1287176774, -0.004536669141, 0.002981802977],
      ['R', 19.9567145774, 0.00001153369413, 0.00007859768075],
    ],
  },
  Triton: {
    poleRA: 119.409784818915, poleDec: -43.365137625959, a: 354797.6847073379, e: 0.000175786845, i: 23.076446361081,
    node0: 182.260438171155, nodeRate: -0.001439824761, peri0: 232.800326235039, periRate: 2.8788825936,
    L0: 60.752261781134, n: 61.257260345235, ndot: 0, NP: 0.0059811,
    lon: [-0.0007244184, -0.0003287765, 0.0006434694, 0.0013693269, 0.0119563981, 0.0244113442],
  },
  Charon: {
    poleRA: 133.007128972885, poleDec: -6.262120053898, a: 19595.764510365814, e: 0.000160900211, i: 0.017562037945,
    node0: 179.929277549725, nodeRate: -0.000314427064, peri0: 155.355064577547, periRate: 0.000002701842,
    L0: 304.410033453256, n: 56.362525311303, ndot: 0, NP: 0.0039753,
    lon: [-0.0023979786, -0.0037946571, -0.0002186544, -0.0024228474, 0.2847930864, 0.9797396336],
  },
};

// Laplace-plane basis in ICRF/J2000 equatorial coordinates: x = ascending node on the equator, z = pole
const FRAMES = {};
for (const [name, f] of Object.entries(FITS)) {
  const ra = f.poleRA * D, de = f.poleDec * D;
  const z = [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)];
  const x = [-Math.sin(ra), Math.cos(ra), 0];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  FRAMES[name] = [x, y, z];
}

export const FITTED = Object.keys(FITS);

// position relative to the parent, km, J2000 equatorial (EQJ)
export function satellitePosition(name, t) {
  const f = FITS[name], fr = FRAMES[name];
  const arg = f.NP * t * D;
  const O = (f.node0 + f.nodeRate * t) * D;
  const W = (f.peri0 + f.periRate * t) * D;
  let L = (f.L0 + f.n * t + 0.5 * f.ndot * t * t) * D
    + (f.lon[0] * Math.cos(arg) + f.lon[1] * Math.sin(arg) + f.lon[2] * Math.cos(2 * arg) + f.lon[3] * Math.sin(2 * arg)
      + f.lon[4] * Math.cos(O) + f.lon[5] * Math.sin(O)) * D;
  let dr = 0, dz = 0;
  if (f.terms) for (const [type, P, c, s] of f.terms) {
    const th = 2 * Math.PI * t / P, x = c * Math.cos(th) + s * Math.sin(th);
    if (type === 'L') L += x * D; else if (type === 'R') dr += x; else dz += x * D;
  }
  const M = L - W, w = W - O, e = f.e, inc = f.i * D;
  let E = M;
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = f.a * (Math.cos(E) - e) * (1 + dr), yp = f.a * Math.sqrt(1 - e * e) * Math.sin(E) * (1 + dr);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const rz = dz * Math.hypot(xp, yp);   // out of the orbital plane, along its normal
  const X = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp + si * sO * rz;
  const Y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp - si * cO * rz;
  const Z = (sw * si) * xp + (cw * si) * yp + ci * rz;
  return [0, 1, 2].map(k => fr[0][k] * X + fr[1][k] * Y + fr[2][k] * Z);
}

// The slow part of a moon's mean longitude, which a tidally locked moon's rotation follows (see
// rotation.js, FOLLOW_ORBIT): degrees to add to an IAU prime meridian angle W that turns at
// `iauRate` °/day, for its rate to become the orbit's mean motion and to swing with the orbit's
// longitude terms of periods over 1,000 days.
export function lockedSpin(name, t, iauRate) {
  const f = FITS[name];
  let x = (f.n - iauRate) * t;
  for (const [type, P, c, s] of f.terms || []) {
    if (type !== 'L' || P < 1000) continue;
    const th = 2 * Math.PI * t / P; x += c * Math.cos(th) + s * Math.sin(th);
  }
  return x;
}

// position (km) and velocity (km/s), EQJ, relative to the parent
export function satelliteState(name, t) {
  const h = 20 / 86400;
  const a = satellitePosition(name, t - h), b = satellitePosition(name, t + h), p = satellitePosition(name, t);
  return { pos: p, vel: [0, 1, 2].map(k => (b[k] - a[k]) / 40) };
}
