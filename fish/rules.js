/* Fish Access NZ: rules, zones, spots and ramps for the Mana–Kāpiti region.
   Rules checked 28 November 2026 against:
   - Fisheries (Recreational Management Controls) Notice No.1 2026 (in force 1 April 2026)
   - MPI Central area fishing rules page (reviewed 18 Nov 2026; tarakihi limit 10 from 1 Nov 2026)
   - Fisheries (Amateur Fishing) Regulations 2013, regs 88, 90, 91 and Schedule 15
   Rules change. The app always points people to MPI's NZ Fishing Rules app as the legal source. */
window.FISH = {
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
      text: 'No fishing, shellfish, seaweed or other aquatic life may be taken except by hand-held line (Fisheries (Amateur Fishing) Regulations 2013, reg 91). No diving or gathering.',
      // Seaward line from Schedule 15: coast east of Wairaka Point → rock to the north → coast to the north-east.
      // The landward side is closed over land, so the shape is only meaningful on the water.
      coords: [[174.871, -41.03067], [174.871, -41.028], [174.916, -41.01567], [174.925, -41.022], [174.9, -41.04], [174.871, -41.04], [174.871, -41.03067]]
    }
  ],
  setnet: 'No set netting within 4 nautical miles of the coast from Hawera to Wellington, including all of Porirua Harbour and Pāuatahanui Inlet (regs 88 and 90; protects Hector’s and Māui dolphins).',

  // Hand-picked fishing spots from published reports and guides. Positions are indicative, not GPS marks.
  spots: [
    { n: 'Mana Island – north end', p: [174.784, -41.071], sp: ['Snapper', 'Kahawai', 'Tarakihi'], when: 'Snapper Dec–Apr', how: 'Burley on the drift or at anchor near the foul. A reliable summer snapper spot in light westerlies.', src: 'fishing.net.nz reports' },
    { n: 'Mana Island – eastern foul', p: [174.7955, -41.0875], sp: ['Snapper', 'Gurnard', 'Tarakihi', 'Kingfish'], when: 'Summer–autumn', how: 'Drift soft-baits along the edge of the foul on the eastern side.', src: 'Local fishing guides' },
    { n: 'Mana Island – southern point', p: [174.7825, -41.0985], sp: ['Kingfish', 'Kahawai', 'Snapper'], when: 'Kingfish Jan–Apr when the water is warm', how: 'Slow-troll live baits off the southern point towards Plimmerton. Strong tidal flow.', src: 'Local fishing guides' },
    { n: 'Plimmerton foul / quarry', p: [174.845, -41.07], sp: ['Snapper', 'John dory', 'Gurnard', 'Blue cod', 'Kahawai'], when: 'Snapper Dec–Apr', how: 'Big snapper have come from here. Fish the edge of the foul with fresh bait on a running rig.', src: 'fishing.net.nz reports' },
    { n: 'Deep water west of Mana (60–100 m)', p: [174.755, -41.085], sp: ['Hāpuku', 'Bass', 'Tarakihi', 'Trevally', 'Blue cod'], when: 'Year-round on calm days', how: 'Groper and big tarakihi on the edge of the foul in 80–100 m. Use the depth contours to find the edges.', src: 'fishing.net.nz reports' },
    { n: 'Kāpiti Island – south end', p: [174.907, -40.896], sp: ['Kingfish', 'Tarakihi', 'Blue cod', 'Kahawai'], when: 'Kingfish late summer', how: 'Stay outside the marine reserve: check the red boundary before you drop.', src: 'fishing.net.nz reports' },
    { n: 'Kāpiti Island – north end (Boulder Bank)', p: [174.905, -40.808], sp: ['Kingfish', 'Tarakihi', 'Blue cod', 'Red cod'], when: 'Kingfish when warm water arrives', how: 'Work the 20–50 m edges for blue cod and tarakihi. Many undersized cod: use bigger hooks.', src: 'fishing.net.nz reports' },
    { n: 'Rauoterangi Channel – southern end', p: [174.955, -40.905], sp: ['Snapper', 'Gurnard', 'Kahawai'], when: 'Snapper Dec–Mar', how: 'Look for schooling sign on the sounder. Much of the channel to the north is marine reserve.', src: 'fishing.net.nz reports' },
    { n: 'Paraparaumu / Raumati Beach', p: [174.972, -40.915], sp: ['Kahawai', 'Gurnard', 'Snapper', 'Rig'], when: 'Summer evenings', how: 'Surfcasting on the incoming tide. Beach north of Kāpiti Road borders the marine reserve.', src: 'Kāpiti fishing guides', shore: true },
    { n: 'Paekākāriki rocks', p: [174.938, -41.003], sp: ['Kahawai', 'Gurnard', 'Blue moki', 'Snapper'], when: 'Summer', how: 'Rock fishing south of the village. Watch the swell.', src: 'Kāpiti fishing guides', shore: true },
    { n: 'Ōtaki River mouth', p: [175.112, -40.757], sp: ['Kahawai', 'Trevally', 'Yellow-eyed mullet'], when: 'Autumn whitebait runs bring kahawai', how: 'Spin or cast baits into the river current on the outgoing tide.', src: 'Kāpiti fishing guides', shore: true },
    { n: 'Paremata bridges / harbour entrance', p: [174.8685, -41.0985], sp: ['Kahawai', 'Trevally', 'Snapper', 'Flounder'], when: 'Tide changes', how: 'Strong current: fish the slack. No set nets anywhere in the harbour.', src: 'Local reports', shore: true },
    { n: 'Titahi Bay', p: [174.8285, -41.1045], sp: ['Kahawai', 'Gurnard', 'Snapper', 'Blue cod'], when: 'Summer', how: 'Shore fishing off the rocks at either end; boats launch off the beach. Blue cod limit changes at Titahi Bay.', src: 'Local reports', shore: true },
    { n: 'Mākara coast', p: [174.705, -41.215], sp: ['Snapper', 'Blue cod', 'Blue moki', 'Butterfish'], when: 'Big snapper in summer', how: 'Kayak and small-boat spot in calm weather. The Cook Strait cable zone starts further south: no fishing or anchoring there.', src: 'fishing.net.nz / anglersplanet reports' }
  ],

  // Launch sites (backup list; OpenStreetMap slipways are also shown)
  ramps: [
    { n: 'Mana Cruising Club ramp (Paremata)', p: [174.866, -41.0996], note: 'Inside Porirua Harbour. Check conditions on the harbour-entrance bar before heading out.' },
    { n: 'Plimmerton boat ramp', p: [174.8553, -41.0745], note: 'Exposed to westerly swell.' },
    { n: 'Titahi Bay', p: [174.8334, -41.1024], note: 'Beach launch.' },
    { n: 'Pukerua Bay boat ramp', p: [174.8921, -41.0293], note: 'Small ramp for light trailer boats. Follow the channel through the reef (map at the ramp). Hand-held line only inside the bay.' },
    { n: 'Paraparaumu Beach', p: [174.9781, -40.9179], note: 'Beach launch; Kāpiti Boating Club runs a tractor launch. Check the club for launching rules.' }
  ],

  safety: [
    'Coastguard: VHF channel 16, or dial *500 from a mobile. Emergency: 111.',
    'Log a trip report with Coastguard before you go (Coastguard app or VHF).',
    'Greater Wellington’s navigation bylaw: wear lifejackets on small boats and keep to 5 knots within 200 m of shore. Check gw.govt.nz for the current rules.',
    'Porirua Harbour entrance can break on an ebb tide against a westerly swell. Cross on the flood.',
    'The Rauoterangi Channel and around Mana Island run strong tidal currents. Watch your drift near reserve boundaries.',
    'Cook Strait Cable Protection Zone (Mākara to Oteranga Bay and across the strait): no fishing or anchoring for any vessel. Patrol vessel 027 444 2288. Fines up to $100,000.',
    'Report poaching: 0800 4 POACHER (0800 476 224). Marine reserve offences: 0800 DOC HOT (0800 362 468).'
  ],
  islands: [
    { n: 'Kāpiti Island nature reserve', p: [174.92, -40.85], text: 'Landing only with a DOC permit or an approved operator.' },
    { n: 'Mana Island', p: [174.783, -41.087], text: 'Scientific reserve managed by DOC. Don’t land without DOC permission.' }
  ],
  tideStations: [
    { n: 'Mana Marina', p: [174.8667, -41.1], src: 'ManaMarina', dt: 0, ratio: 1, mslS: 0, mslR: 0 },
    // offsets from Port Taranaki (LINZ secondary ports table)
    { n: 'Paraparaumu Beach', p: [174.983, -40.9], src: 'PortTaranaki', dt: -20, ratio: 0.61, mslS: 0.9, mslR: 1.99, approx: true },
    { n: 'Waikanae River entrance', p: [175.0, -40.867], src: 'PortTaranaki', dt: -2, ratio: 0.61, mslS: 0.9, mslR: 1.99 },
    { n: 'Ōtaki Beach', p: [175.1, -40.733], src: 'PortTaranaki', dt: 11, ratio: 0.61, mslS: 1.3, mslR: 1.99 },
    { n: 'Mākara Beach', p: [174.7, -41.217], src: 'PortTaranaki', dt: -40, ratio: 0.32, mslS: 0.8, mslR: 1.99, approx: true }
  ]
};
