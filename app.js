/* Hunt Access NZ — offline-capable land access map for hunters.
   Data: DOC Open Data, LINZ (Basemaps, cadastre), Herenga ā Nuku Public Access Areas, Open-Meteo.
   Guidance only — not a legal boundary survey. */
(() => {
'use strict';

/* ---------------- utilities ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ham.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ham.' + k, JSON.stringify(v)); } catch {} }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const online = () => navigator.onLine !== false;
function fetchT(url, ms = 15000, opts = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
function confirmDlg(text, yes = 'OK') {
  return new Promise(res => {
    $('#dlgText').textContent = text; $('#dlgYes').textContent = yes; $('#dlg').hidden = false;
    const done = v => { $('#dlg').hidden = true; $('#dlgYes').onclick = $('#dlgNo').onclick = null; res(v); };
    $('#dlgYes').onclick = () => done(true); $('#dlgNo').onclick = () => done(false);
  });
}
const TZ = 'Pacific/Auckland';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '';
const fmtTime = d => new Date(d).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* geometry */
const R = 6371008.8, rad = Math.PI / 180;
function distM(a, b) {
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad);
  const x = Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
const compass = d => ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d / 22.5) % 16];
const fmtDist = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyContains(coords, x, y) {
  if (!ringContains(coords[0], x, y)) return false;
  for (let k = 1; k < coords.length; k++) if (ringContains(coords[k], x, y)) return false;
  return true;
}
function featContains(f, p) {
  const g = f && f.geometry; if (!g) return false;
  if (g.type === 'Polygon') return polyContains(g.coordinates, p[0], p[1]);
  if (g.type === 'MultiPolygon') return g.coordinates.some(c => polyContains(c, p[0], p[1]));
  return false;
}
function circlePoly(c, r, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const dx = r * Math.cos(a), dy = r * Math.sin(a);
    pts.push([c[0] + dx / (111320 * Math.cos(c[1] * rad)), c[1] + dy / 110540]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
}
const bboxIntersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const bboxContains = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/* NZTM2000 <-> WGS84 (transverse Mercator, GRS80) */
const TM = { a: 6378137, f: 1 / 298.257222101, k0: 0.9996, lon0: 173 * rad, FE: 1600000, FN: 10000000 };
TM.e2 = 2 * TM.f - TM.f * TM.f; TM.ep2 = TM.e2 / (1 - TM.e2);
function llToNZTM(lng, lat) {
  const { a, e2, ep2, k0, lon0, FE, FN } = TM, phi = lat * rad, lam = lng * rad;
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, A = (lam - lon0) * c;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const E = FE + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
  const No = FN + k0 * (M + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return [E, No];
}
function nztmToLL(E, No) {
  const { a, e2, ep2, k0, lon0, FE, FN } = TM;
  const M = (No - FN) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), D = (E - FE) / (N1 * k0);
  const lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return [lon / rad, lat / rad];
}

/* sun times (after the public-domain SunCalc method) */
function sunTimes(date, lat, lng, alt = -0.833) {
  const J1970 = 2440588, J2000 = 2451545, day = 86400000, e = rad * 23.4397;
  const toDays = d => d.valueOf() / day - 0.5 + J1970 - J2000;
  const fromJ = j => new Date((j + 0.5 - J1970) * day);
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosw = (Math.sin(alt * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosw < -1 || cosw > 1) return null;
  const w = Math.acos(cosw);
  const Jset = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { rise: fromJ(Jnoon - (Jset - Jnoon)), set: fromJ(Jset) };
}

/* ---------------- configuration ---------------- */
const DOC = 'https://services1.arcgis.com/3JjYDyG3oajxU6HO/ArcGIS/rest/services/';
const LINZ = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/arcgis/rest/services/';
const PAA = 'https://services2.arcgis.com/b5ADKIcWivL5vNaV/ArcGIS/rest/services/Public_Access_Areas/FeatureServer/';
const BM = 'https://basemaps.linz.govt.nz';
const URLS = {
  titles: LINZ + 'LINZ_NZ_Property_Titles/FeatureServer/0',
  addresses: LINZ + 'LINZ_NZ_Addresses/FeatureServer/0',
  roads: LINZ + 'LINZ_NZ_Addresses_Roads/FeatureServer/0',
  places: LINZ + 'LINZ_NZ_Place_Names/FeatureServer/0'
};
const LINKS = {
  docPermit: 'https://permits-licences.doc.govt.nz/open-area-hunting/pick-regions',
  docHunting: 'https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/',
  lrs: 'https://lrs.linz.govt.nz/search/',
  lrsInfo: 'https://www.linz.govt.nz/products-services/land-records/land-record-search',
  haNuku: 'https://www.herengaanuku.govt.nz/types-of-access/unformed-legal-roads',
  adventure: 'https://www.adventuresmart.nz/',
  linzKey: 'https://basemaps.linz.govt.nz/'
};
const SPECIES = window.SPECIES || [];
const LAYERS = [
  { id: 'pcl', group: 'pcl', minz: 9, max: 1000, url: DOC + 'DOC_Public_Conservation_Land/FeatureServer/0', fields: 'Name,Type,Legislation,Section,Local_Purpose' },
  { id: 'hunt', group: 'hunt', minz: 7, url: DOC + 'DOC_Recreational_Hunting_Areas/FeatureServer/0', fields: 'HuntBlockName,PermitArea,BlockType,HuntStatus,DateConditions,AccessConditions,DogConditions,SpecialConditions,HuntingWebPage,Conservancy' },
  { id: 'road', group: 'paa', minz: 12, url: PAA + '1', fields: 'paa_type,public_access,managed_by,common_name,appellation,statutory_purpose' },
  { id: 'ease', group: 'paa', minz: 11, url: PAA + '2', fields: 'paa_type,public_access,managed_by,common_name,statutory_purpose' },
  { id: 'res', group: 'paa', minz: 11, url: PAA + '3', fields: 'paa_type,public_access,managed_by,common_name,statutory_purpose' },
  { id: 'parks', group: 'paa', minz: 11, url: PAA + '5', fields: 'paa_type,public_access,managed_by,common_name,statutory_purpose' },
  { id: 'other', group: 'paa', minz: 11, url: PAA + '6', fields: 'paa_type,public_access,managed_by,common_name,statutory_purpose' },
  { id: 'parcels', group: 'parcels', minz: 13, url: LINZ + 'LINZ_NZ_Primary_Parcels/FeatureServer/0', fields: 'appellation,parcel_intent,land_district,titles,calc_area', pages: 8 },
  { id: 'pestWill', group: 'pest', minz: 7, url: DOC + 'Pesticides_WillBeLaid_HFV/FeatureServer/0', fields: 'BlockName,Pesticide,PesticideTradeName,MethodName,StartDate,FinishDate,LeadAgency,CautionPeriod' },
  { id: 'pestHave', group: 'pest', minz: 7, url: DOC + 'Pesticides_HaveBeenLaid_HFV/FeatureServer/0', fields: 'BlockName,Pesticide,PesticideTradeName,MethodName,StartDate,FinishDate,LeadAgency,CautionPeriod' },
  { id: 'huts', group: 'huts', minz: 9, url: DOC + 'DOC_Huts_Open_Data/FeatureServer/0', fields: '*' },
  { id: 'camps', group: 'huts', minz: 9, url: DOC + 'DOC_Campsites_Open_Data/FeatureServer/0', fields: '*' },
  { id: 'tracks', group: 'huts', minz: 10, url: DOC + 'DOC_Tracks_Open_Data/FeatureServer/0', fields: '*' },
  { id: 'addr', group: 'safety', minz: 99, url: LINZ + 'LINZ_NZ_Addresses/FeatureServer/0', fields: 'full_address', pages: 8, max: 2000 },
  { id: 'rdl', group: 'safety', minz: 99, url: LINZ + 'LINZ_NZ_Addresses_Roads/FeatureServer/0', fields: 'full_road_name', pages: 6, max: 2000 },
  ...SPECIES.map(s => ({ id: 'sp_' + s.key, group: 'species', sp: s, minz: 5, url: DOC + s.svc + '/FeatureServer/0', fields: 'CommonName,PA', where: "PA='Presence'" }))
];
const LBY = Object.fromEntries(LAYERS.map(l => [l.id, l]));
const BASEMAPS = {
  topo: { label: 'Topo', note: 'Roads, names, tracks', style: k => `${BM}/v1/styles/topographic-v2.json?api=${k}`, vector: true },
  topo50: { label: 'Topo50', note: 'Classic printed map', raster: k => `${BM}/v1/tiles/topo-raster/3857/{z}/{x}/{y}.webp?api=${k}`, maxz: 16 },
  aerial: { label: 'Aerial', note: 'Imagery + labels', style: k => `${BM}/v1/styles/aerialhybrid.json?api=${k}`, vector: true }
};
const WP_TYPES = { vehicle: ['Vehicle', '#1d4ed8'], camp: ['Camp / hut', '#0d9488'], sighting: ['Sighting', '#d97706'], kill: ['Kill', '#be123c'], access: ['Access point', '#7c3aed'], note: ['Note', '#475569'] };

/* ---------------- state ---------------- */
const state = {
  base: LS.get('base', 'topo'),
  vis: Object.assign({ pcl: true, hunt: true, paa: true, priv: true, parcels: true, pest: true, access: true, wps: true, huts: true, routes: true, log: true, hill: false, slope: false, sun: false }, LS.get('vis', {})),
  strength: LS.get('strength', 1), fade: LS.get('fade', 0),
  sp: LS.get('sp', {}),
  alerts: LS.get('alerts', true),
  key: LS.get('linzKey', ''),
  me: null, follow: false, watchId: null, target: null,
  loaded: {}, gen: 0, areas: [], wps: [], perms: [],
  lastStatus: null, lastStatusAt: 0, lastStatusPos: null, lastOnlineCheck: 0
};

/* LINZ standard keys are a 'c' + ULID, as created by basemaps.linz.govt.nz itself (standard access tier). */
function makeKey() {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let t = Date.now(), ts = '';
  for (let i = 0; i < 10; i++) { ts = A[t % 32] + ts; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16)); let rs = '';
  for (const b of r) rs += A[b % 32];
  return ('c' + ts + rs).toLowerCase();
}
function keyAgeDays(k) {
  if (!k || k[0] !== 'c') return 0;
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let t = 0;
  for (const ch of k.slice(1, 11).toUpperCase()) t = t * 32 + A.indexOf(ch);
  return (Date.now() - t) / 864e5;
}
if (!state.key || (state.key[0] === 'c' && keyAgeDays(state.key) > 85)) { state.key = makeKey(); LS.set('linzKey', state.key); }

/* ---------------- IndexedDB ---------------- */
const DB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('huntmap', 2);
      r.onupgradeneeded = () => { const d = r.result; ['areas', 'wps', 'perms', 'tracks', 'routes', 'log'].forEach(s => d.objectStoreNames.contains(s) || d.createObjectStore(s, { keyPath: 'id' })); };
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
  },
  all(s) { return this.tx(s, 'readonly', st => st.getAll()).then(v => v || []); },
  put(s, o) { return this.tx(s, 'readwrite', st => st.put(o)); },
  del(s, id) { return this.tx(s, 'readwrite', st => st.delete(id)); }
};

/* ---------------- ArcGIS queries ---------------- */
function simplifyDeg(z, lat) { return (156543.03 * Math.cos(lat * rad) / 2 ** z) / 111320; }
async function agsQuery(url, params, { pages = 4, timeout = 20000, rec = 1000 } = {}) {
  const base = { f: 'geojson', outSR: 4326, where: '1=1', outFields: '*', ...params };
  let all = [], offset = 0;
  for (let p = 0; p < pages; p++) {
    const q = new URLSearchParams({ ...base, resultOffset: offset, resultRecordCount: rec });
    const r = await fetchT(url + '/query?' + q, timeout);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'Query error');
    const feats = j.features || [];
    all = all.concat(feats);
    const more = j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit);
    if (!more || !feats.length) break;
    offset += feats.length;
  }
  return { type: 'FeatureCollection', features: all };
}
function bboxParams(b, L, z, lat) {
  const p = { geometry: b.join(','), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: L.fields };
  if (L.where) p.where = L.where;
  if (z != null) p.maxAllowableOffset = simplifyDeg(z, lat).toPrecision(3);
  return p;
}
function pointParams(p, L, geom = false) {
  const o = { geometry: p[0] + ',' + p[1], geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: L.fields || '*', returnGeometry: geom };
  if (L.where) o.where = L.where;
  return o;
}

/* ---------------- map ---------------- */
const view = LS.get('view', { c: [173.6, -41.2], z: 5 });
function rasterStyle(tpl, maxz, attr) {
  return { version: 8, sources: { base: { type: 'raster', tiles: [tpl], tileSize: 256, maxzoom: maxz, attribution: attr } },
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d0e7f4' } }, { id: 'base', type: 'raster', source: 'base' }] };
}
function styleFor(b) {
  const B = BASEMAPS[b] || BASEMAPS.topo;
  return B.raster ? rasterStyle(B.raster(state.key), B.maxz, '© Toitū Te Whenua LINZ CC BY 4.0') : B.style(state.key);
}
const map = new maplibregl.Map({
  container: 'map', style: styleFor(state.base), center: view.c, zoom: view.z, maxZoom: 19,
  attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'DOC, LINZ, Herenga ā Nuku — CC BY 4.0' }), 'bottom-left');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

let styleErrShown = false;
map.on('error', e => {
  const st = e && e.error && e.error.status;
  if ((st === 400 || st === 401 || st === 403) && !styleErrShown && online()) {
    styleErrShown = true; toast('LINZ map key rejected — open Settings to refresh it.', 6000);
  }
});

