/* Hunt Access NZ — "Plan a trip here": one tap builds a trip report for a spot.
   Pulls together land status and permits, legal ways in, terrain and walking effort, animals and hotspots,
   Find-animals heatmaps for dawn / midday / dusk (and night, for planning), forecast, sun and moon,
   hazards and rules, huts, campsites and water. Saves as PDF via the browser's print, or shares as text.
   Uses window.HuntMap (app.js) and HuntMap.model (model.js). */
(() => {
'use strict';
const A = window.HuntMap, B = window.BEHAVIOUR || {};
if (!A || !A.model) return;
const { state, actions, LS, showSheet, closeSheet, toast, sunTimes, distM, bearing, compass, fmtDist, fmtTime, esc, fetchT, online, SPECIES } = A;
const rad = Math.PI / 180;
const $ = s => document.querySelector(s);
const dayStr = d => d.toLocaleDateString('en-CA');
const fmtDay = d => d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
const spLabel = k => (B[k] && B[k].name) || (SPECIES.find(s => s.key === k) || {}).label || k;

/* ---------- small geometry helpers ---------- */
function nearestOnLines(p, fc) {
  let best = null;
  for (const f of (fc && fc.features) || []) {
    const g = f.geometry; if (!g) continue;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of parts) {
      let prev = A.xy(line[0], p);
      for (let i = 1; i < line.length; i++) {
        const cur = A.xy(line[i], p), [d, q] = A.segDist([0, 0], prev, cur);
        if (!best || d < best.d) best = { d, q, f }; prev = cur;
      }
    }
  }
  if (best) best.q = [p[0] + best.q[0] / (Math.cos(p[1] * rad) * 111320), p[1] + best.q[1] / 110540];
  return best;
}
function nearestOnPolys(p, feats) {
  let best = null;
  for (const f of feats) {
    if (!f.geometry || !/Polygon/.test(f.geometry.type)) continue;
    if (A.featContains(f, p)) return { d: 0, q: p, f };
    const e = A.nearestEdge(p, f); if (e && e.q && (!best || e.d < best.d)) best = { ...e, f };
  }
  return best;
}
function nearestPoints(p, fc, n = 3) {
  return ((fc && fc.features) || []).filter(f => f.geometry && f.geometry.type === 'Point')
    .map(f => ({ f, d: distM(p, f.geometry.coordinates) })).sort((a, b) => a.d - b.d).slice(0, n);
}
const PUBLIC = ['pcl', 'hunt', 'road', 'marg', 'ease', 'res', 'parks', 'other'];
function publicShare(a, b, fcs) {
  const n = Math.max(8, Math.min(60, Math.round(distM(a, b) / 50))); let pub = 0;
  for (let i = 0; i <= n; i++) {
    const q = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n];
    if (PUBLIC.some(id => ((fcs[id] && fcs[id].features) || []).some(f => A.featContains(f, q)))) pub++;
  }
  return pub / (n + 1);
}

