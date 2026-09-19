import { normalize } from './countries'

// Guess the Country (Pinpoint): clue words revealed one at a time, ordered
// subtle -> giveaway. Every country has THREE different clue sets (roughly:
// culture/food, landmarks/nature, cities/icons), so the same country can
// reappear with fresh clues. The daily pick, the set and the round style are
// all deterministic, so everyone gets the same puzzle.
//
//   name    - the answer (accepted when typed)
//   iso2    - flag emoji on the win screen
//   region  - the continent, shown from the start on a guided round only
//   tier    - 'easy' | 'medium' | 'hard': how widely known the country is, and
//             therefore how often it comes round and how much help it gets.
//             A judgement, written down rather than inferred from anything.
//   aliases - extra accepted spellings
//   sets    - three arrays of exactly five clues, HARDEST FIRST. The ordering
//             is load-bearing now: an express round serves only the first
//             three, so a set whose giveaway drifted to the front would make
//             that round trivial.
export const PINPOINT_COUNTRIES = [
  // ---- Europe ----
  { name: 'Italy', iso2: 'IT', region: 'Europe', tier: 'easy', sets: [
    ['Renaissance', 'Vespa', 'Espresso', 'Pasta', 'Colosseum'],
    ['Leaning tower', 'Amalfi Coast', 'Venice canals', 'Pompeii', 'Rome'],
    ['Gelato', 'Serie A', 'Ferrari', 'Pizza', 'Milan'],
  ] },
  { name: 'France', iso2: 'FR', region: 'Europe', tier: 'easy', sets: [
    ['Riviera', 'Croissant', 'Louvre', 'Baguette', 'Eiffel Tower'],
    ['Mont Blanc', 'Champagne', 'Palace of Versailles', 'Cannes', 'Paris'],
    ['Cheese', 'Crêpes', 'Notre-Dame', 'Provence', 'Tour de France'],
  ] },
  { name: 'Spain', iso2: 'ES', region: 'Europe', tier: 'easy', sets: [
    ['Siesta', 'Tapas', 'Flamenco', 'Sagrada Família', 'Paella'],
    ['Running of the bulls', 'La Liga', 'Canary Islands', 'Ibiza', 'Madrid'],
    ['Sangría', 'La Tomatina', 'Gaudí', 'Bullfighting', 'Barcelona'],
  ] },
  { name: 'Portugal', iso2: 'PT', region: 'Europe', tier: 'easy', sets: [
    ['Azulejo tiles', 'Port wine', 'Fado music', 'Douro Valley', 'Lisbon'],
    ['Custard tarts', 'Nazaré waves', 'Madeira', 'Ronaldo', 'Porto'],
    ['Cork', 'Sardines', 'Yellow trams', 'Age of Discoveries', 'Algarve'],
  ] },
  { name: 'United Kingdom', iso2: 'GB', region: 'Europe', tier: 'easy', aliases: ['uk', 'great britain', 'britain', 'england'], sets: [
    ['Pubs', 'Double-decker bus', 'Afternoon tea', 'Big Ben', 'London'],
    ['Stonehenge', 'Loch Ness', 'Royal Family', 'Buckingham Palace', 'England'],
    ['Fish and chips', 'Premier League', 'The Beatles', 'Sherlock Holmes', 'Union Jack'],
  ] },
  { name: 'Ireland', iso2: 'IE', region: 'Europe', tier: 'easy', aliases: ['republic of ireland'], sets: [
    ['Shamrock', 'Guinness', 'Leprechaun', 'St Patrick', 'Dublin'],
    ['Peat bogs', 'Cliffs of Moher', 'Ring of Kerry', 'Blarney Stone', 'Emerald Isle'],
    ['Riverdance', 'U2', 'Gaelic football', 'Trinity College', 'Irish whiskey'],
  ] },
  { name: 'Germany', iso2: 'DE', region: 'Europe', tier: 'easy', sets: [
    ['Autobahn', 'Bratwurst', 'Oktoberfest', 'Berlin Wall', 'Berlin'],
    ['Black Forest', 'Neuschwanstein', 'Bavaria', 'Brandenburg Gate', 'Munich'],
    ['Pretzels', 'Christmas markets', 'BMW', 'Bundesliga', 'Bavarian beer halls'],
  ] },
  { name: 'Netherlands', iso2: 'NL', region: 'Europe', tier: 'easy', aliases: ['holland'], sets: [
    ['Canals', 'Clogs', 'Tulips', 'Windmills', 'Amsterdam'],
    ['Cycling everywhere', 'Cheese markets', 'Van Gogh', 'Keukenhof gardens', 'Rotterdam'],
    ['Stroopwafels', "King's Day", 'Delft blue pottery', 'Gouda', 'Orange football shirts'],
  ] },
  { name: 'Belgium', iso2: 'BE', region: 'Europe', tier: 'easy', sets: [
    ['Tintin', 'Waffles', 'Fries', 'Chocolate', 'Brussels'],
    ['Abbey beers', 'Bruges canals', 'Atomium', 'EU headquarters', 'Antwerp diamonds'],
    ['Smurfs', 'Comic strips', 'Flanders fields', 'Ghent', 'Belgian beer'],
  ] },
  { name: 'Switzerland', iso2: 'CH', region: 'Europe', tier: 'easy', sets: [
    ['Banks', 'Watches', 'Fondue', 'Matterhorn', 'Zurich'],
    ['Red Cross', 'CERN', 'Alpine villages', 'Lake Geneva', 'Swiss Army knife'],
    ['Neutrality', 'Yodelling', 'Cheese with holes', 'Cable cars', 'Geneva'],
  ] },
  { name: 'Austria', iso2: 'AT', region: 'Europe', tier: 'easy', sets: [
    ['Strudel', 'Waltz', 'Mozart', 'Sound of Music', 'Vienna'],
    ['Red Bull', 'Ski resorts', 'Salzburg', 'Schönbrunn Palace', 'Vienna coffee houses'],
    ['Sachertorte', 'Sigmund Freud', 'Gustav Klimt', 'Arnold Schwarzenegger', 'Habsburg Empire'],
  ] },
  { name: 'Greece', iso2: 'GR', region: 'Europe', tier: 'easy', sets: [
    ['Olives', 'Mythology', 'Santorini', 'Parthenon', 'Athens'],
    ['Feta', 'Island hopping', 'Zeus', 'Acropolis', 'Mykonos'],
    ['Plate smashing', 'Sirtaki dance', 'Ouzo', 'Olympics birthplace', 'Greek salad'],
  ] },
  { name: 'Sweden', iso2: 'SE', region: 'Europe', tier: 'easy', sets: [
    ['Fika', 'Meatballs', 'ABBA', 'IKEA', 'Stockholm'],
    ['Midsummer poles', 'Archipelagos', 'Ice hotel', 'Volvo', 'Nobel Prize'],
    ['Crayfish parties', 'Cinnamon buns', 'Zlatan', 'Spotify', 'Swedish House Mafia'],
  ] },
  { name: 'Norway', iso2: 'NO', region: 'Europe', tier: 'easy', sets: [
    ['Salmon', 'Northern lights', 'Fjords', 'Vikings', 'Oslo'],
    ['Oil fund', 'Trolls', 'Midnight sun', 'Ski jumping', 'Bergen'],
    ['Brown cheese', 'Slow TV', 'Lofoten Islands', "Munch's Scream", 'Norwegian fjords'],
  ] },
  { name: 'Denmark', iso2: 'DK', region: 'Europe', tier: 'easy', sets: [
    ['Pastries', 'Hygge', 'Little Mermaid', 'LEGO', 'Copenhagen'],
    ['Smørrebrød', 'Tivoli Gardens', 'Hans Christian Andersen', 'Carlsberg', 'Danish pastries'],
    ['Interior design', 'Bicycle culture', 'Roskilde Festival', 'Greenland ties', 'Copenhagen harbour'],
  ] },
  { name: 'Finland', iso2: 'FI', region: 'Europe', tier: 'medium', sets: [
    ['Reindeer', 'Sauna', 'Santa Claus', 'Nokia', 'Helsinki'],
    ['Salmiakki', 'Thousand lakes', 'Lapland', 'Angry Birds', "Santa's village"],
    ['Heavy metal bands', 'Ice swimming', 'Moomins', 'Kimi Räikkönen', 'Finnish saunas'],
  ] },
  { name: 'Iceland', iso2: 'IS', region: 'Europe', tier: 'easy', sets: [
    ['Puffins', 'Geysers', 'Volcanoes', 'Blue Lagoon', 'Reykjavik'],
    ['Elf folklore', 'Waterfalls', 'Glaciers', 'Northern lights island', 'Ring Road'],
    ['Björk', 'Hot springs', 'Viking clap', 'Golden Circle', 'Land of fire and ice'],
  ] },
  { name: 'Croatia', iso2: 'HR', region: 'Europe', tier: 'medium', sets: [
    ['Adriatic sailing', 'Game of Thrones', 'Plitvice Lakes', 'Dubrovnik', 'Zagreb'],
    ['Necktie origins', 'Island hopping ferries', 'Hvar', 'Split', 'Adriatic coast'],
    ['Istrian truffles', 'Sea organ', 'Luka Modrić', "King's Landing", 'Croatian islands'],
  ] },
  { name: 'Czechia', iso2: 'CZ', region: 'Europe', tier: 'medium', aliases: ['czech republic'], sets: [
    ['Pilsner', 'Bohemia', 'Astronomical clock', 'Charles Bridge', 'Prague'],
    ['Beer spas', 'Fairy-tale castles', 'Moravia', 'Old Town Square', 'Czech beer'],
    ['Marionettes', 'Škoda', 'Kafka', 'Wenceslas Square', 'Bohemian crystal'],
  ] },
  { name: 'Hungary', iso2: 'HU', region: 'Europe', tier: 'medium', sets: [
    ['Paprika', 'Goulash', 'Thermal baths', 'Danube', 'Budapest'],
    ['Ruin bars', 'Lake Balaton', "Rubik's Cube", 'Chain Bridge', 'Hungarian parliament'],
    ['Lángos', 'Tokaji wine', 'Sziget Festival', 'Ferenc Puskás', 'Buda and Pest'],
  ] },
  { name: 'Poland', iso2: 'PL', region: 'Europe', tier: 'easy', sets: [
    ['Amber', 'Pierogi', 'Chopin', 'Kraków', 'Warsaw'],
    ['Salt mines', 'Bison forests', 'Tatra Mountains', 'Solidarity movement', 'Gdańsk'],
    ['Vodka', 'Lewandowski', 'Copernicus', 'Wawel Castle', 'Polish złoty'],
  ] },
  { name: 'Romania', iso2: 'RO', region: 'Europe', tier: 'medium', sets: [
    ['Castles', 'Carpathians', 'Dracula', 'Transylvania', 'Bucharest'],
    ['Painted monasteries', 'Transfăgărășan road', 'Black Sea coast', 'Bran Castle', 'Vlad the Impaler'],
    ['Mămăligă', 'Nadia Comăneci', 'Palace of the Parliament', 'Sibiu', 'Transylvanian castles'],
  ] },
  { name: 'Turkey', iso2: 'TR', region: 'Europe', tier: 'easy', aliases: ['türkiye', 'turkiye'], sets: [
    ['Kebab', 'Hot air balloons', 'Bosphorus', 'Hagia Sophia', 'Istanbul'],
    ['Baklava', 'Grand Bazaar', 'Cappadocia', 'Blue Mosque', 'Turkish delight'],
    ['Çay tea', 'Whirling dervishes', 'Pamukkale', 'Antalya', 'Turkish baths'],
  ] },
  { name: 'Russia', iso2: 'RU', region: 'Europe', tier: 'easy', aliases: ['russian federation'], sets: [
    ['Tsars', 'Ballet', 'Matryoshka dolls', 'Red Square', 'Moscow'],
    ['Trans-Siberian railway', 'Lake Baikal', 'Winter palaces', "St Basil's Cathedral", 'St Petersburg'],
    ['Caviar', 'Chess masters', 'Cosmonauts', 'Kremlin', 'Siberia'],
  ] },
  { name: 'Ukraine', iso2: 'UA', region: 'Europe', tier: 'medium', sets: [
    ['Wheat fields', 'Sunflowers', 'Borscht', 'Chernobyl', 'Kyiv'],
    ['Black Sea ports', 'Carpathian villages', 'Painted Easter eggs', 'Odesa', 'Dnipro River'],
    ['Embroidered shirts', 'Klitschko brothers', 'Golden domes', 'Lviv', 'Blue and yellow flag'],
  ] },
  { name: 'Malta', iso2: 'MT', region: 'Europe', tier: 'medium', sets: [
    ['Megalithic temples', 'Knights', 'Mdina', 'Valletta', 'Mediterranean island'],
    ['Blue Grotto', 'Popeye Village', 'Gozo', 'Fortified harbours', 'Maltese cross'],
    ['Rabbit stew', 'British phone boxes', 'Diving wrecks', 'Grand Harbour', 'Island between Sicily and Africa'],
  ] },
  { name: 'Monaco', iso2: 'MC', region: 'Europe', tier: 'medium', sets: [
    ['Princess Grace', 'Casino', 'Grand Prix', 'Monte Carlo', 'Riviera micro-state'],
    ['Superyachts', 'Millionaires', 'Oceanographic Museum', 'Casino Square', 'French Riviera enclave'],
    ['F1 street circuit', 'Tax haven', "Prince's Palace", 'Second-smallest country', 'Monte Carlo casino'],
  ] },
  { name: 'Cyprus', iso2: 'CY', region: 'Europe', tier: 'medium', sets: [
    ['Halloumi', 'Aphrodite', 'Divided capital', 'Nicosia', 'Mediterranean island east'],
    ['Copper', 'Meze', 'Troodos Mountains', 'Ayia Napa', 'Limassol'],
    ['Commandaria wine', 'UN buffer zone', 'Paphos', 'Green Line', 'Cypriot beaches'],
  ] },
  { name: 'Slovenia', iso2: 'SI', region: 'Europe', tier: 'medium', sets: [
    ['Dragon bridge', 'Postojna caves', 'Julian Alps', 'Ljubljana', 'Lake Bled'],
    ['Beekeeping', 'Predjama Castle', 'Mount Triglav', 'Piran', 'Bled island church'],
    ['Luka Dončić', 'Wine hills', 'Soča River', 'Karst caves', 'Between the Alps and Adriatic'],
  ] },
  { name: 'Slovakia', iso2: 'SK', region: 'Europe', tier: 'medium', sets: [
    ['High Tatras', 'Bryndza cheese', 'Castles', 'Bratislava', 'Danube capital'],
    ['Wooden churches', 'Spiš Castle', 'Ice hockey', 'Mountain huts', 'Tatra peaks'],
    ['Halušky', 'Andy Warhol roots', 'Devín Castle', 'Košice', "Czechoslovakia's other half"],
  ] },
  { name: 'Serbia', iso2: 'RS', region: 'Europe', tier: 'medium', sets: [
    ['Rakija', 'EXIT Festival', 'Djokovic', 'Belgrade', 'Balkans'],
    ['Kafana music', 'Danube fortresses', 'Nikola Tesla', 'Novi Sad', 'The White City'],
    ['Ćevapi', 'Orthodox monasteries', 'Basketball talents', 'Sava River', 'Serbian tennis'],
  ] },
  { name: 'Bulgaria', iso2: 'BG', region: 'Europe', tier: 'medium', sets: [
    ['Rose oil', 'Yogurt', 'Black Sea resorts', 'Rila Monastery', 'Sofia'],
    ['Cyrillic origins', 'Sunny Beach', 'Thracian gold', 'Plovdiv', 'Bulgarian roses'],
    ['Banitsa', 'Kukeri masks', 'Seven Rila Lakes', 'Veliko Tarnovo', 'Balkan Mountains'],
  ] },
  { name: 'Albania', iso2: 'AL', region: 'Europe', tier: 'hard', sets: [
    ['Bunkers', 'Eagles', 'Adriatic beaches', 'Tirana', 'Albanian Riviera'],
    ['Byrek', "Mother Teresa's heritage", 'Berat', 'Gjirokastër', 'Land of the Eagles'],
    ['Raki', 'Skanderbeg', 'Ksamil beaches', 'Ottoman bazaars', 'Double-headed eagle flag'],
  ] },
  { name: 'Montenegro', iso2: 'ME', region: 'Europe', tier: 'hard', sets: [
    ['Black mountain', 'Budva', 'Bay of Kotor', 'Podgorica', 'Adriatic'],
    ['Sveti Stefan', 'Durmitor', 'Tara Canyon', 'Perast', 'Kotor walls'],
    ['Mountain monasteries', 'Lake Skadar', 'Casino Royale setting', 'Herceg Novi', 'Kotor bay cruises'],
  ] },
  { name: 'Bosnia and Herzegovina', iso2: 'BA', region: 'Europe', tier: 'hard', aliases: ['bosnia', 'bosnia herzegovina'], sets: [
    ['1984 Winter Olympics', 'Stari Most', 'Mostar', 'Sarajevo', 'Balkan bridges'],
    ['Coffee culture', 'Baščaršija bazaar', 'Neretva River', 'Bridge diving', 'Sarajevo old town'],
    ['Visoko hills', 'Kravice waterfalls', 'Tunnel of Hope', 'Olympic bobsleigh ruins', 'Herzegovina'],
  ] },
  { name: 'Estonia', iso2: 'EE', region: 'Europe', tier: 'medium', sets: [
    ['E-residency', 'Skype', 'Medieval old town', 'Baltic Sea', 'Tallinn'],
    ['Digital state', 'Bog trails', 'Saaremaa island', 'Kadriorg Palace', 'Tallinn old town'],
    ['Startup unicorns', 'Bolt and Wise', 'Lahemaa forests', 'Narva border', 'Northernmost Baltic state'],
  ] },
  { name: 'Latvia', iso2: 'LV', region: 'Europe', tier: 'medium', sets: [
    ['Black Balsam', 'Song festivals', 'Art Nouveau', 'Baltic Sea', 'Riga'],
    ['Rye bread', 'Jūrmala beach', 'Gauja valley', 'Central Market', 'Riga old town'],
    ['Ice hockey fans', 'Midsummer Līgo', 'Rundāle Palace', 'Daugava River', 'Middle Baltic state'],
  ] },
  { name: 'Lithuania', iso2: 'LT', region: 'Europe', tier: 'medium', sets: [
    ['Hill of Crosses', 'Basketball', 'Curonian Spit', 'Baltic Sea', 'Vilnius'],
    ['Cepelinai', 'Trakai Castle', 'Amber coast', 'Užupis republic', 'Kaunas'],
    ['Pink soup', 'Hot air balloons over the capital', 'Grand Duchy history', 'Nida dunes', 'Southern Baltic state'],
  ] },
  { name: 'Luxembourg', iso2: 'LU', region: 'Europe', tier: 'medium', sets: [
    ['Grand Duchy', 'Banking', 'EU courts', 'Fortress city', 'Luxembourg City'],
    ['Free public transport', 'Ardennes castles', 'Moselle vineyards', 'Bock casemates', "Benelux's smallest"],
    ['Richest per capita', 'Schengen village', 'Steel history', 'Multilingual signs', 'Tiny Grand Duchy'],
  ] },

  // ---- Asia ----
  { name: 'Japan', iso2: 'JP', region: 'Asia', tier: 'easy', sets: [
    ['Bullet train', 'Cherry blossom', 'Sushi', 'Mount Fuji', 'Tokyo'],
    ['Onsen baths', 'Ryokan inns', 'Torii gates', 'Kyoto temples', 'Samurai'],
    ['Anime', 'Ramen', 'Sumo', 'Nintendo', 'Godzilla'],
  ] },
  { name: 'China', iso2: 'CN', region: 'Asia', tier: 'easy', sets: [
    ['Calligraphy', 'Pandas', 'Terracotta Army', 'Great Wall', 'Beijing'],
    ['Dumplings', 'High-speed rail', 'Forbidden City', 'Shanghai skyline', 'Yangtze River'],
    ['Mahjong', 'Kung fu', 'Dragon boat races', 'Silk', 'Chinese New Year'],
  ] },
  { name: 'South Korea', iso2: 'KR', region: 'Asia', tier: 'easy', aliases: ['korea', 'republic of korea'], sets: [
    ['Kimchi', 'K-pop', 'Taekwondo', 'Gangnam', 'Seoul'],
    ['Jeju Island', 'Hanbok', 'DMZ border', 'Squid Game', 'Korean BBQ'],
    ['Soju', 'K-dramas', 'PC gaming rooms', 'BTS', 'Samsung'],
  ] },
  { name: 'India', iso2: 'IN', region: 'Asia', tier: 'easy', sets: [
    ['Bollywood', 'Curry', 'Holi festival', 'Taj Mahal', 'New Delhi'],
    ['Yoga', 'Auto rickshaws', 'The Ganges', 'Jaipur palaces', 'Mumbai'],
    ['Chai', 'Cricket fever', 'Diwali', 'Kerala backwaters', 'Indian railways'],
  ] },
  { name: 'Thailand', iso2: 'TH', region: 'Asia', tier: 'easy', sets: [
    ['Elephants', 'Tuk-tuk', 'Pad Thai', 'Phuket', 'Bangkok'],
    ['Andaman islands', 'Full moon parties', 'Floating markets', 'Golden temples', 'Thai massage'],
    ['Street food stalls', 'Koh Samui', 'Muay Thai', 'Songkran water festival', 'Land of Smiles'],
  ] },
  { name: 'Vietnam', iso2: 'VN', region: 'Asia', tier: 'easy', sets: [
    ['Motorbikes', 'Pho', 'Rice paddies', 'Ha Long Bay', 'Hanoi'],
    ['Banh mi', 'Lanterns of Hoi An', 'Mekong Delta', 'Cu Chi tunnels', 'Ho Chi Minh City'],
    ['Conical hats', 'Egg coffee', 'Sapa terraces', 'Da Nang', 'Saigon'],
  ] },
  { name: 'Indonesia', iso2: 'ID', region: 'Asia', tier: 'medium', sets: [
    ['Komodo dragons', 'Batik', 'Rice terraces', 'Bali', 'Jakarta'],
    ['17,000 islands', 'Borobudur', 'Ubud', 'Volcano sunrises', 'Java'],
    ['Nasi goreng', 'Gamelan', 'Surfing Uluwatu', 'Gili Islands', 'Balinese temples'],
  ] },
  { name: 'Malaysia', iso2: 'MY', region: 'Asia', tier: 'medium', sets: [
    ['Durian', 'Orangutans', 'Batu Caves', 'Petronas Towers', 'Kuala Lumpur'],
    ['Nasi lemak', 'Cameron Highlands', 'Langkawi', 'Borneo jungles', 'Penang'],
    ['Roti canai', 'Rainforest canopies', 'Perhentian Islands', 'Malacca', 'Truly Asia slogan'],
  ] },
  { name: 'Philippines', iso2: 'PH', region: 'Asia', tier: 'medium', sets: [
    ['Karaoke', 'Jeepneys', 'Adobo', '7,000 islands', 'Manila'],
    ['Chocolate Hills', 'Tarsiers', 'Boracay', 'Palawan', 'Cebu'],
    ['Basketball obsession', 'Halo-halo', 'Banaue rice terraces', 'Manny Pacquiao', 'Filipino hospitality'],
  ] },
  { name: 'Singapore', iso2: 'SG', region: 'Asia', tier: 'easy', sets: [
    ['Fines', 'Hawker centres', 'Merlion', 'Marina Bay', 'Changi'],
    ['Chilli crab', 'Gardens by the Bay', 'Sentosa', 'Raffles Hotel', 'City-state'],
    ['Spotless streets', 'Chewing gum ban', 'Orchard Road', 'Supertrees', 'Lion City'],
  ] },
  { name: 'United Arab Emirates', iso2: 'AE', region: 'Asia', tier: 'easy', aliases: ['uae', 'emirates'], sets: [
    ['Gold souks', 'Desert safari', 'Palm islands', 'Burj Khalifa', 'Dubai'],
    ['Seven emirates', 'Sheikh Zayed Mosque', 'Ferrari World', 'Louvre outpost', 'Abu Dhabi'],
    ['Skyscrapers in the desert', 'Dune bashing', 'Man-made islands', 'Burj Al Arab', 'Emirates airline'],
  ] },
  { name: 'Israel', iso2: 'IL', region: 'Asia', tier: 'easy', sets: [
    ['Kibbutz', 'Dead Sea', 'Western Wall', 'Jerusalem', 'Tel Aviv'],
    ['Masada', 'Sea of Galilee', 'Old City quarters', 'Negev Desert', 'Holy Land'],
    ['Startup nation', 'Bauhaus city', 'Eilat diving', 'Shakshuka', 'Hebrew'],
  ] },
  { name: 'Saudi Arabia', iso2: 'SA', region: 'Asia', tier: 'medium', sets: [
    ['Dates', 'Camels', 'Desert kingdom', 'Mecca', 'Riyadh'],
    ['Oil wealth', 'AlUla', 'Red Sea megaprojects', 'Medina', 'Kaaba'],
    ['Empty Quarter', 'NEOM', 'Arabian horses', 'Jeddah', 'Two Holy Mosques'],
  ] },
  { name: 'Nepal', iso2: 'NP', region: 'Asia', tier: 'medium', sets: [
    ['Prayer flags', 'Sherpas', 'Himalayas', 'Mount Everest', 'Kathmandu'],
    ['Momos', 'Annapurna', 'Living goddess', 'Lumbini', 'Base camp treks'],
    ['Yaks', 'Non-rectangular flag', 'Pokhara', 'Gurkhas', 'Everest expeditions'],
  ] },
  { name: 'Sri Lanka', iso2: 'LK', region: 'Asia', tier: 'medium', sets: [
    ['Cinnamon', 'Tea plantations', 'Surfing', 'Colombo', 'Ceylon'],
    ['Leopards of Yala', 'Sigiriya rock', 'Train to Ella', 'Galle Fort', 'Indian Ocean teardrop'],
    ['Coconut sambol', 'Stilt fishermen', 'Temple of the Tooth', 'Kandy', 'Ceylon tea'],
  ] },
  { name: 'Pakistan', iso2: 'PK', region: 'Asia', tier: 'medium', sets: [
    ['K2', 'Cricket', 'Indus River', 'Karachi', 'Islamabad'],
    ['Hunza Valley', 'Truck art', 'Badshahi Mosque', 'Lahore', 'Karakoram Highway'],
    ['Mangoes', 'Squash champions', 'Khyber Pass', 'Gwadar coast', 'Lahore forts'],
  ] },
  { name: 'Kazakhstan', iso2: 'KZ', region: 'Asia', tier: 'hard', sets: [
    ['Steppe', 'Nomads', 'Baikonur', 'Almaty', 'Astana'],
    ['Horse milk', "Apples' origin", 'Caspian shore', 'Charyn Canyon', 'Silk Road steppe'],
    ['Kumis', 'Yurts', 'Tulip origins', 'Medeu skating rink', 'Ninth-largest country'],
  ] },
  { name: 'Cambodia', iso2: 'KH', region: 'Asia', tier: 'medium', sets: [
    ['Mekong', 'Khmer', 'Siem Reap', 'Phnom Penh', 'Angkor Wat'],
    ['Bayon stone faces', 'Tonlé Sap', 'Fish amok', 'Apsara dance', 'Temples of Angkor'],
    ['Kampot pepper', 'Floating villages', 'Royal Palace', 'Sihanoukville', 'Khmer Empire'],
  ] },
  { name: 'Jordan', iso2: 'JO', region: 'Asia', tier: 'medium', sets: [
    ['Bedouin', 'Wadi Rum', 'Amman', 'Dead Sea shore', 'Petra'],
    ['Mansaf', 'Desert castles', 'Aqaba diving', 'Roman Jerash', 'The Rose City'],
    ['Lawrence of Arabia scenery', 'Madaba mosaics', "King's Highway", 'Floating in salt water', 'Treasury carved in rock'],
  ] },
  { name: 'Qatar', iso2: 'QA', region: 'Asia', tier: 'medium', sets: [
    ['Falcons', 'Pearl diving', 'World Cup 2022', 'Al Jazeera', 'Doha'],
    ['Souq Waqif', 'Museum of Islamic Art', 'Inland desert sea', 'Corniche skyline', 'Qatar Airways'],
    ['Camel racing', 'Education City', 'The Pearl island', 'Lusail', 'Arabian Gulf peninsula'],
  ] },
  { name: 'Maldives', iso2: 'MV', region: 'Asia', tier: 'medium', sets: [
    ['Atolls', 'Overwater villas', 'Underwater restaurants', 'Honeymoons', 'Malé'],
    ['Seaplanes', 'Manta rays', 'House reefs', 'Bioluminescent beaches', 'Indian Ocean resorts'],
    ['Lowest country on Earth', '1,000+ islands', 'Whale sharks', 'Sandbank picnics', 'Luxury water bungalows'],
  ] },
  { name: 'Mongolia', iso2: 'MN', region: 'Asia', tier: 'medium', sets: [
    ['Gers', 'Eagle hunters', 'Gobi Desert', 'Genghis Khan', 'Ulaanbaatar'],
    ['Throat singing', 'Przewalski horses', 'Naadam festival', 'Endless steppe', "Khan's empire"],
    ['Airag', 'Two-humped camels', 'Coldest capital', 'Dinosaur fossils', 'Between Russia and China'],
  ] },
  { name: 'Bangladesh', iso2: 'BD', region: 'Asia', tier: 'medium', sets: [
    ['Rickshaws', 'Textiles', 'River deltas', 'Bengal tigers', 'Dhaka'],
    ['Monsoon rivers', 'The Sundarbans', "Cox's Bazar", 'Jute', 'Bay of Bengal'],
    ['Hilsa fish', 'Cricket Tigers', 'Garment factories', 'Padma River', 'Bengali language'],
  ] },
  { name: 'Taiwan', iso2: 'TW', region: 'Asia', tier: 'medium', sets: [
    ['Bubble tea', 'Night markets', 'Semiconductors', 'Taipei 101', 'Taipei'],
    ['Stinky tofu', 'Taroko Gorge', 'Sun Moon Lake', 'Alishan railway', 'Formosa'],
    ['Scooter waves', 'Convenience stores', 'Sky lantern festival', 'Beef noodle soup', 'TSMC chips'],
  ] },
  { name: 'Laos', iso2: 'LA', region: 'Asia', tier: 'hard', sets: [
    ['Sticky rice', 'Waterfalls', 'Luang Prabang', 'Vientiane', 'Mekong riverbanks'],
    ['Alms-giving monks', 'Kuang Si falls', 'Plain of Jars', 'Slow boats', 'Landlocked Southeast Asia'],
    ['Coffee plateau', 'River tubing', 'Golden stupas', 'Vang Vieng', 'Beerlao'],
  ] },
  { name: 'Oman', iso2: 'OM', region: 'Asia', tier: 'hard', sets: [
    ['Frankincense', 'Wadis', 'Dhow boats', 'Sultanate', 'Muscat'],
    ['Desert forts', 'Nizwa', 'Turtle beaches', 'Jebel Akhdar', 'Arabian Sea coast'],
    ['Halwa', 'Khanjar daggers', 'Salalah monsoon', 'Empty Quarter edge', 'Sultan Qaboos Mosque'],
  ] },
  { name: 'Uzbekistan', iso2: 'UZ', region: 'Asia', tier: 'hard', sets: [
    ['Silk Road', 'Registan', 'Samarkand', 'Bukhara', 'Tashkent'],
    ['Plov', 'Blue domes', 'Khiva', 'Cotton fields', 'Silk Road cities'],
    ['Melons', "Timur's empire", 'Turquoise tilework', 'Aral Sea', "Central Asia's heart"],
  ] },

  // ---- Africa ----
  { name: 'Egypt', iso2: 'EG', region: 'Africa', tier: 'easy', sets: [
    ['Pharaohs', 'Nile', 'Hieroglyphs', 'Sphinx', 'Pyramids'],
    ['Felucca boats', 'Valley of the Kings', 'Red Sea diving', 'Luxor', 'Cairo'],
    ['Papyrus', 'Tutankhamun', 'Abu Simbel', 'Alexandria', 'Mummies'],
  ] },
  { name: 'Morocco', iso2: 'MA', region: 'Africa', tier: 'easy', sets: [
    ['Tagine', 'Souks', 'Sahara gateway', 'Casablanca', 'Marrakech'],
    ['Mint tea', 'Chefchaouen blue city', 'Fes medina', 'Camel treks in dunes', 'Atlas Mountains'],
    ['Argan oil', 'Riads', 'Djemaa el-Fna', 'Essaouira', 'Kasbahs'],
  ] },
  { name: 'South Africa', iso2: 'ZA', region: 'Africa', tier: 'easy', sets: [
    ['Rugby', 'Penguins', 'Winelands', 'Table Mountain', 'Cape Town'],
    ['Big Five safaris', 'Kruger', 'Garden Route', 'Nelson Mandela', 'Johannesburg'],
    ['Braai', 'Biltong', 'Soweto', 'Springboks', 'Cape of Good Hope'],
  ] },
  { name: 'Kenya', iso2: 'KE', region: 'Africa', tier: 'easy', sets: [
    ['Marathon runners', 'Maasai', 'Great Migration', 'Safari', 'Nairobi'],
    ['Rift Valley', 'Flamingo lakes', 'Mombasa coast', 'Big cats of the Mara', 'Mount Kenya'],
    ['Ugali', 'Tea highlands', 'Matatus', 'Amboseli elephants', 'Masai Mara'],
  ] },
  { name: 'Tanzania', iso2: 'TZ', region: 'Africa', tier: 'medium', sets: [
    ['Spice islands', 'Ngorongoro', 'Zanzibar', 'Serengeti', 'Kilimanjaro'],
    ["Freddie Mercury's birthplace", 'Stone Town', 'Baobab valleys', 'Wildebeest crossings', "Africa's highest peak"],
    ['Swahili coast', 'Dar es Salaam', 'Selous safaris', 'Zanzibar spice tours', 'Tanzanite'],
  ] },
  { name: 'Nigeria', iso2: 'NG', region: 'Africa', tier: 'easy', sets: [
    ['Nollywood', 'Afrobeats', 'Jollof rice', 'Lagos', 'Abuja'],
    ['Fela Kuti', 'Suya', 'Niger Delta', '200 million people', 'Naija'],
    ['Green-white-green flag', 'Burna Boy', 'Egusi soup', 'Super Eagles', 'Giant of Africa'],
  ] },
  { name: 'Ghana', iso2: 'GH', region: 'Africa', tier: 'medium', sets: [
    ['Highlife music', 'Cocoa', 'Kente cloth', 'Gold Coast', 'Accra'],
    ['Cape Coast castles', 'Lake Volta', 'Year of Return', 'Kakum canopy walk', 'Black Stars'],
    ['Jollof rivalry', 'Kumasi', 'Ashanti kingdom', 'Fantasy coffins', 'Ghanaian cocoa'],
  ] },
  { name: 'Ethiopia', iso2: 'ET', region: 'Africa', tier: 'medium', sets: [
    ['Coffee ceremony', 'Injera', 'Lucy fossil', 'Lalibela', 'Addis Ababa'],
    ['13-month calendar', 'Simien Mountains', 'Blue Nile falls', 'Rock-hewn churches', 'Abyssinia'],
    ['Teff grain', 'Danakil Depression', 'Haile Selassie', 'Marathon legends', 'Horn of Africa'],
  ] },
  { name: 'Uganda', iso2: 'UG', region: 'Africa', tier: 'hard', sets: [
    ['Crested crane', 'Gorilla trekking', 'Source of the Nile', 'Lake Victoria', 'Kampala'],
    ['Rolex snack', 'Bwindi forest', 'Murchison Falls', 'Boda bodas', 'Pearl of Africa'],
    ['Matoke', 'Shoebill storks', 'White-water rafting at Jinja', 'Equator markers', "The Nile's source"],
  ] },
  { name: 'Rwanda', iso2: 'RW', region: 'Africa', tier: 'medium', sets: [
    ['Thousand hills', 'Volcanoes National Park', 'Mountain gorillas', 'Coffee hills', 'Kigali'],
    ['Clean streets', 'Umuganda community day', 'Lake Kivu', 'Canopy walkways', 'Land of a thousand hills'],
    ['Intore dancers', 'Tea terraces', 'Akagera park', 'Car-free Sundays', 'Gorilla naming ceremony'],
  ] },
  { name: 'Namibia', iso2: 'NA', region: 'Africa', tier: 'medium', sets: [
    ['Skeleton Coast', 'Red dunes', 'Sossusvlei', 'Windhoek', 'Namib Desert'],
    ['German colonial towns', 'Himba people', 'Etosha pan', 'Fish River Canyon', 'Dune 45'],
    ['Kolmanskop ghost town', 'Desert elephants', 'Star-gazing skies', 'Swakopmund', 'Oldest desert on Earth'],
  ] },
  { name: 'Botswana', iso2: 'BW', region: 'Africa', tier: 'medium', sets: [
    ['Elephants', 'Diamonds', 'Kalahari', 'Okavango Delta', 'Gaborone'],
    ['Mokoro canoes', 'Chobe River', 'San bushmen', 'Salt pans', 'Delta safaris'],
    ["No 1 Ladies' Detective Agency", 'Makgadikgadi', 'Meerkats', 'Luxury safari lodges', 'Elephant capital of Africa'],
  ] },
  { name: 'Zimbabwe', iso2: 'ZW', region: 'Africa', tier: 'medium', sets: [
    ['Balancing rocks', 'Hwange', 'Zambezi', 'Victoria Falls', 'Harare'],
    ['Stone sculptures', 'Lake Kariba', 'Mana Pools', 'The smoke that thunders', 'Great Zimbabwe ruins'],
    ['Sadza', 'Baobab trees', 'Bulawayo', "Devil's Pool", 'Mosi-oa-Tunya'],
  ] },
  { name: 'Madagascar', iso2: 'MG', region: 'Africa', tier: 'medium', sets: [
    ['Vanilla pods', 'Chameleons', 'Pirate history', 'Lemurs', 'Antananarivo'],
    ['Fourth-largest island', 'Nosy Be', 'Zebu cattle', 'Spiny forests', 'Avenue of the Baobabs'],
    ['Ylang-ylang', 'Whale watching', 'Tsingy stone forests', 'Ring-tailed lemurs', 'Malagasy language'],
  ] },
  { name: 'Algeria', iso2: 'DZ', region: 'Africa', tier: 'medium', sets: [
    ['Casbah', 'Atlas foothills', 'Couscous', 'Algiers', 'Sahara Desert'],
    ['Largest African country', 'Tuareg south', 'Roman Timgad', 'Oran', 'Barbary coast'],
    ['Raï music', 'Date oases', "Constantine's bridges", 'Hoggar Mountains', 'North African giant'],
  ] },
  { name: 'Tunisia', iso2: 'TN', region: 'Africa', tier: 'medium', sets: [
    ['Star Wars sets', 'Sidi Bou Said', 'Medina', 'Carthage', 'Tunis'],
    ['Harissa', 'Djerba', 'El Jem amphitheatre', 'Matmata cave homes', "Hannibal's home"],
    ['Jasmine revolution', 'Dates and olives', 'Blue-and-white villages', 'Mediterranean beaches', 'Carthage ruins'],
  ] },
  { name: 'Senegal', iso2: 'SN', region: 'Africa', tier: 'medium', sets: [
    ['Teranga', 'Wrestling', 'Dakar Rally', 'Gorée Island', 'Dakar'],
    ['Thieboudienne', 'Pink Lake Retba', 'Saint-Louis', 'Baobab savannas', 'Westernmost Africa'],
    ['Mbalax music', 'Sabar drums', 'Djoudj pelicans', 'Sine-Saloum delta', 'Paris-Dakar finish line'],
  ] },
  { name: 'Mozambique', iso2: 'MZ', region: 'Africa', tier: 'hard', sets: [
    ['Prawns', 'Dhows', 'Bazaruto', 'Indian Ocean coast', 'Maputo'],
    ['Peri-peri', 'Portuguese-speaking Africa', 'Tofo diving', 'Gorongosa', 'Island of Mozambique'],
    ['Marrabenta music', 'Cashews', 'Quirimbas atolls', 'Flag with a rifle', 'Maputo bay'],
  ] },

  // ---- North America ----
  { name: 'United States', iso2: 'US', region: 'North America', tier: 'easy', aliases: ['usa', 'united states of america', 'america'], sets: [
    ['Route 66', 'Hollywood', 'Grand Canyon', 'Statue of Liberty', 'New York'],
    ['Yellowstone', 'Thanksgiving', 'Silicon Valley', 'White House', 'Washington DC'],
    ['Diners', 'Super Bowl', 'Las Vegas', 'Fourth of July', 'Stars and Stripes'],
  ] },
  { name: 'Canada', iso2: 'CA', region: 'North America', tier: 'easy', sets: [
    ['Maple syrup', 'Ice hockey', 'Mounties', 'Niagara Falls', 'Toronto'],
    ['Poutine', 'Banff', 'French-speaking Quebec', 'Polar bears of Churchill', 'Vancouver'],
    ['Politeness jokes', 'Tim Hortons', 'Moose crossings', 'CN Tower', 'Maple leaf flag'],
  ] },
  { name: 'Mexico', iso2: 'MX', region: 'North America', tier: 'easy', sets: [
    ['Mariachi', 'Day of the Dead', 'Tacos', 'Aztecs', 'Cancún'],
    ['Lucha libre', 'Cenotes', 'Frida Kahlo', 'Chichén Itzá', 'Mexico City'],
    ['Tequila', 'Guacamole', 'Mayan Riviera', 'Sombreros', 'Piñatas'],
  ] },
  { name: 'Cuba', iso2: 'CU', region: 'North America', tier: 'easy', sets: [
    ['Classic cars', 'Cigars', 'Salsa', 'Che Guevara', 'Havana'],
    ['Mojitos', 'Buena Vista Social Club', 'Varadero', 'Revolution murals', 'Caribbean time capsule'],
    ['Rum', 'Dominoes', "Hemingway's haunt", 'Trinidad cobblestones', 'Castro'],
  ] },
  { name: 'Costa Rica', iso2: 'CR', region: 'North America', tier: 'medium', sets: [
    ['Pura Vida', 'Sloths', 'Cloud forest', 'Zip-lining', 'San José'],
    ['Gallo pinto', 'Arenal volcano', 'Toucans', 'Surf on both coasts', 'No army since 1948'],
    ['Coffee fincas', 'Monteverde bridges', 'Manuel Antonio', 'Turtle nesting', 'The Rich Coast'],
  ] },
  { name: 'Panama', iso2: 'PA', region: 'North America', tier: 'medium', sets: [
    ['Isthmus', 'Two oceans', 'Balboa', 'Canal', 'Panama City'],
    ['Casco Viejo', 'San Blas islands', 'Bocas del Toro', 'Ship locks', 'Canal between oceans'],
    ['Darién Gap', 'Mola textiles', 'Skyline of the tropics', 'Miraflores locks', 'Hats named elsewhere'],
  ] },
  { name: 'Jamaica', iso2: 'JM', region: 'North America', tier: 'easy', sets: [
    ['Jerk chicken', 'Reggae', 'Bob Marley', 'Usain Bolt', 'Kingston'],
    ['Blue Mountain coffee', "Dunn's River Falls", 'Rastafari', 'Montego Bay', 'Ocho Rios'],
    ['Patois', 'Cool Runnings bobsleigh', 'Ackee and saltfish', 'Negril cliffs', 'One Love'],
  ] },
  { name: 'Dominican Republic', iso2: 'DO', region: 'North America', tier: 'medium', aliases: ['dominican rep'], sets: [
    ['Merengue', 'Baseball players', 'Punta Cana', 'Santo Domingo', 'Hispaniola'],
    ['Bachata', 'Damajagua waterfalls', 'Whales of Samaná', 'Oldest colonial city', 'Caribbean all-inclusives'],
    ['Mamajuana', 'Larimar gemstone', 'Saona Island', 'Colonial Zone', 'Punta Cana resorts'],
  ] },
  { name: 'Guatemala', iso2: 'GT', region: 'North America', tier: 'medium', sets: [
    ['Quetzal bird', 'Lake Atitlán', 'Mayan ruins', 'Antigua', 'Tikal'],
    ['Chicken buses', 'Volcano hikes', 'Semana Santa carpets', 'Chichicastenango market', 'Maya heartland'],
    ['Worry dolls', 'Pacaya lava', 'Textile markets', 'Flores island town', 'Land of eternal spring'],
  ] },
  { name: 'Honduras', iso2: 'HN', region: 'North America', tier: 'hard', sets: [
    ['Roatán', 'Scuba diving', 'Copán ruins', 'Tegucigalpa', 'Caribbean coast'],
    ['Whale sharks of Utila', 'Bay Islands', 'Garifuna culture', 'Pico Bonito', 'Mayan Copán'],
    ['Baleadas', 'Rain of fish legend', 'La Ceiba', 'Coral reef diving', 'Banana republic origin'],
  ] },
  { name: 'Bahamas', iso2: 'BS', region: 'North America', tier: 'medium', aliases: ['the bahamas'], sets: [
    ['Swimming pigs', 'Turquoise water', 'Atlantis resort', 'Nassau', 'Caribbean islands'],
    ['Conch salad', 'The Exumas', 'Junkanoo', 'Pink sand beaches', 'Grand Bahama'],
    ['700 islands', 'Blue holes', 'Paradise Island', 'Cruise capital', 'Nassau straw market'],
  ] },

  // ---- South America ----
  { name: 'Brazil', iso2: 'BR', region: 'South America', tier: 'easy', sets: [
    ['Carnival', 'Amazon', 'Football', 'Copacabana', 'Rio de Janeiro'],
    ['Caipirinha', 'The Pantanal', 'Samba schools', 'Christ the Redeemer', 'São Paulo'],
    ['Açaí', 'Havaianas', 'Pelé', 'Ipanema', 'Portuguese-speaking giant'],
  ] },
  { name: 'Argentina', iso2: 'AR', region: 'South America', tier: 'easy', sets: [
    ['Tango', 'Gauchos', 'Steak', 'Messi', 'Buenos Aires'],
    ['Malbec wine', 'Iguazú Falls', 'Evita', 'La Boca', 'Maradona'],
    ['Empanadas', 'Polo', 'Perito Moreno glacier', 'Ushuaia', 'Land of silver'],
  ] },
  { name: 'Chile', iso2: 'CL', region: 'South America', tier: 'easy', sets: [
    ['Atacama', 'Easter Island', 'Andes ski', 'Patagonia', 'Santiago'],
    ['Thinnest country', 'Torres del Paine', 'Valparaíso murals', 'Moai statues', 'Chilean wine'],
    ['Copper mines', 'Stargazing deserts', 'Chiloé stilt houses', 'Viña del Mar', 'Andes backbone'],
  ] },
  { name: 'Peru', iso2: 'PE', region: 'South America', tier: 'easy', sets: [
    ['Ceviche', 'Llamas', 'Nazca Lines', 'Incas', 'Machu Picchu'],
    ['Pisco sour', 'Rainbow Mountain', 'Sacred Valley', 'Cusco', 'Lima'],
    ['Alpaca wool', 'Amazon headwaters', 'Colca Canyon', 'Quechua', 'Inca Trail'],
  ] },
  { name: 'Colombia', iso2: 'CO', region: 'South America', tier: 'medium', sets: [
    ['Emeralds', 'Coffee triangle', 'Shakira', 'Cartagena', 'Bogotá'],
    ['Salsa of Cali', 'Lost City trek', 'Medellín', 'Caño Cristales rainbow river', 'García Márquez'],
    ['Cumbia', 'Wax palms', 'Tayrona beaches', 'Paisa region', 'Colombian coffee'],
  ] },
  { name: 'Ecuador', iso2: 'EC', region: 'South America', tier: 'medium', sets: [
    ['Panama hats', 'Cotopaxi', 'Quito', 'Equator line', 'Galápagos'],
    ['Banana exports', 'Otavalo market', 'Middle of the World monument', 'Blue-footed boobies', "Darwin's islands"],
    ['Cacao farms', 'Montañita surf', 'Cuenca', 'Chimborazo', 'Named after the equator'],
  ] },
  { name: 'Bolivia', iso2: 'BO', region: 'South America', tier: 'medium', sets: [
    ['Altiplano', 'Lake Titicaca', 'La Paz', 'Salt flats', 'Uyuni'],
    ['Cholitas wrestling', 'Death Road cycling', "Witches' market", 'Highest capital city', 'Salar mirror'],
    ['Coca leaves', 'Dinosaur footprints of Sucre', 'Flamingo lagoons', 'Cable car city', 'Landlocked Andes'],
  ] },
  { name: 'Uruguay', iso2: 'UY', region: 'South America', tier: 'medium', sets: [
    ['Candombe', 'Beef', 'Punta del Este', 'Montevideo', 'River Plate'],
    ['Chivito', 'Colonia del Sacramento', 'Mate culture', 'First World Cup hosts', 'La Celeste'],
    ['Tannat wine', 'Cabo Polonio', 'Rambla sunsets', 'Suárez and Cavani', 'Between Brazil and Argentina'],
  ] },
  { name: 'Venezuela', iso2: 'VE', region: 'South America', tier: 'medium', sets: [
    ['Orinoco', 'Arepas', 'Oil reserves', 'Angel Falls', 'Caracas'],
    ['Miss Universe titles', 'Tepui mountains', 'Catatumbo lightning', 'Margarita Island', "World's highest waterfall"],
    ['Joropo music', 'Andes to Caribbean', 'Canaima', 'Beauty pageants', "Bolívar's homeland"],
  ] },
  { name: 'Paraguay', iso2: 'PY', region: 'South America', tier: 'hard', sets: [
    ['Guaraní language', 'Itaipu Dam', 'Yerba mate', 'Landlocked', 'Asunción'],
    ['Tereré iced mate', 'Jesuit missions', 'Chaco wilderness', 'Ñandutí lace', 'Heart of South America'],
    ['Chipa bread', 'Harp music', 'Mennonite colonies', 'Paraná River', 'Guaraní currency'],
  ] },

  // ---- Oceania ----
  { name: 'Australia', iso2: 'AU', region: 'Oceania', tier: 'easy', sets: [
    ['Outback', 'Kangaroos', 'Great Barrier Reef', 'Boomerang', 'Sydney Opera House'],
    ['Vegemite', 'Uluru', 'Bondi Beach', 'Koalas', 'Melbourne'],
    ['Surf lifesavers', 'Didgeridoo', 'Tasmania', 'AFL', 'Down Under'],
  ] },
  { name: 'New Zealand', iso2: 'NZ', region: 'Oceania', tier: 'easy', sets: [
    ['Kiwis', 'Haka', 'Hobbits', 'Sheep', 'Auckland'],
    ['Bungee jumping origin', 'Milford Sound', 'Maori culture', 'Queenstown', 'All Blacks'],
    ['Glowworm caves', 'Rotorua geothermal', 'Lord of the Rings sets', 'Wellington', 'Land of the long white cloud'],
  ] },
  { name: 'Fiji', iso2: 'FJ', region: 'Oceania', tier: 'medium', sets: [
    ['Kava', 'Rugby sevens', 'Bula', 'Island resorts', 'Suva'],
    ['Coral Coast', 'Firewalking', 'Village homestays', '333 islands', 'Fiji Water'],
    ['Lovo feast', 'Soft coral capital', 'Mamanuca Islands', 'Cloudbreak surf', 'South Pacific paradise'],
  ] },
  { name: 'Papua New Guinea', iso2: 'PG', region: 'Oceania', tier: 'hard', aliases: ['png'], sets: [
    ['800 languages', 'Birds of paradise', 'Highlands', 'Kokoda Track', 'Port Moresby'],
    ['Sing-sing festivals', 'Sepik River carvings', 'Rainforest tribes', 'Mount Wilhelm', 'Shares an island with Indonesia'],
    ['Bilum bags', 'Huli wigmen', 'Coral Triangle', 'Bougainville', "The Pacific's largest nation"],
  ] },
  // ---- Europe (added 16 Sep 2026) ----
  { name: 'Belarus', iso2: 'BY', region: 'Europe', tier: 'medium', sets: [
    ['Draniki', 'Flax fields', 'European bison', 'Landlocked between Poland and Russia', 'Minsk'],
    ['Mir Castle', 'Brest Fortress', 'Marc Chagall', 'Belovezhskaya Pushcha forest', 'Belarusian ruble'],
    ['Cold War architecture', 'Nyasvizh Palace', 'Vitebsk', 'Chernobyl fallout fell here', 'Independence Avenue'],
  ] },
  { name: 'Moldova', iso2: 'MD', region: 'Europe', tier: 'hard', aliases: ['republic of moldova'], sets: [
    ['Mămăligă', 'Wine cellars', 'Landlocked', 'Between Romania and Ukraine', 'Chișinău'],
    ['Cricova underground city', 'Mileștii Mici', 'Transnistria', 'Romanian is spoken here', 'Europe’s least-visited country'],
    ['Orheiul Vechi', 'Sunflower fields', 'Plăcintă', 'Codru forests', 'Wine is a third of its exports'],
  ] },
  { name: 'North Macedonia', iso2: 'MK', region: 'Europe', tier: 'hard', aliases: ['macedonia'], sets: [
    ['Ajvar', 'Landlocked Balkans', 'Ohrid pearls', 'Changed its name in 2019', 'Skopje'],
    ['Lake Ohrid', 'Mother Teresa was born here', 'Alexander the Great statues', 'Šar Mountains', 'Former Yugoslav republic'],
    ['Tavče gravče', 'Matka Canyon', 'Bitola', 'Stone Bridge', 'Vardar river'],
  ] },
  { name: 'Georgia', iso2: 'GE', region: 'Europe', tier: 'hard', sets: [
    ['Qvevri clay pots', 'Supra feasts', 'Its own alphabet', 'Caucasus mountains', 'Tbilisi'],
    ['Khachapuri', 'Svaneti towers', 'Sulphur baths', '8,000 years of winemaking', 'Between Russia and Turkey'],
    ['Khinkali dumplings', 'Kazbegi', 'Batumi on the Black Sea', 'Gergeti Trinity Church', 'Saperavi wine'],
  ] },
  { name: 'Armenia', iso2: 'AM', region: 'Europe', tier: 'hard', sets: [
    ['Lavash', 'Apricots', 'Its own alphabet', 'Landlocked Caucasus', 'Yerevan'],
    ['Mount Ararat on the skyline', 'Khachkar stone crosses', 'Lake Sevan', 'First state to adopt Christianity', 'Tatev monastery'],
    ['Duduk music', 'Pink tuff stone buildings', 'Garni Temple', 'Ancient winery at Areni', 'Dram currency'],
  ] },
  { name: 'Azerbaijan', iso2: 'AZ', region: 'Europe', tier: 'hard', sets: [
    ['Mud volcanoes', 'Caspian Sea', 'Land of Fire', 'Oil derricks', 'Baku'],
    ['Flame Towers', 'Burning hillside at Yanar Dag', 'Carpet weaving', 'Formula 1 street circuit', 'Old City of Icherisheher'],
    ['Plov', 'Pomegranates', 'Sheki halva', 'Zoroastrian fire temple', 'Manat currency'],
  ] },
  { name: 'Andorra', iso2: 'AD', region: 'Europe', tier: 'hard', sets: [
    ['Duty-free shopping', 'Ski slopes', 'Catalan is the official language', 'Pyrenees micro-state', 'Andorra la Vella'],
    ['Two co-princes', 'No airport', 'Grandvalira', 'Between France and Spain', 'Highest capital in Europe'],
    ['Caldea spa', 'Romanesque churches', 'Uses the euro without being in the EU', 'Population under 90,000', 'Vallnord'],
  ] },
  { name: 'San Marino', iso2: 'SM', region: 'Europe', tier: 'hard', sets: [
    ['Three towers on a crag', 'Stamps and coins', 'Completely surrounded by Italy', 'Mount Titano', 'The world’s oldest republic'],
    ['Two captains regent', 'Guaita fortress', 'Crossbow tournaments', 'Founded in 301 AD', 'Borders only Italy'],
    ['Piadina', 'Duty-free shops on a hill', 'Sammarinese', 'Uses the euro, not in the EU', '61 square kilometres'],
  ] },
  { name: 'Liechtenstein', iso2: 'LI', region: 'Europe', tier: 'hard', sets: [
    ['Dentures manufacturing', 'Doubly landlocked', 'A reigning prince', 'Between Switzerland and Austria', 'Vaduz'],
    ['Swiss franc', 'Vaduz Castle', 'Malbun ski area', 'No airport', 'Alpine principality of 40,000'],
    ['Rhine valley', 'Postage stamp museum', 'Gutenberg Castle', 'German-speaking micro-state', 'Prince Hans-Adam II'],
  ] },
  { name: 'Vatican City', iso2: 'VA', region: 'Europe', tier: 'medium', aliases: ['the vatican', 'holy see'], sets: [
    ['Swiss Guard', 'Smallest country on earth', 'Its own post office', 'Inside another capital city', 'St Peter’s Basilica'],
    ['Sistine Chapel', 'Conclave', 'Latin on the cashpoints', 'Michelangelo’s ceiling', 'The Pope lives here'],
    ['Apostolic Palace', 'Bernini’s colonnade', 'Surrounded entirely by Rome', '0.49 square kilometres', 'Vatican Museums'],
  ] },
  { name: 'Kosovo', iso2: 'XK', region: 'Europe', tier: 'hard', sets: [
    ['Flia', 'Europe’s youngest population', 'Declared independence in 2008', 'Landlocked Balkans', 'Pristina'],
    ['Rugova valley', 'Newborn monument', 'Uses the euro', 'Bordered by Serbia, Albania and North Macedonia', 'Prizren'],
    ['Ottoman-era bazaars', 'Dokufest film festival', 'Gračanica monastery', 'Sharri mountains', 'Albanian and Serbian'],
  ] },

  // ---- Asia (added 16 Sep 2026) ----
  { name: 'Iran', iso2: 'IR', region: 'Asia', tier: 'medium', aliases: ['persia'], sets: [
    ['Saffron', 'Persian carpets', 'Wind towers', 'Nowruz new year', 'Tehran'],
    ['Persepolis', 'Blue-tiled mosques', 'Isfahan', 'Caspian in the north, Gulf in the south', 'Ancient Persia'],
    ['Pistachios', 'Yazd mud-brick city', 'Poets Hafez and Rumi', 'Zoroastrian fire temples', 'Rial currency'],
  ] },
  { name: 'Iraq', iso2: 'IQ', region: 'Asia', tier: 'medium', sets: [
    ['Dates', 'Masgouf fish', 'Two great rivers', 'Cradle of civilisation', 'Baghdad'],
    ['Tigris and Euphrates', 'Babylon', 'Ziggurat of Ur', 'Mesopotamia', 'Basra'],
    ['Marsh Arabs', 'Erbil citadel', 'Cuneiform was invented here', 'Karbala', 'Kurdistan region in the north'],
  ] },
  { name: 'Lebanon', iso2: 'LB', region: 'Asia', tier: 'medium', sets: [
    ['Cedar tree on the flag', 'Mezze', 'Ski in the morning, swim in the afternoon', 'Phoenician ports', 'Beirut'],
    ['Baalbek temples', 'Byblos', 'Arak', 'Mediterranean coast north of Israel', 'Cedars of God'],
    ['Tabbouleh', 'Jeita Grotto', 'Bekaa Valley wine', 'Tripoli souks', 'Paris of the Middle East'],
  ] },
  { name: 'Kuwait', iso2: 'KW', region: 'Asia', tier: 'medium', sets: [
    ['Pearl diving history', 'Dhow boats', 'Oil wealth', 'Head of the Gulf', 'Kuwait City'],
    ['Kuwait Towers', 'Invaded in 1990', 'Dinar is the world’s highest-valued currency', 'Borders Iraq and Saudi Arabia', 'Failaka Island'],
    ['Machboos', 'Souq Al-Mubarakiya', 'Grand Mosque', 'Almost entirely desert', 'Liberation Tower'],
  ] },
  { name: 'Bahrain', iso2: 'BH', region: 'Asia', tier: 'hard', sets: [
    ['Natural pearls', 'An archipelago', 'King Fahd Causeway', 'Small Gulf kingdom', 'Manama'],
    ['Formula 1 night race', 'Tree of Life in the desert', 'Dilmun burial mounds', 'Connected to Saudi Arabia by bridge', 'Bahrain International Circuit'],
    ['Qal’at al-Bahrain fort', 'Bab Al Bahrain souq', 'First Gulf state to find oil', 'Around 33 islands', 'Dinar currency'],
  ] },
  { name: 'Yemen', iso2: 'YE', region: 'Asia', tier: 'hard', sets: [
    ['Dragon’s blood trees', 'Frankincense', 'Mud-brick skyscrapers', 'Southern tip of Arabia', 'Sana’a'],
    ['Socotra island', 'Shibam, the Manhattan of the desert', 'Mocha gave coffee its name', 'Borders Saudi Arabia and Oman', 'Old City of Sana’a'],
    ['Queen of Sheba legends', 'Jambiya daggers', 'Aden', 'Terraced mountain farms', 'Red Sea and Gulf of Aden'],
  ] },
  { name: 'Afghanistan', iso2: 'AF', region: 'Asia', tier: 'medium', sets: [
    ['Lapis lazuli', 'Pomegranates', 'Buzkashi', 'Landlocked and mountainous', 'Kabul'],
    ['Hindu Kush', 'Band-e-Amir lakes', 'Bamiyan cliffs', 'The Silk Road ran through it', 'Kandahar'],
    ['Kabuli pulao', 'Afghan hounds', 'Minaret of Jam', 'Khyber Pass', 'Borders Pakistan and Iran'],
  ] },
  { name: 'Myanmar', iso2: 'MM', region: 'Asia', tier: 'medium', aliases: ['burma'], sets: [
    ['Thanaka face paste', 'Longyi', 'Thousands of temples on a plain', 'Renamed from Burma', 'Yangon'],
    ['Bagan', 'Inle Lake leg-rowers', 'Shwedagon Pagoda', 'Between India and Thailand', 'Mandalay'],
    ['Golden Rock at Kyaiktiyo', 'Mohinga', 'Teak forests', 'Irrawaddy river', 'Naypyidaw is the capital'],
  ] },
  { name: 'Bhutan', iso2: 'BT', region: 'Asia', tier: 'hard', sets: [
    ['Gross National Happiness', 'Archery is the national sport', 'A daily tourist fee', 'Himalayan kingdom', 'Thimphu'],
    ['Tiger’s Nest monastery', 'Dzongs', 'Carbon negative', 'No traffic lights in the capital', 'Paro'],
    ['Ema datshi', 'Takin, the national animal', 'Gho and kira dress', 'Between India and Tibet', 'Druk Gyalpo, the Dragon King'],
  ] },
  { name: 'Brunei', iso2: 'BN', region: 'Asia', tier: 'hard', sets: [
    ['A water village on stilts', 'Oil-rich sultanate', 'Surrounded by Malaysia', 'On the island of Borneo', 'Bandar Seri Begawan'],
    ['Sultan Hassanal Bolkiah', 'Omar Ali Saifuddien Mosque', 'Kampong Ayer', 'Ulu Temburong rainforest', 'One of the world’s last absolute monarchies'],
    ['Ambuyat', 'Royal Regalia Museum', 'Two separate enclaves', 'Dollar pegged to Singapore’s', 'Borneo rainforest kingdom'],
  ] },
  { name: 'North Korea', iso2: 'KP', region: 'Asia', tier: 'medium', aliases: ['dprk'], sets: [
    ['Mass Games', 'The Juche calendar', 'A demilitarised zone', 'Half a divided peninsula', 'Pyongyang'],
    ['Kim dynasty', 'Ryugyong Hotel', 'Arirang Festival', 'Borders China, Russia and South Korea', 'The 38th parallel'],
    ['Chollima statue', 'Naengmyeon cold noodles', 'Mount Paektu', 'The world’s most closed country', 'Won currency'],
  ] },
  { name: 'Kyrgyzstan', iso2: 'KG', region: 'Asia', tier: 'hard', sets: [
    ['Yurts', 'Kumis, fermented mare’s milk', 'Eagle hunters', 'Landlocked and 90% mountains', 'Bishkek'],
    ['Song-Kul lake', 'Tien Shan range', 'Issyk-Kul, a warm alpine lake', 'Former Soviet Central Asia', 'Ala Archa'],
    ['Ak-kalpak felt hats', 'Beshbarmak', 'World Nomad Games', 'Borders China, Kazakhstan, Uzbekistan and Tajikistan', 'Osh bazaar'],
  ] },
  { name: 'Tajikistan', iso2: 'TJ', region: 'Asia', tier: 'hard', sets: [
    ['The roof of the world', 'Landlocked Central Asia', 'A Persian language', 'Over 90% mountainous', 'Dushanbe'],
    ['Pamir Highway', 'Ismoil Somoni Peak', 'Iskanderkul lake', 'Borders Afghanistan and China', 'Nurek Dam'],
    ['Qurutob', 'Wakhan Corridor', 'Fann Mountains', 'Somoni currency', 'Once part of the Soviet Union'],
  ] },
  { name: 'Turkmenistan', iso2: 'TM', region: 'Asia', tier: 'hard', sets: [
    ['A burning gas crater', 'White marble city', 'Akhal-Teke horses', 'Karakum desert', 'Ashgabat'],
    ['Door to Hell at Darvaza', 'Merv ruins', 'Huge natural gas reserves', 'On the Caspian Sea', 'One of the world’s most closed countries'],
    ['Carpet motifs on the flag', 'Kow Ata underground lake', 'Yangykala canyon', 'Borders Iran, Afghanistan, Uzbekistan and Kazakhstan', 'Manat currency'],
  ] },
  { name: 'Timor-Leste', iso2: 'TL', region: 'Asia', tier: 'hard', aliases: ['east timor'], sets: [
    ['Coffee is the main export', 'Half an island', 'Independence in 2002', 'Portuguese is official', 'Dili'],
    ['Atauro Island diving', 'Cristo Rei statue', 'Tetum language', 'Shares its island with Indonesia', 'Asia’s youngest nation'],
    ['Tais weaving', 'Uses the US dollar', 'Jaco Island', 'Was a Portuguese colony until 1975', 'Timor Sea'],
  ] },
  { name: 'Syria', iso2: 'SY', region: 'Asia', tier: 'medium', sets: [
    ['Aleppo soap', 'Souks under stone vaults', 'Ancient desert ruins', 'Eastern Mediterranean', 'Damascus'],
    ['Palmyra', 'Krak des Chevaliers', 'One of the oldest inhabited cities on earth', 'Borders Turkey, Iraq, Jordan, Israel and Lebanon', 'Aleppo'],
    ['Umayyad Mosque', 'Euphrates river', 'Levantine mezze', 'Norias of Hama', 'Latakia on the coast'],
  ] },

  // ---- Africa (added 16 Sep 2026) ----
  { name: 'Sudan', iso2: 'SD', region: 'Africa', tier: 'medium', sets: [
    ['Gum arabic', 'More pyramids than Egypt', 'Where two Niles meet', 'Nubian desert', 'Khartoum'],
    ['Meroë pyramids', 'The Blue and White Nile join here', 'Kingdom of Kush', 'South of Egypt', 'Port Sudan'],
    ['Nubian culture', 'Sahara in the north', 'Split in two in 2011', 'Red Sea coral reefs', 'Omdurman'],
  ] },
  { name: 'Libya', iso2: 'LY', region: 'Africa', tier: 'medium', sets: [
    ['Almost entirely desert', 'Vast oil reserves', 'Roman coastal cities', 'North African Mediterranean', 'Tripoli'],
    ['Leptis Magna', 'Sabratha', 'Ghadames old town', 'Between Egypt and Tunisia', 'Benghazi'],
    ['Acacus rock art', 'Great Man-Made River', 'Sahara oases', 'Gulf of Sidra', 'Dinar currency'],
  ] },
  { name: 'Zambia', iso2: 'ZM', region: 'Africa', tier: 'medium', sets: [
    ['Copper mining', 'Walking safaris were invented here', 'Landlocked southern Africa', 'A river border with Zimbabwe', 'Lusaka'],
    ['Victoria Falls', 'Devil’s Pool', 'South Luangwa', 'Zambezi river', 'Livingstone'],
    ['Nshima', 'Kafue National Park', 'Bat migration at Kasanka', 'Lake Kariba', 'Kwacha currency'],
  ] },
  { name: 'Malawi', iso2: 'MW', region: 'Africa', tier: 'hard', sets: [
    ['The warm heart of Africa', 'A lake covers a fifth of it', 'Landlocked', 'Tea estates on the slopes', 'Lilongwe'],
    ['Lake Malawi', 'Cichlid fish', 'Mount Mulanje', 'Between Zambia, Tanzania and Mozambique', 'Liwonde National Park'],
    ['Nsima', 'Likoma Island', 'Zomba Plateau', 'Kwacha currency', 'Blantyre'],
  ] },
  { name: 'Angola', iso2: 'AO', region: 'Africa', tier: 'medium', sets: [
    ['Portuguese is spoken', 'Oil and diamonds', 'Kizomba dance', 'Atlantic coast of southern Africa', 'Luanda'],
    ['Kalandula Falls', 'Giant sable antelope', 'Cabinda exclave', 'Independence from Portugal in 1975', 'Benguela railway'],
    ['Muxima', 'Namibe desert', 'Welwitschia plants', 'Borders Namibia and the DRC', 'Kwanza currency'],
  ] },
  { name: 'Cameroon', iso2: 'CM', region: 'Africa', tier: 'medium', sets: [
    ['Africa in miniature', 'Both French and English', 'Indomitable Lions', 'Gulf of Guinea', 'Yaoundé'],
    ['Mount Cameroon', 'Ndop cloth', 'Roger Milla', 'Between Nigeria and Chad', 'Douala'],
    ['Ndolé', 'Waza National Park', 'Foumban palace', 'Lake Nyos', 'Chari and Sanaga rivers'],
  ] },
  { name: 'Ivory Coast', iso2: 'CI', region: 'Africa', tier: 'medium', aliases: ['cote divoire', "cote d'ivoire", 'côte d’ivoire'], sets: [
    ['The world’s biggest cocoa producer', 'Attiéké', 'Coupé-décalé music', 'Gulf of Guinea coast', 'Abidjan'],
    ['Basilica of Our Lady of Peace', 'Didier Drogba', 'Taï rainforest', 'Between Ghana and Liberia', 'Yamoussoukro is the capital'],
    ['Grand-Bassam', 'Comoé National Park', 'Man waterfalls', 'CFA franc', 'Les Éléphants'],
  ] },
  { name: 'Mali', iso2: 'ML', region: 'Africa', tier: 'medium', sets: [
    ['Mud-brick mosques', 'Desert blues', 'Landlocked Sahel', 'A great river bends through it', 'Bamako'],
    ['Timbuktu', 'Great Mosque of Djenné', 'Dogon Country', 'Niger river', 'Festival au Désert'],
    ['Mansa Musa’s empire', 'Ali Farka Touré', 'Bogolan mud cloth', 'Borders Algeria, Niger and Senegal', 'CFA franc'],
  ] },
  { name: 'Burkina Faso', iso2: 'BF', region: 'Africa', tier: 'hard', sets: [
    ['The land of upright people', 'Landlocked Sahel', 'A famous African film festival', 'Renamed from Upper Volta', 'Ouagadougou'],
    ['FESPACO', 'Sindou Peaks', 'Bobo-Dioulasso', 'Between Mali, Niger and Ghana', 'Thomas Sankara'],
    ['Cotton exports', 'Domes of Fabedougou', 'Tiébou dienn-style rice dishes', 'Mossi people', 'CFA franc'],
  ] },
  { name: 'Niger', iso2: 'NE', region: 'Africa', tier: 'hard', sets: [
    ['Two-thirds Sahara', 'Uranium mining', 'Landlocked', 'Named after a river', 'Niamey'],
    ['Aïr Mountains', 'Ténéré desert', 'Agadez mud mosque', 'Wodaabe Gerewol festival', 'Borders Nigeria, Mali and Libya'],
    ['Giraffes of Kouré', 'W National Park', 'Tuareg caravans', 'The Tree of Ténéré once stood here', 'CFA franc'],
  ] },
  { name: 'Chad', iso2: 'TD', region: 'Africa', tier: 'hard', sets: [
    ['A shrinking lake gave it its name', 'The dead heart of Africa', 'Landlocked', 'Sahara in the north', 'N’Djamena'],
    ['Lake Chad', 'Ennedi Massif', 'Zakouma National Park', 'Borders Libya, Sudan and Cameroon', 'Tibesti Mountains'],
    ['Lakes of Ounianga', 'Guelta d’Archei crocodiles', 'Toubou people', 'Emi Koussi volcano', 'CFA franc'],
  ] },
  { name: 'Somalia', iso2: 'SO', region: 'Africa', tier: 'medium', sets: [
    ['Camels outnumber people', 'Frankincense and myrrh', 'The longest mainland coastline in Africa', 'Horn of Africa', 'Mogadishu'],
    ['Laas Geel cave paintings', 'Somaliland', 'Indian Ocean beaches', 'Borders Ethiopia, Kenya and Djibouti', 'Berbera'],
    ['Canjeero bread', 'Poetry as a national art', 'Hargeisa', 'Shilling currency', 'Gulf of Aden'],
  ] },
  { name: 'Eritrea', iso2: 'ER', region: 'Africa', tier: 'hard', sets: [
    ['Italian modernist architecture', 'Red Sea coastline', 'Independence from Ethiopia in 1993', 'Coffee ceremonies', 'Asmara'],
    ['Asmara is a UNESCO-listed Art Deco city', 'Dahlak Archipelago', 'Massawa', 'Borders Ethiopia, Sudan and Djibouti', 'Nakfa currency'],
    ['Zigni and injera', 'Fiat Tagliero building', 'Danakil Depression', 'Cycling is the national sport', 'Keren'],
  ] },
  { name: 'Djibouti', iso2: 'DJ', region: 'Africa', tier: 'hard', sets: [
    ['A lake saltier than the Dead Sea', 'Foreign naval bases', 'Tiny and very hot', 'Horn of Africa', 'Djibouti City'],
    ['Lake Assal', 'Lac Abbé chimneys', 'Whale sharks in the Gulf of Tadjoura', 'Between Eritrea, Ethiopia and Somalia', 'Bab-el-Mandeb strait'],
    ['Khat chewing', 'Day Forest', 'Ardoukoba volcano', 'French and Arabic are official', 'Franc currency'],
  ] },
  { name: 'Gabon', iso2: 'GA', region: 'Africa', tier: 'hard', sets: [
    ['Surfing hippos', 'Almost 90% rainforest', 'Oil on the Atlantic coast', 'Straddles the equator', 'Libreville'],
    ['Loango National Park', 'Lopé National Park', 'Forest elephants', 'Borders Cameroon and the Congo', 'Ogooué river'],
    ['Bwiti ceremonies', 'Albert Schweitzer’s hospital at Lambaréné', 'Pointe Denis', 'CFA franc', 'Port-Gentil'],
  ] },
  { name: 'Democratic Republic of the Congo', iso2: 'CD', region: 'Africa', tier: 'medium', aliases: ['drc', 'dr congo', 'congo-kinshasa', 'democratic republic of congo', 'zaire'], sets: [
    ['Cobalt and coltan', 'The second-largest rainforest on earth', 'Soukous music', 'Named after a vast river', 'Kinshasa'],
    ['Virunga National Park', 'Mountain gorillas', 'Nyiragongo lava lake', 'Was called Zaire', 'Congo river'],
    ['Okapi', 'Lubumbashi', 'Borders nine countries', 'Sub-Saharan Africa’s largest country by area', 'Congolese franc'],
  ] },
  { name: 'Republic of the Congo', iso2: 'CG', region: 'Africa', tier: 'hard', aliases: ['congo', 'congo-brazzaville'], sets: [
    ['Two countries share this name', 'Oil on the Atlantic', 'French-speaking central Africa', 'Across the river from a bigger capital', 'Brazzaville'],
    ['Odzala-Kokoua', 'Lowland gorillas', 'Pointe-Noire', 'Its capital faces Kinshasa', 'Congo river'],
    ['Sapeurs in bright suits', 'Lésio-Louna reserve', 'Cuvette basin', 'CFA franc', 'Was a French colony'],
  ] },
  { name: 'Benin', iso2: 'BJ', region: 'Africa', tier: 'hard', sets: [
    ['Vodun is an official religion', 'A stilt village on a lagoon', 'A narrow strip to the sea', 'Gulf of Guinea', 'Porto-Novo'],
    ['Ganvié', 'Royal Palaces of Abomey', 'Ouidah slave route', 'Between Togo and Nigeria', 'Cotonou'],
    ['Amazons of Dahomey', 'Pendjari National Park', 'Was called Dahomey', 'Yam-based dishes', 'CFA franc'],
  ] },
  { name: 'Togo', iso2: 'TG', region: 'Africa', tier: 'hard', sets: [
    ['A narrow country 50km wide', 'Phosphate mining', 'Fortified mud tower-houses', 'Gulf of Guinea', 'Lomé'],
    ['Koutammakou', 'Lake Togo', 'Between Ghana and Benin', 'Akodessawa fetish market', 'Kara'],
    ['Fufu', 'Mount Agou', 'Was German, then French', 'Sparrowhawks football team', 'CFA franc'],
  ] },
  { name: 'Sierra Leone', iso2: 'SL', region: 'Africa', tier: 'medium', sets: [
    ['Diamonds', 'Freed slaves founded its capital', 'West African Atlantic coast', 'A lion-shaped mountain range', 'Freetown'],
    ['Tacugama chimpanzees', 'Banana Islands', 'Tiwai Island', 'Between Guinea and Liberia', 'Cotton Tree'],
    ['Cassava leaf stew', 'Bunce Island', 'Turtle Islands', 'Leone currency', 'River Number Two beach'],
  ] },
  { name: 'Liberia', iso2: 'LR', region: 'Africa', tier: 'medium', sets: [
    ['Founded by freed American slaves', 'A flag with one star', 'Rubber plantations', 'West African Atlantic coast', 'Monrovia'],
    ['Sapo National Park', 'George Weah', 'Its capital is named after a US president', 'Between Sierra Leone and Ivory Coast', 'Ships fly its flag of convenience'],
    ['Jollof rice', 'Robertsport surfing', 'Ellen Johnson Sirleaf', 'Uses its own dollar', 'Firestone rubber'],
  ] },
  { name: 'Guinea', iso2: 'GN', region: 'Africa', tier: 'hard', sets: [
    ['The world’s largest bauxite reserves', 'The source of three great rivers', 'Djembe drumming', 'West African Atlantic coast', 'Conakry'],
    ['Fouta Djallon highlands', 'The Niger river rises here', 'Mount Nimba', 'Between Senegal and Sierra Leone', 'Îles de Los'],
    ['Mory Kanté', 'Bauxite trains', 'Said no to de Gaulle in 1958', 'Guinean franc', 'Kankan'],
  ] },
  { name: 'Gambia', iso2: 'GM', region: 'Africa', tier: 'hard', aliases: ['the gambia'], sets: [
    ['The smallest country in mainland Africa', 'A country shaped like a river', 'The smiling coast', 'Almost surrounded by Senegal', 'Banjul'],
    ['River Gambia', 'Kunta Kinteh Island', 'Birdwatching capital', 'Enclave inside Senegal', 'Serekunda'],
    ['Benachin', 'Abuko Nature Reserve', 'Makasutu forest', 'Dalasi currency', 'Atlantic beach resorts'],
  ] },
  { name: 'Mauritania', iso2: 'MR', region: 'Africa', tier: 'hard', sets: [
    ['One of the longest trains in the world', 'Almost entirely Sahara', 'Ancient desert libraries', 'Atlantic coast of the Sahel', 'Nouakchott'],
    ['Iron ore train', 'Chinguetti', 'Banc d’Arguin', 'Richat Structure, the Eye of the Sahara', 'Between Morocco and Senegal'],
    ['Thieboudienne', 'Nomadic tents', 'Ouadane', 'Ouguiya currency', 'Nouadhibou'],
  ] },
  { name: 'Lesotho', iso2: 'LS', region: 'Africa', tier: 'hard', sets: [
    ['The kingdom in the sky', 'Blanket-wearing horsemen', 'Entirely surrounded by one country', 'No point below 1,400m', 'Maseru'],
    ['Sani Pass', 'Maletsunyane Falls', 'Afriski', 'Completely enclosed by South Africa', 'Basotho ponies'],
    ['Mokorotlo hat on the flag', 'Water exports to South Africa', 'Thaba Bosiu', 'Loti currency', 'Drakensberg highlands'],
  ] },
  { name: 'Eswatini', iso2: 'SZ', region: 'Africa', tier: 'hard', aliases: ['swaziland'], sets: [
    ['An absolute monarchy', 'Renamed in 2018', 'Landlocked and tiny', 'Between South Africa and Mozambique', 'Mbabane'],
    ['Umhlanga Reed Dance', 'Hlane Royal National Park', 'Was called Swaziland', 'King Mswati III', 'Ezulwini Valley'],
    ['Sibebe Rock', 'Ngwenya glass', 'Lilangeni currency', 'Malolotja reserve', 'Lobamba is the royal capital'],
  ] },
  { name: 'Seychelles', iso2: 'SC', region: 'Africa', tier: 'medium', sets: [
    ['Granite boulders on the beach', 'The world’s largest seed', 'An Indian Ocean archipelago', 'Creole culture', 'Victoria'],
    ['Coco de mer', 'Anse Source d’Argent', 'Vallée de Mai', 'Aldabra giant tortoises', 'Mahé'],
    ['Praslin and La Digue', 'One of the world’s smallest capitals', '115 islands', 'Rupee currency', 'North-east of Madagascar'],
  ] },
  { name: 'Mauritius', iso2: 'MU', region: 'Africa', tier: 'medium', sets: [
    ['An extinct flightless bird', 'Sugar cane', 'Indian, Creole and French all at once', 'Indian Ocean island', 'Port Louis'],
    ['The dodo', 'Le Morne Brabant', 'Seven Coloured Earths', 'East of Madagascar', 'Chamarel'],
    ['Dholl puri', 'Black River Gorges', 'Underwater waterfall illusion', 'Rupee currency', 'Grand Baie'],
  ] },
  { name: 'Cape Verde', iso2: 'CV', region: 'Africa', tier: 'hard', aliases: ['cabo verde'], sets: [
    ['Morna music', 'Ten volcanic islands', 'Portuguese Creole', 'Off the coast of Senegal', 'Praia'],
    ['Cesária Évora', 'Pico do Fogo', 'Sal and Boa Vista beaches', 'Atlantic archipelago', 'Mindelo'],
    ['Cachupa', 'Santo Antão hiking', 'Turtle nesting beaches', 'Escudo currency', 'Was a Portuguese colony'],
  ] },
  { name: 'Burundi', iso2: 'BI', region: 'Africa', tier: 'hard', sets: [
    ['Royal drummers', 'Landlocked and very small', 'A share of a very deep lake', 'Neighbour of Rwanda', 'Gitega'],
    ['Drummers of Burundi', 'Lake Tanganyika', 'Bujumbura', 'Between Rwanda, Tanzania and the DRC', 'Kirundi language'],
    ['Coffee and tea exports', 'Kibira forest', 'Rusizi National Park', 'Franc currency', 'Source of the Nile marker'],
  ] },
  { name: 'South Sudan', iso2: 'SS', region: 'Africa', tier: 'hard', sets: [
    ['The world’s newest country', 'A vast swamp', 'Cattle are wealth', 'Split from its northern neighbour in 2011', 'Juba'],
    ['The Sudd wetlands', 'White Nile', 'Boma National Park antelope migration', 'Landlocked between Sudan and Uganda', 'Independence in 2011'],
    ['Dinka and Nuer peoples', 'Oil pipelines north', 'Nimule National Park', 'Pound currency', 'Kidepo valley'],
  ] },

  // ---- North America (added 16 Sep 2026) ----
  { name: 'Belize', iso2: 'BZ', region: 'North America', tier: 'medium', sets: [
    ['A giant sinkhole in the sea', 'English is official in Central America', 'Barrier reef', 'Was British Honduras', 'Belmopan'],
    ['Great Blue Hole', 'Caye Caulker', 'Actun Tunichil Muknal', 'Between Mexico and Guatemala', 'Belize City'],
    ['Rice and beans with stewed chicken', 'Caracol Maya ruins', 'Garifuna drumming', 'Second-longest barrier reef on earth', 'Ambergris Caye'],
  ] },
  { name: 'El Salvador', iso2: 'SV', region: 'North America', tier: 'medium', sets: [
    ['Pupusas', 'The smallest country in Central America', 'A famous surf point break', 'Only a Pacific coast', 'San Salvador'],
    ['Bitcoin as legal tender', 'El Tunco', 'Santa Ana volcano', 'Between Guatemala and Honduras', 'Ruta de las Flores'],
    ['Joya de Cerén', 'Lake Coatepeque', 'Uses the US dollar', 'The land of volcanoes', 'Suchitoto'],
  ] },
  { name: 'Nicaragua', iso2: 'NI', region: 'North America', tier: 'medium', sets: [
    ['Volcano boarding', 'A lake with freshwater sharks', 'Colonial rivalry between two cities', 'Between Honduras and Costa Rica', 'Managua'],
    ['Cerro Negro', 'Lake Nicaragua', 'Ometepe’s twin volcanoes', 'Granada and León', 'Corn Islands'],
    ['Gallo pinto', 'San Juan del Sur surf', 'Rum from Flor de Caña', 'Córdoba currency', 'The largest country in Central America'],
  ] },
  { name: 'Haiti', iso2: 'HT', region: 'North America', tier: 'medium', sets: [
    ['The first Black republic', 'Kreyòl', 'A mountaintop fortress', 'Shares an island with its neighbour', 'Port-au-Prince'],
    ['Citadelle Laferrière', 'Shares Hispaniola with the Dominican Republic', 'Independence from France in 1804', 'Vodou', 'Cap-Haïtien'],
    ['Griot', 'Labadee', 'Bassin Bleu', 'Gourde currency', 'Compas music'],
  ] },
  { name: 'Trinidad and Tobago', iso2: 'TT', region: 'North America', tier: 'medium', aliases: ['trinidad'], sets: [
    ['The steelpan was invented here', 'A lake of natural asphalt', 'Two islands, one country', 'Just off Venezuela', 'Port of Spain'],
    ['Carnival and soca', 'Pitch Lake', 'Scarlet ibis', 'Calypso', 'Maracas Bay'],
    ['Doubles', 'Caroni Swamp', 'Nylon Pool', 'Oil and gas, not just tourism', 'Southernmost Caribbean nation'],
  ] },
  { name: 'Barbados', iso2: 'BB', region: 'North America', tier: 'medium', sets: [
    ['Rum was invented here', 'Flying fish', 'Little England', 'Eastern edge of the Caribbean', 'Bridgetown'],
    ['Rihanna', 'Mount Gay rum', 'Became a republic in 2021', 'Crop Over festival', 'Bathsheba surf'],
    ['Cou-cou and flying fish', 'Harrison’s Cave', 'Coral limestone island', 'Barbadian dollar', 'Oistins fish fry'],
  ] },
  { name: 'Saint Lucia', iso2: 'LC', region: 'North America', tier: 'hard', sets: [
    ['Two volcanic spires on the coast', 'A drive-in volcano', 'Two Nobel laureates from 180,000 people', 'Eastern Caribbean', 'Castries'],
    ['The Pitons', 'Sulphur Springs', 'Marigot Bay', 'Between Martinique and Saint Vincent', 'Soufrière'],
    ['Green fig and saltfish', 'Pigeon Island', 'Jazz festival', 'East Caribbean dollar', 'Rodney Bay'],
  ] },
  { name: 'Grenada', iso2: 'GD', region: 'North America', tier: 'hard', sets: [
    ['The Isle of Spice', 'Nutmeg on the flag', 'An underwater sculpture park', 'Eastern Caribbean', 'St George’s'],
    ['Nutmeg and mace', 'Grand Anse beach', 'Molinere sculptures', 'Invaded by the US in 1983', 'Carriacou'],
    ['Oil down', 'Grand Etang crater lake', 'Chocolate estates', 'East Caribbean dollar', 'Concord Falls'],
  ] },
  { name: 'Antigua and Barbuda', iso2: 'AG', region: 'North America', tier: 'hard', aliases: ['antigua'], sets: [
    ['A beach for every day of the year', 'A Georgian naval dockyard', 'Pink sand on the second island', 'Eastern Caribbean', 'St John’s'],
    ['Nelson’s Dockyard', 'English Harbour', 'Frigate bird colony on Barbuda', 'Sailing Week', 'Shirley Heights'],
    ['Fungee and pepperpot', 'Devil’s Bridge', 'Two islands, 365 beaches', 'East Caribbean dollar', 'Antiguan black pineapple'],
  ] },

  // ---- South America (added 16 Sep 2026) ----
  { name: 'Guyana', iso2: 'GY', region: 'South America', tier: 'hard', sets: [
    ['The only English-speaking country in South America', 'A single-drop waterfall five times Niagara’s height', 'Rainforest covers most of it', 'On the Caribbean coast of the continent', 'Georgetown'],
    ['Kaieteur Falls', 'Rupununi savannah', 'Giant river otters', 'Between Venezuela, Brazil and Suriname', 'Essequibo river'],
    ['Pepperpot', 'Shell Beach turtles', 'Huge new offshore oil finds', 'Guyanese dollar', 'Demerara sugar'],
  ] },
  { name: 'Suriname', iso2: 'SR', region: 'South America', tier: 'hard', sets: [
    ['Dutch is the official language', 'Wooden colonial buildings on a river', 'The most forested country on earth', 'Small nation on the north-east coast', 'Paramaribo'],
    ['Maroon communities', 'Brownsberg', 'Central Suriname Nature Reserve', 'Between Guyana and French Guiana', 'Was Dutch Guiana'],
    ['Roti and pom', 'Galibi turtle beaches', 'Brokopondo reservoir', 'Surinamese dollar', 'Commewijne plantations'],
  ] },

  // ---- Oceania (added 16 Sep 2026) ----
  { name: 'Samoa', iso2: 'WS', region: 'Oceania', tier: 'medium', sets: [
    ['Tatau tattooing', 'Fale houses open to the breeze', 'Skipped a day to change time zones', 'Polynesian islands', 'Apia'],
    ['To Sua Ocean Trench', 'Robert Louis Stevenson is buried here', 'Upolu and Savai’i', 'East of Fiji', 'Lalomanu beach'],
    ['Palusami', 'Alofaaga blowholes', 'Fa’a Samoa, the Samoan way', 'Tala currency', 'Siva dance'],
  ] },
  { name: 'Tonga', iso2: 'TO', region: 'Oceania', tier: 'hard', sets: [
    ['The only Pacific nation never colonised', 'A Polynesian kingdom', 'Swimming with humpback whales', 'South Pacific', 'Nuku’alofa'],
    ['King Tupou VI', 'Ha’apai and Vava’u', 'Hunga Tonga eruption in 2022', 'The Friendly Islands', 'Ha’amonga ‘a Maui trilithon'],
    ['Ota ika', 'Mapu’a ‘a Vaea blowholes', 'Over 170 islands', 'Pa’anga currency', 'Rugby is the national sport'],
  ] },
  { name: 'Vanuatu', iso2: 'VU', region: 'Oceania', tier: 'hard', sets: [
    ['Land diving with vines', 'Kava drinking', 'Bislama pidgin', 'An 80-island South Pacific chain', 'Port Vila'],
    ['Mount Yasur volcano', 'Pentecost land divers', 'SS President Coolidge wreck', 'Between Fiji and New Caledonia', 'Espiritu Santo'],
    ['Lap lap', 'Champagne Beach', 'Blue Holes', 'Vatu currency', 'Often ranked the happiest place on earth'],
  ] },
  { name: 'Solomon Islands', iso2: 'SB', region: 'Oceania', tier: 'hard', sets: [
    ['Wreck diving from a Pacific campaign', 'Nearly a thousand islands', 'Shell money', 'Melanesia', 'Honiara'],
    ['Guadalcanal', 'Iron Bottom Sound', 'Marovo Lagoon', 'East of Papua New Guinea', 'Rennell Island'],
    ['Kokoda soup', 'Skull Island', 'Tenaru Falls', 'Solomon Islands dollar', 'Pijin is widely spoken'],
  ] },
  { name: 'Palau', iso2: 'PW', region: 'Oceania', tier: 'hard', sets: [
    ['A lake full of stingless jellyfish', 'Banned reef-toxic sunscreen', 'Visitors sign an eco pledge', 'Micronesia', 'Ngerulmud'],
    ['Jellyfish Lake', 'Rock Islands', 'Blue Corner diving', 'East of the Philippines', 'Koror'],
    ['Its own shark sanctuary', 'Bai meeting houses', 'Uses the US dollar', 'Milky Way lagoon', 'Around 340 islands'],
  ] },
  { name: 'Micronesia', iso2: 'FM', region: 'Oceania', tier: 'hard', aliases: ['federated states of micronesia', 'fsm'], sets: [
    ['A ruined stone city built on reefs', 'Four states across the Pacific', 'Stone disc money', 'North of Papua New Guinea', 'Palikir'],
    ['Nan Madol', 'Yap stone money', 'Chuuk Lagoon wrecks', 'Pohnpei', 'Uses the US dollar'],
    ['Sakau kava', 'Kosrae', 'Manta rays at Yap', 'Spread over 2,700km of ocean', 'Compact of Free Association with the US'],
  ] },
  { name: 'Kiribati', iso2: 'KI', region: 'Oceania', tier: 'hard', sets: [
    ['The first country to see the new year', 'Straddles the equator and the date line', 'Atolls barely above the sea', 'Central Pacific', 'Tarawa'],
    ['Christmas Island, also called Kiritimati', 'Phoenix Islands Protected Area', 'Battle of Tarawa', 'Rising seas threaten it', 'Gilbert Islands'],
    ['Te bwabwai', 'Bonefishing flats', 'Uses the Australian dollar', '33 atolls in three groups', 'Spread across 3.5 million km² of ocean'],
  ] },
  { name: 'Tuvalu', iso2: 'TV', region: 'Oceania', tier: 'hard', sets: [
    ['A web domain is a major source of income', 'The runway doubles as a park', 'One of the smallest countries on earth', 'Nine low-lying atolls', 'Funafuti'],
    ['The .tv domain', 'Funafuti airstrip football', 'Digital nation plan against sea-level rise', 'Between Fiji and Kiribati', 'Around 11,000 people'],
    ['Pulaka pits', 'Fatele dancing', 'Uses the Australian dollar', 'Highest point about 4.6 metres', 'Was the Ellice Islands'],
  ] },
  { name: 'Nauru', iso2: 'NR', region: 'Oceania', tier: 'hard', sets: [
    ['Once the richest country per person', 'Strip-mined for phosphate', 'No official capital city', 'The world’s smallest island nation', 'Yaren'],
    ['Phosphate rock', 'Buada Lagoon', 'Anibare Bay', '21 square kilometres', 'Australian dollar'],
    ['Frigatebird catching', 'Command Ridge', 'A single ring road', 'North-east of the Solomon Islands', 'Around 12,000 people'],
  ] },
  { name: 'Marshall Islands', iso2: 'MH', region: 'Oceania', tier: 'hard', sets: [
    ['Stick charts for navigation', 'Nuclear testing history', 'A ship registry flag of convenience', 'Central Pacific atolls', 'Majuro'],
    ['Bikini Atoll', 'Kwajalein, the world’s largest lagoon', 'Uses the US dollar', 'North of Kiribati', 'Compact of Free Association with the US'],
    ['Jaki-ed weaving', 'Arno Atoll', '29 coral atolls', 'Marshallese language', 'Rising seas threaten it'],
  ] },
  // ---- The last eight sovereign states (16 Sep 2026). The bank is now every
  // country on earth, which is a promise worth being able to make.
  { name: 'Central African Republic', iso2: 'CF', region: 'Africa', tier: 'hard', aliases: ['car'], sets: [
    ['Landlocked and almost exactly in the middle', 'Diamonds', 'Rainforest and savannah meet here', 'Borders six countries', 'Bangui'],
    ['Dzanga-Sangha forest elephants', 'Boali Falls', 'Sango language', 'Between Chad, Sudan and the two Congos', 'Ubangi river'],
    ['Bayaka forest communities', 'Manovo-Gounda St Floris park', 'Was Ubangi-Shari', 'CFA franc', 'Berbérati'],
  ] },
  { name: 'Comoros', iso2: 'KM', region: 'Africa', tier: 'hard', sets: [
    ['The perfume islands', 'Ylang-ylang for the scent trade', 'A volcanic archipelago', 'Between Mozambique and Madagascar', 'Moroni'],
    ['Mount Karthala', 'Grande Comore, Mohéli and Anjouan', 'Coelacanth waters', 'Vanilla and cloves', 'Indian Ocean island nation'],
    ['Langouste à la vanille', 'Chiconi', 'Arab, African and French all at once', 'Franc currency', 'Around 850,000 people'],
  ] },
  { name: 'Dominica', iso2: 'DM', region: 'North America', tier: 'hard', aliases: ['commonwealth of dominica'], sets: [
    ['The nature island', 'A lake that boils', 'A 184km hiking trail end to end', 'Eastern Caribbean', 'Roseau'],
    ['Boiling Lake', 'Waitukubuli Trail', 'Morne Trois Pitons', 'Not the Dominican Republic', 'Between Guadeloupe and Martinique'],
    ['Kalinago Territory', 'Champagne Reef', 'Sperm whales year round', 'East Caribbean dollar', 'Trafalgar Falls'],
  ] },
  { name: 'Equatorial Guinea', iso2: 'GQ', region: 'Africa', tier: 'hard', sets: [
    ['The only African country where Spanish is official', 'Oil in the Gulf of Guinea', 'A capital on an island', 'Split between a mainland and islands', 'Malabo'],
    ['Bioko island', 'Río Muni on the mainland', 'Pico Basilé', 'Between Cameroon and Gabon', 'Oyala, a capital built in the forest'],
    ['Was Spanish Guinea', 'Monte Alén rainforest', 'Drill monkeys', 'CFA franc', 'Bata'],
  ] },
  { name: 'Guinea-Bissau', iso2: 'GW', region: 'Africa', tier: 'hard', sets: [
    ['Cashew nuts are almost the whole economy', 'A maze of mangrove islands', 'Portuguese is official', 'Small nation on the West African coast', 'Bissau'],
    ['Bijagós Archipelago', 'Saltwater hippos', 'Between Senegal and Guinea', 'Was Portuguese Guinea', 'Orango island'],
    ['Gumbé music', 'Amílcar Cabral', 'Tarrafes mangroves', 'CFA franc', 'Around 88 islands offshore'],
  ] },
  { name: 'Saint Kitts and Nevis', iso2: 'KN', region: 'North America', tier: 'hard', aliases: ['st kitts', 'saint kitts', 'st kitts and nevis'], sets: [
    ['The smallest country in the Americas', 'A hilltop fortress called the Gibraltar of the Caribbean', 'Two islands joined by a strait', 'Eastern Caribbean', 'Basseterre'],
    ['Brimstone Hill Fortress', 'A scenic railway round a sugar island', 'Alexander Hamilton was born here', 'Nevis Peak', 'The Narrows'],
    ['Goat water stew', 'Pinney’s Beach', 'Sugar until 2005', 'East Caribbean dollar', 'Two islands, 261 km²'],
  ] },
  { name: 'Saint Vincent and the Grenadines', iso2: 'VC', region: 'North America', tier: 'hard', aliases: ['st vincent', 'saint vincent', 'st vincent and the grenadines'], sets: [
    ['A chain of yachting islands', 'An active volcano called La Soufrière', 'Pirates of the Caribbean was filmed here', 'Eastern Caribbean', 'Kingstown'],
    ['The Grenadines', 'Bequia', 'Mustique', 'Tobago Cays', 'La Soufrière erupted in 2021'],
    ['Roasted breadfruit and jackfish', 'Arrowroot', 'Botanical gardens from 1765', 'East Caribbean dollar', 'Union Island'],
  ] },
  { name: 'Sao Tome and Principe', iso2: 'ST', region: 'Africa', tier: 'hard', aliases: ['sao tome', 'são tomé and príncipe', 'sao tome and principe'], sets: [
    ['Cocoa islands', 'Two islands on the equator', 'Portuguese is official', 'Gulf of Guinea', 'São Tomé'],
    ['Pico Cão Grande, a volcanic needle', 'Príncipe biosphere reserve', 'Was the world’s biggest cocoa producer', 'Off the coast of Gabon', 'Obo National Park'],
    ['Roças, the old plantation estates', 'Calulu', 'Africa’s second-smallest country', 'Dobra currency', 'Around 220,000 people'],
  ] },
]

