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
  as wide as they are, so the clock beside it keeps its room (tablets held upright keep the names).
- The Guide and the eclipses list close again from their own button, with a click or tap outside
  them, or with Esc. They cover none of the panels. On computers they are centred on the screen and
  moved only as far as they must be to clear the panels beside them; where those leave too little
  room they lie between the panels at the top and at the bottom. On phones they lie between those,
  as wide as the information panel and the time controls, and the bodies panel folds while one is
  open (showing the list or the settings alike); where there is still too little room the
  information panel folds too. Both open again when it closes.
- Below 960 px wide (phones, and tablets held upright: iPad mini to iPad Pro 11") or 480 px tall,
  the compact phone layout is used ("on phones" in this list), as the information panel and the
  time controls no longer fit side by side. Tablets held upright (700–959 px) keep the computer's
  clock, tab names and one-row time controls, and the description in the information panel keeps
  to a readable line. Phones on their side from 740 px wide also get
  the one-row time controls. Touchscreens wide enough for the computer layout (an iPad on its side)
  get the phones' finger-sized rows and buttons, and screens from 1680 × 1000 px a size larger
  type, panels and margins. The folded information panel is as tall as the time controls beside it.
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
  its own (not on tablets held upright, or on phones on their side from 740 px), and below 430 px
  wide the caption shows the value alone, as SPEED and "−1.8 min/s" do not both fit.
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
- The camera steps between a few views of the body it is centred on: its close look (a comfortable
  view of it); the inner planets for the Sun, or its moons for a planet with moons; and the whole
  system. Selecting an outer planet or the Sun glides the camera over to it without turning the
  view. From the old body's moons, inner planets or close look (or nearer), it arrives at the new
  body's moons (the inner planets for the Sun), so Earth's close look goes on to Jupiter's moons;
  farther out, from the whole system, it keeps its zoom, but no nearer than that view. Coming from
  one of its own moons (for the Sun: from an inner planet or its moon), it keeps the zoom instead,
  but no nearer than its close look, so a close look of Io goes to a close look of Jupiter; from
  one of the old body's views it arrives at the same view of the new one (an inner planet's inner
  planets, framed around it and so wider, at the Sun's inner planets). Selecting a
  moon or an inner planet always glides over at the same zoom, no nearer than its close look (a
  moon, Mercury, Venus) or its moons (Earth, Mars). Selecting a body again, once it is centred,
  flies to the next of its views nearer than the camera is: whole system → moons (inner planets for
  the Sun) → close look; a moon, Mercury or Venus goes straight to its close look. Zoomed in nearer
  than that by hand, it flies back out to the close look; already there, it does nothing. Under the
  date (and the scientific times), a chip with a turning arrow, named for the next view out (Moons,
  Inner planets or Whole system; `Backspace`), zooms back out one view at a time, keeping the body
  in the centre: out from a moon's close look come its planet's moons, and the inner planets (and
  their moons) also step out through the inner planets, framed around them. It is hidden from the
  whole system on out, keeping its place so that nothing below it moves. It is not a history:
  nothing is remembered between choices, and the same view always answers the same way. The wheel
  and a pinch still zoom freely; `Esc` shows the whole system around the Sun. A change of scale
  keeps a close look, a planet's moons, the inner planets and the whole system as they are, and
  whatever lies between in proportion. In the view, a body's dot under the pointer is chosen before
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
  tapping it opens it, and its – button folds it again. On phones an open panel shows the
  description and the main figures, and tapping it shows all of its data. Panels on top of each
  other keep the gap of the screen's edge between them: the bodies panel grows (with the moons
  opened in its list) until it is that far from the panel below it (the information panel, open or
  folded, on phones; the time controls elsewhere) and then scrolls; the information panel never
  comes closer to the panels above it, and scrolls inside instead. Where they meet on phones the
  information panel keeps its height and the bodies panel keeps at least its first few rows.
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
  satellites.js   Saturn's and Uranus's moons, Triton, Charon, Phobos, Deimos: orbit models fitted to JPL Horizons
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
textures/       maps, 2048 × 1024 unless noted, loaded once a body is a few pixels across or the camera
                is on its way to it; *_4k.jpg are 4096 × 2048, for a body that fills the screen;
                earth_MM*.jpg one per month; milky_way.jpg is 4096 × 2048, in J2000 RA/Dec
