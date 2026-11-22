/* Hunt Access NZ — "Find animals" habitat model.
   Scores the current view for one species using its behaviour profile (behaviour.js) against
   LINZ terrain (elevation, slope, aspect, landform), LINZ topo vegetation, water, tracks and buildings,
   sun position, wind, DOC hunting areas, and the user's own hunt log. Works offline when the area
   was saved with Topo + Terrain. A guide to where to look, not a guarantee. */
(() => {
'use strict';
const A = window.HuntMap, B = window.BEHAVIOUR || {}, VT = window.VT;
if (!A || !VT) return;
const { map, state, actions, LS, showSheet, closeSheet, toast, demTile, sunTimes, BM, distM, bearing, compass, fmtDist, fmtTime, esc, fetchT, online, setNav, mkCanvas } = A;
const rad = Math.PI / 180, Z = 13, TS = 256, WORLD = TS * 2 ** Z, MAXC = 360, MAXPX = 2048;
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lng2w = lng => (lng + 180) / 360 * WORLD;
const lat2w = lat => (1 - Math.log(Math.tan(lat * rad) + 1 / Math.cos(lat * rad)) / Math.PI) / 2 * WORLD;
const w2lng = x => x / WORLD * 360 - 180;
const w2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / WORLD))) / rad;
const VEG = ['open', 'scatter', 'scrub', 'native', 'exotic', 'swamp', 'rock', 'ice', 'water', 'sand'];
const VEG_TXT = { open: 'open grass or tussock', scatter: 'scattered scrub', scrub: 'scrub', native: 'native forest', exotic: 'exotic forest', swamp: 'wetland', rock: 'scree or rock', ice: 'ice or snow', water: 'water', sand: 'sand' };

/* ---------- sun ---------- */
function sunPos(date, lat, lng) {
  const d = date.valueOf() / 864e5 - 0.5 + 2440588 - 2451545, e = rad * 23.4397, lw = rad * -lng, phi = rad * lat;
  const M = rad * (357.5291 + 0.98560028 * d), C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI, dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = rad * (280.16 + 360.9856235 * d) - lw - ra;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / rad + 180;
  return { alt: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / rad, az: (az + 360) % 360, dec: dec / rad };
}
const seasonOf = d => { const m = d.getMonth() + 1; return m === 12 || m <= 2 ? 'summer' : m <= 5 ? 'autumn' : m <= 8 ? 'winter' : 'spring'; };
function inRut(p, d) {
  if (!p.rut) return false; const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= p.rut.from[0] * 100 + p.rut.from[1] && md <= p.rut.to[0] * 100 + p.rut.to[1];
}
function periodOf(t, lat, lng) {
  const st = sunTimes(t, lat, lng), tw = sunTimes(t, lat, lng, -6) || st; if (!st) return 'day';
  const h = 36e5, x = t.getTime();
  if (x < tw.rise.getTime() - h / 2 || x > tw.set.getTime() + h / 2) return 'night';
  if (x < st.rise.getTime() + 2.5 * h) return 'dawn';
  if (x > st.set.getTime() - 2.5 * h) return 'dusk';
  return 'day';
}
function timeFor(when, dateStr, lat, lng) {
  if (when === 'now') return new Date();
  const d = new Date(dateStr + 'T12:00:00+12:00'), st = sunTimes(d, lat, lng); if (!st) return d;
  const r = st.rise.getTime(), s = st.set.getTime();
  return new Date(when === 'dawn' ? r + 30 * 6e4 : when === 'dusk' ? s - 45 * 6e4 : when === 'night' ? s + 3 * 36e5 : (r + s) / 2);
}
const PERIOD_TXT = { dawn: 'first light and early morning', day: 'the middle of the day', dusk: 'late afternoon to last light', night: 'night' };

/* ---------- helpers ---------- */
function fcsFor(id, bb) {
  const out = []; let covered = false;
  const L = state.loaded[id];
  const inside = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
  const hits = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  if (L && L.fc && L.bbox && hits(L.bbox, bb)) { out.push(L.fc); if (inside(L.bbox, bb)) covered = true; }
  for (const a of state.areas || []) if (a.data && a.data[id] && hits(a.bbox, bb)) { out.push(a.data[id]); if (inside(a.bbox, bb)) covered = true; }
  return { fcs: out, covered };
}
function chamfer(mask, W, H, cellM) {
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) { v = Math.min(v, d[i - W] + a); if (x > 0) v = Math.min(v, d[i - W - 1] + b); if (x < W - 1) v = Math.min(v, d[i - W + 1] + b); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + a);
    if (y < H - 1) { v = Math.min(v, d[i + W] + a); if (x < W - 1) v = Math.min(v, d[i + W + 1] + b); if (x > 0) v = Math.min(v, d[i + W - 1] + b); }
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i] >= INF ? 1e6 : d[i] * cellM;
  return d;
}
function boxMean(src, W, H, r) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += src[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    out[y * W + x] = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}
const pct = (arr, p) => { const a = Array.from(arr).filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0; };
const trap = (v, t) => v <= t[0] || v >= t[3] ? 0 : v < t[1] ? (v - t[0]) / (t[1] - t[0] || 1) : v <= t[2] ? 1 : (t[3] - v) / (t[3] - t[2] || 1);
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