// ---------------------------------------------------------------- the day
//
// THREE THINGS VARY NOW, NOT ONE (16 Sep 2026).
//
// Ethan: "for the guess the country, new ways of structuring it and different
// random levels, for example some easier and some more niche and difficult to
// guess."
//
// It used to be one country out of 109, five clues, every single day. The bank
// is 188 countries now - the second half of it deliberately niche - and two
// other dials moved with it:
//
//   TIER      how well known the country is (easy / medium / hard). Written per
//             country rather than inferred, because "is this obvious" is a
//             judgement and pretending otherwise would just hide it.
//   ROUND     how the five clues are SERVED. An express round shows only the
//             three hardest of them, a guided round shows all five plus the
//             continent from the start, and a classic round is what the puzzle
//             has always been. Nothing new had to be written for this: the sets
//             are already ordered subtle -> giveaway, so withholding the
//             giveaways is a difficulty lever that was sitting there unused.
//
// Together they give a real range: a guided round on a country everybody knows
// is a gentle Tuesday, and an express round on a niche one is a genuinely hard
// puzzle - without either of them being an unfair puzzle.

/** Small fast deterministic PRNG (mulberry32), so a day is a pure function. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How a round is served. `clues` is how many of the set's five are used. */
export const PINPOINT_ROUNDS = {
  express: { clues: 3, guided: false, label: 'Express', blurb: 'Three clues only, and they are the hard ones.' },
  classic: { clues: 5, guided: false, label: 'Classic', blurb: 'Five clues, one guess each.' },
  guided: { clues: 5, guided: true, label: 'Guided', blurb: 'Five clues, and you are told the continent.' },
  // A MIXED ROUND IS A NEW PUZZLE OUT OF CLUES THAT ALREADY EXIST.
  //
  // The obvious way to add variety was a FOURTH clue set per country. It was
  // written, and then thrown away: the three sets already use the good clues,
  // so a fourth is built from leftovers - and leftovers for a country in the
  // EASY tier are by definition obscure, which turns the gentle tier into the
  // hard one. More content is not automatically more game.
  //
  // What the bank does have is three clues at every POSITION, and because every
  // set runs hardest-first, position 2 of set 1 and position 2 of set 3 are
  // about equally hard. Taking each position from a different set therefore
  // gives a five-clue round that ramps exactly like a normal one, is made
  // entirely of clues already trusted, and has 3^5 = 243 possible shapes per
  // country instead of 3.
  mixed: { clues: 5, guided: false, label: 'Mixed', blurb: 'Five clues, one from each of its sets.' },
}

