/* Fish Access NZ: sea-fishing map for the Mana–Kāpiti coast.
   No build step. MapLibre GL + LINZ Basemaps; open data in data/ (refreshed by GitHub Actions);
   rules, spots and ramps in rules.js; marks and catches in localStorage.
   Contents: helpers · map & layers · zones & identify · tides · forecast · GPS & alerts ·
             marks · catch log & bag · sheets (rules, safety, layers, menu) · start-up */
(() => {
'use strict';

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const F = window.FISH, CFG = window.HM_CONFIG || {};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('fam.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fam.' + k, JSON.stringify(v)); } catch {} }
};
const online = () => navigator.onLine !== false;
function fetchT(url, ms = 15000) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t)); }
let toastT;
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
function confirmDlg(text, yes = 'OK') {
  return new Promise(res => {
    $('#dlgText').textContent = text; $('#dlgYes').textContent = yes; $('#dlg').hidden = false;
    const done = v => { $('#dlg').hidden = true; $('#dlgYes').onclick = $('#dlgNo').onclick = null; res(v); };
    $('#dlgYes').onclick = () => done(true); $('#dlgNo').onclick = () => done(false);
  });
}
const rad = Math.PI / 180;
const distM = (a, b) => { const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad), y = (b[1] - a[1]) * rad; return Math.sqrt(x * x + y * y) * 6371000; };
const bearing = (a, b) => { const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad), x = Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad); return (Math.atan2(y, x) / rad + 360) % 360; };
const compass = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
const fmtDist = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
const TZ = 'Pacific/Auckland';
const fmtTime = d => d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const fmtDay = d => d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const nzDayKey = d => d.toLocaleDateString('en-CA', { timeZone: TZ });
const fmtH = h => (Math.abs(h) < 0.05 ? 0 : h).toFixed(1) + ' m';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const llTxt = p => `${Math.abs(p[1]).toFixed(5)}° S, ${p[0].toFixed(5)}° E`;
function sunTimes(date, lat, lng, alt = -0.833) {
  const J1970 = 2440588, J2000 = 2451545, day = 86400000, e = rad * 23.4397;
  const d = date.valueOf() / day - 0.5 + J1970 - J2000, lw = rad * -lng, phi = rad * lat;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI)), ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds), C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI, dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosw = (Math.sin(alt * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosw < -1 || cosw > 1) return null;
  const w = Math.acos(cosw), Jset = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const fromJ = j => new Date((j + 0.5 - J1970) * day);
  return { rise: fromJ(Jnoon - (Jset - Jnoon)), set: fromJ(Jset) };
}
function moonPhase(d) {   // 0 new → 0.5 full
  const p = ((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) / 29.530588853; return p - Math.floor(p);
}
const moonName = f => f < 0.03 || f > 0.97 ? 'New moon' : f < 0.22 ? 'Waxing crescent' : f < 0.28 ? 'First quarter' : f < 0.47 ? 'Waxing gibbous' : f < 0.53 ? 'Full moon' : f < 0.72 ? 'Waning gibbous' : f < 0.78 ? 'Last quarter' : 'Waning crescent';
async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- LINZ key and weather endpoints ---------------- */
// Same rules as Hunt Access NZ: a configured developer key, else a self-made 90-day standard key
function makeKey() {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let t = Date.now(), ts = '';
  for (let i = 0; i < 10; i++) { ts = A[t % 32] + ts; t = Math.floor(t / 32); }
  let rs = ''; for (const b of crypto.getRandomValues(new Uint8Array(16))) rs += A[b % 32];
  return ('c' + ts + rs).toLowerCase();
}
function keyAgeDays(k) { if (!k || k[0] !== 'c') return 0; const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let t = 0; for (const ch of k.slice(1, 11).toUpperCase()) t = t * 32 + A.indexOf(ch); return (Date.now() - t) / 864e5; }
let KEY = CFG.linzKey || LS.get('linzKey', '');
if (!KEY || (KEY[0] === 'c' && keyAgeDays(KEY) > 85)) { KEY = makeKey(); LS.set('linzKey', KEY); }
const BM = 'https://basemaps.linz.govt.nz';
const meteoURL = q => CFG.openMeteoKey ? `https://customer-api.open-meteo.com/v1/forecast?${q}&apikey=${encodeURIComponent(CFG.openMeteoKey)}` : `https://api.open-meteo.com/v1/forecast?${q}`;
const marineURL = q => CFG.openMeteoKey ? `https://customer-marine-api.open-meteo.com/v1/marine?${q}&apikey=${encodeURIComponent(CFG.openMeteoKey)}` : `https://marine-api.open-meteo.com/v1/marine?${q}`;
const METEO_CREDIT = '<a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a>';

/* ---------------- state ---------------- */
const state = {
  base: LS.get('base', 'topo'),
  vis: Object.assign({ reserves: true, cpz: true, zones: true, depth: true, fma: true, spots: true, ramps: true, marks: true }, LS.get('vis', {})),
  marks: LS.get('marks', []), catches: LS.get('catches', []),
  me: null, watchId: null, follow: false, target: null, alerts: LS.get('alerts', true), lastZone: null,
  data: { reserves: null, cpz: null, depth: null, fma: null, slipways: null }, tides: {}
};
const EMPTY = { type: 'FeatureCollection', features: [] };
const zonesFC = { type: 'FeatureCollection', features: F.zones.map(z => ({ type: 'Feature', properties: { id: z.id, name: z.name }, geometry: { type: 'Polygon', coordinates: [z.coords] } })) };

/* ---------------- map ---------------- */
const styleFor = b => b === 'aerial' ? `${BM}/v1/styles/aerialhybrid.json?api=${KEY}` : `${BM}/v1/styles/topographic-v2.json?api=${KEY}`;
const view = LS.get('view', { c: [174.86, -40.98], z: 9.7 });
const map = new maplibregl.Map({
  container: 'map', style: styleFor(state.base), center: view.c, zoom: view.z, maxZoom: 18,
  attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2), fadeDuration: 150
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© Toitū Te Whenua LINZ, DOC, GWRC, NIWA/LINZ charts (CC BY 4.0) · © OpenStreetMap contributors' }), 'bottom-left');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), 'bottom-left');
map.on('moveend', () => LS.set('view', { c: map.getCenter().toArray(), z: map.getZoom() }));
let styleErr = false;
map.on('error', e => { if (!styleErr && /style|401|403/i.test(String(e && e.error && e.error.message))) { styleErr = true; toast('Map tiles didn’t load. Check your connection.'); } });

function setSrc(id, data) { const s = map.getSource(id); if (s) s.setData(data); }
function addLayers() {
  const add = (id, data) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: data || EMPTY }); };
  add('darea', state.data.darea); add('snd', state.data.soundings); add('depth', state.data.depth); add('fma', state.data.fmaLines); add('reserves', state.data.reserves); add('cpz', state.data.cpz); add('zones', zonesFC);
  add('sel', EMPTY); add('acc', EMPTY);
  const L = (o, vis) => { if (!map.getLayer(o.id)) map.addLayer(o); map.setLayoutProperty(o.id, 'visibility', vis ? 'visible' : 'none'); };
  L({ id: 'darea-fill', type: 'fill', source: 'darea', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'a'], 0, '#cfe8f7', 10, '#9fcbe8', 30, '#6aa6d4', 100, '#3d7bb5', 200, '#24527f'], 'fill-opacity': 0.35 } }, state.vis.depth);
  L({ id: 'depth-line', type: 'line', source: 'depth', paint: { 'line-color': '#2f6fb0', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 12, 0.7], 'line-width': ['case', ['==', ['%', ['coalesce', ['get', 'd'], 1], 50], 0], 1.4, 0.7] } }, state.vis.depth);
  // spot depths as numbers, in the basemap's own font, from zoom 12
  const font = (map.getStyle().layers.find(l => l.layout && l.layout['text-font']) || { layout: { 'text-font': ['Open Sans Regular'] } }).layout['text-font'];
  L({ id: 'snd', type: 'symbol', source: 'snd', minzoom: 12, layout: { 'text-field': ['number-format', ['get', 'd'], { 'max-fraction-digits': 1 }], 'text-font': font, 'text-size': 11, 'text-allow-overlap': false }, paint: { 'text-color': '#1e4f7a', 'text-halo-color': '#fff', 'text-halo-width': 1.2 } }, state.vis.depth);
  L({ id: 'fma-line', type: 'line', source: 'fma', paint: { 'line-color': '#6b7280', 'line-width': 1.5, 'line-dasharray': [4, 3] } }, state.vis.fma);
  L({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#d99a00', 'fill-opacity': 0.25 } }, state.vis.zones);
  L({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#b07d00', 'line-width': 2 } }, state.vis.zones);
  L({ id: 'cpz-fill', type: 'fill', source: 'cpz', paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.22 } }, state.vis.cpz);
  L({ id: 'cpz-line', type: 'line', source: 'cpz', paint: { 'line-color': '#6d28d9', 'line-width': 2 } }, state.vis.cpz);
  L({ id: 'res-fill', type: 'fill', source: 'reserves', paint: { 'fill-color': '#d23a2b', 'fill-opacity': 0.25 } }, state.vis.reserves);
  L({ id: 'res-line', type: 'line', source: 'reserves', paint: { 'line-color': '#d23a2b', 'line-width': 2.5 } }, state.vis.reserves);
  L({ id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.12 } }, true);
  L({ id: 'sel', type: 'circle', source: 'sel', paint: { 'circle-radius': 7, 'circle-color': '#ff6a13', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } }, true);
}
map.on('style.load', addLayers);

// HTML markers for spots, ramps and marks: a few dozen at most, and no dependence on the style's fonts
const markers = { spots: [], ramps: [], marks: [] };
function pin(cls, label, p, onClick) {
  const el = document.createElement('button'); el.className = 'fpin ' + cls; el.innerHTML = `<span>${label}</span>`;
  el.setAttribute('aria-label', label); el.onclick = e => { e.stopPropagation(); onClick(); };
  return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(p);
}
function renderPins() {
  for (const k of Object.keys(markers)) { markers[k].forEach(m => m.remove()); markers[k] = []; }
  if (state.vis.spots) F.spots.forEach((s, i) => markers.spots.push(pin('spot' + (s.dive ? ' dive' : s.shore ? ' shore' : ''), s.dive ? '🦞' : s.shore ? '🎣' : '🐟', s.p, () => spotSheet(i)).addTo(map)));
  if (state.vis.ramps) rampList().forEach((r, i) => markers.ramps.push(pin('ramp', '⚓', r.p, () => rampSheet(i)).addTo(map)));
  if (state.vis.marks) state.marks.forEach(m => { const n = catchesAt(m).reduce((a, c) => a + (c.kept ? c.n : 0), 0); const mk = pin('mark', '📍', m.p, () => markSheet(m.id)); if (n) { const t = document.createElement('i'); t.className = 'cnt'; t.textContent = n; mk.getElement().appendChild(t); } markers.marks.push(mk.addTo(map)); });
}
function rampList() {
  // named ramps from rules.js, plus other OpenStreetMap slipways in the region not already listed
  const named = F.ramps.map(r => ({ ...r, named: true }));
  const osm = ((state.data.slipways || EMPTY).features || []).map(f => ({ n: f.properties.name || 'Slipway', p: f.geometry.coordinates, note: f.properties.description || '', access: f.properties.access, osm: true }))
    .filter(o => o.p[1] > -41.25 && o.access !== 'private' && !named.some(r => distM(r.p, o.p) < 300));
  return named.concat(osm);
}

/* ---------------- data ---------------- */
async function loadData() {
  const get = async f => { try { const r = await fetchT('data/' + f, 20000); return r.ok ? await r.json() : null; } catch { return null; } };
  const [res, cpz, slips, fma, man, darea, snd, cont, dfine] = await Promise.all(['reserves.geojson', 'cpz.geojson', 'slipways.geojson', 'fma.geojson', 'manifest.json', 'deptharea.geojson', 'soundings.geojson', 'contours.geojson', 'deptharea_fine.geojson'].map(get));
  // LINZ chart soundings (spot depths) and 1:22k–1:90k contours, when the data job has them
  state.data.soundings = snd ? { type: 'FeatureCollection', features: snd.features.map(f => ({ type: 'Feature', geometry: f.geometry.type === 'MultiPoint' ? { type: 'Point', coordinates: f.geometry.coordinates[0] } : f.geometry, properties: { d: depthOf(f.properties) } })).filter(f => f.properties.d != null && f.geometry.type === 'Point') } : null;
  // chart depth areas come at three scales that overlap: rank 0 = 1:22k–90k (best). Coarser ones draw first, finer on top.
  const rank = s => /1_22k/.test(s) ? 0 : /1_90k___1_350k/.test(s) ? 1 : 2;
  // LINZ 1:4k–1:22k harbour-scale depth areas (rank -1) beat everything else where they exist
  const fine = dfine ? dfine.features.filter(f => f.properties.drval1 >= 0).map(f => ({ type: 'Feature', geometry: f.geometry, properties: { a: f.properties.drval1, b: f.properties.drval2, r: -1 } })) : [];
  state.data.darea = darea || fine.length ? { type: 'FeatureCollection', features: (darea ? darea.features : []).filter(f => f.properties.DRVAL1 >= 0).map(f => ({ type: 'Feature', geometry: f.geometry, properties: { a: f.properties.DRVAL1, b: f.properties.DRVAL2, r: rank(f.properties.Source || '') } })).concat(fine).sort((x, y) => y.properties.r - x.properties.r) } : null;
  state.data.reserves = res; state.data.cpz = cpz; state.data.slipways = slips; state.data.fma = fma; state.data.fmaLines = fma ? fmaBoundaries(fma) : null;
  const layers = (man && man.depth_layers) || [];
  const depthFs = [];
  if (cont) for (const f of cont.features) { const d = depthOf(f.properties); if (d != null) depthFs.push({ type: 'Feature', geometry: f.geometry, properties: { d } }); }
  for (const nm of layers) {
    const fc = await get(nm + '.geojson'); if (!fc) continue;
    for (const f of fc.features) { const d = depthOf(f.properties); if (d != null) { f.properties = { d }; depthFs.push(f); } }
  }
  state.data.depth = depthFs.length ? { type: 'FeatureCollection', features: depthFs } : null;
  if (map.isStyleLoaded()) addLayers();
  for (const k of ['reserves', 'cpz', 'depth', 'darea']) setSrc(k, state.data[k] || EMPTY); setSrc('snd', state.data.soundings || EMPTY); setSrc('fma', state.data.fmaLines || EMPTY);
  renderPins();
}
function depthOf(p) {
  for (const [k, v] of Object.entries(p || {})) if (/^(valdco|valsou|depth|contour|drval1|elevation|elev)$/i.test(k) && v != null && !isNaN(+v)) return Math.abs(+v);
  return null;
}

/* ---------------- geometry ---------------- */
function ringsOf(g) { return !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }
function inRing(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
const inPoly = (p, g) => ringsOf(g).some(poly => inRing(p, poly[0]) && !poly.slice(1).some(h => inRing(p, h)));
function segDist(p, a, b) {   // metres, local flat approximation
  const k = Math.cos(p[1] * rad), ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy) * 111195;
}
function edgeDist(p, g) { let m = Infinity; for (const poly of ringsOf(g)) for (const r of poly) for (let i = 1; i < r.length; i++) m = Math.min(m, segDist(p, r[i - 1], r[i])); return m; }
function lineDist(p, g) { const ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; let m = Infinity; for (const l of ls) for (let i = 1; i < l.length; i++) m = Math.min(m, segDist(p, l[i - 1], l[i])); return m; }

/* ---------------- what applies at a point ---------------- */
function zoneAt(p) {
  const hit = [], near = [];
  for (const f of (state.data.reserves || EMPTY).features) { if (inPoly(p, f.geometry)) hit.push({ kind: 'reserve', name: f.properties.Name }); else { const d = edgeDist(p, f.geometry); if (d < 1000) near.push({ kind: 'reserve', name: f.properties.Name, d }); } }
  for (const f of (state.data.cpz || EMPTY).features) { if (inPoly(p, f.geometry)) hit.push({ kind: 'cpz', name: 'Cook Strait Cable Protection Zone' }); else { const d = edgeDist(p, f.geometry); if (d < 1000) near.push({ kind: 'cpz', name: 'Cook Strait Cable Protection Zone', d }); } }
  for (const z of F.zones) { if (inRing(p, z.coords)) hit.push({ kind: z.kind, name: z.name, text: z.text }); else { const d = edgeDist(p, { type: 'Polygon', coordinates: [z.coords] }); if (d < 500) near.push({ kind: z.kind, name: z.name, d }); } }
  return { hit, near: near.sort((a, b) => a.d - b.d) };
}
function fmaAt(p) {
  for (const f of (state.data.fma || EMPTY).features) if (inPoly(p, f.geometry)) {
    const id = String(f.properties.FMA_ID || ''), n = +id.replace(/\D/g, '');
    if (n) return { fma: n, name: f.properties.FMA_NAME, approx: false };
  }
  // fallback: MPI describes FMA 8 as running from Taranaki to Titahi Bay
  return { fma: p[1] > -41.1 ? 8 : 2, approx: true };
}
// Boundary lines between fishery areas: polygon edges shared by two FMAs (so the coastline isn't drawn)
function fmaBoundaries(fc) {
  const key = c => c[0].toFixed(4) + ',' + c[1].toFixed(4), seen = new Map(), lines = [];
  const ringsAll = f => ringsOf(f.geometry).flat();
  fc.features.forEach((f, i) => ringsAll(f).forEach(r => r.forEach(c => { const k = key(c); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(i); })));
  fc.features.forEach((f, i) => ringsAll(f).forEach(r => { for (let j = 1; j < r.length; j++) { const a = seen.get(key(r[j - 1])), b = seen.get(key(r[j])); if (a.size > 1 && b.size > 1 && [...a].some(x => x !== i && b.has(x)) && i < Math.min(...[...a].filter(x => x !== i))) { if (r[j - 1][0] < 174.86 && r[j][0] < 174.86) lines.push([r[j - 1], r[j]]); } } }));   // sea boundary only (west of Porirua)
  return { type: 'FeatureCollection', features: lines.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }] : [] };
}
function depthAt(p) {
  let sn = null, sd = 250;   // nearest charted spot depth within 250 m
  for (const f of (state.data.soundings || EMPTY).features) { const m = distM(p, f.geometry.coordinates); if (m < sd) { sd = m; sn = f.properties.d; } }
  let hit = null;   // finest-scale depth area containing the point
  for (const f of (state.data.darea || EMPTY).features) if ((!hit || f.properties.r < hit.properties.r) && inPoly(p, f.geometry)) hit = f;
  if (hit) return { band: `${hit.properties.a}–${hit.properties.b} m`, d: hit.properties.a, off: 0, spot: sn, spotOff: sd };
  if (sn != null) return { d: sn, off: sd, spot: sn, spotOff: sd };
  let best = null, bd = 1500;
  for (const f of (state.data.depth || EMPTY).features) { const d = lineDist(p, f.geometry); if (d < bd) { bd = d; best = f.properties.d; } }
  return best == null ? null : { d: best, off: bd };
}
const nearest = (p, list) => list.map((x, i) => ({ ...x, i, dist: distM(p, x.p) })).sort((a, b) => a.dist - b.dist);