const EMPTY = { type: 'FeatureCollection', features: [] };
const PAL = {
  doc: '#1b7f3b', docLine: '#0f5a28',
  huntOk: '#a3e635', huntOkLine: '#4d7c0f', huntRes: '#f59e0b', huntResLine: '#b45309', huntNo: '#dc2626',
  road: '#f97316', roadLine: '#c2410c', access: '#0ea5e9', accessLine: '#0369a1',
  priv: '#e11d48', maori: '#a21caf', river: '#64748b', check: '#94a3b8'
};
const BASE_OP = {};
const WORLD = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } };
function stripes(colour) {
  const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
  x.strokeStyle = colour; x.lineWidth = 2.5; x.beginPath();
  for (let i = -16; i <= 32; i += 8) { x.moveTo(i, 16); x.lineTo(i + 16, 0); }
  x.stroke(); return x.getImageData(0, 0, 16, 16);
}
const opOf = id => Math.min(0.92, BASE_OP[id] * state.strength);
function applyPaint() {
  for (const id in BASE_OP) if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', opOf(id));
  if (map.getLayer('fade-f')) map.setPaintProperty('fade-f', 'fill-opacity', state.fade);
}
function addOverlays() {
  const src = id => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: (state.loaded[id] && state.loaded[id].fc) || EMPTY }); };
  LAYERS.forEach(L => src(L.id));
  ['sel', 'acc', 'tline', 'wps', 'priv', 'arc', 'scent', 'rte', 'routes', 'trk', 'log'].forEach(src);
  const rsrc = (id, tiles, maxzoom) => { if (!map.getSource(id)) map.addSource(id, { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom }); };
  rsrc('hill', hillURL(), 15); rsrc('slope', 'terrain://{z}/{x}/{y}?m=slope', 14); rsrc('sun', 'terrain://{z}/{x}/{y}?m=sun', 14);
  if (!map.getSource('fade')) map.addSource('fade', { type: 'geojson', data: WORLD });
  if (!map.hasImage('noHunt')) map.addImage('noHunt', stripes('#dc2626'));
  const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
  const addF = (id, source, colour, op, extra = {}) => { BASE_OP[id] = op; add({ id, type: 'fill', source, ...extra, paint: { 'fill-color': colour, 'fill-opacity': opOf(id) } }); };
  add({ id: 'fade-f', type: 'fill', source: 'fade', paint: { 'fill-color': '#ffffff', 'fill-opacity': state.fade } });
  add({ id: 'hill-r', type: 'raster', source: 'hill', paint: { 'raster-opacity': 0.4 } });
  add({ id: 'slope-r', type: 'raster', source: 'slope', minzoom: 10, paint: { 'raster-opacity': 0.85 } });
  add({ id: 'sun-r', type: 'raster', source: 'sun', minzoom: 10, paint: { 'raster-opacity': 0.8 } });
  // 4. needs landowner permission (derived from parcels not covered by public land)
  addF('priv-f', 'priv', ['match', ['get', 'cls'], 'maori', PAL.maori, 'river', PAL.river, 'check', PAL.check, PAL.priv], 0.28, { minzoom: 13 });
  // 1. DOC land
  addF('pcl-f', 'pcl', PAL.doc, 0.35, { minzoom: 9 });
  add({ id: 'pcl-l', type: 'line', source: 'pcl', minzoom: 9, paint: { 'line-color': PAL.docLine, 'line-width': 1.4 } });
  SPECIES.forEach(sp => {
    addF('sp_' + sp.key + '-f', 'sp_' + sp.key, sp.colour, 0.16);
    add({ id: 'sp_' + sp.key + '-l', type: 'line', source: 'sp_' + sp.key, paint: { 'line-color': sp.colour, 'line-width': 1.2 } });
  });
  // 2. huntable with a permit
  addF('hunt-f', 'hunt', ['match', ['get', 'HuntStatus'], 'Permitted', PAL.huntOk, 'Restricted', PAL.huntRes, 'Prohibited', PAL.huntNo, '#7a7a7a'], 0.45, { filter: ['!=', ['get', 'HuntStatus'], 'Prohibited'] });
  add({ id: 'hunt-p', type: 'fill', source: 'hunt', filter: ['==', ['get', 'HuntStatus'], 'Prohibited'], paint: { 'fill-pattern': 'noHunt' } });
  add({ id: 'hunt-l', type: 'line', source: 'hunt', paint: { 'line-color': ['match', ['get', 'HuntStatus'], 'Permitted', PAL.huntOkLine, 'Restricted', PAL.huntResLine, 'Prohibited', PAL.huntNo, '#555'], 'line-width': 2 } });
  // 3. public access to travel through
  addF('res-f', 'res', PAL.access, 0.3);
  addF('parks-f', 'parks', PAL.access, 0.25);
  addF('other-f', 'other', PAL.access, 0.3);
  addF('ease-f', 'ease', PAL.access, 0.45);
  add({ id: 'ease-l', type: 'line', source: 'ease', paint: { 'line-color': PAL.accessLine, 'line-width': 2 } });
  addF('road-f', 'road', PAL.road, 0.6, { minzoom: 12 });
  add({ id: 'road-l', type: 'line', source: 'road', minzoom: 12, paint: { 'line-color': PAL.roadLine, 'line-width': 1 } });
  ['pestWill', 'pestHave'].forEach((id, i) => {
    addF(id + '-f', id, '#d23a2b', i ? 0.08 : 0.14);
    add({ id: id + '-l', type: 'line', source: id, paint: { 'line-color': '#b91c1c', 'line-width': 2, 'line-dasharray': [2, 2] } });
  });
  add({ id: 'parcels-c', type: 'line', source: 'parcels', minzoom: 14, paint: { 'line-color': '#000', 'line-width': 2.2, 'line-opacity': 0.35 } });
  add({ id: 'parcels-l', type: 'line', source: 'parcels', minzoom: 14, paint: { 'line-color': '#ffffff', 'line-width': 0.9 } });
  add({ id: 'sel-l', type: 'line', source: 'sel', paint: { 'line-color': '#ff6a13', 'line-width': 4 } });
  add({ id: 'tline-l', type: 'line', source: 'tline', paint: { 'line-color': '#ff6a13', 'line-width': 2.5, 'line-dasharray': [2, 2] } });
  add({ id: 'acc-f', type: 'fill', source: 'acc', paint: { 'fill-color': '#1a73e8', 'fill-opacity': 0.12 } });
  add({ id: 'acc-l', type: 'line', source: 'acc', paint: { 'line-color': '#1a73e8', 'line-width': 1 } });
  add({ id: 'tracks-l', type: 'line', source: 'tracks', minzoom: 10, paint: { 'line-color': '#7c2d12', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
  add({ id: 'scent-f', type: 'fill', source: 'scent', paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.22 } });
  add({ id: 'scent-l', type: 'line', source: 'scent', paint: { 'line-color': '#6d28d9', 'line-width': 1.5, 'line-dasharray': [1, 1] } });
  add({ id: 'arc-f', type: 'fill', source: 'arc', paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.18 } });
  add({ id: 'arc-l', type: 'line', source: 'arc', paint: { 'line-color': '#b91c1c', 'line-width': 2 } });
  add({ id: 'routes-l', type: 'line', source: 'routes', paint: { 'line-color': '#7c3aed', 'line-width': 3, 'line-dasharray': [3, 1.5] } });
  add({ id: 'trk-l', type: 'line', source: 'trk', paint: { 'line-color': '#2563eb', 'line-width': 3.5 } });
  add({ id: 'rte-l', type: 'line', source: 'rte', paint: { 'line-color': '#ff6a13', 'line-width': 3.5 } });
  add({ id: 'rte-c', type: 'circle', source: 'rte', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#ff6a13', 'circle-stroke-width': 2 } });
  add({ id: 'huts-c', type: 'circle', source: 'huts', minzoom: 9, paint: { 'circle-radius': 6, 'circle-color': '#b91c1c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  add({ id: 'camps-c', type: 'circle', source: 'camps', minzoom: 9, paint: { 'circle-radius': 6, 'circle-color': '#0f766e', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  add({ id: 'log-c', type: 'circle', source: 'log', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'kind'], 'kill', '#be123c', '#f59e0b'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
  add({ id: 'wps-c', type: 'circle', source: 'wps', paint: { 'circle-radius': 7, 'circle-color': ['get', 'colour'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  applyVisibility(); renderWps(); renderRoutes(); renderLog(); updateAcc(); updateTargetLine(); computePriv();
}
map.on('style.load', addOverlays);

function layerVisible(L) { return L.group === 'species' ? !!state.sp[L.sp.key] : !!state.vis[L.group]; }
const PRIV_NEEDS = ['pcl', 'hunt', 'paa', 'parcels'];
function layerNeeded(L) { return layerVisible(L) || (state.vis.priv && PRIV_NEEDS.includes(L.group)); }
function applyVisibility() {
  if (!map.isStyleLoaded()) return;
  for (const L of LAYERS) {
    const v = layerVisible(L) ? 'visible' : 'none';
    for (const suf of ['-f', '-l', '-c', '-p']) if (map.getLayer(L.id + suf)) map.setLayoutProperty(L.id + suf, 'visibility', v);
  }
  if (map.getLayer('wps-c')) map.setLayoutProperty('wps-c', 'visibility', state.vis.wps ? 'visible' : 'none');
  if (map.getLayer('priv-f')) map.setLayoutProperty('priv-f', 'visibility', state.vis.priv ? 'visible' : 'none');
  for (const [id, k] of [['hill-r', 'hill'], ['slope-r', 'slope'], ['sun-r', 'sun'], ['routes-l', 'routes'], ['log-c', 'log']]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.vis[k] ? 'visible' : 'none');
  accessMarkers.forEach(m => { m.getElement().style.display = state.vis.access ? '' : 'none'; });
}
function setData(id, fc) { const s = map.getSource(id); if (s) s.setData(fc); if (PUBLIC_IDS.includes(id) || id === 'parcels') schedulePriv(); }

/* "needs landowner permission": parcels whose interior isn't DOC land or public access */
const PUBLIC_IDS = ['pcl', 'hunt', 'road', 'ease', 'res', 'parks', 'other'];
let privTimer = null;
function schedulePriv() { clearTimeout(privTimer); privTimer = setTimeout(computePriv, 200); }
function fbbox(f) {
  if (f._bb) return f._bb; const a = [180, 90, -180, -90];
  const walk = c => { if (typeof c[0] === 'number') { if (c[0] < a[0]) a[0] = c[0]; if (c[1] < a[1]) a[1] = c[1]; if (c[0] > a[2]) a[2] = c[0]; if (c[1] > a[3]) a[3] = c[1]; } else c.forEach(walk); };
  if (f.geometry) walk(f.geometry.coordinates); f._bb = a; return a;
}
function innerPoint(f) {
  const g = f.geometry, ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0], b = fbbox(f);
  let p = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; if (featContains(f, p)) return p;
  let sx = 0, sy = 0; for (const v of ring) { sx += v[0]; sy += v[1]; }
  p = [sx / ring.length, sy / ring.length]; if (featContains(f, p)) return p;
  for (let i = 2; i < ring.length; i++) { const q = [(ring[0][0] + ring[i][0]) / 2, (ring[0][1] + ring[i][1]) / 2]; if (featContains(f, q)) return q; }
  return ring[0];
}
function parcelCls(i) {
  if (ROADISH.test(i)) return null;
  if (/hydro|riverbed|streambed/i.test(i)) return 'river';
  if (/maori|customary/i.test(i)) return 'maori';
  if (/reserve|crown|railway|marine|accretion|reclamation|erosion/i.test(i)) return 'check';
  return 'private';
}
let lastPriv = [];
function privFeatures(pf, pubFeats) {
  const pub = pubFeats.filter(f => f.geometry && /Polygon/.test(f.geometry.type)), out = [];
  for (const f of (pf && pf.features) || []) {
    if (!f.geometry || !/Polygon/.test(f.geometry.type)) continue;
    const cls = parcelCls((f.properties && f.properties.parcel_intent) || ''); if (!cls) continue;
    const p = innerPoint(f); let isPub = false;
    for (const q of pub) { const b = fbbox(q); if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue; if (featContains(q, p)) { isPub = true; break; } }
    if (!isPub) out.push({ type: 'Feature', geometry: f.geometry, properties: { cls } });
  }
  return out;
}
function computePriv() {
  if (!map.getSource('priv')) return;
  const pf = state.loaded.parcels && state.loaded.parcels.fc;
  const pub = PUBLIC_IDS.flatMap(id => (state.loaded[id] && state.loaded[id].fc) ? state.loaded[id].fc.features : []);
  lastPriv = pf ? privFeatures(pf, pub) : [];
  map.getSource('priv').setData(state.vis.priv ? { type: 'FeatureCollection', features: lastPriv } : EMPTY);
}

/* ---------------- loading data for the view ---------------- */
function viewBBox(pad = 0) {
  const b = map.getBounds(); const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
  const dx = (e - w) * pad, dy = (n - s) * pad;
  return [w - dx, s - dy, e + dx, n + dy];
}
const zBucket = z => z < 9 ? 7 : z < 11 ? 9 : z < 13 ? 11 : z < 15 ? 13 : 15;
function offlineFC(id, b) {
  const feats = [];
  for (const a of state.areas) if (a.data && a.data[id] && bboxIntersects(a.bbox, b)) feats.push(...a.data[id].features);
  return { type: 'FeatureCollection', features: feats };
}
let refreshTimer = null;
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshData, 350); }
async function refreshData() {
  const z = map.getZoom(), vb = viewBBox(0), fb = viewBBox(0.35), lat = map.getCenter().lat, gen = ++state.gen;
  const jobs = [];
  for (const L of LAYERS) {
    if (!layerNeeded(L) || z < L.minz) continue;
    const st = state.loaded[L.id], zb = zBucket(z);
    if (st && bboxContains(st.bbox, vb) && st.zb >= Math.min(zb, L.group === 'species' ? 9 : 15)) continue;
    if (!online()) { const fc = offlineFC(L.id, vb); state.loaded[L.id] = { bbox: vb, zb: 99, fc, off: true }; setData(L.id, fc); continue; }
    const sz = L.group === 'species' ? Math.min(zb, 9) : zb;
    jobs.push(agsQuery(L.url, bboxParams(fb, L, sz, lat), { pages: L.pages || 4, rec: L.max || 1000 })
      .then(fc => { if (gen !== state.gen && state.loaded[L.id] && bboxContains(state.loaded[L.id].bbox, vb)) return; state.loaded[L.id] = { bbox: fb, zb: sz, fc }; setData(L.id, fc); })
      .catch(() => { const fc = offlineFC(L.id, vb); if (fc.features.length) { state.loaded[L.id] = { bbox: vb, zb: 99, fc, off: true }; setData(L.id, fc); } }));
  }
  if (jobs.length) await Promise.allSettled(jobs);
}
map.on('moveend', () => { const c = map.getCenter(); LS.set('view', { c: [c.lng, c.lat], z: map.getZoom() }); scheduleRefresh(); });
map.on('load', scheduleRefresh);
map.on('dragstart', () => { if (state.follow) { state.follow = false; updateLocateBtn(); } });

/* ---------------- sheet ---------------- */
const sheet = $('#sheet'), sheetBody = $('#sheetBody');
let sheetKind = '';
function showSheet(html, { tall = false, kind = '', mini = false } = {}) {
  sheetBody.innerHTML = html; sheet.classList.toggle('tall', tall); sheet.classList.toggle('mini', mini); sheet.hidden = false; sheet.scrollTop = 0; sheetKind = kind;
}
function closeSheet() { sheet.hidden = true; sheetKind = ''; }
$('#sheetClose').onclick = () => { closeSheet(); clearSelection(); };
const actions = {};
sheetBody.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](b, e); } });

/* ---------------- identify (tap the map) ---------------- */
let targetMarker = null;
function setTarget(p) {
  state.target = p;
  if (!targetMarker) { const el = document.createElement('div'); el.className = 'pin'; el.style.background = '#ff6a13'; targetMarker = new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [-2, 2] }); }
  targetMarker.setLngLat(p).addTo(map); updateTargetLine();
}
function clearSelection() { state.target = null; if (targetMarker) targetMarker.remove(); setData('sel', EMPTY); updateTargetLine(); }
function updateTargetLine() {
  if (!map.getSource('tline')) return;
  setData('tline', state.me && state.target ? { type: 'Feature', geometry: { type: 'LineString', coordinates: [[state.me.lng, state.me.lat], state.target] }, properties: {} } : EMPTY);
}
map.on('click', e => {
  const p = [e.lngLat.lng, e.lngLat.lat];
  if (state.mode === 'route') { routeAdd(p); return; }
  if (state.mode === 'arc') { state.mode = null; arc.brg = bearing(arc.p, p); runArc(); return; }
  const ids = ['huts-c', 'camps-c', 'log-c'].filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
  const box = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
  const fs = ids.length ? map.queryRenderedFeatures(box, { layers: ids }) : [];
  if (fs.length) { featureSheet(fs[0]); return; }
  identify(p);
});

