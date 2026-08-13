// MORE THAN ONE THING TO SAY ABOUT A PLACE.
//
// The country panel had exactly one "Did you know", so the second time you
// opened a country it told you what it told you the first time, and the card
// stopped being worth reading. A "New fact" button needs a bank behind it.
//
// WHERE THE FACTS COME FROM, AND WHAT IS HONEST ABOUT IT
//
// Two sources, and the panel makes no distinction because the reader should not
// have to:
//
//   1. WRITTEN FACTS - this file, plus the one in countryData. Chosen to be the
//      thing somebody would actually repeat, not the opening line of an
//      encyclopedia entry. Stable claims only: nothing that changes with an
//      election, a league table or an exchange rate, because a fact that goes
//      stale in a card nobody is maintaining is worse than no card.
//
//   2. DERIVED FACTS - built in `factsFor` from data the app already holds
//      (size, population, currency, language, time zone) and phrased as
//      something you could tell somebody. They are what keeps a country with a
//      short written entry from running out after two taps.
//
// COVERAGE IS DELIBERATELY UNEVEN. The bank is deepest for the places this
// community actually travels to and lives in, and thinner for the rest. Fifteen
// hand-written facts each for two hundred countries would be three thousand
// claims that nobody could check, and the wrong ones would be indistinguishable
// from the right ones. Where a country has fewer, the button simply cycles what
// there is - and the derived facts mean that is never fewer than about six.
//
// Keyed by ISO 3166-1 alpha-2, like every other country table here.

