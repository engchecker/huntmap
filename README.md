# Hunt Access NZ

A phone map for planning hunts and checking, on the spot, whether you can hunt where you're standing.

## What it does

- **Colour-coded land categories, each a layer you can turn on and off:** dark green is DOC land; lime is huntable with just a DOC permit (amber: restricted or ballot; red stripes: no hunting); orange is legal and paper roads; blue is other public access to travel through; rose is everything else, which needs landowner permission (purple: Māori land; slate: riverbed; grey: Crown or reserve land to check). Sliders set overlay strength and fade the basemap.
- **Search** by street address, road name, place name, lat/long or NZTM. Picking a road highlights its full length.

- **Tap anywhere for a verdict.** For example: DOC land with hunting permitted, a restricted or ballot block, no hunting, a legal or paper road, other public access, private land, Māori land, or a riverbed parcel.
- **DOC hunting blocks** show the block name, permit area and status, plus date, access, dog and special conditions. There's a link to the block page and to DOC's free open permit.
- **Property boundaries** (zoom 14+) show the parcel appellation, its purpose, title reference, estate type and number of owners. Owner names aren't open data. "Copy title & open LINZ" takes you to Land Record Search, where the title costs about $8 and lists the registered owners.
- **Paper roads and public access** come from the Herenga ā Nuku Public Access Areas layers: legal roads, easements, reserves and council parks.
- **Animals.** DOC distribution layers cover red, fallow, sika, sambar, rusa and whitetail deer, wapiti, goats, pigs, tahr and chamois. Tapping a spot lists the species recorded there.
- **Pesticide warnings.** DOC summaries show where pesticide will be or has been laid (1080 and others), with dates and caution periods.
- **Basemaps** come from LINZ: Topo (vector, with road names), Topo50 (the classic printed map) and Aerial imagery with labels and parcel lines.
- **Offline maps.** Save the area on screen. This stores the basemap tiles plus every data layer, so tap checks and live status work with no signal.
- **GPS.** It follows your position, shows a live land status banner, and gives boundary alerts (vibrate and beep) when you move onto private or no-hunting land.
- **Directions.** "Drive" hands off to Google or Apple Maps. The map also shows the straight-line distance and bearing from you to any tapped point.
- **Hunting access beyond DOC.** A directory of stations, forestry companies, iwi and council land, with how to get permission (Makowhai Station, Blue Duck, Kaingaroa, OneFortyOne, Te Urewera, Greater Wellington and more).
- **Other tools:** waypoints with GPX export, a log of your landowner permissions, a trip intentions message to text a contact, and wind forecast plus first and last light.

## Public-land hotspots by species

Tick a species under Map & layers → Animals and a heatmap shows where DOC and hunters rate public land best for it. There are 47 areas, rated 1–3 from DOC block descriptions, DOC monitoring, herd management plans and hunter forums. Tap a red dot for notes, access rules and sources, or use **Best public areas** for a ranked list. It reflects reputation, not live counts, and popular areas carry the most pressure. Edit `hotspots.js` to add your own spots.

## Find animals (habitat model)

Tools › **Find animals** (or **Find animals here** on a hotspot) scores the ground in view for one or more ticked species and shades the likeliest areas yellow to red, with up to six numbered spots.

- **Behaviour** (`behaviour.js`): feeding and bedding cover, preferred slope and landform, distance to edges and water, sensitivity to roads and tracks, sunny or shady faces by season, height in the valley, daily activity by season, and rut or roar dates. Text draws on DOC species hunting guides.
- **Terrain**: LINZ elevation gives slope, aspect and landform (gully, face or spur).
- **Cover and features**: LINZ Topo vector data gives native and exotic forest, scrub, scattered scrub, wetland, scree and rock, streams, slips, bluffs, tracks, roads and buildings.
- **Sun and wind**: the sun's position for the chosen date and time, plus the Open-Meteo wind (or your own setting) for shelter, downwind approach and thermals.
- **Your hunt log**: with three or more kills or sightings of that species in view, the model reweights itself towards the ground where you've actually found them.
- By default only DOC land open to hunting is scored.

Each spot lists why it scored well, how to approach it for wind and thermals, and buttons to navigate or save a waypoint. Offline, it needs the area saved with **Topo** and **Terrain** ticked. It's a guide to where to look, not a guarantee.

## Field tools (More menu)

