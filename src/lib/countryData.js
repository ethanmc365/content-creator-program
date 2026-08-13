// Capital, population, area and one interesting fact, for every country the map
// can draw.
//
// WHY THIS IS A FILE AND NOT AN API CALL.
//
// The country panel opens on a tap, and it opens a lot. Anything fetched is a
// panel that is empty for the first few hundred milliseconds of every single
// tap, needs a loading state, needs an error state, and needs the CSP widened
// to a third party we would then depend on. None of that buys anything: this
// data changes on the scale of years, and the app already ships a megabyte of
// map geometry without complaint.
//
// SHAPE
//
//   ISO2: [capital, population, areaKm2, fact]
//
// Keyed by ISO 3166-1 alpha-2 rather than by name, because the map, the profile
// country field and the travel list all spell places differently and
// lib/countryFacts already resolves any of them to a code.
//
// ACCURACY, AND HOW IT IS PRESENTED
//
// Populations are the most recent widely published estimates (2023-24) rounded
// to three significant figures, and the UI says "approx" next to them, because
// a number presented to the person is a claim and this one is an estimate that
// drifts every year. Areas are total area including inland water, in square
// kilometres, and are stable. Capitals are the seat of government; where a
// country has more than one, the one it is usually listed under is given with
// the others in the fact.
//
// The facts are chosen to be the thing somebody would actually repeat, not the
// first line of an encyclopedia entry.
export const COUNTRY_DATA = {
  // ---------------------------------------------------------------- Europe
  AL: ['Tirana', 2800000, 28748, 'Nodding your head means no here, and shaking it means yes.'],
  AD: ['Andorra la Vella', 80000, 468, 'Has no army, and its head of state is shared between the French president and a Spanish bishop.'],
  AT: ['Vienna', 9100000, 83879, 'Vienna has been ranked the world’s most liveable city more often than anywhere else.'],
  BY: ['Minsk', 9200000, 207600, 'Around 40 per cent of the country is forest, including one of Europe’s last primeval woodlands.'],
  BE: ['Brussels', 11800000, 30528, 'Invented the modern chip shop, and still has more than 5,000 of them.'],
  BA: ['Sarajevo', 3200000, 51197, 'Sarajevo has a mosque, a synagogue, a Catholic and an Orthodox church within a few hundred metres.'],
  BG: ['Sofia', 6400000, 110879, 'Produces around a third of the world’s rose oil, harvested by hand at dawn.'],
  HR: ['Zagreb', 3900000, 56594, 'The necktie is Croatian: French soldiers copied it from Croatian mercenaries, "cravate".'],
  CY: ['Nicosia', 1300000, 9251, 'The last divided capital city in Europe.'],
  CZ: ['Prague', 10900000, 78867, 'Drinks more beer per person than any other country on earth.'],
  DK: ['Copenhagen', 5900000, 42933, 'More bikes than people in Copenhagen, and a bridge that becomes a tunnel to reach Sweden.'],
  EE: ['Tallinn', 1400000, 45227, 'You can vote, sign contracts and start a company entirely online. Skype was built here.'],
  FI: ['Helsinki', 5600000, 338455, 'Has around 188,000 lakes, and hosts a world championship in carrying your wife.'],
  FR: ['Paris', 68000000, 551695, 'The most visited country on earth, and by law you may still not name a pig Napoleon.'],
  DE: ['Berlin', 84000000, 357588, 'Around 1,500 different beers and 3,000 kinds of bread, most of it regional.'],
  GR: ['Athens', 10400000, 131957, 'Roughly 6,000 islands and islets; about 227 of them are inhabited.'],
  HU: ['Budapest', 9600000, 93028, 'Budapest sits on more than 100 thermal springs and has been a spa city for 2,000 years.'],
  IS: ['Reykjavík', 390000, 103000, 'No mosquitoes at all, and enough geothermal heat that pavements are melted clear in winter.'],
  IE: ['Dublin', 5300000, 70273, 'Halloween began here as Samhain, and there are no wild snakes.'],
  IT: ['Rome', 59000000, 301340, 'Home to more UNESCO World Heritage sites than any other country.'],
  XK: ['Pristina', 1800000, 10887, 'Europe’s youngest country and one of its youngest populations, average age under 30.'],
  LV: ['Riga', 1900000, 64589, 'Riga has the largest collection of art nouveau architecture in the world.'],
  LI: ['Vaduz', 40000, 160, 'Once accidentally invaded by Switzerland, which sent 170 soldiers the wrong way and apologised.'],
  LT: ['Vilnius', 2800000, 65300, 'Has a Hill of Crosses with more than 100,000 crosses left by pilgrims.'],
  LU: ['Luxembourg City', 660000, 2586, 'The first country in the world to make all public transport free.'],
  MT: ['Valletta', 540000, 316, 'One of the most densely populated countries on earth, and the set for much of King’s Landing.'],
  MD: ['Chișinău', 2500000, 33846, 'Home to the world’s largest wine cellar: 200km of tunnels at Mileștii Mici.'],
  MC: ['Monaco', 39000, 2, 'The second smallest country on earth, and you can walk across it in under an hour.'],
  ME: ['Podgorica', 620000, 13812, 'The Bay of Kotor is often called Europe’s southernmost fjord, though it is really a drowned canyon.'],
  NL: ['Amsterdam', 17900000, 41850, 'The government sits in The Hague, not the capital, and the country has more bikes than people.'],
  MK: ['Skopje', 1800000, 25713, 'Lake Ohrid is one of the oldest lakes in the world, around three million years.'],
  NO: ['Oslo', 5500000, 385207, 'The coastline with all its fjords and islands would stretch more than halfway to the moon.'],
  PL: ['Warsaw', 36800000, 312696, 'Warsaw’s old town is a meticulous post-war reconstruction, rebuilt from Canaletto’s paintings.'],
  PT: ['Lisbon', 10600000, 92212, 'The oldest fixed borders in Europe, unchanged since 1139, and half the world’s cork.'],
  RO: ['Bucharest', 19000000, 238397, 'The Palace of the Parliament is the heaviest building on earth.'],
  RU: ['Moscow', 144000000, 17098246, 'Spans eleven time zones. You can leave one end and arrive at the other on the same clock.'],
  SM: ['San Marino', 34000, 61, 'The world’s oldest surviving republic, founded in 301 AD.'],
  RS: ['Belgrade', 6600000, 88361, 'Has produced 18 Roman emperors, more than Italy.'],
  SK: ['Bratislava', 5400000, 49035, 'More castles and châteaux per head than anywhere else in the world.'],
  SI: ['Ljubljana', 2100000, 20273, 'More than half the country is forest, and there is a lake with an island church in the middle of it.'],
  ES: ['Madrid', 48000000, 505990, 'La Tomatina throws 150,000 tomatoes in an hour, and siesta is now rare in cities.'],
  SE: ['Stockholm', 10500000, 450295, 'Recycles so effectively it has imported rubbish to keep its power plants running.'],
  CH: ['Bern', 8800000, 41285, 'By law every resident must have access to a nuclear shelter, and there are enough for everyone.'],
  UA: ['Kyiv', 38000000, 603500, 'Holds a quarter of the world’s black soil, the most fertile there is.'],
  GB: ['London', 68000000, 242495, 'You are never more than 115km from the sea anywhere in the country.'],
  VA: ['Vatican City', 800, 0.49, 'The smallest country in the world, with the highest crime rate per head, almost all pickpocketing of tourists.'],

  // ------------------------------------------------------------------ Asia
  AF: ['Kabul', 42000000, 652230, 'The word "Afghan hound" and the game of buzkashi, played on horseback with a goat carcass, both come from here.'],
  AM: ['Yerevan', 2800000, 29743, 'The first country in the world to adopt Christianity as a state religion, in 301 AD.'],
  AZ: ['Baku', 10200000, 86600, 'Has a hillside of natural gas fires that have burned continuously for thousands of years.'],
  BH: ['Manama', 1500000, 786, 'A tree has survived alone in the desert here for over 400 years with no known water source.'],
  BD: ['Dhaka', 173000000, 147570, 'Home to the world’s largest mangrove forest and its longest natural sea beach.'],
  BT: ['Thimphu', 790000, 38394, 'Measures Gross National Happiness, and is the only carbon negative country on earth.'],
  BN: ['Bandar Seri Begawan', 450000, 5765, 'No income tax, and around 70 per cent of the country is still rainforest.'],
  KH: ['Phnom Penh', 17000000, 181035, 'Angkor Wat is the largest religious monument in the world and is on the national flag.'],
  CN: ['Beijing', 1410000000, 9596961, 'The whole country runs on a single time zone despite spanning five.'],
  GE: ['Tbilisi', 3700000, 69700, 'Wine was first made here 8,000 years ago, in clay vessels buried in the ground.'],
  IN: ['New Delhi', 1430000000, 3287263, 'The most populous country on earth, with 22 official languages and over 120 more spoken.'],
  ID: ['Jakarta', 278000000, 1904569, 'More than 17,000 islands, and a new capital being built in the jungle of Borneo.'],
  IR: ['Tehran', 89000000, 1648195, 'Has some of the oldest continuously inhabited cities in the world, and invented the windmill.'],
  IQ: ['Baghdad', 45000000, 438317, 'Writing was invented here, in Mesopotamia, about 5,000 years ago.'],
  IL: ['Jerusalem', 9800000, 22072, 'The Dead Sea shore is the lowest dry land on earth, more than 400m below sea level.'],
  JP: ['Tokyo', 124000000, 377975, 'Around 6,800 islands, more than 100 active volcanoes, and vending machines everywhere.'],
  JO: ['Amman', 11300000, 89342, 'Petra was carved into rock 2,000 years ago and lost to the West until 1812.'],
  KZ: ['Astana', 20000000, 2724900, 'The largest landlocked country in the world, and where most crewed space flights launch from.'],
  KW: ['Kuwait City', 4300000, 17818, 'One of the driest, flattest countries on earth: almost no rivers and no lakes.'],
  KG: ['Bishkek', 7000000, 199951, 'More than 90 per cent mountains, with a lake so salty and deep it never freezes.'],
  LA: ['Vientiane', 7700000, 236800, 'The most heavily bombed country per head in history, and still clearing it.'],
  LB: ['Beirut', 5400000, 10452, 'Beirut has been destroyed and rebuilt seven times, which is why it is called the phoenix city.'],
  MY: ['Kuala Lumpur', 34000000, 330803, 'Split across two land masses either side of the South China Sea.'],
  MV: ['Malé', 520000, 300, 'The lowest country on earth: its highest natural point is under 2.5m.'],
  MN: ['Ulaanbaatar', 3400000, 1564110, 'The least densely populated sovereign country, and the coldest capital city.'],
  MM: ['Naypyidaw', 54000000, 676578, 'Bagan has over 2,000 surviving temples on a single plain.'],
  NP: ['Kathmandu', 30000000, 147181, 'The only country with a non-rectangular flag, and eight of the ten highest mountains.'],
  KP: ['Pyongyang', 26000000, 120538, 'Runs on its own calendar, counting years from the birth of Kim Il-sung.'],
  OM: ['Muscat', 4600000, 309500, 'Frankincense trees grow wild here and made the country rich 2,000 years ago.'],
  PK: ['Islamabad', 240000000, 881913, 'Has the highest paved international road in the world, the Karakoram Highway.'],
  PS: ['Ramallah', 5400000, 6020, 'Jericho is one of the oldest continuously inhabited towns on earth, around 11,000 years.'],
  PH: ['Manila', 117000000, 300000, 'Over 7,600 islands, and the world’s longest Christmas season, starting in September.'],
  QA: ['Doha', 2700000, 11586, 'The flattest country on earth, and one of the richest per head.'],
  SA: ['Riyadh', 37000000, 2149690, 'The largest country in the world with no river at all.'],
  SG: ['Singapore', 5900000, 734, 'A country, a city and an island at once, and it has grown 25 per cent by reclaiming land.'],
  KR: ['Seoul', 52000000, 100210, 'Everyone turns a year older at new year, and the internet is among the fastest anywhere.'],
  LK: ['Colombo', 22000000, 65610, 'Has two capitals: Colombo commercially, Sri Jayawardenepura Kotte officially.'],
  SY: ['Damascus', 23000000, 185180, 'Damascus is one of the oldest continuously inhabited cities in the world.'],
  TW: ['Taipei', 23000000, 36193, 'Makes over 90 per cent of the world’s most advanced computer chips.'],
  TJ: ['Dushanbe', 10100000, 143100, 'More than 90 per cent mountainous, with glaciers feeding most of Central Asia’s water.'],
  TH: ['Bangkok', 72000000, 513120, 'The only Southeast Asian country never colonised by a European power.'],
  TL: ['Dili', 1400000, 14874, 'One of the youngest countries in the world, independent since 2002.'],
  TR: ['Ankara', 85000000, 783562, 'Istanbul is the only city in the world on two continents.'],
  TM: ['Ashgabat', 6500000, 488100, 'Has a gas crater that has been burning since 1971, known as the Door to Hell.'],
  AE: ['Abu Dhabi', 9500000, 83600, 'Around 88 per cent of residents were born somewhere else.'],
  UZ: ['Tashkent', 35000000, 447400, 'One of only two doubly landlocked countries on earth: you cross two borders to reach a sea.'],
  VN: ['Hanoi', 99000000, 331212, 'The world’s second largest coffee exporter, and egg coffee is a Hanoi speciality.'],
  YE: ['Sanaa', 34000000, 527968, 'Socotra island has dragon’s blood trees that grow nowhere else on earth.'],

  // ---------------------------------------------------------------- Africa
  DZ: ['Algiers', 46000000, 2381741, 'The largest country in Africa, and around four fifths of it is Sahara.'],
  AO: ['Luanda', 36000000, 1246700, 'Portuguese is the official language, and it is one of Africa’s biggest oil producers.'],
  BJ: ['Porto-Novo', 13700000, 112622, 'The birthplace of Vodun, which became voodoo elsewhere, and it is an official religion here.'],
  BW: ['Gaborone', 2600000, 581730, 'The Okavango Delta is a river that never reaches the sea, it evaporates into the Kalahari.'],
  BF: ['Ouagadougou', 23000000, 274200, 'Hosts FESPACO, the biggest African film festival on the continent.'],
  BI: ['Gitega', 13000000, 27834, 'Home to one of the sources of the Nile, and to drumming listed by UNESCO.'],
  CV: ['Praia', 590000, 4033, 'Ten volcanic islands, and the birthplace of morna music and Cesária Évora.'],
  CM: ['Yaoundé', 28000000, 475442, 'Called "Africa in miniature": desert, rainforest, mountains and coast in one country.'],
  CF: ['Bangui', 5700000, 622984, 'Has some of the last forest elephants and lowland gorillas in central Africa.'],
  TD: ['N’Djamena', 18000000, 1284000, 'Lake Chad has shrunk by about 90 per cent since the 1960s.'],
  KM: ['Moroni', 850000, 1862, 'Produces most of the world’s ylang-ylang, the base of many famous perfumes.'],
  CG: ['Brazzaville', 6100000, 342000, 'Brazzaville and Kinshasa are the closest pair of capital cities in the world, facing each other across a river.'],
  CD: ['Kinshasa', 102000000, 2344858, 'Holds the second largest rainforest on earth after the Amazon.'],
  CI: ['Yamoussoukro', 29000000, 322463, 'The world’s largest cocoa producer, and home to the largest church building on earth.'],
  DJ: ['Djibouti', 1100000, 23200, 'Lake Assal is the saltiest body of water outside Antarctica.'],
  EG: ['Cairo', 113000000, 1001450, 'The Great Pyramid was the tallest building in the world for nearly 4,000 years.'],
  GQ: ['Malabo', 1700000, 28051, 'The only sovereign African country with Spanish as an official language.'],
  ER: ['Asmara', 3700000, 117600, 'Asmara is a UNESCO site for its intact 1930s modernist architecture.'],
  SZ: ['Mbabane', 1200000, 17364, 'One of the world’s last absolute monarchies, and it renamed itself eSwatini in 2018.'],
  ET: ['Addis Ababa', 127000000, 1104300, 'Runs its own 13-month calendar and is around seven years behind the Gregorian one. Coffee was discovered here.'],
  GA: ['Libreville', 2500000, 267668, 'Around 11 per cent of the country is national park, unusually high anywhere.'],
  GM: ['Banjul', 2800000, 11295, 'The smallest country on mainland Africa, essentially a river with banks.'],
  GH: ['Accra', 34000000, 238533, 'The first sub-Saharan African country to gain independence, in 1957.'],
  GN: ['Conakry', 14000000, 245857, 'Holds roughly a quarter of the world’s known bauxite, the ore aluminium comes from.'],
  GW: ['Bissau', 2200000, 36125, 'The Bijagós archipelago is a matriarchal society where women choose their husbands.'],
  KE: ['Nairobi', 55000000, 580367, 'The only capital city in the world with a national park inside its limits.'],
  LS: ['Maseru', 2300000, 30355, 'The only country entirely above 1,000m, which is why it is called the Kingdom in the Sky.'],
  LR: ['Monrovia', 5400000, 111369, 'Founded by freed American slaves; its flag and capital name both reflect that.'],
  LY: ['Tripoli', 6900000, 1759540, 'More than 90 per cent desert, and it holds the highest reliably recorded air temperature in Africa.'],
  MG: ['Antananarivo', 30000000, 587041, 'Around 90 per cent of its wildlife exists nowhere else on earth.'],
  MW: ['Lilongwe', 21000000, 118484, 'Lake Malawi holds more fish species than any other lake in the world.'],
  ML: ['Bamako', 23000000, 1240192, 'Timbuktu held one of the world’s great libraries; families still hide manuscripts to protect them.'],
  MR: ['Nouakchott', 4900000, 1030700, 'The Richat Structure, a 40km bullseye in the desert, is used by astronauts as a landmark.'],
  MU: ['Port Louis', 1300000, 2040, 'The dodo lived only here, and the country has no official language in its constitution.'],
  MA: ['Rabat', 38000000, 446550, 'Fez has the world’s oldest continuously operating university, founded in 859.'],
  MZ: ['Maputo', 33000000, 801590, 'The only national flag in the world with a modern rifle on it.'],
  NA: ['Windhoek', 2600000, 824292, 'The Namib is the oldest desert on earth, and the country was the first to write conservation into its constitution.'],
  NE: ['Niamey', 26000000, 1267000, 'One of the youngest populations in the world: about half are under 15.'],
  NG: ['Abuja', 224000000, 923768, 'Africa’s most populous country, and Nollywood makes more films a year than Hollywood.'],
  RW: ['Kigali', 14000000, 26338, 'Banned plastic bags in 2008, and has the highest share of women in parliament in the world.'],
  ST: ['São Tomé', 230000, 964, 'Sits almost exactly on the equator, and once supplied most of the world’s cocoa.'],
  SN: ['Dakar', 18000000, 196722, 'Dakar was the finish line of the original Paris-Dakar rally.'],
  SC: ['Victoria', 130000, 455, 'The smallest population of any African country, and half its land is protected.'],
  SL: ['Freetown', 8800000, 71740, 'Where one of the largest diamonds ever found was dug up, the 969 carat Star of Sierra Leone.'],
  SO: ['Mogadishu', 18000000, 637657, 'The longest coastline in mainland Africa.'],
  ZA: ['Pretoria', 60000000, 1221037, 'Three capitals at once: Pretoria, Cape Town and Bloemfontein, and 11 official languages.'],
  SS: ['Juba', 11000000, 619745, 'The world’s youngest country, independent in 2011.'],
  SD: ['Khartoum', 48000000, 1861484, 'Has more pyramids than Egypt, around 200 of them, and far fewer visitors.'],
  TZ: ['Dodoma', 67000000, 947303, 'Home to Kilimanjaro, the tallest freestanding mountain in the world.'],
  TG: ['Lomé', 9100000, 56785, 'One of the narrowest countries in Africa: about 100km wide and 500km long.'],
  TN: ['Tunis', 12000000, 163610, 'Parts of Star Wars were filmed here, and some of the sets are still standing.'],
  UG: ['Kampala', 48000000, 241550, 'Has the source of the Nile, and around half the world’s remaining mountain gorillas.'],
  ZM: ['Lusaka', 20000000, 752618, 'Shares Victoria Falls with Zimbabwe, the largest sheet of falling water on earth.'],
  ZW: ['Harare', 16000000, 390757, 'Great Zimbabwe is the largest ancient stone structure in sub-Saharan Africa.'],

  // -------------------------------------------------------- North America
  AG: ['Saint John’s', 94000, 442, 'Claims a different beach for every day of the year, 365 of them.'],
  BS: ['Nassau', 410000, 13943, 'About 700 islands, and the world’s deepest known blue hole.'],
  BB: ['Bridgetown', 280000, 430, 'Rum was invented here in the 1600s, and the oldest distillery still runs.'],
  BZ: ['Belmopan', 410000, 22966, 'Has the second largest barrier reef in the world and the Great Blue Hole.'],
  CA: ['Ottawa', 40000000, 9984670, 'More lakes than the rest of the world combined, and the longest coastline of any country.'],
  CR: ['San José', 5200000, 51100, 'Abolished its army in 1948 and spent the money on schools and hospitals.'],
  CU: ['Havana', 11000000, 109884, 'Has more doctors per head than almost anywhere, and exports them.'],
  DM: ['Roseau', 73000, 751, 'The only country with a parrot on its flag, and it has a boiling lake.'],
  DO: ['Santo Domingo', 11300000, 48671, 'Santo Domingo is the oldest continuously inhabited European settlement in the Americas.'],
  SV: ['San Salvador', 6300000, 21041, 'The first country to make bitcoin legal tender, and it has more than 20 volcanoes.'],
  GD: ['St. George’s', 125000, 344, 'Called the Spice Isle: it grows around 20 per cent of the world’s nutmeg.'],
  GT: ['Guatemala City', 18000000, 108889, 'Chocolate was first drunk by the Maya here, and 21 Mayan languages are still spoken.'],
  HT: ['Port-au-Prince', 11600000, 27750, 'The first country in the world founded by a successful slave revolt.'],
  HN: ['Tegucigalpa', 10600000, 112492, 'The word "banana republic" was coined about Honduras, and it still exports a lot of them.'],
  JM: ['Kingston', 2800000, 10991, 'Has produced more world-record sprinters per head than anywhere on earth.'],
  MX: ['Mexico City', 129000000, 1964375, 'Gave the world chocolate, chillies, tomatoes, vanilla and maize.'],
  NI: ['Managua', 7000000, 130373, 'The largest country in Central America, with a lake that has freshwater sharks.'],
  PA: ['Panama City', 4500000, 75417, 'The only place in the world you can watch the sun rise on the Pacific and set on the Atlantic.'],
  KN: ['Basseterre', 47000, 261, 'The smallest sovereign country in the Americas by both area and population.'],
  LC: ['Castries', 180000, 617, 'More Nobel laureates per head than any other country.'],
  VC: ['Kingstown', 100000, 389, 'Pirates of the Caribbean was filmed here, and it has an active volcano.'],
  TT: ['Port of Spain', 1500000, 5130, 'The steelpan was invented here, the only new acoustic instrument of the 20th century.'],
  US: ['Washington, D.C.', 335000000, 9833517, 'Has no official language at national level, and its road network would circle the earth 160 times.'],

  // -------------------------------------------------------- South America
  AR: ['Buenos Aires', 46000000, 2780400, 'Home to the widest avenue in the world and the southernmost city on earth.'],
  BO: ['Sucre', 12000000, 1098581, 'La Paz is the highest seat of government in the world, and Salar de Uyuni is the largest salt flat.'],
  BR: ['Brasília', 216000000, 8515767, 'Holds about 60 per cent of the Amazon, and its capital was built from nothing in 41 months.'],
  CL: ['Santiago', 19600000, 756102, 'Over 4,300km long and rarely more than 200km wide, containing the driest desert on earth.'],
  CO: ['Bogotá', 52000000, 1141748, 'More bird species than any other country, around 1,900 of them.'],
  EC: ['Quito', 18000000, 276841, 'The Galápagos gave Darwin his theory, and Quito is the closest capital to the sun.'],
  GY: ['Georgetown', 810000, 214969, 'The only South American country with English as its official language.'],
  PY: ['Asunción', 6900000, 406752, 'One of only two landlocked countries in South America, and it is officially bilingual with Guaraní.'],
  PE: ['Lima', 34000000, 1285216, 'Grows over 3,000 varieties of potato, and Machu Picchu was never found by the Spanish.'],
  SR: ['Paramaribo', 620000, 163820, 'The most forested country on earth: over 90 per cent tree cover.'],
  UY: ['Montevideo', 3400000, 176215, 'Runs on almost entirely renewable electricity, and there are about four cows per person.'],
  VE: ['Caracas', 28000000, 916445, 'Angel Falls is the tallest waterfall in the world, so high the water becomes mist before it lands.'],

  // --------------------------------------------------------------- Oceania
  AU: ['Canberra', 27000000, 7692024, 'The only country that is also a continent, and 90 per cent live within 100km of the coast.'],
  FJ: ['Suva', 940000, 18274, 'More than 330 islands, and about a third of them have nobody living on them.'],
  KI: ['Tarawa', 130000, 811, 'Spans all four hemispheres and was the first country to see the year 2000.'],
  MH: ['Majuro', 42000, 181, 'Its islands sit on average two metres above sea level.'],
  FM: ['Palikir', 115000, 702, 'Spread across 600 islands and more than 2,700km of ocean.'],
  NR: ['Yaren', 12500, 21, 'The smallest island country in the world, and it has no official capital city.'],
  NZ: ['Wellington', 5200000, 268021, 'The first country to give women the vote, and it has more sheep than people.'],
  PW: ['Ngerulmud', 18000, 459, 'Created the world’s first shark sanctuary, and Jellyfish Lake has stingless jellyfish.'],
  PG: ['Port Moresby', 10300000, 462840, 'More than 800 living languages, more than any other country on earth.'],
  WS: ['Apia', 220000, 2842, 'Skipped 30 December 2011 entirely to move to the other side of the date line.'],
  SB: ['Honiara', 740000, 28896, 'Nearly a thousand islands, and one of the highest rates of naturally blond hair outside Europe.'],
  TO: ['Nukuʻalofa', 105000, 747, 'The only Pacific island nation never colonised.'],
  TV: ['Funafuti', 11000, 26, 'Earns a large share of its income from renting out its .tv internet domain.'],
  VU: ['Port Vila', 330000, 12189, 'Land diving here, jumping from a tower with vines, is where bungee jumping came from.'],

  // ------------------------------------------ Territories the map draws
  GL: ['Nuuk', 57000, 2166086, 'The largest island in the world, and about 80 per cent of it is ice sheet.'],
  HK: ['Hong Kong', 7500000, 1104, 'More skyscrapers than any other city on earth.'],
  MO: ['Macao', 690000, 33, 'The most densely populated place in the world, and it out-earns Las Vegas several times over.'],
  PR: ['San Juan', 3200000, 9104, 'Has the only tropical rainforest in the United States National Forest system.'],
  FO: ['Tórshavn', 54000, 1393, 'Sheep outnumber people roughly two to one, and some carry Google Street View cameras.'],
  IM: ['Douglas', 84000, 572, 'Has the oldest continuous parliament in the world, Tynwald, from around 979.'],
  JE: ['Saint Helier', 103000, 116, 'Its cows are a closed breed: no other cattle may be imported.'],
  GG: ['Saint Peter Port', 64000, 78, 'Victor Hugo wrote Les Misérables here in exile.'],
  NC: ['Nouméa', 290000, 18575, 'Ringed by the world’s second longest double barrier reef.'],
  PF: ['Papeete', 280000, 4167, 'Spread over 118 islands across an area of ocean the size of Europe.'],
  AW: ['Oranjestad', 107000, 180, 'Sits outside the hurricane belt, which is why its trees lean permanently in the trade winds.'],
  CW: ['Willemstad', 190000, 444, 'Its capital’s pastel buildings are a UNESCO site, painted so after a governor blamed white walls for his headaches.'],
  EH: ['El Aaiún', 570000, 266000, 'One of the most sparsely populated territories on earth.'],
}

