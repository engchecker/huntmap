/* Hunt Access NZ — rules, seasons and key dates reference (Tools → Rules, seasons & ballots).
   Compiled 22 November 2026 from DOC permit conditions and pesticide guidance, the Arms Act 2026 /
   Firearms Safety and Education NZ, MPI, OSPRI, Herenga ā Nuku and hunting references. Dates and
   rules change: the sheet tells users to confirm with the source before relying on them. */
(() => {
const A = window.HuntMap; if (!A) return;
const { showSheet, actions } = A;
const AS_AT = '22 November 2026';
const L = {
  permit: 'https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/permits-and-licences/hunting-permit/',
  conditions: 'https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/permits-and-licences/permit-conditions/',
  ballots: 'https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/permits-and-licences/',
  pesticide: 'https://www.doc.govt.nz/nature/pests-and-threats/pesticide-summaries/important-and-caution-notes/',
  fse: 'https://www.firearmssafety.govt.nz/',
  ospri: 'https://www.ospri.co.nz/tb-and-pest-control/hunters',
  mpi: 'https://www.mpi.govt.nz/food-safety-home/',
  haNuku: 'https://www.herengaanuku.govt.nz/maps/outdoor-access-maps',
  forests: 'https://www.herengaanuku.govt.nz/types-of-access/forest-permits',
  msc: 'https://www.mountainsafety.org.nz/learn/activities/night'
};
// phone-friendly "table": one entry per row, first cell as the heading, the rest labelled
const table = (head, rows) => `<ul class="list">${rows.map(r => `<li><span class="t">${r[0]}</span>${r.slice(1).map((c, i) => `<br><span class="sub">${head[i + 1]}:</span> ${c}`).join('')}</li>`).join('')}</ul>`;
const sec = (title, body, open = false) => `<details${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
const link = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;

const BALLOTS = [
  ['Molesworth roar (Marlborough)', 'Red deer, 20 blocks', '10 Mar–13 Apr 2027, 7-day blocks', 'Free', 'Closes <b>30 Nov 2026</b>; draw 6 Dec; confirm by 13 Dec; leftovers online'],
  ['Catlins–Maclennan roar (Otago)', 'Red deer & pigs', '20 Mar–20 Apr 2027, 2–3-day blocks', '$11.50', 'Closes <b>30 Nov 2026</b>; draw 4 Dec; confirm by 18 Dec'],
  ['Hooker/Landsborough & Adams tahr (West Coast)', 'Tahr, approved heli operators only', 'Winter helicopter season', '$60 booking', 'Remaining sites online, first come first served, <b>9 am 10 Dec 2026</b>'],
  ['Wānaka roar (Otago)', 'Red deer, 50 blocks', '21 Mar–17 Apr 2027', 'Free', 'Closed 31 Oct; second chance Dec; leftovers Jan 2027'],
  ['Haast roar (South Westland)', 'Red deer, 65 blocks', '21 Mar–17 Apr 2027', '$40', 'Closed; watch the second-chance link'],
  ['Fiordland wapiti', 'Wapiti (Herd of Special Interest)', '1 Mar–30 Apr bugle, 10-day periods', 'Via FWF/DOC', 'Through the Fiordland Wapiti Foundation; specific permit outside the bugle'],
  ['Restricted blocks (online)', 'Whitetail on Rakiura; red deer at Queenstown, Molesworth off-peak', 'Year-round outside ballots', 'Varies', 'Book through DOC’s restricted hunting system']
];
const SEASONS = [
  ['Red deer', 'Roar mid-Mar to late Apr', 'Both islands, coast to tops', '.243+ common'],
  ['Sika', 'Late Mar to early May', 'Kaimanawa & Kaweka (Herd of Special Interest since 15 Jul 2026)', '.243+'],
  ['Fallow', 'Apr–May (bucks croak)', 'Local herds both islands; much on private land', '.243+ preferred'],
  ['Wapiti', 'Mar–Apr bugle (balloted)', 'Fiordland Wapiti Area', '.308+'],
  ['Whitetail', 'May', 'Rakiura/Stewart Island, Lake Wakatipu', '.223+'],
  ['Sambar', 'Mainly Jun–Aug (late May–Dec)', 'Manawatū/Whanganui & BoP, mostly private forestry', '.270/.308/.30-06'],
  ['Rusa', 'Jul–Aug', 'Galatea, Ikawhenua foothills', '.243+, heavier for distance'],
  ['Tahr', 'Late May to mid-Jul; manes May–Aug', 'Central Southern Alps feral range', '.222+ on DOC land'],
  ['Chamois', 'May–Jun; best skins May–Sep', 'South Island high country & West Coast', '.223 <200 m or .243+'],
  ['Pigs, goats', 'Year-round', 'Widespread', '.222+ on DOC land'],
  ['Wallabies', 'Year-round; spring flush, winter sun', 'Hunter Hills/Kirkliston (Bennett’s); Rotorua lakes (dama, parma)', '.222/.243 (DOC)']
];
const POISON = [
  ['Group 0', 'Cyanide, cholecalciferol, phosphorus', 'None', '—'],
  ['Group 1', 'Zinc phosphide, PAPP, sodium nitrite', '1 month', 'Deer/goats/pigs 2 km'],
  ['Group 2', 'Pindone, diphacinone', '2 months', 'Deer/goats/pigs 2 km'],
  ['Group 3', '1080, coumatetralyl', '4 months', 'Deer/goats/pigs 2 km'],
  ['Group 4', 'Brodifacoum and other second-generation anticoagulants', '3 years', 'Deer/goats 2 km; pigs 5 km']
];

function rulesSheet() {
  showSheet(`<h2>Rules, seasons &amp; ballots</h2>
    <p class="sub">Compiled ${AS_AT}. Rules and dates change: confirm with DOC, Firearms Safety and Education NZ or the land manager before you go.</p>
    ${sec('Key dates and ballots', table(['Ballot / booking', 'Animals', 'Hunting period', 'Fee', 'Status'], BALLOTS) + `<p class="sub">${link(L.ballots, 'DOC permits and ballots')}. A ballot gives your party sole hunting rights to a block; trampers can still use it. DOC’s commercial deer-recovery helicopters stand down over Christmas, the roar and Easter.</p>`, true)}
    ${sec('Seasons and ruts by species', table(['Species', 'Rut / peak', 'Where', 'Calibre'], SEASONS) + '<p class="sub">No general closed season: most animals can be hunted year-round. Wapiti and some whitetail blocks have closures and ballots.</p>')}
    ${sec('Which permit do I need?', `<ul class="sub">
      <li><b>DOC open hunting permit:</b> free, online, 12 months, any regions you pick. Covers deer, pigs, goats, chamois, tahr and wallabies on open DOC land. ${link(L.permit, 'Get it')}</li>
      <li><b>Restricted or ballot blocks:</b> a separate DOC permit or ballot (above).</li>
      <li><b>Rabbits and hares on DOC land:</b> a small-game permit, only in some regions. <b>Possums:</b> a possum permit from the local DOC office. The open permit doesn’t cover them.</li>
      <li><b>Dogs:</b> a DOC dog permit where allowed, plus a current kiwi/bird aversion certificate in many areas. Dogs are banned in national parks and wilderness areas.</li>
      <li><b>Te Urewera:</b> permission from Te Uru Taumatua, not DOC. <b>Regional parks:</b> council permits (e.g. Greater Wellington).</li>
      <li><b>Forestry:</b> company permits, often weekends only, closed in high fire danger or during logging. ${link(L.forests, 'Forest permit list')}</li>
      <li><b>Private land:</b> the landowner’s permission. Offer goat, pig, wallaby or rabbit control rather than asking for trophies, and agree up front on stags, dogs and sharing meat.</li></ul>`)}
    ${sec('DOC land: firearms and night rules', `<ul class="sub">
      <li>Centrefire rifles .222 Remington or larger, or bows/crossbows meeting DOC’s energy rules (35 lb minimum draw). No rimfires, .17s, .22 Hornet, air rifles, shotguns for big game, or tracer/incendiary rounds.</li>
      <li>No shooting and no loaded firearm from 30 minutes after sunset to 30 minutes before sunrise. No spotlights, torches, headlights or night-vision for hunting.</li>
      <li>Hand-held thermal monoculars are allowed in daylight (since 1 June 2024) to spot animals, provided nothing can attach to the rifle.</li>
      <li>Don’t shoot near huts, campsites, tracks or road ends, and keep 500 m from Great Walk huts and tracks. Many blocks add their own buffers and dates.</li>
      <li>Night shooting, rimfires and shotguns are for private land with permission only. ${link(L.conditions, 'DOC permit conditions')}</li></ul>`)}
    ${sec('Firearms law and travel', `<ul class="sub">
      <li>Most of the Arms Act 2026 and Arms Regulations 2026 took effect on 23 September 2026. The regulator is now Firearms Safety and Education NZ (FSE), replacing Te Tari Pūreke. ${link(L.fse, 'FSE')}</li>
      <li>Store firearms and ammunition separately and securely. The new rules allow approved storage away from home and cover vehicles, campervans and boats: check FSE guidance before a trip.</li>
      <li><b>Air New Zealand:</b> declare at check-in; unloaded, disabled, in a locked hard case (counts as a checked bag); bolt packed separately; ammunition max 5 kg per licensed passenger, packed separately.</li>
      <li><b>Interislander:</b> foot passengers check firearms and ammunition in separately; in a vehicle, store them separately as the Act requires. Check Bluebridge’s rules before booking.</li>
      <li><b>Visitors:</b> apply online for a visitor licence and import permit at least 4 months ahead, or hunt only under the direct supervision of a NZ licence holder.</li></ul>`)}
    ${sec('Poisons (1080 etc.) and dogs', table(['Group', 'Toxins', 'Caution period', 'Buffer'], POISON) + `<p class="sub">Never take meat from inside an operation or its buffer during the caution period: cooking doesn’t destroy the poison. Rabbits have a 200 m buffer; hares, tahr, wallabies and possums 1 km. DOC’s map doesn’t show private land or hut rodent control, so ask farmers about bait stations.</p>
      <div class="warnbox"><b>Dogs:</b> caution periods are for human food, not dogs. Poisoned carcasses can stay lethal to dogs for 3–6 months or more. Keep dogs out of 1080 blocks. If a dog eats suspected bait: make it vomit (washing-soda crystals or salt on the back of the tongue) and get to a vet. National Poisons Centre <a href="tel:0800764766">0800 764 766</a>.</div><p class="sub">${link(L.pesticide, 'DOC pesticide notes')}</p>`)}
    ${sec('Meat, TB and food safety', `<ul class="sub">
      <li>Recreational game can’t be sold, bartered or traded (fines up to $75,000). Share it with family, your household and your hunting party, or use an MPI-listed homekill processor.</li>
      <li>Cool carcasses quickly (below 7 °C). Don’t keep an animal that acted sick, blind or emaciated.</li>
      <li><b>Bovine TB:</b> wear gloves and cut through the head and neck lymph glands and check the lungs. Yellow or white cheesy pus or gritty lumps: stop, leave the carcass, take photos and a GPS point, and tell OSPRI on <a href="tel:0800482463">0800 482 463</a>. ${link(L.ospri, 'OSPRI')}</li>
      <li>Cook wild liver to 70 °C for 3 minutes (or 75 °C for 30 s). Cook or deep-freeze pork thoroughly. Never feed raw offal or pig heads to dogs.</li></ul>`)}
    ${sec('Report, don’t just hunt', `<ul class="sub">
      <li>Deer in Northland: DOC deer hotline <a href="tel:0800346333">0800 346 333</a>. Deer in southern Coromandel: <a href="tel:0800362468">0800 DOC HOT</a>.</li>
      <li>Goat-free areas such as Mt Taranaki, Raukūmara, Whirinaki, Kaweka and Te Urewera, the Cleddau Valley and pest-free islands: report sightings to DOC.</li>
      <li>Waikato: report dama wallabies to the regional council within five working days; no live wallabies.</li>
      <li>Otago Peninsula and West Harbour: no keeping or moving feral pigs, even in transit.</li></ul>`)}
    ${sec('Legal access through private land', `<p class="sub">Three lasting rights let you pass through to land-locked DOC blocks. All are on the map under Public access and on ${link(L.haNuku, 'Herenga ā Nuku’s maps')}:</p><ul class="sub">
      <li><b>Paper roads</b> (unformed legal roads): the same right to pass as a formed road, even when overgrown or planted in pines.</li>
      <li><b>Marginal strips:</b> usually 20 m along rivers, lakes and the coast.</li>
      <li><b>Public Access Easements</b> across former Crown forest land (Crown Forest Assets Act 1989): they stay when the forest is sold, but can close at night, during harvest or in high fire danger.</li></ul>
      <p class="sub">Passing through isn’t permission to hunt, and you can never shoot across neighbouring farmland.</p>`)}
    ${sec('Safety basics', `<ul class="sub"><li>Identify your target beyond all doubt; never shoot at colour, shape, sound or movement. About 80% of misidentification shootings involve someone in the same party.</li><li>Thermal scopes find animals but can’t identify them: confirm with white light (private land only at night).</li><li>Carry a PLB on your body, never cross a flooded river, and leave your intentions and an overdue time with someone you trust.</li><li>Scrub boots between forests (kauri dieback).</li></ul><p class="sub">${link(L.msc, 'Mountain Safety Council')}</p>`)}`, { tall: true, kind: 'rules' });
}
actions.mRules = () => rulesSheet();
A.rulesSheet = rulesSheet;
})();