- **Shooting arc check:** set your firearm and aim (tap the map or use the phone's compass). It lists mapped houses, roads, DOC tracks, huts, legal roads, private land and the hunting-block edge inside your line of fire, nearest first. Mapped data only: it can't see people, stock or unmapped buildings, and ignores terrain.
- **Track & back to the truck:** records your route (keeps the screen on, since phones stop web-app GPS when locked). "Mark truck here" puts a navigation arrow and distance at the top of the map. Any waypoint can be a target.
- **Boundary distance:** the live status bar shows how close the nearest private boundary or hunting-block edge is.
- **Check-in timer:** start it from Trip intentions. It warns before your back-by time and has one-tap "I'm out safe" and "Text position" buttons. It only runs while the app is open.
- **Terrain:** hillshade, slope steepness (25/30/35/45°) and sunny north faces, under Map & layers. Tick "Terrain" when saving an offline area.
- **Route planner:** tap points to draw a route and get distance, climb and an elevation profile. Save it or export GPX.
- **Scent cone:** in Wind, scent & sun, tap any forecast hour to draw where your scent will carry.
- **DOC huts, campsites & tracks** layer. Tap a hut for details.
- **Hunt log:** kills and sightings with species, sex, weight, notes and a photo, season totals, and dots on the map.
- **Share a trip:** send waypoints, routes, permitted-property locations and the plan as a link that opens in the app, or as a GPX file.

## Put it on your phone (about 10 minutes, free)

The app is a set of static files. It needs to be served over **https** for GPS and offline mode to work. GitHub Pages is the simplest option.

1. Create a free account at github.com if you don't have one.
2. Click **New repository**. Name it e.g. `huntmap` and set it to **Public**, which free Pages needs. Create it.
3. Click **Add file → Upload files** and drag in everything from this folder (`index.html`, `app.js`, `app.css`, `data.js`, `sw.js`, `manifest.webmanifest`, and the `vendor` and `icons` folders). Commit.
4. Go to **Settings → Pages**. Under "Branch" choose `main` and `/ (root)`, then click Save. After a minute your site is at `https://YOUR-NAME.github.io/huntmap/`.
5. Open that address on your phone:
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ → **Install app** (or Add to Home screen).
6. Open it from the home-screen icon and allow location when asked.

Netlify Drop (app.netlify.com/drop) also works: drag the folder in and you get an https link instantly.

## Android app

`app/` packages this web app as a native Android app with Capacitor. Each push to `main` builds a test APK, published under Releases. Service keys live in `config.js`. See `app/STORE-CHECKLIST.md` for the path to Google Play and the App Store.

## Before each trip

1. Pan and zoom to the area you'll hunt (the whole screen is saved).
2. Tap the **download** button. Pick a detail level and basemaps, then **Download area**.
3. Download from the **home-screen app**, not a browser tab. On iPhone the two have separate storage.

Aerial imagery at Maximum detail is large. Use Detailed for most trips.

## The LINZ map key

LINZ Basemaps needs an API key. The app creates a free standard key automatically, the same way basemaps.linz.govt.nz does. It lasts 90 days and the app renews it. For a key that never expires, email **basemaps@linz.govt.nz** to ask for developer access, then paste it under **More → Settings & help**. Saved offline areas keep working when the key changes.

## Limits to know

- Boundaries are indicative, not survey-accurate. DOC says its hunting layer isn't suitable for exact boundary definition. Near a boundary, give it a wide margin.
- The animal layers are DOC's 2007/2014 distribution maps. They show broad range, not current numbers.
- Phones stop web-app GPS when the screen is off or the app is in the background. Live status and alerts only work while the app is open on screen.
- A legal road shown in orange with no road drawn on the basemap is probably a paper road. Check it on Aerial. You can walk it, but don't shoot from or across a road.
- The access directory was researched in November 2026. Prices, seasons and contacts change, so confirm with the provider.
- This is a planning aid. You're responsible for permission, permits, your firearms licence and the Arms Code.

## Data sources

DOC Open Data · Toitū Te Whenua LINZ (Basemaps, primary parcels, titles without owners, place names) · Herenga ā Nuku Aotearoa (Public Access Areas) · Open-Meteo (wind). Open licences, mostly CC BY 4.0.

## Editing the access directory

`data.js` holds the directory as a plain list. To add a station you've got permission for, copy an entry and change the name, pins (`[latitude, longitude]`), species and notes.

## How the code is organised

No build step: plain files served as they are.

| File | What it does |
| --- | --- |
| `index.html`, `app.css` | Page and styles |
| `app.js` | The app: map, land data loading, identify, layers, GPS, offline areas, field tools. Sections are listed at the top of the file |
| `model.js` | Find animals habitat model (uses `window.HuntMap`, the app's small internal API) |
| `behaviour.js` | Species behaviour profiles used by the model |
| `trip.js` | Plan a trip here: one-tap trip report (land, access, effort, animals, heatmaps by time of day, weather, hazards, logistics) |
| `route.js` | Walking route planner: car stop on a public road → via points → destination; least-cost route over terrain, cover, streams, bluffs and legal access (Tobler hiking function) |
| `rules.js` | Rules, seasons & ballots reference sheet (dated; check sources) |
| `hotspots.js`, `data.js` | Public-land hotspots, access directory and species list |
| `sw.js` | Service worker: app files network-first with offline fallback; map tiles cache-first |
| `vendor/` | MapLibre GL 4.7.1 and a small vector-tile decoder |

Saved offline areas keep a short summary list in memory. Each area's land data and tile list are stored separately in IndexedDB and only loaded for areas near where you're looking. Slope and sunny-face shading is worked out in a background worker so the map stays smooth.

## Legal access routes

The Public access layer shows Herenga ā Nuku's three lasting rights of passage in their own colours: paper (unformed legal) roads, marginal strips (from the Public Access Conservation Land layer) and Public Access Easements over former Crown forest land (Crown Forest Assets Act 1989). Tap one for what it allows. Passing through is not permission to hunt.
