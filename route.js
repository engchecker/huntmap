/* Hunt Access NZ — walking route planner.
   Car stop (snapped to a public road) → optional via points → destination. Finds the quickest walking line
   over a terrain grid built from LINZ elevation and Topo data (the same grids Find animals uses):
   - speed from slope with Tobler's hiking function (5 km/h on the flat, uphill/downhill asymmetric),
     reduced off-track by vegetation (open tussock fast, scrub slow), full speed on tracks and roads;
   - stream crossings add time; lakes and wide rivers, mapped bluffs and slopes over ~45° are avoided;
   - land you have no right to cross (not DOC land, a legal road, marginal strip, easement or other public
     access) is blocked unless you tick “I have permission”.
   Works offline in saved areas (Topo + Terrain). A planned line to check on the ground, not a guarantee. */
(() => {
'use strict';
const A = window.HuntMap;
if (!A || !A.model) return;
const { map, state, actions, showSheet, closeSheet, toast, distM, fmtDist, esc, setNav } = A;
const rad = Math.PI / 180, WORLD = 256 * 2 ** 13;
const lng2w = lng => (lng + 180) / 360 * WORLD;
const lat2w = lat => (1 - Math.log(Math.tan(lat * rad) + 1 / Math.cos(lat * rad)) / Math.PI) / 2 * WORLD;
const w2lng = x => x / WORLD * 360 - 180;
const w2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / WORLD))) / rad;
const EMPTY = { type: 'FeatureCollection', features: [] };
const PUBLIC_IDS = ['pcl', 'hunt', 'road', 'marg', 'ease', 'res', 'parks', 'other'];
// off-track speed factor by Topo cover class (open, scattered scrub, scrub, native, exotic, swamp, rock, ice, water, sand)
const VEG_F = [0.6, 0.45, 0.22, 0.4, 0.45, 0.3, 0.45, 0.15, 0.05, 0.55];
const VEG_NAME = ['open country', 'scattered scrub', 'scrub', 'native bush', 'pine forest', 'wetland', 'scree/rock', 'ice/snow', 'water', 'sand'];

const W = { car: null, dest: null, via: [], perm: false, res: null, mode: null };

/* ---------- map display ---------- */
function ensureLayers() {
  if (!map.getSource('walk')) map.addSource('walk', { type: 'geojson', data: EMPTY });
  if (!map.getSource('walk-pts')) map.addSource('walk-pts', { type: 'geojson', data: EMPTY });
  if (!map.getLayer('walk-casing')) map.addLayer({ id: 'walk-casing', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 } });
  if (!map.getLayer('walk-line')) map.addLayer({ id: 'walk-line', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'k'], 'private', '#e11d48', 'steep', '#f59e0b', '#6d28d9'], 'line-width': 4 } });
  if (!map.getLayer('walk-pt')) map.addLayer({ id: 'walk-pt', type: 'circle', source: 'walk-pts', paint: { 'circle-radius': 8, 'circle-color': ['match', ['get', 'k'], 'car', '#1d4ed8', 'dest', '#be123c', '#6d28d9'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
}
map.on('style.load', () => setTimeout(() => { ensureLayers(); drawAll(); }, 350));
function drawAll() {
  if (!map.getSource('walk')) ensureLayers();
  const pts = [];
  if (W.car) pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: W.car }, properties: { k: 'car' } });
  W.via.forEach(v => pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: { k: 'via' } }));
  if (W.dest) pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: W.dest }, properties: { k: 'dest' } });
  map.getSource('walk-pts').setData({ type: 'FeatureCollection', features: pts });
  map.getSource('walk').setData(W.res ? { type: 'FeatureCollection', features: W.res.segs } : EMPTY);
}