function verdictHtml(z) {
  const h = z.hit;
  if (h.some(x => x.kind === 'reserve')) return `<div class="verdict v-no"><div><b>Marine reserve: no fishing</b><span>${esc(h.find(x => x.kind === 'reserve').name)}. No fishing of any kind and no taking of any marine life. Transit only, with gear stowed.</span></div></div>`;
  if (h.some(x => x.kind === 'cpz')) return `<div class="verdict v-no"><div><b>Cable zone: no fishing or anchoring</b><span>Cook Strait Cable Protection Zone. Applies to every vessel. Fines up to $100,000.</span></div></div>`;
  if (h.some(x => x.kind === 'handline')) { const x = h.find(x => x.kind === 'handline'); return `<div class="verdict v-restricted"><div><b>Hand-held line only</b><span>${esc(x.text)}</span></div></div>`; }
  const harbour = p[0] > 174.81 && p[1] < -41.2 && p[1] > -41.345;   // inside Wellington Harbour (outside the west-coast set-net zone)
  return `<div class="verdict v-ok"><div><b>Open to recreational fishing</b><span>Central area limits apply. ${harbour ? 'Wellington Harbour: keep out of the shipping channel, and check the NZ Fishing Rules app before setting a net.' : 'No set nets within 4 nautical miles of the coast.'}</span></div></div>`;
}
function bluecodTxt(p) {
  const f = fmaAt(p);
  const b = f.fma === 8 ? F.bluecod.fma8 : f.fma === 2 ? F.bluecod.fma2 : { limit: 'check', label: `${f.name || 'FMA ' + f.fma}: check the NZ Fishing Rules app` };
  return { ...b, approx: f.approx, fma: f.fma };
}