async function identifyOnline(p) {
  const q = (L, geom = false) => agsQuery(L.url, pointParams(p, L, geom), { pages: 1, timeout: 12000, rec: 20 }).then(fc => fc.features);
  const keys = ['hunt', 'pcl', 'road', 'ease', 'res', 'parks', 'other', 'pestWill', 'pestHave'];
  const proms = keys.map(k => q(LBY[k]));
  proms.push(q(LBY.parcels, true));
  proms.push(agsQuery(URLS.titles, { geometry: p.join(','), geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'title_no,type,estate_description,number_owners,guarantee_status', returnGeometry: false }, { pages: 1, rec: 10 }).then(fc => fc.features));
  const spProms = SPECIES.map(s => {
    const qs = new URLSearchParams({ f: 'json', where: "PA='Presence'", geometry: p.join(','), geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', returnCountOnly: true });
    return fetchT(LBY['sp_' + s.key].url + '/query?' + qs, 12000).then(r => r.json()).then(j => { if (j.error) throw 0; return j.count > 0 ? s.key : null; });
  });
  const res = await Promise.allSettled(proms), spr = await Promise.allSettled(spProms);
  if (res.every(r => r.status === 'rejected')) throw new Error('offline');
  const g = i => (res[i].status === 'fulfilled' ? res[i].value : []);
  const props = i => g(i).map(f => f.properties);
  const out = { src: 'live' };
  keys.forEach((k, i) => { out[k] = props(i); });
  out.parcel = g(keys.length); out.title = props(keys.length + 1).length ? props(keys.length + 1) : [];
  out.species = spr.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  out.speciesKnown = spr.some(r => r.status === 'fulfilled');
  out.partial = res.some(r => r.status === 'rejected');
  return out;
}
function identifyLocal(p) {
  const out = { src: 'offline', title: [], species: [], speciesKnown: false, coverage: false };
  const pick = id => {
    const fcs = [];
    if (state.loaded[id] && state.loaded[id].fc) fcs.push(state.loaded[id].fc);
    for (const a of state.areas) if (a.data && a.data[id] && bboxContains(a.bbox, [p[0], p[1], p[0], p[1]])) { fcs.push(a.data[id]); out.coverage = true; }
    if (state.loaded[id] && bboxContains(state.loaded[id].bbox, [p[0], p[1], p[0], p[1]])) out.coverage = true;
    const hits = []; for (const fc of fcs) for (const f of fc.features) if (featContains(f, p)) hits.push(f);
    return hits;
  };
  ['hunt', 'pcl', 'road', 'ease', 'res', 'parks', 'other', 'pestWill', 'pestHave'].forEach(k => { out[k] = pick(k).map(f => f.properties); });
  out.parcel = pick('parcels');
  for (const s of SPECIES) {
    const id = 'sp_' + s.key;
    const has = (state.loaded[id] && bboxContains(state.loaded[id].bbox, [p[0], p[1], p[0], p[1]])) || state.areas.some(a => a.data && a.data[id] && bboxContains(a.bbox, [p[0], p[1], p[0], p[1]]));
    if (has) { out.speciesKnown = true; if (pick(id).length) out.species.push(s.key); }
  }
  return out;
}
const ROADISH = /^(Road|Road Strata|Vesting on Deposit for Road)$/i;
function classify(r) {
  if (r.road && r.road.length) return { cat: 'road', title: 'Legal road — public access', text: 'If no road shows on the map, this is probably an unformed (“paper”) road. You can walk it, but don’t shoot from or across a road.' };
  const h = r.hunt && r.hunt[0];
  if (h) {
    const s = (h.HuntStatus || '').toLowerCase();
    if (s === 'permitted') return { cat: 'ok', title: 'DOC land — hunting permitted', text: h.BlockType === 'Roar' ? 'Balloted roar block. Check ballot periods.' : 'You need a DOC open hunting permit (free, online).' };
    if (s === 'restricted') return { cat: 'restricted', title: 'DOC land — restricted permit', text: 'Restricted or balloted block. Apply to DOC before you hunt.' };
    if (s === 'prohibited') return { cat: 'no', title: 'DOC land — NO hunting', text: 'Recreational hunting is prohibited here.' };
  }
  const pcl = r.pcl && r.pcl[0];
  if (pcl) {
    if (/marginal/i.test(pcl.Type || '')) return { cat: 'access', title: 'Marginal strip — public access', text: 'Walking access along the water. Hunting isn’t covered unless DOC lists it as a hunting area.' };
    return { cat: 'no', title: 'Conservation land — not a hunting area', text: 'Public conservation land outside DOC’s hunting permit areas. Treat it as no hunting.' };
  }
  const pa = (r.ease && r.ease[0]) || (r.res && r.res[0]) || (r.parks && r.parks[0]) || (r.other && r.other[0]);
  if (pa) return { cat: 'access', title: 'Public access: ' + (pa.paa_type || 'access area'), text: 'Access isn’t permission to hunt or shoot. Check with ' + (pa.managed_by || 'the land manager') + '.' };
  const pc = r.parcel && r.parcel[0] && r.parcel[0].properties;
  if (pc) {
    const i = pc.parcel_intent || '';
    if (ROADISH.test(i)) return { cat: 'road', title: 'Legal road parcel', text: 'Legal road (formed or unformed). Public right of passage. Don’t shoot from or across it.' };
    if (/maori/i.test(i)) return { cat: 'private', title: 'Māori land — permission needed', text: 'Māori land is private. Get permission from the owners or trust before you go on.' };
    if (/hydro|riverbed|streambed/i.test(i)) return { cat: 'restricted', title: 'Riverbed (hydro parcel)', text: 'Riverbed parcels aren’t automatically public access. Check ownership and any marginal strip.' };
    if (/reserve|crown|railway/i.test(i)) return { cat: 'restricted', title: 'Reserve, Crown or rail land', text: 'Find out who manages it. Usually needs specific permission.' };
    return { cat: 'private', title: 'Private land — permission required', text: 'You need the landowner’s permission to go on or hunt. No permission, no access.' };
  }
  if (r.src === 'offline' && !r.coverage) return { cat: 'unknown', title: 'No offline data here', text: 'Save this area for offline use when you have signal.' };
  return { cat: 'unknown', title: 'Land status not found', text: map.getZoom() < 14 ? 'Zoom in to 14+ and tap again to load property boundaries.' : 'No parcel or DOC data returned for this spot.' };
}
const VCLS = { ok: 'v-ok', restricted: 'v-restricted', no: 'v-no', private: 'v-private', road: 'v-road', access: 'v-access', unknown: 'v-unknown' };

async function identify(p) {
  setTarget(p);
  showSheet(`<h2>Checking this spot…</h2><p class="sub">${p[1].toFixed(5)}, ${p[0].toFixed(5)}</p>`, { kind: 'id' });
  let r = null;
  if (online()) { try { r = await identifyOnline(p); } catch { r = null; } }
  if (!r) r = identifyLocal(p);
  if (!state.target || state.target[0] !== p[0] || state.target[1] !== p[1]) return;
  const pf = r.parcel && r.parcel[0];
  setData('sel', pf && pf.geometry ? pf : EMPTY);
  renderIdentify(p, r);
}
function renderIdentify(p, r) {
  const v = classify(r);
  const [E, N] = llToNZTM(p[0], p[1]);
  let h = `<div class="verdict ${VCLS[v.cat]}"><div><b>${esc(v.title)}</b><span>${esc(v.text)}</span></div></div>`;
  h += `<p class="sub">${p[1].toFixed(5)}, ${p[0].toFixed(5)} · NZTM ${Math.round(E)} E ${Math.round(N)} N${r.src === 'offline' ? ' · <b>offline data</b>' : ''}${r.partial ? ' · some sources didn’t respond' : ''}</p>`;
  if (state.me) { const me = [state.me.lng, state.me.lat]; h += `<p class="sub">From you: <b>${fmtDist(distM(me, p))}</b> ${compass(bearing(me, p))} (${Math.round(bearing(me, p))}° true)</p>`; }

  const h0 = r.hunt && r.hunt[0];
  if (h0) {
    h += `<h3>DOC hunting block</h3><dl class="kv"><dt>Block</dt><dd>${esc(h0.HuntBlockName)}</dd><dt>Permit area</dt><dd>${esc(h0.PermitArea || '—')}</dd><dt>Type</dt><dd>${esc(h0.BlockType || '—')} · ${esc(h0.HuntStatus || '')}</dd>`;
    [['DateConditions', 'Dates'], ['AccessConditions', 'Access'], ['DogConditions', 'Dogs'], ['SpecialConditions', 'Special']].forEach(([k, l]) => { if (h0[k]) h += `<dt>${l}</dt><dd>${esc(h0[k])}</dd>`; });
    h += `</dl><div class="btnrow">`;
    if ((h0.HuntStatus || '') === 'Permitted') h += `<a class="btn" href="${LINKS.docPermit}" target="_blank" rel="noopener">Get DOC permit</a>`;
    if (h0.HuntingWebPage) h += `<a class="btn ghost" href="${esc(h0.HuntingWebPage)}" target="_blank" rel="noopener">Block page &amp; rules</a>`;
    else h += `<a class="btn ghost" href="${LINKS.docHunting}" target="_blank" rel="noopener">DOC hunting info</a>`;
    h += `</div>`;
    if ((h0.HuntStatus || '') === 'Permitted') h += `<p class="sub">An open permit covers deer, pigs, goats, wallabies, chamois and tahr. Stalking pigs with a firearm needs no dog permit. Taking dogs needs whatever the “Dogs” condition says.</p>`;
  }

  if (r.speciesKnown || r.species.length) {
    h += `<h3>Animals recorded here</h3><div class="tags">` + SPECIES.map(s => `<span class="tag ${r.species.includes(s.key) ? 'hit' : ''}">${r.species.includes(s.key) ? '✓ ' : ''}${esc(s.label)}</span>`).join('') + `</div><p class="sub">DOC distribution maps (2007/2014). They show broad range, not current numbers.</p>`;
  } else if (r.src === 'offline') h += `<p class="sub">Animal data isn’t saved offline for this spot.</p>`;

  const pests = [...(r.pestWill || []), ...(r.pestHave || [])];
  if (pests.length) {
    h += `<div class="warnbox"><b>⚠ Pesticide operation</b><br>` + pests.slice(0, 4).map(x => `${esc(x.BlockName || 'Operation')}: ${esc(x.Pesticide || '')} ${x.MethodName ? '(' + esc(x.MethodName) + ')' : ''}${x.StartDate ? ' · ' + fmtDate(x.StartDate) : ''}${x.FinishDate ? '–' + fmtDate(x.FinishDate) : ''}${x.CautionPeriod ? ' · caution period ' + esc(x.CautionPeriod) + ' months' : ''}`).join('<br>') + `<br>Don’t take dogs. Don’t eat game from operation areas during caution periods.</div>`;
  }

  const pa = [...(r.road || []).map(x => ({ ...x, k: 'Legal road' })), ...(r.ease || []), ...(r.res || []), ...(r.parks || []), ...(r.other || [])];
  if (pa.length) {
    h += `<h3>Public access</h3><ul class="list">` + pa.slice(0, 4).map(x => `<li><span class="t">${esc(x.paa_type || x.k || 'Access')}</span>${x.common_name ? ' — ' + esc(x.common_name) : ''}<br><span class="sub">Access: ${esc(x.public_access || '?')} · Managed by ${esc(x.managed_by || '?')}${x.statutory_purpose ? ' · ' + esc(x.statutory_purpose) : ''}</span></li>`).join('') + `</ul>`;
    if (r.road && r.road.length) h += `<p class="sub"><a href="${LINKS.haNuku}" target="_blank" rel="noopener">About unformed legal roads (Herenga ā Nuku)</a></p>`;
  }

  const pc = r.parcel && r.parcel[0] && r.parcel[0].properties;
  if (pc) {
    const t = r.title && r.title[0];
    const titleRef = (t && t.title_no) || (pc.titles || '').split(',')[0].trim();
    h += `<h3>Property</h3><dl class="kv"><dt>Parcel</dt><dd>${esc(pc.appellation || '—')}</dd><dt>Intent</dt><dd>${esc(pc.parcel_intent || '—')}</dd>`;
    if (pc.titles) h += `<dt>Title(s)</dt><dd>${esc(pc.titles)}</dd>`;
    if (t) h += `<dt>Estate</dt><dd>${esc(t.type || '')}${t.number_owners ? ' · ' + esc(t.number_owners) + ' owner(s)' : ''}</dd>`;
    if (pc.calc_area) h += `<dt>Area</dt><dd>${(pc.calc_area / 10000).toFixed(pc.calc_area > 1e5 ? 0 : 2)} ha</dd>`;
    h += `<dt>District</dt><dd>${esc(pc.land_district || '—')}</dd></dl>`;
    if (titleRef && !ROADISH.test(pc.parcel_intent || '')) {
      h += `<p class="sub">Owner names aren’t open data. LINZ Land Record Search sells the title (about $8), and the title lists the registered owners. Use it to ask permission.</p><div class="btnrow"><button class="btn" data-act="lrs" data-title="${esc(titleRef)}">Copy title &amp; open LINZ</button></div>`;
    }
  }

  h += `<h3>Go there</h3><div class="btnrow">
    <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${p[1]},${p[0]}" target="_blank" rel="noopener">Drive (Google)</a>
    <a class="btn ghost" href="https://maps.apple.com/?daddr=${p[1]},${p[0]}" target="_blank" rel="noopener">Apple Maps</a>
    <button class="btn ghost" data-act="saveWp" data-lng="${p[0]}" data-lat="${p[1]}">Save waypoint</button>
    <button class="btn ghost" data-act="copy" data-text="${p[1].toFixed(6)}, ${p[0].toFixed(6)}">Copy coords</button>
    <button class="btn ghost" data-act="cond" data-lng="${p[0]}" data-lat="${p[1]}">Wind &amp; sun</button></div>
    <p class="sub">Driving apps route you to the nearest road. Don’t drive or walk across private land unless you have permission.</p>`;
  showSheet(h, { kind: 'id' });
}
actions.lrs = async b => { try { await navigator.clipboard.writeText(b.dataset.title); toast('Title ' + b.dataset.title + ' copied'); } catch {} window.open(LINKS.lrs, '_blank', 'noopener'); };
actions.copy = async b => { try { await navigator.clipboard.writeText(b.dataset.text); toast('Copied'); } catch { toast(b.dataset.text); } };
actions.saveWp = b => wpForm([+b.dataset.lng, +b.dataset.lat]);
actions.cond = b => showConditions([+b.dataset.lng, +b.dataset.lat]);

/* ---------------- GPS ---------------- */
let meMarker = null;
function updateLocateBtn() { const b = $('#btnLocate'); b.classList.toggle('on', state.watchId != null && state.follow); b.style.outline = state.watchId != null && !state.follow ? '3px solid #ff6a13' : ''; }
function startGPS() {
  if (!navigator.geolocation) { toast('Location isn’t available on this device'); return; }
  state.follow = true; updateLocateBtn();
  state.watchId = navigator.geolocation.watchPosition(onPos, err => {
    toast(err.code === 1 ? 'Location permission denied — allow it in your browser settings' : 'Can’t get a GPS fix yet…');
    if (err.code === 1) stopGPS();
  }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 30000 });
  $('#statusBar').hidden = false; $('#statusText').textContent = 'Getting GPS fix…';
}
function stopGPS() {
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null; state.follow = false; state.me = null;
  if (meMarker) meMarker.remove(); setData('acc', EMPTY); updateTargetLine(); updateLocateBtn();
  $('#statusBar').hidden = true; state.lastStatus = null;
}
function onPos(pos) {
  const c = pos.coords, first = !state.me;
  state.me = { lng: c.longitude, lat: c.latitude, acc: c.accuracy, heading: c.heading, speed: c.speed, t: pos.timestamp };
  if (!meMarker) { const el = document.createElement('div'); el.className = 'me'; el.innerHTML = '<div class="hd"></div>'; meMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }); }
  meMarker.setLngLat([c.longitude, c.latitude]).addTo(map);
  const hd = meMarker.getElement().querySelector('.hd');
  if (c.heading != null && !isNaN(c.heading) && c.speed > 0.5) { hd.style.display = 'block'; meMarker.setRotation(c.heading); } else hd.style.display = 'none';
  updateAcc(); updateTargetLine(); recordPos(c, pos.timestamp); updateNav();
  if (state.follow) map.easeTo({ center: [c.longitude, c.latitude], zoom: first ? Math.max(map.getZoom(), 15) : map.getZoom(), duration: first ? 800 : 400 });
  checkStatus();
}
function updateAcc() { if (map.getSource('acc')) setData('acc', state.me ? circlePoly([state.me.lng, state.me.lat], Math.min(state.me.acc || 0, 2000)) : EMPTY); }
$('#btnLocate').onclick = () => {
  if (state.watchId == null) startGPS();
  else if (!state.follow) { state.follow = true; updateLocateBtn(); if (state.me) map.easeTo({ center: [state.me.lng, state.me.lat] }); }
  else stopGPS();
};

/* live land status + boundary alert */
let beepCtx = null;
function beep() {
  try { beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = beepCtx.createOscillator(), g = beepCtx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(beepCtx.destination); g.gain.value = 0.15; o.start(); o.stop(beepCtx.currentTime + 0.35); } catch {}
}
async function checkStatus() {
  const me = state.me; if (!me) return;
  const p = [me.lng, me.lat], now = Date.now();
  if (state.lastStatusPos && distM(state.lastStatusPos, p) < 20 && now - state.lastStatusAt < 20000) return;
  state.lastStatusPos = p; state.lastStatusAt = now;
  let r = identifyLocal(p), v = classify(r);
  if ((v.cat === 'unknown' || !r.parcel.length && !r.hunt.length && !r.pcl.length) && online() && now - state.lastOnlineCheck > 30000) {
    state.lastOnlineCheck = now;
    try { r = await identifyOnline(p); v = classify(r); } catch {}
  }
  const bar = $('#statusBar'); bar.hidden = false; bar.dataset.cat = v.cat;
  $('#statusText').textContent = (v.cat === 'unknown' ? 'Status unknown' : v.title) + boundaryNote(p, v.cat) + (me.acc > 50 ? ` (±${Math.round(me.acc)} m)` : '');
  const prev = state.lastStatus; state.lastStatus = v.cat;
  if (state.alerts && prev && prev !== v.cat && (v.cat === 'private' || v.cat === 'no')) {
    bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash');
    if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
    beep(); toast('Boundary: ' + v.title, 5000);
  }
}
$('#statusBar').onclick = () => { if (state.me) identify([state.me.lng, state.me.lat]); };

/* ---------------- layers sheet ---------------- */
function layersSheet() {
  const seg = Object.entries(BASEMAPS).map(([k, b]) => `<button data-act="base" data-k="${k}" class="${state.base === k ? 'on' : ''}">${b.label}<br><span class="sub">${b.note}</span></button>`).join('');
  const tg = (k, label, sw, note) => `<label class="toggle"><input type="checkbox" data-act="vis" data-k="${k}" ${state.vis[k] ? 'checked' : ''}>${sw ? `<span class="swatch" style="background:${sw}"></span>` : ''}<span>${label}${note ? `<br><span class="sub">${note}</span>` : ''}</span></label>`;
  const sw = c => `<i class="swatch" style="background:${c}"></i>`;
  const sp = s => `<label class="toggle"><input type="checkbox" data-act="sp" data-k="${s.key}" ${state.sp[s.key] ? 'checked' : ''}><span class="swatch" style="background:${s.colour}"></span>${s.label}</label>`;
  showSheet(`<h2>Map &amp; layers</h2><div class="seg">${seg}</div>
    <h3>Land categories</h3>
    ${tg('pcl', 'DOC land', PAL.doc, 'All public conservation land (zoom 9+)')}
    ${tg('hunt', 'Huntable with a permit only', PAL.huntOk, 'DOC hunting areas. No landowner permission needed, just the DOC permit')}
    <div class="legend"><span>${sw(PAL.huntOk)}Permitted</span><span>${sw(PAL.huntRes)}Restricted / ballot</span><span><i class="swatch" style="background:repeating-linear-gradient(45deg,#dc2626 0 2px,#fff 2px 6px)"></i>No hunting</span></div>
    ${tg('paa', 'Public access to travel through', PAL.access, 'You can walk through, but you can’t hunt on it without the manager’s say-so (zoom 11+)')}
    <div class="legend"><span>${sw(PAL.road)}Legal &amp; paper roads</span><span>${sw(PAL.access)}Easements, strips, reserves</span></div>
    ${tg('priv', 'Needs landowner permission', PAL.priv, 'All other land (zoom 13+)')}
    <div class="legend"><span>${sw(PAL.priv)}Private</span><span>${sw(PAL.maori)}Māori land</span><span>${sw(PAL.river)}Riverbed</span><span>${sw(PAL.check)}Other Crown / reserve: check</span></div>
    ${tg('parcels', 'Property boundary lines', '#ffffff', 'Zoom 14+')}
    <h3>Colours</h3>
    <span class="field-l">Overlay strength</span><input type="range" min="0.4" max="2" step="0.1" data-act="strength" value="${state.strength}" aria-label="Overlay strength">
    <span class="field-l">Fade basemap (makes colours stand out)</span><input type="range" min="0" max="0.7" step="0.05" data-act="fade" value="${state.fade}" aria-label="Fade basemap">
    <h3>Other layers</h3>
    ${tg('pest', 'Pesticide operations (1080 etc.)', '#d23a2b')}
    ${tg('access', 'Hunting access directory pins', '#5b47a6')}
    ${tg('wps', 'My waypoints', '#1d4ed8')}
    ${tg('huts', 'DOC huts, campsites &amp; tracks', '#b91c1c', 'Zoom 9+. Tap a hut for details')}
    ${tg('routes', 'My planned routes', '#7c3aed')}
    ${tg('log', 'Hunt log (kills red, sightings amber)', '#be123c')}
    <h3>Terrain</h3>
    ${tg('hill', 'Hillshade', '#94a3b8', 'Shaded relief to read the ground')}
    ${tg('slope', 'Slope steepness', '#f97316', 'Zoom 10+. Yellow 25°+, orange 30°+, red 35°+, purple 45°+')}
    ${tg('sun', 'Sunny north faces', '#facc15', 'Zoom 10+. Yellow: north-facing (warm, often winter feed). Blue: shady south faces')}
    <h3>Animals (DOC distribution)</h3>
    <div class="btnrow"><button class="btn small" data-act="spPreset">Deer, goats &amp; pigs</button><button class="btn small ghost" data-act="spNone">Clear</button></div>
    ${SPECIES.map(sp).join('')}
    <p class="sub">Tip: an orange road strip with no road drawn on the basemap is probably a paper road. Check it on Aerial.</p>`, { tall: true, kind: 'layers' });
}
sheetBody.addEventListener('input', e => {
  const i = e.target; if (!i.dataset) return;
  if (i.dataset.act === 'strength') { state.strength = +i.value; LS.set('strength', state.strength); applyPaint(); }
  if (i.dataset.act === 'fade') { state.fade = +i.value; LS.set('fade', state.fade); applyPaint(); }
});
actions.base = b => {
  state.base = b.dataset.k; LS.set('base', state.base);
  map.setStyle(styleFor(state.base), { diff: false });
  sheetBody.querySelectorAll('[data-act=base]').forEach(x => x.classList.toggle('on', x === b));
};
sheetBody.addEventListener('change', e => {
  const i = e.target; if (!i.dataset || !i.dataset.act) return;
  if (i.dataset.act === 'vis') { state.vis[i.dataset.k] = i.checked; LS.set('vis', state.vis); applyVisibility(); scheduleRefresh(); schedulePriv(); }
  if (i.dataset.act === 'sp') { state.sp[i.dataset.k] = i.checked; LS.set('sp', state.sp); applyVisibility(); scheduleRefresh(); }
  if (i.dataset.act === 'alerts') { state.alerts = i.checked; LS.set('alerts', state.alerts); }
});
actions.spPreset = () => { SPECIES.forEach(s => { state.sp[s.key] = ['red', 'fallow', 'sika', 'goat', 'pig'].includes(s.key); }); LS.set('sp', state.sp); applyVisibility(); scheduleRefresh(); layersSheet(); };
actions.spNone = () => { state.sp = {}; LS.set('sp', state.sp); applyVisibility(); layersSheet(); };
$('#btnLayers').onclick = () => (sheetKind === 'layers' && !sheet.hidden ? closeSheet() : layersSheet());