/* ---------- picking points ---------- */
const nearestOnLines = (p, fc) => {
  let best = null;
  for (const f of (fc && fc.features) || []) {
    const g = f.geometry; if (!g) continue;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of parts) { let prev = A.xy(line[0], p); for (let i = 1; i < line.length; i++) { const cur = A.xy(line[i], p), [d, q] = A.segDist([0, 0], prev, cur); if (!best || d < best.d) best = { d, q, f }; prev = cur; } }
  }
  if (best) best.q = [p[0] + best.q[0] / (Math.cos(p[1] * rad) * 111320), p[1] + best.q[1] / 110540];
  return best;
};
async function snapToRoad(p) {
  const d = 0.012, bb = [p[0] - d * 1.4, p[1] - d, p[0] + d * 1.4, p[1] + d];
  const fc = await A.dataFor('rdl', bb).catch(() => EMPTY);
  const n = nearestOnLines(p, fc);
  return n && n.d < 400 ? { p: n.q, name: (n.f.properties || {}).full_road_name || '', d: n.d } : { p, name: '', d: null };
}
async function roadNear(dest) {
  for (const d of [0.012, 0.03, 0.07]) {
    const bb = [dest[0] - d * 1.4, dest[1] - d, dest[0] + d * 1.4, dest[1] + d];
    const fc = await A.dataFor('rdl', bb).catch(() => EMPTY), n = nearestOnLines(dest, fc);
    if (n) return { p: n.q, name: (n.f.properties || {}).full_road_name || '', d: n.d };
  }
  return null;
}
A.modeTap.walkCar = async p => {
  state.mode = null; toast('Finding the nearest public road…', 1500);
  const s = await snapToRoad(p); W.car = s.p; W.carName = s.name; W.res = null; drawAll();
  if (s.d == null) toast('No mapped public road within 400 m. Car stop left where you tapped: check it’s legal to park there.', 5000);
  sheet();
};
A.modeTap.walkDest = p => { state.mode = null; W.dest = p; W.destName = ''; W.res = null; drawAll(); sheet(); };
A.modeTap.walkVia = p => { state.mode = null; W.via.push(p); W.res = null; drawAll(); sheet(); };

/* ---------- the router ---------- */
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const pi = (i - 1) >> 1; if (k[pi] <= key) break; k[i] = k[pi]; v[i] = v[pi]; i = pi; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(); const n = k.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; }
  get size() { return this.k.length; }
}
const tobler = g => 6 * Math.exp(-3.5 * Math.abs(g + 0.05));   // km/h for gradient g (dh/dx)

