// Eclipses and transits, searched from the ephemeris itself (not a hard-coded list).
//
// An EventTimeline covers a span of time that grows in either direction on request, so a list can
// scroll forward and backward. Each kind of event is its own sequence (astronomy-engine finds the
// first event after a date, and from one event the next). A step of a few years takes 20–50 ms, so
// the page runs the searches in a worker (events-worker.js), through eventService().
import * as A from '../../vendor/astronomy.min.js';

const KIND = { penumbral: 'Penumbral', partial: 'Partial', annular: 'Annular', total: 'Total' };
const MIN = 60000, HOUR = 3600000;

function fmtLatLon(lat, lon) {
  const la = Math.abs(lat).toFixed(0) + '°' + (lat >= 0 ? 'N' : 'S');
  const lo = Math.abs(lon).toFixed(0) + '°' + (lon >= 0 ? 'E' : 'W');
  return la + ' ' + lo;
}
function fmtDur(ms) {
  const m = Math.round(ms / MIN);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
}

// The Moon's penumbra on Earth: first and last contact (P1, P4) of a solar eclipse, from the shadow
// cone (Sun 695,700 km, Moon 1,737.4 km) and Earth as a sphere of its equatorial radius, by bisection
// to 10 s. Within a minute of Espenak's (NASA) times for 2023–2026 (2024 Apr 8: 15:42 and 20:52
// UT), which is plenty for where an event starts. The ±2.5 h bracket used before began up to an
// hour before the shadow arrived, and cut the end off annular eclipses, which can last over 6 h.
const R_SUN = 695700, R_MOON = 1737.4, R_EARTH = 6378.1366;
function penumbraGap(ms) {
  // > 0 while the penumbra misses Earth (km)
  const t = A.MakeTime(new Date(ms)), m = A.GeoMoon(t), s = A.GeoVector(A.Body.Sun, t, false);
  const M = [m.x, m.y, m.z].map(v => v * A.KM_PER_AU), S = [s.x, s.y, s.z].map(v => v * A.KM_PER_AU);
  const a = M.map((v, i) => v - S[i]), L = Math.hypot(...a), u = a.map(v => v / L);
  const z = -(M[0] * u[0] + M[1] * u[1] + M[2] * u[2]);   // Earth's centre beyond the Moon, along the axis
  const p = Math.hypot(...M.map((v, i) => -v - z * u[i]));   // and off the axis
  return p - R_EARTH - (R_MOON + z * (R_SUN + R_MOON) / L);
}
function penumbraContact(peak, sign) {
  let a = peak, b = peak + sign * 3 * HOUR;
  while (penumbraGap(b) < 0) b += sign * HOUR;
  while (Math.abs(b - a) > 10000) { const c = (a + b) / 2; if (penumbraGap(c) < 0) a = c; else b = c; }
  return (a + b) / 2;
}