/* ---------- inputs ---------- */
function gridFor(bb) {
  const b = bb ? { getWest: () => bb[0], getSouth: () => bb[1], getEast: () => bb[2], getNorth: () => bb[3] } : map.getBounds();
  let x0 = lng2w(b.getWest()), x1 = lng2w(b.getEast()), y0 = lat2w(b.getNorth()), y1 = lat2w(b.getSouth());
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, crop = (x1 - x0 > MAXPX || y1 - y0 > MAXPX);
  if (x1 - x0 > MAXPX) { x0 = cx - MAXPX / 2; x1 = cx + MAXPX / 2; }
  if (y1 - y0 > MAXPX) { y0 = cy - MAXPX / 2; y1 = cy + MAXPX / 2; }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const s = Math.max(1, Math.ceil(Math.max(x1 - x0, y1 - y0) / MAXC)), W = Math.ceil((x1 - x0) / s), H = Math.ceil((y1 - y0) / s);
  const lat = w2lat(cy), cellM = s * 40075016.7 * Math.cos(lat * rad) / WORLD;
  return { x0, y0, s, W, H, cellM, crop, bbox: [w2lng(x0), w2lat(y0 + H * s), w2lng(x0 + W * s), w2lat(y0)], centre: [w2lng(cx), w2lat(cy)] };
}
async function loadDem(G, prog) {
  const E = new Float32Array(G.W * G.H).fill(NaN);
  const tx0 = Math.floor(G.x0 / TS), tx1 = Math.floor((G.x0 + G.W * G.s - 1) / TS), ty0 = Math.floor(G.y0 / TS), ty1 = Math.floor((G.y0 + G.H * G.s - 1) / TS);
  const tiles = []; for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) tiles.push([x, y]);
  const got = new Map(); let done = 0, fail = 0;
  await pool(tiles, 6, async ([x, y]) => { try { got.set(x + '/' + y, await demTile(Z, x, y)); } catch { fail++; } prog(0.05 + 0.3 * (++done / tiles.length), 'Reading terrain…'); });
  if (fail > tiles.length * 0.25) throw new Error('terrain');
  for (let j = 0; j < G.H; j++) for (let i = 0; i < G.W; i++) {
    const gx = G.x0 + (i + 0.5) * G.s, gy = G.y0 + (j + 0.5) * G.s, tx = Math.floor(gx / TS), ty = Math.floor(gy / TS), t = got.get(tx + '/' + ty);
    if (!t) continue; const u = Math.min(t.n - 1, Math.floor((gx - tx * TS) / TS * t.n)), v = Math.min(t.n - 1, Math.floor((gy - ty * TS) / TS * t.n));
    const h = t.h[v * t.n + u]; if (h > -500) E[j * G.W + i] = h;
  }
  // fill small gaps
  for (let k = 0; k < 2; k++) for (let i = 0; i < E.length; i++) if (!Number.isFinite(E[i])) { const n = [E[i - 1], E[i + 1], E[i - G.W], E[i + G.W]].filter(Number.isFinite); if (n.length) E[i] = n.reduce((a, b) => a + b) / n.length; }
  return E;
}
async function loadVector(G, prog) {
  const span = Math.max(G.W, G.H) * G.s, vz = span / TS * 2 <= 8 ? 14 : 13, k = 2 ** (vz - Z);
  const tpl = `${BM}/v1/tiles/topographic-v2/WebMercatorQuad/{z}/{x}/{y}.pbf?api=${state.key}`;
  const tx0 = Math.floor(G.x0 * k / TS), tx1 = Math.floor((G.x0 + G.W * G.s - 1) * k / TS), ty0 = Math.floor(G.y0 * k / TS), ty1 = Math.floor((G.y0 + G.H * G.s - 1) * k / TS);
  const tiles = []; for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) tiles.push([x, y]);
  const cv = () => { const c = mkCanvas(G.W, G.H), g = c.getContext('2d', { willReadFrequently: true }); return { c, g }; };
  const C = { veg: cv(), water: cv(), road: cv(), track: cv(), slip: cv(), cliff: cv() };
  C.veg.g.fillStyle = 'rgb(10,0,0)'; C.veg.g.fillRect(0, 0, G.W, G.H);
  const groups = {}; VEG.forEach(v => { groups[v] = []; });
  const lines = { water: [], road: [], track: [], slip: [], cliff: [] }, polysDist = [];
  let done = 0, fail = 0;
  await pool(tiles, 6, async ([x, y]) => {
    try {
      const r = await fetchT(tpl.replace('{z}', vz).replace('{x}', x).replace('{y}', y), 20000); if (!r.ok) throw 0;
      const vt = new VT.VectorTile(new VT.Pbf(new Uint8Array(await r.arrayBuffer())));
      const each = (name, fn) => { const L = vt.layers[name]; if (!L) return; for (let i = 0; i < L.length; i++) { const f = L.feature(i); fn(f, f.properties, L.extent); } };
      const geo = (f, ext) => f.loadGeometry().map(ring => ring.map(p => [(((x + p.x / ext) * TS / k) - G.x0) / G.s, (((y + p.y / ext) * TS / k) - G.y0) / G.s]));
      each('land', (f, p, ext) => {
        let c = null;
        if (f.type === 3) {
          if (p.tree === 'native') c = 'native'; else if (p.tree === 'exotic') c = 'exotic';
          else if (p.kind === 'scrub') c = p.distribution === 'scattered' ? 'scatter' : 'scrub';
          else if (p.kind === 'swamp') c = 'swamp'; else if (/^(scree|shingle|bare_rock|moraine|moraine_wall)$/.test(p.kind)) c = 'rock';
          else if (p.kind === 'ice') c = 'ice'; else if (p.kind === 'sand') c = 'sand';
          else if (/^(residential|landfill|quarry|mine)$/.test(p.kind)) polysDist.push(geo(f, ext));
          if (c) groups[c].push(geo(f, ext));
        } else if (f.type === 2) { if (p.kind === 'slip') lines.slip.push(geo(f, ext)); else if (p.kind === 'cliff') lines.cliff.push(geo(f, ext)); }
      });
      each('water_polygons', (f, p, ext) => { if (f.type === 3) groups.water.push(geo(f, ext)); });
      each('water_lines', (f, p, ext) => { if (f.type === 2 && /^(river|stream|canal|drain)$/.test(p.kind)) lines.water.push(geo(f, ext)); });
      each('streets', (f, p, ext) => { if (f.type === 2) (p.kind === 'track' ? lines.track : lines.road).push(geo(f, ext)); });
      each('buildings', (f, p, ext) => { if (f.type === 3) polysDist.push(geo(f, ext)); });
    } catch { fail++; }
    prog(0.35 + 0.3 * (++done / tiles.length), 'Reading vegetation, water and tracks…');
  });
  if (fail > tiles.length * 0.25) throw new Error('vector');
  const fill = (g, rings) => { g.beginPath(); for (const r of rings) { r.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); } g.fill('evenodd'); };
  const stroke = (g, rings) => { g.beginPath(); for (const r of rings) r.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
  for (const v of ['scatter', 'scrub', 'exotic', 'native', 'swamp', 'rock', 'sand', 'ice', 'water']) { C.veg.g.fillStyle = `rgb(${10 + VEG.indexOf(v) * 25},0,0)`; groups[v].forEach(r => fill(C.veg.g, r)); }
  for (const [k2, arr] of Object.entries(lines)) { const g = C[k2].g; g.strokeStyle = '#fff'; g.lineWidth = 1.2; arr.forEach(r => stroke(g, r)); }
  C.water.g.fillStyle = '#fff'; groups.water.forEach(r => fill(C.water.g, r));
  C.road.g.fillStyle = '#fff'; polysDist.forEach(r => fill(C.road.g, r));
  const N = G.W * G.H, veg = new Uint8Array(N), rd = C.veg.g.getImageData(0, 0, G.W, G.H).data;
  for (let i = 0; i < N; i++) veg[i] = clamp(Math.round((rd[i * 4] - 10) / 25), 0, 9);
  const mask = k2 => { const d = C[k2].g.getImageData(0, 0, G.W, G.H).data, m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = d[i * 4 + 3] > 60 ? 1 : 0; return m; };
  return { veg, water: mask('water'), road: mask('road'), track: mask('track'), slip: mask('slip'), cliff: mask('cliff') };
}
function rasterFC(G, fcs, keep) {
  const g = mkCanvas(G.W, G.H).getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; let n = 0;
  const proj = ring => ring.map(p => [(lng2w(p[0]) - G.x0) / G.s, (lat2w(p[1]) - G.y0) / G.s]);
  for (const fc of fcs) for (const f of fc.features || []) {
    if (!f.geometry || (keep && !keep(f.properties || {}))) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) { g.beginPath(); for (const r of poly.map(proj)) { r.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); } g.fill('evenodd'); n++; }
  }
  const d = g.getImageData(0, 0, G.W, G.H).data, m = new Uint8Array(G.W * G.H); let on = 0;
  for (let i = 0; i < m.length; i++) if (d[i * 4 + 3] > 127) { m[i] = 1; on++; }
  return { m, on, n };
}
async function windFor(p, t, mode) {
  if (mode === 'calm') return { from: null, spd: 0, src: 'calm (set by you)' };
  if (mode !== 'auto') { const [dir, spd] = mode.split('@').map(Number); return { from: dir, spd, src: 'set by you' }; }
  const lw = A.getWind();
  const pick = H => { let best = -1, bd = Infinity; H.time.forEach((x, i) => { const dd = Math.abs(new Date(x) - t); if (dd < bd) { bd = dd; best = i; } }); return bd < 3 * 36e5 ? best : -1; };
  if (lw && distM(lw.p, p) < 30000) { const i = pick(lw.H); if (i >= 0) return { from: lw.H.wind_direction_10m[i], spd: lw.H.wind_speed_10m[i], src: 'Open-Meteo forecast' }; }
  if (!online()) return { from: null, spd: 0, src: 'unknown (offline): assumed calm' };
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(4)}&longitude=${p[0].toFixed(4)}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation_probability&timezone=Pacific%2FAuckland&forecast_days=7&wind_speed_unit=kmh`;
    const j = await (await fetchT(u, 12000)).json(); A.setWind({ p, H: j.hourly });
    const i = pick(j.hourly); if (i >= 0) return { from: j.hourly.wind_direction_10m[i], spd: j.hourly.wind_speed_10m[i], src: 'Open-Meteo forecast' };
  } catch {}
  return { from: null, spd: 0, src: 'forecast unavailable: assumed calm' };
}

/* ---------- the model ---------- */
/* Terrain, cover and distance grids for an area. Expensive, so the last one is kept: re-scoring the same
   area for another time of day or species reuses it. */
let prepCache = null;
async function prepare(G, prog) {
  const N = G.W * G.H;
  const E = await loadDem(G, prog);
  if (E.every(v => !Number.isFinite(v))) throw new Error('terrain');
  const V = await loadVector(G, prog);
  prog(0.7, 'Working out slope, aspect and landform…');
  const cm = G.cellM, slope = new Float32Array(N), aspect = new Float32Array(N);
  const at = (i, j) => { const v = E[clamp(j, 0, G.H - 1) * G.W + clamp(i, 0, G.W - 1)]; return Number.isFinite(v) ? v : E[j * G.W + i]; };
  for (let j = 0; j < G.H; j++) for (let i = 0; i < G.W; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * cm), dy = (at(i, j + 1) - at(i, j - 1)) / (2 * cm), k = j * G.W + i;
    slope[k] = Number.isFinite(dx + dy) ? Math.atan(Math.hypot(dx, dy)) / rad : 0;
    aspect[k] = (Math.atan2(-dx, dy) / rad + 360) % 360;
  }
  const Ef = E.map(v => Number.isFinite(v) ? v : 0), mean = boxMean(Ef, G.W, G.H, Math.max(2, Math.round(150 / cm)));
  const tpiRaw = new Float32Array(N); for (let i = 0; i < N; i++) tpiRaw[i] = Ef[i] - mean[i];
  const tsd = Math.max(5, Math.sqrt(tpiRaw.reduce((a, v) => a + v * v, 0) / N)), tpi = tpiRaw.map(v => clamp(v / (1.5 * tsd), -1, 1));
  const lo = pct(E, 0.05), hi = Math.max(pct(E, 0.95), lo + 1), epos = E.map(v => clamp((v - lo) / (hi - lo), 0, 1));
  prog(0.78, 'Measuring distance to water, cover and tracks…');
  const cover = v => v === 2 || v === 3 || v === 4, openish = v => v === 0 || v === 1 || v === 5 || v === 6 || v === 9;
  const edgeM = new Uint8Array(N);
  for (let j = 0; j < G.H; j++) for (let i = 0; i < G.W; i++) {
    const k = j * G.W + i, a = V.veg[k];
    for (const n of [i > 0 ? k - 1 : -1, i < G.W - 1 ? k + 1 : -1, j > 0 ? k - G.W : -1, j < G.H - 1 ? k + G.W : -1]) if (n >= 0 && ((cover(a) && openish(V.veg[n])) || (openish(a) && cover(V.veg[n])))) { edgeM[k] = 1; break; }
  }
  const D = { water: chamfer(V.water, G.W, G.H, cm), edge: chamfer(edgeM, G.W, G.H, cm), road: chamfer(V.road, G.W, G.H, cm), track: chamfer(V.track, G.W, G.H, cm), slip: chamfer(V.slip, G.W, G.H, cm), cliff: chamfer(V.cliff, G.W, G.H, cm) };
  const hasEdge = edgeM.some(Boolean), hasWater = V.water.some(Boolean);
  return { E, V, slope, aspect, tpi, epos, D, hasEdge, hasWater };
}
async function run(opt, prog) {
  const sps = (opt.sps || []).filter(k => B[k]); if (!sps.length) throw new Error('species');
  const G = gridFor(opt.bbox), N = G.W * G.H, c = G.centre;
  const t = opt.at ? new Date(opt.at) : timeFor(opt.when, opt.date, c[1], c[0]), season = seasonOf(t), period = periodOf(t, c[1], c[0]);
  await A.loadAreas(G.bbox);
  prog(0.02, 'Checking the wind…');
  const wind = await windFor(c, t, opt.wind);
  const key = [G.x0, G.y0, G.s, G.W, G.H, Math.floor(Date.now() / 18e5)].join();
  if (!prepCache || prepCache.key !== key) prepCache = { key, ...(await prepare(G, prog)) };
  const { E, V, slope, aspect, tpi, epos, D, hasEdge, hasWater } = prepCache, cm = G.cellM;
  // sun: seasonal warmth (noon sun from the north) + sun on the face at the chosen time
  const stt = sunTimes(t, c[1], c[0]), noonT = stt ? new Date((stt.rise.getTime() + stt.set.getTime()) / 2) : t;
  const noon = sunPos(noonT, c[1], c[0]), now = sunPos(t, c[1], c[0]);
  // warmth index: how squarely a face points at the sun (noon sun for the season; current sun when it's up), scaled by steepness
  const warm = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const st = Math.min(1, slope[k] / 20), a = Math.cos((aspect[k] - noon.az) * rad) * st;
    warm[k] = now.alt > 2 ? 0.6 * a + 0.4 * Math.cos((aspect[k] - now.az) * rad) * st : a;
  }
  // masks: DOC hunting areas and DOC distribution data
  const hf = fcsFor('hunt', G.bbox), hm = rasterFC(G, hf.fcs, p => p.HuntStatus !== 'Prohibited');
  prog(0.85, 'Scoring habitat…');
  const huntCovered = hf.covered || hm.on > 0, useMask = opt.mask && hm.on > 0;
  const scoreOne = sp => {
  const P = B[sp], rut = inRut(P, t);
  const pf = fcsFor('sp_' + sp, G.bbox), pm = pf.fcs.length ? rasterFC(G, pf.fcs) : null;
  const wS = Math.max(0, Math.min(1, ((wind.spd || 0) - 8) / 20)), lee = wind.from == null ? null : (wind.from + 180) % 360;
  const F = { feed: {}, bed: {} };
  const shared = { water: new Float32Array(N), disturb: new Float32Array(N), warm: new Float32Array(N), elev: new Float32Array(N), slip: new Float32Array(N), cliff: new Float32Array(N), shelter: new Float32Array(N) };
  const wp = P.warm[season] ?? 0, et = P.elev[season] ?? 0.5;
  for (let k = 0; k < N; k++) {
    shared.water[k] = hasWater ? 0.3 + 0.7 * Math.exp(-D.water[k] / P.water) : 0.6;
    shared.disturb[k] = Math.min(1 - 0.85 * Math.exp(-D.road[k] / P.disturb), 1 - 0.55 * Math.exp(-D.track[k] / (P.disturb * 0.6)));
    shared.warm[k] = clamp(0.55 + 0.45 * wp * warm[k], 0.05, 1);
    shared.elev[k] = clamp(1 - 1.3 * Math.abs(epos[k] - et), 0.05, 1);
    shared.slip[k] = 0.5 + 0.5 * Math.exp(-D.slip[k] / 150);
    shared.cliff[k] = 0.35 + 0.65 * Math.exp(-D.cliff[k] / 200);
    shared.shelter[k] = lee == null ? 1 : clamp(0.55 + 0.45 * Math.cos((aspect[k] - lee) * rad) * Math.min(1, slope[k] / 12) + 0.25 * Math.max(0, -tpi[k]), 0.05, 1);
  }
  for (const m of ['feed', 'bed']) {
    const veg = new Float32Array(N), sl = new Float32Array(N), ed = new Float32Array(N), tp = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      veg[k] = P.veg[m][VEG[V.veg[k]]] ?? 0.3;
      sl[k] = Math.max(0.05, trap(slope[k], P.slope[m]));
      ed[k] = hasEdge ? 0.3 + 0.7 * Math.exp(-D.edge[k] / P.edge[m]) : 0.6;
      tp[k] = clamp(1 - Math.abs(tpi[k] - P.tpi[m]) / 1.6, 0.05, 1);
    }
    F[m] = { veg, slope: sl, edge: ed, tpi: tp, ...shared };
  }
  let fr = (P.schedule[season] || {})[period] ?? 0.5; if (rut) fr = Math.min(1, fr + 0.15);
  const w = { ...P.w }; w.shelter = (w.shelter || 0) * wS * 1.5; if (rut && P.wallow) w.water *= 1.6;
  // learn from the hunt log
  const logs = (state.log || []).filter(e => e.sp === sp).map(e => [Math.floor((lng2w(e.lng) - G.x0) / G.s), Math.floor((lat2w(e.lat) - G.y0) / G.s), e]).filter(([i, j]) => i >= 0 && j >= 0 && i < G.W && j < G.H);
  const calib = [];
  const blend = (name, k) => fr * F.feed[name][k] + (1 - fr) * F.bed[name][k];
  if (logs.length >= 3) {
    for (const name of ['veg', 'slope', 'edge', 'water', 'disturb', 'warm', 'elev', 'tpi']) {
      if (!w[name]) continue; let mA = 0; for (let k = 0; k < N; k += 7) mA += blend(name, k); mA /= Math.ceil(N / 7);
      const mL = logs.reduce((a, [i, j]) => a + blend(name, j * G.W + i), 0) / logs.length;
      const f = clamp(1 + 2 * (mL - mA), 0.6, 1.8); w[name] *= f; if (Math.abs(f - 1) > 0.15) calib.push([name, f]);
    }
  }
  const names = Object.keys(w).filter(n => w[n] > 0), score = new Float32Array(N);
  const sumW = names.reduce((a, n) => a + w[n], 0);
  for (let k = 0; k < N; k++) {
    const vg = VEG[V.veg[k]]; if (vg === 'water' || vg === 'ice' || !Number.isFinite(E[k])) { score[k] = 0; continue; }
    const one = m => { let s = 0; for (const n of names) s += w[n] * Math.log(Math.max(0.03, F[m][n][k])); return Math.exp(s / sumW); };
    score[k] = fr * one('feed') + (1 - fr) * one('bed');
  }
  if (logs.length >= 3) for (let k = 0; k < N; k++) { if (!score[k]) continue; const i = k % G.W, j = (k / G.W) | 0; let b = 0; for (const [li, lj] of logs) b = Math.max(b, Math.exp(-Math.hypot(i - li, j - lj) * cm / 300)); score[k] *= 1 + 0.25 * b; }
  if (useMask) for (let k = 0; k < N; k++) if (!hm.m[k]) score[k] = 0;
  return { sp, P, rut, fr, w, calib, logs: logs.length, score, pres: pm ? { known: pf.covered, frac: pm.on / N } : null };
  };
  // score each species, put them on a common scale (each species' own top ground = 1), keep the best per cell
  const per = sps.map(scoreOne), score = new Float32Array(N), owner = new Uint8Array(N);
  per.forEach((r, n) => {
    const top = Math.max(1e-6, pct(Array.from(r.score).filter(v => v > 0), 0.985));
    for (let k = 0; k < N; k++) { const v = r.score[k] / top; if (v > score[k]) { score[k] = v; owner[k] = n; } }
  });
  return { G, opt, t, season, period, wind, per, score, owner, slope, aspect, E, veg: V.veg, D, useMask, huntCovered };
}

/* ---------- output ---------- */
let R = null, markers = [];
const scale = score => { const vals = Array.from(score).filter(v => v > 0); const p60 = pct(vals, 0.6); return { p60, p98: Math.max(pct(vals, 0.985), p60 + 1e-3) }; };
const heatRGBA = (o, k, x) => { o[k * 4] = 255; o[k * 4 + 1] = Math.round(225 - 190 * x); o[k * 4 + 2] = Math.round(70 - 50 * x); o[k * 4 + 3] = Math.round(60 + 150 * x); };
// top spots: local maxima at least ~400 m apart (max n)
function findSpots(res, n = 6) {
  const { G, score } = res, N = G.W * G.H, { p60 } = scale(score);
  const sm = boxMean(score, G.W, G.H, 1), order = [];
  for (let k = 0; k < N; k++) if (sm[k] > p60) order.push(k);
  order.sort((a, b) => sm[b] - sm[a]);
  const sep = Math.max(400, 6 * G.cellM), spots = [], top = order.length ? sm[order[0]] : 1;
  for (const k of order) {
    const i = k % G.W, j = (k / G.W) | 0;
    if (i < 2 || j < 2 || i > G.W - 3 || j > G.H - 3) continue;
    if (spots.some(s => Math.hypot(s.i - i, s.j - j) * G.cellM < sep)) continue;
    spots.push({ i, j, k, n: res.owner[k], p: [w2lng(G.x0 + (i + 0.5) * G.s), w2lat(G.y0 + (j + 0.5) * G.s)], v: sm[k] / top });
    if (spots.length >= n) break;
  }
  return spots;
}
function draw(res) {
  const { G, score } = res, N = G.W * G.H, { p60, p98 } = scale(score);
  const c = mkCanvas(G.W, G.H), g = c.getContext('2d'), img = g.createImageData(G.W, G.H), o = img.data;
  for (let k = 0; k < N; k++) { const v = (score[k] - p60) / (p98 - p60); if (v > 0) heatRGBA(o, k, Math.min(1, v)); }
  g.putImageData(img, 0, 0);
  toURL(c).then(u => {
    const coords = [[w2lng(G.x0), w2lat(G.y0)], [w2lng(G.x0 + G.W * G.s), w2lat(G.y0)], [w2lng(G.x0 + G.W * G.s), w2lat(G.y0 + G.H * G.s)], [w2lng(G.x0), w2lat(G.y0 + G.H * G.s)]];
    res.img = { url: u, coords }; addLayer();
  });
  res.spots = findSpots(res); drawMarkers();
}
const toURL = c => c.toDataURL ? Promise.resolve(c.toDataURL('image/png')) : c.convertToBlob({ type: 'image/png' }).then(b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }));
/* Stand-alone picture of a result for reports: shaded relief from the DEM, water and tracks, the heat shading,
   numbered top spots and an optional target point. Returns a PNG data URL. */
async function thumb(res, { target = null, spots = 4, size = 360 } = {}) {
  const { G, score, slope, aspect } = res, N = G.W * G.H, V = prepCache && prepCache.V, { p60, p98 } = scale(score);
  const c = mkCanvas(G.W, G.H), g = c.getContext('2d'), img = g.createImageData(G.W, G.H), o = img.data;
  for (let k = 0; k < N; k++) {
    const sh = 0.5 + 0.5 * Math.cos((aspect[k] - 315) * rad) * Math.sin(Math.min(60, slope[k]) * rad * 1.5);   // light from the NW
    let r = 200 * sh + 40, gg = 205 * sh + 40, b = 190 * sh + 40;
    if (V && V.water[k]) { r = 90; gg = 160; b = 230; } else if (V && (V.track[k] || V.road[k])) { r = 70; gg = 60; b = 50; }
    const v = (score[k] - p60) / (p98 - p60);
    if (v > 0) { const x = Math.min(1, v), a = 0.25 + 0.6 * x; r = r * (1 - a) + 255 * a; gg = gg * (1 - a) + (225 - 190 * x) * a; b = b * (1 - a) + (70 - 50 * x) * a; }
    o[k * 4] = r; o[k * 4 + 1] = gg; o[k * 4 + 2] = b; o[k * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const sc = size / Math.max(G.W, G.H), out = mkCanvas(Math.round(G.W * sc), Math.round(G.H * sc)), og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.drawImage(c, 0, 0, out.width, out.height);
  const px = p => [(lng2w(p[0]) - G.x0) / G.s * sc, (lat2w(p[1]) - G.y0) / G.s * sc];
  og.font = 'bold 13px system-ui,sans-serif'; og.textAlign = 'center'; og.textBaseline = 'middle';
  findSpots(res, spots).forEach((s, i) => { const [x, y] = px(s.p); og.fillStyle = '#b91c1c'; og.strokeStyle = '#fff'; og.lineWidth = 2; og.beginPath(); og.arc(x, y, 10, 0, 7); og.fill(); og.stroke(); og.fillStyle = '#fff'; og.fillText(String(i + 1), x, y + 0.5); });
  if (target) { const [x, y] = px(target); og.strokeStyle = '#111'; og.lineWidth = 3; og.beginPath(); og.moveTo(x - 9, y); og.lineTo(x + 9, y); og.moveTo(x, y - 9); og.lineTo(x, y + 9); og.stroke(); og.strokeStyle = '#ff6a13'; og.lineWidth = 2; og.beginPath(); og.arc(x, y, 7, 0, 7); og.stroke(); }
  return toURL(out);
}
function addLayer() {
  if (!R || !R.img) return;
  try {
    if (map.getLayer('find-r')) map.removeLayer('find-r'); if (map.getSource('find')) map.removeSource('find');
    map.addSource('find', { type: 'image', url: R.img.url, coordinates: R.img.coords });
    const before = ['hot-h', 'log-c', 'wps-c', 'wps'].find(id => map.getLayer(id));
    map.addLayer({ id: 'find-r', type: 'raster', source: 'find', paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 } }, before);
  } catch {}
}
map.on('style.load', () => setTimeout(addLayer, 300));
function drawMarkers() {
  markers.forEach(m => m.remove()); markers = [];
  (R ? R.spots : []).forEach((s, n) => {
    const el = document.createElement('button'); el.className = 'findpin'; el.textContent = n + 1; el.setAttribute('aria-label', 'Likely spot ' + (n + 1));
    el.onclick = ev => { ev.stopPropagation(); spotSheet(n); };
    markers.push(new maplibregl.Marker({ element: el }).setLngLat(s.p).addTo(map));
  });
}
function clearFind() { R = null; markers.forEach(m => m.remove()); markers = []; try { if (map.getLayer('find-r')) map.removeLayer('find-r'); if (map.getSource('find')) map.removeSource('find'); } catch {} }

function reasons(res, s) {
  const { D, slope, aspect, E, veg } = res, k = s.k, out = [], { P, fr } = res.per[s.n];
  const v = VEG[veg[k]], mode = fr >= 0.5 ? 'feed' : 'bed';
  out.push(`${VEG_TXT[v][0].toUpperCase() + VEG_TXT[v].slice(1)}${(P.veg[mode][v] ?? 0) >= 0.8 ? ` (${mode === 'feed' ? 'good feed' : 'good cover'})` : ''}`);
  out.push(`${Math.round(slope[k])}° slope facing ${compass(aspect[k])}${slope[k] > 6 && angDiff(aspect[k], 0) <= 50 ? ' (sunny face)' : slope[k] > 6 && angDiff(aspect[k], 180) <= 50 ? ' (shady face)' : ''}, about ${Math.round(E[k])} m`);
  if (D.edge[k] < 1e5) out.push(D.edge[k] < 60 ? 'On a bush or scrub edge' : `${fmtDist(D.edge[k])} from a bush or scrub edge`);
  if (D.water[k] < 1e5 && (P.w.water || 0) > 0.3) out.push(D.water[k] < 50 ? 'Next to water' : `${fmtDist(D.water[k])} from water`);
  if ((P.w.slip || 0) > 0.5 && D.slip[k] < 200) out.push('Near a slip (fresh growth, open feed)');
  if ((P.w.cliff || 0) > 0.8 && D.cliff[k] < 250) out.push('Near bluffs (escape terrain)');
  const dd = Math.min(D.road[k], D.track[k]); out.push(dd < 1e5 ? `${fmtDist(dd)} from the nearest mapped road or track` : 'No mapped road or track nearby');
  return out;
}
function approach(res, s) {
  const out = [], k = s.k, steep = res.slope[k] > 8, sunOn = res.period === 'day', wind = res.wind;
  if (wind.from != null && wind.spd >= 4) out.push(`Wind from the ${compass(wind.from)} at about ${Math.round(wind.spd)} km/h: come in from the ${compass((wind.from + 180) % 360)} (downwind) side so your scent blows away from the spot.`);
  if (!wind.spd || wind.spd < 15) {
    if (steep) out.push(sunOn ? 'Thermals likely rising: your scent drifts uphill, so approach from above or across the face.' : 'Thermals likely falling: your scent drains downhill, so approach from below or across the face.');
    else out.push('Flat ground: thermals drift gently down-valley in the cool of the day and up-valley once it warms.');
  }
  const sp = res.per[s.n].sp; if (sp === 'chamois' || sp === 'tahr') out.push('They watch downhill: getting above them helps.');
  return out;
}
function cardinalTxt(res) {
  const w = res.wind; return w.from == null ? (w.src || 'calm') : `${compass(w.from)} ${Math.round(w.spd)} km/h (${w.src})`;
}
function resultSheet() {
  const res = R; if (!res) return findSheet();
  const me = state.me ? [state.me.lng, state.me.lat] : null, d = res.t, multi = res.per.length > 1;
  const names = res.per.map(r => r.P.name), title = multi ? 'Likely spots' : names[0] + ': likely spots';
  const warn = [];
  res.per.forEach(r => { if (r.pres && r.pres.known && r.pres.frac === 0) warn.push(`DOC’s distribution data doesn’t show ${r.P.name.toLowerCase()} in this view.`); });
  if (res.opt.mask && !res.useMask) warn.push(res.huntCovered ? 'No DOC hunting areas in this view, so all land is scored. You need permission on private land.' : 'DOC hunting areas aren’t loaded for this view yet, so all land is scored. Zoom in a little and re-run to limit it to DOC hunting land.');
  if (res.G.crop) warn.push('The view was larger than the model can handle, so only the centre was scored.');
  if (res.period === 'night') warn.push('Shooting at night is banned on DOC land (from 30 minutes after sunset to 30 minutes before sunrise). Night results are for planning, or for private land with permission.');
  const modeTxt = fr => fr >= 0.7 ? 'Mostly feeding' : fr <= 0.3 ? 'Mostly bedded or resting in cover' : 'A mix of feeding and resting';
  const calTxt = r => r.logs >= 3 ? `Tuned with ${r.logs} of your hunt-log entries here${r.calib.length ? ' (more weight on ' + r.calib.filter(c => c[1] > 1).map(c => c[0]).join(', ') + ')' : ''}.` : `${r.logs || 'No'} hunt-log entr${r.logs === 1 ? 'y' : 'ies'} here; with 3 or more the model tunes itself to where you’ve found them.`;
  const perHtml = res.per.map(r => {
    const P = r.P, doing = r.rut && P.doing.rut ? P.doing.rut : P.doing[res.season];
    return `${multi ? `<h3>${esc(P.name)}${r.rut ? ' · ' + esc(P.rut.label) : ''}</h3>` : ''}<p><b>What they’re likely doing:</b> ${esc(modeTxt(r.fr))}. ${esc(doing)}</p><p class="sub">${esc(calTxt(r))}</p>
      <details><summary>${multi ? esc(P.name) + ': food' : 'Food'}, water and sign</summary><p><b>Food:</b> ${esc(P.diet)}</p><p><b>Water:</b> ${esc(P.waterTxt)}</p><p><b>Sign to look for:</b></p><ul class="sub">${P.signs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>
      <details><summary>${multi ? esc(P.name) + ': hunting' : 'Hunting'} tips</summary><ul class="sub">${P.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  }).join('');
  const rutLbl = !multi && res.per[0].rut ? ' · ' + res.per[0].P.rut.label : '';
  showSheet(`<h2>${esc(title)}</h2>
    <p class="sub">${multi ? esc(names.join(', ')) + ' · ' : ''}${d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(d)} · ${PERIOD_TXT[res.period]} · ${res.season}${rutLbl} · wind ${esc(cardinalTxt(res))}</p>
    ${warn.map(x => `<p class="warnbox">${esc(x)}</p>`).join('')}
    <h3>Top spots in view</h3>
    <ul class="list">${res.spots.map((s, n) => { const rs = reasons(res, s); return `<li><span class="t">${n + 1}. ${multi ? esc(res.per[s.n].P.name) + ': ' : ''}${esc(rs[0])}</span> <span class="badge">${Math.round(100 * s.v)}</span><br><span class="sub">${esc(rs.slice(1, 3).join(' · '))}${me ? ` · ${fmtDist(distM(me, s.p))} ${compass(bearing(me, s.p))}` : ''}</span><div class="btnrow"><button class="btn small" data-act="findSpot" data-n="${n}">Details</button><button class="btn small ghost" data-act="findNav" data-n="${n}">Navigate</button></div></li>`; }).join('') || '<li class="sub">Nothing stood out. Try another time of day, or zoom out.</li>'}</ul>
    ${perHtml}
    <details><summary>Wind and thermals</summary><p class="sub">${esc(window.BEHAVIOUR_THERMALS || '')}</p></details>
    <div class="btnrow"><button class="btn ghost" data-act="mFind">Change</button><button class="btn ghost" data-act="findRerun">Re-run for this view</button><button class="btn ghost" data-act="findClear">Clear</button></div>
    <p class="sub">Yellow to red shading shows the best-scoring ground${multi ? ' for any of the ticked species' : ''}. It’s a model built from mapped cover, terrain, sun and wind, so check for sign on the ground. Mapped vegetation can be years old. Always confirm you’re allowed to hunt there.</p>`, { tall: true, kind: 'find' });
}
function spotSheet(n) {
  const res = R, s = res && res.spots[n]; if (!s) return;
  const me = state.me ? [state.me.lng, state.me.lat] : null;
  showSheet(`<h2>Spot ${n + 1}: ${esc(res.per[s.n].P.name)}</h2><p class="sub">${s.p[1].toFixed(5)}, ${s.p[0].toFixed(5)}${me ? ` · ${fmtDist(distM(me, s.p))} ${compass(bearing(me, s.p))} from you` : ''}</p>
    <h3>Why here</h3><ul class="sub">${reasons(res, s).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Approach</h3><ul class="sub">${approach(res, s).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="btnrow"><button class="btn" data-act="findNav" data-n="${n}">Navigate</button><button class="btn ghost" data-act="saveWp" data-lng="${s.p[0]}" data-lat="${s.p[1]}">Save waypoint</button><button class="btn ghost" data-act="findBack">Back</button></div>
    <p class="sub">Tap the map at the spot to check land status before you go.</p>`, { kind: 'find' });
  map.easeTo({ center: s.p, duration: 500 });
}