// How often each round style comes up, by how well known the country is. A
// niche country mostly gets the help; a famous one mostly gets less of it.
const ROUND_MIX = {
  easy: [['express', 36], ['classic', 26], ['mixed', 24], ['guided', 14]],
  medium: [['express', 16], ['classic', 34], ['mixed', 27], ['guided', 23]],
  hard: [['express', 4], ['classic', 28], ['mixed', 22], ['guided', 46]],
}

// HOW OFTEN EACH COUNTRY COMES ROUND, AND WHY IT IS NOT ONE EACH.
//
// Half the bank is now the niche half, so dealing straight through it would put
// a country most people have never thought about on one day in two. Instead the
// deck REPEATS the well-known ones: an easy country appears three times per
// cycle and a medium one twice, which lands the mix at roughly 40% easy, 32%
// medium, 28% hard over a 329-day cycle - and, because each of those repeats
// carries a DIFFERENT clue set, a country you have seen before never comes back
// with the clues you already solved it from.
const DECK_REPEATS = { easy: 3, medium: 2, hard: 1 }

/** How many days a full pass through the bank takes. */
export const PINPOINT_DECK_LENGTH = PINPOINT_COUNTRIES.reduce(
  (n, c) => n + (DECK_REPEATS[c.tier] ?? 1), 0,
)