// Each event: kind ('solar' | 'lunar' | 'transit'), sub (eclipse type, or the transiting planet),
// date (peak), start and end (ms: first and last contact, for marking the one being shown and for
// starting there when it is chosen), title
// and detail.
const SEQUENCES = {
  solar: [{
    search: d => A.SearchGlobalSolarEclipse(d),
    next: e => A.NextGlobalSolarEclipse(e.peak),
    make: e => {
      let detail;
      if (e.kind === 'partial') {
        // the shadow axis misses Earth: the partial phase is seen from high latitudes on the side
        // the Moon passes, north or south of the ecliptic
        detail = 'seen from high ' + (A.EclipticGeoMoon(e.peak).lat > 0 ? 'northern' : 'southern') + ' latitudes';
      } else detail = 'greatest eclipse at ' + fmtLatLon(e.latitude, e.longitude);
      const t = e.peak.date.getTime();
      return { kind: 'solar', sub: e.kind, date: e.peak.date, start: penumbraContact(t, -1), end: penumbraContact(t, 1), title: KIND[e.kind] + ' solar eclipse', detail };
    },
  }],
  lunar: [{
    search: d => A.SearchLunarEclipse(d),
    next: e => A.NextLunarEclipse(e.peak),
    make: e => {
      const t = e.peak.date.getTime();
      const detail = e.kind === 'total' ? 'totality ' + fmtDur(2 * e.sd_total * MIN)
        : e.kind === 'partial' ? (e.obscuration < 0.01 ? 'under 1%' : Math.round(100 * e.obscuration) + '%') + ' of the Moon in the umbra, partial phase ' + fmtDur(2 * e.sd_partial * MIN)
        : 'Moon in the penumbra for ' + fmtDur(2 * e.sd_penum * MIN);
      return { kind: 'lunar', sub: e.kind, date: e.peak.date, start: t - e.sd_penum * MIN, end: t + e.sd_penum * MIN, title: KIND[e.kind] + ' lunar eclipse', detail };
    },
  }],
  transit: ['Mercury', 'Venus'].map(body => ({
    search: d => A.SearchTransit(A.Body[body], d),
    next: e => A.NextTransit(A.Body[body], e.peak),
    make: e => {
      const start = e.start.date.getTime(), end = e.finish.date.getTime();
      return { kind: 'transit', sub: body, date: e.peak.date, start, end, title: 'Transit of ' + body, detail: 'crosses the Sun in ' + fmtDur(end - start) + ', seen from Earth' };
    },
  })),
};

// mean number of events per year (1000–3000), to size the steps: solar and lunar eclipses 2.4 each,
// transits of Mercury 0.13 and of Venus 0.02
const RATE = { solar: 2.4, lunar: 2.4, transit: 0.15 };
const YEAR = 365.25 * 86400000;

export class EventTimeline {
  /**
   * @param kinds  which kinds to search: any of 'solar', 'lunar', 'transit'
   * @param at     instant (ms) the timeline starts from
   * @param min, max  the span it may grow to (ms)
   */
  constructor(kinds, at, min, max) {
    this.min = min; this.max = max;
    this.from = this.to = Math.min(Math.max(at, min), max);
    this.seqs = [...kinds].flatMap(k => SEQUENCES[k]).map(s => ({ ...s, pending: null }));
    // one step: about ten events of the chosen kinds
    const rate = [...kinds].reduce((r, k) => r + RATE[k], 0);
    this.step = Math.min(80, Math.max(2, 10 / (rate || 1))) * YEAR;
  }
  get atStart() { return this.from <= this.min; }
  get atEnd() { return this.to >= this.max; }

  /** extend the covered span one step later; returns the new events, in order */
  later() {
    const until = Math.min(this.to + this.step, this.max), out = [];
    for (const s of this.seqs) {
      // the first event beyond the covered span is kept for the next step: a transit of Venus can
      // be a century away, and is then found only once
      if (!s.pending) s.pending = s.search(new Date(this.to));
      while (s.pending.peak.date.getTime() < until) { out.push(s.make(s.pending)); s.pending = s.next(s.pending); }
    }
    this.to = until;
    return out.sort((a, b) => a.date - b.date);
  }

  /** extend the covered span one step earlier; returns the new events, in order */
  earlier() {
    const from = Math.max(this.from - this.step, this.min), out = [];
    for (const s of this.seqs) {
      for (let e = s.search(new Date(from)); e.peak.date.getTime() < this.from; e = s.next(e)) out.push(s.make(e));
    }
    this.from = from;
    return out.sort((a, b) => a.date - b.date);
  }
}

/**
 * Request handler shared by the worker and the page's fallback. A request starts a new timeline
 * ({ start: { kinds, at, min, max } }) and/or steps it ({ later: true | false }); the reply carries
 * the new events and the span now covered.
 */
export function eventService() {
  let tl = null;
  return m => {
    if (m.start) tl = new EventTimeline(m.start.kinds, m.start.at, m.start.min, m.start.max);
    const before = [tl.from, tl.to];
    const events = m.later ? tl.later() : tl.earlier();
    const span = m.later ? [before[1], tl.to] : [tl.from, before[0]];
    return { gen: m.gen, later: m.later, events, span, atStart: tl.atStart, atEnd: tl.atEnd };
  };
}