/* ---------------- identify (tap the map) ---------------- */
function identify(p) {
  state.target = p; setSrc('sel', { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: p } }] });
  const z = zoneAt(p), bc = bluecodTxt(p), dep = depthAt(p);
  const sp = nearest(p, F.spots).slice(0, 2).filter(s => s.dist < 6000), rp = nearest(p, rampList())[0];
  const near = z.near.filter(n => !z.hit.some(h => h.name === n.name)).slice(0, 2);
  const st = nearestStation(p);
  showSheet(`<h2>${llTxt(p)}</h2>
    ${verdictHtml(z)}
    ${near.map(n => `<p class="warnbox">${n.kind === 'reserve' ? 'Marine reserve' : n.kind === 'cpz' ? 'Cable protection zone' : esc(n.name)} boundary ${fmtDist(n.d)} away. Watch your drift.</p>`).join('')}
    <dl class="kv">
      <dt>Blue cod</dt><dd>${esc(bc.label)}${bc.approx ? ' (boundary approximate)' : ''}</dd>
      <dt>Depth</dt><dd>${dep ? (dep.band ? `${dep.band} (chart depth area)` : `near the ${dep.d} m contour, ${fmtDist(dep.off)} away`) + (dep.spot != null ? `; charted ${dep.spot} m sounding ${fmtDist(dep.spotOff)} away` : '') : 'No depth data here'} <span class="sub">(not for navigation)</span></dd>
      <dt>Tide</dt><dd id="idTide">Loading ${esc(st.n)}…</dd>
    </dl>
    ${sp.length ? `<h3>Nearby spots</h3><ul class="list">${sp.map(s => `<li><button class="linkish" data-act="spot" data-i="${s.i}"><span class="t">${esc(s.n)}</span></button> · ${fmtDist(s.dist)}<br><span class="sub">${esc(s.sp.join(', '))}</span></li>`).join('')}</ul>` : ''}
    ${rp ? `<p class="sub">Nearest launch: <b>${esc(rp.n)}</b>, ${fmtDist(rp.dist)} ${compass(bearing(rp.p, p))} of it.</p>` : ''}
    <div class="btnrow"><button class="btn" data-act="markNew">Save mark</button><button class="btn ghost" data-act="catchNew">Log a catch</button><button class="btn ghost" data-act="cond">Wind &amp; waves</button><button class="btn ghost" data-act="tides">Tides</button></div>`, { kind: 'id' });
  tideLine(st).then(t => { const el = $('#idTide'); if (el) el.innerHTML = t; });
}
map.on('click', e => { if (state.mode === 'pick') { state.mode = null; $('#crosshair').hidden = true; } identify([e.lngLat.lng, e.lngLat.lat]); });

/* ---------------- tides (LINZ predictions) ---------------- */
function nzDate(y, mo, d, hh, mm) {   // local NZ wall-clock time → Date
  let t = Date.UTC(y, mo - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t));
    const g = k => +parts.find(x => x.type === k).value;
    const shown = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    t += Date.UTC(y, mo - 1, d, hh, mm) - shown;
  }
  return new Date(t);
}
async function tideEvents(src) {
  if (state.tides[src]) return state.tides[src];
  const y0 = new Date().getFullYear(), ev = [];
  for (const y of [y0 - 1, y0, y0 + 1]) {
    let txt; try { const r = await fetchT(`data/tide-${src}-${y}.csv`, 15000); if (!r.ok) continue; txt = await r.text(); } catch { continue; }
    for (const line of txt.split(/\r?\n/)) {
      const c = line.split(','); if (c.length < 6 || !/^\d+$/.test(c[0]) || !/^\d{4}$/.test(c[3])) continue;
      for (let i = 4; i + 1 < c.length; i += 2) { if (!c[i]) continue; const [hh, mm] = c[i].split(':').map(Number); ev.push({ t: nzDate(+c[3], +c[2], +c[0], hh, mm), h: +c[i + 1] }); }
    }
  }
  ev.sort((a, b) => a.t - b.t);
  ev.forEach((e, i) => { const n = ev[i + 1] || ev[i - 1]; e.high = n ? e.h > n.h : true; });
  return (state.tides[src] = ev);
}
function nearestStation(p) { return nearest(p, F.tideStations)[0]; }
async function stationEvents(st) {
  const ev = await tideEvents(st.src);
  return ev.map(e => ({ t: new Date(+e.t + st.dt * 60000), h: st.ratio === 1 ? e.h : +(st.mslS + (e.h - st.mslR) * st.ratio).toFixed(2), high: e.high }));
}
function tideAt(ev, t) {
  const i = ev.findIndex(e => e.t > t); if (i < 1) return null;
  const a = ev[i - 1], b = ev[i], f = (t - a.t) / (b.t - a.t);
  return { h: a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2, rising: b.h > a.h, next: b };
}
async function tideLine(st) {
  const ev = await stationEvents(st); if (!ev.length) return 'Tide data unavailable';
  const now = new Date(), t = tideAt(ev, now); if (!t) return 'Tide data unavailable';
  return `${t.rising ? 'Rising ↑' : 'Falling ↓'} ${fmtH(t.h)} · ${t.next.high ? 'high' : 'low'} ${fmtTime(t.next.t)} (${fmtH(t.next.h)}) · ${esc(st.n)}${st.approx ? ' (approx.)' : ''}`;
}
function tideSvg(ev, from, to) {
  const W = 320, H = 90, pts = [];
  for (let t = +from; t <= +to; t += 15 * 60000) { const x = tideAt(ev, new Date(t)); if (x) pts.push([t, x.h]); }
  if (pts.length < 2) return '';
  const hs = pts.map(p => p[1]), lo = Math.min(...hs) - 0.1, hi = Math.max(...hs) + 0.1;
  const X = t => (t - from) / (to - from) * W, Y = h => H - 12 - (h - lo) / (hi - lo) * (H - 24);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  const nowX = X(Date.now());
  return `<svg class="tidesvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tide curve"><path d="${d} L${W} ${H} L0 ${H}Z" fill="rgba(47,111,176,.15)"/><path d="${d}" fill="none" stroke="#2f6fb0" stroke-width="2"/>${nowX > 0 && nowX < W ? `<line x1="${nowX}" x2="${nowX}" y1="0" y2="${H}" stroke="#ff6a13" stroke-width="2"/>` : ''}${[0, 6, 12, 18].map(h => `<text x="${X(+from + h * 3600e3) + 2}" y="${H - 1}" font-size="9" fill="currentColor" opacity=".6">${h}:00</text>`).join('')}</svg>`;
}
async function tideSheet(p) {
  p = p || state.target || (state.me && [state.me.lng, state.me.lat]) || F.tideStations[0].p;
  const st = nearestStation(p), ev = await stationEvents(st);
  if (!ev.length) { showSheet('<h2>Tides</h2><p>Tide data isn’t available offline yet. Open the app once with a connection.</p>', { kind: 'tides' }); return; }
  const start = nzDate(...nzDayKey(new Date()).split('-').map(Number), 0, 0);
  const days = [0, 1, 2, 3].map(i => { const a = new Date(+start + i * 864e5), b = new Date(+a + 864e5); return { a, b, ev: ev.filter(e => e.t >= a && e.t < b) }; });
  const s = sunTimes(new Date(), p[1], p[0]), mp = moonPhase(Date.now());
  const windows = fishingWindows(ev, p);
  showSheet(`<h2>Tides · ${esc(st.n)}</h2>
    <p class="sub">${st.src === 'ManaMarina' ? 'LINZ daily predictions for Mana Marina.' : 'Calculated from LINZ Port Taranaki predictions with secondary-port offsets' + (st.approx ? ' (heights approximate).' : '.')} Choose another spot on the map to switch station.</p>
    ${tideSvg(ev, days[0].a, days[0].b)}
    <p>${await tideLine(st)}</p>
    <table class="tt"><tbody>${days.map(d => `<tr><th>${fmtDay(d.a)}</th>${d.ev.map(e => `<td><b>${e.high ? 'H' : 'L'}</b> ${fmtTime(e.t)}<br><span class="sub">${fmtH(e.h)}</span></td>`).join('')}</tr>`).join('')}</tbody></table>
    <h3>Fishing windows (next 36 hours)</h3>
    <p class="sub">Fish often feed around tide changes and at first and last light. A rule of thumb, not a guarantee.</p>
    <ul class="list">${windows.map(w => `<li><b>${fmtDay(w.t)} ${fmtTime(new Date(+w.t - 3600e3))}–${fmtTime(new Date(+w.t + 3600e3))}</b> · ${esc(w.why)}</li>`).join('')}</ul>
    <p class="sub">Sunrise ${s ? fmtTime(s.rise) : '–'} · sunset ${s ? fmtTime(s.set) : '–'} · ${moonName(mp)}. Tide predictions © Toitū Te Whenua LINZ, CC BY 4.0. Wind and pressure shift real tides.</p>`, { tall: true, kind: 'tides' });
}
function fishingWindows(ev, p) {
  const now = Date.now(), end = now + 36 * 3600e3, out = [];
  ev.filter(e => +e.t > now - 3600e3 && +e.t < end).forEach(e => out.push({ t: e.t, why: (e.high ? 'High' : 'Low') + ' tide turn' }));
  for (let i = 0; i < 2; i++) { const s = sunTimes(new Date(now + i * 864e5), p[1], p[0]); if (s) [['Dawn', s.rise], ['Dusk', s.set]].forEach(([w, t]) => { if (+t > now - 3600e3 && +t < end) out.push({ t, why: w }); }); }
  out.sort((a, b) => a.t - b.t);
  // merge windows that overlap (e.g. a dawn high tide)
  const m = []; for (const w of out) { const l = m[m.length - 1]; if (l && w.t - l.t < 90 * 60000) l.why += ' + ' + w.why.toLowerCase(); else m.push({ ...w }); }
  return m;
}