// A COUNTRY'S REPEATS ARE SPREAD, NOT SHUFFLED - AND THE DECK IS A RING.
//
// Two bugs were found here by the test below, and the second is the interesting
// one.
//
// FIRST: the deck was a plain shuffle, which put France three days apart and
// Japan four. Different clues both times, and it still read as the puzzle
// repeating itself - which is the exact complaint this work exists to answer. A
// shuffle has no memory; "twice in a week" is as likely as any other
// arrangement. So each country's appearances are PLACED rather than dealt: a
// country appearing r times gets its slots a stride of len/r apart, and when
// the ideal slot is taken the search steps outward from it, so a collision
// costs a day or two of accuracy rather than throwing the appearance anywhere.
//
// SECOND: that fixed the gaps INSIDE a cycle and did nothing about the seam
// between two of them. A deck built for cycle 58 knows nothing about what cycle
// 57 ended on, so a country in the last slot of one and the first slot of the
// next came round on CONSECUTIVE DAYS - the worst case the first fix was
// supposed to remove, hidden at the one place a 365-day sample was unlikely to
// look.
//
// The fix is to stop rebuilding it. There is ONE deck, placed on a RING, so the
// gap from the last slot back to the first is a real gap the placement already
// respects. What varies from cycle to cycle is the CLUE SET each appearance
// carries, which is the thing that actually makes a country feel fresh - and
// the round style varies per day on top of that. A 359-day period in the
// countries themselves is not something anybody can perceive; two Frances in a
// week is.
// THE FLOOR, IN DAYS, BETWEEN TWO SIGHTINGS OF THE SAME COUNTRY. Asserted in
// pinpoint.test.js, which is the only reason it stays true.
export const PINPOINT_MIN_GAP = 40

