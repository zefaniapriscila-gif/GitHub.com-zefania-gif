/**
 * Raihan Surya — a portfolio lit by the real sun over Yogyakarta.
 *
 * The hero is a sundial: the name stands on the ground and casts the shadow of
 * the sun (or the moon) at the current time in Yogyakarta. The same light picks
 * the page theme and drives every cast shadow below it. Each project has a small
 * plate to play with; the long write-ups live in the detail sheet.
 */

(() => {
  "use strict";

  // ==========================================================================
  // 1. HELPERS
  // ==========================================================================
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const prefersStill = () => motionQuery.matches;

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }

  function scaleRgb(c, k) {
    return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
  }

  function rgb(c, alpha = 1) {
    const r = Math.round(c[0]);
    const g = Math.round(c[1]);
    const b = Math.round(c[2]);
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.max(0, alpha).toFixed(3)})`;
  }

  // Piecewise-linear ramps, keyed by a number such as the sun's elevation in degrees.
  function colorRamp(stops) {
    const parsed = stops.map(([x, hex]) => [x, hexRgb(hex)]);
    return (x) => {
      if (x <= parsed[0][0]) return parsed[0][1];
      for (let i = 1; i < parsed.length; i++) {
        if (x <= parsed[i][0]) {
          const [x0, c0] = parsed[i - 1];
          const [x1, c1] = parsed[i];
          return mixRgb(c0, c1, (x - x0) / (x1 - x0));
        }
      }
      return parsed[parsed.length - 1][1];
    };
  }

  function numberRamp(stops) {
    return (x) => {
      if (x <= stops[0][0]) return stops[0][1];
      for (let i = 1; i < stops.length; i++) {
        if (x <= stops[i][0]) {
          const [x0, v0] = stops[i - 1];
          const [x1, v1] = stops[i];
          return lerp(v0, v1, (x - x0) / (x1 - x0));
        }
      }
      return stops[stops.length - 1][1];
    };
  }

  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fitCanvas(canvas, width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function tracePath(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function polygonArea(pts) {
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    return Math.abs(area / 2);
  }

  function centroid(pts) {
    let x = 0;
    let y = 0;
    for (const p of pts) {
      x += p[0];
      y += p[1];
    }
    return [x / pts.length, y / pts.length];
  }

  const pad2 = (n) => String(n).padStart(2, "0");

  function formatClock(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }

  function formatRupiah(value) {
    return value >= 1e6 ? `Rp ${(value / 1e6).toFixed(1)}M` : `Rp ${Math.round(value / 1e3)}K`;
  }

  // ==========================================================================
  // 2. ASTRONOMY (the low-precision formulas popularised by SunCalc)
  // ==========================================================================
  const RAD = Math.PI / 180;
  const SITE = { lat: -7.7956, lng: 110.3695, utcOffsetHours: 7 };
  const PHI = SITE.lat * RAD;
  const LW = -SITE.lng * RAD;
  const OBLIQUITY = 23.4397 * RAD;

  const toDays = (date) => date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;
  const rightAscension = (l, b) =>
    Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
  const declination = (l, b) =>
    Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
  const siderealTime = (d) => (280.16 + 360.9856235 * d) * RAD - LW;

  // Altitude above the horizon and compass azimuth (0 = north, clockwise), in radians.
  function toHorizon(hourAngle, dec) {
    const alt = Math.asin(Math.sin(PHI) * Math.sin(dec) + Math.cos(PHI) * Math.cos(dec) * Math.cos(hourAngle));
    const az =
      Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(PHI) - Math.tan(dec) * Math.cos(PHI)) + Math.PI;
    return { alt, az };
  }

  function sunCoords(d) {
    const M = (357.5291 + 0.98560028 * d) * RAD;
    const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
    const L = M + C + 102.9372 * RAD + Math.PI;
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }

  function sunPosition(date) {
    const d = toDays(date);
    const c = sunCoords(d);
    return toHorizon(siderealTime(d) - c.ra, c.dec);
  }

  function moonCoords(d) {
    const L = (218.316 + 13.176396 * d) * RAD;
    const M = (134.963 + 13.064993 * d) * RAD;
    const F = (93.272 + 13.22935 * d) * RAD;
    const l = L + 6.289 * RAD * Math.sin(M);
    const b = 5.128 * RAD * Math.sin(F);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }

  function moonPosition(date) {
    const d = toDays(date);
    const c = moonCoords(d);
    return toHorizon(siderealTime(d) - c.ra, c.dec);
  }

  function moonFraction(date) {
    const d = toDays(date);
    const s = sunCoords(d);
    const m = moonCoords(d);
    const sunDist = 149598000;
    const phi = Math.acos(
      Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
    );
    const inc = Math.atan2(sunDist * Math.sin(phi), m.dist - sunDist * Math.cos(phi));
    return (1 + Math.cos(inc)) / 2;
  }

  // The brightest stars: right ascension (hours), declination (degrees), magnitude, warm tint.
  const STAR_CATALOG = [
    [6.752, -16.716, -1.46], [6.399, -52.696, -0.74], [14.66, -60.834, -0.27], [14.261, 19.182, -0.05, 1],
    [18.616, 38.784, 0.03], [5.278, 45.998, 0.08], [5.242, -8.202, 0.13], [7.655, 5.225, 0.34],
    [1.629, -57.237, 0.46], [5.919, 7.407, 0.5, 1], [14.064, -60.373, 0.61], [19.846, 8.868, 0.76],
    [12.443, -63.099, 0.76], [4.599, 16.509, 0.86, 1], [16.49, -26.432, 0.96, 1], [13.42, -11.161, 0.97],
    [7.755, 28.026, 1.14, 1], [22.961, -29.622, 1.16], [20.69, 45.28, 1.25], [12.795, -59.689, 1.25],
    [10.14, 11.967, 1.35], [6.977, -28.972, 1.5], [17.56, -37.104, 1.62], [7.577, 31.888, 1.58],
    [12.519, -57.113, 1.63, 1], [5.419, 6.35, 1.64], [5.438, 28.608, 1.65], [9.22, -69.717, 1.68],
    [5.604, -1.202, 1.69], [22.137, -46.961, 1.74], [5.679, -1.943, 1.77], [12.9, 55.96, 1.77],
    [11.062, 61.751, 1.79, 1], [3.405, 49.861, 1.79], [7.14, -26.393, 1.84], [17.622, -42.998, 1.86],
    [18.403, -34.385, 1.85], [8.375, -59.51, 1.86, 1], [13.792, 49.313, 1.86], [5.992, 44.947, 1.9],
    [16.811, -69.028, 1.92, 1], [6.629, 16.399, 1.93], [20.427, -56.735, 1.94], [8.745, -54.709, 1.96],
    [6.378, -17.956, 1.98], [9.46, -8.659, 1.98, 1], [2.12, 23.462, 2.0, 1], [10.333, 19.842, 2.08, 1],
    [0.727, -17.987, 2.02], [18.921, -26.297, 2.05], [14.111, -36.37, 2.06], [1.162, 35.621, 2.05, 1],
    [0.14, 29.091, 2.06], [17.582, 12.56, 2.07], [5.796, -9.67, 2.09], [11.818, 14.572, 2.14],
    [3.136, 40.956, 2.12], [22.711, -46.885, 2.07, 1], [12.692, -48.96, 2.2], [9.285, -59.275, 2.21],
    [9.133, -43.433, 2.21, 1], [15.578, 26.715, 2.22], [5.533, -0.299, 2.23], [20.37, 40.257, 2.23],
    [0.675, 56.537, 2.24, 1], [8.06, -40.003, 2.25], [16.006, -22.622, 2.29], [16.836, -34.293, 2.29, 1],
    [0.438, -42.306, 2.4, 1], [17.708, -39.03, 2.39], [21.736, 9.875, 2.38, 1], [17.173, -15.725, 2.43],
    [7.402, -29.303, 2.45], [9.368, -55.011, 2.47], [23.079, 15.205, 2.48], [16.091, -19.806, 2.56],
    [12.252, -58.749, 2.79], [12.356, -60.401, 3.59], [16.598, -28.216, 2.82], [16.353, -25.593, 2.89],
    [17.513, -37.296, 2.7], [15.981, -26.114, 2.89], [16.864, -38.047, 3.0], [17.202, -43.239, 3.33],
  ];

  const STARS = (() => {
    const list = STAR_CATALOG.map(([ra, dec, mag, warm]) => ({
      ra: ra * 15 * RAD,
      dec: dec * RAD,
      r: clamp(2.3 - 0.42 * mag, 0.7, 2.9),
      a: clamp(1.05 - 0.13 * mag, 0.5, 1),
      color: warm ? "#ffe2c4" : "#eef2ff",
      glow: mag < 1.2,
    }));
    // A fainter, seeded field so the sky has depth.
    const rand = mulberry32(7807);
    for (let i = 0; i < 420; i++) {
      const mag = 3.4 + rand() * 2.6;
      list.push({
        ra: rand() * Math.PI * 2,
        dec: Math.asin(rand() * 2 - 1),
        r: clamp(1.5 - 0.17 * mag, 0.45, 1),
        a: clamp(0.95 - 0.12 * mag, 0.18, 0.55),
        color: "#e3e9ff",
        glow: false,
      });
    }
    // How deep, how fast and in what phase each star twinkles.
    const twinkle = mulberry32(2207);
    list.forEach((star) => {
      star.tw = (star.glow ? 0.1 : 0.16) + twinkle() * 0.38;
      star.sp = 1.1 + twinkle() * 2.9;
      star.ph = twinkle() * Math.PI * 2;
    });
    return list;
  })();

  // ==========================================================================
  // 3. ONE LIGHT FOR THE WHOLE PAGE
  // ==========================================================================
  const root = document.documentElement;
  const metaTheme = $('meta[name="theme-color"]');

  const clock = {
    live: true,
    minutes: 720,
    nowMinutes: 720,
    midnight: 0,
    dayKey: "",
    events: { rise: 360, set: 1080, band: [] },
    light: null,
    listeners: [],
  };

  function yogyakartaNow() {
    const shifted = new Date(Date.now() + SITE.utcOffsetHours * 3600000);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth();
    const d = shifted.getUTCDate();
    return {
      key: `${y}-${m}-${d}`,
      midnight: Date.UTC(y, m, d) - SITE.utcOffsetHours * 3600000,
      minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() + shifted.getUTCSeconds() / 60,
    };
  }

  function computeEvents(midnight) {
    const horizon = -0.833 * RAD;
    let prev = sunPosition(new Date(midnight)).alt;
    let rise = null;
    let set = null;
    const band = [[0, prev / RAD]];
    for (let m = 1; m <= 1440; m++) {
      const alt = sunPosition(new Date(midnight + m * 60000)).alt;
      if (rise === null && prev < horizon && alt >= horizon) rise = m - 1 + (horizon - prev) / (alt - prev);
      if (set === null && prev >= horizon && alt < horizon) set = m - 1 + (prev - horizon) / (prev - alt);
      if (m % 20 === 0) band.push([m, alt / RAD]);
      prev = alt;
    }
    return { rise: rise ?? 360, set: set ?? 1080, band };
  }

  function computeLight(minutes) {
    const date = new Date(clock.midnight + minutes * 60000);
    const sun = sunPosition(date);
    const moon = moonPosition(date);
    const fraction = moonFraction(date);
    const sunEl = sun.alt / RAD;
    const moonEl = moon.alt / RAD;
    let source = null;
    if (sunEl > -0.5) {
      source = { kind: "sun", alt: sun.alt, az: sun.az, strength: smoothstep(-0.5, 5, sunEl) };
    } else if (sunEl < -6 && moonEl > 3) {
      source = { kind: "moon", alt: moon.alt, az: moon.az, strength: smoothstep(3, 15, moonEl) * fraction };
    }
    return {
      date,
      minutes,
      sun: { alt: sun.alt, az: sun.az, el: sunEl },
      moon: { alt: moon.alt, az: moon.az, el: moonEl, fraction },
      source,
      theme: sunEl > -3 ? "day" : "night",
      golden: smoothstep(-1, 3, sunEl) * (1 - smoothstep(6, 16, sunEl)),
    };
  }

  let renderQueued = false;

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderLight();
    });
  }

  function renderLight() {
    const L = computeLight(clock.minutes);
    clock.light = L;
    applyTheme(L);
    applyPageLight(L);
    renderHero(L);
    renderDial(L);
    clock.listeners.forEach((fn) => fn(L));
  }

  function setMinutes(minutes, live) {
    clock.minutes = clamp(minutes, 0, 1439.9);
    clock.live = live;
    scheduleRender();
  }

  function syncToNow() {
    const now = yogyakartaNow();
    if (now.key !== clock.dayKey) {
      clock.dayKey = now.key;
      clock.midnight = now.midnight;
      clock.events = computeEvents(now.midnight);
      paintDayBand();
    }
    clock.nowMinutes = now.minutes;
    if (clock.live) clock.minutes = now.minutes;
    renderLocalTime();
    scheduleRender();
  }

  function applyTheme(L) {
    if (root.dataset.theme === L.theme) return;
    root.dataset.theme = L.theme;
    if (metaTheme) metaTheme.setAttribute("content", L.theme === "day" ? "#ecf0f3" : "#0a1230");
  }

  // Cast shadows on the page. The page is read as the ground seen from above,
  // facing south like the hero, so east is on the left.
  function applyPageLight(L) {
    const style = root.style;
    const src = L.source;
    let lx = 0;
    let ly = 0.35;
    let len = 0.35;
    let color = L.theme === "day" ? [38, 36, 110] : [0, 2, 14];
    let alpha = L.theme === "day" ? 0.14 : 0.42;
    if (src) {
      const cot = clamp(1 / Math.tan(Math.max(src.alt, 4 * RAD)), 0.04, 2.6);
      const k = lerp(0.35, 1, src.strength);
      lx = Math.sin(src.az) * cot * k;
      ly = -Math.cos(src.az) * cot * k;
      len = cot * k;
      if (src.kind === "sun") {
        color = mixRgb([38, 36, 110], [92, 42, 96], L.golden);
        alpha = 0.13 + 0.09 * src.strength + 0.05 * L.golden;
      } else {
        alpha = 0.42 + 0.18 * src.strength;
      }
    }
    style.setProperty("--lx", lx.toFixed(3));
    style.setProperty("--ly", ly.toFixed(3));
    style.setProperty("--llen", len.toFixed(3));
    style.setProperty("--cast-page", rgb(color, alpha));
    style.setProperty("--cast-text", rgb(color, alpha * 0.8));
  }

  // ==========================================================================
  // 4. HERO: SKY, SUN, MOON, STARS AND THE STANDING NAME
  // ==========================================================================
  const SKY_TOP = colorRamp([
    [-18, "#040917"], [-12, "#070f2a"], [-6, "#121c48"], [-3, "#22306a"], [0, "#3a5694"],
    [4, "#4f78b8"], [10, "#5f95d2"], [25, "#70a8de"], [60, "#80b6e5"],
  ]);
  const SKY_LOW = colorRamp([
    [-18, "#141d44"], [-12, "#1a2550"], [-6, "#3d386b"], [-3, "#8c5b79"], [-0.5, "#e58a64"],
    [2, "#f5b583"], [6, "#f6d3ac"], [12, "#e6e7e2"], [25, "#d8e9f3"], [60, "#e1f0f8"],
  ]);
  const GLOW_COLOR = colorRamp([
    [-10, "#6a3c6e"], [-4, "#ff7a5c"], [0, "#ff9a55"], [5, "#ffc477"], [15, "#ffe6b8"], [40, "#fff4dc"],
  ]);
  const GLOW_ALPHA = numberRamp([[-12, 0], [-6, 0.22], [-2, 0.55], [1, 0.7], [6, 0.55], [20, 0.42], [60, 0.34]]);
  const GLOW_RADIUS = numberRamp([[-8, 30], [-2, 42], [2, 44], [8, 34], [25, 24], [60, 20]]);
  const SUN_CORE = colorRamp([[-1, "#ff9a5a"], [2, "#ffc27a"], [8, "#ffe9bf"], [20, "#fffaf0"]]);
  const GROUND_FAR = colorRamp([
    [-18, "#070d26"], [-6, "#151a3f"], [-2, "#5d4d6a"], [1, "#c6a390"], [5, "#d6bfa9"], [14, "#d4dbe0"], [40, "#d2dce4"],
  ]);
  const BAND = colorRamp([[-14, "#151d42"], [-6, "#3a3a73"], [-1, "#b4687c"], [2, "#f1a066"], [10, "#f6cd88"], [40, "#fae6b8"]]);

  const WORD_DAY = hexRgb("#141c38");
  const WORD_WARM = hexRgb("#2f2140");
  const WORD_LIT = hexRgb("#3b4672");
  const WORD_NIGHT = hexRgb("#d7def3");

  const hero = {
    el: $("#hero"),
    sun: $("#skySun"),
    moon: $("#skyMoon"),
    moonLit: $("#moonLit"),
    stars: $("#skyStars"),
    monument: $("#monument"),
    word: $("#heroName"),
    foot: $(".hero-foot"),
    probe: null,
    starCtx: null,
    w: 0,
    h: 0,
    horizonY: 0,
    baseY: 0,
    cap: 1,
  };

  const dial = {
    root: $("#dial"),
    clock: $("#dialClock"),
    state: $("#dialState"),
    range: $("#dialRange"),
    now: $("#dialNow"),
    rise: $("#markRise"),
    set: $("#markSet"),
  };

  function splitWords() {
    $$("[data-word]").forEach((node) => {
      const text = node.textContent.trim();
      node.textContent = "";
      [...text].forEach((ch, i) => {
        const span = document.createElement("span");
        span.className = "ch";
        span.style.setProperty("--i", i);
        span.textContent = ch;
        node.appendChild(span);
      });
    });
    hero.probe = document.createElement("span");
    hero.probe.className = "baseline-probe";
    hero.probe.setAttribute("aria-hidden", "true");
    hero.word.appendChild(hero.probe);
  }

  function measureCapRatio() {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = '860 100px "Archivo", sans-serif';
      const m = ctx.measureText("H");
      if (m.actualBoundingBoxAscent > 20) return m.actualBoundingBoxAscent / 100;
    } catch (err) {
      // Older engines without TextMetrics bounding boxes fall through.
    }
    return 0.72;
  }

  function layoutHero() {
    const w = hero.el.clientWidth;
    const h = hero.el.clientHeight;
    const small = w < 900;
    hero.w = w;
    hero.h = h;
    hero.starCtx = fitCanvas(hero.stars, w, h);

    // The name stands just above the text at the foot of the hero.
    const footTop = hero.foot.offsetTop;
    hero.baseY = Math.min(h * (small ? 0.64 : 0.705), footTop - (small ? 60 : 56));

    // Fit the name to the available width, then center it in the visible hero area.
    const mon = hero.monument;
    mon.style.setProperty("--word-size", "100px");
    const range = document.createRange();
    range.selectNodeContents(hero.word);
    const natural = range.getBoundingClientRect().width || 300;
    const capRatio = measureCapRatio();
    let size = ((mon.clientWidth * 0.995) / natural) * 100;
    size = Math.min(size, (hero.baseY - (small ? 130 : 150)) / capRatio) * 0.5;
    mon.style.setProperty("--word-size", `${size.toFixed(2)}px`);
    hero.cap = capRatio * size;
    hero.baseY = Math.min(h, window.innerHeight) / 2 + hero.cap / 2;
    hero.el.style.setProperty("--veil", `${Math.max(24, Math.round(footTop - hero.baseY - 4))}px`);

    // The horizon crosses the letters a little over a third of the way up.
    hero.horizonY = hero.baseY - Math.max(28, hero.cap * 0.37);
    hero.el.style.setProperty("--horizon", `${((hero.horizonY / h) * 100).toFixed(2)}%`);

    const baseline = hero.probe.offsetTop;
    const top = hero.baseY - baseline;
    mon.style.setProperty("--word-top", `${top.toFixed(1)}px`);
    mon.style.setProperty("--baseline", `${baseline.toFixed(1)}px`);
    mon.style.setProperty("--cap", `${hero.cap.toFixed(1)}px`);
    mon.style.setProperty("--cast-clip", `${(hero.horizonY - top).toFixed(1)}px`);
  }

  // Sky dome seen facing south: east on the left, the zenith at the top.
  function projectSky(alt, az) {
    const east = Math.cos(alt) * Math.sin(az);
    const north = Math.cos(alt) * Math.cos(az);
    const horizonF = hero.horizonY / hero.h;
    const topF = 0.11;
    return { x: 0.5 - east * 0.44, y: horizonF - Math.sin(alt) * (horizonF - topF), front: -north };
  }

  // Lit part of the moon with the bright limb on +x; rotated toward the sun later.
  function moonPath(fraction, r = 48) {
    const rx = (r * Math.abs(1 - 2 * fraction)).toFixed(2);
    const sweep = fraction < 0.5 ? 0 : 1;
    return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${sweep} 0 ${-r} Z`;
  }

  // Stars are placed once per minute of sky; a light frame loop only twinkles them
  // and sends the odd meteor across while the hero is in view.
  const sky = { stars: [], dark: 0, visible: true, frame: 0, last: 0, meteor: null, nextMeteor: 0 };

  function projectStars(L) {
    sky.stars.length = 0;
    sky.dark = smoothstep(-2.5, -11, L.sun.el);
    if (sky.dark < 0.01) return;
    const lst = siderealTime(toDays(L.date));
    const scale = hero.w < 600 ? 0.8 : 1;
    for (const star of STARS) {
      const pos = toHorizon(lst - star.ra, star.dec);
      if (pos.alt < 0.4 * RAD) continue;
      const p = projectSky(pos.alt, pos.az);
      const facing = smoothstep(-0.25, 0.2, p.front);
      if (facing <= 0) continue;
      sky.stars.push({
        star,
        x: p.x * hero.w,
        y: p.y * hero.h,
        r: star.r * scale,
        a: sky.dark * facing * star.a * smoothstep(0.4, 7, pos.alt / RAD),
      });
    }
  }

  function spawnMeteor(t) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const angle = (16 + Math.random() * 24) * RAD;
    const x = hero.w * (0.15 + Math.random() * 0.7);
    const y = hero.h * (0.05 + Math.random() * 0.18);
    let dist = (0.14 + Math.random() * 0.14) * Math.max(hero.w, 640);
    dist = Math.min(dist, (hero.horizonY - 40 - y) / Math.sin(angle));
    sky.meteor = {
      t0: t,
      dur: 0.7 + Math.random() * 0.5,
      x,
      y,
      ux: Math.cos(angle) * dir,
      uy: Math.sin(angle),
      dist,
      len: 50 + Math.random() * 80,
    };
  }

  function paintMeteor(ctx, t) {
    const m = sky.meteor;
    const k = (t - m.t0) / m.dur;
    if (k >= 1 || k < 0) {
      sky.meteor = null;
      return;
    }
    const head = m.dist * easeOut(k);
    const tail = Math.min(m.len, head);
    const x = m.x + m.ux * head;
    const y = m.y + m.uy * head;
    const alpha = sky.dark * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
    const gradient = ctx.createLinearGradient(x - m.ux * tail, y - m.uy * tail, x, y);
    gradient.addColorStop(0, "rgba(235, 242, 255, 0)");
    gradient.addColorStop(1, `rgba(245, 248, 255, ${alpha.toFixed(3)})`);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - m.ux * tail, y - m.uy * tail);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function paintSky(t) {
    const ctx = hero.starCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, hero.w, hero.h);
    for (const { star, x, y, r, a: base } of sky.stars) {
      const a = base * (1 - star.tw * (0.5 + 0.5 * Math.sin(t * star.sp + star.ph)));
      ctx.fillStyle = star.color;
      if (star.glow) {
        ctx.globalAlpha = a * 0.16;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sky.meteor) paintMeteor(ctx, t);
    else if (sky.dark > 0.6 && !opening.playing && !prefersStill() && t > sky.nextMeteor) {
      if (sky.nextMeteor) spawnMeteor(t);
      sky.nextMeteor = t + 5 + Math.random() * 9;
    }
    ctx.globalAlpha = 1;
  }

  function skyFrame(now) {
    sky.frame = 0;
    if (!sky.stars.length || !sky.visible || document.hidden || prefersStill()) return;
    // About thirty frames a second is plenty for starlight.
    if (now - sky.last > 30) {
      sky.last = now;
      paintSky(now / 1000);
    }
    sky.frame = requestAnimationFrame(skyFrame);
  }

  function kickSky() {
    if (!sky.frame && sky.stars.length && sky.visible && !prefersStill()) sky.frame = requestAnimationFrame(skyFrame);
  }

  function renderHero(L) {
    if (!hero.w) return;
    const s = hero.el.style;
    const el = L.sun.el;
    const small = hero.w < 600;

    // Sky
    const top = SKY_TOP(el);
    const low = SKY_LOW(el);
    s.setProperty("--sky-top", rgb(top));
    s.setProperty("--sky-mid", rgb(mixRgb(top, low, 0.45)));
    s.setProperty("--sky-low", rgb(low));

    // Sun
    const sp = projectSky(L.sun.alt, L.sun.az);
    const sunColor = SUN_CORE(el);
    const size = lerp(84, 58, smoothstep(0, 22, el)) * (small ? 0.72 : 1);
    s.setProperty("--sun-x", `${(sp.x * 100).toFixed(2)}%`);
    s.setProperty("--sun-y", `${(sp.y * 100).toFixed(2)}%`);
    s.setProperty("--glow", rgb(GLOW_COLOR(el), GLOW_ALPHA(el)));
    s.setProperty("--glow-r", `${GLOW_RADIUS(el).toFixed(1)}%`);
    s.setProperty("--sun-size", `${size.toFixed(1)}px`);
    s.setProperty("--sun-core", rgb(sunColor));
    s.setProperty("--sun-rim", rgb(mixRgb(sunColor, [255, 210, 140], 0.5), 0.9));
    s.setProperty("--sun-halo", rgb(GLOW_COLOR(el), 0.55));
    s.setProperty("--sun-op", smoothstep(-2.5, 0.4, el).toFixed(3));
    hero.sun.style.transform = `translate3d(${(sp.x * hero.w).toFixed(1)}px, ${(sp.y * hero.h).toFixed(1)}px, 0)`;

    // Moon, with its bright limb turned toward the sun
    const mp = projectSky(L.moon.alt, L.moon.az);
    const dayFactor = smoothstep(-6, 6, el);
    const moonOp =
      smoothstep(-1, 3, L.moon.el) * lerp(1, 0.4, dayFactor) * (0.3 + 0.7 * Math.min(1, L.moon.fraction * 4));
    s.setProperty("--moon-op", moonOp.toFixed(3));
    hero.moon.style.transform = `translate3d(${(mp.x * hero.w).toFixed(1)}px, ${(mp.y * hero.h).toFixed(1)}px, 0)${
      small ? " scale(0.8)" : ""
    }`;
    const toward = Math.atan2((sp.y - mp.y) * hero.h, (sp.x - mp.x) * hero.w) / RAD;
    hero.moonLit.setAttribute("d", moonPath(L.moon.fraction));
    hero.moonLit.setAttribute("transform", `rotate(${toward.toFixed(1)})`);

    projectStars(L);
    paintSky(performance.now() / 1000);
    kickSky();

    // Clouds: white by day, warm in the golden hours, a dim blue-grey at night
    const cloudLit = mixRgb([255, 255, 255], [255, 196, 168], L.golden);
    s.setProperty("--cloud", rgb(mixRgb([44, 56, 102], cloudLit, smoothstep(-8, 2, el))));
    s.setProperty("--cloud-op", lerp(0.28, 0.8, smoothstep(-8, 3, el)).toFixed(3));

    // Ground
    const day = L.theme === "day";
    s.setProperty("--ground-far", rgb(GROUND_FAR(el)));
    s.setProperty("--grid", day ? "rgba(18, 26, 51, 0.075)" : "rgba(196, 210, 255, 0.07)");
    s.setProperty("--horizon-line", day ? "rgba(255, 255, 255, 0.55)" : "rgba(160, 178, 255, 0.18)");

    // The letters: backlit by day, moonlit by night, rimmed on the side facing the sun
    const golden = L.golden;
    const north = Math.cos(L.sun.alt) * Math.cos(L.sun.az);
    const faceLit = Math.max(0, north) * smoothstep(0, 6, el);
    let ink = mixRgb(WORD_DAY, WORD_WARM, golden * 0.7);
    ink = mixRgb(ink, WORD_LIT, faceLit * 0.55);
    ink = mixRgb(ink, WORD_NIGHT, 1 - smoothstep(-2.6, -0.6, el));
    s.setProperty("--word-ink", rgb(ink));

    const rimStrength = smoothstep(-0.5, 3, el) * (0.3 + 0.7 * golden) * (1 - 0.7 * faceLit);
    const dirX = sp.x - 0.5;
    const dirY = -Math.max(0, Math.sin(L.sun.alt));
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const rimPx = lerp(1.5, 4, golden) * (small ? 0.6 : 1);
    s.setProperty("--rim-x", `${((dirX / dirLen) * rimPx).toFixed(2)}px`);
    s.setProperty("--rim-y", `${((dirY / dirLen) * rimPx).toFixed(2)}px`);
    s.setProperty("--rim", rgb(mixRgb([255, 246, 223], [255, 186, 102], golden), 0.85 * rimStrength));

    // The cast shadow: an affine projection of the letters onto the ground
    const src = L.source;
    let c = 0;
    let d = 0;
    let core = 0;
    let soft = 0;
    let blur = 8;
    let castColor = [46, 42, 110];
    if (src) {
      const cot = clamp(1 / Math.tan(Math.max(src.alt, 1.5 * RAD)), 0, 8);
      const k = small ? 0.46 : 0.38;
      c = clamp(-cot * Math.sin(src.az), -5.5, 5.5);
      d = k * cot * Math.cos(src.az);
      // In the tropics the sun crosses almost due east to west, so shadows would lie flat
      // along the picture plane. A little depth keeps them reading as shadows on the ground.
      const minDepth = k * cot * 0.45;
      if (Math.abs(d) < minDepth) d = d > 0.0001 ? minDepth : -minDepth;
      const maxBack = (0.92 * (hero.baseY - hero.horizonY)) / Math.max(hero.cap, 1);
      d = clamp(d, -6, maxBack);
      if (src.kind === "sun") {
        core = src.strength * 0.6 * (1 - 0.3 * smoothstep(45, 85, el));
        soft = src.strength * 0.36;
        castColor = mixRgb([46, 42, 110], [84, 38, 92], golden);
      } else {
        core = 0.34 * src.strength;
        soft = 0.22 * src.strength;
        castColor = [0, 2, 14];
      }
      blur = 5 + Math.min(cot, 6) * 2.2;
    }
    s.setProperty("--sh-c", c.toFixed(4));
    s.setProperty("--sh-d", d.toFixed(4));
    s.setProperty("--cast-core", core.toFixed(3));
    s.setProperty("--cast-soft", soft.toFixed(3));
    s.setProperty("--soft-blur", `${blur.toFixed(1)}px`);
    s.setProperty("--cast-color", rgb(castColor));
  }

  // ==========================================================================
  // 5. THE DIAL (TIME OF DAY) AND DRAGGING THE SKY
  // ==========================================================================
  function describeSky(L) {
    const el = L.sun.el;
    const { rise, set } = clock.events;
    if (el >= 0.5) return `Sun ${Math.round(el)}° above the horizon`;
    if (el > -6) {
      return L.minutes < 720 ? `First light. Sunrise at ${formatClock(rise)}` : `Dusk. The sun set at ${formatClock(set)}`;
    }
    if (L.moon.el > 2) return `Night. The moon is ${Math.round(L.moon.fraction * 100)}% lit`;
    return L.minutes < 720 ? `Night. Sunrise at ${formatClock(rise)}` : "Night. The moon is below the horizon";
  }

  // A minute's place on the range track: where the centre of the 24px thumb sits.
  const trackPos = (minutes) => `calc(12px + (100% - 24px) * ${(minutes / 1435).toFixed(4)})`;

  function paintDayBand() {
    const stops = clock.events.band.map(([m, el]) => `${rgb(BAND(el))} ${trackPos(m)}`);
    dial.root.style.setProperty("--day-band", `linear-gradient(90deg, ${stops.join(", ")})`);
    dial.rise.style.setProperty("--f", (clock.events.rise / 1435).toFixed(4));
    dial.set.style.setProperty("--f", (clock.events.set / 1435).toFixed(4));
    dial.rise.textContent = `Sunrise ${formatClock(clock.events.rise)}`;
    dial.set.textContent = `Sunset ${formatClock(clock.events.set)}`;
  }

  function renderDial(L) {
    const label = describeSky(L);
    dial.clock.textContent = formatClock(clock.minutes);
    if (dial.state.textContent !== label) dial.state.textContent = label;
    if (Math.abs(Number(dial.range.value) - clock.minutes) >= 5) dial.range.value = String(Math.round(clock.minutes / 5) * 5);
    dial.range.setAttribute("aria-valuetext", `${formatClock(clock.minutes)} in Yogyakarta. ${label}.`);
    dial.root.classList.toggle("is-scrubbed", !clock.live);
    dial.now.hidden = clock.live;
    dial.root.style.setProperty("--now-f", (clock.nowMinutes / 1435).toFixed(4));
    const day = L.sun.el > -2;
    dial.root.style.setProperty("--thumb", day ? "#f5a300" : "#e9eefb");
    dial.root.style.setProperty("--thumb-glow", day ? "rgba(245, 163, 0, 0.55)" : "rgba(196, 210, 255, 0.5)");
  }

  function bindDial() {
    dial.range.addEventListener("input", () => {
      endOpening();
      setMinutes(Number(dial.range.value), false);
    });
    dial.now.addEventListener("click", () => {
      syncToNow();
      setMinutes(clock.nowMinutes, true);
    });

    let drag = null;
    hero.el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("a, button, input")) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, minutes: clock.minutes, active: false };
      if (e.pointerType === "mouse") startDrag(e);
    });
    hero.el.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.active) {
        // On touch, only take over once the gesture is clearly sideways.
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) startDrag(e);
        return;
      }
      setMinutes(drag.minutes + (dx / hero.w) * 720, false);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      hero.el.classList.remove("is-dragging");
    };
    hero.el.addEventListener("pointerup", end);
    hero.el.addEventListener("pointercancel", end);

    function startDrag(e) {
      endOpening();
      drag.active = true;
      drag.x = e.clientX;
      drag.minutes = clock.minutes;
      hero.el.setPointerCapture(e.pointerId);
      hero.el.classList.add("is-dragging");
    }
  }

  // ---- The opening ---------------------------------------------------------
  // Today's sky winds forward from the last sunrise (or sunset) to the present minute
  // while the name rises. Then the menu and the text arrive. Any click, key or scroll skips it.
  const opening = {
    el: $("#intro"),
    clock: $("#introClock"),
    note: $("#introNote"),
    from: 0,
    playing: false,
    frame: 0,
    timer: 0,
  };
  const SKIP_EVENTS = ["pointerdown", "wheel", "keydown", "touchstart"];

  // A little before the sun last crossed the horizon. The head script in index.html
  // opens the page in that light, so keep the two in step.
  function openingStart() {
    const { rise, set } = clock.events;
    const now = clock.nowMinutes;
    if (now >= rise && now < set) return rise - 55;
    return (now >= set ? set : set - 1440) - 70;
  }

  function openingNote(L) {
    const el = L.sun.el;
    const m = ((L.minutes % 1440) + 1440) % 1440;
    const morning = m < 720;
    if (el < -12) return "Night";
    if (el < -0.833) return morning ? "First light" : "Dusk";
    if (el < 6) return morning ? "Sunrise" : "Sunset";
    if (m < 660) return "Morning";
    if (m < 840) return "Midday";
    return "Afternoon";
  }

  function setupOpening() {
    if (prefersStill() || location.hash || window.scrollY > 0) return;
    opening.playing = true;
    opening.from = openingStart();
    clock.live = false;
    clock.minutes = opening.from;
    SKIP_EVENTS.forEach((type) => window.addEventListener(type, endOpening, { capture: true, passive: true }));
  }

  function playOpening() {
    if (!opening.playing) return;
    const from = opening.from;
    const to = clock.nowMinutes;
    const duration = clamp(2600 + (to - from) * 2, 3000, 4200);
    let t0 = 0;
    let risen = false;
    const step = (now) => {
      if (!opening.playing) return;
      if (!t0) {
        // Starts on the first frame the visitor can see, and can't hang if a frame goes missing.
        t0 = now;
        opening.el.classList.add("is-on");
        opening.timer = setTimeout(endOpening, duration + 2500);
      }
      const t = clamp((now - t0) / duration, 0, 1);
      clock.minutes = lerp(from, to, easeInOut(t));
      renderLight();
      opening.clock.textContent = formatClock(clock.minutes);
      const note = t < 1 ? openingNote(clock.light) : "Now";
      if (opening.note.textContent !== note) opening.note.textContent = note;
      if (!risen && now - t0 > 450) {
        risen = true;
        hero.monument.classList.add("is-up");
      }
      if (t < 1) {
        opening.frame = requestAnimationFrame(step);
      } else {
        clearTimeout(opening.timer);
        opening.timer = setTimeout(endOpening, 700);
      }
    };
    opening.frame = requestAnimationFrame(step);
  }

  // Lands on the present minute, whether the opening ran its course or was skipped.
  function endOpening() {
    if (!opening.playing) return;
    opening.playing = false;
    cancelAnimationFrame(opening.frame);
    clearTimeout(opening.timer);
    SKIP_EVENTS.forEach((type) => window.removeEventListener(type, endOpening, { capture: true }));
    opening.el.classList.remove("is-on");
    opening.el.classList.add("is-off");
    showPage();
    clock.live = true;
    clock.minutes = clock.nowMinutes;
    renderLight();
  }

  function showPage() {
    hero.monument.classList.add("is-up");
    root.classList.add("is-ready");
  }

  // ==========================================================================
  // 6. PLATES: SMALL PLAYABLE PIECES, ONE PER PROJECT
  // ==========================================================================

  // ---- 6.1 PetaSurya: a city block under the same sun as the hero ----------
  function createCityPlate(plate) {
    const canvas = $(".plate-canvas", plate);
    const tip = $(".roof-tip", plate);
    const tipArea = $(".roof-tip-area", plate);
    const tipYield = $(".roof-tip-yield", plate);
    const chip = $(".plate-chip-sun", plate);
    const scanBtn = $('[data-action="scan"]', plate);
    const shadowCanvas = document.createElement("canvas");
    const ANGLE = -0.21;
    const ROOFS = {
      house: ["#3b4569", "#424c71", "#4a547a", "#5d4649", "#644b45", "#574740", "#46526f"],
      shop: ["#505c79", "#58637f", "#47536f"],
    };

    let ctx = null;
    let sctx = null;
    let W = 0;
    let H = 0;
    let pxm = 1;
    let roads = [];
    let buildings = [];
    let trees = [];
    let lamps = [];
    let shadowVec = [0, 0];
    let shadowAlpha = 0;
    let toSun = [0, 1];
    let sunLow = 0;
    let night = 0;
    let selected = null;
    let scanStart = 0;
    let revealStart = 0;
    let revealState = "idle"; // idle, running, done
    let raf = 0;
    let visible = false;

    function build() {
      const rand = mulberry32(20261022);
      pxm = Math.max(W, H) / 280;
      const cos = Math.cos(ANGLE);
      const sin = Math.sin(ANGLE);
      const half = Math.hypot(W, H) / 2 / pxm + 40;
      const toPx = (x, y) => [W / 2 + (x * cos - y * sin) * pxm, H / 2 + (x * sin + y * cos) * pxm];

      const xs = [];
      const ys = [];
      for (let x = -half; x < half + 80; x += 62 + rand() * 40) xs.push(x);
      for (let y = -half; y < half + 60; y += 44 + rand() * 26) ys.push(y);
      const mainX = Math.floor(xs.length * 0.55);
      const mainY = Math.floor(ys.length * 0.42);
      const wx = xs.map((_, i) => (i === mainX ? 12 : 7));
      const wy = ys.map((_, i) => (i === mainY ? 12 : 7));
      const far = half + 90;

      roads = [];
      xs.forEach((x, i) =>
        roads.push({
          main: i === mainX,
          pts: [toPx(x - wx[i] / 2, -far), toPx(x + wx[i] / 2, -far), toPx(x + wx[i] / 2, far), toPx(x - wx[i] / 2, far)],
          line: [toPx(x, -far), toPx(x, far)],
        })
      );
      ys.forEach((y, i) =>
        roads.push({
          main: i === mainY,
          pts: [toPx(-far, y - wy[i] / 2), toPx(far, y - wy[i] / 2), toPx(far, y + wy[i] / 2), toPx(-far, y + wy[i] / 2)],
          line: [toPx(-far, y), toPx(far, y)],
        })
      );

      buildings = [];
      trees = [];
      lamps = [];
      for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < ys.length - 1; j++) {
          const x0 = xs[i] + wx[i] / 2 + 1.5;
          const x1 = xs[i + 1] - wx[i + 1] / 2 - 1.5;
          const y0 = ys[j] + wy[j] / 2 + 1.5;
          const y1 = ys[j + 1] - wy[j + 1] / 2 - 1.5;
          const nearMain = i === mainX || i + 1 === mainX || j === mainY || j + 1 === mainY;
          fillBlock(x0, y0, x1, y1, nearMain, rand, toPx);
        }
      }
      for (let t = -half; t < half; t += 24) {
        lamps.push(toPx(xs[mainX] - wx[mainX] / 2 + 1, t));
        lamps.push(toPx(t, ys[mainY] + wy[mainY] / 2 - 1));
      }

      const onScreen = (box) => box[2] > -30 && box[0] < W + 30 && box[3] > -30 && box[1] < H + 30;
      buildings = buildings.filter((b) => onScreen(b.box));
      trees = trees.filter((t) => t.x > -30 && t.x < W + 30 && t.y > -30 && t.y < H + 30);
      lamps = lamps.filter(([x, y]) => x > -30 && x < W + 30 && y > -30 && y < H + 30);
    }

    function fillBlock(x0, y0, x1, y1, nearMain, rand, toPx) {
      const alongX = x1 - x0 >= y1 - y0;
      const U = alongX ? x1 - x0 : y1 - y0;
      const V = alongX ? y1 - y0 : x1 - x0;
      if (U < 8 || V < 8) return;
      const rows = V > 24 ? 2 : 1;
      const depth = V / rows;
      const map = (u, v) => (alongX ? toPx(x0 + u, y0 + v) : toPx(x0 + v, y0 + u));

      for (let r = 0; r < rows; r++) {
        let u = 0;
        while (u < U - 5) {
          const roll = rand();
          let kind = "house";
          let lotW = 8 + rand() * 6;
          if (roll < 0.08) {
            kind = "park";
            lotW = 10 + rand() * 10;
          } else if (roll < (nearMain ? 0.32 : 0.14)) {
            kind = "shop";
            lotW = 13 + rand() * 11;
          }
          lotW = Math.min(lotW, U - u);
          if (U - u - lotW < 6) lotW = U - u;
          const v0 = r * depth;
          const v1 = v0 + depth;
          const front = 1 + rand() * 2;
          const back = 0.8 + rand() * 2.5;
          const side = 0.5 + rand();
          const fv0 = r === 0 ? v0 + front : v0 + back;
          const fv1 = r === 0 ? v1 - back : v1 - front;
          const fu0 = u + side;
          const fu1 = u + lotW - side;
          const du = fu1 - fu0;
          const dv = fv1 - fv0;

          if (du > 3 && dv > 3) {
            if (kind === "park") {
              const n = 2 + Math.floor(rand() * 4);
              for (let k = 0; k < n; k++) {
                const [x, y] = map(fu0 + rand() * du, fv0 + rand() * dv);
                trees.push({ x, y, r: (1.6 + rand() * 1.8) * pxm, h: 5 + rand() * 4 });
              }
            } else {
              const h = kind === "shop" ? 6 + rand() * 4 : nearMain && rand() < 0.25 ? 9 + rand() * 5 : 3.5 + rand() * 3;
              let poly;
              if (kind === "house" && rand() < 0.22 && du > 7 && dv > 9) {
                const nu = du * (0.35 + rand() * 0.2);
                const nv = dv * (0.3 + rand() * 0.25);
                poly =
                  rand() < 0.5
                    ? [[fu0, fv0], [fu1 - nu, fv0], [fu1 - nu, fv0 + nv], [fu1, fv0 + nv], [fu1, fv1], [fu0, fv1]]
                    : [[fu0, fv0], [fu1, fv0], [fu1, fv1 - nv], [fu1 - nu, fv1 - nv], [fu1 - nu, fv1], [fu0, fv1]];
              } else {
                poly = [[fu0, fv0], [fu1, fv0], [fu1, fv1], [fu0, fv1]];
              }
              const list = ROOFS[kind] || ROOFS.house;
              const b = {
                pts: poly.map(([pu, pv]) => map(pu, pv)),
                h,
                kind,
                area: polygonArea(poly),
                color: hexRgb(list[Math.floor(rand() * list.length)]),
                halves: null,
                normal: null,
                panels: null,
              };
              if (kind === "house" && poly.length === 4) {
                // A gable roof: two planes either side of a ridge along the long side.
                let halves;
                if (du >= dv) {
                  const vm = (fv0 + fv1) / 2;
                  halves = [
                    [[fu0, fv0], [fu1, fv0], [fu1, vm], [fu0, vm]],
                    [[fu0, vm], [fu1, vm], [fu1, fv1], [fu0, fv1]],
                  ];
                } else {
                  const um = (fu0 + fu1) / 2;
                  halves = [
                    [[fu0, fv0], [um, fv0], [um, fv1], [fu0, fv1]],
                    [[um, fv0], [fu1, fv0], [fu1, fv1], [um, fv1]],
                  ];
                }
                b.halves = halves.map((q) => q.map(([a, c]) => map(a, c)));
                const c0 = centroid(b.halves[0]);
                const c1 = centroid(b.halves[1]);
                const nl = Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) || 1;
                b.normal = [(c0[0] - c1[0]) / nl, (c0[1] - c1[1]) / nl];
              }
              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              for (const [x, y] of b.pts) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
              b.box = [minX, minY, maxX, maxY];
              b.center = centroid(b.pts);
              b.potential = clamp(b.area / 420, 0.15, 1);
              buildings.push(b);
            }
          }
          u += lotW;
        }
      }
    }

    // Solar panels laid out on the roof, in the street grid's orientation.
    function panelsFor(b) {
      if (b.panels) return b.panels;
      const cx = W / 2;
      const cy = H / 2;
      const cos = Math.cos(-ANGLE);
      const sin = Math.sin(-ANGLE);
      const unrot = ([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
      const rerot = ([x, y]) => [cx + (x - cx) * Math.cos(ANGLE) - (y - cy) * Math.sin(ANGLE), cy + (x - cx) * Math.sin(ANGLE) + (y - cy) * Math.cos(ANGLE)];
      const local = b.pts.map(unrot);
      const xs = local.map((p) => p[0]);
      const ys = local.map((p) => p[1]);
      const pw = 1.7 * pxm;
      const ph = 1.05 * pxm;
      const gap = 0.22 * pxm;
      const margin = 0.8 * pxm;
      const panels = [];
      for (let y = Math.min(...ys) + margin; y + ph <= Math.max(...ys) - margin; y += ph + gap) {
        for (let x = Math.min(...xs) + margin; x + pw <= Math.max(...xs) - margin; x += pw + gap) {
          const quad = [[x, y], [x + pw, y], [x + pw, y + ph], [x, y + ph]];
          if (quad.every(([qx, qy]) => pointInPolygon(qx, qy, local))) panels.push(quad.map(rerot));
        }
      }
      b.panels = panels;
      return panels;
    }

    function onLight(L) {
      const src = L.source;
      night = 1 - smoothstep(-6, 1, L.sun.el);
      if (src) {
        const cot = clamp(1 / Math.tan(Math.max(src.alt, 3 * RAD)), 0, 5);
        shadowVec = [Math.sin(src.az) * cot * pxm, -Math.cos(src.az) * cot * pxm];
        shadowAlpha = src.kind === "sun" ? 0.62 * src.strength : 0.4 * src.strength;
        toSun = [-Math.sin(src.az), Math.cos(src.az)];
        sunLow = src.kind === "sun" ? 1 - smoothstep(10, 70, src.alt / RAD) : 0.4;
      } else {
        shadowVec = [0, 0];
        shadowAlpha = 0;
        sunLow = 0;
      }
      const text = src
        ? src.kind === "sun"
          ? "Shadows follow the sun above"
          : "Shadows follow the moon above"
        : "The sun is down in Yogyakarta";
      if (chip.textContent !== text) chip.textContent = text;
      chip.style.setProperty("--chip-light", src ? (src.kind === "sun" ? "#ffc24d" : "#dfe6ff") : "#7d88b8");
      if (visible) requestDraw();
    }

    function castPrism(c, pts, dx, dy) {
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
        c.lineTo(bx + dx, by + dy);
        c.lineTo(ax + dx, ay + dy);
        c.closePath();
        c.fill();
      }
      c.beginPath();
      tracePath(c, pts.map(([x, y]) => [x + dx, y + dy]));
      c.fill();
    }

    function fillPoly(pts, color) {
      ctx.beginPath();
      tracePath(ctx, pts);
      ctx.fillStyle = color;
      ctx.fill();
    }

    function revealX(now) {
      if (revealState === "idle") return -Infinity;
      if (revealState === "done") return Infinity;
      const t = clamp((now - revealStart) / 1700, 0, 1);
      return lerp(-60, W + 60, easeInOut(t));
    }

    function draw(now) {
      if (!ctx) return;
      const dim = lerp(1, 0.52, night);
      ctx.fillStyle = rgb(mixRgb([19, 28, 56], [9, 14, 32], night));
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = rgb(mixRgb([30, 41, 76], [16, 23, 48], night));
      for (const r of roads) fillPoly(r.pts, ctx.fillStyle);
      ctx.save();
      ctx.strokeStyle = "rgba(255, 214, 140, 0.2)";
      ctx.setLineDash([6, 9]);
      ctx.lineWidth = 1;
      for (const r of roads) {
        if (!r.main) continue;
        ctx.beginPath();
        ctx.moveTo(r.line[0][0], r.line[0][1]);
        ctx.lineTo(r.line[1][0], r.line[1][1]);
        ctx.stroke();
      }
      ctx.restore();

      if (night > 0.05) {
        for (const [x, y] of lamps) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, 9 * pxm);
          g.addColorStop(0, `rgba(255, 196, 120, ${0.26 * night})`);
          g.addColorStop(1, "rgba(255, 196, 120, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - 9 * pxm, y - 9 * pxm, 18 * pxm, 18 * pxm);
        }
      }

      if (shadowAlpha > 0.01) {
        sctx.save();
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
        sctx.restore();
        sctx.fillStyle = "#000";
        for (const b of buildings) castPrism(sctx, b.pts, shadowVec[0] * b.h, shadowVec[1] * b.h);
        for (const t of trees) {
          sctx.beginPath();
          sctx.arc(t.x + shadowVec[0] * t.h * 0.8, t.y + shadowVec[1] * t.h * 0.8, t.r * 0.9, 0, Math.PI * 2);
          sctx.fill();
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = shadowAlpha;
        ctx.drawImage(shadowCanvas, 0, 0);
        ctx.restore();
      }

      for (const t of trees) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fillStyle = rgb(mixRgb([36, 84, 66], [17, 38, 36], night));
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x + toSun[0] * t.r * 0.3, t.y + toSun[1] * t.r * 0.3, t.r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 210, 160, ${0.14 * (1 - night)})`;
        ctx.fill();
      }

      const rx = revealX(now);
      const contrast = (0.16 + 0.34 * sunLow) * (1 - night);
      for (const b of buildings) {
        if (b.halves) {
          const dot = b.normal[0] * toSun[0] + b.normal[1] * toSun[1];
          fillPoly(b.halves[0], rgb(scaleRgb(b.color, clamp(1 + dot * contrast, 0.62, 1.35) * dim)));
          fillPoly(b.halves[1], rgb(scaleRgb(b.color, clamp(1 - dot * contrast, 0.62, 1.35) * dim)));
        } else {
          fillPoly(b.pts, rgb(scaleRgb(b.color, dim)));
          ctx.beginPath();
          tracePath(ctx, b.pts);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
          ctx.lineWidth = Math.max(1, pxm * 0.5);
          ctx.stroke();
        }
        if (rx > b.center[0]) {
          fillPoly(b.pts, `rgba(245, 165, 36, ${((0.07 + 0.17 * b.potential) * (1 - night * 0.5)).toFixed(3)})`);
        }
      }

      if (revealState === "running") {
        const g = ctx.createLinearGradient(rx - 90, 0, rx, 0);
        g.addColorStop(0, "rgba(255, 196, 92, 0)");
        g.addColorStop(1, "rgba(255, 196, 92, 0.24)");
        ctx.fillStyle = g;
        ctx.fillRect(rx - 90, 0, 90, H);
        ctx.fillStyle = "rgba(255, 214, 140, 0.95)";
        ctx.fillRect(rx - 1, 0, 2, H);
      }

      if (selected) drawScan(selected, now);
    }

    function drawScan(b, now) {
      const t = prefersStill() ? 1 : clamp((now - scanStart) / 650, 0, 1);
      const [x0, y0, x1, y1] = b.box;
      const sx = lerp(x0, x1, easeInOut(t));
      ctx.save();
      ctx.beginPath();
      tracePath(ctx, b.pts);
      ctx.clip();
      ctx.fillStyle = "rgba(245, 165, 36, 0.6)";
      ctx.fillRect(x0 - 2, y0 - 2, sx - x0 + 2, y1 - y0 + 4);
      if (t >= 1) {
        const panels = panelsFor(b);
        const shown = prefersStill() ? panels.length : Math.floor(panels.length * clamp((now - scanStart - 650) / 450, 0, 1));
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "rgba(170, 196, 255, 0.5)";
        ctx.fillStyle = "rgba(24, 38, 92, 0.92)";
        for (let i = 0; i < shown; i++) {
          ctx.beginPath();
          tracePath(ctx, panels[i]);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.beginPath();
      tracePath(ctx, b.pts);
      ctx.strokeStyle = "#ffc35a";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (t < 1) {
        ctx.fillStyle = "rgba(255, 230, 170, 0.95)";
        ctx.fillRect(sx - 1, y0 - 6, 2, y1 - y0 + 12);
      }
    }

    function animating(now) {
      if (revealState === "running") return true;
      if (selected && !prefersStill() && now - scanStart < 1150) return true;
      return false;
    }

    function frame(now) {
      raf = 0;
      if (revealState === "running" && now - revealStart >= 1700) {
        revealState = "done";
        if (!selected) select(defaultBuilding());
      }
      draw(now);
      if (animating(now)) raf = requestAnimationFrame(frame);
    }

    function requestDraw() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function select(b) {
      if (!b || b === selected) return;
      selected = b;
      scanStart = performance.now();
      tipArea.textContent = `${Math.round(b.area)} m² of roof`;
      tipYield.textContent = `${(b.area * 0.0584).toFixed(1)} kWp, about ${formatRupiah(b.area * 49388)} saved a year`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let x = b.box[2] + 14;
      if (x + tw > W - 12) x = b.box[0] - tw - 14;
      let y = clamp(b.center[1] - th / 2, 58, H - th - 76);
      if (x < 12) {
        // No room beside the roof, so the card sits below it, or above it.
        x = clamp(b.center[0] - tw / 2, 12, W - tw - 12);
        y = b.box[3] + 12 + th <= H - 76 ? b.box[3] + 12 : Math.max(58, b.box[1] - th - 12);
      }
      tip.style.setProperty("--tip-x", `${Math.round(x)}px`);
      tip.style.setProperty("--tip-y", `${Math.round(y)}px`);
      requestDraw();
    }

    function defaultBuilding() {
      const candidates = buildings.filter(
        (b) => b.area > 170 && b.area < 460 && b.box[0] > W * 0.28 && b.box[2] < W * 0.72 && b.box[1] > H * 0.22 && b.box[3] < H * 0.7
      );
      const list = candidates.length ? candidates : buildings;
      let best = null;
      let bestD = Infinity;
      for (const b of list) {
        const d = Math.hypot(b.center[0] - W * 0.52, b.center[1] - H * 0.45);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best;
    }

    function hit(e) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      for (let i = buildings.length - 1; i >= 0; i--) {
        const b = buildings[i];
        if (x < b.box[0] || x > b.box[2] || y < b.box[1] || y > b.box[3]) continue;
        if (pointInPolygon(x, y, b.pts)) return b;
      }
      return null;
    }

    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const b = hit(e);
      canvas.style.cursor = b ? "pointer" : "";
      if (b) select(b);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      const b = hit(e);
      if (b) select(b);
    });
    scanBtn.addEventListener("click", () => {
      const pool = buildings.filter(
        (b) => b !== selected && b.area > 110 && b.box[0] > W * 0.08 && b.box[2] < W * 0.92 && b.box[1] > H * 0.15 && b.box[3] < H * 0.75
      );
      if (pool.length) select(pool[Math.floor(Math.random() * pool.length)]);
    });

    function resize() {
      W = plate.clientWidth;
      H = plate.clientHeight;
      if (!W || !H) return;
      ctx = fitCanvas(canvas, W, H);
      sctx = fitCanvas(shadowCanvas, W, H);
      build();
      const wasSelected = selected;
      selected = null;
      tip.hidden = true;
      if (clock.light) onLight(clock.light);
      if (revealState === "done" || wasSelected) select(defaultBuilding());
      requestDraw();
    }

    function setVisible(isVisible, ratio) {
      visible = isVisible;
      if (!isVisible) return;
      if (revealState === "idle" && ratio >= 0.3) {
        if (prefersStill()) {
          revealState = "done";
          select(defaultBuilding());
        } else {
          revealState = "running";
          revealStart = performance.now();
        }
      }
      requestDraw();
    }

    return { resize, onLight, setVisible };
  }

  // ---- 6.2 PRAKIRA: rain now, risk later -----------------------------------
  function createRainPlate(plate) {
    const canvas = $(".plate-canvas", plate);
    const counters = { low: $('[data-count="low"]', plate), watch: $('[data-count="watch"]', plate), alert: $('[data-count="alert"]', plate) };
    const rainBtn = $('[data-action="rain"]', plate);
    const BASE = [0.84, 0.18, 0.62, 0.26, 0.79, 0.33, 0.2, 0.58, 0.15, 0.86, 0.3, 0.55, 0.22, 0.36, 0.65, 0.12];
    const RISK = colorRamp([
      [0, "#4f9e76"], [0.42, "#80bf8c"], [0.47, "#e9b95b"], [0.72, "#eea24d"], [0.77, "#e0644e"], [1, "#c23f33"],
    ]);
    const levelOf = (r) => (r >= 0.75 ? 2 : r >= 0.45 ? 1 : 0);

    let ctx = null;
    let W = 0;
    let H = 0;
    let coast = [];
    let city = [];
    let cells = [];
    let drops = [];
    let rings = [];
    let auto = null;
    let touching = false;
    let raf = 0;
    let last = 0;
    let visible = false;
    let shown = { low: 9, watch: 4, alert: 3 };
    const cloud = { x: 0, y: 0, tx: 0, ty: 0, alpha: 0, on: false };
    const rand = Math.random;

    function coastY(x) {
      return H * 0.19 + Math.sin((x / W) * 6.1 + 0.8) * H * 0.028 + Math.sin((x / W) * 17 + 2) * H * 0.01;
    }

    function clipHalfPlane(poly, mx, my, nx, ny) {
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        const da = (a[0] - mx) * nx + (a[1] - my) * ny;
        const db = (b[0] - mx) * nx + (b[1] - my) * ny;
        if (da <= 0) out.push(a);
        if (da <= 0 !== db <= 0) {
          const t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      return out;
    }

    function build() {
      const seeded = mulberry32(1607);
      coast = [];
      for (let x = -12; x <= W + 12; x += 8) coast.push([x, coastY(x)]);

      const cx = W * 0.5;
      const cy = H * 0.57;
      const rx = W * 0.41;
      const ry = H * 0.4;
      city = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const wob = 1 + 0.07 * Math.sin(a * 3 + 1.1) + 0.05 * Math.sin(a * 5 + 0.3) + 0.025 * Math.sin(a * 11);
        const x = cx + Math.cos(a) * rx * wob;
        const y = Math.max(cy + Math.sin(a) * ry * wob, coastY(x) + 3);
        city.push([x, y]);
      }

      const seeds = [];
      let guard = 0;
      while (seeds.length < 16 && guard++ < 400) {
        let best = null;
        let bestD = -1;
        for (let k = 0; k < 40; k++) {
          const p = [cx + (seeded() * 2 - 1) * rx, cy + (seeded() * 2 - 1) * ry];
          if (!pointInPolygon(p[0], p[1], city)) continue;
          let dmin = Infinity;
          for (const s of seeds) dmin = Math.min(dmin, Math.hypot(s[0] - p[0], s[1] - p[1]));
          if (dmin > bestD) {
            bestD = dmin;
            best = p;
          }
        }
        if (best) seeds.push(best);
      }

      const previous = cells;
      cells = seeds.map((seed, i) => {
        let poly = [[-20, -20], [W + 20, -20], [W + 20, H + 20], [-20, H + 20]];
        seeds.forEach((other, j) => {
          if (j === i) return;
          poly = clipHalfPlane(poly, (seed[0] + other[0]) / 2, (seed[1] + other[1]) / 2, other[0] - seed[0], other[1] - seed[1]);
        });
        const old = previous[i];
        return {
          seed,
          poly,
          base: BASE[i % BASE.length],
          rain: old ? old.rain : 0,
          l1: old ? old.l1 : 0,
          l2: old ? old.l2 : 0,
          risk: old ? old.risk : BASE[i % BASE.length],
          level: levelOf(old ? old.risk : BASE[i % BASE.length]),
          flash: 0,
        };
      });
    }

    function cellAt(x, y) {
      if (!pointInPolygon(x, y, city)) return null;
      for (const c of cells) if (pointInPolygon(x, y, c.poly)) return c;
      return null;
    }

    function drawCloud(x, y, alpha, offset) {
      const s = clamp(W / 560, 0.8, 1.5);
      const puffs = [[-26, 4, 17], [-9, -8, 22], [13, -5, 20], [30, 5, 15], [2, 8, 19]];
      if (offset) {
        ctx.fillStyle = `rgba(2, 18, 24, ${(0.22 * alpha).toFixed(3)})`;
        for (const [dx, dy, r] of puffs) {
          ctx.beginPath();
          ctx.arc(x + offset[0] + dx * s, y + offset[1] + dy * s, r * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = `rgba(214, 228, 232, ${(0.95 * alpha).toFixed(3)})`;
      for (const [dx, dy, r] of puffs) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s + 3, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(250, 253, 255, ${(0.97 * alpha).toFixed(3)})`;
      for (const [dx, dy, r] of puffs) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s - 1, r * s * 0.94, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.fillStyle = "#0d3640";
      ctx.fillRect(0, 0, W, H);

      ctx.beginPath();
      ctx.moveTo(-12, -12);
      for (const p of coast) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(W + 12, -12);
      ctx.closePath();
      ctx.fillStyle = "#0a2a32";
      ctx.fill();
      ctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath();
        coast.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] - k * 13) : ctx.moveTo(p[0], p[1] - k * 13)));
        ctx.strokeStyle = `rgba(150, 214, 220, ${(0.12 - k * 0.03).toFixed(3)})`;
        ctx.stroke();
      }
      ctx.font = 'italic 500 12px "Newsreader", Georgia, serif';
      ctx.fillStyle = "rgba(170, 222, 226, 0.5)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("Java Sea", W - 22, coastY(W - 60) * 0.42);

      ctx.save();
      ctx.beginPath();
      tracePath(ctx, city);
      ctx.clip();
      for (const c of cells) {
        ctx.beginPath();
        tracePath(ctx, c.poly);
        ctx.fillStyle = rgb(RISK(c.risk));
        ctx.fill();
        if (c.flash > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.4 * c.flash).toFixed(3)})`;
          ctx.fill();
        }
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#0d3640";
      for (const c of cells) {
        ctx.beginPath();
        tracePath(ctx, c.poly);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      tracePath(ctx, city);
      ctx.strokeStyle = "rgba(226, 244, 238, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (const r of rings) {
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.45, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(235, 248, 255, ${(0.55 * (1 - r.t)).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(228, 242, 255, 0.8)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const d of drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 1.2, d.y - 9);
      }
      ctx.stroke();

      if (cloud.alpha > 0.01) {
        const src = clock.light && clock.light.source;
        const offset = src ? [Math.sin(src.az) * 34, -Math.cos(src.az) * 34 + 40] : null;
        drawCloud(cloud.x, cloud.y, cloud.alpha, offset);
      }
    }

    function updateCounts() {
      const next = { low: 0, watch: 0, alert: 0 };
      for (const c of cells) next[["low", "watch", "alert"][c.level]]++;
      for (const key of Object.keys(next)) {
        if (next[key] === shown[key]) continue;
        const el = counters[key];
        el.textContent = String(next[key]);
        el.classList.remove("is-bumped");
        void el.offsetWidth;
        el.classList.add("is-bumped");
      }
      shown = next;
    }

    function samplePath(path, t) {
      const segs = path.length - 1;
      const f = clamp(t, 0, 0.9999) * segs;
      const i = Math.floor(f);
      const k = easeInOut(f - i);
      return [lerp(path[i][0], path[i + 1][0], k), lerp(path[i][1], path[i + 1][1], k)];
    }

    function step(now) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      if (auto) {
        const t = (now - auto.start) / auto.duration;
        if (t >= 1) {
          auto = null;
          cloud.on = false;
        } else {
          const [x, y] = samplePath(auto.path, t);
          cloud.tx = x;
          cloud.ty = y;
        }
      }
      const follow = 1 - Math.exp(-dt * 9);
      cloud.x += (cloud.tx - cloud.x) * follow;
      cloud.y += (cloud.ty - cloud.y) * follow;
      cloud.alpha += ((cloud.on ? 1 : 0) - cloud.alpha) * (1 - Math.exp(-dt * 6));

      if (cloud.on && cloud.alpha > 0.4 && !prefersStill()) {
        const s = clamp(W / 560, 0.8, 1.5);
        const n = Math.round(150 * dt + rand());
        for (let i = 0; i < n; i++) {
          const y = cloud.y + 12 * s;
          drops.push({ x: cloud.x + (rand() - 0.5) * 56 * s, y, land: y + 26 + rand() * 34, vy: 380 + rand() * 160 });
        }
      } else if (cloud.on && prefersStill()) {
        const c = cellAt(cloud.x, cloud.y + 40);
        if (c) c.rain += dt * 0.6;
      }

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.vy * dt;
        if (d.y >= d.land) {
          drops.splice(i, 1);
          rings.push({ x: d.x, y: d.land, r: 1, t: 0 });
          const c = cellAt(d.x, d.land);
          if (c) c.rain += 0.0045;
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt * 2.6;
        r.r = 1 + r.t * 9;
        if (r.t >= 1) rings.splice(i, 1);
      }

      for (const c of cells) {
        c.rain *= Math.exp(-dt / 0.8);
        c.l1 += (c.rain - c.l1) * (1 - Math.exp(-dt / 0.7));
        c.l2 += (c.l1 - c.l2) * (1 - Math.exp(-dt / (c.l1 > c.l2 ? 0.9 : 4.5)));
        c.risk = clamp(c.base + c.l2 * 2.6, 0, 1);
        const level = levelOf(c.risk);
        if (level > c.level) c.flash = 1;
        c.level = level;
        c.flash = Math.max(0, c.flash - dt * 1.6);
      }
      updateCounts();
    }

    function busy() {
      if (auto || cloud.alpha > 0.01 || drops.length || rings.length) return true;
      return cells.some((c) => c.flash > 0 || c.l2 > 0.002 || c.l1 > 0.002 || c.rain > 0.002);
    }

    function frame(now) {
      raf = 0;
      step(now);
      draw();
      if (busy()) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function local(e) {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    function moveCloud(x, y, snap) {
      cloud.tx = x;
      cloud.ty = y - 46;
      if (snap || cloud.alpha < 0.05) {
        cloud.x = cloud.tx;
        cloud.y = cloud.ty;
      }
      cloud.on = true;
      auto = null;
      kick();
    }

    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || touching) moveCloud(...local(e), false);
    });
    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && !auto) {
        cloud.on = false;
        kick();
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      touching = true;
      moveCloud(...local(e), true);
    });
    const releaseTouch = () => {
      if (!touching) return;
      touching = false;
      setTimeout(() => {
        if (!touching && !auto) {
          cloud.on = false;
          kick();
        }
      }, 700);
    };
    window.addEventListener("pointerup", releaseTouch);
    window.addEventListener("pointercancel", releaseTouch);

    rainBtn.addEventListener("click", () => {
      if (!cells.length) return;
      const pool = cells.filter((c) => c.level < 2).sort(() => Math.random() - 0.5).slice(0, 3);
      const pts = (pool.length ? pool : cells.slice(0, 3)).map((c) => [c.seed[0], c.seed[1] - 46]).sort((a, b) => a[0] - b[0]);
      const path = [[-60, pts[0][1]], ...pts, [W + 60, pts[pts.length - 1][1]]];
      auto = { path, start: performance.now(), duration: 4600 };
      cloud.x = path[0][0];
      cloud.y = path[0][1];
      cloud.tx = cloud.x;
      cloud.ty = cloud.y;
      cloud.on = true;
      kick();
    });

    function resize() {
      W = plate.clientWidth;
      H = plate.clientHeight;
      if (!W || !H) return;
      ctx = fitCanvas(canvas, W, H);
      build();
      draw();
    }

    function setVisible(isVisible) {
      visible = isVisible;
      if (visible) draw();
    }

    return { resize, setVisible, onLight: () => visible && !raf && draw() };
  }

  // ---- 6.3 PanenCerdas: run a growing season -------------------------------
  function createFieldPlate(plate) {
    const canvas = $(".plate-canvas", plate);
    const dayNum = $(".season-day-num", plate);
    const yieldEl = $(".season-yield", plate);
    const range = $(".season-range", plate);
    const bandCanvas = $(".season-band", plate);
    const RICE = colorRamp([
      [-30, "#5e848f"], [0, "#5f8590"], [6, "#79997e"], [16, "#93c06c"], [34, "#62a247"], [55, "#3f8a37"],
      [74, "#3a7e31"], [87, "#8a9c3c"], [99, "#c9ab45"], [108, "#d8b65a"], [112, "#b49a6c"], [150, "#a6906a"],
    ]);
    const CORN = colorRamp([
      [-30, "#8a7356"], [4, "#8e7a5a"], [18, "#98a35c"], [40, "#6c9b45"], [70, "#5a8a3a"], [92, "#b3a45a"], [106, "#c7ab6a"], [150, "#9c8662"],
    ]);
    const ndvi = (s) => {
      if (s < 0) return 0.12;
      const rise = 1 / (1 + Math.exp(-(s - 30) / 7));
      const fall = 1 / (1 + Math.exp((s - 96) / 6));
      return 0.12 + 0.7 * rise * fall;
    };

    let ctx = null;
    let W = 0;
    let H = 0;
    let cell = 12;
    let cols = 0;
    let rows = 0;
    let grid = [];
    let plots = [];
    let bctx = null;
    let BW = 0;
    let BH = 0;
    let day = 0;
    let target = 0;
    let auto = null;
    let started = false;
    let dragging = false;
    let raf = 0;
    let last = 0;

    function build() {
      const rand = mulberry32(514);
      cell = clamp(Math.round(W / 46), 10, 20);
      cols = Math.ceil(W / cell);
      rows = Math.ceil(H / cell);
      grid = new Array(cols * rows).fill(null);
      const at = (x, y) => y * cols + x;

      for (let x = 0; x < cols; x++) {
        const cy = rows * 0.33 + Math.sin(x * 0.21) * 2.2 + Math.sin(x * 0.07 + 1.3) * 3;
        for (let y = 0; y < rows; y++) if (Math.abs(y - cy) < 0.8) grid[at(x, y)] = { kind: "water", noise: rand() };
      }
      for (let x = 0; x < cols; x++) {
        const y = Math.round(rows * 0.72 - x * 0.09);
        if (y >= 0 && y < rows && !grid[at(x, y)]) grid[at(x, y)] = { kind: "road", noise: rand() };
      }
      const vx = Math.floor(cols * 0.76);
      const vy = Math.floor(rows * 0.06);
      for (let y = vy; y < vy + Math.max(3, Math.round(rows * 0.2)); y++) {
        for (let x = vx; x < Math.min(cols, vx + Math.round(cols * 0.17)); x++) {
          if (y < rows && !grid[at(x, y)] && rand() < 0.86) grid[at(x, y)] = { kind: "village", noise: rand() };
        }
      }

      plots = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (grid[at(x, y)]) continue;
          const pw = 2 + Math.floor(rand() * 5);
          const ph = 2 + Math.floor(rand() * 3);
          let w = 0;
          while (w < pw && x + w < cols && !grid[at(x + w, y)]) w++;
          let h = 0;
          let blocked = false;
          while (!blocked && h < ph && y + h < rows) {
            for (let k = 0; k < w; k++) if (grid[at(x + k, y + h)]) blocked = true;
            if (!blocked) h++;
          }
          h = Math.max(1, h);
          const plot = { x, y, w, h, crop: rand() < 0.86 ? "rice" : "corn", offset: (rand() - 0.5) * 24, tone: 0.93 + rand() * 0.12 };
          plots.push(plot);
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[at(xx, yy)] = { kind: "plot", plot, noise: rand() };
        }
      }
    }

    // The greenness curve of one season, drawn under the invisible range thumb.
    function drawBand() {
      if (!bctx) return;
      const x0 = 11;
      const x1 = BW - 11;
      const top = 4;
      const base = BH - 18;
      const X = (d) => x0 + (d / 120) * (x1 - x0);
      const Y = (v) => base - ((v - 0.1) / 0.75) * (base - top - 10);
      const curve = () => {
        bctx.beginPath();
        for (let d = 0; d <= 120; d += 2) (d ? bctx.lineTo : bctx.moveTo).call(bctx, X(d), Y(ndvi(d)));
      };
      bctx.clearRect(0, 0, BW, BH);

      bctx.beginPath();
      bctx.moveTo(X(0), base);
      for (let d = 0; d <= 120; d += 2) bctx.lineTo(X(d), Y(ndvi(d)));
      bctx.lineTo(X(120), base);
      bctx.closePath();
      const g = bctx.createLinearGradient(0, top, 0, base);
      g.addColorStop(0, "rgba(196, 238, 128, 0.34)");
      g.addColorStop(1, "rgba(196, 238, 128, 0.03)");
      bctx.fillStyle = g;
      bctx.fill();

      bctx.lineWidth = 1.5;
      bctx.strokeStyle = "rgba(228, 244, 200, 0.5)";
      curve();
      bctx.stroke();
      bctx.save();
      bctx.beginPath();
      bctx.rect(0, 0, X(day), BH);
      bctx.clip();
      bctx.strokeStyle = "#f4ffdc";
      bctx.lineWidth = 2.4;
      curve();
      bctx.stroke();
      bctx.restore();

      bctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      bctx.fillRect(x0, base, x1 - x0, 1);

      const mx = X(day);
      const my = Y(ndvi(day));
      bctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      bctx.fillRect(mx - 0.75, top, 1.5, base - top);
      bctx.beginPath();
      bctx.arc(mx, my, 6.5, 0, Math.PI * 2);
      bctx.fillStyle = "#fff";
      bctx.fill();
      bctx.lineWidth = 2.5;
      bctx.strokeStyle = "#3d7a2c";
      bctx.stroke();

      bctx.font = '500 12px "Archivo", sans-serif';
      bctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      bctx.textBaseline = "alphabetic";
      bctx.textAlign = "left";
      bctx.fillText("Planting", x0, BH - 2);
      bctx.textAlign = "right";
      bctx.fillText("Harvest", x1, BH - 2);
      const right = mx > x1 - 90;
      bctx.textAlign = right ? "right" : "left";
      bctx.fillStyle = "#fff";
      bctx.font = '650 12.5px "Archivo", sans-serif';
      bctx.fillText(`NDVI ${ndvi(day).toFixed(2)}`, mx + (right ? -12 : 12), Math.max(14, my - 6));
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const g = grid[y * cols + x];
          if (!g) continue;
          let c;
          if (g.kind === "plot") {
            const p = g.plot;
            c = scaleRgb((p.crop === "rice" ? RICE : CORN)(day + p.offset), p.tone * (0.95 + g.noise * 0.1));
          } else if (g.kind === "water") {
            c = scaleRgb([70, 116, 136], 0.94 + g.noise * 0.12);
          } else if (g.kind === "road") {
            c = [178, 162, 134];
          } else {
            c = g.noise < 0.5 ? scaleRgb([150, 88, 66], 0.9 + g.noise * 0.3) : g.noise < 0.75 ? [118, 122, 130] : [44, 92, 52];
          }
          ctx.fillStyle = rgb(c);
          ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
        }
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(236, 224, 186, 0.45)";
      for (const p of plots) ctx.strokeRect(p.x * cell + 0.75, p.y * cell + 0.75, p.w * cell - 1.5, p.h * cell - 1.5);
      drawBand();
    }

    function updateReadout() {
      const d = Math.round(day);
      let text;
      if (day < 8) text = "Planting. Too early to call.";
      else if (day < 108) {
        const spread = 0.08 + 1.4 * (1 - smoothstep(8, 96, day));
        const mid = 5.84 - 0.35 * (1 - smoothstep(10, 85, day));
        text = `Forecast ${(mid - spread).toFixed(1)}–${(mid + spread).toFixed(1)} t/ha, harvest in ${Math.max(1, Math.round(110 - day))} days`;
      } else text = "Harvested. 5.84 t/ha, as forecast.";
      dayNum.textContent = String(d);
      if (yieldEl.textContent !== text) yieldEl.textContent = text;
      if (document.activeElement !== range) range.value = String(d);
      range.setAttribute("aria-valuetext", `Day ${d}. ${text}`);
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      if (auto) {
        const t = clamp((now - auto.start) / auto.duration, 0, 1);
        target = lerp(auto.from, auto.to, easeInOut(t));
        if (t >= 1) auto = null;
      }
      day += (target - day) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - day) < 0.02) day = target;
      draw();
      updateReadout();
      if (auto || day !== target) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function setTargetFromX(clientX) {
      const r = bandCanvas.getBoundingClientRect();
      target = clamp(((clientX - r.left - 11) / (r.width - 22)) * 120, 0, 120);
      auto = null;
      if (prefersStill()) day = target;
      kick();
    }

    plate.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || dragging) setTargetFromX(e.clientX);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      dragging = true;
      setTargetFromX(e.clientX);
    });
    window.addEventListener("pointerup", () => (dragging = false));
    window.addEventListener("pointercancel", () => (dragging = false));
    range.addEventListener("input", () => {
      auto = null;
      target = Number(range.value);
      if (prefersStill()) day = target;
      kick();
    });

    function resize() {
      W = plate.clientWidth;
      H = plate.clientHeight;
      if (!W || !H) return;
      ctx = fitCanvas(canvas, W, H);
      BW = bandCanvas.clientWidth;
      BH = bandCanvas.clientHeight;
      bctx = fitCanvas(bandCanvas, BW, BH);
      build();
      draw();
      updateReadout();
    }

    function setVisible(isVisible, ratio) {
      if (!isVisible || started || ratio < 0.35) return;
      started = true;
      if (prefersStill()) {
        day = target = 64;
        draw();
        updateReadout();
        return;
      }
      auto = { from: 0, to: 64, start: performance.now(), duration: 2600 };
      kick();
    }

    return { resize, setVisible, onLight: () => {} };
  }

  // ---- 6.4 Figlo: tags on a Figma layer become behavior in Roblox ---------
  function createFigloPlate(plate) {
    const ORDER = ["_button", "_smooth", "_float", "_pulse", "_wobble", "_sheen"];
    const tags = $$(".figlo-tag", plate);
    const layerName = $(".figlo-layer-name", plate);
    const wrap = $(".game-buy-wrap", plate);
    const buy = $(".game-buy", plate);
    const toast = $(".game-toast", plate);
    const packet = $(".figlo-packet", plate);
    const game = $(".game", plate);
    let toastTimer = 0;

    function restart(el, cls) {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    }

    function sync(animate) {
      const active = ORDER.filter((tag) => tags.some((t) => t.dataset.tag === tag && t.getAttribute("aria-pressed") === "true"));
      layerName.textContent = `Buy${active.length ? active.join("") : "_frame"}`;
      buy.classList.toggle("is-button", active.includes("_button"));
      buy.classList.toggle("is-smooth", active.includes("_smooth"));
      buy.classList.toggle("is-pulse", active.includes("_pulse"));
      buy.classList.toggle("is-sheen", active.includes("_sheen"));
      wrap.classList.toggle("is-float", active.includes("_float"));
      wrap.classList.toggle("is-wobble", active.includes("_wobble"));
      if (animate) {
        restart(packet, "is-sending");
        restart(layerName, "is-renamed");
      }
    }

    function say(text) {
      toast.textContent = text;
      toast.classList.add("is-shown");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-shown"), 1600);
    }

    tags.forEach((tag) =>
      tag.addEventListener("click", () => {
        tag.setAttribute("aria-pressed", String(tag.getAttribute("aria-pressed") !== "true"));
        sync(true);
      })
    );

    buy.addEventListener("click", () => {
      if (!buy.classList.contains("is-button")) {
        say("Add _button to make it clickable");
        return;
      }
      say("Purchased");
      if (prefersStill()) return;
      const g = game.getBoundingClientRect();
      const b = buy.getBoundingClientRect();
      for (let i = 0; i < 8; i++) {
        const coin = document.createElement("span");
        coin.className = "coin-burst";
        coin.style.left = `${b.left - g.left + b.width / 2}px`;
        coin.style.top = `${b.top - g.top + b.height / 2}px`;
        const angle = -Math.PI / 2 + (i / 7 - 0.5) * 2.2;
        coin.style.setProperty("--bx", `${Math.cos(angle) * (70 + Math.random() * 50)}px`);
        coin.style.setProperty("--by", `${Math.sin(angle) * (70 + Math.random() * 50)}px`);
        coin.addEventListener("animationend", () => coin.remove());
        game.appendChild(coin);
      }
    });

    sync(false);
    return { resize() {}, setVisible() {}, onLight() {} };
  }

  // ---- 6.5 agent-council: four roles, one ruling ---------------------------
  function createCouncilPlate(plate) {
    const ROLES = {
      believer: { name: "Believer", color: "#3fb950", tier: "Fact", line: "It already runs in 45+ agent clients, from one file." },
      skeptic: { name: "Skeptic", color: "#f85149", tier: "Fact", line: "Four personas on one model share the same blind spots." },
      investor: { name: "Investor", color: "#58a6ff", tier: "Fact", line: "It costs about four times the tokens of a single answer." },
      judge: { name: "Judge", color: "#e3b341", tier: "Ruling", line: "Proceed, with conditions. Cheapest test: five blind A/B runs on real decisions." },
    };
    const seats = $$(".seat", plate);
    const arcs = $$(".council-arc", plate);
    const verdict = $(".council-verdict", plate);
    const confidence = $(".council-confidence", plate);
    const who = $(".caption-who", plate);
    const text = $(".caption-text", plate);
    const convene = $('[data-action="convene"]', plate);
    let timers = [];

    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    function caption(label, color, tier, line) {
      who.textContent = label;
      who.style.setProperty("--who", color);
      if (tier) {
        const t = document.createElement("span");
        t.className = "tier";
        t.textContent = tier;
        who.appendChild(t);
      }
      text.textContent = line;
    }

    function rule(on) {
      plate.classList.toggle("is-ruled", on);
      verdict.hidden = !on;
      confidence.hidden = !on;
    }

    function speak(key) {
      const role = ROLES[key];
      seats.forEach((s) => s.classList.toggle("is-speaking", s.dataset.role === key));
      caption(role.name, role.color, role.tier, role.line);
      if (key === "judge") rule(true);
    }

    function reset() {
      clearTimers();
      seats.forEach((s) => s.classList.remove("is-speaking"));
      arcs.forEach((a) => a.classList.remove("is-drawn"));
      rule(false);
    }

    seats.forEach((seat) =>
      seat.addEventListener("click", () => {
        reset();
        convene.disabled = false;
        convene.textContent = "Convene";
        speak(seat.dataset.role);
      })
    );

    convene.addEventListener("click", () => {
      reset();
      const fast = prefersStill() ? 0.35 : 1;
      convene.disabled = true;
      convene.textContent = "In session";
      caption("Round one", "rgba(255, 255, 255, 0.6)", null, "Each role argues blind, without seeing the others.");
      const at = (ms, fn) => timers.push(setTimeout(fn, ms * fast));
      at(1300, () => speak("believer"));
      at(3300, () => speak("skeptic"));
      at(5300, () => speak("investor"));
      at(7300, () => {
        seats.forEach((s) => s.classList.remove("is-speaking"));
        caption("Round two", "rgba(255, 255, 255, 0.6)", null, "Each role quotes the others word for word, then answers.");
        arcs.forEach((a, i) => timers.push(setTimeout(() => a.classList.add("is-drawn"), i * 260 * fast)));
      });
      at(9600, () => {
        speak("judge");
        convene.disabled = false;
        convene.textContent = "Convene again";
      });
    });

    return { resize() {}, setVisible() {}, onLight() {} };
  }

  // ==========================================================================
  // 7. PROJECT DETAILS
  // ==========================================================================
  const PROJECTS = [];

  const COUNCIL_CLAIMS = {
    believer: [
      ["Fact", "f", "Ships as one dependency-free SKILL.md that works in Claude Code, Codex CLI, Gemini CLI and more than 45 other clients."],
      ["Mandate", "a", "Name the specific world where this wins. No cheerleading, no unquantified upside."],
    ],
    skeptic: [
      ["Fact", "f", "Four personas on the same model share the same training and the same blind spots."],
      ["Speculation", "s", "Without strict isolation between rounds, people may mistake four times the tokens for independent checking."],
    ],
    investor: [
      ["Fact", "f", "About four times the context: roughly $0.40 to $2.00 and two to six minutes per decision, against a 20-second single answer."],
      ["Assumption", "a", "Worth it for high-stakes calls that are hard to undo. Overkill for small refactors."],
    ],
    judge: [
      ["Ruling", "f", "Proceed, with conditions: cap confidence at 50% when the council rules on itself, and log every ruling in .council/."],
      ["Falsifier", "a", "Cheapest test: five blind A/B comparisons against single prompts, on real repository decisions."],
    ],
  };

  const ICONS = {
    github:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.53 1.03 1.53 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10Z"/></svg>',
    live:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  };

  const sheet = {
    root: $("#sheet"),
    panel: $(".sheet-panel"),
    body: $("#sheetBody"),
    crumb: $("#sheetCrumb"),
    prev: $("#sheetPrev"),
    next: $("#sheetNext"),
    current: null,
    opener: null,
    fromPage: false,
    closeTimer: 0,
  };
  const main = $("main");

  function section(title, inner) {
    return `<section class="detail-section"><h3>${title}</h3><div>${inner}</div></section>`;
  }

  function segLab(key) {
    const lab = LABS[key];
    const first = lab.options[0][0];
    return `
      <div class="lab" data-lab="${key}" style="--lab-accent: ${lab.accent}">
        <div class="lab-row">
          <p class="lab-label">${lab.label}</p>
          <div class="seg" role="group" aria-label="${lab.label}">
            ${lab.options.map(([id, label]) => `<button type="button" data-choice="${id}" aria-pressed="${id === first}">${label}</button>`).join("")}
          </div>
        </div>
        <div class="lab-out">
          ${lab.keys.map(([id, label]) => `<div><p class="lab-val" data-out="${id}">${lab.data[first][id]}</p><p class="lab-key">${label}</p></div>`).join("")}
        </div>
        <p class="lab-note">${lab.note}</p>
      </div>`;
  }

  function solarLab() {
    return `
      <div class="lab" data-lab="solar" style="--lab-accent: #e8930c">
        <div class="lab-row">
          <label class="lab-label" for="labRoof">Roof area</label>
          <p class="lab-readout" data-out="area">245 m²</p>
        </div>
        <input class="lab-range" id="labRoof" type="range" min="60" max="600" step="5" value="245" />
        <div class="lab-out">
          <div><p class="lab-val" data-out="kwp">14.3 kWp</p><p class="lab-key">Capacity</p></div>
          <div><p class="lab-val" data-out="kwh">19,840 kWh</p><p class="lab-key">Energy in the first year</p></div>
          <div><p class="lab-val" data-out="save">Rp 12.1M</p><p class="lab-key">Saved each year</p></div>
          <div><p class="lab-val" data-out="co2">14.1 t</p><p class="lab-key">CO₂ avoided each year</p></div>
        </div>
        <p class="lab-note">Scaled from a real 245 m² roof in Kota Bengkulu. PetaSurya works out every roof on its own.</p>
      </div>`;
  }

  function councilLab() {
    const roles = [["believer", "Believer"], ["skeptic", "Skeptic"], ["investor", "Investor"], ["judge", "Judge"]];
    return `
      <div class="lab" data-lab="council">
        <div class="lab-row">
          <p class="lab-label">Role</p>
          <div class="seg" role="group" aria-label="Role">
            ${roles.map(([id, label], i) => `<button type="button" data-choice="${id}" aria-pressed="${i === 0}">${label}</button>`).join("")}
          </div>
        </div>
        <div class="lab-claims" data-out="claims">${claimsHtml("believer")}</div>
        <p class="lab-note">From the logged ruling on whether to build agent-council itself.</p>
      </div>`;
  }

  // "14.3 kWp" becomes a large figure with a small unit; "Rp 12.1M" keeps its prefix small.
  // Plain figures count up when they come into view.
  function numberHtml(value) {
    const figure = (s) => (/^[\d,.]+[+M]?$/.test(s) ? `<span class="num" data-to="${s}">${s}</span>` : s);
    const [head, ...rest] = value.split(" ");
    const tail = rest.join(" ");
    if (!tail) return figure(value);
    return /\d/.test(head) ? `${figure(head)}<small>${tail}</small>` : `<small>${head}</small>${figure(tail)}`;
  }

  function countUp(el) {
    const final = el.dataset.to;
    const [, digits, suffix] = final.match(/^([\d,.]+)(.*)$/);
    const target = parseFloat(digits.replace(/,/g, ""));
    const decimals = (digits.split(".")[1] || "").length;
    const grouped = digits.includes(",");
    if (prefersStill() || !target) return;
    const format = (v) =>
      (grouped
        ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals)) + suffix;
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / 1400, 0, 1);
      el.textContent = t < 1 ? format(target * easeOut(t)) : final;
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = format(0);
    requestAnimationFrame(step);
  }

  function claimsHtml(role) {
    return COUNCIL_CLAIMS[role]
      .map(([tier, cls, line]) => `<div class="claim"><span class="tier tier-${cls}">${tier}</span><p class="claim-text">${line}</p></div>`)
      .join("");
  }

  function renderProject(p) {
    const i = PROJECTS.indexOf(p);
    const prev = PROJECTS[(i - 1 + PROJECTS.length) % PROJECTS.length];
    const next = PROJECTS[(i + 1) % PROJECTS.length];
    const lab = p.lab === "solar" ? solarLab() : p.lab === "council" ? councilLab() : p.lab ? segLab(p.lab) : "";

    sheet.crumb.textContent = p.name;
    sheet.prev.href = `#/${prev.slug}`;
    sheet.prev.textContent = `Previous`;
    sheet.prev.setAttribute("aria-label", `Previous project: ${prev.name}`);
    sheet.prev.dataset.step = "";
    sheet.next.href = `#/${next.slug}`;
    sheet.next.setAttribute("aria-label", `Next project: ${next.name}`);
    sheet.next.dataset.step = "";

    sheet.body.innerHTML = `
      <header class="detail-head">
        <img class="detail-icon" src="${p.icon}" alt="" width="60" height="60" />
        <h2 class="detail-name" id="sheetTitle" data-rise>${p.name}</h2>
        <p class="detail-summary">${p.summary}</p>
        <dl class="detail-facts">${p.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        <div class="detail-links">
          ${p.links
            .map((l) => `<a class="link-btn${l.primary ? " link-btn-primary" : ""}" href="${l.href}" target="_blank" rel="noopener" data-magnet>${ICONS[l.kind]}<span>${l.label}</span></a>`)
            .join("")}
        </div>
      </header>
      <button type="button" class="detail-lead" data-zoom="${p.lead.src}" data-caption="${p.lead.caption}" data-alt="${p.lead.alt}" style="--ratio: ${p.lead.ratio}" aria-label="Enlarge screenshot: ${p.lead.alt}">
        <img src="${p.lead.src}" alt="${p.lead.alt}" />
      </button>
      ${section("What it is", `<div class="detail-prose">${p.about.map((t) => `<p>${t}</p>`).join("")}</div>`)}
      ${p.numbers ? section("In numbers", `<div class="detail-numbers">${p.numbers.map(([v, l]) => `<div><p class="number-value">${numberHtml(v)}</p><p class="number-label">${l}</p></div>`).join("")}</div>`) : ""}
      ${section("How it works", `<ol class="detail-steps">${p.steps.map(([t, d], n) => `<li><span class="step-n">${pad2(n + 1)}</span><div><p class="step-title">${t}</p><p class="step-text">${d}</p></div></li>`).join("")}</ol>`)}
      ${lab ? section("Try it", lab) : ""}
      ${p.tags ? section("Tags", `<ul class="tag-list">${p.tags.map((t) => `<li>${t}</li>`).join("")}</ul>`) : ""}
      ${section(
        "Screens",
        `<div class="detail-gallery${p.shots.length === 1 ? " is-single" : ""}">${p.shots
          .map(
            (s) => `<figure class="shot"><button type="button" class="shot-frame${s.fit === "contain" ? " is-contain" : ""}" data-zoom="${s.src}" data-caption="${s.caption}" data-alt="${s.alt}" aria-label="Enlarge screenshot: ${s.alt}"><img src="${s.src}" alt="${s.alt}" loading="lazy" /></button><figcaption>${s.caption}</figcaption></figure>`
          )
          .join("")}</div>`
      )}
      ${section("Built with", `<ul class="stack-list">${p.stack.map((s) => `<li>${s}</li>`).join("")}</ul>`)}
      <a class="detail-next" href="#/${next.slug}" data-step><small>Next project</small><strong data-rise>${next.name}</strong></a>
    `;
    bindLabs();
  }

  // The sheet's own reveals scroll with its panel, so they get their own observer.
  let sheetReveal = null;

  function animateSheet() {
    sheetReveal?.disconnect();
    if (prefersStill()) return;
    $$("[data-rise]", sheet.body).forEach((el) => {
      splitRise(el);
      el.classList.add("will-rise");
    });
    $$(".detail-head > :not([data-rise])", sheet.body).forEach((el, n) => {
      el.classList.add("reveal");
      el.style.setProperty("--d", `${0.16 + n * 0.07}s`);
    });
    $$(".detail-lead, .detail-section, .detail-next", sheet.body).forEach((el) => el.classList.add("reveal"));
    sheetReveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          sheetReveal.unobserve(entry.target);
          $$(".num", entry.target).forEach(countUp);
        });
      },
      { root: sheet.panel, rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );
    $$(".will-rise, .reveal", sheet.body).forEach((el) => sheetReveal.observe(el));
  }

  function bindLabs() {
    const solar = $('[data-lab="solar"]', sheet.body);
    if (solar) {
      const input = $("input", solar);
      const out = (key) => $(`[data-out="${key}"]`, solar);
      input.addEventListener("input", () => {
        const area = Number(input.value);
        const k = area / 245;
        out("area").textContent = `${area} m²`;
        out("kwp").textContent = `${(14.3 * k).toFixed(1)} kWp`;
        out("kwh").textContent = `${Math.round(19840 * k).toLocaleString("en-US")} kWh`;
        out("save").textContent = formatRupiah(12.1e6 * k);
        out("co2").textContent = `${(14.1 * k).toFixed(1)} t`;
      });
    }
    $$(".lab .seg", sheet.body).forEach((group) => {
      const lab = group.closest(".lab");
      group.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-choice]");
        if (!btn) return;
        $$("[data-choice]", group).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        const key = lab.dataset.lab;
        if (key === "council") {
          $('[data-out="claims"]', lab).innerHTML = claimsHtml(btn.dataset.choice);
          return;
        }
        const data = LABS[key].data[btn.dataset.choice];
        Object.keys(data).forEach((k) => {
          const el = $(`[data-out="${k}"]`, lab);
          if (el) el.textContent = data[k];
        });
      });
    });
  }

  function showProject(p) {
    const wasOpen = Boolean(sheet.current);
    sheet.current = p;
    renderProject(p);
    document.title = `${p.name} | Astro`;
    if (!wasOpen) {
      clearTimeout(sheet.closeTimer);
      if (!sheet.opener) sheet.opener = document.activeElement;
      main.style.transformOrigin = `50% ${Math.round(window.scrollY + window.innerHeight / 2)}px`;
      sheet.root.hidden = false;
      root.classList.add("is-locked");
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.root.classList.add("is-open")));
    }
    animateSheet();
    $$(".detail-name, .detail-next strong", sheet.body).forEach((el) => {
      kernRise(el);
      fitText(el);
    });
    sheet.panel.scrollTop = 0;
    sheet.panel.classList.remove("is-scrolled");
    sheet.panel.focus({ preventScroll: true });
  }

  function hideSheet() {
    if (!sheet.current) return;
    sheet.current = null;
    sheet.root.classList.remove("is-open");
    root.classList.remove("is-locked");
    document.title = "Astro";
    sheet.closeTimer = setTimeout(() => {
      sheet.root.hidden = true;
      sheet.body.innerHTML = "";
    }, prefersStill() ? 0 : 640);
    const opener = sheet.opener;
    sheet.opener = null;
    sheet.fromPage = false;
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  function requestClose() {
    if (!sheet.current) return;
    if (sheet.fromPage) {
      history.back();
    } else {
      history.replaceState(null, "", location.pathname + location.search);
      hideSheet();
    }
  }

  function route() {
    const match = location.hash.match(/^#\/([a-z0-9-]+)$/i);
    const project = match ? PROJECTS.find((p) => p.slug === match[1]) : null;
    if (project) showProject(project);
    else hideSheet();
  }

  function bindSheet() {
    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      if (open) {
        sheet.opener = open;
        sheet.fromPage = true;
      }
    });

    sheet.root.addEventListener("click", (e) => {
      if (e.target.closest("[data-sheet-close]")) {
        e.preventDefault();
        requestClose();
        return;
      }
      const step = e.target.closest("[data-step]");
      if (step) {
        e.preventDefault();
        history.replaceState(null, "", step.getAttribute("href"));
        route();
        return;
      }
      const zoomTarget = e.target.closest("[data-zoom]");
      if (zoomTarget) openZoom(zoomTarget.dataset.zoom, zoomTarget.dataset.caption, zoomTarget.dataset.alt, zoomTarget);
    });

    sheet.panel.addEventListener(
      "scroll",
      () => sheet.panel.classList.toggle("is-scrolled", sheet.panel.scrollTop > 220),
      { passive: true }
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!zoom.root.hidden) closeZoom();
        else if (sheet.current) requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const scope = !zoom.root.hidden ? zoom.root : sheet.current ? sheet.panel : null;
      if (!scope) return;
      const focusable = $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', scope).filter(
        (el) => el.offsetParent !== null
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet.panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    window.addEventListener("hashchange", route);
  }

  // ==========================================================================
  // 8. SCREENSHOT ZOOM
  // ==========================================================================
  const zoom = { root: $("#zoom"), img: $("#zoomImg"), cap: $("#zoomCap"), close: $(".zoom-close"), opener: null };

  function openZoom(src, caption, alt, opener) {
    zoom.opener = opener || document.activeElement;
    zoom.root.classList.remove("is-tall");
    zoom.img.onload = () => zoom.root.classList.toggle("is-tall", zoom.img.naturalHeight / zoom.img.naturalWidth > 1.35);
    zoom.img.alt = alt || "";
    zoom.img.src = src;
    zoom.cap.textContent = caption || "";
    zoom.root.hidden = false;
    zoom.root.scrollTop = 0;
    zoom.close.focus({ preventScroll: true });
  }

  function closeZoom() {
    zoom.root.hidden = true;
    zoom.img.removeAttribute("src");
    if (zoom.opener && document.contains(zoom.opener)) zoom.opener.focus({ preventScroll: true });
    zoom.opener = null;
  }

  zoom.root.addEventListener("click", (e) => {
    if (e.target.closest("[data-zoom-close]") || e.target === zoom.root) closeZoom();
  });

  // ==========================================================================
  // 9. BOOT
  // ==========================================================================
  function setHints() {
    const mode = hoverQuery.matches ? "hover" : "touch";
    $$(".plate-hint").forEach((el) => {
      const text = el.dataset[mode];
      if (text && el.textContent !== text) el.textContent = text;
    });
  }

  // Names are set large on one line; one that would overflow its column shrinks to fit.
  function fitText(el) {
    el.style.removeProperty("font-size");
    const range = document.createRange();
    range.selectNodeContents(el.querySelector(".rise") || el);
    const natural = range.getBoundingClientRect().width;
    const room = el.clientWidth;
    if (room > 0 && natural > room) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.floor((size * room) / natural)}px`;
    }
  }

  function fitNames() {
    $$(".project-name").forEach(fitText);
    if (sheet.current) $$(".detail-name, .detail-next strong", sheet.body).forEach(fitText);
  }

  // ---- Coming into view ----------------------------------------------------
  // A heading is split into letters that rise from the baseline. Screen readers get the
  // unsplit text, which also serves to measure the kerning the split loses.
  function splitRise(el) {
    if (el.querySelector(".rise")) return;
    const text = el.textContent.trim();
    const label = document.createElement("span");
    label.className = "visually-hidden rise-label";
    label.textContent = text;
    const visual = document.createElement("span");
    visual.className = "rise";
    visual.setAttribute("aria-hidden", "true");
    let i = 0;
    text.split(/\s+/).forEach((word, n) => {
      if (n) visual.append(" ");
      const w = document.createElement("span");
      w.className = "rise-word";
      for (const ch of word) {
        const letter = document.createElement("span");
        letter.className = "rl";
        letter.style.setProperty("--i", i++);
        letter.textContent = ch;
        w.appendChild(letter);
      }
      visual.appendChild(w);
    });
    el.replaceChildren(label, visual);
  }

  function kernRise(el) {
    const text = el.querySelector(".rise-label")?.firstChild;
    const letters = $$(".rl", el);
    if (!text || !letters.length) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    const range = document.createRange();
    const left = (k) => {
      range.setStart(text, k);
      range.setEnd(text, k + 1);
      return range.getBoundingClientRect().left;
    };
    const chars = text.data;
    let j = 0;
    for (let k = 0; k < chars.length && j < letters.length; k++) {
      if (/\s/.test(chars[k])) continue;
      const letter = letters[j++];
      letter.style.removeProperty("margin-right");
      if (k + 1 >= chars.length || /\s/.test(chars[k + 1])) continue;
      const kern = left(k + 1) - left(k) - letter.getBoundingClientRect().width;
      if (Math.abs(kern) > 0.25) letter.style.marginRight = `${(kern / size).toFixed(4)}em`;
    }
  }

  const REVEALS = [
    ".section-lede",
    ".project-line",
    ".project-actions",
    ".about-lead",
    ".about-text",
    ".about-aside",
    ".about-stack > div",
    ".open-pill",
    ".contact-lede",
    ".contact-facts",
    ".note-scene",
    ".contact-links li",
  ].join(", ");

  function bootReveals() {
    if (prefersStill()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    $$("[data-rise]", main).forEach((el) => {
      splitRise(el);
      el.classList.add("will-rise");
      observer.observe(el);
    });
    $$(".plate").forEach((el) => {
      el.classList.add("will-lift");
      observer.observe(el);
    });
    // Siblings arrive one after another.
    $$(REVEALS).forEach((el) => {
      const n = Array.from(el.parentElement.children)
        .filter((c) => c.matches(REVEALS))
        .indexOf(el);
      el.classList.add("reveal");
      el.style.setProperty("--d", `${0.12 + n * 0.08}s`);
      observer.observe(el);
    });
  }

  // ---- The masthead: a pill that follows the section in view, tucked away while reading down
  const masthead = {
    el: $("#masthead"),
    glider: $(".nav-glider"),
    links: $$("[data-nav]"),
    current: null,
  };

  function glideTo(link) {
    const { glider } = masthead;
    masthead.current = link;
    const show = Boolean(link) && !link.classList.contains("nav-cta");
    if (show) {
      // Appear in place the first time instead of sliding in from the left.
      if (!glider.classList.contains("is-on")) glider.style.transition = "opacity 0.3s ease";
      glider.style.setProperty("--glide-x", `${link.offsetLeft}px`);
      glider.style.setProperty("--glide-w", `${link.offsetWidth}px`);
      void glider.offsetWidth;
      glider.style.removeProperty("transition");
    }
    glider.classList.toggle("is-on", show);
  }

  function bindMasthead() {
    const sections = masthead.links.map((a) => $(a.getAttribute("href")));
    const inView = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? inView.add(entry.target) : inView.delete(entry.target)));
        const i = sections.findLastIndex((s) => inView.has(s));
        glideTo(i >= 0 ? masthead.links[i] : null);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((s) => s && observer.observe(s));
    masthead.el.addEventListener("focusin", () => masthead.el.classList.remove("is-tucked"));
  }

  function tuckMasthead(y, dy) {
    if (y < 140 || dy < -4) masthead.el.classList.remove("is-tucked");
    else if (dy > 4 && !masthead.el.contains(document.activeElement)) masthead.el.classList.add("is-tucked");
  }

  // ---- Buttons lean toward the pointer ------------------------------------
  function bindMagnets() {
    let active = null;
    const release = () => {
      if (!active) return;
      active.style.removeProperty("--mx");
      active.style.removeProperty("--my");
      active = null;
    };
    document.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse" || prefersStill()) return;
        const el = e.target.closest?.("[data-magnet]") || null;
        if (el !== active) release();
        if (!el) return;
        active = el;
        const r = el.getBoundingClientRect();
        const pull = Number(el.dataset.magnet) || 0.25;
        el.style.setProperty("--mx", `${((e.clientX - r.left - r.width / 2) * pull).toFixed(1)}px`);
        el.style.setProperty("--my", `${((e.clientY - r.top - r.height / 2) * pull).toFixed(1)}px`);
      },
      { passive: true }
    );
    document.documentElement.addEventListener("pointerleave", release);
  }

  // ---- Contact: a note that goes to /api/contact (api/contact.js) ------------
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Replays a class whose animation should run again, like the sun's nudge.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function bindContact() {
    // The address is put together here so it isn't sitting in the page for scrapers.
    const mail = $(".contact-mail");
    const address = `${mail.dataset.mailUser}@${mail.dataset.mailDomain}`;
    mail.href = `mailto:${address}`;
    mail.textContent = address;

    const scene = $("#noteScene");
    const form = $("#note");
    const phrase = $("#notePhrase");
    const status = $("#noteStatus");
    const fields = { name: form.elements.name, email: form.elements.email, message: form.elements.message };
    const opened = performance.now();
    let tried = false;
    let busy = false;

    const problems = () => {
      const errors = {};
      const email = fields.email.value.trim();
      if (!fields.name.value.trim()) errors.name = "Add your name.";
      if (!email) errors.email = "Add an email I can reply to.";
      else if (!EMAIL.test(email)) errors.email = "That email looks incomplete.";
      if (!fields.message.value.trim()) errors.message = "Write a few words about it.";
      return errors;
    };

    const showProblems = (errors) => {
      Object.entries(fields).forEach(([key, input]) => {
        const text = errors[key] || "";
        input.closest(".field").classList.toggle("is-invalid", Boolean(text));
        input.setAttribute("aria-invalid", String(Boolean(text)));
        $(`#${input.id}Error`).textContent = text;
      });
    };

    const say = (html, isError = false) => {
      status.innerHTML = html;
      status.classList.toggle("is-error", isError);
    };

    // The sun rises with the note: a name, a reply address, then the message as it grows.
    const rise = () => {
      const filled =
        (fields.name.value.trim() ? 1 : 0) +
        (EMAIL.test(fields.email.value.trim()) ? 1 : 0) +
        Math.min(1, fields.message.value.trim().length / 80);
      scene.style.setProperty("--rise", (filled / 3).toFixed(3));
    };

    // Each topic has its own line, and its own question in the message box.
    const setTopic = (input) => {
      phrase.replaceChildren(
        ...input.dataset.phrase.split(" ").flatMap((word, i) => {
          const span = document.createElement("span");
          span.className = "w";
          span.style.setProperty("--i", i);
          span.textContent = word;
          return i ? [" ", span] : [span];
        })
      );
      fields.message.placeholder = input.dataset.ask;
      replay(scene, "is-nudged");
    };

    form.addEventListener("change", (e) => {
      if (e.target.name === "topic") setTopic(e.target);
    });

    form.addEventListener("input", () => {
      scene.classList.remove("is-sent");
      rise();
      if (tried) showProblems(problems());
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      tried = true;
      const errors = problems();
      showProblems(errors);
      const first = Object.keys(errors)[0];
      if (first) {
        fields[first].focus();
        return;
      }

      busy = true;
      form.classList.add("is-busy");
      say("Sending…");
      const data = Object.fromEntries(new FormData(form));
      data.elapsed = Math.round(performance.now() - opened);
      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.ok) {
          const to = fields.email.value.trim();
          fields.message.value = "";
          scene.style.setProperty("--rise", "1");
          replay(scene, "is-sent");
          say("");
          status.textContent = `Sent. I'll write back to ${to}.`;
        } else if (result.errors) {
          showProblems(result.errors);
          say("");
        } else {
          throw new Error(result.error || `HTTP ${response.status}`);
        }
      } catch (err) {
        say(`Couldn't send it just now. Email me at <a href="mailto:${address}">${address}</a> instead.`, true);
      } finally {
        busy = false;
        form.classList.remove("is-busy");
      }
    });

    rise();
  }

  function renderLocalTime() {
    const { rise, set } = clock.events;
    const now = clock.nowMinutes;
    $("#localTime").textContent = formatClock(now);
    $("#localSky").textContent = now >= rise && now < set ? ", and the sun is up." : now < rise ? ", before sunrise." : ", after sunset.";
  }

  // ---- The marquee: a steady drift that scrolling pushes either way ---------
  const marquee = { band: $(".marquee"), x: 0, w: 0, push: 0, visible: false, frame: 0, last: 0 };

  function bindMarquee() {
    const { band } = marquee;
    const track = $(".marquee-track", band);
    const group = $(".marquee-group", track);

    const fill = () => {
      marquee.w = group.offsetWidth;
      if (!marquee.w) return;
      const copies = Math.ceil(band.clientWidth / marquee.w) + 1;
      while (track.children.length < copies) track.appendChild(group.cloneNode(true));
    };

    const frame = (now) => {
      marquee.frame = 0;
      const dt = marquee.last ? Math.min(0.05, (now - marquee.last) / 1000) : 0;
      marquee.last = now;
      marquee.x -= (70 + marquee.push) * dt;
      marquee.push *= Math.exp(-dt * 2.5);
      if (marquee.w) marquee.x = ((marquee.x % marquee.w) - marquee.w) % marquee.w;
      track.style.transform = `translate3d(${marquee.x.toFixed(2)}px, 0, 0)`;
      if (marquee.visible && !prefersStill()) marquee.frame = requestAnimationFrame(frame);
    };

    marquee.start = () => {
      if (marquee.frame || !marquee.visible || prefersStill()) return;
      marquee.last = 0;
      marquee.frame = requestAnimationFrame(frame);
    };

    new IntersectionObserver(([entry]) => {
      marquee.visible = entry.isIntersecting;
      marquee.start();
    }).observe(band);
    new ResizeObserver(fill).observe(band);
    document.fonts?.ready.then(fill);
  }

  // ---- One scroll listener for everything that follows the page ------------
  function bindScroll() {
    let lastY = window.scrollY;
    let queued = false;
    let lastScroll = -1;
    const update = () => {
      queued = false;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (opening.playing && y > 4) endOpening();
      // The hero's layers drift apart as it scrolls away (see .sky and .ground).
      const scroll = prefersStill() ? 0 : Math.round(Math.min(y, hero.h));
      if (scroll !== lastScroll) {
        lastScroll = scroll;
        hero.el.style.setProperty("--scroll", scroll);
      }
      tuckMasthead(y, dy);
      if (marquee.visible) marquee.push = clamp(marquee.push + dy * 6, -900, 900);
    };
    window.addEventListener(
      "scroll",
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );
    new IntersectionObserver(([entry]) => {
      sky.visible = entry.isIntersecting;
      kickSky();
    }).observe(hero.el);
  }

  function bootPlates() {
    const factories = { city: createCityPlate, rain: createRainPlate, field: createFieldPlate, figlo: createFigloPlate, council: createCouncilPlate };
    const plates = [];
    $$("[data-plate]").forEach((el) => {
      const make = factories[el.dataset.plate];
      if (!make) return;
      const api = make(el);
      plates.push({ el, api });
      clock.listeners.push((L) => api.onLight(L));
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const p = plates.find((x) => x.el === entry.target);
          if (p) p.api.setVisible(entry.isIntersecting, entry.intersectionRatio);
        });
      },
      { threshold: [0, 0.35, 0.6] }
    );
    const sizer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const p = plates.find((x) => x.el === entry.target);
        if (p) p.api.resize();
      });
    });
    plates.forEach((p) => {
      observer.observe(p.el);
      sizer.observe(p.el);
    });
  }

  function boot() {
    splitWords();
    bindDial();
    bindSheet();
    setHints();
    hoverQuery.addEventListener?.("change", setHints);

    const now = yogyakartaNow();
    clock.dayKey = now.key;
    clock.midnight = now.midnight;
    clock.events = computeEvents(now.midnight);
    clock.nowMinutes = now.minutes;
    clock.minutes = now.minutes;
    setupOpening();
    paintDayBand();
    layoutHero();
    renderLight();
    // Settle on the first light without the theme's colour fades, then let them run.
    getComputedStyle(root).getPropertyValue("--bg");
    root.classList.remove("is-booting");

    bootReveals();
    bindMasthead();
    bindMagnets();
    bindContact();
    bindMarquee();
    bindScroll();
    renderLocalTime();

    const fontsReady = document.fonts
      ? Promise.race([
          document.fonts.load('860 100px "Archivo"').then(() => document.fonts.ready),
          new Promise((r) => setTimeout(r, 2500)),
        ]).catch(() => {})
      : Promise.resolve();
    fitNames();
    fontsReady.then(() => {
      $$(".will-rise").forEach(kernRise);
      fitNames();
      layoutHero();
      renderLight();
      glideTo(masthead.current);
      hero.monument.classList.add("is-measured");
      requestAnimationFrame(() => (opening.playing ? playOpening() : showPage()));
    });

    let resizeFrame = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        fitNames();
        layoutHero();
        renderLight();
        glideTo(masthead.current);
      });
    });

    setInterval(() => {
      if (!document.hidden) syncToNow();
    }, 20000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncToNow();
    });

    bootPlates();
    route();
  }

  boot();
})();