/* ---------- weather, sun and moon ---------- */
async function forecast(p, d0, d1) {
  if (!online()) return { err: 'No signal: forecast unavailable.' };
  const ahead = (d1 - new Date()) / 864e5;
  if (ahead > 15.5) return { err: 'Forecasts only run about 16 days ahead. Check again closer to the trip.' };
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(4)}&longitude=${p[0].toFixed(4)}&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover&timezone=Pacific%2FAuckland&start_date=${dayStr(d0)}&end_date=${dayStr(d1)}&wind_speed_unit=kmh`;
    const j = await (await fetchT(u, 15000)).json(); if (!j.hourly) throw 0;
    A.setWind({ p, H: j.hourly });
    return { H: j.hourly };
  } catch { return { err: 'Couldn’t load the forecast.' }; }
}
const hourIdx = (H, t) => { let best = -1, bd = Infinity; H.time.forEach((x, i) => { const d = Math.abs(new Date(x) - t); if (d < bd) { bd = d; best = i; } }); return bd < 2 * 36e5 ? best : -1; };
function moon(d) {
  const age = ((d.getTime() / 864e5 + 2440587.5 - 2451550.1) / 29.530588853 % 1 + 1) % 1, illum = Math.round((1 - Math.cos(2 * Math.PI * age)) / 2 * 100);
  const name = age < 0.03 || age > 0.97 ? 'New moon' : age < 0.22 ? 'Waxing crescent' : age < 0.28 ? 'First quarter' : age < 0.47 ? 'Waxing gibbous' : age < 0.53 ? 'Full moon' : age < 0.72 ? 'Waning gibbous' : age < 0.78 ? 'Last quarter' : 'Waning crescent';
  return { name, illum };
}

/* ---------- form ---------- */
function planSheet(p) {
  const o = LS.get('tripPlan', {}), t0 = new Date(Date.now() + 864e5);
  const sel = Object.keys(state.sp || {}).filter(k => state.sp[k] && B[k]);
  const sps = sel.length ? sel : (LS.get('find', {}).sps || ['red']).filter(k => B[k]);
  showSheet(`<h2>Plan a trip here</h2><p class="sub">${p[1].toFixed(5)}, ${p[0].toFixed(5)}. Builds a report for the area around this spot: land and permits, ways in, effort, animals and likely spots by time of day, weather, hazards and logistics.</p>
    <label class="field-l">Dates</label><div class="pair"><input type="date" id="tpFrom" value="${dayStr(t0)}"><input type="date" id="tpTo" value="${dayStr(t0)}"></div>
    <span class="field-l">Species (tick one or more)</span><div class="spgrid" id="tpSps">${Object.entries(B).map(([k, s]) => `<label class="toggle"><input type="checkbox" value="${k}" ${sps.includes(k) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}</div>
    <label class="field-l">Area around the spot</label><select id="tpR">${[[2, '2 km'], [3, '3 km'], [5, '5 km']].map(([v, l]) => `<option value="${v}" ${+(o.r || 3) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="toggle"><input type="checkbox" id="tpMask" ${o.mask === false ? '' : 'checked'}>Only score DOC land open to hunting</label>
    <div class="btnrow"><button class="btn" data-act="tripBuild" data-lng="${p[0]}" data-lat="${p[1]}">Build report</button></div>
    <p class="sub">Takes 10–30 seconds. Offline it uses saved areas (Topo and Terrain ticked), without the forecast.</p>`, { tall: true, kind: 'trip' });
}
actions.tripPlan = b => planSheet([+b.dataset.lng, +b.dataset.lat]);

/* ---------- build ---------- */
let busy = false, last = null;
actions.tripBuild = async b => {
  if (busy) return;
  const p = [+b.dataset.lng, +b.dataset.lat];
  const sps = [...document.querySelectorAll('#tpSps input:checked')].map(i => i.value);
  if (!sps.length) { toast('Tick at least one species'); return; }
  let d0 = new Date($('#tpFrom').value + 'T12:00:00+12:00'), d1 = new Date(($('#tpTo').value || $('#tpFrom').value) + 'T12:00:00+12:00');
  if (!(d0 > 0)) d0 = new Date(); if (!(d1 >= d0)) d1 = d0;
  if ((d1 - d0) / 864e5 > 6) d1 = new Date(d0.getTime() + 6 * 864e5);
  const rKm = +$('#tpR').value || 3, mask = $('#tpMask').checked;
  LS.set('tripPlan', { r: rKm, mask });
  busy = true;
  const prog = msg => showSheet(`<h2>Building your trip report…</h2><p class="sub">${esc(msg)}</p>`, { kind: 'trip', mini: true });
  try { last = await build(p, { sps, d0, d1, rKm, mask }, prog); openReport(last); closeSheet(); }
  catch (e) { console.error('trip report', e); showSheet(`<h2>Couldn’t build the report</h2><p>${String(e && e.message) === 'terrain' ? 'Terrain data isn’t available here. Get a signal, or save the area under Offline maps with Topo and Terrain ticked.' : 'Something went wrong. Try a smaller area or try again.'}</p><div class="btnrow"><button class="btn" data-act="tripPlan" data-lng="${p[0]}" data-lat="${p[1]}">Back</button></div>`, { kind: 'trip' }); }
  finally { busy = false; }
};

async function build(p, o, prog) {
  const dLat = o.rKm * 1000 / 110540, dLng = o.rKm * 1000 / (111320 * Math.cos(p[1] * rad));
  const bb = [p[0] - dLng, p[1] - dLat, p[0] + dLng, p[1] + dLat];
  const wide = [bb[0] - dLng * 0.5, bb[1] - dLat * 0.5, bb[2] + dLng * 0.5, bb[3] + dLat * 0.5];
  prog('Checking the land and permits…');
  const [land, wx] = await Promise.all([A.landAt(p), forecast(p, o.d0, o.d1)]);
  const verdict = A.classify(land);
  prog('Finding roads, tracks, access routes, huts and hazards…');
  const ids = ['rdl', 'tracks', 'huts', 'camps', 'road', 'marg', 'ease', 'res', 'parks', 'other', 'hunt', 'pcl', 'addr', 'pestWill', 'pestHave'];
  const fcs = {};
  const limit = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r(null), ms))]);
  const slow = [];
  await Promise.all(ids.map(async id => { let fc = null; try { fc = await limit(A.dataFor(id, ['rdl', 'tracks', 'road', 'ease', 'marg'].includes(id) ? wide : bb), 25000); } catch {} if (!fc) slow.push(id); fcs[id] = fc || { features: [] }; }));
  // legal ways in
  const paper = { features: fcs.road.features.filter(f => (f.properties || {}).paa_type === 'Unformed Legal Road Parcel') };
  const pae = { features: fcs.ease.features.filter(f => (f.properties || {}).paa_type === 'PAE Easement') };
  const access = [
    ['Formed road', nearestOnLines(p, fcs.rdl), f => (f.properties || {}).full_road_name],
    ['DOC track', nearestOnLines(p, fcs.tracks), f => A.pickName(f.properties)],
    ['Paper road', nearestOnPolys(p, paper.features), f => (f.properties || {}).appellation || ''],
    ['Marginal strip', nearestOnPolys(p, fcs.marg.features), f => (f.properties || {}).common_name || ''],
    ['Forestry access easement (PAE)', nearestOnPolys(p, pae.features), f => (f.properties || {}).common_name || '']
  ].filter(x => x[1]).map(([kind, n, nm]) => ({ kind, d: n.d, q: n.q, name: nm(n.f) || '', brg: bearing(p, n.q) })).sort((a, b) => a.d - b.d);
  const road = access.find(a => a.kind === 'Formed road');
  const start = road || access[0];
  let walk = null;
  if (start && start.d > 30) {
    prog('Working out the climb from the nearest road…');
    const pr = await limit(A.profileOf([start.q, p]).catch(() => null), 20000);
    walk = { from: start, pr, share: publicShare(start.q, p, fcs) };
  }
  // likely spots by time of day (first day)
  const st = sunTimes(o.d0, p[1], p[0]) || { rise: new Date(o.d0.getTime() - 5 * 36e5), set: new Date(o.d0.getTime() + 6 * 36e5) };
  const times = [['Dawn', new Date(st.rise.getTime() + 30 * 6e4)], ['Midday', new Date((st.rise.getTime() + st.set.getTime()) / 2)], ['Dusk', new Date(st.set.getTime() - 45 * 6e4)], ['Night', new Date(st.set.getTime() + 3 * 36e5)]];
  const runs = [];
  for (const [label, t] of times) {
    prog(`Scoring likely spots: ${label.toLowerCase()}…`);
    let wind = 'calm';
    if (wx.H) { const i = hourIdx(wx.H, t); if (i >= 0) wind = Math.round(wx.H.wind_direction_10m[i]) + '@' + Math.round(wx.H.wind_speed_10m[i]); }
    const res = await A.model.run({ sps: o.sps, at: t.getTime(), wind, mask: o.mask, bbox: bb }, () => {});
    const spots = A.model.findSpots(res, 3);
    runs.push({ label, t, res, spots, img: await A.model.thumb(res, { target: p, spots: 3 }) });
  }
  // nearby things
  const near = {
    huts: nearestPoints(p, fcs.huts), camps: nearestPoints(p, fcs.camps),
    houses: nearestPoints(p, fcs.addr, 1), tracks: nearestOnLines(p, fcs.tracks), road: nearestOnLines(p, fcs.rdl)
  };
  const r0 = runs[0].res, G = r0.G, ci = Math.floor((((p[0] + 180) / 360 * 256 * 8192) - G.x0) / G.s), cj = Math.floor(((1 - Math.log(Math.tan(p[1] * rad) + 1 / Math.cos(p[1] * rad)) / Math.PI) / 2 * 256 * 8192 - G.y0) / G.s);
  const k = Math.max(0, Math.min(G.W * G.H - 1, cj * G.W + ci));
  const site = { elev: r0.E[k], slope: r0.slope[k], aspect: r0.aspect[k], water: r0.D.water[k] };
  const pests = [...fcs.pestWill.features, ...fcs.pestHave.features].map(f => f.properties || {});
  const wps = (state.wps || []).filter(w => distM(p, [w.lng, w.lat]) < o.rKm * 1000 * 1.5);
  const hots = (window.HOTSPOTS || []).map(h => ({ h, d: Math.min(...h.pts.map(q => distM(p, [q[1], q[0]]))) })).filter(x => x.d < 30000).sort((a, b) => a.d - b.d).slice(0, 3);
  return { p, o, land, verdict, wx, access, walk, runs, near, site, pests, wps, hots, slow, made: new Date() };
}

/* ---------- report ---------- */
function weatherHtml(R) {
  const { wx, o, p } = R, days = [];
  for (let d = new Date(o.d0); d <= o.d1; d = new Date(d.getTime() + 864e5)) days.push(d);
  const rows = days.map(d => {
    const s = sunTimes(d, p[1], p[0]), tw = sunTimes(d, p[1], p[0], -6), m = moon(d);
    let w = '';
    if (wx.H) {
      const pick = (t, lab) => { const i = hourIdx(wx.H, t); if (i < 0) return ''; const H = wx.H, v = (k, f = x => Math.round(x)) => (H[k] && H[k][i] != null ? f(H[k][i]) : '–'); return `<li><b>${lab}</b> ${fmtTime(new Date(H.time[i]))}: wind from ${v('wind_direction_10m', compass)} ${v('wind_speed_10m')} km/h (gusts ${v('wind_gusts_10m')}), ${v('temperature_2m')}°C, rain ${v('precipitation_probability')}%, cloud ${v('cloud_cover')}%</li>`; };
      if (s) w = `<ul class="sub">${pick(new Date(s.rise.getTime() + 18e5), 'Dawn')}${pick(new Date((s.rise.getTime() + s.set.getTime()) / 2), 'Midday')}${pick(new Date(s.set.getTime() - 27e5), 'Dusk')}</ul>`;
      const dayRain = wx.H.time.map((t, i) => [new Date(t), (wx.H.precipitation || [])[i]]).filter(([t]) => dayStr(t) === dayStr(d)).reduce((a, [, v]) => a + (v || 0), 0);
      w += `<p class="sub">Rain total about ${dayRain.toFixed(1)} mm.</p>`;
    }
    return `<li><span class="t">${fmtDay(d)}</span><br><span class="sub">First light ${tw ? fmtTime(tw.rise) : '–'} · sunrise ${s ? fmtTime(s.rise) : '–'} · sunset ${s ? fmtTime(s.set) : '–'} · last light ${tw ? fmtTime(tw.set) : '–'} · ${m.name} (${m.illum}%)</span>${w}</li>`;
  }).join('');
  return `<ul class="list">${rows}</ul>${wx.err ? `<p class="warnbox">${esc(wx.err)}</p>` : '<p class="sub">Forecast: Open-Meteo. Wind arrows: “from” is where it blows from; approach from the downwind side.</p>'}`;
}
function spotsHtml(R) {
  return R.runs.map(run => `<div class="rp-run"><h3>${run.label} <span class="sub">${fmtTime(run.t)}${run.res.wind.from != null ? ` · wind ${compass(run.res.wind.from)} ${Math.round(run.res.wind.spd)} km/h` : ' · calm'}</span></h3>
    <img class="rp-img" src="${run.img}" alt="${run.label} likely spots">
    ${run.label === 'Night' ? '<p class="sub">Planning only: no shooting at night on DOC land.</p>' : ''}
    <ol class="sub">${run.spots.map(s => { const rs = A.model.reasons(run.res, s), ap = A.model.approach(run.res, s); return `<li><b>${esc(spLabel(run.res.per[s.n].sp))}</b>: ${esc(rs.slice(0, 3).join(' · '))}. ${fmtDist(distM(R.p, s.p))} ${compass(bearing(R.p, s.p))} of the spot. ${esc(ap[0] || '')}</li>`; }).join('') || '<li>Nothing stood out at this time.</li>'}</ol></div>`).join('');
}
function speciesHtml(R) {
  const season = R.runs[0].res.season;
  return R.o.sps.map(k => { const P = B[k]; if (!P) return ''; const rut = R.runs[0].res.per.find(x => x.sp === k); return `<li><span class="t">${esc(P.name)}${rut && rut.rut ? ' · ' + esc(P.rut.label) : ''}</span><br><span class="sub">${esc(rut && rut.rut && P.doing.rut ? P.doing.rut : P.doing[season])}</span><br><span class="sub"><b>Sign:</b> ${esc(P.signs.slice(0, 3).join('; '))}.</span></li>`; }).join('');
}
function reportHtml(R) {
  const { p, verdict, land, access, walk, near, site, pests, wps, hots, o } = R, h0 = land.hunt && land.hunt[0];
  const [E, N] = A.llToNZTM(p[0], p[1]);
  const kv = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  return `<header class="rp-head"><h1>Trip report</h1><p class="sub">${p[1].toFixed(5)}, ${p[0].toFixed(5)} · NZTM ${Math.round(E)} E ${Math.round(N)} N<br>${fmtDay(o.d0)}${+o.d1 !== +o.d0 ? ' – ' + fmtDay(o.d1) : ''} · ${o.sps.map(spLabel).map(esc).join(', ')} · made ${R.made.toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}</p></header>
  ${R.slow && R.slow.length ? `<p class="warnbox">Some data didn’t load in time (${R.slow.length} source${R.slow.length > 1 ? 's' : ''}), so parts of this report may be incomplete. Rebuild it with a better signal.</p>` : ''}
  <section><h2>Land and permits</h2><div class="verdict ${'v-' + verdict.cat}"><div><b>${esc(verdict.title)}</b><span>${esc(verdict.text)}</span></div></div>
    ${h0 ? `<dl class="kv">${kv('Block', esc(h0.HuntBlockName))}${kv('Permit area', esc(h0.PermitArea))}${kv('Type', esc([h0.BlockType, h0.HuntStatus].filter(Boolean).join(' · ')))}${kv('Dates', esc(h0.DateConditions))}${kv('Access', esc(h0.AccessConditions))}${kv('Dogs', esc(h0.DogConditions))}${kv('Special', esc(h0.SpecialConditions))}</dl>
      <p class="sub">${h0.HuntStatus === 'Permitted' ? `Get a free DOC open hunting permit: <a href="${A.LINKS.docPermit}" target="_blank" rel="noopener">permits</a>. ` : ''}${h0.HuntingWebPage ? `<a href="${esc(h0.HuntingWebPage)}" target="_blank" rel="noopener">Block page and rules</a>.` : ''}</p>` : ''}
    ${o.sps.includes('sheep') ? '<p class="sub">Feral sheep need a permit from the nearest DOC office (not online).</p>' : ''}</section>
  <section><h2>Getting there</h2>
    ${access.length ? `<ul class="list">${access.slice(0, 5).map(a => `<li><span class="t">${esc(a.kind)}${a.name ? ': ' + esc(a.name) : ''}</span><br><span class="sub">${a.d < 1 ? 'At the spot' : `${fmtDist(a.d)} ${compass(a.brg)} of the spot`}</span></li>`).join('')}</ul>` : '<p class="sub">No mapped roads, tracks or legal access routes nearby.</p>'}
    ${walk ? `<p><b>From the ${esc(walk.from.kind.toLowerCase())}:</b> ${fmtDist(walk.from.d)} in a straight line${walk.pr ? `, ↑ ${Math.round(walk.pr.up)} m ↓ ${Math.round(walk.pr.down)} m, about ${A.walkTime(walk.from.d, walk.pr.up)} at track pace (allow much longer off-track)` : ''}.</p>
      ${walk.pr ? A.profileSvg(walk.pr) : ''}
      ${walk.share < 0.95 ? `<p class="warnbox">About ${Math.round((1 - walk.share) * 100)}% of that straight line crosses land not mapped as public. Use a paper road, marginal strip, easement or track, or get the landowner’s permission.</p>` : '<p class="sub">The straight line stays on land mapped as public.</p>'}
      <p class="sub">Drive to the access point: <a href="https://www.google.com/maps/dir/?api=1&destination=${walk.from.q[1]},${walk.from.q[0]}&travelmode=driving" target="_blank" rel="noopener">Google Maps</a> · <a href="https://maps.apple.com/directions?destination=${walk.from.q[1]},${walk.from.q[0]}&mode=driving" target="_blank" rel="noopener">Apple Maps</a></p>` : ''}
    <dl class="kv">${kv('At the spot', `${Number.isFinite(site.elev) ? Math.round(site.elev) + ' m, ' : ''}${Math.round(site.slope)}° slope facing ${compass(site.aspect)}`)}${kv('Water', site.water < 1e5 ? fmtDist(site.water) + ' to the nearest mapped stream or lake' : 'No mapped water nearby')}</dl></section>
  <section><h2>Animals</h2>${land.speciesKnown ? `<p class="sub">DOC records here: ${land.species.length ? land.species.map(spLabel).map(esc).join(', ') : 'none of the mapped species'}.</p>` : ''}
    ${hots.length ? `<p class="sub">Nearest hotspots: ${hots.map(x => `${esc(x.h.name)} (${fmtDist(x.d)})`).join('; ')}.</p>` : ''}
    <ul class="list">${speciesHtml(R)}</ul></section>
  <section><h2>Likely spots by time of day</h2><p class="sub">First day. Red is best-scoring ground; the cross marks your spot. Built from mapped cover, terrain, sun and the forecast wind${o.mask ? ', DOC hunting land only' : ''}.</p>${spotsHtml(R)}</section>
  <section><h2>Weather, sun and moon</h2>${weatherHtml(R)}</section>
  <section><h2>Hazards and rules</h2><ul class="sub">
    ${pests.length ? pests.slice(0, 4).map(x => `<li class="warn"><b>Pesticide:</b> ${esc(x.BlockName || '')} ${esc(x.Pesticide || '')}${x.StartDate ? ' from ' + new Date(x.StartDate).toLocaleDateString('en-NZ') : ''}${x.CautionPeriod ? ', caution ' + esc(x.CautionPeriod) + ' months' : ''}. No meat from the area or its buffer; keep dogs out.</li>`).join('') : '<li>No DOC pesticide operations recorded in this area (private land isn’t covered).</li>'}
    ${near.houses[0] ? `<li>Nearest house or street address: ${fmtDist(near.houses[0].d)} ${compass(bearing(p, near.houses[0].f.geometry.coordinates))}. Check your line of fire with the shooting arc tool.</li>` : ''}
    ${near.tracks && near.tracks.d < 1500 ? `<li>DOC track ${fmtDist(near.tracks.d)} away: trampers may be about. Many blocks bar shooting near tracks and huts.</li>` : ''}
    <li>DOC land: centrefire .222 or larger; no shooting or loaded firearm from 30 min after sunset to 30 min before sunrise; no spotlights or night-vision.</li>
    <li>Identify your target beyond doubt. Carry a PLB, don’t cross flooded rivers, and leave your intentions with someone.</li></ul>
    <p class="sub">Ballots, permits and poison rules: Tools → Rules, seasons &amp; ballots.</p></section>
  <section><h2>Huts, camps and your points</h2><ul class="list">
    ${[...near.huts.map(x => ['Hut', x]), ...near.camps.map(x => ['Campsite', x])].sort((a, b) => a[1].d - b[1].d).slice(0, 4).map(([t, x]) => `<li><span class="t">${t}: ${esc(A.pickName(x.f.properties))}</span><br><span class="sub">${fmtDist(x.d)} ${compass(bearing(p, x.f.geometry.coordinates))}</span></li>`).join('') || '<li class="sub">No DOC huts or campsites in this area.</li>'}
    ${wps.map(w => `<li><span class="t">Your waypoint: ${esc(w.name)}</span><br><span class="sub">${fmtDist(distM(p, [w.lng, w.lat]))} ${compass(bearing(p, [w.lng, w.lat]))}</span></li>`).join('')}</ul></section>
  <p class="sub rp-foot">A planning aid built from public data: boundaries are indicative, vegetation and animal maps can be years old, and rules change. You’re responsible for permission, permits and safe firearm use.</p>`;
}
function textSummary(R) {
  const s = R.runs.find(r => r.label === 'Dawn') || R.runs[0];
  return `Hunting trip: ${fmtDay(R.o.d0)}${+R.o.d1 !== +R.o.d0 ? ' – ' + fmtDay(R.o.d1) : ''}\nSpot: ${R.p[1].toFixed(5)}, ${R.p[0].toFixed(5)}\nLand: ${R.verdict.title}${R.land.hunt && R.land.hunt[0] ? ' (' + R.land.hunt[0].HuntBlockName + ')' : ''}\nAccess from: ${R.walk ? R.walk.from.kind + (R.walk.from.name ? ' ' + R.walk.from.name : '') + ', ' + fmtDist(R.walk.from.d) : '—'}\nTarget: ${R.o.sps.map(spLabel).join(', ')}\nDawn spots: ${s.spots.map(x => x.p[1].toFixed(4) + ',' + x.p[0].toFixed(4)).join('; ')}\nMap: https://www.google.com/maps?q=${R.p[1]},${R.p[0]}`;
}
function openReport(R) {
  let el = $('#report');
  if (!el) { el = document.createElement('div'); el.id = 'report'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Trip report'); document.body.appendChild(el); }
  el.innerHTML = `<div class="rp-bar"><button class="btn small ghost" data-rp="close">Close</button><button class="btn small" data-rp="print">Save PDF / print</button><button class="btn small ghost" data-rp="share">Share</button><button class="btn small ghost" data-rp="wp">Save spot</button><button class="btn small ghost" data-rp="walk">Walking route</button><button class="btn small ghost" data-rp="intent">Trip intentions</button></div><div class="rp-body">${reportHtml(R)}</div>`;
  el.hidden = false; el.scrollTop = 0;
  el.onclick = async e => {
    const b = e.target.closest('[data-rp]'); if (!b) return;
    const k = b.dataset.rp;
    if (k === 'close') el.hidden = true;
    if (k === 'print') window.print();
    if (k === 'share') { const text = textSummary(R); if (navigator.share) { try { await navigator.share({ title: 'Trip report', text }); return; } catch {} } try { await navigator.clipboard.writeText(text); toast('Summary copied'); } catch { toast('Couldn’t share'); } }
    if (k === 'walk') { el.hidden = true; if (A.walkTo) A.walkTo(R.p, 'Trip spot', R.walk && R.walk.from.kind === 'Formed road' ? { p: R.walk.from.q, name: R.walk.from.name } : null); return; }
    if (k === 'wp') { el.hidden = true; actions.saveWp({ dataset: { lng: R.p[0], lat: R.p[1] } }); }
    if (k === 'intent') {
      const t = LS.get('trip', {}), s = sunTimes(R.o.d0, R.p[1], R.p[0]);
      LS.set('trip', Object.assign(t, { where: `${R.land.hunt && R.land.hunt[0] ? R.land.hunt[0].HuntBlockName + ', ' : ''}${R.p[1].toFixed(5)}, ${R.p[0].toFixed(5)}` + (R.walk ? ` (in from ${R.walk.from.kind.toLowerCase()}${R.walk.from.name ? ' ' + R.walk.from.name : ''})` : '') }, s ? { out: toLocalInput(new Date(s.rise.getTime() - 2 * 36e5)), back: toLocalInput(new Date(R.o.d1.getTime() + 8 * 36e5)) } : {}));
      el.hidden = true; actions.mTrip();
    }
  };
}
const toLocalInput = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 16); };
actions.tripLast = () => { if (last) openReport(last); else toast('Tap the map, then “Plan a trip here”.'); };
A.trip = { build, openReport };
})();