let DECK = null
function deck() {
  if (DECK) return DECK
  const rng = mulberry32(0xc0de17)
  const len = PINPOINT_DECK_LENGTH
  const slots = new Array(len).fill(null)

  // Placement order is shuffled, so it is not always the same countries that
  // get whatever slots are left at the end.
  const order = PINPOINT_COUNTRIES.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  // Pass one: aim each appearance at its ideal slot, stepping outward when that
  // slot is taken.
  for (const index of order) {
    const repeats = DECK_REPEATS[PINPOINT_COUNTRIES[index].tier] ?? 1
    const stride = len / repeats
    const base = rng() * stride
    for (let r = 0; r < repeats; r++) {
      const want = Math.round(base + r * stride) % len
      let put = -1
      for (let step = 0; step < len && put < 0; step++) {
        const a = (want + step) % len
        const b = ((want - step) % len + len) % len
        if (slots[a] === null) put = a
        else if (slots[b] === null) put = b
      }
      slots[put] = [index, r]
    }
  }

  // PASS TWO: REPAIR, BECAUSE AIMING IS NOT ENOUGH.
  //
  // The deck is exactly full - 359 appearances in 359 slots - so the last few
  // countries placed have no choice left and take whatever remains. Measured,
  // that put Tanzania five days apart and India fifteen: the aiming pass fixes
  // the average and cannot fix the tail, and the tail is the only part anybody
  // notices.
  //
  // So anything still too close gets swapped with a slot that resolves it, on
  // the ring, until nothing is. This converges easily - the tightest constraint
  // is an easy country wanting 40 days of clearance three times in 359 - and if
  // it ever did not, the test below is what would say so.
  const tooClose = (at, index, from) => {
    for (let k = 1; k <= PINPOINT_MIN_GAP; k++) {
      for (const pos of [(at + k) % len, ((at - k) % len + len) % len]) {
        if (pos === from) continue
        if (slots[pos] && slots[pos][0] === index) return true
      }
    }
    return false
  }
  for (let pass = 0; pass < 60; pass++) {
    let fixed = 0
    for (let i = 0; i < len; i++) {
      if (!tooClose(i, slots[i][0], i)) continue
      for (let t = 0; t < 400; t++) {
        const j = Math.floor(rng() * len)
        if (j === i) continue
        const a = slots[i], b = slots[j]
        slots[i] = b; slots[j] = a
        if (!tooClose(i, b[0], i) && !tooClose(j, a[0], j)) { fixed++; break }
        slots[i] = a; slots[j] = b
      }
    }
    if (!fixed) break
  }

  DECK = slots
  return DECK
}