/* ---------------- access directory ---------------- */
const accessMarkers = [];
const ACC = window.ACCESS_DIRECTORY || [];
const pinCls = t => /forest/i.test(t) ? 'forestry' : /private/i.test(t) ? 'private' : /council/i.test(t) ? 'council' : /not open/i.test(t) ? 'closed' : '';
function addAccessPins() {
  ACC.forEach(a => a.pins.forEach(pt => {
    const el = document.createElement('div'); el.className = 'pin ' + pinCls(a.type); el.title = a.name;
    el.addEventListener('click', ev => { ev.stopPropagation(); accessDetail(a.id); });
    accessMarkers.push(new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [-2, 2] }).setLngLat([pt[1], pt[0]]).addTo(map));
  }));
  applyVisibility();
}
const spLabel = { deer: 'Deer', goat: 'Goats', pig: 'Pigs' };
function accessList(filter = LS.get('accFilter', 'all')) {
  LS.set('accFilter', filter);
  const items = ACC.filter(a => filter === 'all' || a.species.includes(filter));
  const fb = ['all', 'deer', 'goat', 'pig'].map(f => `<button class="btn small ${filter === f ? '' : 'ghost'}" data-act="accF" data-f="${f}">${f === 'all' ? 'All' : spLabel[f]}</button>`).join('');
  showSheet(`<h2>Hunting access beyond DOC</h2><p class="sub">Stations, forestry, iwi and council land with a known way to get permission. Pins show the general area only. Confirm boundaries, prices and conditions with the provider first.</p>
    <div class="btnrow">${fb}</div>
    <ul class="list">${items.map(a => `<li><button class="btn ghost small" style="float:right" data-act="accGo" data-id="${a.id}">Show</button><span class="t">${esc(a.name)}</span><span class="badge">${esc(a.type)}</span><br><span class="sub">${esc(a.region)}${a.species.length ? ' · ' + a.species.map(s => spLabel[s]).join(', ') : ''}</span><br><span class="sub">${esc(a.access)}</span></li>`).join('')}</ul>
    <h3>Asking a landowner</h3><p class="sub">Ask well ahead and in person if you can. Say who’s in your party, the dates, your vehicle, what you’ll hunt and where you’ll shoot. Offer meat or a hand on the farm. Respect lambing closures (often Aug–Oct). Log the permission under <b>More → Permissions log</b>.</p>`, { tall: true, kind: 'access' });
}
function accessDetail(id) {
  const a = ACC.find(x => x.id === id); if (!a) return;
  showSheet(`<h2>${esc(a.name)}</h2><p class="sub">${esc(a.type)} · ${esc(a.region)}</p>
    <div class="tags">${a.species.map(s => `<span class="tag hit">${spLabel[s]}</span>`).join('') || '<span class="tag">Not a public hunting option</span>'}</div>
    <p>${esc(a.access)}</p><p class="sub">${esc(a.detail)}</p>
    <dl class="kv">${a.deerTypes ? `<dt>Deer</dt><dd>${esc(a.deerTypes)}</dd>` : ''}<dt>Dogs</dt><dd>${esc(a.dogs)}</dd><dt>Contact</dt><dd>${esc(a.contact)}</dd><dt>Source</dt><dd>${esc(a.source)} (checked Nov 2026)</dd></dl>
    <div class="btnrow"><a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener">Website</a><button class="btn ghost" data-act="accGo" data-id="${a.id}">Show on map</button><button class="btn ghost" data-act="accList">All listings</button></div>`, { kind: 'access' });
}
actions.accF = b => accessList(b.dataset.f);
actions.accList = () => accessList();
actions.accGo = b => {
  const a = ACC.find(x => x.id === b.dataset.id); if (!a) return;
  state.vis.access = true; LS.set('vis', state.vis); applyVisibility();
  if (a.pins.length > 1) { const lats = a.pins.map(p => p[0]), lngs = a.pins.map(p => p[1]); map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 10 }); }
  else map.flyTo({ center: [a.pins[0][1], a.pins[0][0]], zoom: 11 });
  accessDetail(a.id);
};

/* ---------------- waypoints ---------------- */
function renderWps() {
  if (!map.getSource('wps')) return;
  setData('wps', { type: 'FeatureCollection', features: state.wps.map(w => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lng, w.lat] }, properties: { id: w.id, name: w.name, colour: (WP_TYPES[w.type] || WP_TYPES.note)[1] } })) });
}
function wpForm(p, w = null) {
  const opts = Object.entries(WP_TYPES).map(([k, v]) => `<option value="${k}" ${w && w.type === k ? 'selected' : ''}>${v[0]}</option>`).join('');
  showSheet(`<h2>${w ? 'Edit' : 'Save'} waypoint</h2><p class="sub">${p[1].toFixed(5)}, ${p[0].toFixed(5)}</p>
    <span class="field-l">Name</span><input type="text" id="wpName" value="${esc(w ? w.name : '')}" placeholder="e.g. Truck at road end">
    <span class="field-l">Type</span><select id="wpType">${opts}</select>
    <span class="field-l">Notes</span><textarea id="wpNote" placeholder="Optional">${esc(w ? w.note : '')}</textarea>
    <div class="btnrow"><button class="btn" data-act="wpSave" data-lng="${p[0]}" data-lat="${p[1]}" data-id="${w ? w.id : ''}">Save</button><button class="btn ghost" data-act="wpList">Cancel</button></div>`, { kind: 'wp' });
}
actions.wpSave = async b => {
  const w = { id: b.dataset.id || uid(), lng: +b.dataset.lng, lat: +b.dataset.lat, name: $('#wpName').value.trim() || 'Waypoint', type: $('#wpType').value, note: $('#wpNote').value.trim(), t: Date.now() };
  const i = state.wps.findIndex(x => x.id === w.id); if (i >= 0) { w.t = state.wps[i].t; state.wps[i] = w; } else state.wps.push(w);
  await DB.put('wps', w).catch(() => {}); renderWps(); toast('Waypoint saved'); wpList();
};
function wpList() {
  const me = state.me ? [state.me.lng, state.me.lat] : null;
  const items = [...state.wps].sort((a, b) => b.t - a.t);
  showSheet(`<h2>Waypoints</h2><div class="btnrow"><button class="btn" data-act="wpHere">At my location</button><button class="btn ghost" data-act="wpCentre">At map centre</button>${items.length ? '<button class="btn ghost" data-act="gpx">Export GPX</button>' : ''}</div>
    <ul class="list">${items.map(w => `<li><span class="swatch" style="display:inline-block;vertical-align:-2px;background:${(WP_TYPES[w.type] || WP_TYPES.note)[1]}"></span> <span class="t">${esc(w.name)}</span><span class="badge">${(WP_TYPES[w.type] || WP_TYPES.note)[0]}</span><br><span class="sub">${fmtDate(w.t)}${me ? ' · ' + fmtDist(distM(me, [w.lng, w.lat])) + ' ' + compass(bearing(me, [w.lng, w.lat])) : ''}${w.note ? ' · ' + esc(w.note) : ''}</span><div class="btnrow"><button class="btn small ghost" data-act="wpGo" data-id="${w.id}">Show</button><button class="btn small ghost" data-act="navTo" data-id="${w.id}">Navigate</button><a class="btn small ghost" href="https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}" target="_blank" rel="noopener">Drive</a><button class="btn small ghost" data-act="wpEdit" data-id="${w.id}">Edit</button><button class="btn small ghost" data-act="wpDel" data-id="${w.id}">Delete</button></div></li>`).join('') || '<li class="sub">No waypoints yet. Tap the map, then “Save waypoint”.</li>'}</ul>`, { tall: true, kind: 'wp' });
}
actions.wpList = wpList;
actions.wpHere = () => state.me ? wpForm([state.me.lng, state.me.lat]) : toast('Turn on location first');
actions.wpCentre = () => { const c = map.getCenter(); wpForm([c.lng, c.lat]); };
actions.wpGo = b => { const w = state.wps.find(x => x.id === b.dataset.id); if (w) { map.flyTo({ center: [w.lng, w.lat], zoom: Math.max(map.getZoom(), 15) }); identify([w.lng, w.lat]); } };
actions.wpEdit = b => { const w = state.wps.find(x => x.id === b.dataset.id); if (w) wpForm([w.lng, w.lat], w); };
actions.wpDel = async b => { if (!(await confirmDlg('Delete this waypoint?', 'Delete'))) return; state.wps = state.wps.filter(x => x.id !== b.dataset.id); await DB.del('wps', b.dataset.id).catch(() => {}); renderWps(); wpList(); };
actions.gpx = async () => {
  const x = s => esc(s);
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Hunt Access NZ" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    state.wps.map(w => `<wpt lat="${w.lat.toFixed(6)}" lon="${w.lng.toFixed(6)}"><time>${new Date(w.t).toISOString()}</time><name>${x(w.name)}</name><desc>${x(w.note)}</desc><type>${x((WP_TYPES[w.type] || WP_TYPES.note)[0])}</type></wpt>`).join('\n') + `\n</gpx>`;
  const file = new File([gpx], 'hunt-waypoints.gpx', { type: 'application/gpx+xml' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Waypoints' }); return; } catch {} }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
};

/* ---------------- permissions log ---------------- */
function permList() {
  const today = new Date().toISOString().slice(0, 10);
  const items = [...state.perms].sort((a, b) => (b.to || '').localeCompare(a.to || ''));
  showSheet(`<h2>Permissions log</h2><p class="sub">Your own record of landowner permissions. Stored only on this device.</p>
    <div class="btnrow"><button class="btn" data-act="permNew">Add permission</button></div>
    <ul class="list">${items.map(p => { const active = (!p.from || p.from <= today) && (!p.to || p.to >= today); return `<li><span class="t">${esc(p.property)}</span><span class="badge" style="background:${active ? '#d9f5e3' : '#f3f4f6'};color:#111">${active ? 'Current' : (p.to && p.to < today ? 'Expired' : 'Upcoming')}</span><br><span class="sub">${esc(p.owner)}${p.phone ? ' · ' + esc(p.phone) : ''}<br>${p.from ? fmtDate(p.from) : '?'} – ${p.to ? fmtDate(p.to) : 'ongoing'}${p.species ? ' · ' + esc(p.species) : ''}</span>${p.cond ? `<br><span class="sub">Conditions: ${esc(p.cond)}</span>` : ''}<div class="btnrow">${p.lng != null ? `<button class="btn small ghost" data-act="permGo" data-id="${p.id}">Show</button>` : ''}<button class="btn small ghost" data-act="permEdit" data-id="${p.id}">Edit</button><button class="btn small ghost" data-act="permDel" data-id="${p.id}">Delete</button></div></li>`; }).join('') || '<li class="sub">Nothing logged yet.</li>'}</ul>`, { tall: true, kind: 'perm' });
}
function permForm(p = {}) {
  const pt = p.lng != null ? [p.lng, p.lat] : state.target;
  showSheet(`<h2>${p.id ? 'Edit' : 'Add'} permission</h2>
    <span class="field-l">Property / station</span><input type="text" id="pmProp" value="${esc(p.property || '')}">
    <span class="field-l">Landowner or manager</span><input type="text" id="pmOwner" value="${esc(p.owner || '')}">
    <span class="field-l">Phone</span><input type="tel" id="pmPhone" value="${esc(p.phone || '')}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><span class="field-l">From</span><input type="date" id="pmFrom" value="${esc(p.from || '')}"></div><div><span class="field-l">To</span><input type="date" id="pmTo" value="${esc(p.to || '')}"></div></div>
    <span class="field-l">Species allowed</span><input type="text" id="pmSp" value="${esc(p.species || '')}" placeholder="e.g. Pigs and goats, no deer">
    <span class="field-l">Conditions (gates, no-go blocks, dogs, vehicles)</span><textarea id="pmCond">${esc(p.cond || '')}</textarea>
    <p class="sub">${pt ? 'Location: ' + pt[1].toFixed(5) + ', ' + pt[0].toFixed(5) + ' (the selected map point)' : 'Tip: tap the property on the map first to attach its location.'}</p>
    <div class="btnrow"><button class="btn" data-act="permSave" data-id="${esc(p.id || '')}" ${pt ? `data-lng="${pt[0]}" data-lat="${pt[1]}"` : ''}>Save</button><button class="btn ghost" data-act="permList">Cancel</button></div>`, { tall: true, kind: 'perm' });
}
actions.permList = permList;
actions.permNew = () => permForm();
actions.permEdit = b => permForm(state.perms.find(x => x.id === b.dataset.id) || {});
actions.permSave = async b => {
  const p = { id: b.dataset.id || uid(), property: $('#pmProp').value.trim() || 'Property', owner: $('#pmOwner').value.trim(), phone: $('#pmPhone').value.trim(), from: $('#pmFrom').value, to: $('#pmTo').value, species: $('#pmSp').value.trim(), cond: $('#pmCond').value.trim() };
  if (b.dataset.lng) { p.lng = +b.dataset.lng; p.lat = +b.dataset.lat; }
  const i = state.perms.findIndex(x => x.id === p.id); if (i >= 0) state.perms[i] = p; else state.perms.push(p);
  await DB.put('perms', p).catch(() => {}); toast('Saved'); permList();
};
actions.permDel = async b => { if (!(await confirmDlg('Delete this permission record?', 'Delete'))) return; state.perms = state.perms.filter(x => x.id !== b.dataset.id); await DB.del('perms', b.dataset.id).catch(() => {}); permList(); };
actions.permGo = b => { const p = state.perms.find(x => x.id === b.dataset.id); if (p && p.lng != null) { map.flyTo({ center: [p.lng, p.lat], zoom: 14 }); closeSheet(); } };

/* ---------------- trip intentions ---------------- */
function tripSheet() {
  const t = LS.get('trip', {}); const sel = state.target;
  const where = t.where || (sel ? `${sel[1].toFixed(5)}, ${sel[0].toFixed(5)}` : '');
  showSheet(`<h2>Trip intentions</h2><p class="sub">Leave this with someone you trust. Agree what they do if you’re overdue (normally call 111 and ask for Police).</p>
    <span class="field-l">Where you’re going</span><input type="text" id="tWhere" value="${esc(where)}">
    <span class="field-l">Party (names)</span><input type="text" id="tParty" value="${esc(t.party || '')}">
    <span class="field-l">Vehicle &amp; where it’ll be parked</span><input type="text" id="tCar" value="${esc(t.car || '')}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><span class="field-l">Leaving</span><input type="datetime-local" id="tOut" value="${esc(t.out || '')}"></div><div><span class="field-l">Back by</span><input type="datetime-local" id="tBack" value="${esc(t.back || '')}"></div></div>
    <span class="field-l">Raise the alarm if no contact by</span><input type="datetime-local" id="tAlarm" value="${esc(t.alarm || '')}">
    <span class="field-l">Gear (PLB, inReach, radio, first aid)</span><input type="text" id="tGear" value="${esc(t.gear || '')}">
    <span class="field-l">Trusted contact’s phone (for SMS)</span><input type="tel" id="tPhone" value="${esc(t.phone || '')}">
    <div class="btnrow"><button class="btn" data-act="checkinStart">Start check-in timer</button><button class="btn ghost" data-act="tripPos">Text my position</button></div>
    <p class="sub">The check-in timer reminds you before your back-by time and helps you text “out safe” or your position. It only runs while the app is open, so your contact is still the real safety net.</p>
    <div class="btnrow"><button class="btn" data-act="tripShare">Share / text</button><button class="btn ghost" data-act="tripCopy">Copy</button><a class="btn ghost" href="${LINKS.adventure}" target="_blank" rel="noopener">AdventureSmart</a></div>`, { tall: true, kind: 'trip' });
}
function tripText() {
  const g = id => $(id).value.trim(); const d = v => v ? new Date(v).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '?';
  const t = { where: g('#tWhere'), party: g('#tParty'), car: g('#tCar'), out: $('#tOut').value, back: $('#tBack').value, alarm: $('#tAlarm').value, gear: g('#tGear'), phone: g('#tPhone') };
  LS.set('trip', t);
  return { t, text: `Hunting trip intentions\nWhere: ${t.where}\nParty: ${t.party}\nVehicle: ${t.car}\nLeaving: ${d(t.out)}\nBack by: ${d(t.back)}\nIf no contact by ${d(t.alarm)}: call 111, ask for Police, give them this message.\nGear: ${t.gear}` };
}
actions.tripShare = async () => {
  const { t, text } = tripText();
  if (navigator.share) { try { await navigator.share({ text }); return; } catch {} }
  location.href = `sms:${encodeURIComponent(t.phone)}?&body=${encodeURIComponent(text)}`;
};
actions.tripCopy = async () => { const { text } = tripText(); try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); } };

