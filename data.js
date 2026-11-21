/* Hunt Access NZ — reference data.
   Places that offer hunting or hunting access outside DOC's open permit system.
   Researched November 2026. Pins are APPROXIMATE (general area only) — always confirm
   boundaries, prices and conditions with the provider before you go. */
window.ACCESS_DIRECTORY = [
  {
    id: 'makowhai', name: 'Makowhai Station', type: 'Private station',
    region: 'South Taranaki / Whanganui', pins: [[-39.58, 174.82]],
    species: ['pig', 'deer', 'goat'], deerTypes: 'Fallow deer reported',
    access: 'Paid hunting with on-site accommodation (Opaku Lodge, Shearers’ Quarters). Book ahead, especially for the roar.',
    detail: '~8,900 ha (22,000 acres) of hill country in the upper Waitōtara Valley: farmland, native bush and regenerating mānuka, ~200 km of tracks. 570 Taumatatahi Rd, Waitōtara Valley, Waverley.',
    contact: '06 346 5714', url: 'http://makowhaistation.co.nz/',
    dogs: 'Ask when booking', source: 'Station website; NZDA Porirua branch trip report'
  },
  {
    id: 'blueduck', name: 'Blue Duck Station', type: 'Private station',
    region: 'Whakahoro, Ruapehu', pins: [[-39.105, 175.072]],
    species: ['deer', 'pig', 'goat'], deerTypes: 'Red and fallow deer',
    access: 'Guided hunts. First hunt is always guided; repeat lodge guests can hunt unguided by prior arrangement with a valid NZ firearms licence.',
    detail: 'Published prices: guided pig hunt $595 for up to two people; guided goat hunt $175 pp (min. two); small game $120 pp. Borders Whanganui National Park.',
    contact: '07 895 6276', url: 'https://blueduckstation.co.nz/hunting/',
    dogs: 'Guided pig hunts', source: 'Blue Duck Station website'
  },
  {
    id: 'kaingaroa', name: 'Kaingaroa & Rotoehu Forests', type: 'Forestry',
    region: 'Central North Island / Bay of Plenty', pins: [[-38.62, 176.52], [-38.03, 176.55]],
    species: ['deer', 'pig'], deerTypes: 'Red (and sika in the south)',
    access: 'Recreational Forest Access Permit issued online by FIRST Security for Kaingaroa Tipu. Apply annually (15+), complete the online induction quiz.',
    detail: 'Public vehicle access for hunting is generally daylight on weekends and public holidays; restricted during the fire season (1 Oct–30 Apr). Automatic gates at main entrances.',
    contact: 'FIRST Security (online)', url: 'https://www.firstsecurity.co.nz/forestry-permit',
    dogs: 'Allowed under permit conditions', source: 'FIRST Security; CNI Iwi Holdings land access policy'
  },
  {
    id: 'ofo', name: 'OneFortyOne Forests', type: 'Forestry',
    region: 'Nelson / Tasman / Marlborough', pins: [[-41.47, 172.86]],
    species: ['deer', 'pig', 'goat'], deerTypes: 'Check with OFO',
    access: 'Public hunting season (2025 season ran 12 April–26 October). Permit fee $150 (2025). New season details released around April.',
    detail: 'Includes Golden Downs and Rai forests (some land owned by Ngāti Toa, Ngāti Tama and Te Ātiawa). Upland game bird permits go through Fish & Game.',
    contact: 'OneFortyOne NZ, Richmond', url: 'https://onefortyone.com/community/public-information/public-hunting-new-zealand',
    dogs: 'Check permit conditions', source: 'OneFortyOne public hunting page'
  },
  {
    id: 'summit', name: 'Summit Forests', type: 'Forestry',
    region: 'Northland, Gisborne, Whanganui', pins: [[-39.78, 175.22], [-38.55, 177.85], [-35.55, 173.75]],
    species: ['deer', 'pig', 'goat'], deerTypes: 'Varies by forest',
    access: 'Forest access permit online for Northland and Gisborne forests. Whanganui forests: contact Forest Management NZ Ltd.',
    detail: 'Gisborne hunting permits are suspended during the fire season. Access can be withdrawn at short notice for operations or conditions.',
    contact: 'Whanganui: 06 346 6118', url: 'https://summitforests.co.nz/forest-access/',
    dogs: 'Check permit conditions', source: 'Summit Forests website'
  },
  {
    id: 'manulife', name: 'Manulife Forest Management (NZ)', type: 'Forestry',
    region: 'Northland, Auckland, CNI, BoP, Hawke’s Bay', pins: [[-35.66, 173.98]],
    species: ['pig', 'deer', 'goat'], deerTypes: 'Varies by forest',
    access: 'Issues its own hunting permits, typically in the winter months (per DOC’s Mangakahia Forest page). Contact the nearest office.',
    detail: 'Formerly Hancock Forest Management. Offices in Tauranga, Tokoroa, Rotorua and Whangārei. Its land can provide the only access to some DOC blocks (e.g. Mangakahia).',
    contact: 'Tauranga +64 7 571 7920', url: 'https://manulifeim.com/timberland/new-zealand',
    dogs: 'Check permit conditions', source: 'Manulife; DOC Mangakahia Forest page'
  },
  {
    id: 'urewera', name: 'Te Urewera', type: 'Iwi-governed land',
    region: 'East Coast / Bay of Plenty', pins: [[-38.72, 177.05]],
    species: ['deer', 'pig', 'goat'], deerTypes: 'Red deer',
    access: 'Not covered by a DOC permit. Self-issue a 4-month permission for hunting from Te Uru Taumatua (Tūhoe) online. Ground-based, non-commercial hunting only.',
    detail: 'Pig dogs need a separate seasonal permit (1 May to the Friday before Labour Weekend). Some areas have restrictions shown on your permit.',
    contact: 'Te Uru Taumatua (07) 312 9659', url: 'https://www.ngaituhoe.iwi.nz/permission_for_hunting',
    dogs: 'Separate pig-dog permit, seasonal', source: 'Ngāi Tūhoe website'
  },
  {
    id: 'gwrc', name: 'Greater Wellington parks & forests', type: 'Regional council',
    region: 'Wellington', pins: [[-41.03, 175.12], [-41.12, 175.20], [-41.27, 174.93]],
    species: ['deer', 'pig', 'goat'], deerTypes: 'Red and sika (Hutt catchment)',
    access: 'Free permits (generally 12 months) for designated hunting areas such as Akatarawa, Pakuratahi and Kaitoke. East Harbour Northern Forest: deer by annual ballot; pig permits May–Feb.',
    detail: 'Rules vary by park, e.g. hunting hours, no shooting in darkness, firearm types. Read each park’s conditions.',
    contact: 'parks@gw.govt.nz', url: 'https://gw.govt.nz/parks/permit-applications',
    dogs: 'Registered dogs, details lodged with GW', source: 'Greater Wellington website'
  },
  {
    id: 'wharerata', name: 'Wharerata Forest', type: 'Forestry',
    region: 'Gisborne / Wairoa', pins: [[-38.93, 177.70]],
    species: ['pig', 'deer', 'goat'], deerTypes: 'Varies',
    access: 'Police advise a permit from one of the forestry companies or Gisborne District Council is required and must be carried. Juken NZ manages forest blocks here.',
    detail: 'Police have seized firearms from unpermitted hunters here. Confirm which company manages the block you want before you go.',
    contact: 'Forestry company / GDC', url: 'https://www.gdc.govt.nz/',
    dogs: 'Check permit conditions', source: 'NZ Police statement (via NZ Herald)'
  },
  {
    id: 'ernslaw', name: 'Ernslaw One — Blue Mountains', type: 'Forestry',
    region: 'Southland / Otago', pins: [[-45.88, 169.30]],
    species: ['deer', 'pig'], deerTypes: 'Fallow deer',
    access: 'Ernslaw One has its own hunting blocks — contact Ernslaw directly. Many DOC Blue Mountains RHA blocks are reached via Ernslaw forestry roads with gate codes.',
    detail: 'DOC Blue Mountains blocks are balloted monthly Feb–Nov (now moving to DOC’s online system). Walking in via forestry roads needs no gate code.',
    contact: 'Ernslaw One / DOC Invercargill', url: 'https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/where-to-hunt/southland/mainland-southland-hunting/where-to-hunt/blue-mountains-forest-conservation-area/',
    dogs: 'DOC permit needed for dogs', source: 'DOC Blue Mountains pages'
  },
  {
    id: 'matariki', name: 'Matariki Forests', type: 'Forestry',
    region: 'Coromandel / Waikato / Northland', pins: [[-37.05, 175.78]],
    species: ['pig', 'deer', 'goat'], deerTypes: 'Varies',
    access: 'Recreational access is by permit. Fish & Game issues upland game bird permits only; contact Matariki directly for other hunting access.',
    detail: 'Forests include Tairua, Maramarua, Waihou and Kauaeranga. Fish & Game Northland handles some Puhipuhi/Topuni access.',
    contact: 'Matariki Forests', url: 'https://www.matarikiforests.co.nz/',
    dogs: 'Check permit conditions', source: 'Fish & Game; Matariki public summary'
  },
  {
    id: 'ltft', name: 'Lake Taupō & Rotoaira Forests', type: 'Not open to public',
    region: 'Taupō / Tūrangi', pins: [[-38.98, 175.78]],
    species: [], deerTypes: '',
    access: 'Permits are for verified beneficial landowners, descendants and spouses only. Not a general public hunting option.',
    detail: 'Some public roads (e.g. Kiko Road to Kaimanawa Forest Park) cross this land — stay on the road and keep firearms unloaded.',
    contact: 'Lake Taupō Forest Trust, Tūrangi', url: 'https://www.lrft.co.nz/',
    dogs: '—', source: 'Trust access policy'
  },
  {
    id: 'portblakely', name: 'Port Blakely forests', type: 'Not open to public',
    region: 'Canterbury / Otago', pins: [[-43.35, 172.25]],
    species: [], deerTypes: '',
    access: 'Does not issue individual hunting permits. Hunting is managed through local hunting clubs.',
    detail: 'Free access permits exist for walking and biking, not hunting.',
    contact: 'Nearest Port Blakely office', url: 'https://portblakely.com/nz-forestry/public-access',
    dogs: '—', source: 'Port Blakely website'
  }
];

