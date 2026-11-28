/* Fish Access NZ: rules, zones, spots and ramps for the Mana–Kāpiti region.
   Rules checked 28 November 2026 against:
   - Fisheries (Recreational Management Controls) Notice No.1 2026 (in force 1 April 2026)
   - MPI Central area fishing rules page (reviewed 18 Nov 2026; tarakihi limit 10 from 1 Nov 2026)
   - Fisheries (Amateur Fishing) Regulations 2013, regs 88, 90, 91 and Schedule 15
   Rules change. The app always points people to MPI's NZ Fishing Rules app as the legal source. */
window.FISH = {
  region: 'Mana · Kāpiti · Wellington',
  checked: '28 November 2026',
  area: 'Central fishery management area',

  // [name, other name, min size, daily limit, note]
  finfish: [
    ['Snapper', 'Tāmure', '27 cm', '10', ''],
    ['Kingfish', 'Haku', '75 cm', '3', ''],
    ['Tarakihi', '', '25 cm', '10', 'New limit from 1 Nov 2026'],
    ['Blue cod', 'Rāwaru', '33 cm', 'BLUECOD', 'Land whole or gutted. 2-day accumulation limit on multi-day trips'],
    ['Hāpuku / bass', 'Groper', '–', '2', 'Accumulation limit 3'],
    ['Bluenose', '', '–', '5', ''],
    ['Kahawai', '', '–', 'within 20', ''],
    ['Trevally', 'Araara', '25 cm', 'within 20', ''],
    ['Red gurnard', 'Kumukumu', '25 cm', 'within 20', ''],
    ['Red cod', '', '25 cm', 'within 20', ''],
    ['Blue moki', '', '40 cm', 'within 20', ''],
    ['Butterfish', 'Greenbone', '35 cm', 'within 20', ''],
    ['Trumpeter', '', '35 cm', 'within 20', ''],
    ['Sand flounder', '', '23 cm', 'within 20', ''],
    ['Other flatfish', '', '25 cm', 'within 20', ''],
    ['John dory', '', '–', 'within 20', ''],
    ['Baitfish (jack mackerel, yellow-eyed mullet, piper etc.)', '', '–', '50', 'Separate from the 20 finfish']
  ],
  combined: 'Combined limit: 20 finfish per person per day (species limits above count towards it). Baitfish and eels are separate.',
  bluecod: {
    fma8: { limit: '2', label: 'Taranaki to Titahi Bay (FMA 8 Central Egmont): 2 a day' },
    fma2: { limit: 'check', label: 'South of Titahi Bay (FMA 2 Central East): check the NZ Fishing Rules app' }
  },
  shellfish: [
    ['Pāua', '125 mm shell', '5', 'Central area limit. Yellowfoot pāua 80 mm'],
    ['Rock lobster (crayfish)', 'Tail width: male 54 mm, female 60 mm', '6', 'Packhorse no more than 3 of the 6. Return berried (egg-carrying) and soft-shelled lobsters'],
    ['Kina', '–', '50', ''],
    ['Mussels', '–', '50', ''],
    ['Cockles', '–', '150', ''],
    ['Pipi', '–', '150', ''],
    ['Tuatua', '–', '150', ''],
    ['Scallops', '100 mm', '20', ''],
    ['Other shellfish', '–', '50', 'Combined']
  ],

  // Zones drawn from legal descriptions (official polygons for reserves and the cable zone come from data/)
  zones: [
    {
      id: 'pukerua', kind: 'handline', name: 'Pukerua Bay: hand-held line only',
      text: 'No fish, shellfish (including crayfish and pāua), seaweed or other aquatic life may be taken except by hand-held line (Fisheries (Amateur Fishing) Regulations 2013, reg 91). No diving or gathering.',
      // Seaward line from Schedule 15: coast east of Wairaka Point → rock to the north → coast to the north-east.
      // The landward side is closed over land, so the shape is only meaningful on the water.
      coords: [[174.871, -41.03067], [174.871, -41.028], [174.916, -41.01567], [174.925, -41.022], [174.9, -41.04], [174.871, -41.04], [174.871, -41.03067]]
    }
  ],
  crayfish: [
    'Daily limit 6 per person (no more than 3 packhorse). Central area: no extra crayfish limit.',
    'Minimum tail width: male 54 mm, female 60 mm (packhorse: male 84 mm, female 90 mm). If you’re unsure of the sex, use the female size.',
    'Measure in a straight line between the tips of the two big spines on the second tail segment. Measure quickly: crays go blind in sunlight.',
    'Return straight away: undersized, females carrying eggs (in berry), soft-shelled, and any that can’t be measured.',
    'Take by hand or with a crayfish loop (lasso) only. Never use a spear or anything that could puncture the shell.',
    'Pots: escape gaps required, your surname and initials on the pot and buoy, and never leave a baited pot unattended for more than 24 hours. Limits on how many pots each person and vessel may use apply: check the NZ Fishing Rules app.',
    'No crayfish from Kāpiti Marine Reserve, Pukerua Bay (hand-held line only) or the cable protection zone.'
  ],
  setnet: 'No set netting within 4 nautical miles of the coast from Hawera to Wellington, including all of Porirua Harbour and Pāuatahanui Inlet (regs 88 and 90; protects Hector’s and Māui dolphins).',

  // Hand-picked fishing spots from published reports and guides. Positions are indicative, not GPS marks.
  spots: [
    { n: 'Mana Island – north end', shelter: ['S', 'SE', 'E'], p: [174.784, -41.071], sp: ['Snapper', 'Kahawai', 'Tarakihi'], when: 'Snapper Dec–Apr', how: 'Burley on the drift or at anchor near the foul. A reliable summer snapper spot in light westerlies.', src: 'fishing.net.nz reports' },
    { n: 'Mana Island – eastern foul', shelter: ['W', 'NW', 'SW'], p: [174.7955, -41.0875], sp: ['Snapper', 'Gurnard', 'Tarakihi', 'Kingfish'], when: 'Summer–autumn', how: 'Drift soft-baits along the edge of the foul on the eastern side.', src: 'Local fishing guides' },
    { n: 'Mana Island – southern point', shelter: ['N', 'NE'], current: true, p: [174.7825, -41.0985], sp: ['Kingfish', 'Kahawai', 'Snapper'], when: 'Kingfish Jan–Apr when the water is warm', how: 'Slow-troll live baits off the southern point towards Plimmerton. Strong tidal flow.', src: 'Local fishing guides' },
    { n: 'Plimmerton foul / quarry', shelter: ['E', 'NE', 'SE'], p: [174.845, -41.07], sp: ['Snapper', 'John dory', 'Gurnard', 'Blue cod', 'Kahawai'], when: 'Snapper Dec–Apr', how: 'Big snapper have come from here. Fish the edge of the foul with fresh bait on a running rig.', src: 'fishing.net.nz reports' },
    { n: 'Deep water west of Mana (60–100 m)', shelter: [], p: [174.755, -41.085], sp: ['Hāpuku', 'Tarakihi', 'Trevally', 'Blue cod'], when: 'Year-round on calm days', how: 'Groper and big tarakihi on the edge of the foul in 80–100 m. Use the depth contours to find the edges.', src: 'fishing.net.nz reports' },
    { n: 'Kāpiti Island – south end', shelter: ['N', 'NE'], current: true, p: [174.907, -40.896], sp: ['Kingfish', 'Tarakihi', 'Blue cod', 'Kahawai', 'Crayfish'], when: 'Kingfish late summer; pots on the foul', how: 'Stay outside the marine reserve: check the red boundary before you drop.', src: 'fishing.net.nz reports' },
    { n: 'Kāpiti Island – north end (Boulder Bank)', shelter: ['S', 'SE'], p: [174.905, -40.808], sp: ['Kingfish', 'Tarakihi', 'Blue cod', 'Red cod'], when: 'Kingfish when warm water arrives', how: 'Work the 20–50 m edges for blue cod and tarakihi. Many undersized cod: use bigger hooks.', src: 'fishing.net.nz reports' },
    { n: 'Rauoterangi Channel – southern end', shelter: ['W', 'NW'], current: true, p: [174.955, -40.905], sp: ['Snapper', 'Gurnard', 'Kahawai'], when: 'Snapper Dec–Mar', how: 'Look for schooling sign on the sounder. Much of the channel to the north is marine reserve.', src: 'fishing.net.nz reports' },
    { n: 'Paraparaumu / Raumati Beach', shelter: ['E', 'NE', 'SE'], p: [174.972, -40.915], sp: ['Kahawai', 'Gurnard', 'Snapper', 'Rig'], when: 'Summer evenings', how: 'Surfcasting on the incoming tide. Beach north of Kāpiti Road borders the marine reserve.', src: 'Kāpiti fishing guides', shore: true },
    { n: 'Paekākāriki rocks', shelter: ['E', 'NE', 'SE'], p: [174.938, -41.003], sp: ['Kahawai', 'Gurnard', 'Blue moki', 'Snapper'], when: 'Summer', how: 'Rock fishing south of the village. Watch the swell.', src: 'Kāpiti fishing guides', shore: true },
    { n: 'Ōtaki River mouth', shelter: ['E', 'NE', 'SE'], current: true, p: [175.112, -40.757], sp: ['Kahawai', 'Trevally', 'Yellow-eyed mullet'], when: 'Autumn whitebait runs bring kahawai', how: 'Spin or cast baits into the river current on the outgoing tide.', src: 'Kāpiti fishing guides', shore: true },
    { n: 'Paremata bridges / harbour entrance', shelter: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], current: true, p: [174.8685, -41.0985], sp: ['Kahawai', 'Trevally', 'Snapper', 'Flounder'], when: 'Tide changes', how: 'Strong current: fish the slack. No set nets anywhere in the harbour.', src: 'Local reports', shore: true },
    { n: 'Titahi Bay', shelter: ['E', 'NE', 'SE'], p: [174.8285, -41.1045], sp: ['Kahawai', 'Gurnard', 'Snapper', 'Blue cod'], when: 'Summer', how: 'Shore fishing off the rocks at either end; boats launch off the beach. Blue cod limit changes at Titahi Bay.', src: 'Local reports', shore: true },
    { n: 'Mākara coast', shelter: ['N', 'NE', 'E'], p: [174.705, -41.215], sp: ['Snapper', 'Blue cod', 'Blue moki', 'Butterfish', 'Crayfish'], when: 'Big snapper in summer; crays year-round', how: 'Kayak and small-boat spot in calm weather. The Cook Strait cable zone starts further south: no fishing or anchoring there.', src: 'fishing.net.nz / anglersplanet reports' },
    { n: 'Mana Island – western reef', shelter: ['E', 'NE', 'SE'], dive: true, p: [174.774, -41.083], sp: ['Crayfish', 'Blue moki', 'Butterfish', 'Blue cod'], when: 'Calm days with easterly or no swell', how: 'Kelp-covered reef in 3–15 m. Dive or set pots along the edge. Don’t land on the island: it’s a DOC scientific reserve.', src: 'Local dive reports' },
    { n: 'Plimmerton reef', shelter: ['E', 'NE', 'SE'], dive: true, shore: true, p: [174.851, -41.077], sp: ['Crayfish', 'Butterfish', 'Blue moki'], when: 'Calm days, good visibility', how: 'Shore dive from the rocks south of the boat ramp. Crays hide in ledges in 3–10 m. Visibility drops for days after heavy rain.', src: 'Local dive reports' },
    { n: 'Titahi Bay – southern rocks', shelter: ['E', 'NE', 'SE', 'N'], dive: true, shore: true, p: [174.8235, -41.1065], sp: ['Crayfish', 'Butterfish', 'Blue moki', 'Kahawai'], when: 'Calm days, good visibility', how: 'Shore dive or snorkel off the rocks at the southern end of the bay in 3–10 m.', src: 'Local dive reports' },
    // Wellington Harbour and south coast (launch from Seaview, Lowry Bay or Eastbourne)
    { n: 'Mākaro / Ward Island', area: 'harbour', shelter: ['E', 'NE'], harbour: true, p: [174.8795, -41.2805], sp: ['Kingfish', 'Snapper', 'Trevally', 'Gurnard', 'Kahawai'], when: 'Summer to autumn', how: 'Start around the leading light. Trevally south of the island, 100–200 m from the southern beacon: berley is a must. The main shipping channel runs west of the island, so keep out of it and watch for ships.', src: 'fishing.net.nz and Pete Lamb harbour reports' },
    { n: 'Eastbourne–Ward Island bank', area: 'harbour', shelter: ['E', 'NE', 'SE'], harbour: true, p: [174.889, -41.288], sp: ['Snapper', 'Gurnard', 'Trevally'], when: 'Snapper Oct–May', how: 'Fish the sand with a running rig and berley.', src: 'fishing.net.nz reports' },
    { n: 'Matiu / Somes Island – southern end', area: 'harbour', shelter: ['N', 'NE'], harbour: true, p: [174.8655, -41.2625], sp: ['Kahawai', 'Snapper', 'Gurnard'], when: 'Summer', how: 'Kahawai work the tide lines around the island. Matiu is a DOC reserve: don’t land without going through DOC.', src: 'fishing.net.nz reports' },
    { n: 'Point Halswell', area: 'harbour', shelter: ['W', 'SW', 'NW'], harbour: true, p: [174.8305, -41.2815], sp: ['Tarakihi', 'Snapper', 'Kingfish', 'Trevally', 'Blue cod', 'Kahawai'], when: 'Year-round; kingfish in summer', how: 'Fish 15–20 m off the point. Kingfish on live baits or trolled lures.', src: 'Pete Lamb harbour guide' },
    { n: 'Point Howard wharf', area: 'harbour', shelter: ['E', 'NE', 'N'], harbour: true, shore: true, p: [174.8935, -41.2525], sp: ['Kingfish', 'Kahawai', 'Snapper'], when: 'Summer', how: 'Live baits or lures for kingfish. Close to Seaview.', src: 'Pete Lamb harbour guide' },
    { n: 'Barrett Reef & harbour entrance', area: 'harbour', shelter: [], current: true, p: [174.8455, -41.333], sp: ['Kingfish', 'Kahawai', 'Blue cod'], when: 'Kingfish in summer', how: 'Kingfish around the reef. The entrance gets dangerous when wind runs against the tide or in a southerly swell. Stay well clear of the breaking reef and out of the shipping channel.', src: 'fishing.net.nz reports' },
    { n: 'Pencarrow coast', area: 'harbour', shelter: ['E', 'NE', 'N'], p: [174.852, -41.372], sp: ['Kingfish', 'Kahawai', 'Blue moki', 'Crayfish'], when: 'Summer', how: 'Rocky coast outside the eastern head. Exposed to southerly swell.', src: 'fishing.net.nz reports' },
    { n: 'Airport reef (south coast)', area: 'south', shelter: ['N', 'NE', 'NW'], p: [174.806, -41.358], sp: ['Snapper', 'Tarakihi', 'Blue cod'], when: 'Snapper in summer; reef fish when the swell is low', how: 'Ledger rigs with squid for tarakihi and cod. Taputeranga Marine Reserve is just to the west: check the red boundary.', src: 'fishing.net.nz and Angler’s Planet reports' },
    { n: 'East of Sinclair Head (35–45 m)', area: 'south', shelter: ['N', 'NE', 'NW'], p: [174.722, -41.375], sp: ['Snapper', 'Tarakihi', 'Blue cod'], when: 'Snapper in summer', how: 'Snapper on the 35–45 m line. A long run from the harbour: only in settled weather. The cable protection zone is further west.', src: 'fishing.net.nz reports' }
  ],

  // Seasonal and habitat model for the planner: month weights Jan–Dec (1 = peak), typical depth range (m),
  // and whether night fishing works. General knowledge for the lower North Island; a guide, not a promise.
  model: {
    'Snapper':            { m: [1, 1, 1, .8, .4, .2, .1, .1, .2, .4, .7, .9], d: [5, 50], night: true },
    'Kingfish':           { m: [.9, 1, 1, .8, .4, .1, 0, 0, 0, .1, .3, .6], d: [10, 60] },
    'Tarakihi':           { m: [.9, .9, .9, .9, .9, .9, .9, .9, .9, .9, .9, .9], d: [20, 150] },
    'Blue cod':           { m: [.8, .8, .9, .9, 1, 1, 1, 1, .9, .9, .8, .8], d: [10, 80] },
    'Hāpuku':             { m: [.8, .8, .8, .8, .9, .9, .9, .9, .8, .8, .8, .8], d: [80, 300] },
    'Kahawai':            { m: [1, 1, 1, .9, .7, .5, .4, .4, .5, .7, .9, 1], d: [0, 30] },
    'Gurnard':            { m: [.9, .9, .8, .6, .5, .4, .4, .5, .7, .9, 1, 1], d: [3, 40], night: true },
    'Trevally':           { m: [1, 1, .9, .7, .5, .3, .3, .3, .4, .6, .8, 1], d: [3, 40] },
    'John dory':          { m: [1, 1, .8, .6, .4, .3, .3, .3, .4, .6, .8, 1], d: [5, 50] },
    'Blue moki':          { m: [.6, .6, .7, .8, 1, 1, 1, 1, .9, .8, .7, .6], d: [3, 40] },
    'Butterfish':         { m: [.7, .7, .7, .7, .7, .7, .7, .7, .7, .7, .7, .7], d: [0, 15] },
    'Red cod':            { m: [.5, .6, .8, 1, 1, .9, .8, .6, .5, .5, .5, .5], d: [10, 100], night: true },
    'Flounder':           { m: [.7, .7, .7, .7, .7, .7, .7, .7, .7, .7, .7, .7], d: [0, 5], night: true },
    'Rig':                { m: [1, 1, .8, .5, .3, .2, .2, .3, .5, .8, 1, 1], d: [2, 30], night: true },
    'Crayfish':           { m: [.9, .9, 1, 1, .9, .8, .7, .7, .7, .8, .8, .9], d: [2, 30], night: true, cray: true },
    'Yellow-eyed mullet': { m: [.8, .8, .8, .8, .8, .8, .8, .8, .8, .8, .8, .8], d: [0, 5] }
  },

  // Launch sites (backup list; OpenStreetMap slipways are also shown)
  ramps: [
    { n: 'Mana Cruising Club ramp (Paremata)', p: [174.866, -41.0996], note: 'Inside Porirua Harbour. Check conditions on the harbour-entrance bar before heading out.' },
    { n: 'Plimmerton boat ramp', p: [174.8553, -41.0745], note: 'Exposed to westerly swell.' },
    { n: 'Titahi Bay', shelter: ['E', 'NE', 'SE'], p: [174.8334, -41.1024], note: 'Beach launch.' },
    { n: 'Pukerua Bay boat ramp', p: [174.8921, -41.0293], note: 'Small ramp for light trailer boats. Follow the channel through the reef (map at the ramp). Hand-held line only inside the bay.' },
    { n: 'Paraparaumu Beach', p: [174.9781, -40.9179], note: 'Beach launch; Kāpiti Boating Club runs a tractor launch. Check the club for launching rules.' },
    { n: 'Seaview Marina', p: [174.902, -41.251], guide: 'seaview', approx: true, note: 'Four-lane all-tide ramp behind a breakwater. Open 24/7. Pay at the gate by card or with an annual pass.' },
    { n: 'Lowry Bay ramp', p: [174.9135, -41.2595], approx: true, note: 'Public ramp on Marine Drive (Greater Wellington). More exposed than Seaview.' },
    { n: 'Eastbourne boat ramp', p: [174.9013, -41.286], note: 'Public ramp at Eastbourne, close to Ward Island.' }
  ],

  // Launch guides (shown on the ramp's card and from the menu)
  guides: {
    seaview: {
      title: 'Launching from Seaview',
      ramp: [
        'Four-lane concrete ramp usable at all tides, behind a solid breakwater, with three jetties and floating pontoons for loading.',
        'Open 24/7. The ramp gate takes a credit or debit card, or buy an annual pass from the marina office (04 568 3736).',
        'About 250 trailer parks. Public toilets at the corner of Port Road and Eastern Bays Marine Drive. Diesel at the fuel dock.',
        'Rubbish bins by the ramp take boat rubbish only: no fish waste.'
      ],
      out: [
        'Tankers use the Seaview and Burnham wharves next to the marina: keep at least 200 m from any tanker.',
        'Give way to any ship over 500 tonnes, pass astern of ships and keep out of the shipping channels. Ships can’t see small boats within about 250 m of their bow. Five short blasts means you’re in the way.',
        '5 knots within 200 m of the shore, a dive flag or a dive boat, and within 50 m of other vessels or swimmers.',
        'Everyone on a boat under 6 m must wear a lifejacket while underway.',
        'Going out through the heads at night or in poor visibility: call Wellington Harbour Radio (Beacon Hill) on VHF 14 first, or phone 04 388 1911.',
        'Boats over 6 m between Ward Island and the entrance must carry chart NZ4633 or an electronic equivalent.'
      ],
      radio: [
        'VHF 16: distress and calling. VHF 14: Beacon Hill (shipping, harbour). VHF 03: Coastguard, Wellington Harbour. VHF 61: Coastguard, Cook Strait. VHF 20: weather nowcasts.'
      ],
      fishing: [
        'The harbour is south of Titahi Bay, so it’s fishery area 2 (Central East) for blue cod: check the limit in the NZ Fishing Rules app. All other Central limits apply.',
        'Taputeranga Marine Reserve (Island Bay to Ōwhiro Bay) on the south coast is no-take. The Cook Strait cable zone starts west of Sinclair Head.',
        'Before setting a net in the harbour, check the NZ Fishing Rules app: netting is restricted in parts of the harbour.',
        'Avoid gathering shellfish in the inner harbour, especially after rain, and check MPI’s biotoxin alerts.'
      ],
      trips: [
        'Straight-line distances from the ramp. Inside the harbour (sheltered in most winds): Point Howard 1 km, Matiu/Somes Island 3 km, Ward Island 4 km, Point Halswell 7 km.',
        'Outside the heads (further by water): Barrett Reef 10 km, Pencarrow 12 km, Airport reef 14 km, Sinclair Head 20 km.',
        'The entrance is the hard part. A southerly swell or wind against the tide can make it dangerous when the harbour is calm.'
      ]
    }
  },
  safety: [
    'Coastguard: VHF channel 16, or dial *500 from a mobile. Emergency: 111.',
    'Log a trip report with Coastguard before you go (Coastguard app or VHF).',
    'Greater Wellington’s navigation bylaw: wear lifejackets on small boats and keep to 5 knots within 200 m of shore. Check gw.govt.nz for the current rules.',
    'Porirua Harbour entrance can break on an ebb tide against a westerly swell. Cross on the flood.',
    'The Rauoterangi Channel and around Mana Island run strong tidal currents. Watch your drift near reserve boundaries.',
    'Cook Strait Cable Protection Zone (Mākara to Oteranga Bay and across the strait): no fishing or anchoring for any vessel. Patrol vessel 027 444 2288. Fines up to $100,000.',
    'Wellington Harbour: Beacon Hill (Wellington Harbour Radio) VHF 14 or 04 388 1911. Coastguard VHF 03 in the harbour, 61 in Cook Strait.',
    'Report poaching: 0800 4 POACHER (0800 476 224). Marine reserve offences: 0800 DOC HOT (0800 362 468).'
  ],
  islands: [
    { n: 'Kāpiti Island nature reserve', p: [174.92, -40.85], text: 'Landing only with a DOC permit or an approved operator.' },
    { n: 'Mana Island', p: [174.783, -41.087], text: 'Scientific reserve managed by DOC. Don’t land without DOC permission.' }
  ],
  tideStations: [
    { n: 'Mana Marina', p: [174.8667, -41.1], src: 'ManaMarina', dt: 0, ratio: 1, mslS: 0, mslR: 0 },
    { n: 'Wellington', p: [174.7833, -41.2833], src: 'Wellington', dt: 0, ratio: 1, mslS: 0, mslR: 0 },
    // offsets from Port Taranaki (LINZ secondary ports table)
    { n: 'Paraparaumu Beach', p: [174.983, -40.9], src: 'PortTaranaki', dt: -20, ratio: 0.61, mslS: 0.9, mslR: 1.99, approx: true },
    { n: 'Waikanae River entrance', p: [175.0, -40.867], src: 'PortTaranaki', dt: -2, ratio: 0.61, mslS: 0.9, mslR: 1.99 },
    { n: 'Ōtaki Beach', p: [175.1, -40.733], src: 'PortTaranaki', dt: 11, ratio: 0.61, mslS: 1.3, mslR: 1.99 },
    { n: 'Mākara Beach', p: [174.7, -41.217], src: 'PortTaranaki', dt: -40, ratio: 0.32, mslS: 0.8, mslR: 1.99, approx: true }
  ]
};