/* ---------------- wind & sun ---------------- */
function arrow(deg) { return `<svg viewBox="0 0 24 24" style="transform:rotate(${deg + 180}deg)"><path d="M12 3l5 9h-3v9h-4v-9H7z" fill="currentColor"/></svg>`; }
async function showConditions(p) {
  p = p || (state.me ? [state.me.lng, state.me.lat] : [map.getCenter().lng, map.getCenter().lat]);
  const now = new Date(), st = sunTimes(now, p[1], p[0]), tw = sunTimes(now, p[1], p[0], -6), tm = sunTimes(new Date(now.getTime() + 864e5), p[1], p[0]);
  const sunHtml = st ? `<dl class="kv"><dt>First light</dt><dd>${tw ? fmtTime(tw.rise) : '—'}</dd><dt>Sunrise</dt><dd>${fmtTime(st.rise)}</dd><dt>Sunset</dt><dd>${fmtTime(st.set)}</dd><dt>Last light</dt><dd>${tw ? fmtTime(tw.set) : '—'}</dd><dt>Tomorrow</dt><dd>${tm ? fmtTime(tm.rise) + ' – ' + fmtTime(tm.set) : '—'}</dd></dl>` : '';
  const head = `<h2>Wind &amp; sun</h2><p class="sub">${p[1].toFixed(4)}, ${p[0].toFixed(4)}</p>${sunHtml}<p class="sub">First and last light are civil twilight. Only shoot when you can identify your target beyond doubt.</p>`;
  showSheet(head + `<h3>Wind forecast</h3><p class="sub">${online() ? 'Loading…' : 'Wind forecast needs a connection.'}</p>`, { kind: 'cond' });
  if (!online()) return;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(4)}&longitude=${p[0].toFixed(4)}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation_probability&timezone=Pacific%2FAuckland&forecast_days=3&wind_speed_unit=kmh`;
    const j = await (await fetchT(u, 12000)).json();
    const H = j.hourly, start = H.time.findIndex(t => new Date(t) >= new Date(now.getTime() - 36e5));
    const cells = [];
    for (let i = Math.max(start, 0); i < H.time.length && cells.length < 18; i += 3) {
      cells.push(`<div data-act="scent" data-i="${i}" role="button" tabindex="0" style="cursor:pointer"><b>${new Date(H.time[i]).toLocaleTimeString('en-NZ', { weekday: cells.length && new Date(H.time[i]).getHours() < 3 ? 'short' : undefined, hour: 'numeric' })}</b>${arrow(H.wind_direction_10m[i])}${Math.round(H.wind_speed_10m[i])}<span class="sub">/${Math.round(H.wind_gusts_10m[i])}</span><br>${compass(H.wind_direction_10m[i])}<br><span class="sub">${Math.round(H.temperature_2m[i])}° ${H.precipitation_probability[i] ?? '–'}%</span></div>`);
    }
    lastWind = { p, H };
    const nowI = Math.max(start, 0);
    showSheet(head + `<h3>Wind forecast (km/h, gusts)</h3><p class="sub">Arrows point where the wind is blowing <b>to</b>, which is where your scent goes. Tap a time to draw the scent cone on the map.</p><div class="btnrow"><button class="btn small" data-act="scent" data-i="${nowI}">Scent cone now</button><button class="btn small ghost" data-act="scentClear">Clear scent cone</button></div><div class="wind">${cells.join('')}</div><p class="sub">Forecast: Open-Meteo.</p>`, { kind: 'cond' });
  } catch { showSheet(head + `<p class="sub">Couldn’t load the wind forecast.</p>`, { kind: 'cond' }); }
}

/* ---------------- offline areas ---------------- */
const lon2x = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * rad; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
function tileRange(b, z) { return { x0: lon2x(b[0], z), x1: lon2x(b[2], z), y0: lat2y(b[3], z), y1: lat2y(b[1], z) }; }
function countTiles(b, z0, z1) { let n = 0; for (let z = z0; z <= z1; z++) { const r = tileRange(b, z); n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1); } return n; }
const LEVELS = { std: { label: 'Standard', topo50: 14, aerial: 15 }, det: { label: 'Detailed', topo50: 15, aerial: 16 }, max: { label: 'Maximum', topo50: 16, aerial: 17 } };
const KB = { topo: 18, topo50: 45, aerial: 35, terrain: 30 };
function normKey(u) { try { const x = new URL(u); x.searchParams.delete('api'); x.searchParams.sort(); return x.toString(); } catch { return u; } }
let dl = null;
function offlineSheet() {
  const b = viewBBox(0); const lvl = LS.get('lvl', 'det'); const sel = LS.get('dlBases', { topo: true, topo50: true, aerial: false });
  const est = () => {
    const L = LEVELS[lvl]; let n = 0, kb = 0;
    if (sel.topo) { const c = countTiles(b, 5, 15); n += c; kb += c * KB.topo; }
    if (sel.topo50) { const c = countTiles(b, 5, L.topo50); n += c; kb += c * KB.topo50; }
    if (sel.aerial) { const c = countTiles(b, 5, L.aerial); n += c; kb += c * KB.aerial; }
    if (sel.terrain) { const c = countTiles(b, 5, 13) + countTiles(b, 5, Math.min(15, L.topo50)); n += c; kb += c * KB.terrain; }
    return { n, mb: kb / 1024 };
  };
  const e = est(), tooBig = e.n > 25000;
  const w = distM([b[0], (b[1] + b[3]) / 2], [b[2], (b[1] + b[3]) / 2]), hgt = distM([b[0], b[1]], [b[0], b[3]]);
  showSheet(`<h2>Offline maps</h2>
    <p class="sub">Saves the area on screen: basemap tiles plus DOC hunting areas, conservation land, paper roads, property boundaries, pesticide areas and animal ranges. Status checks then work with no signal.</p>
    <h3>Save this view <span class="sub">(${fmtDist(w)} × ${fmtDist(hgt)})</span></h3>
    <span class="field-l">Name</span><input type="text" id="dlName" placeholder="e.g. Waitōtara roar trip">
    <span class="field-l">Detail</span><div class="seg">${Object.entries(LEVELS).map(([k, v]) => `<button data-act="lvl" data-k="${k}" class="${lvl === k ? 'on' : ''}">${v.label}<br><span class="sub">aerial z${v.aerial}</span></button>`).join('')}</div>
    ${Object.entries(BASEMAPS).map(([k, v]) => `<label class="toggle"><input type="checkbox" data-act="dlb" data-k="${k}" ${sel[k] ? 'checked' : ''}>${v.label} <span class="sub">${v.note}</span></label>`).join('')}
    <label class="toggle"><input type="checkbox" data-act="dlb" data-k="terrain" ${sel.terrain ? 'checked' : ''}>Terrain <span class="sub">Hillshade, slope, sunny faces, elevation profiles</span></label>
    <p class="sub">About <b>${e.n.toLocaleString()}</b> tiles, ~<b>${e.mb < 1 ? '<1' : Math.round(e.mb)} MB</b>. ${tooBig ? '<b>Too big. Zoom in or lower the detail.</b>' : 'LINZ limits downloads, so allow about a minute per 800 tiles.'}</p>
    <div id="dlProg" hidden><div class="progress"><i id="dlBar"></i></div><p class="sub" id="dlTxt"></p></div>
    <div class="btnrow"><button class="btn" data-act="dlStart" ${tooBig || !e.n || !online() ? 'disabled' : ''}>${online() ? 'Download area' : 'Offline — connect to download'}</button><button class="btn ghost" data-act="dlCancel" hidden id="dlCancelBtn">Cancel</button></div>
    <h3>Saved areas</h3><ul class="list" id="areaList">${areaListHtml()}</ul>
    <p class="sub" id="storeInfo"></p>`, { tall: true, kind: 'offline' });
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(s => { const el = $('#storeInfo'); if (el) el.textContent = `Storage used on this device: ${Math.round((s.usage || 0) / 1048576)} MB of ~${Math.round((s.quota || 0) / 1048576)} MB available.`; });
}
function areaListHtml() {
  return state.areas.map(a => `<li><span class="t">${esc(a.name)}</span><br><span class="sub">${fmtDate(a.t)} · ${(a.tiles || 0).toLocaleString()} tiles${a.failed ? ' · ' + a.failed + ' failed' : ''} · ${a.bases.join(', ')}</span><div class="btnrow"><button class="btn small ghost" data-act="areaGo" data-id="${a.id}">Show</button><button class="btn small ghost" data-act="areaDel" data-id="${a.id}">Delete</button></div></li>`).join('') || '<li class="sub">No saved areas yet.</li>';
}
actions.lvl = b => { LS.set('lvl', b.dataset.k); offlineSheet(); };
sheetBody.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.act === 'dlb') { const s = LS.get('dlBases', { topo: true, topo50: true, aerial: false }); s[e.target.dataset.k] = e.target.checked; LS.set('dlBases', s); offlineSheet(); } });
actions.areaGo = b => { const a = state.areas.find(x => x.id === b.dataset.id); if (a) { map.fitBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]], { padding: 20 }); closeSheet(); } };
actions.areaDel = async b => {
  const a = state.areas.find(x => x.id === b.dataset.id); if (!a || !(await confirmDlg(`Delete “${a.name}” from this device?`, 'Delete'))) return;
  state.areas = state.areas.filter(x => x !== a); await DB.del('areas', a.id).catch(() => {});
  try {
    const keep = new Set(); state.areas.forEach(x => (x.keys || []).forEach(k => keep.add(k)));
    const c = await caches.open('tiles-v1'); for (const k of a.keys || []) if (!keep.has(k)) await c.delete(k);
  } catch {}
  toast('Area deleted'); offlineSheet();
};
actions.dlCancel = () => { if (dl) dl.cancel = true; };
async function resolveStyle(url) {
  const r = await fetchT(url, 20000); if (!r.ok) throw new Error('Style ' + r.status);
  const style = await r.clone().json(); const out = { style, styleResp: r, templates: [], extra: [] };
  for (const s of Object.values(style.sources || {})) {
    if (s.url) { const tr = await fetchT(s.url, 20000); if (!tr.ok) continue; const tj = await tr.clone().json(); out.extra.push([s.url, tr]); (tj.tiles || []).forEach(t => out.templates.push({ t, max: tj.maxzoom ?? s.maxzoom ?? 15, vector: s.type === 'vector' })); }
    else if (s.tiles) s.tiles.forEach(t => out.templates.push({ t, max: s.maxzoom ?? 22, vector: s.type === 'vector' }));
  }
  const fonts = new Set();
  (style.layers || []).forEach(l => { const f = l.layout && l.layout['text-font']; if (Array.isArray(f) && f.every(x => typeof x === 'string')) fonts.add(f.join(',')); });
  if (style.glyphs) fonts.forEach(f => ['0-255', '256-511', '8192-8447'].forEach(rg => out.extra.push([style.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', rg), null])));
  if (style.sprite) [].concat(style.sprite).forEach(sp => { const u = typeof sp === 'string' ? sp : sp.url; ['.json', '.png', '@2x.json', '@2x.png'].forEach(sfx => out.extra.push([u + sfx, null])); });
  return out;
}
actions.dlStart = async () => {
  if (dl) return;
  const b = viewBBox(0), lvl = LEVELS[LS.get('lvl', 'det')], sel = LS.get('dlBases', { topo: true, topo50: true, aerial: false });
  const name = ($('#dlName') && $('#dlName').value.trim()) || 'Area ' + new Date().toLocaleDateString('en-NZ');
  dl = { cancel: false };
  $('#dlProg').hidden = false; $('#dlCancelBtn').hidden = false;
  const prog = (f, t) => { const bar = $('#dlBar'), tx = $('#dlTxt'); if (bar) bar.style.width = (f * 100).toFixed(1) + '%'; if (tx) tx.textContent = t; };
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
  const area = { id: uid(), name, bbox: b, t: Date.now(), bases: [], keys: [], data: {}, tiles: 0, failed: 0 };
  try {
    const cache = await caches.open('tiles-v1');
    // 1) vector data for status checks
    prog(0.01, 'Saving land and access data…');
    const lat = (b[1] + b[3]) / 2; let i = 0;
    for (const L of LAYERS) {
      if (dl.cancel) throw new Error('cancelled');
      prog(0.01 + 0.14 * (i++ / LAYERS.length), 'Saving ' + (L.sp ? L.sp.label : L.id) + ' data…');
      try { area.data[L.id] = await agsQuery(L.url, bboxParams(b, L, L.group === 'species' ? 11 : 16, lat), { pages: L.id === 'parcels' ? 20 : 6, rec: L.max || 1000, timeout: 30000 }); } catch { area.data[L.id] = EMPTY; }
    }
    // 2) basemap tiles
    const urls = [];
    for (const [k, B] of Object.entries(BASEMAPS)) {
      if (!sel[k]) continue; area.bases.push(B.label);
      if (B.raster) { const tpl = B.raster(state.key); for (let z = 5; z <= lvl.topo50; z++) { const r = tileRange(b, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) urls.push(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)); } continue; }
      prog(0.15, 'Reading ' + B.label + ' style…');
      const rs = await resolveStyle(B.style(state.key));
      await cache.put(normKey(B.style(state.key)), rs.styleResp); area.keys.push(normKey(B.style(state.key)));
      for (const [u, resp] of rs.extra) { if (resp) { await cache.put(normKey(u), resp); area.keys.push(normKey(u)); } else urls.push(u); }
      for (const T of rs.templates) {
        const zmax = T.vector ? Math.min(15, T.max) : Math.min(lvl.aerial, T.max);
        for (let z = 5; z <= zmax; z++) { const r = tileRange(b, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) urls.push(T.t.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
      }
    }
    if (sel.terrain) {
      area.bases.push('Terrain');
      for (let z = 5; z <= 13; z++) { const r = tileRange(b, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) urls.push(demURL(z, x, y)); }
      const ht = hillURL();
      for (let z = 5; z <= Math.min(15, lvl.topo50); z++) { const r = tileRange(b, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) urls.push(ht.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
    }
    const uniq = [...new Set(urls)]; let done = 0, fail = 0, next = 0, tokens = 14, last = Date.now();
    const worker = async () => {
      while (next < uniq.length && !dl.cancel) {
        const u = uniq[next++], key = normKey(u);
        const nowT = Date.now(); tokens = Math.min(14, tokens + (nowT - last) / 1000 * 14); last = nowT;
        if (tokens < 1) { await sleep(((1 - tokens) / 14) * 1000); tokens = 0; } else tokens -= 1;
        try {
          if (!(await cache.match(key))) {
            let r = await fetchT(u, 25000);
            if (r.status === 429) { await sleep(6000); r = await fetchT(u, 25000); }
            if (r.ok) await cache.put(key, r); else if (r.status !== 404 && r.status !== 204) fail++;
          }
          area.keys.push(key);
        } catch { fail++; }
        done++; if (done % 10 === 0 || done === uniq.length) prog(0.15 + 0.85 * done / uniq.length, `Tiles ${done.toLocaleString()} / ${uniq.length.toLocaleString()}${fail ? ' · ' + fail + ' failed' : ''}`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (dl.cancel) throw new Error('cancelled');
    area.tiles = uniq.length; area.failed = fail;
    await DB.put('areas', area); state.areas.push(area);
    prog(1, `Saved “${name}”: ${uniq.length.toLocaleString()} tiles${fail ? ', ' + fail + ' failed (try again to fill gaps)' : ''}.`);
    toast('Offline area saved');
    const al = $('#areaList'); if (al) al.innerHTML = areaListHtml();
  } catch (e) {
    prog(0, e.message === 'cancelled' ? 'Download cancelled.' : 'Download failed: ' + e.message);
  } finally { dl = null; const c = $('#dlCancelBtn'); if (c) c.hidden = true; }
};
$('#btnOffline').onclick = () => (sheetKind === 'offline' && !sheet.hidden ? closeSheet() : offlineSheet());

/* ---------------- menu & settings ---------------- */
function menuSheet() {
  showSheet(`<h2>Tools</h2><div class="menu">
    <button data-act="mArc"><span>🎯</span><span>Shooting arc check<small>What’s in your line of fire</small></span></button>
    <button data-act="mTrack"><span>🛻</span><span>Track &amp; back to the truck<small>Record your route, arrow back to any point</small></span></button>
    <button data-act="mRoute"><span>⛰</span><span>Route planner<small>Distance, climb and elevation profile</small></span></button>
    <button data-act="mLog"><span>🦌</span><span>Hunt log<small>Kills and sightings, photos, season totals</small></span></button>
    <button data-act="mShare"><span>🔗</span><span>Share a trip<small>Send your plan as a link or GPX</small></span></button>
    <button data-act="mAccess"><span>🗺</span><span>Hunting access beyond DOC<small>Stations, forestry, iwi and council land</small></span></button>
    <button data-act="wpList"><span>📍</span><span>Waypoints<small>Vehicle, camp, sightings. Export GPX</small></span></button>
    <button data-act="permList"><span>✍</span><span>Permissions log<small>Your landowner permissions and conditions</small></span></button>
    <button data-act="mTrip"><span>🧭</span><span>Trip intentions &amp; check-in<small>Text your plan; overdue reminder</small></span></button>
    <button data-act="mCond"><span>🌬</span><span>Wind, scent &amp; sun<small>Wind forecast, scent cone, first and last light</small></span></button>
    <button data-act="mSettings"><span>⚙</span><span>Settings &amp; help<small>Map key, alerts, data sources, disclaimer</small></span></button></div>`, { kind: 'menu' });
}
actions.mAccess = () => accessList();
actions.mTrip = tripSheet;
actions.mCond = () => showConditions(state.target);
actions.mSettings = settingsSheet;
function settingsSheet() {
  const age = keyAgeDays(state.key);
  showSheet(`<h2>Settings &amp; help</h2>
    <label class="toggle"><input type="checkbox" data-act="alerts" ${state.alerts ? 'checked' : ''}>Boundary alerts (vibrate and beep when you move onto private or no-hunting land)</label>
    <h3>LINZ map key</h3>
    <p class="sub">Maps come from LINZ Basemaps. The app creates a free standard key, which lasts 90 days and renews itself. For a key that never expires, email basemaps@linz.govt.nz to request developer access, then paste it here.</p>
    <input type="text" id="keyIn" value="${esc(state.key)}" autocapitalize="off" spellcheck="false">
    <p class="sub">${state.key[0] === 'c' ? `Standard key, ${Math.floor(age)} days old.` : 'Developer key.'}</p>
    <div class="btnrow"><button class="btn small" data-act="keySave">Save key</button><button class="btn small ghost" data-act="keyNew">New standard key</button></div>
    <h3>Device</h3><div class="btnrow"><button class="btn small ghost" data-act="clearRt">Clear browsing cache</button></div>
    <h3>How to read the map</h3>
    <p class="sub">Tap anywhere for a land status verdict. Dark green: DOC land. Lime: huntable with a DOC permit (amber: restricted or ballot; red stripes: no hunting). Orange: legal and paper roads. Blue: other public access to travel through. Rose: needs landowner permission (purple: Māori land; slate: riverbed; grey: other Crown or reserve land to check). Turn each category on or off under Map &amp; layers. Public access never means permission to shoot.</p>
    <h3>Data sources</h3>
    <p class="sub">DOC Open Data (hunting areas, conservation land, pesticide summaries, animal distribution 2007/2014). Toitū Te Whenua LINZ (Basemaps, primary parcels, titles without owners, place names). Herenga ā Nuku Aotearoa (Public Access Areas). Open-Meteo (wind). All CC BY 4.0 or open terms.</p>
    <h3>Disclaimer</h3>
    <p class="sub">A planning aid only. Boundaries are indicative, not survey-accurate. Data can be out of date. You’re responsible for having permission, the right permits and a firearms licence, and for following the Arms Code. When in doubt, don’t shoot.</p>
    <p class="sub">Version 1.2 · ${navigator.serviceWorker && navigator.serviceWorker.controller ? 'Offline ready' : 'Offline support starts after the next reload'}</p>`, { tall: true, kind: 'settings' });
}
actions.keySave = () => { const k = $('#keyIn').value.trim(); if (!/^[cd][0-9a-z]{20,}$/i.test(k)) { toast('That doesn’t look like a LINZ key'); return; } state.key = k; LS.set('linzKey', k); styleErrShown = false; map.setStyle(styleFor(state.base), { diff: false }); toast('Key saved'); };
actions.keyNew = () => { state.key = makeKey(); LS.set('linzKey', state.key); styleErrShown = false; map.setStyle(styleFor(state.base), { diff: false }); settingsSheet(); toast('New key created'); };
actions.clearRt = async () => { try { await caches.delete('tiles-rt'); toast('Browsing cache cleared (saved areas kept)'); } catch {} };
$('#btnMenu').onclick = () => (sheetKind === 'menu' && !sheet.hidden ? closeSheet() : menuSheet());

/* ---------------- search ---------------- */
const results = $('#searchResults');
$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault(); const q = $('#searchInput').value.trim(); if (!q) return;
  $('#searchInput').blur();
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/);
  if (m) {
    let a = +m[1], b = +m[2], p = null;
    if (a > 1e6 && b > 1e6) p = a > b ? nztmToLL(b, a) : nztmToLL(a, b);
    else if (Math.abs(a) <= 90 && Math.abs(b) <= 180) p = [b, a];
    else if (Math.abs(b) <= 90) p = [a, b];
    if (p) { map.flyTo({ center: p, zoom: 15 }); identify(p); results.hidden = true; return; }
  }
  const wpHits = state.wps.filter(w => w.name.toLowerCase().includes(q.toLowerCase())).map(w => ({ name: w.name, sub: 'Waypoint', p: [w.lng, w.lat] }));
  let hits = [...wpHits];
  results.innerHTML = '<button disabled>Searching…</button>'; results.hidden = false;
  if (online()) {
    const F = foldQ(q), num = /^\d/.test(F);
    const roadPart = F.replace(/^\d+[A-Z]?\s*(\/\s*\d+\s*)?/, '').trim();
    const jobs = [
      agsQuery(URLS.places, { where: `UPPER(name) LIKE '%${foldQ(q, false)}%'`, outFields: 'name,feat_type,territorial_authority', returnGeometry: true }, { pages: 1, rec: 8 })
        .then(fc => fc.features.filter(f => f.geometry).map(f => ({ name: f.properties.name, sub: ['Place', f.properties.feat_type, f.properties.territorial_authority].filter(Boolean).join(' · '), p: f.geometry.coordinates, z: 14 })))
    ];
    if (num) jobs.push(agsQuery(URLS.addresses, { where: `UPPER(full_address_ascii) LIKE '${F}%'`, outFields: 'full_address,suburb_locality,town_city,territorial_authority', returnGeometry: true }, { pages: 1, rec: 10 })
      .then(fc => fc.features.filter(f => f.geometry).map(f => ({ name: f.properties.full_address, sub: ['Address', f.properties.suburb_locality, f.properties.town_city || f.properties.territorial_authority].filter(Boolean).join(' · '), p: f.geometry.coordinates, z: 16, id: true }))));
    if (roadPart.length >= 3) {
      jobs.push(agsQuery(URLS.addresses, { where: `UPPER(full_road_name_ascii) LIKE '${roadPart}%'`, outFields: 'road_id,full_road_name,suburb_locality,town_city,territorial_authority', returnDistinctValues: true, returnGeometry: false }, { pages: 1, rec: 30 })
        .then(fc => fc.features.map(f => ({ name: f.properties.full_road_name, sub: ['Road', f.properties.suburb_locality, f.properties.town_city || f.properties.territorial_authority].filter(Boolean).join(' · '), roadId: f.properties.road_id }))));
      jobs.push(agsQuery(URLS.roads, { where: `UPPER(full_road_name_ascii) LIKE '${roadPart}%'`, outFields: 'road_id,full_road_name', returnGeometry: false }, { pages: 1, rec: 30 })
        .then(fc => fc.features.map(f => ({ name: f.properties.full_road_name, sub: 'Road (no street addresses)', roadId: f.properties.road_id, bare: true }))));
    }
    const got = await Promise.allSettled(jobs);
    const seenRoad = new Set();
    for (const g of got) if (g.status === 'fulfilled') for (const h of g.value) {
      if (h.roadId != null) { if (seenRoad.has(h.roadId)) continue; seenRoad.add(h.roadId); }
      hits.push(h);
    }
  }
  results.innerHTML = hits.slice(0, 20).map((h, i) => `<button data-i="${i}">${esc(h.name)}<br><small>${esc(h.sub)}</small></button>`).join('') || `<button disabled>No matches${online() ? '' : ' (offline: try coordinates)'}</button>`;
  results.hidden = false; results._hits = hits;
});
function foldQ(q, expand = true) {
  let s = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/'/g, "''").replace(/[%_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (expand) s = s.replace(/\bRD\b\.?/g, 'ROAD').replace(/\bST\b\.?/g, 'STREET').replace(/\bAVE?\b\.?/g, 'AVENUE').replace(/\bHWY\b/g, 'HIGHWAY').replace(/\bDR\b\.?/g, 'DRIVE').replace(/\bTCE\b/g, 'TERRACE').replace(/\bPL\b/g, 'PLACE').replace(/\bCRES\b/g, 'CRESCENT');
  return s;
}
results.addEventListener('click', async e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  const h = results._hits[+b.dataset.i]; results.hidden = true;
  if (h.roadId != null) {
    try {
      const fc = await agsQuery(URLS.roads, { where: `road_id=${+h.roadId}`, outFields: 'full_road_name', returnGeometry: true }, { pages: 2, rec: 200 });
      if (!fc.features.length) { toast('Couldn’t find that road’s location'); return; }
      const bb = [180, 90, -180, -90];
      fc.features.forEach(f => { const r = fbbox(f); bb[0] = Math.min(bb[0], r[0]); bb[1] = Math.min(bb[1], r[1]); bb[2] = Math.max(bb[2], r[2]); bb[3] = Math.max(bb[3], r[3]); });
      setData('sel', fc); map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 60, maxZoom: 16 });
      toast(h.name + ' highlighted. Tap beside it to check the land');
    } catch { toast('Road lookup failed'); }
    return;
  }
  map.flyTo({ center: h.p, zoom: h.z || 14 });
  if (h.id) identify(h.p);
});
$('#searchInput').addEventListener('input', () => { if (!$('#searchInput').value) results.hidden = true; });
map.on('movestart', () => { results.hidden = true; });

/* ---------------- connectivity ---------------- */
function netChip() { const c = $('#netChip'); c.textContent = online() ? 'Online' : 'Offline'; c.classList.toggle('off', !online()); }
window.addEventListener('online', () => { netChip(); state.loaded = {}; scheduleRefresh(); });
window.addEventListener('offline', () => { netChip(); state.loaded = {}; scheduleRefresh(); toast('Offline — using saved areas'); });
netChip();

/* ================= v1.2 tools: safety, planning, records ================= */
const dest = (p, brg, d) => {
  const dl = d / R, th = brg * rad, f1 = p[1] * rad, l1 = p[0] * rad;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(dl) + Math.cos(f1) * Math.sin(dl) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dl) * Math.cos(f1), Math.cos(dl) - Math.sin(f1) * Math.sin(f2));
  return [l2 / rad, f2 / rad];
};
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
function conePoly(p, brg, half, r, props = {}) {
  const pts = [p], step = Math.max(1, half / 12);
  for (let a = -half; a <= half + 0.001; a += step) pts.push(dest(p, brg + a, r));
  pts.push(p);
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [pts] } };
}
const xy = (p, ref) => [(p[0] - ref[0]) * Math.cos(ref[1] * rad) * 111320, (p[1] - ref[1]) * 110540];
function segDist(P, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx, qy = a[1] + t * dy; return [Math.hypot(qx - P[0], qy - P[1]), [qx, qy]];
}
function nearestEdge(p, f) {
  const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys) return null;
  let best = { d: Infinity, q: null };
  for (const poly of polys) for (const ring of poly) {
    let prev = xy(ring[0], p);
    for (let i = 1; i < ring.length; i++) { const cur = xy(ring[i], p); const [d, q] = segDist([0, 0], prev, cur); if (d < best.d) best = { d, q }; prev = cur; }
  }
  if (best.q) best.q = [p[0] + best.q[0] / (Math.cos(p[1] * rad) * 111320), p[1] + best.q[1] / 110540];
  return best;
}
const lineFC = pts => pts.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map(q => [q[0], q[1]]) } } : EMPTY;
const trackLen = pts => { let d = 0; for (let i = 1; i < pts.length; i++) d += distM(pts[i - 1], pts[i]); return d; };
const fmtDur = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
const pickName = p => (p && (p.name || p.Name || p.NAME || p.hutName || p.HutName || p.campsiteName || p.trackName || p.DESCRIPTION || p.description || p.Description)) || 'Unnamed';
const myP = () => state.me ? [state.me.lng, state.me.lat] : null;
const sameP = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
const smsHref = (phone, body) => `sms:${encodeURIComponent(phone || '')}?&body=${encodeURIComponent(body)}`;
function posText() {
  const me = state.me; if (!me) return 'Location unavailable (GPS off).';
  const [E, N] = llToNZTM(me.lng, me.lat);
  return `My location: ${me.lat.toFixed(5)}, ${me.lng.toFixed(5)} (NZTM ${Math.round(E)} E ${Math.round(N)} N) ±${Math.round(me.acc || 0)} m at ${fmtTime(Date.now())}. https://www.google.com/maps?q=${me.lat.toFixed(5)},${me.lng.toFixed(5)}`;
}
function buildGpx({ wpts = [], rtes = [], trks = [] }) {
  const x = s => esc(s || '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Hunt Access NZ" xmlns="http://www.topografix.com/GPX/1/1">\n`
    + wpts.map(w => `<wpt lat="${(+w.lat).toFixed(6)}" lon="${(+w.lng).toFixed(6)}">${w.t ? `<time>${new Date(w.t).toISOString()}</time>` : ''}<name>${x(w.name)}</name><desc>${x(w.note || w.desc)}</desc>${w.type ? `<type>${x(w.type)}</type>` : ''}</wpt>`).join('\n')
    + rtes.map(r => `\n<rte><name>${x(r.name)}</name>${r.pts.map(p => `<rtept lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}"/>`).join('')}</rte>`).join('')
    + trks.map(t => `\n<trk><name>${x(t.name)}</name><trkseg>${t.pts.map(p => `<trkpt lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}">${p[2] != null ? `<ele>${p[2]}</ele>` : ''}${p[3] ? `<time>${new Date(p[3]).toISOString()}</time>` : ''}</trkpt>`).join('')}</trkseg></trk>`).join('')
    + `\n</gpx>`;
}
async function shareFile(name, text, type = 'application/gpx+xml') {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
async function dataFor(id, b, z = 15) {
  const L = LBY[id];
  if (online()) { try { return await agsQuery(L.url, bboxParams(b, L, z, (b[1] + b[3]) / 2), { pages: L.pages || 6, rec: L.max || 1000, timeout: 25000 }); } catch {} }
  const fc = offlineFC(id, b);
  if (!fc.features.length && state.loaded[id]) return state.loaded[id].fc;
  return fc;
}

/* ---------- 1. shooting arc ---------- */
const FIREARMS = { cf: ['Centrefire rifle', 4000], rim: ['.22 rimfire', 1500], slug: ['Shotgun slug', 1200], shot: ['Shotgun (shot)', 300] };
const arc = { p: null, brg: null, half: LS.get('arcHalf', 10), gun: LS.get('arcGun', 'cf'), out: '' };
function arcSheet(out) {
  if (out != null) arc.out = out;
  arc.p = arc.p || myP() || state.target || [map.getCenter().lng, map.getCenter().lat];
  const fromMe = sameP(arc.p, myP());
  showSheet(`<h2>Shooting arc check</h2>
    <p class="sub">Checks your line of fire, out to your firearm’s maximum travel, for mapped houses (street addresses), roads, DOC tracks, huts, campsites, legal roads and land you don’t have permission for.</p>
    <span class="field-l">Firearm (approximate maximum travel; varies with your load and angle)</span>
    <select id="arcGun">${Object.entries(FIREARMS).map(([k, v]) => `<option value="${k}" ${k === arc.gun ? 'selected' : ''}>${v[0]}: up to ${fmtDist(v[1])}</option>`).join('')}</select>
    <span class="field-l">Arc width: ±<b id="arcHalfV">${arc.half}</b>° either side of your aim</span>
    <input type="range" min="3" max="45" step="1" value="${arc.half}" data-act="arcHalf" aria-label="Arc width">
    <p class="sub">Firing from: <b>${fromMe ? 'your location' : arc.p[1].toFixed(5) + ', ' + arc.p[0].toFixed(5)}</b>${arc.brg != null ? ` · aiming ${Math.round(arc.brg)}° ${compass(arc.brg)}` : ''}</p>
    <div class="btnrow"><button class="btn" data-act="arcAim">Tap where you’re aiming</button><button class="btn ghost" data-act="arcHeading">Use phone direction</button></div>
    <div class="btnrow">${state.me ? '<button class="btn ghost small" data-act="arcFromMe">Fire from my location</button>' : ''}${state.target ? '<button class="btn ghost small" data-act="arcFromSel">From selected point</button>' : ''}<button class="btn ghost small" data-act="arcFromCentre">From map centre</button><button class="btn ghost small" data-act="arcClear">Clear arc</button></div>
    <div id="arcOut">${arc.out}</div>`, { kind: 'arc' });
}
sheetBody.addEventListener('change', e => { if (e.target.id === 'arcGun') { arc.gun = e.target.value; LS.set('arcGun', arc.gun); if (arc.brg != null) runArc(); } });
sheetBody.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.act === 'arcHalf') { arc.half = +e.target.value; LS.set('arcHalf', arc.half); const v = $('#arcHalfV'); if (v) v.textContent = arc.half; if (arc.brg != null) setData('arc', conePoly(arc.p, arc.brg, arc.half, FIREARMS[arc.gun][1])); } });
sheetBody.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.act === 'arcHalf' && arc.brg != null) runArc(); });
actions.arcAim = () => { state.mode = 'arc'; closeSheet(); toast('Tap the map where you’re aiming', 4000); };
actions.arcHeading = async () => {
  if (state.compass == null) await compassOn();
  const h = state.compass != null ? state.compass : (state.me && state.me.heading != null && !isNaN(state.me.heading) ? state.me.heading : null);
  if (h == null) { toast('No compass reading. Hold the phone flat and point it, or tap where you’re aiming instead.', 5000); return; }
  arc.brg = h; runArc();
};
actions.arcFromMe = () => { arc.p = myP(); arc.brg != null ? runArc() : arcSheet(''); };
actions.arcFromSel = () => { arc.p = state.target; arc.brg != null ? runArc() : arcSheet(''); };
actions.arcFromCentre = () => { const c = map.getCenter(); arc.p = [c.lng, c.lat]; arc.brg != null ? runArc() : arcSheet(''); };
actions.arcClear = () => { arc.brg = null; arc.out = ''; arc.p = null; setData('arc', EMPTY); arcSheet(''); };
async function runArc() {
  const [label, r] = FIREARMS[arc.gun];
  const cone = conePoly(arc.p, arc.brg, arc.half, r);
  setData('arc', cone);
  const b = fbbox(cone);
  arcSheet(`<p class="sub">Checking ${label.toLowerCase()} arc, ${fmtDist(r)} towards ${Math.round(arc.brg)}° ${compass(arc.brg)}…</p>`);
  const ids = ['addr', 'rdl', 'tracks', 'huts', 'camps', 'parcels', 'pcl', 'hunt', 'road', 'ease', 'res', 'parks', 'other'];
  const fcs = {};
  await Promise.all(ids.map(async id => { try { fcs[id] = await dataFor(id, b); } catch { fcs[id] = EMPTY; } }));
  const inC = q => { const d = distM(arc.p, q); return d <= r && angDiff(bearing(arc.p, q), arc.brg) <= arc.half ? d : null; };
  const hz = [];
  const pts = (id, lab, nameOf) => {
    let best = null, n = 0;
    for (const f of fcs[id].features) { if (!f.geometry || f.geometry.type !== 'Point') continue; const d = inC(f.geometry.coordinates); if (d != null) { n++; if (!best || d < best.d) best = { d, name: nameOf(f.properties || {}) }; } }
    if (best) hz.push({ label: lab, d: best.d, n, name: best.name });
  };
  pts('addr', 'House / street address', p => p.full_address);
  pts('huts', 'DOC hut', pickName); pts('camps', 'Campsite', pickName);
  const lines = (id, lab, nameOf) => {
    let best = null;
    for (const f of fcs[id].features) {
      const g = f.geometry; if (!g) continue;
      const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const line of parts) for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], c = line[i], n = Math.max(1, Math.ceil(distM(a, c) / 15));
        for (let k = 0; k <= n; k++) { const q = [a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n]; const d = inC(q); if (d != null && (!best || d < best.d)) best = { d, name: nameOf(f.properties || {}) }; }
      }
    }
    if (best) hz.push({ label: lab, d: best.d, name: best.name });
  };
  lines('rdl', 'Road', p => p.full_road_name); lines('tracks', 'DOC track', pickName);
  const priv = privFeatures(fcs.parcels, ['pcl', 'hunt', 'road', 'ease', 'res', 'parks', 'other'].flatMap(id => fcs[id].features));
  const step = r > 2000 ? 25 : 12, grid = [];
  for (let a = -arc.half; a <= arc.half + 0.01; a += Math.max(1, arc.half / 10)) for (let d = step; d <= r; d += step) grid.push({ q: dest(arc.p, arc.brg + a, d), d });
  const firstIn = (feats, lab) => {
    const cand = feats.filter(f => f.geometry && bboxIntersects(fbbox(f), b)); if (!cand.length) return;
    let best = null;
    for (const s of grid) {
      if (best != null && s.d >= best) continue;
      for (const f of cand) { const bb = fbbox(f); if (s.q[0] < bb[0] || s.q[0] > bb[2] || s.q[1] < bb[1] || s.q[1] > bb[3]) continue; if (featContains(f, s.q)) { best = s.d; break; } }
    }
    if (best != null) hz.push({ label: lab, d: best });
  };
  firstIn(fcs.road.features, 'Legal road corridor');
  firstIn(priv.filter(f => f.properties.cls === 'private'), 'Private land');
  firstIn(priv.filter(f => f.properties.cls === 'maori'), 'Māori land');
  firstIn(fcs.hunt.features.filter(f => f.properties && f.properties.HuntStatus === 'Prohibited'), 'DOC no-hunting area');
  const blk = fcs.hunt.features.find(f => f.properties && f.properties.HuntStatus === 'Permitted' && featContains(f, arc.p));
  if (blk) { let out = null; for (const s of grid) { if (out != null && s.d >= out) continue; if (!featContains(blk, s.q)) out = s.d; } if (out != null) hz.push({ label: 'Leaves the DOC hunting block', d: out }); }
  hz.sort((a, c) => a.d - c.d);
  const noParcels = !fcs.parcels.features.length;
  let html = !hz.length
    ? `<div class="verdict v-ok"><div><b>Nothing mapped in this arc</b><span>No mapped houses, roads, tracks, huts or off-limits land within ${fmtDist(r)}.</span></div></div>`
    : `<div class="verdict v-no"><div><b>${hz.length} hazard${hz.length > 1 ? 's' : ''} in your line of fire</b><span>Nearest: ${esc(hz[0].label)} at ${fmtDist(hz[0].d)}</span></div></div><ul class="list">${hz.map(h => `<li><span class="t">${esc(h.label)}</span>: ${fmtDist(h.d)}${h.n > 1 ? ` (${h.n} in arc)` : ''}${h.name ? `<br><span class="sub">${esc(h.name)}</span>` : ''}</li>`).join('')}</ul>`;
  if (noParcels) html += `<p class="sub"><b>Property data wasn’t available</b>, so private land wasn’t checked. Go online or save this area for offline use.</p>`;
  html += `<p class="sub">Mapped data only. It can’t see people, stock, vehicles, unmapped buildings or farm tracks, and it ignores terrain and backstop. Identify your target and what’s beyond it.</p>`;
  arcSheet(html);
}

