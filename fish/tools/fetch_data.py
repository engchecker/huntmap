"""Fetches open data for the fishing map. Run by GitHub Actions (needs internet; LINZ chart layers use the LINZ_LDS_KEY secret).
Writes GeoJSON/CSV into fish/data/ plus a manifest. Python standard library only."""
import json, os, time, urllib.request, urllib.parse, datetime

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
BBOX = (174.50, -41.40, 175.30, -40.65)   # Mākara to Ōtaki, including Kapiti and Mana islands
UA = {'User-Agent': 'HuntAccessNZ-fishmap-data/1.0 (github.com/engchecker/huntmap)'}
log = {}


def get(url, data=None, tries=3):
    err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:
            err = e
            time.sleep(3 * (i + 1))
    raise err


def esri_to_geojson(j):
    feats = []
    for f in j.get('features', []):
        g = f.get('geometry') or {}
        if 'rings' in g:
            r = g['rings']
            geom = {'type': 'Polygon', 'coordinates': r} if len(r) == 1 else {'type': 'MultiPolygon', 'coordinates': [[x] for x in r]}
        elif 'paths' in g:
            geom = {'type': 'MultiLineString', 'coordinates': g['paths']}
        elif 'x' in g:
            geom = {'type': 'Point', 'coordinates': [g['x'], g['y']]}
        else:
            continue
        feats.append({'type': 'Feature', 'properties': f.get('attributes', {}), 'geometry': geom})
    return feats


def rnd(o, nd=5):
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, list):
        return [rnd(x, nd) for x in o]
    if isinstance(o, dict):
        return {k: rnd(v, nd) for k, v in o.items()}
    return o


def query(layer_url, simplify=None, fields='*'):
    feats, off = [], 0
    while True:
        p = {'where': '1=1', 'geometry': ','.join(map(str, BBOX)), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
             'spatialRel': 'esriSpatialRelIntersects', 'outFields': fields, 'outSR': 4326, 'returnGeometry': 'true',
             'resultOffset': off, 'resultRecordCount': 1000, 'f': 'json'}
        if simplify:
            p['maxAllowableOffset'] = simplify
        j = json.loads(get(layer_url + '/query?' + urllib.parse.urlencode(p)))
        if 'error' in j:   # older servers: no paging
            p.pop('resultOffset'); p.pop('resultRecordCount')
            j = json.loads(get(layer_url + '/query?' + urllib.parse.urlencode(p)))
            if 'error' in j:
                raise RuntimeError(j['error'])
            return feats + esri_to_geojson(j)
        got = esri_to_geojson(j)
        feats += got
        if not j.get('exceededTransferLimit') or not got:
            return feats
        off += len(got)


def save(name, feats, note):
    with open(os.path.join(OUT, name + '.geojson'), 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': rnd(feats)}, f, separators=(',', ':'))
    log[name] = {'features': len(feats), 'source': note}
    print(name, len(feats))


def tryit(name, fn):
    try:
        fn()
    except Exception as e:
        msg = str(e)
        k = os.environ.get('LINZ_LDS_KEY', '')
        if k:
            msg = msg.replace(k, '***')   # never write the key into the manifest or the log
        log[name] = {'error': msg[:300]}
        print('FAIL', name, msg)


os.makedirs(OUT, exist_ok=True)
DOC = 'https://services1.arcgis.com/3JjYDyG3oajxU6HO/arcgis/rest/services/'
MPI = 'https://maps.mpi.govt.nz/wss/service/arcgis1/guest/'

tryit('reserves', lambda: save('reserves', query(DOC + 'DOC_Marine_Reserves/FeatureServer/0'), 'DOC Marine Reserves (CC BY 4.0)'))
tryit('cpz', lambda: save('cpz', query('https://mapping.gw.govt.nz/arcgis/rest/services/GW/NRPMap_P_operative/MapServer/63'), 'Greater Wellington Regional Council: Cook Strait Cable Protection Zone'))
NIWA = 'https://gis.niwa.co.nz/server/rest/services/'


def niwa_depth():
    # NIWA's Bathymetry service holds LINZ chart depth contours at several scales; keep every
    # polyline contour layer that has features here, and record which layers were used.
    meta = json.loads(get(NIWA + 'Bathymetry/MapServer?f=json'))
    log['niwa_bathy_meta_keys'] = list(meta.keys())[:20]
    if 'error' in meta: log['niwa_bathy_error'] = meta['error']
    used = []
    log['niwa_bathy_layers'] = [(L.get('id'), L.get('name'), L.get('geometryType')) for L in meta.get('layers', [])]
    for L in meta.get('layers', []):
        txt = (L.get('name', '') + ' ' + L.get('description', '')).lower()
        if L.get('geometryType') != 'esriGeometryPolyline' or not any(k in txt for k in ('contour', 'depth', 'bathym', 'depcnt')):
            continue
        nm = 'depth_' + str(L['id'])
        def go(L=L, nm=nm):
            fs = query(NIWA + 'Bathymetry/MapServer/' + str(L['id']), simplify=0.0001)
            if fs:
                save(nm, fs, 'NIWA Bathymetry / ' + L['name'] + ' :: ' + L.get('description', '')[:300])
                used.append(nm)
        tryit(nm, go)
    # DOC SeaSketch: depth areas compiled from LINZ charts at 1:22,000 to 1:500,000
    def ss():
        fs = query('https://seasketch.doc.govt.nz/arcgis/rest/services/National/Our_Estuaries/MapServer/82', simplify=0.0001)
        if fs:
            save('deptharea', fs, 'DOC SeaSketch: Bathymetry (depth) areas from LINZ nautical charts')
    tryit('deptharea', ss)
    # NIWA 250 m bathymetry model contours (coarse, offshore)
    def niwa250():
        fs = query(NIWA + 'WFS/Environmental/MapServer/0', simplify=0.0002)
        if fs:
            save('depth_niwa250', fs, 'NIWA bathymetry model contours (250 m grid)')
            used.append('depth_niwa250')
    tryit('depth_niwa250', niwa250)
    log['depth_layers'] = used


tryit('depth', niwa_depth)
tryit('fma_niwa', lambda: save('fma', query(NIWA + 'WFS/Fisheries_Management/MapServer/2', simplify=0.0005), 'MPI FMA general regions via NIWA'))


def mpi_service(svc, prefix):
    meta = json.loads(get(MPI + svc + '/MapServer?f=json'))
    for L in meta.get('layers', []):
        if L.get('subLayerIds'):
            continue
        nm = prefix + '_' + str(L['id'])

        def go(L=L, nm=nm):
            fs = query(MPI + svc + '/MapServer/' + str(L['id']), simplify=0.0001)
            if fs:
                save(nm, fs, 'MPI ' + svc + ' / ' + L['name'])
        tryit(nm, go)




def restrictions():
    folder = json.loads(get(MPI + 'MARINE?f=json'))
    names = [s['name'] for s in folder.get('services', [])]
    log['mpi_services'] = names
    for n in names:
        if any(k in n for k in ('Restriction', 'Recreational', 'Closure', 'Mataitai', 'Taiapure')):
            mpi_service(n, 'mpi_' + n.split('/')[-1].replace('MARINE_', ''))




def slips():
    b = f'{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]}'
    q = f'[out:json][timeout:60];(node["leisure"="slipway"]({b});way["leisure"="slipway"]({b}););out center tags;'
    j = json.loads(get('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': q}).encode()))
    fs = []
    for e in j['elements']:
        lat, lon = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon'])
        tags = {k: v for k, v in e.get('tags', {}).items() if k in ('name', 'access', 'fee', 'operator', 'description')}
        fs.append({'type': 'Feature', 'properties': tags, 'geometry': {'type': 'Point', 'coordinates': [lon, lat]}})
    save('slipways', fs, '© OpenStreetMap contributors (ODbL)')