async function plan(prog) {
  const pts = [W.car, ...W.via, W.dest];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const span = Math.max(distM([x0, y0], [x1, y0]), distM([x0, y0], [x0, y1]));
  if (span > 25000) throw new Error('far');
  const pad = Math.max(800, span * 0.25), dLat = pad / 110540, dLng = pad / (111320 * Math.cos(((y0 + y1) / 2) * rad));
  const bb = [x0 - dLng, y0 - dLat, x1 + dLng, y1 + dLat];
  prog('Reading terrain, cover, streams and tracks…');
  const T = await A.model.terrain(bb, (f, m) => prog(m));
  const { G, E, V } = T, N = G.W * G.H, cm = G.cellM;
  prog('Checking which land you can cross…');
  const fcs = await Promise.all(PUBLIC_IDS.map(id => A.dataFor(id, bb).catch(() => EMPTY)));
  const pub0 = A.model.raster(G, fcs, () => true).m, pub = new Uint8Array(N);
  // grow public land by one cell so thin road parcels and 20 m strips stay connected on the grid
  for (let j = 0; j < G.H; j++) for (let i = 0; i < G.W; i++) { const k = j * G.W + i; if (!pub0[k]) continue; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni >= 0 && nj >= 0 && ni < G.W && nj < G.H) pub[nj * G.W + ni] = 1; } }
  // per-cell base pace multiplier (higher = faster) and blocks
  const fac = new Float32Array(N), cross = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const v = V.veg[k];
    let f = VEG_F[v] ?? 0.4;
    if (V.track[k] || V.road[k]) f = 1;                   // on a track or road
    if (V.cliff[k] || V.bldg[k]) f = 0;                   // mapped bluff or building
    if (T.slope[k] > 45) f = Math.min(f, 0.02);
    if (!pub[k] && !W.perm) f = 0;                        // no right to cross
    fac[k] = f;
    cross[k] = V.water[k] && v !== 8 ? 120 : 0;           // seconds added to ford a mapped stream
  }
  const cellOf = p => { const i = Math.floor((lng2w(p[0]) - G.x0) / G.s), j = Math.floor((lat2w(p[1]) - G.y0) / G.s); return Math.max(0, Math.min(G.H - 1, j)) * G.W + Math.max(0, Math.min(G.W - 1, i)); };
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const legs = [];
  for (let L = 0; L < pts.length - 1; L++) {
    prog(`Finding the best line${pts.length > 2 ? ` (leg ${L + 1} of ${pts.length - 1})` : ''}…`);
    const s = cellOf(pts[L]), t = cellOf(pts[L + 1]);
    const save = [fac[s], fac[t]]; fac[s] = Math.max(fac[s], 0.3); fac[t] = Math.max(fac[t], 0.3);   // always allow the end cells
    const cost = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N), h = new Heap();
    const ti = t % G.W, tj = (t / G.W) | 0;
    const heur = k => Math.hypot(k % G.W - ti, ((k / G.W) | 0) - tj) * cm / (6000 / 3600);   // optimistic: 6 km/h straight
    cost[s] = 0; h.push(heur(s), s);
    while (h.size) {
      const k = h.pop(); if (done[k]) continue; done[k] = 1; if (k === t) break;
      const i = k % G.W, j = (k / G.W) | 0, ek = E[k];
      for (const [di, dj, m] of NB) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= G.W || nj >= G.H) continue;
        const n = nj * G.W + ni; if (done[n]) continue;
        const f = Math.min(fac[k], fac[n]); if (f <= 0) continue;
        const dx = m * cm, dh = Number.isFinite(E[n]) && Number.isFinite(ek) ? E[n] - ek : 0;
        const v = tobler(dh / dx) * f;                                   // km/h
        const c = cost[k] + Math.hypot(dx, dh) / (v / 3.6) + cross[n];  // seconds
        if (c < cost[n]) { cost[n] = c; from[n] = k; h.push(c + heur(n), n); }
      }
    }
    fac[s] = save[0]; fac[t] = save[1];
    if (!Number.isFinite(cost[t])) throw new Error(W.perm ? 'blocked' : 'private');
    const cells = []; for (let k = t; k !== -1; k = from[k]) cells.push(k); cells.reverse();
    legs.push({ cells, secs: cost[t] });
  }
  // build the line and stats
  const cellP = k => [w2lng(G.x0 + ((k % G.W) + 0.5) * G.s), w2lat(G.y0 + (((k / G.W) | 0) + 0.5) * G.s)];
  const all = []; legs.forEach((l, i) => all.push(...(i ? l.cells.slice(1) : l.cells)));
  const coords = all.map(cellP); coords[0] = W.car; coords[coords.length - 1] = W.dest;
  let dist = 0, up = 0, down = 0, streams = 0, privM = 0, steepM = 0, trackM = 0, prevWater = false;
  const vegM = new Float64Array(10), prof = [{ d: 0, z: E[all[0]] }];
  const segs = []; let cur = null;
  for (let n = 1; n < all.length; n++) {
    const a = all[n - 1], b = all[n], dd = distM(coords[n - 1], coords[n]);
    dist += dd; const dz = (E[b] || 0) - (E[a] || 0); if (dz > 0) up += dz; else down -= dz;
    prof.push({ d: dist, z: E[b] });
    const isW = !!(V.water[b] && V.veg[b] !== 8); if (isW && !prevWater) streams++; prevWater = isW;
    const kind = !pub[b] ? 'private' : T.slope[b] > 30 ? 'steep' : 'ok';
    if (kind === 'private') privM += dd; if (kind === 'steep') steepM += dd;
    if (V.track[b] || V.road[b]) trackM += dd; else vegM[V.veg[b]] += dd;
    if (!cur || cur.properties.k !== kind) { cur = { type: 'Feature', properties: { k: kind }, geometry: { type: 'LineString', coordinates: [coords[n - 1]] } }; segs.push(cur); }
    cur.geometry.coordinates.push(coords[n]);
  }
  const ok = prof.filter(x => Number.isFinite(x.z));
  const pr = ok.length > 1 ? { pts: ok, up, down, min: Math.min(...ok.map(x => x.z)), max: Math.max(...ok.map(x => x.z)), total: dist } : null;
  const secs = legs.reduce((a, l) => a + l.secs, 0);
  const cover = [...vegM].map((m, i) => [VEG_NAME[i], m]).filter(x => x[1] > 50).sort((a, b) => b[1] - a[1]);
  return { coords, segs, dist, up, down, secs, streams, privM, steepM, trackM, cover, pr, cellM: cm };
}