/* DOC animal distribution layers (DOC Open Data, services1.arcgis.com). Presence polygons. */
window.SPECIES = [
  { key: 'red',      label: 'Red deer',        group: 'deer', svc: 'Red_Deer_Distribution_2014',        colour: '#c2410c' },
  { key: 'fallow',   label: 'Fallow deer',     group: 'deer', svc: 'Fallow_Deer_Distribution_2007',     colour: '#b45309' },
  { key: 'sika',     label: 'Sika deer',       group: 'deer', svc: 'Sika_Deer_Distribution_2007',       colour: '#a16207' },
  { key: 'sambar',   label: 'Sambar deer',     group: 'deer', svc: 'Sambar_Deer_Distribution_2007',     colour: '#92400e' },
  { key: 'rusa',     label: 'Rusa deer',       group: 'deer', svc: 'Rusa_Deer_Distribution_2007',       colour: '#78350f' },
  { key: 'whitetail',label: 'Whitetail deer',  group: 'deer', svc: 'White_Tailed_Deer_Distribution_2007', colour: '#9a3412' },
  { key: 'wapiti',   label: 'Wapiti',          group: 'deer', svc: 'Wapiti_Distribution_2007',          colour: '#7c2d12' },
  { key: 'goat',     label: 'Goats',           group: 'goat', svc: 'Feral_Goat_Distribution_2014',      colour: '#4d7c0f' },
  { key: 'pig',      label: 'Pigs',            group: 'pig',  svc: 'Feral_Pig_Distribution_2007',       colour: '#be185d' },
  { key: 'tahr',     label: 'Tahr',            group: 'other',svc: 'Himalayan_Tahr_Distribution_2014',  colour: '#475569' },
  { key: 'chamois',  label: 'Chamois',         group: 'other',svc: 'Chamois_Distribution_2007',         colour: '#334155' }
];