tryit('slipways', slips)


def tides():
    if os.path.exists(os.path.join(OUT, 'tide-ManaMarina-2028.csv')):
        return
    base = 'https://static.charts.linz.govt.nz/tide-tables/maj-ports/csv/'
    for port in ('Mana Marina', 'Port Taranaki'):
        for y in (2026, 2027, 2028):
            fn = f'{port} {y}.csv'
            try:
                b = get(base + urllib.parse.quote(fn))
                with open(os.path.join(OUT, 'tide-' + port.replace(' ', '') + f'-{y}.csv'), 'wb') as f:
                    f.write(b)
                log['tide ' + fn] = len(b)
            except Exception as e:
                log['tide ' + fn] = 'FAIL ' + str(e)[:100]


tryit('tides', tides)

# Does LINZ publish hydrographic (chart) layers on its keyless ArcGIS Online services?
def linz_hydro():
    root = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/arcgis/rest/services'
    j = json.loads(get(root + '?f=json'))
    names = [s['name'] for s in j.get('services', [])]
    log['linz_agol_service_count'] = len(names)
    hyd = [n for n in names if any(k in n.lower() for k in ('sound', 'depth', 'hydro', 'bathy', 'chart', 'contour', 'rock', 'wreck', 'obstruct'))]
    log['linz_agol_hydro'] = hyd
    for n in hyd:
        meta = json.loads(get(f'{root}/{n}/FeatureServer?f=json'))
        for L in meta.get('layers', []):
            nm = 'linz_' + n.lower()[:40] + '_' + str(L['id'])
            def go(n=n, L=L, nm=nm):
                fs = query(f'{root}/{n}/FeatureServer/{L["id"]}', simplify=0.00005)
                if fs: save(nm, fs, f'LINZ ArcGIS Online / {n} / {L["name"]}')
            tryit(nm, go)


tryit('linz_hydro', linz_hydro)


# LINZ Data Service chart layers (needs the LINZ_LDS_KEY repository secret; skipped without it)
def lds():
    key = os.environ.get('LINZ_LDS_KEY', '').strip()
    if not key:
        log['lds'] = 'skipped: no LINZ_LDS_KEY secret'
        return
    layers = {'soundings': 50866, 'contours': 50554, 'deptharea_fine': 50671}   # Hydro 1:22k-1:90k soundings and contours; depth areas 1:4k-1:22k
    for nm, lid in layers.items():
        def go(nm=nm, lid=lid):
            q = urllib.parse.urlencode({'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': f'layer-{lid}',
                                        'outputFormat': 'json', 'srsName': 'EPSG:4326',
                                        'bbox': f'{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]},urn:ogc:def:crs:EPSG::4326'})
            j = json.loads(get(f'https://data.linz.govt.nz/services;key={key}/wfs?{q}'))
            fs = j.get('features', [])
            for f in fs:
                f.pop('id', None)
            save(nm, fs, f'LINZ Data Service layer {lid} (CC BY 4.0)')
        tryit(nm, go)


tryit('lds', lds)

log['_fetched'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
log['_bbox'] = BBOX
with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(log, f, indent=1)