/* ---------- 2. track recording & navigation ---------- */
state.rec = null; state.nav = LS.get('nav', null); state.compass = null; state.tracks = []; state.routes = []; state.log = []; state.mode = null;
let wakeLock = null;
async function keepAwake(on) {
  try { if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.rec && LS.get('wake', true)) keepAwake(true); });
let compassBound = false;
async function compassOn() {
  try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Compass permission denied'); return; } } } catch {}
  if (compassBound) return; compassBound = true;
  const h = e => {
    let hd = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? (360 - e.alpha) % 360 : null);
    if (hd != null) { const so = (screen.orientation && screen.orientation.angle) || 0; state.compass = (hd + so) % 360; updateNav(); }
  };
  window.addEventListener('deviceorientationabsolute', h); window.addEventListener('deviceorientation', h);
  toast('Compass on. Hold the phone flat.');
}
actions.compassOn = () => compassOn().then(() => sheetKind === 'track' && trackSheet());
function heading() { if (state.compass != null) return state.compass; const m = state.me; return m && m.heading != null && !isNaN(m.heading) && m.speed > 0.5 ? m.heading : null; }
function updateNav() {
  const bar = $('#navBar'), nav = state.nav, me = myP();
  if (!nav || !me) { bar.hidden = true; return; }
  const d = distM(me, nav.p), b = bearing(me, nav.p), h = heading();
  bar.hidden = false;
  $('#navArrow').style.transform = `rotate(${h != null ? b - h : b}deg)`;
  $('#navText').textContent = `${nav.name}: ${fmtDist(d)} ${compass(b)}${h == null ? ' (north up)' : ''}`;
}
$('#navBar').onclick = () => trackSheet();
function recordPos(c, t) {
  const r = state.rec; if (!r || c.accuracy > 50) return;
  const p = [c.longitude, c.latitude, c.altitude != null ? Math.round(c.altitude) : null, t];
  const last = r.pts[r.pts.length - 1];
  if (last && distM(last, p) < 8) return;
  r.pts.push(p); setData('trk', lineFC(r.pts));
  if (r.pts.length % 10 === 0) DB.put('tracks', r).catch(() => {});
}
function trackSheet() {
  const me = myP(), nav = state.nav, r = state.rec;
  const vehicles = state.wps.filter(w => w.type === 'vehicle').sort((a, b) => b.t - a.t);
  const tracks = [...state.tracks].filter(t => !r || t.id !== r.id).sort((a, b) => b.start - a.start);
  showSheet(`<h2>Track &amp; back to the truck</h2>
    <h3>Record your route</h3>
    ${r ? `<p>Recording <b>${esc(r.name)}</b>: ${fmtDist(trackLen(r.pts))} · ${fmtDur(Date.now() - r.start)} · ${r.pts.length} points</p><div class="btnrow"><button class="btn" data-act="recStop">Stop &amp; save</button></div>`
        : `<div class="btnrow"><button class="btn" data-act="recStart">Start recording</button></div>`}
    <label class="toggle"><input type="checkbox" data-act="wake" ${LS.get('wake', true) ? 'checked' : ''}><span>Keep screen on while recording<br><span class="sub">Phones pause web-app GPS when the screen locks</span></span></label>
    <h3>Navigate back</h3>
    ${nav ? `<p>Navigating to <b>${esc(nav.name)}</b>${me ? `: ${fmtDist(distM(me, nav.p))} ${compass(bearing(me, nav.p))}` : ''}</p>` : '<p class="sub">Not navigating.</p>'}
    <div class="btnrow">${me ? '<button class="btn" data-act="navMarkTruck">Mark truck here</button>' : ''}${vehicles.length ? `<button class="btn ghost" data-act="navTo" data-id="${vehicles[0].id}">To ${esc(vehicles[0].name)}</button>` : ''}${state.target ? '<button class="btn ghost" data-act="navTarget">To selected point</button>' : ''}${nav ? '<button class="btn ghost" data-act="navStop">Stop</button>' : ''}</div>
    <div class="btnrow"><button class="btn ghost small" data-act="compassOn">${state.compass != null ? 'Compass is on' : 'Turn on compass'}</button></div>
    <p class="sub">The arrow at the top points the way: relative to your phone with the compass on, or north-up without it. Any waypoint can be a target (Waypoints → Navigate).</p>
    <h3>Saved tracks</h3>
    <ul class="list">${tracks.map(t => `<li><span class="t">${esc(t.name)}</span><br><span class="sub">${fmtDate(t.start)} · ${fmtDist(trackLen(t.pts))} · ${fmtDur((t.end || t.start) - t.start)}</span><div class="btnrow"><button class="btn small ghost" data-act="trkShow" data-id="${t.id}">Show</button><button class="btn small ghost" data-act="trkGpx" data-id="${t.id}">GPX</button><button class="btn small ghost" data-act="trkDel" data-id="${t.id}">Delete</button></div></li>`).join('') || '<li class="sub">No saved tracks.</li>'}</ul>`, { tall: true, kind: 'track' });
}
sheetBody.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.act === 'wake') { LS.set('wake', e.target.checked); if (state.rec) keepAwake(e.target.checked); } });
actions.recStart = async () => {
  if (state.watchId == null) startGPS();
  state.rec = { id: uid(), name: 'Track ' + new Date().toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }), start: Date.now(), pts: [] };
  if (state.me) recordPos({ longitude: state.me.lng, latitude: state.me.lat, accuracy: state.me.acc, altitude: null }, Date.now());
  if (LS.get('wake', true)) keepAwake(true);
  toast('Recording started'); trackSheet();
};
actions.recStop = async () => {
  const r = state.rec; if (!r) return; r.end = Date.now(); state.rec = null; keepAwake(false);
  if (r.pts.length > 1) { await DB.put('tracks', r).catch(() => {}); state.tracks = state.tracks.filter(t => t.id !== r.id).concat(r); toast('Track saved: ' + fmtDist(trackLen(r.pts))); }
  else { DB.del('tracks', r.id).catch(() => {}); toast('Track too short to save'); }
  trackSheet();
};
function setNav(name, p) { state.nav = { name, p }; LS.set('nav', state.nav); updateNav(); if (state.watchId == null) startGPS(); }
actions.navMarkTruck = async () => {
  const me = myP(); if (!me) return;
  const w = { id: uid(), lng: me[0], lat: me[1], name: 'Truck', type: 'vehicle', note: '', t: Date.now() };
  state.wps.push(w); await DB.put('wps', w).catch(() => {}); renderWps(); setNav('Truck', me); toast('Truck marked'); trackSheet();
};
actions.navTo = b => { const w = state.wps.find(x => x.id === b.dataset.id); if (w) { setNav(w.name, [w.lng, w.lat]); toast('Navigating to ' + w.name); if (sheetKind === 'track') trackSheet(); } };
actions.navTarget = () => { if (state.target) { setNav('Selected point', state.target); trackSheet(); } };
actions.navStop = () => { state.nav = null; LS.set('nav', null); updateNav(); trackSheet(); };
actions.trkShow = b => { const t = state.tracks.find(x => x.id === b.dataset.id); if (!t) return; setData('trk', lineFC(t.pts)); const bb = fbbox(lineFC(t.pts)); map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 50, maxZoom: 16 }); closeSheet(); };
actions.trkGpx = b => { const t = state.tracks.find(x => x.id === b.dataset.id); if (t) shareFile(t.name.replace(/[^\w-]+/g, '_') + '.gpx', buildGpx({ trks: [{ name: t.name, pts: t.pts }] })); };
actions.trkDel = async b => { if (!(await confirmDlg('Delete this track?', 'Delete'))) return; state.tracks = state.tracks.filter(x => x.id !== b.dataset.id); await DB.del('tracks', b.dataset.id).catch(() => {}); setData('trk', EMPTY); trackSheet(); };