/* ---------- set-up sheet ---------- */
function findSheet(pref) {
  const o = Object.assign({ sps: null, when: 'now', date: new Date().toLocaleDateString('en-CA'), wind: 'auto', mask: true }, LS.get('find', {}), pref || {});
  if (o.sp && !o.sps) o.sps = [o.sp];
  const sel = Object.keys(state.sp || {}).filter(k => state.sp[k] && B[k]);
  if (pref && pref.sps) o.sps = pref.sps; else if (sel.length) o.sps = sel;
  o.sps = (o.sps || []).filter(k => B[k]); if (!o.sps.length) o.sps = ['red'];
  const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  const zoomOk = map.getZoom() >= 11;
  showSheet(`<h2>Find animals</h2><p class="sub">Scores the ground in view for the species you tick, using their feeding and bedding habits, season and rut, cover, water, slope, sunny or shady faces, landform, wind shelter and distance from roads and tracks.</p>
    <span class="field-l">Species (tick one or more)</span><div class="spgrid" id="fSps">${Object.entries(B).map(([k, p]) => `<label class="toggle"><input type="checkbox" value="${k}" ${o.sps.includes(k) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</div>
    <label class="field-l">When</label><div class="pair"><select id="fWhen">${[['now', 'Now'], ['dawn', 'Dawn'], ['day', 'Middle of the day'], ['dusk', 'Dusk'], ['night', 'Night']].map(([v, l]) => `<option value="${v}" ${v === o.when ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="date" id="fDate" value="${esc(o.date)}"></div>
    <label class="field-l">Wind</label><select id="fWind"><option value="auto" ${o.wind === 'auto' ? 'selected' : ''}>Forecast (needs signal)</option><option value="calm" ${o.wind === 'calm' ? 'selected' : ''}>Calm or unknown</option>${dirs.map(([l, d]) => [10, 25].map(sp => `<option value="${d}@${sp}" ${o.wind === d + '@' + sp ? 'selected' : ''}>From ${l}, ${sp === 10 ? 'light' : 'strong'}</option>`).join('')).join('')}</select>
    <label class="toggle"><input type="checkbox" id="fMask" ${o.mask ? 'checked' : ''}>Only score DOC land open to hunting</label>
    ${zoomOk ? '' : '<p class="warnbox">Zoom in to the block you want to hunt (about 20 km across or less) first.</p>'}
    <div class="btnrow"><button class="btn" data-act="findRun" ${zoomOk ? '' : 'disabled'}>Find likely spots</button>${R ? '<button class="btn ghost" data-act="findShow">Last result</button><button class="btn ghost" data-act="findClear">Clear</button>' : ''}</div>
    <p class="sub">Offline: save the area under Offline maps with <b>Topo</b> and <b>Terrain</b> ticked.</p>`, { tall: true, kind: 'find' });
}
let busy = false;
async function go(o) {
  if (busy) return; o = { ...o }; if (!o.sps) o.sps = o.sp ? [o.sp] : ['red']; busy = true;
  const bar = p => `<div style="height:6px;background:var(--sep);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round(p * 100)}%;background:var(--accent,#ff6a13)"></div></div>`;
  let lastP = 0; const prog = (p, msg) => { if (p - lastP < 0.02 && p < 1) return; lastP = p; showSheet(`<h2>Finding ${esc(o.sps.length > 1 ? 'animals' : B[o.sps[0]].name.toLowerCase())}…</h2><p class="sub">${esc(msg)}</p>${bar(p)}`, { kind: 'find', mini: true }); };
  try {
    const res = await run(o, prog); prog(0.95, 'Drawing…'); R = res; draw(res); resultSheet();
  } catch (e) {
    const m = String(e && e.message);
    showSheet(`<h2>Couldn’t run the model</h2><p>${m === 'terrain' ? 'Terrain data isn’t available for this view. Get a signal, or save the area under Offline maps with Terrain ticked.' : m === 'vector' ? 'Topo map data (vegetation, water, tracks) isn’t available for this view. Get a signal, or save the area under Offline maps with Topo ticked.' : 'Something went wrong. Try again, or zoom in a little.'}</p><div class="btnrow"><button class="btn" data-act="mFind">Back</button></div>`, { kind: 'find' });
  } finally { busy = false; }
}
actions.mFind = () => findSheet();
actions.findRun = () => {
  const sps = [...document.querySelectorAll('#fSps input:checked')].map(i => i.value);
  if (!sps.length) { toast('Tick at least one species'); return; }
  const o = { sps, when: document.querySelector('#fWhen').value, date: document.querySelector('#fDate').value || new Date().toLocaleDateString('en-CA'), wind: document.querySelector('#fWind').value, mask: document.querySelector('#fMask').checked };
  LS.set('find', o); go(o);
};
actions.findRerun = () => { if (map.getZoom() < 11) { toast('Zoom in a little first'); return; } go(R ? R.opt : LS.get('find', {})); };
actions.findShow = () => resultSheet();
actions.findBack = () => resultSheet();
actions.findClear = () => { clearFind(); closeSheet(); toast('Find animals overlay cleared'); };
actions.findSpot = b => spotSheet(+b.dataset.n);
actions.findNav = b => { const s = R && R.spots[+b.dataset.n]; if (s) { setNav('Likely spot ' + (+b.dataset.n + 1), s.p); toast('Navigating to spot ' + (+b.dataset.n + 1)); closeSheet(); } };
actions.findFromHot = b => {
  const h = (window.HOTSPOTS || []).find(x => x.id === b.dataset.id); if (!h) return;
  const lats = h.pts.map(p => p[0]), lngs = h.pts.map(p => p[1]);
  const sp = Object.entries(h.sp).filter(([k]) => B[k]).sort((a, c) => c[1] - a[1])[0];
  map.fitBounds([[Math.min(...lngs) - 0.05, Math.min(...lats) - 0.04], [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.04]], { padding: 40, maxZoom: 13, duration: 0 });
  if (map.getZoom() < 11.2) map.setZoom(11.2);
  let shown = false; const open = () => { if (!shown) { shown = true; findSheet(sp ? { sps: [sp[0]] } : {}); } };
  map.once('idle', open); setTimeout(open, 2500);
};
A.model = { run, findSpots, thumb, reasons: (res, s) => reasons(res, s), approach: (res, s) => approach(res, s), get result() { return R; } };
})();