/* ---------- sheet ---------- */
const fmtH = s => { const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
const ll = p => `${p[1].toFixed(5)}, ${p[0].toFixed(5)}`;
function sheet(extra = '') {
  const r = W.res;
  const rows = `<dl class="kv"><dt>Car stop</dt><dd>${W.car ? esc(W.carName || ll(W.car)) : '<i>not set</i>'}</dd>${W.via.map((v, i) => `<dt>Via ${i + 1}</dt><dd>${ll(v)}</dd>`).join('')}<dt>Destination</dt><dd>${W.dest ? esc(W.destName || ll(W.dest)) : '<i>not set</i>'}</dd></dl>`;
  const res = r ? `<h3>Route</h3><dl class="kv"><dt>Distance</dt><dd>${fmtDist(r.dist)}</dd><dt>Climb</dt><dd>↑ ${Math.round(r.up)} m · ↓ ${Math.round(r.down)} m</dd><dt>Time</dt><dd>about ${fmtH(r.secs)} one way</dd>
      <dt>On tracks/roads</dt><dd>${fmtDist(r.trackM)}</dd><dt>Off track</dt><dd>${r.cover.slice(0, 3).map(([n, m]) => `${esc(n)} ${fmtDist(m)}`).join(', ') || '—'}</dd><dt>Streams</dt><dd>${r.streams} crossing${r.streams === 1 ? '' : 's'}</dd></dl>
      ${r.pr ? A.profileSvg(r.pr) : ''}
      ${r.privM > 20 ? `<p class="warnbox">${fmtDist(r.privM)} crosses private land (red on the map). Only use it with the landowner’s permission.</p>` : ''}
      ${r.steepM > 50 ? `<p class="warnbox">${fmtDist(r.steepM)} is steeper than 30° (amber on the map).</p>` : ''}
      ${r.streams ? '<p class="sub">Never cross a flooded river. Stream crossings assume normal flows.</p>' : ''}
      <div class="btnrow"><button class="btn" data-act="walkFollow">Start: drive, then walk</button><button class="btn ghost" data-act="walkSave">Save route</button><button class="btn ghost" data-act="walkGpx">GPX</button></div>
      <div class="btnrow"><a class="btn ghost" href="https://maps.apple.com/directions?destination=${W.car[1]},${W.car[0]}&mode=driving" target="_blank" rel="noopener">Drive to car stop (Apple)</a><a class="btn ghost" href="https://www.google.com/maps/dir/?api=1&destination=${W.car[1]},${W.car[0]}&travelmode=driving" target="_blank" rel="noopener">(Google)</a></div>` : '';
  showSheet(`<h2>Walking route</h2><p class="sub">Set a car stop on a public road and a destination. The app finds the quickest walking line over the terrain, using tracks where they help and keeping to land you can legally cross.</p>
    ${rows}
    <div class="btnrow"><button class="btn ${W.car ? 'ghost' : ''} small" data-act="walkPick" data-m="walkCar">${W.car ? 'Move' : 'Set'} car stop</button><button class="btn ${W.dest ? 'ghost' : ''} small" data-act="walkPick" data-m="walkDest">${W.dest ? 'Move' : 'Set'} destination</button><button class="btn ghost small" data-act="walkPick" data-m="walkVia">Add via point</button>${W.via.length ? '<button class="btn ghost small" data-act="walkViaClear">Clear vias</button>' : ''}${state.me ? '<button class="btn ghost small" data-act="walkCarMe">Car stop = my location</button>' : ''}</div>
    <label class="toggle"><input type="checkbox" id="walkPerm" ${W.perm ? 'checked' : ''}>I have permission to cross private land on this trip</label>
    <div class="btnrow"><button class="btn" data-act="walkGo" ${W.car && W.dest ? '' : 'disabled'}>Find route</button>${W.car || W.dest ? '<button class="btn ghost" data-act="walkClear">Clear</button>' : ''}</div>
    ${extra}${res}
    <p class="sub">Built from LINZ elevation and Topo data on a ${r ? Math.round(r.cellM) + ' m' : '15–30 m'} grid. It can’t see windfall, small bluffs, river levels or recent slips: check the line on Aerial and on the ground. Offline it needs the area saved with Topo and Terrain.</p>`, { tall: true, kind: 'walk' });
}
actions.mWalk = () => { ensureLayers(); sheet(); };
actions.walkPick = b => { state.mode = b.dataset.m; closeSheet(); toast(b.dataset.m === 'walkCar' ? 'Tap the road where you’ll park' : b.dataset.m === 'walkDest' ? 'Tap where you want to get to' : 'Tap a point the route must pass', 3500); };
actions.walkCarMe = async () => { const s = await snapToRoad([state.me.lng, state.me.lat]); W.car = s.p; W.carName = s.name || 'My location'; W.res = null; drawAll(); sheet(); };
actions.walkViaClear = () => { W.via = []; W.res = null; drawAll(); sheet(); };
actions.walkClear = () => { W.car = W.dest = null; W.via = []; W.res = null; stopFollow(); drawAll(); sheet(); };
let busy = false;
actions.walkGo = async () => {
  if (busy) return; W.perm = !!(document.querySelector('#walkPerm') || {}).checked; busy = true;
  const prog = m => showSheet(`<h2>Finding a route…</h2><p class="sub">${esc(m)}</p>`, { kind: 'walk', mini: true });
  try {
    W.res = await plan(prog); drawAll(); sheet();
    const b = W.res.coords.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [180, 90, -180, -90]);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 70, bottom: 360, left: 40, right: 70 }, maxZoom: 15 });
  } catch (e) {
    const m = String(e && e.message);
    sheet(`<p class="warnbox">${m === 'private' ? 'No route found that stays on land you can legally cross. Try another car stop or via point, or tick “I have permission” if you have it.' : m === 'blocked' ? 'No passable route found: the way may be blocked by bluffs, lakes or very steep ground. Try a via point.' : m === 'far' ? 'Points are too far apart (over 25 km). Use a closer car stop or plan it in legs.' : m === 'terrain' ? 'Terrain data isn’t available here. Get a signal, or save the area with Topo and Terrain ticked.' : 'Couldn’t plan the route. Try again.'}</p>`);
  } finally { busy = false; }
};
actions.walkSave = async () => {
  const r = W.res; if (!r) return;
  const name = 'Walk to ' + (W.destName || ll(W.dest)) + (W.carName ? ' from ' + W.carName : '');
  await A.saveRoute({ id: A.uid(), name, pts: simplify(r.coords, 8), dist: r.dist, climb: r.up, desc: r.down, t: Date.now() });
  toast('Route saved under Route planner');
};
actions.walkGpx = () => { const r = W.res; if (r) A.shareFile('walking-route.gpx', A.buildGpx({ rtes: [{ name: 'Walking route', pts: simplify(r.coords, 8) }], wpts: [{ name: 'Car stop', lng: W.car[0], lat: W.car[1], type: 'vehicle' }, { name: 'Destination', lng: W.dest[0], lat: W.dest[1], type: 'note' }] })); };