function pickWeighted(mix, r) {
  const total = mix.reduce((n, m) => n + m[1], 0)
  let x = r * total
  for (const [key, w] of mix) { x -= w; if (x < 0) return key }
  return mix[mix.length - 1][0]
}

/**
 * Today's puzzle. Deterministic: everybody gets the same country, the same
 * clues, in the same round style, all day.
 *
 * Returns the country plus:
 *   words  - the clues actually in play (3 on an express round, otherwise 5)
 *   round  - 'express' | 'classic' | 'guided'
 *   clues  - how many there are, which is what the board counts down
 *   guided - whether the continent is shown from the start
 */
export function pinpointForDay(day) {
  const d = Math.floor(day)
  const len = PINPOINT_DECK_LENGTH
  const slot = ((d % len) + len) % len
  const cycle = Math.floor(d / len)
  const [index, appearance] = deck()[slot]
  const country = PINPOINT_COUNTRIES[index]
  // WHICH OF THE THREE SETS. The deck is fixed, so this is where a country
  // stops feeling like the same puzzle: its appearances within one cycle use
  // different sets (the appearance index), and the whole assignment rotates
  // every cycle (the cycle number), so the same slot next year carries
  // different clues. `index` only breaks the tie so that two countries sharing
  // a cycle are not both on set 0 in the same year.
  const set = country.sets[(cycle + appearance + index) % country.sets.length]
  // A second, independent stream for the round style: the deck decides WHICH
  // country, and this decides how hard a time you are given with it.
  const rng = mulberry32((d * 2654435761 + 0x5171) >>> 0)
  const round = pickWeighted(ROUND_MIX[country.tier] ?? ROUND_MIX.medium, rng())
  const spec = PINPOINT_ROUNDS[round]

  // A MIXED ROUND TAKES EACH POSITION FROM A DIFFERENT SET, and refuses to
  // repeat a clue: several countries name the same landmark at two positions
  // across their sets, and a round that showed it twice would be a round with
  // four clues in it wearing five.
  let words
  if (round === 'mixed') {
    words = []
    const used = new Set()
    for (let i = 0; i < spec.clues; i++) {
      let picked = null
      // Try the sets in a rotation that starts somewhere different per
      // position, so the mix is not the same three sets in the same order.
      const start = Math.floor(rng() * country.sets.length)
      for (let k = 0; k < country.sets.length; k++) {
        const candidate = country.sets[(start + k) % country.sets.length][i]
        if (candidate && !used.has(candidate.toLowerCase())) { picked = candidate; break }
      }
      // Every set repeats this clue: fall back to the chosen set's own, which
      // can only happen if the country has fewer distinct clues than it looks.
      if (!picked) picked = set[i]
      used.add(picked.toLowerCase())
      words.push(picked)
    }
  } else {
    words = set.slice(0, spec.clues)
  }

  return {
    ...country,
    words,
    round,
    clues: spec.clues,
    guided: spec.guided,
    roundLabel: spec.label,
  }
}

/** Does a typed guess match the answer (name or alias, accents ignored)? */
export function pinpointMatches(country, guess) {
  const n = normalize(guess)
  if (!n) return false
  if (normalize(country.name) === n) return true
  return (country.aliases || []).some((a) => normalize(a) === n)
}