/* ---------------- forecast: wind and waves ---------------- */
async function condSheet(p) {
  p = p || state.target || (state.me && [state.me.lng, state.me.lat]) || [174.8, -41.0];
  showSheet(`<h2>Wind &amp; waves</h2><p class="sub">${llTxt(p)}</p><p>Loading forecast…</p>`, { kind: 'cond' });
  if (!online()) { showSheet('<h2>Wind &amp; waves</h2><p>You’re offline. Forecasts need a connection.</p>', { kind: 'cond' }); return; }
  const q = `latitude=${p[1].toFixed(4)}&longitude=${p[0].toFixed(4)}&timezone=Pacific%2FAuckland&forecast_days=3`;
  try {
    const [w, m] = await Promise.all([
      fetchT(meteoURL(q + '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability&wind_speed_unit=kn'), 15000).then(r => r.json()),
      fetchT(marineURL(q + '&hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction'), 15000).then(r => r.json()).catch(() => null)
    ]);
    const H = w.hourly, M = m && m.hourly; const now = Date.now(); const rows = [];
    for (let i = 0; i < H.time.length; i += 3) {
      const t = nzDate(...H.time[i].slice(0, 10).split('-').map(Number), +H.time[i].slice(11, 13), 0); if (+t < now - 3 * 3600e3) continue;
      const ws = H.wind_speed_10m[i], g = H.wind_gusts_10m[i], wd = H.wind_direction_10m[i];
      const wv = M && M.wave_height ? M.wave_height[i] : null, sw = M && M.swell_wave_height ? M.swell_wave_height[i] : null, sp = M && M.swell_wave_period ? M.swell_wave_period[i] : null, sd = M && M.swell_wave_direction ? M.swell_wave_direction[i] : null;
      const rating = g >= 25 || ws >= 18 || (wv != null && wv >= 2) ? 'bad' : g >= 18 || ws >= 12 || (wv != null && wv >= 1.2) ? 'meh' : 'ok';
      rows.push(`<tr class="r-${rating}"><td>${fmtDay(t).split(' ')[0]} ${fmtTime(t)}</td><td><span class="arr" style="transform:rotate(${wd + 180}deg)">↑</span> ${compass(wd)} ${Math.round(ws)}<span class="sub">/${Math.round(g)}</span></td><td>${wv != null ? wv.toFixed(1) + ' m' : '–'}</td><td>${sw != null ? `${sw.toFixed(1)} m ${sp ? Math.round(sp) + 's' : ''} ${sd != null ? compass(sd) : ''}` : '–'}</td></tr>`);
    }
    showSheet(`<h2>Wind &amp; waves</h2><p class="sub">${llTxt(p)} · wind in knots (gusts) from the direction shown</p>
      <table class="fc"><thead><tr><th>Time</th><th>Wind kn</th><th>Waves</th><th>Swell</th></tr></thead><tbody>${rows.join('')}</tbody></table>
      <p class="sub"><span class="dotk ok"></span> light <span class="dotk meh"></span> marginal for small boats <span class="dotk bad"></span> stay in. A rough guide only: check the MetService marine forecast for Cook Strait and Kāpiti before going out. ${METEO_CREDIT}.</p>`, { tall: true, kind: 'cond' });
  } catch { showSheet('<h2>Wind &amp; waves</h2><p>The forecast didn’t load. Try again shortly.</p>', { kind: 'cond' }); }
}

/* ---------------- GPS, status and boundary alerts ---------------- */
let meMarker = null;
function startGPS() {
  if (!navigator.geolocation) { toast('Location isn’t available on this device'); return; }
  state.follow = true; $('#btnLocate').classList.add('on');
  state.watchId = navigator.geolocation.watchPosition(onPos, err => { toast(err.code === 1 ? 'Location permission denied' : 'Waiting for a GPS fix…'); if (err.code === 1) stopGPS(); }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 30000 });
  $('#statusBar').hidden = false; $('#statusText').textContent = 'Getting GPS fix…';
}
function stopGPS() {
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null; state.follow = false; state.me = null; $('#btnLocate').classList.remove('on');
  if (meMarker) meMarker.remove(); setSrc('acc', EMPTY); $('#statusBar').hidden = true;
}
function circle(p, r) { const pts = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * 2 * Math.PI; pts.push([p[0] + r / 111320 / Math.cos(p[1] * rad) * Math.cos(a), p[1] + r / 110540 * Math.sin(a)]); } return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } }] }; }
function onPos(pos) {
  const c = pos.coords, first = !state.me, p = [c.longitude, c.latitude];
  state.me = { lng: p[0], lat: p[1], acc: c.accuracy, t: pos.timestamp };
  if (!meMarker) { const el = document.createElement('div'); el.className = 'me'; meMarker = new maplibregl.Marker({ element: el }); }
  meMarker.setLngLat(p).addTo(map); setSrc('acc', c.accuracy > 15 ? circle(p, c.accuracy) : EMPTY);
  if (state.follow) first ? map.flyTo({ center: p, zoom: Math.max(map.getZoom(), 13) }) : map.easeTo({ center: p, duration: 500 });
  const z = zoneAt(p), bar = $('#statusBar'), dep = depthAt(p);
  let cat = 'ok', txt = 'Open water · Central limits';
  if (z.hit.some(x => x.kind === 'reserve')) { cat = 'no'; txt = 'IN MARINE RESERVE · no fishing'; }
  else if (z.hit.some(x => x.kind === 'cpz')) { cat = 'no'; txt = 'IN CABLE ZONE · no fishing or anchoring'; }
  else if (z.hit.some(x => x.kind === 'handline')) { cat = 'warn'; txt = 'Pukerua Bay · hand-held line only'; }
  else if (z.near.length && z.near[0].d < 300) { cat = 'warn'; txt = `${z.near[0].kind === 'reserve' ? 'Reserve' : z.near[0].kind === 'cpz' ? 'Cable zone' : 'Restricted area'} ${fmtDist(z.near[0].d)} away`; }
  if (dep && dep.band) txt += ` · ${dep.band}`; else if (dep && dep.off < 400) txt += ` · ~${dep.d} m`;
  bar.dataset.cat = cat === 'warn' ? 'restricted' : cat; $('#statusText').textContent = txt + (c.accuracy > 30 ? ` · ±${Math.round(c.accuracy)} m` : '');
  if (state.alerts && cat !== 'ok' && state.lastZone !== txt.split(' ·')[0]) {
    try { navigator.vibrate && navigator.vibrate(cat === 'no' ? [300, 120, 300, 120, 300] : [200]); } catch {}
    bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash'); toast(txt, 5000);
  }
  state.lastZone = cat === 'ok' ? null : txt.split(' ·')[0];
}
$('#btnLocate').onclick = () => { if (state.watchId == null) startGPS(); else if (!state.follow) { state.follow = true; $('#btnLocate').classList.add('on'); if (state.me) map.easeTo({ center: [state.me.lng, state.me.lat] }); } else stopGPS(); };
map.on('dragstart', () => { if (state.follow) { state.follow = false; $('#btnLocate').classList.remove('on'); } });