/* follow: arrow to the destination plus an off-route warning */
let followTimer = null, warned = 0;
function stopFollow() { clearInterval(followTimer); followTimer = null; }
actions.walkFollow = () => {
  const r = W.res; if (!r) return;
  stopFollow(); closeSheet();
  const me = state.me ? [state.me.lng, state.me.lat] : null;
  let stage = me && distM(me, W.car) > 300 ? 'drive' : 'walk';
  if (stage === 'drive') { setNav('Car stop' + (W.carName ? ' (' + W.carName + ')' : ''), W.car); toast('Arrow points to the car stop. Use “Drive to car stop” for road directions; it switches to the walk when you get there.', 5000); }
  else { setNav(W.destName || 'Destination', W.dest); toast('Following the route. You’ll get a warning if you stray more than 100 m from it.', 4000); }
  followTimer = setInterval(() => {
    if (!state.me || !W.res) return;
    const p = [state.me.lng, state.me.lat];
    if (stage === 'drive') {
      if (distM(p, W.car) < 150) { stage = 'walk'; setNav(W.destName || 'Destination', W.dest); toast('At the car stop. Now following the walking route.', 5000); if (navigator.vibrate) navigator.vibrate(300); }
      return;
    }
    let best = Infinity;
    for (let i = 1; i < r.coords.length; i++) { const a = A.xy(r.coords[i - 1], p), b = A.xy(r.coords[i], p); best = Math.min(best, A.segDist([0, 0], a, b)[0]); }
    if (best > 100 && Date.now() - warned > 60000) { warned = Date.now(); toast(`Off route: ${fmtDist(best)} from the planned line`, 5000); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
  }, 5000);
};
function simplify(pts, tol) {          // Douglas–Peucker in metres
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = A.segDist(A.xy(pts[i], pts[a]), [0, 0], A.xy(pts[b], pts[a]))[0]; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* “Get me there”: car stop on the nearest public road to the destination, then plan the walk */
A.getMeThere = async (dest, name) => {
  ensureLayers(); W.dest = dest; W.destName = name || ''; W.via = []; W.res = null;
  showSheet(`<h2>Getting you there…</h2><p class="sub">Finding the nearest public road to ${esc(name || 'the spot')}…</p>`, { kind: 'walk', mini: true });
  const road = await roadNear(dest);
  if (!road) { W.car = null; drawAll(); sheet('<p class="warnbox">No mapped public road found within about 7 km. Set the car stop yourself.</p>'); return; }
  W.car = road.p; W.carName = road.name; drawAll();
  await actions.walkGo();
};

/* entry points from other tools */
A.walkTo = (dest, name, carHint) => { ensureLayers(); W.dest = dest; W.destName = name || ''; W.res = null; if (carHint && !W.car) { W.car = carHint.p; W.carName = carHint.name || ''; } drawAll(); sheet(); };
actions.walkTo = b => A.walkTo([+b.dataset.lng, +b.dataset.lat], b.dataset.name || '', b.dataset.clng ? { p: [+b.dataset.clng, +b.dataset.clat], name: b.dataset.cname || '' } : null);
A.walk = { plan, state: W, simplify };
})();