/* ---------- 3. boundary distance ---------- */
function boundaryNote(p, cat) {
  const near = [];
  if (cat !== 'private') {
    let best = null;
    for (const f of lastPriv) {
      if (f.properties.cls !== 'private' && f.properties.cls !== 'maori') continue;
      const bb = fbbox(f); if (p[0] < bb[0] - 0.008 || p[0] > bb[2] + 0.008 || p[1] < bb[1] - 0.006 || p[1] > bb[3] + 0.006) continue;
      const e = nearestEdge(p, f); if (e && (!best || e.d < best.d)) best = e;
    }
    if (best && best.d < 600) near.push({ d: best.d, t: `private ${fmtDist(best.d)} ${compass(bearing(p, best.q))}` });
  }
  if (cat === 'ok' && state.loaded.hunt) {
    const blk = state.loaded.hunt.fc.features.find(f => featContains(f, p));
    if (blk) { const e = nearestEdge(p, blk); if (e && e.d < 600) near.push({ d: e.d, t: `block edge ${fmtDist(e.d)} ${compass(bearing(p, e.q))}` }); }
  }
  near.sort((a, b) => a.d - b.d);
  return near.length ? ' · ' + near[0].t : '';
}

/* ---------- 4. check-in timer ---------- */
function renderCheckin() {
  const c = LS.get('checkin', null), el = $('#checkin');
  if (!c || !c.back) { el.hidden = true; return; }
  const back = new Date(c.back).getTime(), mins = Math.round((back - Date.now()) / 60000);
  let cls = '', txt;
  if (mins > 30) txt = `Due back ${fmtTime(back)}`;
  else if (mins >= 0) { cls = 'due'; txt = `Due back in ${mins} min`; }
  else { cls = 'late'; txt = `Overdue ${fmtDur(-mins * 60000)}. Text your contact`; }
  el.className = cls; el.hidden = false; $('#checkinText').textContent = txt;
  if (cls && el.dataset.last !== cls && navigator.vibrate) navigator.vibrate([300, 150, 300]);
  el.dataset.last = cls;
}
setInterval(renderCheckin, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderCheckin(); });
$('#checkin').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; const c = LS.get('checkin', null) || {};
  if (b.dataset.c === 'safe') { location.href = smsHref(c.phone, `Out safely${c.where ? ' from ' + c.where : ''} at ${fmtTime(Date.now())}.`); LS.set('checkin', null); renderCheckin(); }
  if (b.dataset.c === 'pos') location.href = smsHref(c.phone, posText());
  if (b.dataset.c === 'more') { c.back = new Date(new Date(c.back).getTime() + 36e5).toISOString(); LS.set('checkin', c); renderCheckin(); toast('Back-by time moved 1 hour later. Tell your contact too.'); }
  if (b.dataset.c === 'stop' && (await confirmDlg('Stop the check-in timer?', 'Stop'))) { LS.set('checkin', null); renderCheckin(); }
});
actions.checkinStart = () => {
  const { t } = tripText();
  if (!t.back) { toast('Set a “Back by” time first'); return; }
  LS.set('checkin', { back: new Date(t.back).toISOString(), phone: t.phone, where: t.where }); renderCheckin();
  toast('Check-in timer started. It only works while the app is open.', 5000);
};
actions.tripPos = () => { const { t } = tripText(); location.href = smsHref(t.phone, posText()); };

/* ---------- 5. terrain (hillshade, slope, sunny faces) ---------- */
const tile2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return Math.atan(Math.sinh(n)) / rad; };
const demURL = (z, x, y) => `${BM}/v1/tiles/elevation/WebMercatorQuad/${z}/${x}/${y}.png?api=${state.key}&pipeline=terrain-rgb`;
const hillURL = () => `${BM}/v1/tiles/hillshade/WebMercatorQuad/{z}/{x}/{y}.webp?api=${state.key}`;
const mkCanvas = (w, h) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
const demCache = new Map();
function demTile(z, x, y) {
  const k = z + '/' + x + '/' + y; if (demCache.has(k)) return demCache.get(k);
  const pr = (async () => {
    const r = await fetch(demURL(z, x, y)); if (!r.ok) throw new Error('DEM ' + r.status);
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const n = bmp.width, c = mkCanvas(n, n), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, n, n).data, h = new Float32Array(n * n);
    for (let i = 0; i < h.length; i++) h[i] = -10000 + (d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2]) * 0.1;
    return { n, h };
  })();
  demCache.set(k, pr); pr.catch(() => demCache.delete(k));
  if (demCache.size > 160) demCache.delete(demCache.keys().next().value);
  return pr;
}
async function elevAt(p, z = 13) {
  const fx = (p[0] + 180) / 360 * 2 ** z, r2 = p[1] * rad, fy = (1 - Math.log(Math.tan(r2) + 1 / Math.cos(r2)) / Math.PI) / 2 * 2 ** z;
  const x = Math.floor(fx), y = Math.floor(fy);
  try { const t = await demTile(z, x, y); const i = Math.min(t.n - 1, Math.floor((fx - x) * t.n)), j = Math.min(t.n - 1, Math.floor((fy - y) * t.n)); const v = t.h[j * t.n + i]; return v < -500 ? null : v; } catch { return null; }
}
maplibregl.addProtocol('terrain', async params => {
  const m = params.url.match(/terrain:\/\/(\d+)\/(\d+)\/(\d+)\?m=(\w+)/); const z = +m[1], x = +m[2], y = +m[3], mode = m[4];
  const t = await demTile(z, x, y), n = t.n, h = t.h;
  const px = 40075016.7 * Math.cos(tile2lat(y + 0.5, z) * rad) / 2 ** z / n;
  const c = mkCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), o = img.data;
  const H = (i, j) => h[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * px), dy = (H(i, j + 1) - H(i, j - 1)) / (2 * px);
    const s = Math.atan(Math.hypot(dx, dy)) / rad, k = (j * n + i) * 4; let col = null;
    if (mode === 'slope') col = s >= 45 ? [124, 58, 237, 190] : s >= 35 ? [220, 38, 38, 165] : s >= 30 ? [249, 115, 22, 145] : s >= 25 ? [250, 204, 21, 115] : null;
    else if (s >= 5) { const asp = (Math.atan2(-dx, dy) / rad + 360) % 360, nd = angDiff(asp, 0); if (nd <= 45) col = [250, 190, 20, Math.min(170, 50 + s * 4)]; else if (nd >= 135) col = [59, 130, 246, 60]; }
    if (col) { o[k] = col[0]; o[k + 1] = col[1]; o[k + 2] = col[2]; o[k + 3] = col[3]; }
  }
  g.putImageData(img, 0, 0);
  const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise(res => c.toBlob(res, 'image/png'));
  return { data: await blob.arrayBuffer() };
});

/* ---------- 6. route planner ---------- */
const route = { pts: [], prof: null };
function drawRoute() {
  const f = [lineFC(route.pts)].filter(x => x !== EMPTY).concat(route.pts.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })));
  setData('rte', { type: 'FeatureCollection', features: f });
}
function routeStats() { return { d: trackLen(route.pts) }; }
function routeSheet(extra = '') {
  if (state.mode === 'route') {
    const s = routeStats();
    showSheet(`<h2>Drawing a route</h2><p>Tap the map to add points. <b>${route.pts.length}</b> points · <b>${fmtDist(s.d)}</b></p>
      <div class="btnrow"><button class="btn" data-act="rteFinish" ${route.pts.length < 2 ? 'disabled' : ''}>Finish</button><button class="btn ghost" data-act="rteUndo" ${route.pts.length ? '' : 'disabled'}>Undo</button><button class="btn ghost" data-act="rteCancel">Cancel</button></div>`, { kind: 'route', mini: true });
    return;
  }
  const list = [...state.routes].sort((a, b) => b.t - a.t);
  showSheet(`<h2>Route planner</h2><p class="sub">Draw a planned walk to get its distance, climb and an elevation profile from LINZ terrain data.</p>
    <div class="btnrow"><button class="btn" data-act="rteStart">Draw a new route</button></div>${extra}
    <h3>Saved routes</h3><ul class="list">${list.map(r => `<li><span class="t">${esc(r.name)}</span><br><span class="sub">${fmtDist(r.dist)}${r.climb != null ? ` · ↑${Math.round(r.climb)} m ↓${Math.round(r.desc)} m` : ''} · ${fmtDate(r.t)}</span><div class="btnrow"><button class="btn small ghost" data-act="rteShow" data-id="${r.id}">Show</button><a class="btn small ghost" href="https://www.google.com/maps/dir/?api=1&destination=${r.pts[0][1]},${r.pts[0][0]}" target="_blank" rel="noopener">Drive to start</a><button class="btn small ghost" data-act="rteGpx" data-id="${r.id}">GPX</button><button class="btn small ghost" data-act="rteDel" data-id="${r.id}">Delete</button></div></li>`).join('') || '<li class="sub">No saved routes.</li>'}</ul>`, { tall: true, kind: 'route' });
}
actions.rteStart = () => { route.pts = []; route.prof = null; state.mode = 'route'; drawRoute(); routeSheet(); toast('Tap the map to add points'); };
actions.rteUndo = () => { route.pts.pop(); drawRoute(); routeSheet(); };
actions.rteCancel = () => { state.mode = null; route.pts = []; drawRoute(); routeSheet(); };
function routeAdd(p) { route.pts.push(p); drawRoute(); routeSheet(); }
async function profileOf(pts) {
  const total = trackLen(pts), step = Math.max(15, total / 250), samples = [];
  let acc = 0; samples.push({ d: 0, p: pts[0] });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = distM(a, b);
    for (let s = step - (acc % step); s < L; s += step) samples.push({ d: acc + s, p: [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L] });
    acc += L;
  }
  samples.push({ d: total, p: pts[pts.length - 1] });
  const zs = await Promise.all(samples.map(s => elevAt(s.p)));
  const ok = samples.map((s, i) => ({ d: s.d, z: zs[i] })).filter(s => s.z != null);
  if (ok.length < 2) return null;
  const sm = ok.map((s, i) => { const w = ok.slice(Math.max(0, i - 1), i + 2); return { d: s.d, z: w.reduce((a, b) => a + b.z, 0) / w.length }; });
  let up = 0, down = 0; for (let i = 1; i < sm.length; i++) { const dz = sm[i].z - sm[i - 1].z; if (dz > 0) up += dz; else down -= dz; }
  return { pts: sm, up, down, min: Math.min(...sm.map(s => s.z)), max: Math.max(...sm.map(s => s.z)), total };
}
function profileSvg(pr) {
  const W = 300, Hh = 90, dz = Math.max(10, pr.max - pr.min);
  const pts = pr.pts.map(s => `${(s.d / pr.total * W).toFixed(1)},${(Hh - (s.z - pr.min) / dz * (Hh - 8) - 4).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" style="width:100%;height:110px;display:block;background:var(--field);border-radius:10px" role="img" aria-label="Elevation profile"><polygon points="0,${Hh} ${pts} ${W},${Hh}" fill="#ff6a13" fill-opacity="0.25"/><polyline points="${pts}" fill="none" stroke="#ff6a13" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="legend" style="justify-content:space-between"><span>0</span><span>${Math.round(pr.min)}–${Math.round(pr.max)} m</span><span>${fmtDist(pr.total)}</span></div>`;
}
const walkTime = (d, up) => fmtDur((d / 1000 / 3.5 + up / 500) * 36e5);
actions.rteFinish = async () => {
  state.mode = null; const pts = route.pts.slice(); const d = trackLen(pts);
  showSheet(`<h2>Route: ${fmtDist(d)}</h2><p class="sub">Working out the elevation profile…</p>`, { kind: 'route' });
  const pr = await profileOf(pts); route.prof = pr;
  showSheet(`<h2>Route: ${fmtDist(d)}</h2>
    ${pr ? `<dl class="kv"><dt>Climb</dt><dd>↑ ${Math.round(pr.up)} m · ↓ ${Math.round(pr.down)} m</dd><dt>Height</dt><dd>${Math.round(pr.min)}–${Math.round(pr.max)} m</dd><dt>Walking time</dt><dd>about ${walkTime(d, pr.up)} on a track. Allow much longer off-track in bush.</dd></dl>${profileSvg(pr)}` : '<p class="sub">Elevation unavailable here (no connection, or terrain not saved offline).</p>'}
    <span class="field-l">Name</span><input type="text" id="rteName" placeholder="e.g. Ridge to the clearing">
    <div class="btnrow"><button class="btn" data-act="rteSave">Save route</button><button class="btn ghost" data-act="rteCancel">Discard</button></div>`, { kind: 'route' });
};
actions.rteSave = async () => {
  const pr = route.prof; const r = { id: uid(), name: ($('#rteName').value.trim() || 'Route ' + fmtDate(Date.now())), pts: route.pts.slice(), dist: trackLen(route.pts), climb: pr ? pr.up : null, desc: pr ? pr.down : null, t: Date.now() };
  state.routes.push(r); await DB.put('routes', r).catch(() => {}); route.pts = []; drawRoute(); renderRoutes(); toast('Route saved'); routeSheet();
};
function renderRoutes() { setData('routes', { type: 'FeatureCollection', features: state.routes.map(r => ({ ...lineFC(r.pts), properties: { name: r.name } })).filter(f => f.geometry) }); }
actions.rteShow = b => { const r = state.routes.find(x => x.id === b.dataset.id); if (!r) return; state.vis.routes = true; LS.set('vis', state.vis); applyVisibility(); const bb = fbbox(lineFC(r.pts)); map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 60, maxZoom: 16 }); closeSheet(); };
actions.rteGpx = b => { const r = state.routes.find(x => x.id === b.dataset.id); if (r) shareFile(r.name.replace(/[^\w-]+/g, '_') + '.gpx', buildGpx({ rtes: [r] })); };
actions.rteDel = async b => { if (!(await confirmDlg('Delete this route?', 'Delete'))) return; state.routes = state.routes.filter(x => x.id !== b.dataset.id); await DB.del('routes', b.dataset.id).catch(() => {}); renderRoutes(); routeSheet(); };
actions.mRoute = () => routeSheet();