/* ---------------- marks ---------------- */
const saveMarks = () => { LS.set('marks', state.marks); renderPins(); };
function markForm(p, m) {
  showSheet(`<h2>${m ? 'Edit mark' : 'Save mark'}</h2><p class="sub">${llTxt(p)}</p>
    <label class="field-l">Name</label><input type="text" id="mkName" value="${esc(m ? m.name : 'Mark ' + (state.marks.length + 1))}">
    <label class="field-l">Notes (depth, what bit, tide)</label><textarea id="mkNote" rows="3">${esc(m ? m.note : '')}</textarea>
    <div class="btnrow"><button class="btn" data-act="markSave" data-id="${m ? m.id : ''}" data-lng="${p[0]}" data-lat="${p[1]}">Save</button><button class="btn ghost" data-act="closeSheet">Cancel</button></div>`, { kind: 'mark' });
}
const catchesAt = m => state.catches.filter(c => c.markId === m.id).sort((a, b) => b.t - a.t);
function markSheet(id) {
  const m = state.marks.find(x => x.id === id); if (!m) return;
  const me = state.me && [state.me.lng, state.me.lat], cs = catchesAt(m);
  const tally = {}; cs.forEach(c => { if (c.kept) tally[c.sp] = (tally[c.sp] || 0) + c.n; });
  showSheet(`<h2>📍 ${esc(m.name)}</h2><p class="sub">${llTxt(m.p)}${m.acc ? ` (±${Math.round(m.acc)} m)` : ''} · saved ${fmtDay(new Date(m.t))} ${fmtTime(new Date(m.t))}${me ? ` · ${fmtDist(distM(me, m.p))} ${compass(bearing(me, m.p))} of you` : ''}</p>${m.note ? `<p>${esc(m.note)}</p>` : ''}
    <div class="btnrow"><button class="btn" data-act="catchAtMark" data-id="${m.id}">Add a catch here</button><button class="btn ghost" data-act="markEdit" data-id="${m.id}">Name &amp; notes</button></div>
    <h3>Caught here</h3>
    ${Object.keys(tally).length ? `<p>${Object.entries(tally).map(([k, v]) => `<b>${v}</b> ${esc(k)}`).join(' · ')} kept</p>` : ''}
    <ul class="list">${cs.map(c => `<li><span class="t">${esc(c.sp)} × ${c.n}</span> ${c.kept ? '' : '<span class="badge">released</span>'}${c.len ? ` · ${c.len} ${/crayfish|pāua/i.test(c.sp) ? 'mm' : 'cm'}` : ''}<br><span class="sub">${fmtDay(new Date(c.t))} ${fmtTime(new Date(c.t))}${c.tide ? ' · ' + esc(c.tide) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span></li>`).join('') || '<li class="sub">Nothing logged here yet.</li>'}</ul>
    <div class="btnrow"><button class="btn ghost small" data-act="markInfo" data-id="${m.id}">What applies here</button><button class="btn ghost small" data-act="tidesAt" data-lng="${m.p[0]}" data-lat="${m.p[1]}">Tides</button><a class="btn ghost small" href="https://www.google.com/maps/dir/?api=1&destination=${m.p[1]},${m.p[0]}" target="_blank" rel="noopener">Directions</a><button class="btn ghost small" data-act="markDel" data-id="${m.id}">Delete</button></div>`, { kind: 'mark' });
}
// Drop a marker at the boat's GPS position (front-screen button)
async function dropMark() {
  let pos = state.me && Date.now() - state.me.t < 60000 ? { p: [state.me.lng, state.me.lat], acc: state.me.acc } : null;
  if (!pos && navigator.geolocation) {
    toast('Getting your GPS position…', 15000);
    pos = await new Promise(res => navigator.geolocation.getCurrentPosition(g => res({ p: [g.coords.longitude, g.coords.latitude], acc: g.coords.accuracy }), () => res(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }));
    $('#toast').hidden = true;
  }
  if (!pos) {
    if (!(await confirmDlg('No GPS fix. Drop the marker at the centre of the map instead?', 'Use map centre'))) return;
    pos = { p: map.getCenter().toArray(), acc: null };
  }
  const m = { id: uid(), p: pos.p, acc: pos.acc, name: 'Mark ' + (state.marks.length + 1), note: '', t: Date.now() };
  state.marks.push(m); saveMarks();
  map.easeTo({ center: m.p, zoom: Math.max(map.getZoom(), 13) });
  try { navigator.vibrate && navigator.vibrate(60); } catch {}
  toast(`${m.name} saved${pos.acc ? ` (±${Math.round(pos.acc)} m)` : ''}`);
  markSheet(m.id);
}
$('#btnMark').onclick = dropMark;
function marksList() {
  showSheet(`<h2>Marks</h2><ul class="list">${state.marks.slice().sort((a, b) => b.t - a.t).map(m => { const n = catchesAt(m).reduce((a, c) => a + (c.kept ? c.n : 0), 0); return `<li><button class="linkish" data-act="markGo" data-id="${m.id}"><span class="t">${esc(m.name)}</span></button>${n ? ` <span class="badge">${n} caught</span>` : ''}<br><span class="sub">${fmtDay(new Date(m.t))}${m.note ? ' · ' + esc(m.note) : ''}</span></li>`; }).join('') || '<li class="sub">No marks yet. Tap the 📍 button to mark where you are, or tap the map and choose “Save mark”.</li>'}</ul>
    ${state.marks.length ? '<div class="btnrow"><button class="btn ghost" data-act="marksGpx">Export GPX (for chartplotters)</button></div>' : ''}`, { tall: true, kind: 'marks' });
}
const gpx = list => `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Fish Access NZ" xmlns="http://www.topografix.com/GPX/1/1">\n${list.map(m => `<wpt lat="${m.p[1]}" lon="${m.p[0]}"><name>${esc(m.name)}</name>${m.note ? `<desc>${esc(m.note)}</desc>` : ''}<time>${new Date(m.t).toISOString()}</time></wpt>`).join('\n')}\n</gpx>`;

/* ---------------- catch log and today's bag ---------------- */
const ALL_SPECIES = F.finfish.map(f => f[0]).filter(n => !/^Baitfish/.test(n)).concat(F.shellfish.map(s => s[0]), ['Baitfish', 'Other']);
function limitFor(name, p) {
  if (name === 'Blue cod') { const b = bluecodTxt(p); return /^\d+$/.test(b.limit) ? +b.limit : null; }
  const f = F.finfish.find(x => x[0] === name), s = F.shellfish.find(x => x[0] === name);
  const v = f ? f[3] : s ? s[2] : null; return v && /^\d+$/.test(v) ? +v : null;
}
const isFinfish = n => F.finfish.some(f => f[0] === n);
function bagToday() {
  const key = nzDayKey(new Date()), by = {}; let fin = 0;
  for (const c of state.catches) if (c.kept && nzDayKey(new Date(c.t)) === key) { by[c.sp] = (by[c.sp] || 0) + c.n; if (isFinfish(c.sp)) fin += c.n; }
  return { by, fin };
}
function catchForm(p, markId) {
  const mk = markId && state.marks.find(x => x.id === markId); if (mk) p = mk.p;
  p = p || state.target || (state.me && [state.me.lng, state.me.lat]);
  const last = LS.get('lastSp', 'Snapper');
  showSheet(`<h2>Log a catch</h2><p class="sub">${mk ? `At 📍 ${esc(mk.name)}` : p ? llTxt(p) : 'No position: tap the map or turn on location first'}</p>
    <label class="field-l">Species</label><select id="ctSp">${ALL_SPECIES.map(s => `<option ${s === last ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <div class="pair"><div><label class="field-l">How many</label><input type="number" id="ctN" value="1" min="1" inputmode="numeric"></div><div><label class="field-l" id="ctLL">Length (cm, optional)</label><input type="number" id="ctL" inputmode="decimal"></div></div>
    <div class="seg" id="ctSex" hidden><button class="on" data-v="m">Male</button><button data-v="f">Female</button></div>
    <div class="seg" id="ctKept"><button class="on" data-v="1">Kept</button><button data-v="0">Released</button></div>
    <label class="field-l">Notes</label><input type="text" id="ctNote" placeholder="Bait, depth, tide…">
    <p class="sub" id="ctMin"></p>
    <div class="btnrow"><button class="btn" data-act="catchSave" data-lng="${p ? p[0] : ''}" data-lat="${p ? p[1] : ''}" data-mark="${mk ? mk.id : ''}">Save</button><button class="btn ghost" data-act="catchList">Today’s bag</button></div>`, { kind: 'catch' });
  const upd = () => { const sp = $('#ctSp').value, f = F.finfish.find(x => x[0] === sp), s = F.shellfish.find(x => x[0] === sp); const min = f ? f[2] : s ? s[1] : '–'; const L = limitFor(sp, p || [174.8, -41]); $('#ctMin').textContent = `Minimum size: ${min} · daily limit: ${L != null ? L : sp === 'Blue cod' ? 'check' : f ? 'within the 20 finfish' : '–'}`;
    const cray = /crayfish/i.test(sp); $('#ctLL').textContent = cray ? 'Tail width (mm)' : /pāua/i.test(sp) ? 'Shell length (mm)' : 'Length (cm, optional)'; $('#ctSex').hidden = !cray;
    if (cray) $('#ctMin').textContent += '. Return berried or soft-shelled crays.'; };
  $('#ctSp').onchange = upd; upd();
  $('#ctSex').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#ctSex').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#ctKept').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#ctKept').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
}
function catchList() {
  const bag = bagToday(), today = nzDayKey(new Date());
  const rows = Object.entries(bag.by).map(([sp, n]) => { const L = limitFor(sp, state.target || [174.8, -41]); return `<li><span class="t">${esc(sp)}</span> <b>${n}</b>${L ? ` of ${L}` : ''}${L && n >= L ? ' <span class="badge bad">limit reached</span>' : ''}</li>`; }).join('');
  const recent = state.catches.slice().sort((a, b) => b.t - a.t).slice(0, 40);
  showSheet(`<h2>Catch log</h2>
    <h3>Today’s bag (kept)</h3>
    <p>${bag.fin} of 20 finfish${bag.fin >= 20 ? ' <span class="badge bad">combined limit reached</span>' : ''}</p>
    <ul class="list">${rows || '<li class="sub">Nothing kept today.</li>'}</ul>
    <p class="sub">Your bag is per person. Counts here are only what you’ve logged on this phone.</p>
    <h3>Recent</h3>
    <ul class="list">${recent.map(c => `<li><span class="t">${esc(c.sp)} × ${c.n}</span> ${c.kept ? '' : '<span class="badge">released</span>'}${c.len ? ` · ${c.len} ${/crayfish|pāua/i.test(c.sp) ? 'mm' : 'cm'}` : ''}<br><span class="sub">${fmtDay(new Date(c.t))} ${fmtTime(new Date(c.t))}${c.tide ? ' · ' + esc(c.tide) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span> <button class="btn small ghost" data-act="catchDel" data-id="${c.id}">Delete</button></li>`).join('') || '<li class="sub">No catches logged.</li>'}</ul>
    <div class="btnrow"><button class="btn" data-act="catchNew">Log a catch</button>${state.catches.length ? '<button class="btn ghost" data-act="catchCsv">Export CSV</button>' : ''}</div>`, { tall: true, kind: 'catchlist' });
  void today;
}

/* ---------------- planner: where should I fish? ---------------- */
// Scores each spot (and each species there) for a chosen time on: season, depth, tide state, light,
// forecast wind and swell (allowing for shelter), and distance from a launch. A guide built from rules of thumb.
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// Two forecast points: the west coast (Mana–Kāpiti) and Wellington Harbour / south coast
const WX_PTS = { west: { w: [174.85, -41.0], m: [174.72, -41.0] }, south: { w: [174.83, -41.3], m: [174.8, -41.4] } };
const wxCache = {};
const wxKey = p => p[1] < -41.2 ? 'south' : 'west';
async function regionForecast(key = 'west') {
  const c = wxCache[key]; if (c && Date.now() - c.at < 30 * 60000) return c;
  if (!online()) return null;
  const q = 'timezone=UTC&forecast_days=7', P = WX_PTS[key];
  try {
    const [w, m] = await Promise.all([
      fetchT(meteoURL(`latitude=${P.w[1]}&longitude=${P.w[0]}&${q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn`), 15000).then(r => r.json()),
      fetchT(marineURL(`latitude=${P.m[1]}&longitude=${P.m[0]}&${q}&hourly=wave_height,swell_wave_height,swell_wave_direction`), 15000).then(r => r.json()).catch(() => null)
    ]);
    const t = w.hourly.time.map(x => Date.parse(x + 'Z'));
    return (wxCache[key] = { at: Date.now(), t, ws: w.hourly.wind_speed_10m, wd: w.hourly.wind_direction_10m, wg: w.hourly.wind_gusts_10m, wv: m && m.hourly ? m.hourly.wave_height : null, sw: m && m.hourly ? m.hourly.swell_wave_height : null, sd: m && m.hourly ? m.hourly.swell_wave_direction : null });
  } catch { return null; }
}
function wxAt(wx, when) {
  if (!wx) return null;
  const i = wx.t.findIndex(t => t >= +when - 30 * 60000); if (i < 0 || Math.abs(wx.t[i] - when) > 2 * 3600e3) return null;
  return { ws: wx.ws[i], wd: wx.wd[i], wg: wx.wg[i], wv: wx.wv ? wx.wv[i] : null, sw: wx.sw ? wx.sw[i] : null, sd: wx.sd ? wx.sd[i] : null };
}
function tideState(ev, when) {
  const i = ev.findIndex(e => e.t > when); if (i < 1) return null;
  const prev = ev[i - 1], next = ev[i], toChange = Math.min(when - prev.t, next.t - when);
  return { prev, next, toChange, rising: next.h > prev.h };
}
function scoreSpot(s, sp, when, mode, wx, tideEv, from) {
  const why = [], warn = [];
  const M = F.model[sp]; if (!M) return null;
  const mon = +new Intl.DateTimeFormat('en-NZ', { timeZone: TZ, month: 'numeric' }).format(when) - 1;
  // season
  const season = M.m[mon]; if (season <= 0.05) return null;
  why.push(season >= 0.9 ? `${sp} in peak season` : season >= 0.6 ? `${sp} in season` : `${sp} off-peak`);
  // depth
  const dep = depthAt(s.p), dv = dep ? (dep.spot != null && dep.spotOff < 200 ? dep.spot : dep.d + (dep.band ? 1 : 0)) : null;
  const depthS = dv == null ? 0.8 : dv >= M.d[0] - 2 && dv <= M.d[1] + 10 ? 1 : 0.45;
  const dive = mode === 'dive';
  // light
  const sun = sunTimes(when, s.p[1], s.p[0]); let light = 0.75, lightTxt = '';
  if (dive && sun && (when < sun.rise || when > sun.set)) return null;   // no night diving suggestions
  if (sun) {
    const dd = Math.min(Math.abs(when - sun.rise), Math.abs(when - sun.set));
    if (dd < 90 * 60000) { light = 1; lightTxt = Math.abs(when - sun.rise) < Math.abs(when - sun.set) ? 'dawn' : 'dusk'; }
    else if (when < sun.rise || when > sun.set) { light = M.night ? 0.8 : 0.35; lightTxt = 'dark'; }
  }
  if (dive) { light = 1; lightTxt = ''; }
  if (lightTxt === 'dawn' || lightTxt === 'dusk') why.push(`${lightTxt} feeding time`);
  if (lightTxt === 'dark') (M.night ? why : warn).push(M.night ? `${sp} bite after dark` : 'dark: poor for this species');
  // tide
  let tide = 0.75; const ts = tideEv && tideState(tideEv, when);
  if (ts) {
    const hrs = ts.toChange / 3600e3;
    if (dive) { tide = hrs < 1 ? 1 : 0.7; if (hrs < 1) why.push('near slack water: best for diving'); else warn.push('tide running: dive the slack if you can'); }
    else if (s.current) { tide = hrs < 1 ? 1 : hrs < 2 ? 0.8 : 0.55; if (hrs < 1) why.push('near slack water: easier in the current'); else warn.push('strong tidal flow'); }
    else { tide = hrs < 1.5 ? 1 : hrs < 2.5 ? 0.85 : 0.7; if (hrs < 1.5) why.push(`tide turns ${fmtTime(Math.abs(ts.next.t - when) < Math.abs(ts.prev.t - when) ? ts.next.t : ts.prev.t)}`); else why.push(`${ts.rising ? 'incoming' : 'outgoing'} tide`); }
  }
  // weather (boats and kayaks care most; rock and beach spots care about swell)
  let weather = 1; const w = wxAt(wx, when);
  if (w) {
    const dir = compass(w.wd), sheltered = (s.shelter || []).includes(dir), eff = w.ws * (sheltered ? 0.45 : 1), gust = w.wg * (sheltered ? 0.5 : 1);
    const swellExposed = w.sd == null ? true : !(s.shelter || []).includes(compass(w.sd));
    const swell = w.sw != null ? w.sw * (swellExposed ? 1 : 0.4) * (s.harbour ? 0.2 : 1) : null;   // the inner harbour is sheltered from ocean swell
    if (dive) weather = (swell == null || swell < 0.8) && eff < 15 ? 1 : (swell == null || swell < 1.2) && eff < 20 ? 0.4 : 0;
    else if (mode === 'kayak') weather = eff < 8 && gust < 14 && (swell == null || swell < 0.8) ? 1 : eff < 11 ? 0.35 : 0;
    else if (mode === 'boat') weather = eff < 12 && gust < 20 && (swell == null || swell < 1.5) ? 1 : eff < 18 && gust < 25 ? 0.45 : 0.05;
    else weather = (swell == null || swell < 1.8) && eff < 22 ? 1 : 0.5;
    const wtxt = `${dir} ${Math.round(w.ws)} kn${sheltered ? ', sheltered here' : ''}`;
    (weather >= 0.9 ? why : warn).push(weather >= 0.9 ? `wind ${wtxt}` : `wind ${wtxt}${swell != null ? `, swell ${swell.toFixed(1)} m` : ''}`);
    if (mode !== 'shore' && sheltered && w.ws >= 15) { warn.push('the run out there is exposed'); weather *= 0.8; }
  }
  // travel from the nearest launch (boats and kayaks)
  let travel = 1;
  if (mode !== 'shore' && !(dive && s.shore)) {
    const r = from ? { ...from, dist: distM(from.p, s.p) } : nearest(s.p, F.ramps)[0], km = r ? r.dist / 1000 : 99;   // chosen or nearest named launch
    if (mode === 'kayak' && km > 2.5) return null;
    if (from && km > 25) return null;
    travel = km < 5 ? 1 : km < 12 ? 0.9 : 0.8;
    why.push(`${km.toFixed(km < 10 ? 1 : 0)} km from ${r.n.replace(/ \(.*\)/, '')}`);
  }
  // legality: never recommend somewhere closed
  const z = zoneAt(s.p); if (z.hit.some(h => h.kind === 'reserve' || h.kind === 'cpz')) return null;
  if (z.near.length && z.near[0].d < 600) warn.push(`${z.near[0].kind === 'reserve' ? 'marine reserve' : 'restricted area'} ${fmtDist(z.near[0].d)} away`);
  if (sp === 'Blue cod') warn.push(`blue cod limit: ${bluecodTxt(s.p).limit === '2' ? '2 a day' : 'check'}`);
  const score = season * depthS * light * tide * weather * travel;
  return { s, sp, score, why, warn, w };
}
async function recommend(when, mode, target, from) {
  const wxs = { west: await regionForecast('west'), south: await regionForecast('south') };
  const tides = {};
  const results = [];
  for (const s of F.spots) {
    // dive: crayfish spots, shore or boat. Boat: no shore spots (crays by pot). Shore: line fishing, no crays. Kayak: as boat.
    if (mode === 'dive' ? !s.sp.includes('Crayfish') : mode === 'shore' ? !s.shore || s.dive : s.shore) continue;
    const st = nearestStation(s.p); if (!tides[st.n]) tides[st.n] = await stationEvents(st);
    let sps = mode === 'dive' ? ['Crayfish'] : s.sp.filter(x => mode !== 'shore' || x !== 'Crayfish');
    if (target !== 'Any') sps = sps.filter(x => x === target);
    const wx = wxs[wxKey(s.p)];
    const rs = sps.map(sp => scoreSpot(s, sp, when, mode, wx, tides[st.n], from)).filter(Boolean).sort((a, b) => b.score - a.score);
    if (rs.length) { const best = rs[0]; best.also = rs.slice(1).filter(x => x.score >= best.score * 0.85).map(x => x.sp).slice(0, 2); results.push(best); }
  }
  return { results: results.sort((a, b) => b.score - a.score), wx: !!(wxAt(wxs.west, when) || wxAt(wxs.south, when)) };
}
const PLAN_TIMES = [['best', 'Best time that day'], ['dawn', 'Dawn'], ['morning', 'Morning (9 am)'], ['midday', 'Midday'], ['afternoon', 'Afternoon (3 pm)'], ['dusk', 'Dusk'], ['night', 'Night (10 pm)'], ['custom', 'A set time']];
function planSheet() {
  const pr = LS.get('plan', { mode: 'boat', time: 'dawn', sp: 'Any' });
  const today = nzDayKey(new Date());
  const spp = Object.keys(F.model).filter(k => F.spots.some(s => s.sp.includes(k)));
  showSheet(`<h2>Where should I fish?</h2>
    <p class="sub">Picks spots for your time from the season, depth, tide, light, forecast wind and swell (allowing for shelter) and distance from a ramp. Choose Dive for crayfish; Boat includes crays by pot.</p>
    <div class="seg" id="plMode">${[['boat', '🚤 Boat'], ['kayak', '🛶 Kayak'], ['shore', '🎣 Shore'], ['dive', '🤿 Dive']].map(([k, l]) => `<button data-v="${k}" class="${pr.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="pair"><div><label class="field-l">Day</label><input type="date" id="plDay" value="${today}" min="${today}"></div>
    <div><label class="field-l">When</label><select id="plTime">${PLAN_TIMES.map(([k, l]) => `<option value="${k}" ${pr.time === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div id="plCustomBox" ${pr.time === 'custom' ? '' : 'hidden'}><label class="field-l">Time</label><input type="time" id="plCustom" value="${pr.custom || '06:00'}"></div>
    <label class="field-l">Launching from</label><select id="plFrom"><option value="">Nearest ramp to each spot</option>${F.ramps.map(r => `<option ${pr.from === r.n ? 'selected' : ''}>${esc(r.n)}</option>`).join('')}</select>
    <label class="field-l">Target species</label><select id="plSp"><option>Any</option>${spp.map(k => `<option ${pr.sp === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
    <div class="btnrow"><button class="btn" data-act="planGo">Recommend spots</button></div>
    <div id="plOut"></div>`, { tall: true, kind: 'plan' });
  $('#plMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#plMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#plTime').onchange = () => { $('#plCustomBox').hidden = $('#plTime').value !== 'custom'; };
}
function whenFor(day, key, custom, p) {
  const [y, mo, d] = day.split('-').map(Number), noon = nzDate(y, mo, d, 12, 0), sun = sunTimes(noon, p[1], p[0]);
  const at = (h, m = 0) => nzDate(y, mo, d, h, m);
  if (key === 'dawn') return sun ? new Date(+sun.rise - 15 * 60000) : at(6);
  if (key === 'dusk') return sun ? new Date(+sun.set - 30 * 60000) : at(20);
  if (key === 'morning') return at(9); if (key === 'midday') return at(12); if (key === 'afternoon') return at(15); if (key === 'night') return at(22);
  if (key === 'custom') { const [h, m] = (custom || '06:00').split(':').map(Number); return at(h, m); }
  return null;
}
const planGo = async () => {
  const mode = $('#plMode .on').dataset.v, key = $('#plTime').value, sp = $('#plSp').value, day = $('#plDay').value, custom = $('#plCustom').value, fromN = $('#plFrom').value;
  LS.set('plan', { mode, time: key, sp, custom, from: fromN });
  const from = mode === 'shore' || (mode === 'dive') ? null : F.ramps.find(r => r.n === fromN) || null;
  const out = $('#plOut'); out.innerHTML = '<p>Working it out…</p>';
  const centre = [174.85, -41.0];
  let when = whenFor(day, key, custom, centre), res, rolled = false;
  if (key === 'best') {   // try every 30 minutes from 4 am to 10 pm and keep the best spot-and-time
    const [y, mo, d] = day.split('-').map(Number); let top = null;
    for (let h = 4; h <= 22; h += 0.5) {
      const t = nzDate(y, mo, d, Math.floor(h), h % 1 ? 30 : 0); if (+t < Date.now() - 1800e3) continue;
      const r = await recommend(t, mode, sp, from); const sc = r.results.slice(0, 3).reduce((a, x) => a + x.score, 0);
      if (r.results.length && (!top || sc > top.sc)) top = { sc, r, t };
    }
    if (!top) { out.innerHTML = '<p>That day has passed or nothing suits. Try another day.</p>'; return; }
    when = top.t; res = top.r;
  } else {
    if (+when < Date.now() - 3600e3) {   // today's time has gone: use the same time tomorrow
      const nd = nzDayKey(new Date(+nzDate(...day.split('-').map(Number), 12, 0) + 864e5)); when = whenFor(nd, key, custom, centre); rolled = true; $('#plDay').value = nd;
    }
    res = await recommend(when, mode, sp, from);
  }
  const top = res.results.slice(0, 3);
  if (!top.length) { out.innerHTML = `<p class="warnbox">No spot suits ${mode === 'kayak' ? 'a kayak' : mode === 'dive' ? 'diving' : 'that'} for ${sp === 'Any' ? 'any species' : sp} then. Try shore fishing, another species or another time.</p>`; return; }
  const best = top[0].score;
  const rough = top[0].warn.some(x => /wind|exposed|swell/.test(x));
  const verdict = best >= 0.55 && !rough ? ['v-ok', 'Good conditions'] : best >= 0.55 ? ['v-restricted', 'Fishable, but check the weather'] : best >= 0.3 ? ['v-restricted', 'Fair: some things against you'] : ['v-no', 'Poor: consider another time'];
  out.innerHTML = `<div class="verdict ${verdict[0]}"><div><b>${verdict[1]}</b><span>${fmtDay(when)} ${fmtTime(when)}${key === 'best' ? ' is the best time that day' : ''}${rolled ? ' (that time has passed today, so this is tomorrow)' : ''}${res.wx ? '' : ' · no forecast this far out, so wind and swell aren’t included'}</span></div></div>
    <ol class="plan">${top.map((r, i) => `<li><b>${esc(r.s.n)}</b> <span class="badge">${esc([r.sp].concat(r.also || []).join(', '))}</span><div class="bar"><i style="width:${Math.round(Math.min(1, r.score / Math.max(best, 0.01)) * 100)}%"></i></div>
      <span class="sub">✓ ${r.why.map(esc).join(' · ')}</span>${r.warn.length ? `<br><span class="sub warnTxt">! ${r.warn.map(esc).join(' · ')}</span>` : ''}
      <div class="btnrow"><button class="btn small" data-act="planShow" data-i="${F.spots.indexOf(r.s)}">Show on map</button><button class="btn small ghost" data-act="tidesAt" data-lng="${r.s.p[0]}" data-lat="${r.s.p[1]}">Tides</button><button class="btn small ghost" data-act="condAt" data-lng="${r.s.p[0]}" data-lat="${r.s.p[1]}">Wind &amp; waves</button></div></li>`).join('')}</ol>
    ${mode === 'dive' ? '<p class="sub">Diving: visibility drops for days after heavy rain. Dive with a buddy and a dive flag, and leave a trip plan ashore.</p>' : ''}
    ${top.some(r => r.sp === 'Crayfish') ? '<p class="sub">🦞 Crays: tail width at least 54 mm (male) or 60 mm (female). Return berried and soft-shelled crays. By hand or loop only. 6 a day.</p>' : ''}
    <p class="sub">A guide from rules of thumb, not a guarantee. Check the marine forecast and your own judgement before going out.</p>`;
};
const planShow = b => { const s = F.spots[+b.dataset.i]; map.easeTo({ center: s.p, zoom: 12.5 }); spotSheet(+b.dataset.i); };

/* ---------------- spots, ramps, rules, safety ---------------- */
function spotSheet(i) {
  const s = F.spots[i], z = zoneAt(s.p);
  showSheet(`<h2>${s.dive ? '🦞' : s.shore ? '🎣' : '🐟'} ${esc(s.n)}</h2>
    <p><b>${esc(s.sp.join(', '))}</b><br><span class="sub">${esc(s.when)}</span></p><p>${esc(s.how)}</p>
    ${z.near.length ? `<p class="warnbox">${esc(z.near[0].kind === 'reserve' ? 'Marine reserve' : z.near[0].name)} boundary ${fmtDist(z.near[0].d)} away.</p>` : ''}
    <p class="sub">Indicative position from ${esc(s.src)}. Use your sounder and the depth contours to find the fish.</p>
    <div class="btnrow"><button class="btn" data-act="idHere" data-lng="${s.p[0]}" data-lat="${s.p[1]}">What applies here</button><button class="btn ghost" data-act="tidesAt" data-lng="${s.p[0]}" data-lat="${s.p[1]}">Tides</button><button class="btn ghost" data-act="condAt" data-lng="${s.p[0]}" data-lat="${s.p[1]}">Wind &amp; waves</button></div>`, { kind: 'spot' });
}
function guideHtml(g) {
  const sec = (h, a) => a && a.length ? `<h3>${h}</h3><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return sec('The ramp', g.ramp) + sec('Heading out', g.out) + sec('Radio', g.radio) + sec('Where to go', g.trips) + sec('Fishing rules here', g.fishing);
}
function guideSheet(key) {
  const g = F.guides[key], r = F.ramps.find(x => x.guide === key);
  showSheet(`<h2>⚓ ${esc(g.title)}</h2>${guideHtml(g)}
    <div class="btnrow">${r ? `<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${r.p[1]},${r.p[0]}&travelmode=driving" target="_blank" rel="noopener">Drive there</a><button class="btn ghost" data-act="planFrom" data-g="${key}">Where to fish from here</button><button class="btn ghost" data-act="condAt" data-lng="${r.p[0]}" data-lat="${r.p[1]}">Wind &amp; waves</button><button class="btn ghost" data-act="tidesAt" data-lng="${r.p[0]}" data-lat="${r.p[1]}">Tides</button>` : ''}</div>
    <p class="sub">From Seaview Marina, Greater Wellington’s skipper’s guide and Coastguard Wellington, checked 28 November 2026.</p>`, { tall: true, kind: 'guide' });
}
function rampSheet(i) {
  const r = rampList()[i];
  if (r.guide) { guideSheet(r.guide); return; }
  showSheet(`<h2>⚓ ${esc(r.n)}</h2>${r.note ? `<p>${esc(r.note)}</p>` : ''}<p class="sub">${llTxt(r.p)}${r.osm ? ' · from OpenStreetMap' : r.approx ? ' · approximate position' : ''}</p>
    <div class="btnrow"><a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${r.p[1]},${r.p[0]}&travelmode=driving" target="_blank" rel="noopener">Drive (Google)</a><a class="btn ghost" href="https://maps.apple.com/directions?destination=${r.p[1]},${r.p[0]}&mode=driving" target="_blank" rel="noopener">Drive (Apple)</a><button class="btn ghost" data-act="condAt" data-lng="${r.p[0]}" data-lat="${r.p[1]}">Wind &amp; waves</button></div>`, { kind: 'ramp' });
}
function rulesSheet() {
  const lim = v => v === 'BLUECOD' ? 'see below' : esc(v);
  showSheet(`<h2>Rules &amp; limits</h2>
    <p class="sub">${esc(F.area)} · checked ${esc(F.checked)}. Rules change: the <a href="https://www.mpi.govt.nz/fishing-aquaculture/recreational-fishing/fishing-rules/" target="_blank" rel="noopener">NZ Fishing Rules app</a> is the legal reference.</p>
    <h3>Finfish</h3><table class="rt"><thead><tr><th>Species</th><th>Min size</th><th>Daily</th></tr></thead><tbody>${F.finfish.map(f => `<tr><td>${esc(f[0])}${f[1] ? ` <span class="sub">${esc(f[1])}</span>` : ''}${f[4] ? `<br><span class="sub">${esc(f[4])}</span>` : ''}</td><td>${esc(f[2])}</td><td>${lim(f[3])}</td></tr>`).join('')}</tbody></table>
    <p>${esc(F.combined)}</p>
    <h3>Blue cod</h3><ul class="sub"><li>${esc(F.bluecod.fma8.label)}. This includes Kāpiti and, by MPI’s description, Mana Island.</li><li>${esc(F.bluecod.fma2.label)}</li><li>Where two limits could apply, the lower one does (reg 17A).</li></ul>
    <h3>Shellfish and crayfish</h3><table class="rt"><thead><tr><th>Species</th><th>Min size</th><th>Daily</th></tr></thead><tbody>${F.shellfish.map(s => `<tr><td>${esc(s[0])}${s[3] ? `<br><span class="sub">${esc(s[3])}</span>` : ''}</td><td>${esc(s[1])}</td><td>${esc(s[2])}</td></tr>`).join('')}</tbody></table>
    <h3>🦞 Crayfish (rock lobster)</h3><ul class="sub">${F.crayfish.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <p class="sub">Check MPI’s shellfish biotoxin alerts before gathering, and avoid harbour shellfish for a few days after heavy rain.</p>
    <h3>Closed and restricted areas</h3>
    <ul><li><b>Kāpiti Marine Reserve</b> (red): no fishing of any kind, no taking of marine life.</li><li><b>Cook Strait Cable Protection Zone</b> (purple): no fishing or anchoring, any vessel.</li>${F.zones.map(z => `<li><b>${esc(z.name)}</b> (amber): ${esc(z.text)}</li>`).join('')}<li><b>Set nets</b>: ${esc(F.setnet)}</li>${F.islands.map(i => `<li><b>${esc(i.n)}</b>: ${esc(i.text)}</li>`).join('')}</ul>
    <p class="sub">The amber Pukerua Bay outline is drawn from the legal description and closed over land; the seaward edge is what matters. Reserve and cable-zone boundaries come from DOC and Greater Wellington data.</p>
    <p class="sub">Don’t sell, swap or trade recreational catch. Report poaching: 0800 4 POACHER.</p>`, { tall: true, kind: 'rules' });
}
function safetySheet() {
  showSheet(`<h2>Safety &amp; contacts</h2><ul>${F.safety.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <div class="btnrow"><a class="btn" href="tel:111">Call 111</a><a class="btn ghost" href="tel:*500">Coastguard *500</a><a class="btn ghost" href="https://www.metservice.com/marine/regions/kapiti-wellington" target="_blank" rel="noopener">MetService marine</a></div>`, { tall: true, kind: 'safety' });
}
function layersSheet() {
  const t = (k, label, sw) => `<label class="toggle"><input type="checkbox" data-vis="${k}" ${state.vis[k] ? 'checked' : ''}><span><span class="swatch" style="background:${sw}"></span> ${label}</span></label>`;
  showSheet(`<h2>Map &amp; layers</h2>
    <div class="seg" id="baseSeg">${[['topo', 'Topo'], ['aerial', 'Aerial']].map(([k, l]) => `<button data-base="${k}" class="${state.base === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${t('reserves', 'Marine reserves (no fishing)', '#d23a2b')}${t('cpz', 'Cable protection zone (no fishing or anchoring)', '#7c3aed')}${t('zones', 'Restricted areas (Pukerua Bay)', '#d99a00')}${t('depth', 'Depth contours (LINZ chart data, not for navigation)', '#2f6fb0')}${t('fma', 'Fishery area boundary (blue cod limits)', '#6b7280')}${t('spots', 'Fishing spots', '#ff6a13')}${t('ramps', 'Boat ramps', '#0d9488')}${t('marks', 'My marks', '#1d4ed8')}
    <label class="toggle"><input type="checkbox" id="alertsT" ${state.alerts ? 'checked' : ''}><span>Boundary alerts (vibrate near reserves and the cable zone)</span></label>`, { kind: 'layers' });
}
function menuSheet() {
  showSheet(`<h2>Fish Access NZ</h2><div class="menu">
    <button data-act="plan"><span>🧭</span><span>Where should I fish?<small>Best spots for your time, boat or shore</small></span></button>
    <button data-act="guide" data-g="seaview"><span>⚓</span><span>Launching from Seaview<small>Ramp, harbour rules, radio, where to go</small></span></button>
    <button data-act="tides"><span>🌊</span><span>Tides &amp; fishing windows<small>LINZ predictions, tide changes, dawn and dusk</small></span></button>
    <button data-act="cond"><span>💨</span><span>Wind &amp; waves<small>3-day forecast for the selected spot</small></span></button>
    <button data-act="rules"><span>📏</span><span>Rules &amp; limits<small>Sizes, bag limits, closed areas</small></span></button>
    <button data-act="catchList"><span>🐟</span><span>Catch log &amp; today’s bag<small>Counts you against the daily limits</small></span></button>
    <button data-act="marks"><span>📍</span><span>Marks<small>Your saved spots, GPX for chartplotters</small></span></button>
    <button data-act="safety"><span>🛟</span><span>Safety &amp; contacts<small>Coastguard, bar crossing, cable zone</small></span></button>
    <button data-act="about"><span>ℹ</span><span>About &amp; credits<small>Data sources and disclaimer</small></span></button>
    <a href="../" class="menuLink"><span>🦌</span><span>Hunt Access NZ<small>The hunting map</small></span></a></div>`, { kind: 'menu' });
}
function aboutSheet() {
  showSheet(`<h2>About Fish Access NZ</h2>
    <p>A fishing map for the Mana–Kāpiti coast: what you can do where, tides, conditions, spots and your catch.</p>
    <h3>Credits</h3><ul class="sub">
    <li>Basemaps: Toitū Te Whenua LINZ, CC BY 4.0. Tide predictions: LINZ, CC BY 4.0.</li>
    <li>Kāpiti Marine Reserve: Department of Conservation, CC BY 4.0.</li>
    <li>Cook Strait Cable Protection Zone: Greater Wellington Regional Council.</li>
    <li>Depths, soundings and contours: Toitū Te Whenua LINZ nautical chart data (CC BY 4.0), with NIWA offshore contours. Not for navigation.</li>
    <li>Fishery area boundaries: Fisheries New Zealand (MPI) via NIWA.</li>
    <li>Boat ramps: © OpenStreetMap contributors (ODbL).</li>
    <li>${METEO_CREDIT}, CC BY 4.0.</li>
    <li>Rules: Fisheries (Recreational Management Controls) Notice No.1 2026; Fisheries (Amateur Fishing) Regulations 2013.</li></ul>
    <h3>Disclaimer</h3><p class="sub">A planning aid only. Boundaries are indicative and positions depend on your phone’s GPS. Rules change: check the NZ Fishing Rules app. Not for navigation: carry proper charts. You are responsible for your vessel, crew and catch.</p>`, { tall: true, kind: 'about' });
}

/* ---------------- sheet plumbing and actions ---------------- */
const sheet = $('#sheet'), sheetBody = $('#sheetBody'); let sheetKind = '';
function showSheet(html, { tall = false, kind = '' } = {}) { sheetBody.innerHTML = html; sheet.hidden = false; sheet.classList.toggle('tall', tall); sheetKind = kind; sheetBody.scrollTop = 0; }
function closeSheet() { sheet.hidden = true; sheetKind = ''; }
$('#sheetClose').onclick = closeSheet;
const P = b => [+b.dataset.lng, +b.dataset.lat];
const actions = {
  closeSheet, plan: planSheet, guide: b => guideSheet(b.dataset.g), planFrom: b => { const r = F.ramps.find(x => x.guide === b.dataset.g); map.easeTo({ center: r.p, zoom: 11.5 }); LS.set('plan', Object.assign(LS.get('plan', {}), { from: r.n, mode: 'boat' })); planSheet(); }, planGo, planShow, tides: () => tideSheet(), cond: () => condSheet(), rules: rulesSheet, safety: safetySheet, about: aboutSheet, marks: marksList, catchList,
  catchNew: () => catchForm(), catchAtMark: b => catchForm(null, b.dataset.id), spot: b => spotSheet(+b.dataset.i),
  idHere: b => { const p = P(b); map.easeTo({ center: p, zoom: Math.max(map.getZoom(), 12) }); identify(p); },
  tidesAt: b => tideSheet(P(b)), condAt: b => condSheet(P(b)),
  markNew: () => state.target && markForm(state.target),
  markSave: b => {
    const name = $('#mkName').value.trim() || 'Mark', note = $('#mkNote').value.trim();
    if (b.dataset.id) { const m = state.marks.find(x => x.id === b.dataset.id); if (m) Object.assign(m, { name, note }); }
    else state.marks.push({ id: uid(), p: P(b), name, note, t: Date.now() });
    saveMarks(); toast('Mark saved'); closeSheet();
  },
  markGo: b => { const m = state.marks.find(x => x.id === b.dataset.id); if (m) { map.easeTo({ center: m.p, zoom: Math.max(map.getZoom(), 13) }); markSheet(m.id); } },
  markInfo: b => { const m = state.marks.find(x => x.id === b.dataset.id); if (m) identify(m.p); },
  markEdit: b => { const m = state.marks.find(x => x.id === b.dataset.id); if (m) markForm(m.p, m); },
  markDel: async b => { if (!(await confirmDlg('Delete this mark? Catches logged here stay in your catch log.', 'Delete'))) return; state.marks = state.marks.filter(x => x.id !== b.dataset.id); state.catches.forEach(c => { if (c.markId === b.dataset.id) c.markId = null; }); LS.set('catches', state.catches); saveMarks(); closeSheet(); },
  marksGpx: () => shareFile('fish-marks.gpx', gpx(state.marks), 'application/gpx+xml'),
  catchSave: async b => {
    const sp = $('#ctSp').value, n = Math.max(1, Math.round(+$('#ctN').value || 1)), len = +$('#ctL').value || null, kept = $('#ctKept .on').dataset.v === '1';
    const p = b.dataset.lng ? P(b) : null;
    const f = F.finfish.find(x => x[0] === sp), s = F.shellfish.find(x => x[0] === sp);
    const minTxt = f ? f[2] : s ? s[1] : '', minCm = /^(\d+) cm$/.exec(minTxt);
    if (kept && len && minCm && len < +minCm[1] && !(await confirmDlg(`${sp} minimum is ${minTxt}. This one is ${len} cm. Keep it anyway?`, 'Log it'))) return;
    if (kept && len && /crayfish/i.test(sp)) { const female = $('#ctSex .on').dataset.v === 'f', need = female ? 60 : 54; if (len < need && !(await confirmDlg(`A ${female ? 'female' : 'male'} cray needs a tail width of at least ${need} mm. This one is ${len} mm. Keep it anyway?`, 'Log it'))) return; }
    if (kept && len && /pāua/i.test(sp) && len < 125 && !(await confirmDlg(`Pāua minimum is 125 mm. This one is ${len} mm. Keep it anyway?`, 'Log it'))) return;
    let tide = ''; if (p) { try { const ev = await stationEvents(nearestStation(p)); const t = tideAt(ev, new Date()); if (t) tide = (t.rising ? 'rising' : 'falling') + ' tide'; } catch {} }
    state.catches.push({ id: uid(), sp, n, len, kept, note: $('#ctNote').value.trim(), p, t: Date.now(), tide, markId: b.dataset.mark || null });
    LS.set('catches', state.catches); LS.set('lastSp', sp);
    const L = limitFor(sp, p || [174.8, -41]), bag = bagToday(), got = bag.by[sp] || 0;
    if (kept && L && got > L) toast(`Over the ${sp} limit (${got} of ${L}). Release the extra fish.`, 6000);
    else if (kept && L && got === L) toast(`${sp}: daily limit reached (${L}).`, 5000);
    else if (kept && isFinfish(sp) && bag.fin >= 20) toast(`Combined finfish limit reached (${bag.fin} of 20).`, 5000);
    else toast('Catch logged');
    if (b.dataset.mark) { renderPins(); markSheet(b.dataset.mark); } else catchList();
  },
  catchDel: async b => { if (!(await confirmDlg('Delete this catch entry?', 'Delete'))) return; state.catches = state.catches.filter(x => x.id !== b.dataset.id); LS.set('catches', state.catches); catchList(); },
  catchCsv: () => shareFile('catch-log.csv', 'date,time,species,count,length_cm,kept,lat,lon,tide,notes\n' + state.catches.map(c => { const d = new Date(c.t); return [nzDayKey(d), fmtTime(d), c.sp, c.n, c.len || '', c.kept ? 'yes' : 'no', c.p ? c.p[1].toFixed(5) : '', c.p ? c.p[0].toFixed(5) : '', c.tide || '', '"' + (c.note || '').replace(/"/g, '""') + '"'].join(','); }).join('\n'), 'text/csv')
};
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](b); } });
sheetBody.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.vis;
  if (k) { state.vis[k] = e.target.checked; LS.set('vis', state.vis); applyVis(); }
  if (e.target.id === 'alertsT') { state.alerts = e.target.checked; LS.set('alerts', state.alerts); }
});
sheetBody.addEventListener('click', e => { const b = e.target.closest('[data-base]'); if (!b) return; state.base = b.dataset.base; LS.set('base', state.base); map.setStyle(styleFor(state.base)); layersSheet(); });
function applyVis() {
  const m = { reserves: ['res-fill', 'res-line'], cpz: ['cpz-fill', 'cpz-line'], zones: ['zones-fill', 'zones-line'], depth: ['depth-line', 'darea-fill', 'snd'], fma: ['fma-line'] };
  for (const [k, ids] of Object.entries(m)) ids.forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', state.vis[k] ? 'visible' : 'none'));
  renderPins();
}
$('#btnLayers').onclick = () => sheetKind === 'layers' && !sheet.hidden ? closeSheet() : layersSheet();
$('#btnMenu').onclick = () => sheetKind === 'menu' && !sheet.hidden ? closeSheet() : menuSheet();
$('#btnTide').onclick = () => tideSheet();
$('#btnPlan').onclick = () => sheetKind === 'plan' && !sheet.hidden ? closeSheet() : planSheet();
const netChip = $('#netChip'); const net = () => { netChip.textContent = online() ? 'Online' : 'Offline'; netChip.classList.toggle('off', !online()); };
window.addEventListener('online', net); window.addEventListener('offline', net); net();

/* ---------------- start-up ---------------- */
function welcome() {
  showSheet(`<h2>Fish Access NZ</h2><p>Tap anywhere on the water to see what you can do there, the tide and nearby spots.</p>
    <ul class="sub"><li><b>Red</b>: Kāpiti Marine Reserve, no fishing</li><li><b>Purple</b>: Cook Strait cable zone, no fishing or anchoring</li><li><b>Amber</b>: Pukerua Bay, hand-held line only</li><li><b>Blue lines</b>: depth contours · <b>grey dashes</b>: where the blue cod limit changes</li><li>🐟 boat spots · 🎣 shore spots · 🦞 crayfish dive spots · ⚓ ramps</li><li><b>📍 button</b>: mark where you are and log what you catch there</li></ul>
    <p class="sub">Tap the compass button for <b>Where should I fish?</b>: the best spots for the time you want to go. Turn on the location button for live boundary alerts on the water. Covers Ōtaki to Wellington Harbour and the south coast. Launching from Seaview? See ••• → Launching from Seaview.</p>
    <p class="sub">A planning aid, not a chart. Check the NZ Fishing Rules app for the legal rules.</p>
    <div class="btnrow"><button class="btn" data-act="welcomeOk">Got it</button></div>`, { tall: true, kind: 'welcome' });
}
actions.welcomeOk = () => { LS.set('welcomed', true); closeSheet(); };
loadData().then(() => { if (!LS.get('welcomed', false)) welcome(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
window.FishMap = { map, state, actions, identify, zoneAt, fmaAt, depthAt, tideEvents, stationEvents, tideAt, nzDate, bagToday };
})();