tests/          accuracy checks against JPL Horizons and NASA's eclipse canon
```

## Accuracy

`node tests/run.mjs` (Node 20.19+ or 22.7+, no dependencies), or open `tests/index.html` in a browser. It checks:

- every body against JPL Horizons (DE440 and satellite ephemerides) over 1800–2050
  (planets < 25″ as seen from Earth, Moon < 21 km, Galilean moons < 900 km, Titan < 850 km,
  Mimas < 270 km, Enceladus < 100 km, Tethys < 220 km, Dione < 190 km, Rhea < 240 km,
  Iapetus < 1,400 km, Miranda < 90 km, Ariel < 130 km, Umbriel < 50 km, Titania < 140 km,
  Oberon < 75 km, Triton < 100 km, Charon < 1 km, Phobos < 20 km, Deimos < 56 km);
- the greatest-eclipse point and time of four solar eclipses (1919, 1999, 2024, 2027), all within
  5 km and 5 s of NASA's *Five Millennium Canon*;
- Saturn's ring-plane crossing of 23 Mar 2025, the Laplace resonance of Io, Europa and Ganymede,
  and Earth's rotation angle;
- ΔT against IERS values, and the moons' IAU prime meridians against the direction of their planet.

The eclipse checks use the canon's own ΔT formula, so they test geometry; the page itself uses
measured ΔT.

To regenerate the reference data or refit the satellite models:
`python3 tests/fetch_horizons.py` (with `--dense` for Saturn's moons, `--wide` for Uranus's, which are
fitted over 1600–2400), then `node tests/fit-satellites.mjs …` (usage in the file header).
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
Maps 2020 (Hipparcos-2, Tycho-2, Gaia DR2: ESA/Gaia/DPAC) · Venus, Jupiter, Uranus, Neptune (recoloured,
see below), Saturn's rings and Earth's clouds and night lights from Solar System Scope (CC BY 4.0) ·
Earth from NASA's Blue Marble Next Generation (Reto Stöckli, NASA Earth Observatory) with sea ice from
the NSIDC Sea Ice Index (G02135, version 4) · the Moon from NASA's Scientific Visualization Studio CGI
Moon Kit (LRO/LROC, Ernie Wright) · Mars from the USGS Viking MDIM 2.1 colour mosaic · Mercury from the
MESSENGER MDIS low-incidence basemap (NASA/JHUAPL/Carnegie, USGS) · Saturn from Hubble's OPAL program
(PI: Simon, GO13937, doi:10.17909/T9G593; NASA/ESA/STScI) · moon maps from USGS Astrogeology / NASA / JPL
(Callisto from the 1 km Voyager–Galileo mosaic, Europa from the 500 m Voyager–Galileo
mosaic; Charon's New Horizons and Triton's Voyager 2 global mosaics; Uranus's moons from the Voyager 2
mosaics by Tammy Becker, USGS, with JPL) and Pluto from NASA / JHUAPL /
SwRI (public domain) · Deimos from Philip Stooke's Viking, Mariner 9 and HiRISE mosaic (with Chris
Jongkind and Megan Arntz; PDS Small Bodies Node) · Saturn's moons from the Cassini global colour maps (NASA/JPL-Caltech/Space
Science Institute/Lunar and Planetary Institute) · EB Garamond (Georg Duffner) and IBM Plex Mono (OFL).

The Milky Way map was made from `milkyway_2020_4k.exr` (svs.gsfc.nasa.gov/4851) at its full
4096 × 2048: a floor of 0.002 subtracted, 0.4 (the 99.9th percentile) scaled to white, sRGB-encoded,
saved as a quality 80 JPEG (mozjpeg, 4:2:0). Drawn at 2% gain, its compression error on screen is
under one grey level for 85% of pixels and under two for 97%.

Charon and Triton were box-averaged to 2048 × 1024 from the USGS 300 m and 600 m mosaics (Charon
turned to put longitude 0 in the middle; Triton's orange-filter channel only, tinted in `bodies.js`),
with the unmapped polar cap filled with the mean of the mapped surface.

Uranus's five large moons come from the USGS / JPL Voyager 2 mosaics (Tammy Becker), as NASA
publishes them for 3D models (science.nasa.gov/3d-resources), kept at their 1440 × 720, which is as
fine as Voyager saw them. Voyager 2 passed in 1986 near Uranus's southern summer solstice, so only
the moons' southern halves (31–38% of each surface, up to about the equator) were ever imaged: a
2-pixel dark fringe along the mosaics' edges and their enclosed gaps was cut away, and the rest
filled with the mean of the mapped surface (in linear light, weighted by area), blended over 1.5°.

Europa's unmapped south polar cap (south of 86°S, black in the USGS mosaic) was filled the same way,
and a one-pixel seam down the middle of the Europa and Ganymede maps was interpolated away.

Saturn's six mid-sized moons come from the 2014 Cassini global colour maps (PIA18434–18439, NASA/JPL-
Caltech/SSI/LPI), fetched at 2048 × 1024 and turned by 180° to put longitude 0 in the middle. Those
maps show infrared, green and ultraviolet as red, green and blue, so only their brightness is used
(the mean of the three channels), tinted in `bodies.js`; Iapetus keeps half its colour, since the
reddish brown of its dark side is real. USGS's own global mosaics of these moons were not used: they
are normalised to remove brightness differences, which erases the two faces of Iapetus.

The maps below were rebuilt in October 2026. The maps are not albedo-calibrated against each other,
so Mars, Mercury, Saturn and Callisto keep the mean brightness of the maps they replaced; Earth is
physical reflectance, the Moon is as published, and Neptune is set relative to Uranus.

Earth has one map per month (`earth_MM.jpg`, `earth_MM_4k.jpg`, chosen by the date's month, so
snow and vegetation follow the seasons), made from the 2004 Blue Marble Next Generation monthly
composites (5400 × 2700). Those are surface reflectances with the open ocean filled near black; the
ocean was given the water-leaving reflectance of clear water, π·Rrs = (0.0016, 0.0047, 0.022)
(Morel & Maritorena 2001), keeping Blue Marble's brighter shallow and turbid water. Sea ice comes from
the NSIDC Sea Ice Index monthly concentrations for the same year (25 km polar grids, reprojected,
filled up to 50 km into coast cells), at the albedo of snow-covered multiyear ice through the Arctic
year (0.85, falling to 0.50 in August: Perovich et al. 2002) and of Antarctic pack ice (0.80: Brandt
et al. 2005). The atmosphere shader adds only the air beyond one air mass, so one air mass was put
into the map: ρ = ρ_surface · exp(−τR − 0.33 τa) + single-scattered path light for an overhead Sun
and nadir view (0.375 τR, plus the aerosol backscatter of τa(550) = 0.1, g = 0.7), with Rayleigh τR
from Hansen & Travis (1974) at 610, 550 and 465 nm. Sea ice also counts as rough in the monthly
`earth_rough_MM.jpg`, so it shows no sun glint.

The Moon is NASA SVS's CGI Moon Kit colour map (svs.gsfc.nasa.gov/4720, LROC WAC, photometrically
normalised so it carries no shading), box-averaged from 8192 × 4096 in linear light.

Mars takes its brightness from the USGS Viking MDIM 2.1 colour mosaic (1 km JPEG) but not its colour,
which makes the dark regions blue-grey and fills Hellas with frost. Its red channel, the band where
Mars's albedo features are strongest, is scaled to Hubble's 1999 true-colour image of Mars (WFPC2,
STScI 1999-02), and the colour then follows from brightness through linear fits made on that image's
central disc (r < 0.6 R): R = −0.059 + 2.09 Y, G = 0.014 + 0.77 Y, B = 0.037 + 0.048 Y, which turns
dark basalt brown and bright dust ochre. Bright, blue-white ice keeps Viking's colour poleward of 60°.

Mercury is the MESSENGER MDIS low-incidence basemap (166 m), which shows albedo rather than relief,
box-averaged 15 × 15 and then to 4096 and 2048 wide. Toward the poles the Sun is always low and the
mosaic turns into relief shading (shadows, and sunlit slopes clipped to white), so its deviations from
a smooth local mean (4° boxes of constant size on the ground) are tapered from full at 70° to 35% at
84° and none from 86°, the last few degrees taking the mean of the 80–84° band. It is grey, tinted in
`bodies.js` with Mercury's geometric albedos at the three channels (Mallama et al. 2017: 0.165,
0.142, 0.122).

Saturn is the Hubble OPAL map of 29 August 2025 (Cycle 32, rotation a; 5 px per degree), when the
rings were edge-on and both hemispheres in view. Red is the F631N map, green F502N interpolated to
550 nm toward F631N, blue F467M, each converted to I/F with the OPAL scale factors. Toward the poles,
seen at the limb, each filter's Minnaert correction diverges (502 nm drops below 467 nm, which
Saturn's spectrum does not allow), so the colour ratios are taken within 50° of the equator and held
at their 55° value beyond; the brightness comes from F631N everywhere. Specks from moons and their
shadows were removed, the band the rings hid (0.2°–4.4°N) and the caps beyond 79°N and 84°S filled,
the planetographic latitudes resampled to the parametric latitude a stretched sphere uses, and the
mean colour set to Saturn's geometric albedos at the channels (0.61, 0.50, 0.40; Mallama et al. 2017).

Callisto was rebuilt from the USGS 1 km Voyager–Galileo mosaic, box-averaged in linear light with its
data values taken as linear (the previous map was strongly stretched), and its gaps filled by
interpolating the surrounding surface, fading to the mean surface over 10°. The patchwork that
remains is the mosaic's mix of image resolutions, not brightness steps.

Deimos is Philip Stooke's global mosaic (7200 × 3600, planetocentric, controlled to Peter Thomas's
shape model, with HiRISE detail added in 2009). It is drawn on the triaxial ellipsoid in `bodies.js`,
a stretched sphere, so each pixel was resampled from the direction of the stretched point, not the
sphere's; it is set to Phobos's map brightness (geometric albedos 0.068 and 0.071) and tinted with
Deimos's former catalogue colour. The far side was imaged at lower resolution and looks smoother.

Neptune is the Solar System Scope map recoloured. Voyager 2's familiar deep-blue Neptune was
contrast-stretched; reprocessed, it is a pale greenish blue close to Uranus (Irwin et al. 2024, MNRAS
527, 11521). The colour is Uranus's map colour times the Neptune/Uranus ratio measured on their
reprocessed discs (0.63, 0.74, 0.88 for R, G, B), at 0.91 of Uranus's brightness (V geometric albedos
0.442 and 0.488, Mallama et al. 2017); the map's own brightness variations are kept at the power
0.6, and its white clouds stay white.

## License

The code is released under the [MIT License](LICENSE). The vendored libraries, fonts, maps and data
keep their own licences, listed under Credits above: three.js and Astronomy Engine (MIT), EB Garamond
and IBM Plex Mono (SIL Open Font License), the Solar System Scope maps (CC BY 4.0, which requires crediting
them and noting changes: Neptune's is recoloured), the NSIDC sea-ice data (free to use, with citation) and
the public-domain NASA / USGS / JPL / STScI maps and data.