/** A human-readable population: "1.4 billion", "68 million", "540,000". */
export function formatPopulation(n) {
  if (!n && n !== 0) return null
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)} billion`
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`
  if (n >= 1e4) return `${Math.round(n / 1000)},000`
  return n.toLocaleString('en-GB')
}

/** Area with a comparison people can picture, in km². */
export function formatArea(km2) {
  if (!km2) return null
  if (km2 < 10) return `${km2} km²`
  return `${Math.round(km2).toLocaleString('en-GB')} km²`
}

// ------------------------------------------------------------------ languages
// What people actually speak, per ISO-2. Official languages first, then the one
// or two widely spoken languages that are not official but that a visitor will
// hear - "what will I hear on the street" is the question this answers, not
// "what does the constitution say".
//
// Kept short on purpose: three entries at most. India has 22 official languages
// and Indonesia over 700 spoken, and listing them would be a paragraph where a
// reader wanted a glance. The long tail is the interesting fact, so where a
// country has one it lives in the fact bank instead.
export const COUNTRY_LANGUAGES = {
  // Europe
  AL: ['Albanian'], AD: ['Catalan', 'Spanish', 'French'], AT: ['German'],
  BY: ['Belarusian', 'Russian'], BE: ['Dutch', 'French', 'German'],
  BA: ['Bosnian', 'Croatian', 'Serbian'], BG: ['Bulgarian'], HR: ['Croatian'],
  CY: ['Greek', 'Turkish'], CZ: ['Czech'], DK: ['Danish'], EE: ['Estonian'],
  FI: ['Finnish', 'Swedish'], FR: ['French'], DE: ['German'], GR: ['Greek'],
  HU: ['Hungarian'], IS: ['Icelandic'], IE: ['English', 'Irish'], IT: ['Italian'],
  XK: ['Albanian', 'Serbian'], LV: ['Latvian'], LI: ['German'], LT: ['Lithuanian'],
  LU: ['Luxembourgish', 'French', 'German'], MT: ['Maltese', 'English'],
  MD: ['Romanian'], MC: ['French'], ME: ['Montenegrin'], NL: ['Dutch'],
  MK: ['Macedonian', 'Albanian'], NO: ['Norwegian'], PL: ['Polish'],
  PT: ['Portuguese'], RO: ['Romanian'], RU: ['Russian'], SM: ['Italian'],
  RS: ['Serbian'], SK: ['Slovak'], SI: ['Slovene'],
  ES: ['Spanish', 'Catalan', 'Basque'], SE: ['Swedish'],
  CH: ['German', 'French', 'Italian'], UA: ['Ukrainian'], GB: ['English'],
  VA: ['Italian', 'Latin'],
  // Asia
  AF: ['Dari', 'Pashto'], AM: ['Armenian'], AZ: ['Azerbaijani'], BH: ['Arabic'],
  BD: ['Bengali'], BT: ['Dzongkha'], BN: ['Malay'], KH: ['Khmer'],
  CN: ['Mandarin Chinese'], GE: ['Georgian'], IN: ['Hindi', 'English'],
  ID: ['Indonesian', 'Javanese'], IR: ['Persian'], IQ: ['Arabic', 'Kurdish'],
  IL: ['Hebrew', 'Arabic'], JP: ['Japanese'], JO: ['Arabic'],
  KZ: ['Kazakh', 'Russian'], KW: ['Arabic'], KG: ['Kyrgyz', 'Russian'],
  LA: ['Lao'], LB: ['Arabic', 'French'], MY: ['Malay', 'English'],
  MV: ['Dhivehi'], MN: ['Mongolian'], MM: ['Burmese'], NP: ['Nepali'],
  KP: ['Korean'], OM: ['Arabic'], PK: ['Urdu', 'English'], PS: ['Arabic'],
  PH: ['Filipino', 'English'], QA: ['Arabic'], SA: ['Arabic'],
  SG: ['English', 'Mandarin Chinese', 'Malay'], KR: ['Korean'],
  LK: ['Sinhala', 'Tamil'], SY: ['Arabic'], TW: ['Mandarin Chinese'],
  TJ: ['Tajik'], TH: ['Thai'], TL: ['Tetum', 'Portuguese'], TR: ['Turkish'],
  TM: ['Turkmen'], AE: ['Arabic', 'English'], UZ: ['Uzbek'], VN: ['Vietnamese'],
  YE: ['Arabic'],
  // Africa
  DZ: ['Arabic', 'Berber', 'French'], AO: ['Portuguese'], BJ: ['French'],
  BW: ['English', 'Setswana'], BF: ['French'], BI: ['Kirundi', 'French'],
  CV: ['Portuguese'], CM: ['French', 'English'], CF: ['French', 'Sango'],
  TD: ['French', 'Arabic'], KM: ['Comorian', 'French', 'Arabic'],
  CG: ['French'], CD: ['French', 'Lingala', 'Swahili'], CI: ['French'],
  DJ: ['French', 'Arabic'], EG: ['Arabic'], GQ: ['Spanish', 'French', 'Portuguese'],
  ER: ['Tigrinya', 'Arabic', 'English'], SZ: ['siSwati', 'English'],
  ET: ['Amharic', 'Oromo'], GA: ['French'], GM: ['English'], GH: ['English'],
  GN: ['French'], GW: ['Portuguese'], KE: ['Swahili', 'English'],
  LS: ['Sesotho', 'English'], LR: ['English'], LY: ['Arabic'],
  MG: ['Malagasy', 'French'], MW: ['English', 'Chichewa'], ML: ['French', 'Bambara'],
  MR: ['Arabic'], MU: ['English', 'French', 'Mauritian Creole'],
  MA: ['Arabic', 'Berber', 'French'], MZ: ['Portuguese'], NA: ['English'],
  NE: ['French', 'Hausa'], NG: ['English', 'Hausa', 'Yoruba'],
  RW: ['Kinyarwanda', 'English', 'French'], ST: ['Portuguese'],
  SN: ['French', 'Wolof'], SC: ['Seychellois Creole', 'English', 'French'],
  SL: ['English'], SO: ['Somali', 'Arabic'],
  ZA: ['English', 'Zulu', 'Afrikaans'], SS: ['English'], SD: ['Arabic', 'English'],
  TZ: ['Swahili', 'English'], TG: ['French'], TN: ['Arabic', 'French'],
  UG: ['English', 'Swahili'], ZM: ['English'], ZW: ['English', 'Shona', 'Ndebele'],
  EH: ['Arabic', 'Spanish'],
  // Americas
  AG: ['English'], BS: ['English'], BB: ['English'], BZ: ['English'],
  CA: ['English', 'French'], CR: ['Spanish'], CU: ['Spanish'], DM: ['English'],
  DO: ['Spanish'], SV: ['Spanish'], GD: ['English'], GT: ['Spanish'],
  HT: ['Haitian Creole', 'French'], HN: ['Spanish'], JM: ['English', 'Jamaican Patois'],
  MX: ['Spanish'], NI: ['Spanish'], PA: ['Spanish'], KN: ['English'],
  LC: ['English'], VC: ['English'], TT: ['English'], US: ['English', 'Spanish'],
  AR: ['Spanish'], BO: ['Spanish', 'Quechua', 'Aymara'], BR: ['Portuguese'],
  CL: ['Spanish'], CO: ['Spanish'], EC: ['Spanish', 'Quechua'], GY: ['English'],
  PY: ['Spanish', 'Guaraní'], PE: ['Spanish', 'Quechua'], SR: ['Dutch'],
  UY: ['Spanish'], VE: ['Spanish'], PR: ['Spanish', 'English'],
  GL: ['Greenlandic', 'Danish'], AW: ['Papiamento', 'Dutch'],
  CW: ['Papiamento', 'Dutch', 'English'],
  // Oceania and the rest
  AU: ['English'], FJ: ['Fijian', 'English', 'Hindi'], KI: ['Gilbertese', 'English'],
  MH: ['Marshallese', 'English'], FM: ['English'], NR: ['Nauruan', 'English'],
  NZ: ['English', 'Māori'], PW: ['Palauan', 'English'], PG: ['Tok Pisin', 'English'],
  WS: ['Samoan', 'English'], SB: ['English'], TO: ['Tongan', 'English'],
  TV: ['Tuvaluan', 'English'], VU: ['Bislama', 'English', 'French'],
  NC: ['French'], PF: ['French', 'Tahitian'],
  HK: ['Cantonese', 'English'], MO: ['Cantonese', 'Portuguese'],
  FO: ['Faroese', 'Danish'], IM: ['English'], JE: ['English'], GG: ['English'],
}

/** "English and Irish", "German, French and Italian" - a list a person reads. */
export function languageList(iso2) {
  const langs = COUNTRY_LANGUAGES[iso2]
  if (!langs?.length) return null
  if (langs.length === 1) return langs[0]
  return `${langs.slice(0, -1).join(', ')} and ${langs[langs.length - 1]}`
}
