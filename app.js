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
  vis: Object.assign({ pcl: true, hunt: true, paa: true, priv: true, parcels: true, pest: true, access: true, wps: true }, LS.get('vis', {})),
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
      const r = indexedDB.open('huntmap', 1);
      r.onupgradeneeded = () => { const d = r.result; ['areas', 'wps', 'perms'].forEach(s => d.objectStoreNames.contains(s) || d.createObjectStore(s, { keyPath: 'id' })); };
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
  ['sel', 'acc', 'tline', 'wps', 'priv'].forEach(src);
  if (!map.getSource('fade')) map.addSource('fade', { type: 'geojson', data: WORLD });
  if (!map.hasImage('noHunt')) map.addImage('noHunt', stripes('#dc2626'));
  const add = l => { if (!map.getLayer(l.id)) map.addLayer(l); };
  const addF = (id, source, colour, op, extra = {}) => { BASE_OP[id] = op; add({ id, type: 'fill', source, ...extra, paint: { 'fill-color': colour, 'fill-opacity': opOf(id) } }); };
  add({ id: 'fade-f', type: 'fill', source: 'fade', paint: { 'fill-color': '#ffffff', 'fill-opacity': state.fade } });
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
  add({ id: 'wps-c', type: 'circle', source: 'wps', paint: { 'circle-radius': 7, 'circle-color': ['get', 'colour'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  applyVisibility(); renderWps(); updateAcc(); updateTargetLine(); computePriv();
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
function computePriv() {
  if (!map.getSource('priv')) return;
  const pf = state.loaded.parcels && state.loaded.parcels.fc;
  if (!pf || !state.vis.priv) { map.getSource('priv').setData(EMPTY); return; }
  const pub = [];
  for (const id of PUBLIC_IDS) { const st = state.loaded[id]; if (st && st.fc) for (const f of st.fc.features) if (f.geometry && /Polygon/.test(f.geometry.type)) pub.push(f); }
  const out = [];
  for (const f of pf.features) {
    if (!f.geometry || !/Polygon/.test(f.geometry.type)) continue;
    const cls = parcelCls((f.properties && f.properties.parcel_intent) || ''); if (!cls) continue;
    const p = innerPoint(f); let isPub = false;
    for (const q of pub) { const b = fbbox(q); if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue; if (featContains(q, p)) { isPub = true; break; } }
    if (!isPub) out.push({ type: 'Feature', geometry: f.geometry, properties: { cls } });
  }
  map.getSource('priv').setData({ type: 'FeatureCollection', features: out });
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
function showSheet(html, { tall = false, kind = '' } = {}) {
  sheetBody.innerHTML = html; sheet.classList.toggle('tall', tall); sheet.hidden = false; sheet.scrollTop = 0; sheetKind = kind;
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
map.on('click', e => identify([e.lngLat.lng, e.lngLat.lat]));

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
  updateAcc(); updateTargetLine();
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
  $('#statusText').textContent = (v.cat === 'unknown' ? 'Status unknown' : v.title) + (me.acc > 50 ? ` (±${Math.round(me.acc)} m)` : '');
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
    <ul class="list">${items.map(w => `<li><span class="swatch" style="display:inline-block;vertical-align:-2px;background:${(WP_TYPES[w.type] || WP_TYPES.note)[1]}"></span> <span class="t">${esc(w.name)}</span><span class="badge">${(WP_TYPES[w.type] || WP_TYPES.note)[0]}</span><br><span class="sub">${fmtDate(w.t)}${me ? ' · ' + fmtDist(distM(me, [w.lng, w.lat])) + ' ' + compass(bearing(me, [w.lng, w.lat])) : ''}${w.note ? ' · ' + esc(w.note) : ''}</span><div class="btnrow"><button class="btn small ghost" data-act="wpGo" data-id="${w.id}">Show</button><a class="btn small ghost" href="https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}" target="_blank" rel="noopener">Drive</a><button class="btn small ghost" data-act="wpEdit" data-id="${w.id}">Edit</button><button class="btn small ghost" data-act="wpDel" data-id="${w.id}">Delete</button></div></li>`).join('') || '<li class="sub">No waypoints yet. Tap the map, then “Save waypoint”.</li>'}</ul>`, { tall: true, kind: 'wp' });
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
      cells.push(`<div><b>${new Date(H.time[i]).toLocaleTimeString('en-NZ', { weekday: cells.length && new Date(H.time[i]).getHours() < 3 ? 'short' : undefined, hour: 'numeric' })}</b>${arrow(H.wind_direction_10m[i])}${Math.round(H.wind_speed_10m[i])}<span class="sub">/${Math.round(H.wind_gusts_10m[i])}</span><br>${compass(H.wind_direction_10m[i])}<br><span class="sub">${Math.round(H.temperature_2m[i])}° ${H.precipitation_probability[i] ?? '–'}%</span></div>`);
    }
    showSheet(head + `<h3>Wind forecast (km/h, gusts)</h3><p class="sub">Arrows point where the wind is blowing <b>to</b>, so your scent goes that way. Stay downwind of where you expect animals.</p><div class="wind">${cells.join('')}</div><p class="sub">Forecast: Open-Meteo.</p>`, { kind: 'cond' });
  } catch { showSheet(head + `<p class="sub">Couldn’t load the wind forecast.</p>`, { kind: 'cond' }); }
}

/* ---------------- offline areas ---------------- */
const lon2x = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * rad; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
function tileRange(b, z) { return { x0: lon2x(b[0], z), x1: lon2x(b[2], z), y0: lat2y(b[3], z), y1: lat2y(b[1], z) }; }
function countTiles(b, z0, z1) { let n = 0; for (let z = z0; z <= z1; z++) { const r = tileRange(b, z); n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1); } return n; }
const LEVELS = { std: { label: 'Standard', topo50: 14, aerial: 15 }, det: { label: 'Detailed', topo50: 15, aerial: 16 }, max: { label: 'Maximum', topo50: 16, aerial: 17 } };
const KB = { topo: 18, topo50: 45, aerial: 35 };
function normKey(u) { try { const x = new URL(u); x.searchParams.delete('api'); x.searchParams.sort(); return x.toString(); } catch { return u; } }
let dl = null;
function offlineSheet() {
  const b = viewBBox(0); const lvl = LS.get('lvl', 'det'); const sel = LS.get('dlBases', { topo: true, topo50: true, aerial: false });
  const est = () => {
    const L = LEVELS[lvl]; let n = 0, kb = 0;
    if (sel.topo) { const c = countTiles(b, 5, 15); n += c; kb += c * KB.topo; }
    if (sel.topo50) { const c = countTiles(b, 5, L.topo50); n += c; kb += c * KB.topo50; }
    if (sel.aerial) { const c = countTiles(b, 5, L.aerial); n += c; kb += c * KB.aerial; }
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
    <button data-act="mAccess"><span>🗺</span><span>Hunting access beyond DOC<small>Stations, forestry, iwi and council land</small></span></button>
    <button data-act="wpList"><span>📍</span><span>Waypoints<small>Vehicle, camp, sightings. Export GPX</small></span></button>
    <button data-act="permList"><span>✍</span><span>Permissions log<small>Your landowner permissions and conditions</small></span></button>
    <button data-act="mTrip"><span>🧭</span><span>Trip intentions<small>Text your plan to a trusted contact</small></span></button>
    <button data-act="mCond"><span>🌬</span><span>Wind &amp; sun<small>Forecast wind, first and last light</small></span></button>
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
    <p class="sub">Version 1.1 · ${navigator.serviceWorker && navigator.serviceWorker.controller ? 'Offline ready' : 'Offline support starts after the next reload'}</p>`, { tall: true, kind: 'settings' });
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

/* ---------------- start-up ---------------- */
(async () => {
  try {
    [state.areas, state.wps, state.perms] = await Promise.all([DB.all('areas'), DB.all('wps'), DB.all('perms')]);
  } catch { /* storage unavailable: app still works online */ }
  renderWps(); addAccessPins(); scheduleRefresh();
  if (!LS.get('welcomed', false)) {
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
