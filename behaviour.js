/* Hunt Access NZ — species behaviour profiles for the habitat model.
   Text draws on DOC species hunting guides (red, sika, fallow, whitetail, wapiti, chamois, goats, pigs)
   plus widely used NZ hunting knowledge (thermals, sign, tahr behaviour). Numbers are model weights,
   not measurements.
   veg classes: open (grass/tussock/pasture), scatter (scattered scrub), scrub, native, exotic, swamp,
   rock (scree/shingle/bare rock), ice, water, sand.
   slope: [zero-below, full-from, full-to, zero-above] in degrees.
   warm: preference for sun (+1) or shade (-1) by season. elev: target position in the area (0 low – 1 high). */
(() => {
const DEER_FEED = { open: 1, scatter: 0.9, scrub: 0.6, native: 0.45, exotic: 0.35, swamp: 0.55, rock: 0.15, ice: 0, water: 0, sand: 0.1 };
const DEER_BED = { open: 0.15, scatter: 0.4, scrub: 0.85, native: 1, exotic: 0.75, swamp: 0.25, rock: 0.15, ice: 0, water: 0, sand: 0 };
const W_DEER = { veg: 2, slope: 1, edge: 1.6, water: 0.6, disturb: 1, warm: 1, elev: 0.6, slip: 0.7, tpi: 0.5, cliff: 0, shelter: 0.8 };
const deerSchedule = (feedDay = 0.15) => ({
  summer: { dawn: 1, day: feedDay, dusk: 1, night: 0.6 },
  autumn: { dawn: 1, day: feedDay + 0.15, dusk: 1, night: 0.6 },
  winter: { dawn: 0.8, day: 0.6, dusk: 0.9, night: 0.4 },
  spring: { dawn: 1, day: 0.35, dusk: 1, night: 0.6 }
});
const DEER_SIGN = ['Fresh droppings (shiny, moist pellets) and clear hoof prints in mud or on track edges', 'Rubbed and stripped saplings (stags cleaning velvet Jan–Mar and marking in the roar)', 'Wallows: muddy hollows near water or seeps, smelling strongly in the roar', 'Browse lines and bitten-off shoots on palatable shrubs (broadleaf, māhoe, five-finger)', 'Well-used game trails along terraces, spurs and creek crossings'];
const THERMALS = 'Before the sun reaches the faces, in the evening and at night, cooling air drains downhill and carries your scent down-slope: approach from below or across the slope. Once the sun warms the faces (usually 1–3 hours after sunrise) thermals rise, so your scent goes uphill: get above the animals or approach across the slope. A steady wind over about 15 km/h overrides thermals.';

window.BEHAVIOUR = {
  red: {
    name: 'Red deer', rut: { from: [3, 20], to: [4, 25], label: 'the roar' },
    veg: { feed: DEER_FEED, bed: DEER_BED }, slope: { feed: [0, 3, 25, 40], bed: [8, 15, 35, 45] },
    edge: { feed: 120, bed: 250 }, water: 350, disturb: 450, tpi: { feed: -0.1, bed: 0.5 },
    warm: { summer: -0.4, autumn: 0.2, winter: 0.8, spring: 0.5 }, elev: { summer: 0.65, autumn: 0.5, winter: 0.3, spring: 0.35 },
    w: W_DEER, schedule: deerSchedule(0.15), wallow: true,
    doing: {
      summer: 'Feeding peaks early morning and late evening; through the day they stay in forest cover on mid-valley terraces and gully heads (DOC). In heat, expect them higher and on shaded faces.',
      autumn: 'Before and after the roar, feeding at dawn and dusk on edges and slips, bedding in cover through the day.',
      winter: 'Food is scarce, so they feed more of the day and favour sunny, sheltered faces lower down.',
      spring: 'They move into open areas for fresh grass, often river flats near forest margins (DOC). One of the best times to hunt.',
      rut: 'The roar runs late March through April, peaking in the middle two weeks (DOC). Stags roar mainly early morning and evening, hold hinds in basins and clearings, use wallows, and are less cautious.'
    },
    diet: 'Grasses and herbs on flats, slips and clearings; browse shrubs and broadleaf species in the bush.',
    waterTxt: 'Drink and wallow at seeps, creeks and swampy hollows, especially in the roar.',
    signs: DEER_SIGN,
    tips: ['Be in likely areas early morning and late afternoon (DOC)', 'Stalk mid-valley terraces and gully heads slowly; carry the rifle ready, not slung (DOC)', 'Spring: move slowly just inside the forest edge beside grassy flats (DOC)', 'Wind or heavy rain: look in sheltered spots; light drizzle: they may feed at any hour (DOC)', 'Senses: excellent smell, sight and hearing. Hunt into the wind.']
  },
  sika: {
    name: 'Sika deer', rut: { from: [3, 25], to: [5, 5], label: 'the rut' },
    veg: { feed: { ...DEER_FEED, open: 0.95, scrub: 0.65 }, bed: DEER_BED }, slope: { feed: [0, 3, 28, 42], bed: [8, 15, 38, 48] },
    edge: { feed: 90, bed: 220 }, water: 400, disturb: 650, tpi: { feed: -0.2, bed: 0.4 },
    warm: { summer: -0.4, autumn: 0.3, winter: 1, spring: 0.5 }, elev: { summer: 0.6, autumn: 0.5, winter: 0.35, spring: 0.35 },
    w: { ...W_DEER, disturb: 1.5, warm: 1.3 }, schedule: deerSchedule(0.12), wallow: true,
    doing: {
      summer: 'In forest and scrub, which gets dry and noisy to move through (DOC). Feeding focuses on the last two hours of light, when they’re less cautious (DOC).',
      autumn: 'Feeding at dawn and especially the last two hours of light; bedding in cover.',
      winter: 'Seldom seen in the open. Look on sunny mid-valley slopes, forest slopes and creek heads, feeding or lying down (DOC).',
      spring: 'They spend a lot of time in the open grazing new grass on river flats and grassy areas (DOC).',
      rut: 'The rut runs late March to early May; stags are most vocal and less cautious (DOC). Listen for the "hee-haw" call and the alarm whistle.'
    },
    diet: 'New grass and shrub growth; browse in the forest.', waterTxt: 'Creek heads and river flats.',
    signs: [...DEER_SIGN.slice(0, 3), 'A shrill alarm whistle, often repeated while fleeing (DOC)', 'Animals lying flat: scan at ground level, not just deer height (DOC)'],
    tips: ['Spring: hunt the fringes of river flats and grass areas (DOC)', 'Winter: move slowly through mid-valley slopes and gully heads, stopping often (DOC)', 'Last two hours of light: a purposeful approach often works (DOC)', 'Quiet clothing and soft rubber-soled footwear in dry summer bush (DOC)', 'Very wary of hunting pressure: get away from tracks.']
  },
  fallow: {
    name: 'Fallow deer', rut: { from: [4, 1], to: [5, 15], label: 'the rut' },
    veg: { feed: { ...DEER_FEED, open: 1, exotic: 0.45 }, bed: { ...DEER_BED, scrub: 0.95, exotic: 0.85 } }, slope: { feed: [0, 0, 20, 35], bed: [3, 10, 30, 40] },
    edge: { feed: 100, bed: 150 }, water: 400, disturb: 450, tpi: { feed: -0.3, bed: 0.2 },
    warm: { summer: -0.4, autumn: 0.2, winter: 0.7, spring: 0.4 }, elev: { summer: 0.35, autumn: 0.3, winter: 0.2, spring: 0.25 },
    w: { ...W_DEER, elev: 1 }, schedule: { ...deerSchedule(0.1), winter: { dawn: 0.9, day: 0.8, dusk: 0.9, night: 0.4 } },
    doing: {
      summer: 'Feed mainly at dawn and dusk and rest for much of the day in heavy cover (DOC). Lowland river flats and lower valley sides.',
      autumn: 'Dawn and dusk feeding along bush edges onto flats and farmland margins.',
      winter: 'Feed for most of the day (DOC).',
      spring: 'Move out of the forest to feed on new grass and shrub growth (DOC).',
      rut: 'April to about mid-May. Bucks set up territories with urine-marked scrapes and groan repeatedly, and are less cautious (DOC). Hunt early in the rut before points get broken (DOC).'
    },
    diet: 'A wide range of plants, including fungi (DOC).', waterTxt: 'Creeks and river flats in the lowland valleys they favour.',
    signs: ['Urine-marked ground scrapes in the rut (DOC)', 'Barking alarm calls; females and young bleat; bucks groan in the rut (DOC)', ...DEER_SIGN.slice(0, 2)],
    tips: ['Hunt while they feed, when they’re easier to find and stalk (DOC)', 'Use cover and hunt into the wind: good eyes and nose (DOC)', 'Look along forest edges next to flats and farmland. Stay on land you’re allowed on.']
  },
  whitetail: {
    name: 'Whitetail deer', rut: { from: [4, 20], to: [6, 5], label: 'the rut' },
    veg: { feed: { ...DEER_FEED, open: 0.9, sand: 0.4 }, bed: DEER_BED }, slope: { feed: [0, 0, 22, 35], bed: [3, 10, 30, 40] },
    edge: { feed: 90, bed: 150 }, water: 400, disturb: 450, tpi: { feed: -0.2, bed: 0.3 },
    warm: { summer: -0.3, autumn: 0.3, winter: 0.9, spring: 0.5 }, elev: { summer: 0.3, autumn: 0.25, winter: 0.2, spring: 0.25 },
    w: { ...W_DEER, elev: 1.1, shelter: 1.2 }, schedule: { ...deerSchedule(0.12), winter: { dawn: 0.9, day: 0.8, dusk: 0.9, night: 0.4 } },
    doing: {
      summer: 'Feeding peaks early morning and evening (DOC).', autumn: 'Dawn and dusk feeding; creatures of habit that return to the same feeding spot at the same time (DOC).',
      winter: 'Feed during the day; in bad weather they shelter from wind and cold, so hunt sunny, sheltered spots (DOC).', spring: 'Leave the forest to feed on new grass and shrub growth (DOC).',
      rut: 'Bucks don’t call; they make wallows and herd does or stay with one doe, and are less cautious (DOC).'
    },
    diet: 'Grass and shrub growth on flats and edges; forest browse.', waterTxt: 'Strong swimmers. Water won’t stop them (DOC).',
    signs: ['Wallows and does herded in the rut (DOC)', 'Repeated use of the same feeding spot (DOC)', ...DEER_SIGN.slice(0, 2)],
    tips: ['Stake out a known feeding spot at the same time of day (DOC)', 'If disturbed but not shot at, they often circle back. Wait quietly (DOC)', 'Move slowly, stop often, hunt into the wind (DOC)']
  },
  wapiti: {
    name: 'Wapiti', rut: { from: [3, 10], to: [4, 30], label: 'the bugle' },
    veg: { feed: { ...DEER_FEED, open: 1, scatter: 0.95 }, bed: DEER_BED }, slope: { feed: [0, 3, 28, 42], bed: [8, 15, 35, 45] },
    edge: { feed: 140, bed: 260 }, water: 400, disturb: 500, tpi: { feed: 0, bed: 0.4 },
    warm: { summer: -0.4, autumn: 0.2, winter: 0.8, spring: 0.5 }, elev: { summer: 0.75, autumn: 0.6, winter: 0.3, spring: 0.4 },
    w: { ...W_DEER, slip: 1.2 }, schedule: deerSchedule(0.15), wallow: true,
    doing: {
      summer: 'Feed early morning and late evening (DOC) on open tops, slips and clearings, which they favour (DOC).', autumn: 'Bugle mid-March to late April, then dawn/dusk feeding on tops and slips.',
      winter: 'Lower, sunnier faces and forest.', spring: 'Move out of the forest to feed on new grass and shrub growth (DOC).',
      rut: 'Bulls bugle (a whistle-like call) from mid-March to late April and are less cautious (DOC). The Wapiti Area is ballot-only 1 Mar–30 Apr.'
    },
    diet: 'Grasses, herbs and shrubs, including broadleaf, kāmahi, silver beech and lancewood (DOC).', waterTxt: 'Wallows and tarns on the tops in the bugle.',
    signs: [...DEER_SIGN, 'Bugling bulls at dawn and dusk in the bugle'],
    tips: ['Glass open tops, slips and clearings with good binoculars (DOC)', 'Flat-shooting calibre, minimum .270 (DOC)', 'Leave young bulls (DOC)']
  },
  sambar: {
    name: 'Sambar deer', rut: { from: [6, 1], to: [8, 31], label: 'the rut' },
    veg: { feed: { ...DEER_FEED, exotic: 0.6, scrub: 0.75 }, bed: { ...DEER_BED, exotic: 0.95, scrub: 1 } }, slope: { feed: [0, 0, 22, 35], bed: [3, 10, 30, 40] },
    edge: { feed: 80, bed: 200 }, water: 250, disturb: 600, tpi: { feed: -0.4, bed: -0.2 },
    warm: { summer: -0.4, autumn: 0, winter: 0.4, spring: 0.2 }, elev: { summer: 0.35, autumn: 0.3, winter: 0.25, spring: 0.3 },
    w: { ...W_DEER, water: 1, disturb: 1.4 }, schedule: { summer: { dawn: 0.9, day: 0.1, dusk: 0.9, night: 1 }, autumn: { dawn: 0.9, day: 0.1, dusk: 0.9, night: 1 }, winter: { dawn: 0.9, day: 0.2, dusk: 0.9, night: 1 }, spring: { dawn: 0.9, day: 0.15, dusk: 0.9, night: 1 } }, wallow: true,
    doing: { summer: 'Mostly nocturnal; feed on edges and wet gullies at the very ends of the day.', autumn: 'As summer.', winter: 'Rut season. Stags mark trees and use wallows.', spring: 'Edges of forestry and scrub at first and last light.', rut: 'Rut mainly in winter. Stags rub and thrash trees and wallow.' },
    diet: 'Grass, browse and fallen fruit along scrub and forestry edges.', waterTxt: 'Strongly tied to water, wet gullies and wallows.',
    signs: ['Heavy rubs and thrashed saplings', 'Wallows in wet gullies', 'Large prints and droppings on forestry tracks'],
    tips: ['Mostly on private and forestry land. Check permits (DOC)', 'Hunt the last and first light along wet gullies and edges.']
  },
  rusa: {
    name: 'Rusa deer', rut: { from: [7, 1], to: [8, 31], label: 'the rut' },
    veg: { feed: { ...DEER_FEED, scrub: 0.8, scatter: 1 }, bed: { ...DEER_BED, scrub: 1 } }, slope: { feed: [0, 0, 25, 38], bed: [5, 12, 32, 42] },
    edge: { feed: 90, bed: 180 }, water: 350, disturb: 600, tpi: { feed: -0.2, bed: 0.2 },
    warm: { summer: -0.3, autumn: 0.2, winter: 0.7, spring: 0.4 }, elev: { summer: 0.4, autumn: 0.35, winter: 0.3, spring: 0.3 },
    w: { ...W_DEER, disturb: 1.4 }, schedule: deerSchedule(0.1),
    doing: { summer: 'Scrubby Galatea faces; feeding at dawn and dusk.', autumn: 'Dawn and dusk on scrub edges.', winter: 'Rut in mid-winter; stags vocal and more active.', spring: 'New growth on scrub faces.', rut: 'Rut in July–August.' },
    diet: 'Grass and browse in scrubby country (DOC notes they’ve adapted well to the scrubby Galatea faces).', waterTxt: 'Creeks in the faces.',
    signs: DEER_SIGN, tips: ['Large tracts of Māori land in Te Urewera. Know exactly where you’re permitted (DOC)', 'Elusive: hunt slowly and glass scrub faces at first and last light.']
  },
  goat: {
    name: 'Goats', rut: null,
    veg: { feed: { open: 0.9, scatter: 1, scrub: 0.85, native: 0.5, exotic: 0.25, swamp: 0.2, rock: 0.6, ice: 0, water: 0, sand: 0.2 }, bed: { open: 0.5, scatter: 0.8, scrub: 0.8, native: 0.7, exotic: 0.3, swamp: 0.1, rock: 0.9, ice: 0, water: 0, sand: 0 } },
    slope: { feed: [5, 15, 45, 65], bed: [15, 25, 55, 75] }, edge: { feed: 120, bed: 200 }, water: 800, disturb: 300, tpi: { feed: 0.2, bed: 0.5 },
    warm: { summer: -0.3, autumn: 0.6, winter: 1, spring: 0.7 }, elev: { summer: 0.5, autumn: 0.5, winter: 0.4, spring: 0.45 },
    w: { veg: 1.6, slope: 1.3, edge: 1.2, water: 0.2, disturb: 0.6, warm: 1.4, elev: 0.3, slip: 0.3, tpi: 0.5, cliff: 1.2, shelter: 1 },
    schedule: { summer: { dawn: 1, day: 0.3, dusk: 1, night: 0.2 }, autumn: { dawn: 1, day: 0.5, dusk: 1, night: 0.2 }, winter: { dawn: 0.9, day: 0.85, dusk: 0.9, night: 0.2 }, spring: { dawn: 1, day: 0.5, dusk: 1, night: 0.2 } },
    doing: {
      summer: 'Feed early morning and late afternoon and rest through the middle of the day (DOC). On hot sunny days they seek shade (DOC).',
      autumn: 'Feeding on sunny open faces next to scrub cover.', winter: 'Days are short, so they feed through the day (DOC). Favour sunny slopes near cover.',
      spring: 'Sunny faces with fresh growth; nannies with kids.', rut: ''
    },
    diet: 'Browse shrubs, trees, grasses and weeds (blackberry, brier, gorse). They seek out broadleaf and māhoe (DOC).', waterTxt: 'Get most moisture from browse. Water isn’t a strong draw.',
    signs: ['Strong billy smell, often the first sign. Work out the wind to find the source (DOC)', 'Goats calling to each other (DOC)', 'Pellet piles under bluffs and in rock shelters', 'Browsed-out broadleaf and māhoe; bark-stripped shrubs', 'Well-worn trails along bluffs and ledges'],
    tips: ['Upland forest or scrub with grassy openings near shelter; sunny slopes (DOC)', 'If disturbed, wait: they often stay nearby (DOC)', 'In strong wind they avoid exposed slips; in rain they shelter (DOC)', 'Stalk upwind, especially in open country (DOC)']
  },
  pig: {
    name: 'Pigs', rut: null,
    veg: { feed: { open: 0.7, scatter: 0.85, scrub: 0.9, native: 0.85, exotic: 0.75, swamp: 1, rock: 0.05, ice: 0, water: 0, sand: 0.1 }, bed: { open: 0.1, scatter: 0.5, scrub: 1, native: 0.85, exotic: 0.8, swamp: 0.6, rock: 0, ice: 0, water: 0, sand: 0 } },
    slope: { feed: [0, 0, 22, 38], bed: [0, 5, 28, 40] }, edge: { feed: 80, bed: 120 }, water: 180, disturb: 500, tpi: { feed: -0.6, bed: -0.4 },
    warm: { summer: -0.7, autumn: -0.2, winter: 0.4, spring: 0 }, elev: { summer: 0.35, autumn: 0.3, winter: 0.25, spring: 0.3 },
    w: { veg: 1.6, slope: 1, edge: 0.8, water: 1.6, disturb: 1.1, warm: 0.8, elev: 0.6, slip: 0, tpi: 1.1, cliff: 0, shelter: 0.6 },
    schedule: { summer: { dawn: 1, day: 0.15, dusk: 1, night: 0.9 }, autumn: { dawn: 1, day: 0.35, dusk: 1, night: 0.8 }, winter: { dawn: 0.9, day: 0.6, dusk: 0.9, night: 0.6 }, spring: { dawn: 1, day: 0.4, dusk: 1, night: 0.8 } },
    doing: {
      summer: 'Most active late evening and early morning (DOC). Through the heat they lie up in cool, shady gullies and thick cover near water.',
      autumn: 'Rooting in gullies and along stream flats at the ends of the day.', winter: 'Mainly active in daylight (DOC). Rooting fern and grass flats; sunny sheltered gullies.',
      spring: 'Breeding (mainly spring–summer, DOC). Sows with litters keep to thick cover.', rut: ''
    },
    diet: 'Omnivorous: grass, roots, seeds, carrion, worms and insects (DOC). Root fern, flats and soft wet ground.', waterTxt: 'Strongly tied to water and wallows, especially in warm weather.',
    signs: ['Fresh rooting (turned soil, still damp, with crisp edges)', 'Wallows and mud rubs on trees and posts near water', 'Cloven prints with dew-claw marks in soft ground', 'Fresh droppings and nest beds of bent fern or grass in thick cover', 'Tusk marks on trees (boars)'],
    tips: ['Poor eyesight but acute hearing and smell: hunt upwind and quietly (DOC)', 'Overcast, lightly rainy days: check open areas for feeding pigs at any time (DOC)', 'No dogs? Puketi-type forests where dogs aren’t always needed suit stalking (DOC)', 'Calibre .270 and above recommended for boars (DOC)']
  },
  tahr: {
    name: 'Tahr', rut: { from: [5, 15], to: [7, 15], label: 'the rut' },
    veg: { feed: { open: 1, scatter: 0.8, scrub: 0.6, native: 0.2, exotic: 0, swamp: 0.2, rock: 0.55, ice: 0.05, water: 0, sand: 0 }, bed: { open: 0.5, scatter: 0.7, scrub: 0.8, native: 0.4, exotic: 0, swamp: 0, rock: 0.9, ice: 0.05, water: 0, sand: 0 } },
    slope: { feed: [15, 25, 50, 65], bed: [25, 35, 60, 75] }, edge: { feed: 300, bed: 300 }, water: 1500, disturb: 600, tpi: { feed: 0.3, bed: 0.6 },
    warm: { summer: -0.2, autumn: 0.5, winter: 1, spring: 0.7 }, elev: { summer: 0.8, autumn: 0.7, winter: 0.55, spring: 0.6 },
    w: { veg: 1.4, slope: 1.5, edge: 0.3, water: 0, disturb: 0.8, warm: 1.4, elev: 1.2, slip: 0.4, tpi: 0.6, cliff: 1.5, shelter: 1 },
    schedule: deerSchedule(0.25),
    doing: { summer: 'High on alpine grasslands and bluffs; feeding early and late, resting on ledges midday.', autumn: 'Bulls start joining nannies on bluff systems.', winter: 'Rut late May–July. Bulls with nannies on sunny bluff faces and snow-tussock below them.', spring: 'Fresh growth on sunny faces lower down.', rut: 'Bulls are with nannies and less cautious; prime winter coats May–August.' },
    diet: 'Alpine grasses, snow tussock, herbs and subalpine shrubs.', waterTxt: 'Not a limiting factor in the alps.',
    signs: ['Groups of nannies and kids on bluff faces (bulls nearby in the rut)', 'Pellet piles on ledges and under overhangs', 'Worn trails across scree and bluffs'],
    tips: ['Glass sunny bluff faces at first light from the opposite side of the valley', 'They watch downhill; getting above them helps', 'Alpine terrain kills. Plan for weather and avalanche risk.']
  },
  chamois: {
    name: 'Chamois', rut: { from: [5, 5], to: [6, 15], label: 'the rut' },
    veg: { feed: { open: 1, scatter: 0.8, scrub: 0.6, native: 0.35, exotic: 0, swamp: 0.2, rock: 0.5, ice: 0.1, water: 0, sand: 0 }, bed: { open: 0.5, scatter: 0.7, scrub: 0.7, native: 0.5, exotic: 0, swamp: 0, rock: 0.9, ice: 0.2, water: 0, sand: 0 } },
    slope: { feed: [10, 20, 45, 60], bed: [20, 30, 55, 70] }, edge: { feed: 300, bed: 300 }, water: 1500, disturb: 600, tpi: { feed: 0.4, bed: 0.8 },
    warm: { summer: -0.3, autumn: 0.4, winter: 0.9, spring: 0.6 }, elev: { summer: 0.85, autumn: 0.7, winter: 0.55, spring: 0.6 },
    w: { veg: 1.3, slope: 1.3, edge: 0.3, water: 0, disturb: 0.8, warm: 1.1, elev: 1.2, slip: 0.6, tpi: 1, cliff: 1.3, shelter: 1 },
    schedule: { summer: { dawn: 1, day: 0.2, dusk: 1, night: 0.2 }, autumn: { dawn: 0.8, day: 0.4, dusk: 0.8, night: 0.2 }, winter: { dawn: 0.5, day: 0.8, dusk: 0.5, night: 0.2 }, spring: { dawn: 0.9, day: 0.4, dusk: 0.9, night: 0.2 } },
    doing: {
      summer: 'Feed for 3–4 hours from dawn and 3–4 hours before dusk, resting midday (DOC). Bucks often alone high in alpine basin headwaters (DOC).',
      autumn: 'Lookout points, spurs, open headwaters and small outcrops (DOC).', winter: 'Feeding concentrated mid-morning and mid-afternoon (DOC). Lower, especially on the West Coast.',
      spring: 'Open headwaters and slips with new growth.', rut: 'Mating starts early–mid May and peaks late May–early June; bucks are preoccupied (DOC).'
    },
    diet: 'Alpine grasses, herbs and shrubs.', waterTxt: 'Not a limiting factor.',
    signs: ['The dark face band against a pale face gives them away when glassing (DOC)', 'Animals sitting on spurs and outcrops looking downhill', 'Pellets and tracks on scree and snow'],
    tips: ['They watch downhill and rarely look up. Approach from above (DOC)', 'They often avoid areas where tahr are feeding (DOC)', 'West Coast: check slips, creek beds and rocky outcrops lower down (DOC)']
  }
};
window.BEHAVIOUR_THERMALS = THERMALS;
})();
