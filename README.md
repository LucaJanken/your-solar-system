# Your Solar System

**[yoursolarsystem.space](https://yoursolarsystem.space/)**: an interactive, scientifically accurate
3D model of the Solar System for any instant between the years 1000 and 3000.

Everything on screen is computed for the displayed instant rather than animated along a canned path:

- **Where everything is.** The planets, Pluto and sixteen moons, checked against NASA JPL's DE440
  ephemeris: the planets to within 25″ as seen from Earth over 1800–2050, the Moon to 21 km.
- **Which way they face.** Spin axes and rotation from the IAU models, including the Moon's libration,
  with Earth's rotation following the measured ΔT.
- **Eclipses and transits.** Shadows are cast from the true sizes and distances, at every display
  scale; solar eclipses land within 5 km and 5 s of NASA's *Five Millennium Canon*. A searchable list
  of eclipses and transits of Mercury and Venus takes you to any of them.
- **The sky behind.** 9,096 stars from the Yale Bright Star Catalogue, moved by their proper motion,
  over the Milky Way.
- **Real scale to overview.** It opens at real scale, with the whole system out to Neptune's orbit
  in view; the Scale slider in the settings morphs to a compressed overview where every body is visible, without ever
  distorting directions.

Plain HTML, CSS and JavaScript modules: no build step, no framework, no dependencies to install.
GitHub Pages serves the repository as-is.

## Using it

- The top-right corner holds one narrow panel. Its heading has three tabs, each an icon above its
  name (a ringed planet, a gear, an open book): Bodies and Settings show their content in the
  panel, and choosing the one shown folds the panel; Guide opens the Guide. On computers the list
  stays as it was left (remembered); on phones the panel starts folded and folds again when the view
  is tapped. Esc closes the settings. On phones the tabs show only their icons, and the panel is only
  as wide as they are, so the clock beside it keeps its room.
- The Guide and the eclipses list close again from their own button, with a click or tap outside
  them, or with Esc. They open in the space the panels leave free, so they cover none of them: beside
  the panels, or else between those at the top and at the bottom; where even that is too small
  (phones, tablets held upright) the bodies panel and the information panel fold while one is open,
  and open again when it closes.
- Below 960 px wide (phones, and tablets held upright: iPad mini to iPad Pro 11") or 480 px tall,
  the compact phone layout is used ("on phones" in this list), as the information panel and the
  time controls no longer fit side by side.
- The settings are tick boxes: Orbits, Labels, Moons, Spin axis, Stars, Milky Way, Sun glare,
  Cities (Earth's night lights) and Lock, then two sliders with reality at their left end, labelled
  Real: Scale (real scale to the overview, Overview) and Night sides (black, as the Sun alone
  leaves them, to Lit: a light from the viewer that shows night sides and eclipse shadows, not
  physical, and leaving the shadows themselves unchanged). The ends' labels set the slider there.
  All are kept across reloads (`localStorage`); a scale in the URL hash overrides the saved one.
  On phones a label has about 83 px beside its box (12 px type, the Bodies list's), about nine
  letters: check a new label's width before adding it.
- The bottom bar: a round Play/Pause button, a reverse button (a clock with a circular arrow, lit
  while time runs backward; `R`), the speed slider, the calendar, Eclipses & transits and Now. The
  slider is logarithmic and forward-only, from real time on the left to about 5 years per second on
  the right; `[` `]` move it a step. A caption above it reads SPEED and the value: a multiple of
  real time up to 60× (`1×`, `10×`), then time per second (`5 min/s`, `2 d/s`, `1 yr/s`), with a −
  when reversed; paused, it is dimmed and Play resumes at it. On phones the slider has a row of
  its own.
- The eye beside the clock's time zone, or `H`, hides the whole interface; a hint says for 3 s how to bring it back: a click
  or tap on empty space (or `H`). Drags, pinches and clicks on bodies or labels keep turning the view
  and choosing bodies without bringing it back. The hidden state is not remembered.
- The calendar button goes to a date: on phones through the system's own picker (confirming there
  applies it), on computers through a small popover with Set (or Enter; Esc closes it).
- Eclipses & transits lists solar and lunar eclipses and transits of Mercury and Venus, opening at
  the displayed date and loading more as it is scrolled either way (searched in a worker). The kinds
  shown can be switched off and on (remembered); choosing an event goes there. Times are given as
  the clock shows them (local time, UTC, or UT in Scientific).
- The clock shows Local time, UTC, or Scientific (UT, with TT, ΔT and the Julian Date); the
  choice is remembered. An Extrapolated tag appears outside the validated 1800–2050.
- Selecting a body glides the camera over to it without changing zoom or viewing angle (it only
  backs off if it would end up inside the body). Selecting it again flies in to a comfortable view
  of its lit side; a third time, while still that close, flies back out to where the camera was
  before (where it was when the body was selected, if it had been zoomed in by hand), also after
  moving on to a body nearby, or, with no such view, to the body's surroundings (a moon's planet, a
  planet's moons). Zoomed out by hand from the close look, selecting it flies in again, and the next
  time back out to where it was zoomed out to.
  Selecting it during either flight turns the camera round. In the view, a body's dot under the pointer is chosen before
  a label beside it. Lock keeps the camera travelling with the selected body; locking again after
  drifting catches up with it. Spin axis shows its rotation axis.
- Dragging (one finger) turns the view around the focus; scroll or pinch zooms. The wheel eases each
  step in, and its steps grow (up to 8×) the faster it is turned, so a quick spin crosses from a
  close look to the whole system. Moving the view sideways (right- or shift-drag, arrow keys,
  two-finger drag) also works locked: the camera keeps following the body from there. A two-finger
  gesture either pinches or drags, never both. A planet's arrow, right beside its name, opens its
  moons in the list, and they stay listed until the arrow closes them; the moons that selecting a
  body lists close again when a body of another system is selected, so going through the planets
  leaves only the current one open. The information panel starts folded down to the body's name:
  tapping it opens it, and its – button folds it again. It never comes closer to the panels above it
  than to the bottom bar (or edge) below it: it scrolls inside instead.
- A view given in the URL hash (`#t=…&focus=…&sel=…&scale=…&speed=…&dir=-1&play=0&cam=…`), as
  links from the former Share view carry it, is still read on load; `dir=-1` turns on reverse. The
  page no longer writes one.
- The Guide shows the essential controls and keyboard shortcuts first (the shortcuts are hidden on
  touchscreens); the details (more controls, scale, shadows, accuracy, what the picture shows,
  sources) are folded into sections below. The Extrapolated tag opens it at the accuracy section.
- The Guide ends with a line on support: the site is free and has no ads, and a Ko-fi
  link.

To run it locally, serve the repository root over HTTP (ES modules and the events worker do not load
from `file://`), e.g. `python3 -m http.server`, and open `http://localhost:8000/`.

## Layout

```
index.html, css/style.css
js/astro/       the physics, with no graphics:
  ephemeris.js    positions, velocities, spin axes, osculating orbits (one frame: J2000 ecliptic, km)
  satellites.js   Saturn's moons, Triton, Charon, Phobos, Deimos: orbit models fitted to JPL Horizons
  rotation.js     IAU rotation models of the moons (generated from NAIF pck00011)
  deltat.js       ΔT = TT − UT1 from USNO/IERS (generated)
  events.js       eclipse and transit search, as a timeline that grows both ways
  events-worker.js  runs those searches off the main thread for the events list
js/data/        bodies.js: physical data and descriptions, with sources
js/scene/       three.js rendering
  scale.js        overview ↔ real-scale mapping; ecliptic → scene axes
  bodies.js       meshes, materials, rings, spin axis; per-frame update
  shaders.js      eclipse and ring shadows, lunar-eclipse reddening, rotation blur, regolith
                  photometry, the Sun's photosphere, rings, Earth's atmospheric glow
  glare.js        the Sun's glare and its streaks, drawn in screen space
  orbits.js       osculating orbits, stored relative to each body for precision
  stars.js        Yale Bright Star Catalogue with proper motion, over the Milky Way
  view.js         camera, floating origin, focus glides, lock
  labels.js       labels
js/ui/          info.js: information panel; hud.js: hiding the interface, telling taps from
                drags; format.js: numbers, dates and the speed readout
js/main.js      state, main loop, controls
vendor/         three.js r186 (+ OrbitControls) and astronomy-engine 2.1.19, minified ES modules
data/stars.bin  9,096 BSC5 stars: RA, Dec, V, B−V, proper motion (int16 each)
textures/       maps, 2048 × 1024 unless noted; milky_way.jpg is 4096 × 2048, equirectangular in J2000 RA/Dec
tests/          accuracy checks against JPL Horizons and NASA's eclipse canon
```

## Accuracy

`node tests/run.mjs` (Node 20.19+ or 22.7+, no dependencies), or open `tests/index.html` in a browser. It checks:

- every body against JPL Horizons (DE440 and satellite ephemerides) over 1800–2050
  (planets < 25″ as seen from Earth, Moon < 21 km, Galilean moons < 900 km, Titan < 850 km,
  Mimas < 270 km, Enceladus < 100 km, Tethys < 220 km, Dione < 190 km, Rhea < 240 km,
  Iapetus < 1,400 km, Triton < 100 km, Charon < 1 km, Phobos < 20 km, Deimos < 56 km);
- the greatest-eclipse point and time of four solar eclipses (1919, 1999, 2024, 2027), all within
  5 km and 5 s of NASA's *Five Millennium Canon*;
- Saturn's ring-plane crossing of 23 Mar 2025, the Laplace resonance of Io, Europa and Ganymede,
  and Earth's rotation angle;
- ΔT against IERS values, and the moons' IAU prime meridians against the direction of their planet.

The eclipse checks use the canon's own ΔT formula, so they test geometry; the page itself uses
measured ΔT.

To regenerate the reference data or refit the satellite models:
`python3 tests/fetch_horizons.py`, then `node tests/fit-satellites.mjs …` (usage in the file header).
`python3 tests/make_deltat.py` refreshes ΔT (worth doing once a year, as measurements accumulate);
`python3 tests/make_rotation.py` rebuilds the moons' rotation models from NAIF's kernel.

## Updating the vendored libraries

```
npm i three astronomy-engine esbuild
printf "export * from 'three';\nexport { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';\n" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --outfile=vendor/three.min.js
npx esbuild node_modules/astronomy-engine/esm/astronomy.js --format=esm --minify --legal-comments=inline --outfile=vendor/astronomy.min.js
```
`js/scene/shaders.js` patches three.js shader chunks by name (`map_fragment`, `lights_fragment_end`,
`opaque_fragment`); check those still exist after an upgrade.

## Credits

Astronomy Engine (Don Cross, MIT) · three.js (MIT) · JPL Horizons · NASA NAIF · USNO/IERS ·
Yale Bright Star Catalogue (CDS) · Milky Way from NASA/GSFC Scientific Visualization Studio, Deep Star
Maps 2020 (Hipparcos-2, Tycho-2, Gaia DR2: ESA/Gaia/DPAC) · planet maps from Solar System Scope
(CC BY 4.0) · moon maps from USGS Astrogeology / NASA / JPL (Europa from the 500 m Voyager–Galileo
mosaic; Charon's New Horizons and Triton's Voyager 2 global mosaics) and Pluto from NASA / JHUAPL /
SwRI (public domain) · Saturn's moons from the Cassini global colour maps (NASA/JPL-Caltech/Space
Science Institute/Lunar and Planetary Institute) · EB Garamond (Georg Duffner) and IBM Plex Mono (OFL).

The Milky Way map was made from `milkyway_2020_4k.exr` (svs.gsfc.nasa.gov/4851) at its full
4096 × 2048: a floor of 0.002 subtracted, 0.4 (the 99.9th percentile) scaled to white, sRGB-encoded,
saved as a quality 80 JPEG (mozjpeg, 4:2:0). Drawn at 2% gain, its compression error on screen is
under one grey level for 85% of pixels and under two for 97%.

Charon and Triton were box-averaged to 2048 × 1024 from the USGS 300 m and 600 m mosaics (Charon
turned to put longitude 0 in the middle; Triton's orange-filter channel only, tinted in `bodies.js`),
with the unmapped polar cap filled with the mean of the mapped surface.

Europa's unmapped south polar cap (south of 86°S, black in the USGS mosaic) was filled the same way,
and a one-pixel seam down the middle of the Europa and Ganymede maps was interpolated away.

Saturn's six mid-sized moons come from the 2014 Cassini global colour maps (PIA18434–18439, NASA/JPL-
Caltech/SSI/LPI), fetched at 2048 × 1024 and turned by 180° to put longitude 0 in the middle. Those
maps show infrared, green and ultraviolet as red, green and blue, so only their brightness is used
(the mean of the three channels), tinted in `bodies.js`; Iapetus keeps half its colour, since the
reddish brown of its dark side is real. USGS's own global mosaics of these moons were not used: they
are normalised to remove brightness differences, which erases the two faces of Iapetus.

## License

The code is released under the [MIT License](LICENSE). The vendored libraries, fonts, maps and data
keep their own licences, listed under Credits above: three.js and Astronomy Engine (MIT), EB Garamond
and IBM Plex Mono (SIL Open Font License), the Solar System Scope planet maps (CC BY 4.0, which requires crediting
them) and the public-domain NASA / USGS / JPL maps and data.