export const FACT_BANK = {
  // -------------------------------------------------------------- Europe
  GB: [
    'It is the only country in the world that does not put its own name on its postage stamps.',
    'No point on the island of Great Britain is more than about 113 km from the sea.',
    'The London Underground is the oldest metro in the world, running since 1863.',
    'It has more Indian restaurants than India has of some Western chains, and chicken tikka masala was invented here.',
    'Loch Ness holds more fresh water than every lake in England and Wales combined.',
    'The shortest scheduled flight in the world runs between two Orkney islands and lasts under two minutes.',
    'Pubs must legally be able to serve tap water free of charge if they serve alcohol.',
    'York has a street called Whip-Ma-Whop-Ma-Gate that is barely 35 metres long.',
    'It has four countries, three legal systems and no single written constitution.',
    'The Severn estuary has the second largest tidal range on earth, over 14 metres.',
    'Motorway service stations are legally required to let you park free for two hours.',
    'The oldest surviving bottle of beer in the world was brewed here in 1875.',
    'Big Ben is the bell, not the tower. The tower is the Elizabeth Tower.',
  ],
  IE: [
    'There are no snakes, and there never were: the sea rose before they could arrive.',
    'More people of Irish descent live outside the country than in it, by a factor of about fourteen.',
    'Halloween began here as Samhain, and turnips were carved before pumpkins were.',
    'The longest place name is Muckanaghederdauhaulia, in County Galway.',
    'Every hedge and ditch in the country is legally protected during nesting season.',
    'Guinness signed a 9,000-year lease on its Dublin brewery in 1759.',
    'The tricolour is green for the Gaelic tradition, orange for the Protestant one and white for peace between them.',
    'Newgrange is older than Stonehenge and the pyramids at Giza.',
    'It is the only country in the world whose national symbol is a musical instrument.',
  ],
  PT: [
    'Roughly 6,000 kilometres of the Atlantic separate its mainland from its most distant island.',
    'It has the oldest fixed borders in Europe, essentially unchanged since 1297.',
    'Portuguese is spoken by more people than French, German or Italian.',
    'Lisbon is older than Rome by several centuries.',
    'The world produces about half of all its cork here, and the trees are harvested without being cut down.',
    'The 1755 Lisbon earthquake effectively founded the science of seismology.',
    'Its oldest bookshop, Bertrand in Lisbon, has been open since 1732.',
    'The Vasco da Gama bridge is over 12 km long and accounts for the curvature of the earth in its design.',
    'Fado, its national music, has UNESCO heritage status.',
    'The alliance with England, signed in 1386, is the oldest active treaty in the world.',
  ],
  ES: [
    'It has more bars per person than any other country in the European Union.',
    'The national anthem has no official words.',
    'Spanish is the world\'s second most spoken native language, after Mandarin.',
    'It is the second most mountainous country in Europe after Switzerland.',
    'La Tomatina in Buñol throws roughly 150,000 tomatoes in an hour.',
    'The Sagrada Família has been under construction since 1882.',
    'Spain has 15 national parks and more UNESCO sites than almost anywhere else.',
    'The world\'s oldest restaurant still running, Sobrino de Botín, opened in Madrid in 1725.',
    'It shares a border with Morocco, at Ceuta and Melilla.',
  ],
  FR: [
    'It is the most visited country in the world, by a wide margin.',
    'There are around 1,600 named cheeses.',
    'France has the most time zones of any country, twelve, because of its overseas territories.',
    'It was legal to marry a dead person, with presidential approval, and still is in rare cases.',
    'The Eiffel Tower grows about 15 cm taller in summer as the iron expands.',
    'A French law requires radio stations to play a minimum share of French-language music.',
    'The Louvre is the most visited museum on earth and was once a fortress.',
    'Mont Blanc is the highest mountain in western Europe at 4,806 m.',
    'The metric system was invented here in the 1790s.',
  ],
  IT: [
    'It has more UNESCO World Heritage sites than any other country.',
    'Two entire countries sit inside it: San Marino and Vatican City.',
    'Italy did not exist as one country until 1861.',
    'The Colosseum could be emptied of 50,000 people in about fifteen minutes.',
    'Espresso is legally price-capped at the bar in Naples by long custom, not law.',
    'Its longest river, the Po, is only 652 km.',
    'Venice is built on millions of wooden piles driven into the lagoon bed.',
    'Pasta shapes number well over 350, and using the wrong one for a sauce is a real argument.',
  ],
  DE: [
    'There is no federal speed limit on around half the autobahn network.',
    'It has over 1,500 breweries and more than 5,000 kinds of beer.',
    'University tuition is free, including for most international students.',
    'Berlin has more bridges than Venice.',
    'It borders nine countries, more than any other in Europe apart from Russia and France.',
    'A third of the country is forest.',
    'The world\'s narrowest street, Spreuerhofstraße in Reutlingen, is 31 cm at its tightest.',
    'Escaping from prison is not a crime here: the law accepts the urge to be free.',
  ],
  NL: [
    'About a quarter of the country sits below sea level.',
    'The Dutch are on average the tallest people in the world.',
    'There are more bicycles than people.',
    'It is the second largest exporter of food on earth, from a country the size of Maryland.',
    'The tulip crash of 1637 was the first recorded speculative bubble.',
    'Almost everyone speaks English, and it is not an official language.',
    'The Netherlands is one of twelve provinces; Holland is only two of them.',
  ],
  GR: [
    'No point in the country is more than about 137 km from the sea.',
    'It has around 6,000 islands, of which roughly 227 are inhabited.',
    'Greece produces more olive oil per person than anywhere else.',
    'The Greek language has been written continuously for over 3,000 years.',
    'Around 80 per cent of the country is mountainous.',
    'Nobody may be buried on Delos: the whole island is a protected sanctuary.',
  ],
  HR: [
    'The necktie began here, from the scarves of Croatian soldiers in the 17th century.',
    'It has 1,244 islands, islets and reefs, and about 50 are inhabited.',
    'The Dalmatian dog is named after Dalmatia.',
    'Zadar has a sea organ that the waves play through pipes in the steps.',
    'Its Plitvice lakes flow into each other over travertine barriers that are still growing.',
  ],
  IS: [
    'There are no mosquitoes.',
    'Almost all heating and electricity comes from geothermal and hydro power.',
    'Surnames are patronymic: children take a version of a parent\'s first name.',
    'It has no army, and never has.',
    'The parliament, the Althing, has met since 930 and is the world\'s oldest.',
    'Beer was illegal until 1989.',
  ],
  NO: [
    'The coastline, with its fjords and islands, runs over 100,000 km.',
    'The sun does not set for weeks in the far north in summer.',
    'Norway gave London a Christmas tree every year since 1947 as thanks for the war.',
    'A penguin in Edinburgh Zoo holds the rank of Brigadier in the Norwegian Guard.',
    'Salmon sushi was a Norwegian marketing idea sold to Japan in the 1980s.',
  ],
  SE: [
    'There are nearly 270,000 islands, more than any other country.',
    'Allemansrätten gives everyone the right to walk and camp on almost any land.',
    'Sweden recycles so well it has imported rubbish to keep its plants running.',
    'The Icehotel in Jukkasjärvi is rebuilt from the river every winter.',
    'Fika, a coffee and a pastry with somebody, is close to a civic duty.',
  ],
  DK: [
    'No point in Denmark is more than about 52 km from the sea.',
    'It has more bikes than cars, and Copenhagen has bike bridges.',
    'The Danish flag is the oldest continuously used national flag in the world.',
    'Lego is Danish, from "leg godt", meaning play well.',
    'Greenland and the Faroes are part of the Kingdom of Denmark.',
  ],
  FI: [
    'There are around 188,000 lakes and about 2.2 million saunas.',
    'It has the most forest cover of any country in Europe.',
    'Speeding fines are calculated from your income, and have run to six figures.',
    'Every newborn gets a state baby box that doubles as a cot.',
    'The Sámi languages are official in the north.',
  ],
  CH: [
    'It has four official languages: German, French, Italian and Romansh.',
    'Every household is within reach of a nuclear shelter by law.',
    'The country is legally neutral and last fought a foreign war in 1815.',
    'Its motorway tunnels total over 200 km.',
    'Citizens can force a national referendum with 100,000 signatures.',
  ],
  AT: [
    'The Vienna State Opera stages a different work almost every night of the season.',
    'Austria gave the world the croissant, by way of Vienna, before Paris did.',
    'Around 60 per cent of the country is in the Alps.',
    'Its national anthem was rewritten in 2012 to include daughters as well as sons.',
  ],
  PL: [
    'The Wieliczka salt mine has an entire cathedral carved out of salt.',
    'Warsaw\'s old town is a post-war reconstruction, rebuilt from paintings.',
    'Poland has the largest population of European bison in the world.',
    'Marie Curie was Polish, and named polonium after her country.',
  ],
  CZ: [
    'Czechs drink more beer per person than anyone else on earth.',
    'Prague Castle is the largest ancient castle complex in the world.',
    'The word "robot" was coined in a Czech play in 1920.',
    'There are more than 2,000 castles and châteaux in the country.',
  ],
  RO: [
    'The Palace of the Parliament in Bucharest is the heaviest building in the world.',
    'The Danube Delta is the largest and best preserved river delta in Europe.',
    'Romanian is a Romance language surrounded on all sides by Slavic ones.',
    'The Transfăgărășan road climbs to 2,042 m and is closed most of the year.',
    'Timișoara was the first city in mainland Europe lit by electric street lamps.',
  ],
  HU: [
    'Budapest has more thermal springs than any other capital city.',
    'The Rubik\'s Cube was invented in Budapest in 1974.',
    'Hungarian is related to Finnish and Estonian, and to almost nothing else nearby.',
    'The Budapest metro line 1 is the oldest on mainland Europe, from 1896.',
  ],
  BE: [
    'Belgium once went 589 days without a government.',
    'It has more castles per square kilometre than any other country.',
    'The Brussels Grand-Place is carpeted with nearly a million begonias every other August.',
    'Voting is compulsory.',
  ],
  TR: [
    'Istanbul is the only city sitting on two continents.',
    'Tulips came to the Netherlands from the Ottoman Empire, not the other way round.',
    'Turkey has more ancient Greek ruins than Greece.',
    'Santa Claus, Saint Nicholas, was born in what is now Demre on the south coast.',
    'Turkish coffee is on the UNESCO intangible heritage list.',
  ],
  MA: [
    'Fez has the world\'s oldest continuously operating university, founded in 859.',
    'The medina of Fez is one of the largest car-free urban areas on earth.',
    'Morocco is one of the few countries with both Atlantic and Mediterranean coasts.',
    'Mint tea is poured from a height to aerate it, and refusing a glass is rude.',
  ],
  // ------------------------------------------------------ Rest of the world
  US: [
    'It has no official language at federal level.',
    'Alaska has both the westernmost and easternmost points in the country, because it crosses the 180th meridian.',
    'The Library of Congress holds over 170 million items.',
    'There are more public libraries than McDonald\'s outlets.',
    'Yellowstone sits on top of an active supervolcano.',
    'The interstate system was built partly as a defence project.',
  ],
  CA: [
    'It has more lakes than the rest of the world combined.',
    'The Canada-US border is the longest undefended border on earth.',
    'Canada has two official languages and about 70 Indigenous ones still spoken.',
    'The town of Churchill leaves cars unlocked so people can escape polar bears.',
    'Its coastline is the longest of any country, over 200,000 km.',
  ],
  MX: [
    'Mexico City is sinking by up to 50 cm a year.',
    'It gave the world chocolate, vanilla, tomatoes, chillies and maize.',
    'There are 68 recognised Indigenous languages with official status.',
    'The Chihuahua is the smallest dog breed and is named after a Mexican state.',
  ],
  BR: [
    'Brazil borders every South American country except Chile and Ecuador.',
    'The Amazon produces a significant share of the world\'s oxygen from a single basin.',
    'It has won the football World Cup more times than any other country.',
    'Portuguese makes it the only Portuguese-speaking country in the Americas.',
  ],
  AR: [
    'Ushuaia is the southernmost city in the world.',
    'Argentina has the highest and lowest points in the southern hemisphere.',
    'Tango was born in the port districts of Buenos Aires.',
    'The country consumes more beef per person than almost anywhere else.',
  ],
  JP: [
    'There are more than 6,800 islands.',
    'Vending machines number roughly one for every 30 people.',
    'It has the oldest company in the world, a temple builder founded in 578.',
    'Trains apologise publicly for being a minute early.',
    'Around 73 per cent of the country is mountains.',
  ],
  TH: [
    'It is the only country in Southeast Asia never colonised by a European power.',
    'The full ceremonial name of Bangkok is the longest place name in the world.',
    'The Thai calendar is 543 years ahead of the Gregorian one.',
    'Red Bull began as a Thai drink, Krating Daeng.',
  ],
  VN: [
    'It is the second largest coffee exporter in the world.',
    'Hanoi has a street where a train passes within inches of the cafés.',
    'Sơn Đoòng is the largest cave passage on earth, with its own jungle and clouds.',
    'The Vietnamese alphabet is Latin, adapted by Portuguese and French missionaries.',
  ],
  ID: [
    'It has over 17,000 islands, of which about 6,000 are inhabited.',
    'More than 700 languages are spoken here.',
    'It has more active volcanoes than any other country.',
    'The capital is moving from Jakarta to a new city on Borneo.',
  ],
  IN: [
    'It has 22 official languages and hundreds more spoken.',
    'The Kumbh Mela is the largest gathering of people on earth.',
    'Chess, zero as a number and the decimal system all originated here.',
    'India has the world\'s largest postal network, including a floating post office.',
  ],
  AU: [
    'It is the only country that is also a continent.',
    'About 85 per cent of Australians live within 50 km of the coast.',
    'The Great Barrier Reef is the largest living structure on earth.',
    'Voting is compulsory.',
    'It is wider east to west than the moon is across.',
  ],
  NZ: [
    'There are roughly five sheep for every person.',
    'It was the first country to give women the vote, in 1893.',
    'No part of the country is more than about 128 km from the sea.',
    'Its longest place name has 85 letters.',
  ],
  ZA: [
    'It has three capital cities: Pretoria, Cape Town and Bloemfontein.',
    'There are 12 official languages, including sign language.',
    'Cape Town\'s Table Mountain is one of the oldest mountains on earth.',
    'It is the only country to have built nuclear weapons and then given them up.',
  ],
  EG: [
    'The Great Pyramid was the tallest building in the world for around 3,800 years.',
    'Cleopatra lived closer in time to the moon landing than to the building of the pyramids.',
    'Almost the entire population lives on about 5 per cent of the land.',
    'Alexandria\'s library is being rebuilt as a modern one on the same site.',
  ],
  AE: [
    'Dubai\'s Burj Khalifa is so tall you can watch the sunset twice by taking the lift.',
    'The country was formed from seven emirates in 1971.',
    'Fewer than one in eight residents holds citizenship.',
    'The police fleet in Dubai includes a Bugatti.',
  ],
  KR: [
    'It has the fastest average internet speeds in the world.',
    'Everyone turns a year older at new year under the traditional age system.',
    'Seoul has more coffee shops per person than almost any city on earth.',
    'The DMZ has become an accidental nature reserve.',
  ],
  CN: [
    'It spans five geographic time zones but keeps one clock.',
    'The Great Wall is not one wall but many, built over roughly 2,000 years.',
    'Paper, printing, gunpowder and the compass were all invented here.',
    'It has the world\'s largest high-speed rail network by a long way.',
  ],
  PE: [
    'Peru has more than 4,000 varieties of potato.',
    'The Amazon river begins here.',
    'Machu Picchu was never found by the Spanish.',
    'Its northern desert holds the Nazca lines, only readable from the air.',
  ],
  CO: [
    'Colombia is the second most biodiverse country on earth.',
    'It has coastline on both the Pacific and the Caribbean.',
    'Around 70 per cent of the world\'s emeralds come from here.',
    'Medellín has outdoor escalators built up the hillside barrios.',
  ],
  CR: [
    'It abolished its army in 1948 and spent the money on schools.',
    'About 5 per cent of the world\'s known species live here.',
    'It runs on close to 100 per cent renewable electricity most years.',
  ],
  KE: [
    'The Great Rift Valley is visible from space.',
    'Nairobi is the only capital city with a national park inside it.',
    'Kenya banned plastic bags with some of the strictest penalties anywhere.',
  ],
  TZ: [
    'Kilimanjaro is the highest free-standing mountain in the world.',
    'Around 38 per cent of the country is protected land.',
    'Swahili here is a first language for relatively few and a second for almost everyone.',
  ],
  NG: [
    'Nollywood produces more films a year than Hollywood.',
    'Over 500 languages are spoken.',
    'Lagos is one of the fastest growing cities in the world.',
  ],
  PH: [
    'It is made up of 7,641 islands.',
    'Filipinos send more text messages than almost anyone, earning it a "texting capital" nickname.',
    'The Chocolate Hills of Bohol are over a thousand near-identical mounds.',
  ],
  MY: [
    'The Petronas Towers were the tallest buildings in the world until 2004.',
    'Malaysian rainforest is around 130 million years old, older than the Amazon.',
    'It is split across two land masses either side of the South China Sea.',
  ],
  SG: [
    'It is one of only three surviving city-states.',
    'Chewing gum cannot be sold here.',
    'The country has grown roughly 25 per cent in land area by reclamation.',
  ],
  IL: [
    'The Dead Sea is the lowest point on land on earth.',
    'It has more museums per person than any other country.',
    'Tel Aviv has the largest collection of Bauhaus buildings anywhere.',
  ],
  CL: [
    'It is about 4,300 km long and averages 180 km wide.',
    'The Atacama is the driest non-polar desert on earth.',
    'Chile has deserts, glaciers, rainforest and Pacific islands in one country.',
  ],
  CU: [
    'Vintage American cars survive because imports were banned for decades.',
    'It has one of the highest literacy rates in the world.',
    'Cuba trains and exports more doctors than most far larger countries.',
  ],
  JM: [
    'Jamaica has produced more world-record sprinters per person than anywhere.',
    'It was the first Caribbean country to gain independence, in 1962.',
    'Blue Mountain coffee grows above 900 m and is among the most expensive.',
  ],
  NP: [
    'Eight of the world\'s ten highest mountains are here.',
    'The flag is the only national flag that is not a rectangle.',
    'Nepal has never been colonised.',
  ],
  LK: [
    'It was called Ceylon until 1972, and the tea still is.',
    'Sri Lanka has the highest biodiversity density in Asia.',
    'Sigiriya is a palace built on top of a 200 m rock column.',
  ],
  GE: [
    'Winemaking began here around 8,000 years ago.',
    'The Georgian alphabet is one of only fourteen scripts in the world.',
    'It has villages above 2,000 m that are cut off for months each winter.',
  ],
  AL: [
    'Nodding means no and shaking your head means yes.',
    'There are around 170,000 concrete bunkers left from the communist era.',
    'Albania has one of the highest rates of religious tolerance in Europe.',
  ],
  ME: [
    'Montenegro means black mountain, after the dark pine forest on Mount Lovćen.',
    'The Bay of Kotor is often called Europe\'s southernmost fjord, though it is a submerged canyon.',
    'It uses the euro without being in the eurozone.',
  ],
}

export default FACT_BANK