/* ---------- 7. scent cone ---------- */
let lastWind = null;
function scentAt(i) {
  if (!lastWind) return;
  const H = lastWind.H, dir = H.wind_direction_10m[i], spd = H.wind_speed_10m[i];
  const down = (dir + 180) % 360, len = Math.min(1500, 300 + spd * 40), half = spd < 5 ? 35 : spd < 15 ? 22 : 15;
  setData('scent', conePoly(lastWind.p, down, half, len));
  toast(`Scent cone for ${new Date(H.time[i]).toLocaleTimeString('en-NZ', { hour: 'numeric', timeZone: TZ })}: wind from ${compass(dir)} at ${Math.round(spd)} km/h`, 4500);
}
actions.scent = b => { scentAt(+b.dataset.i); closeSheet(); };
actions.scentClear = () => { setData('scent', EMPTY); toast('Scent cone cleared'); };

/* ---------- 8. huts / campsites / tracks + feature popups ---------- */
function featureSheet(f) {
  const lid = f.layer.id, p = f.properties || {};
  if (lid === 'log-c') { logDetail(p.id); return; }
  const kind = lid.startsWith('huts') ? 'DOC hut' : lid.startsWith('camps') ? 'DOC campsite' : 'DOC track';
  const skip = /^(OBJECTID|GlobalID|Shape_|Shape__|FID|x|y|created|last_edited)/i;
  const rows = Object.entries(p).filter(([k, v]) => v != null && v !== '' && !skip.test(k) && typeof v !== 'object').slice(0, 14);
  const links = rows.filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v));
  const c = f.geometry.type === 'Point' ? f.geometry.coordinates : null;
  showSheet(`<h2>${esc(pickName(p))}</h2><p class="sub">${kind}</p>
    <dl class="kv">${rows.filter(([, v]) => !(typeof v === 'string' && /^https?:\/\//.test(v))).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(String(v).slice(0, 240))}</dd>`).join('')}</dl>
    <div class="btnrow">${links.slice(0, 2).map(([k, v], i) => `<a class="btn ${i ? 'ghost' : ''}" href="${esc(v)}" target="_blank" rel="noopener">${/book/i.test(k) ? 'Book' : 'DOC page'}</a>`).join('')}${c ? `<button class="btn ghost" data-act="saveWp" data-lng="${c[0]}" data-lat="${c[1]}">Save waypoint</button><a class="btn ghost" href="https://www.google.com/maps/dir/?api=1&destination=${c[1]},${c[0]}" target="_blank" rel="noopener">Drive</a>` : ''}</div>`, { kind: 'feat' });
}

/* ---------- 9. hunt log ---------- */
let pendingPhoto = null;
function renderLog() {
  setData('log', { type: 'FeatureCollection', features: state.log.map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { id: e.id, kind: e.kind } })) });
}
const spName = k => (SPECIES.find(s => s.key === k) || {}).label || (k === 'other' ? 'Other' : k);
function logSheet(year = LS.get('logYear', new Date().getFullYear())) {
  LS.set('logYear', year);
  const years = [...new Set(state.log.map(e => new Date(e.t).getFullYear()).concat(new Date().getFullYear()))].sort((a, b) => b - a);
  const ents = state.log.filter(e => new Date(e.t).getFullYear() === +year).sort((a, b) => b.t - a.t);
  const kills = {}, seen = {}; let kg = 0;
  ents.forEach(e => { const tgt = e.kind === 'kill' ? kills : seen; tgt[e.sp] = (tgt[e.sp] || 0) + (+e.count || 1); if (e.kind === 'kill') kg += +e.kg || 0; });
  const tbl = o => Object.entries(o).map(([k, v]) => `<span class="tag hit">${esc(spName(k))}: ${v}</span>`).join('') || '<span class="sub">None</span>';
  showSheet(`<h2>Hunt log</h2>
    <div class="btnrow"><button class="btn" data-act="logNew">Add kill or sighting</button>${years.map(y => `<button class="btn small ${+y === +year ? '' : 'ghost'}" data-act="logYear" data-y="${y}">${y}</button>`).join('')}</div>
    <h3>${year} kills${kg ? ` · ${Math.round(kg)} kg` : ''}</h3><div class="tags">${tbl(kills)}</div>
    <h3>${year} sightings</h3><div class="tags">${tbl(seen)}</div>
    <h3>Entries</h3><ul class="list">${ents.map(e => `<li><span class="t">${e.kind === 'kill' ? 'Kill' : 'Sighting'}: ${esc(spName(e.sp))}${e.count > 1 ? ' ×' + e.count : ''}</span>${e.photo ? '<span class="badge">photo</span>' : ''}<br><span class="sub">${fmtDate(e.t)} ${fmtTime(e.t)}${e.sex && e.sex !== 'unknown' ? ' · ' + e.sex : ''}${e.kg ? ' · ' + e.kg + ' kg' : ''}${e.note ? ' · ' + esc(e.note) : ''}</span><div class="btnrow"><button class="btn small ghost" data-act="logShow" data-id="${e.id}">View</button></div></li>`).join('') || '<li class="sub">No entries for this year.</li>'}</ul>
    <p class="sub">Shown on the map as red (kills) and amber (sightings) dots. Turn them off under Map &amp; layers.</p>`, { tall: true, kind: 'log' });
}
actions.logYear = b => logSheet(+b.dataset.y);
actions.mLog = () => logSheet();
actions.logNew = () => logForm();
function logForm() {
  pendingPhoto = null;
  const where = myP() ? 'me' : state.target ? 'sel' : 'centre';
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  showSheet(`<h2>New log entry</h2>
    <div class="seg" style="grid-template-columns:1fr 1fr"><button data-act="logKind" data-k="kill" class="on" id="lkKill">Kill</button><button data-act="logKind" data-k="sighting" id="lkSight">Sighting</button></div>
    <span class="field-l">Species</span><select id="lgSp">${SPECIES.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}<option value="other">Other</option></select>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><div><span class="field-l">Sex</span><select id="lgSex"><option value="unknown">?</option><option value="male">Male</option><option value="female">Female</option></select></div><div><span class="field-l">Number</span><input type="number" id="lgN" value="1" min="1"></div><div><span class="field-l">Weight kg</span><input type="number" id="lgKg" step="0.5" min="0"></div></div>
    <span class="field-l">When</span><input type="datetime-local" id="lgT" value="${now}">
    <span class="field-l">Where</span><select id="lgWhere">${myP() ? `<option value="me" ${where === 'me' ? 'selected' : ''}>My location</option>` : ''}${state.target ? `<option value="sel" ${where === 'sel' ? 'selected' : ''}>Selected map point</option>` : ''}<option value="centre">Map centre</option></select>
    <span class="field-l">Notes (points, age, conditions)</span><textarea id="lgNote"></textarea>
    <span class="field-l">Photo</span><input type="file" id="lgPhoto" accept="image/*">
    <div class="btnrow"><button class="btn" data-act="logSave">Save</button><button class="btn ghost" data-act="mLog">Cancel</button></div>`, { tall: true, kind: 'log' });
  logForm.kind = 'kill';
}
actions.logKind = b => { logForm.kind = b.dataset.k; $('#lkKill').classList.toggle('on', b.dataset.k === 'kill'); $('#lkSight').classList.toggle('on', b.dataset.k !== 'kill'); };
sheetBody.addEventListener('change', async e => {
  if (e.target.id !== 'lgPhoto' || !e.target.files[0]) return;
  try {
    const bmp = await createImageBitmap(e.target.files[0]); const sc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    pendingPhoto = c.toDataURL('image/jpeg', 0.75); toast('Photo attached');
  } catch { toast('Couldn’t read that photo'); }
});
actions.logSave = async () => {
  const w = $('#lgWhere').value, p = w === 'me' ? myP() : w === 'sel' ? state.target : [map.getCenter().lng, map.getCenter().lat];
  const e = { id: uid(), kind: logForm.kind || 'kill', sp: $('#lgSp').value, sex: $('#lgSex').value, count: +$('#lgN').value || 1, kg: +$('#lgKg').value || null, t: new Date($('#lgT').value).getTime() || Date.now(), note: $('#lgNote').value.trim(), lng: p[0], lat: p[1], photo: pendingPhoto };
  state.log.push(e); await DB.put('log', e).catch(() => {}); renderLog(); toast('Logged'); logSheet(new Date(e.t).getFullYear());
};
function logDetail(id) {
  const e = state.log.find(x => x.id === id); if (!e) return;
  showSheet(`<h2>${e.kind === 'kill' ? 'Kill' : 'Sighting'}: ${esc(spName(e.sp))}${e.count > 1 ? ' ×' + e.count : ''}</h2><p class="sub">${fmtDate(e.t)} ${fmtTime(e.t)} · ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}</p>
    ${e.photo ? `<img src="${e.photo}" alt="" style="width:100%;border-radius:12px;margin:6px 0">` : ''}
    <dl class="kv"><dt>Sex</dt><dd>${esc(e.sex)}</dd>${e.kg ? `<dt>Weight</dt><dd>${e.kg} kg</dd>` : ''}${e.note ? `<dt>Notes</dt><dd>${esc(e.note)}</dd>` : ''}</dl>
    <div class="btnrow"><button class="btn ghost" data-act="logGo" data-id="${e.id}">Show on map</button><button class="btn ghost" data-act="logDel" data-id="${e.id}">Delete</button><button class="btn ghost" data-act="mLog">All entries</button></div>`, { kind: 'log' });
}
actions.logShow = b => logDetail(b.dataset.id);
actions.logGo = b => { const e = state.log.find(x => x.id === b.dataset.id); if (e) { state.vis.log = true; LS.set('vis', state.vis); applyVisibility(); map.flyTo({ center: [e.lng, e.lat], zoom: 15 }); closeSheet(); } };
actions.logDel = async b => { if (!(await confirmDlg('Delete this log entry?', 'Delete'))) return; state.log = state.log.filter(x => x.id !== b.dataset.id); await DB.del('log', b.dataset.id).catch(() => {}); renderLog(); logSheet(); };

/* ---------- 10. share a trip ---------- */
const b64u = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pack(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'j' + b64u(raw);
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return 'z' + b64u(new Uint8Array(buf));
}
async function unpack(code) {
  const bytes = unb64u(code.slice(1));
  const raw = code[0] === 'z' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
const r5 = v => Math.round(v * 1e5) / 1e5;
function shareSheet() {
  const t = LS.get('trip', {});
  showSheet(`<h2>Share a trip</h2><p class="sub">Send your hunting partner the plan as a link (opens in this app) or a GPX file (for other GPS apps).</p>
    <label class="toggle"><input type="checkbox" id="shW" checked><span>Waypoints (${state.wps.length})</span></label>
    <label class="toggle"><input type="checkbox" id="shR" checked><span>Planned routes (${state.routes.length})</span></label>
    <label class="toggle"><input type="checkbox" id="shP"><span>Locations of properties I have permission for (${state.perms.filter(p => p.lng != null).length})<br><span class="sub">Property names only. Landowner names and phone numbers aren’t included</span></span></label>
    <label class="toggle"><input type="checkbox" id="shT" ${t.where ? 'checked' : ''}><span>Trip plan (where, dates, vehicle)</span></label>
    <div class="btnrow"><button class="btn" data-act="shareLink">Share link</button><button class="btn ghost" data-act="shareGpx">Share GPX</button></div>`, { tall: true, kind: 'share' });
}
function shareData() {
  const o = { v: 1 };
  if ($('#shW').checked) o.w = state.wps.map(w => [w.name, w.type, r5(w.lng), r5(w.lat), w.note || '']);
  if ($('#shR').checked) o.r = state.routes.map(r => [r.name, r.pts.map(p => [r5(p[0]), r5(p[1])])]);
  if ($('#shP').checked) o.p = state.perms.filter(p => p.lng != null).map(p => [p.property, r5(p.lng), r5(p.lat)]);
  if ($('#shT').checked) { const t = LS.get('trip', {}); o.t = { where: t.where, out: t.out, back: t.back, car: t.car }; }
  return o;
}
actions.shareLink = async () => {
  const code = await pack(shareData()); const url = location.origin + location.pathname + '#trip=' + code;
  if (navigator.share) { try { await navigator.share({ title: 'Hunt trip', text: 'Our hunt plan in Hunt Access NZ:', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Couldn’t share the link'); }
};
actions.shareGpx = () => {
  const o = shareData();
  shareFile('hunt-trip.gpx', buildGpx({
    wpts: (o.w || []).map(w => ({ name: w[0], type: w[1], lng: w[2], lat: w[3], note: w[4] })).concat((o.p || []).map(p => ({ name: 'Permission: ' + p[0], lng: p[1], lat: p[2] }))),
    rtes: (o.r || []).map(r => ({ name: r[0], pts: r[1] }))
  }));
};
actions.mShare = shareSheet;
let incoming = null;
async function checkIncoming() {
  const m = location.hash.match(/^#trip=([\w-]+)$/); if (!m) return;
  try { incoming = await unpack(m[1]); } catch { toast('That shared trip link is damaged'); return; }
  history.replaceState(null, '', location.pathname);
  const o = incoming;
  showSheet(`<h2>Trip shared with you</h2><ul class="sub">${o.w ? `<li>${o.w.length} waypoints</li>` : ''}${o.r ? `<li>${o.r.length} routes</li>` : ''}${o.p ? `<li>${o.p.length} permitted properties</li>` : ''}${o.t ? `<li>Plan: ${esc(o.t.where || '')}${o.t.out ? ', leaving ' + esc(new Date(o.t.out).toLocaleString('en-NZ')) : ''}${o.t.back ? ', back ' + esc(new Date(o.t.back).toLocaleString('en-NZ')) : ''}${o.t.car ? ', vehicle ' + esc(o.t.car) : ''}</li>` : ''}</ul>
    <div class="btnrow"><button class="btn" data-act="importTrip">Add to my map</button><button class="btn ghost" data-act="welcomeOk">Ignore</button></div>`, { kind: 'import' });
}
actions.importTrip = async () => {
  const o = incoming || {}; const bb = [180, 90, -180, -90]; const ext = (x, y) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); };
  for (const w of o.w || []) { const x = { id: uid(), name: w[0], type: WP_TYPES[w[1]] ? w[1] : 'note', lng: w[2], lat: w[3], note: (w[4] ? w[4] + ' · ' : '') + 'shared', t: Date.now() }; state.wps.push(x); ext(x.lng, x.lat); await DB.put('wps', x).catch(() => {}); }
  for (const p of o.p || []) { const x = { id: uid(), name: 'Permission: ' + p[0], type: 'access', lng: p[1], lat: p[2], note: 'shared', t: Date.now() }; state.wps.push(x); ext(x.lng, x.lat); await DB.put('wps', x).catch(() => {}); }
  for (const r of o.r || []) { const x = { id: uid(), name: r[0] + ' (shared)', pts: r[1], dist: trackLen(r[1]), climb: null, desc: null, t: Date.now() }; state.routes.push(x); r[1].forEach(q => ext(q[0], q[1])); await DB.put('routes', x).catch(() => {}); }
  if (o.t) LS.set('trip', Object.assign(LS.get('trip', {}), { where: o.t.where, out: o.t.out, back: o.t.back, car: o.t.car }));
  renderWps(); renderRoutes(); state.vis.routes = state.vis.wps = true; LS.set('vis', state.vis); applyVisibility();
  if (bb[0] < 180) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 60, maxZoom: 14 });
  incoming = null; closeSheet(); toast('Shared trip added');
};
actions.mArc = () => arcSheet();
actions.mTrack = trackSheet;

/* ---------------- start-up ---------------- */
(async () => {
  try {
    [state.areas, state.wps, state.perms, state.tracks, state.routes, state.log] = await Promise.all(['areas', 'wps', 'perms', 'tracks', 'routes', 'log'].map(st => DB.all(st)));
  } catch { /* storage unavailable: app still works online */ }
  renderWps(); renderRoutes(); renderLog(); addAccessPins(); scheduleRefresh(); renderCheckin(); updateNav();
  const unfinished = state.tracks.find(t => !t.end); if (unfinished) { unfinished.end = unfinished.pts.length ? unfinished.pts[unfinished.pts.length - 1][3] : unfinished.start; DB.put('tracks', unfinished).catch(() => {}); }
  checkIncoming();
  if (!LS.get('welcomed', false) && !/^#trip=/.test(location.hash)) {
    showSheet(`<h2>Hunt Access NZ</h2><p>Tap anywhere on the map to see who owns or manages the land and whether you can hunt there.</p>
      <ul class="sub"><li><b>Dark green</b>: DOC land</li><li><b>Lime</b>: huntable with just a DOC permit (amber: restricted or ballot; red stripes: no hunting)</li><li><b>Orange</b>: legal and paper roads. <b>Blue</b>: other public access to travel through</li><li><b>Rose</b>: everything else, which needs landowner permission (zoom 13+)</li></ul>
      <p class="sub">Before a trip, use <b>Offline maps</b> to save the area so status checks work with no signal. Turn on the location button for live status and boundary alerts.</p>
      <p class="sub">A planning aid only. Boundaries are indicative. You’re responsible for permission and permits.</p>
      <div class="btnrow"><button class="btn" data-act="welcomeOk">Got it</button></div>`, { kind: 'welcome' });
  }
})();
actions.welcomeOk = () => { LS.set('welcomed', true); closeSheet(); };
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

window.__ham = { state, llToNZTM, nztmToLL, sunTimes, classify, makeKey, keyAgeDays, countTiles, normKey };
})();
