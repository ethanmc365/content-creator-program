import { normalize } from './countries'

// Guess the Country (Pinpoint): five clue words revealed one at a time,
// ordered subtle -> giveaway. Every country has THREE different clue sets
// (roughly: culture/food, landmarks/nature, cities/icons), so the same
// country can reappear months later with fresh clues. The daily pick and the
// set rotation are both deterministic, so everyone gets the same puzzle.
//
//   name    - the answer (accepted when typed)
//   iso2    - flag emoji on the win screen
//   aliases - extra accepted spellings
//   sets    - three arrays of exactly five clues, hardest first
export const PINPOINT_COUNTRIES = [
  // ---- Europe ----
  { name: 'Italy', iso2: 'IT', sets: [
    ['Renaissance', 'Vespa', 'Espresso', 'Pasta', 'Colosseum'],
    ['Leaning tower', 'Amalfi Coast', 'Venice canals', 'Pompeii', 'Rome'],
    ['Gelato', 'Serie A', 'Ferrari', 'Pizza', 'Milan'],
  ] },
  { name: 'France', iso2: 'FR', sets: [
    ['Riviera', 'Croissant', 'Louvre', 'Baguette', 'Eiffel Tower'],
    ['Mont Blanc', 'Champagne', 'Palace of Versailles', 'Cannes', 'Paris'],
    ['Cheese', 'Crêpes', 'Notre-Dame', 'Provence', 'Tour de France'],
  ] },
  { name: 'Spain', iso2: 'ES', sets: [
    ['Siesta', 'Tapas', 'Flamenco', 'Sagrada Família', 'Paella'],
    ['Running of the bulls', 'La Liga', 'Canary Islands', 'Ibiza', 'Madrid'],
    ['Sangría', 'La Tomatina', 'Gaudí', 'Bullfighting', 'Barcelona'],
  ] },
  { name: 'Portugal', iso2: 'PT', sets: [
    ['Azulejo tiles', 'Port wine', 'Fado music', 'Douro Valley', 'Lisbon'],
    ['Custard tarts', 'Nazaré waves', 'Madeira', 'Ronaldo', 'Porto'],
    ['Cork', 'Sardines', 'Yellow trams', 'Age of Discoveries', 'Algarve'],
  ] },
  { name: 'United Kingdom', iso2: 'GB', aliases: ['uk', 'great britain', 'britain', 'england'], sets: [
    ['Pubs', 'Double-decker bus', 'Afternoon tea', 'Big Ben', 'London'],
    ['Stonehenge', 'Loch Ness', 'Royal Family', 'Buckingham Palace', 'England'],
    ['Fish and chips', 'Premier League', 'The Beatles', 'Sherlock Holmes', 'Union Jack'],
  ] },
  { name: 'Ireland', iso2: 'IE', aliases: ['republic of ireland'], sets: [
    ['Shamrock', 'Guinness', 'Leprechaun', 'St Patrick', 'Dublin'],
    ['Peat bogs', 'Cliffs of Moher', 'Ring of Kerry', 'Blarney Stone', 'Emerald Isle'],
    ['Riverdance', 'U2', 'Gaelic football', 'Trinity College', 'Irish whiskey'],
  ] },
  { name: 'Germany', iso2: 'DE', sets: [
    ['Autobahn', 'Bratwurst', 'Oktoberfest', 'Berlin Wall', 'Berlin'],
    ['Black Forest', 'Neuschwanstein', 'Bavaria', 'Brandenburg Gate', 'Munich'],
    ['Pretzels', 'Christmas markets', 'BMW', 'Bundesliga', 'Bavarian beer halls'],
  ] },
  { name: 'Netherlands', iso2: 'NL', aliases: ['holland'], sets: [
    ['Canals', 'Clogs', 'Tulips', 'Windmills', 'Amsterdam'],
    ['Cycling everywhere', 'Cheese markets', 'Van Gogh', 'Keukenhof gardens', 'Rotterdam'],
    ['Stroopwafels', "King's Day", 'Delft blue pottery', 'Gouda', 'Orange football shirts'],
  ] },
  { name: 'Belgium', iso2: 'BE', sets: [
    ['Tintin', 'Waffles', 'Fries', 'Chocolate', 'Brussels'],
    ['Abbey beers', 'Bruges canals', 'Atomium', 'EU headquarters', 'Antwerp diamonds'],
    ['Smurfs', 'Comic strips', 'Flanders fields', 'Ghent', 'Belgian beer'],
  ] },
  { name: 'Switzerland', iso2: 'CH', sets: [
    ['Banks', 'Watches', 'Fondue', 'Matterhorn', 'Zurich'],
    ['Red Cross', 'CERN', 'Alpine villages', 'Lake Geneva', 'Swiss Army knife'],
    ['Neutrality', 'Yodelling', 'Cheese with holes', 'Cable cars', 'Geneva'],
  ] },
  { name: 'Austria', iso2: 'AT', sets: [
    ['Strudel', 'Waltz', 'Mozart', 'Sound of Music', 'Vienna'],
    ['Red Bull', 'Ski resorts', 'Salzburg', 'Schönbrunn Palace', 'Vienna coffee houses'],
    ['Sachertorte', 'Sigmund Freud', 'Gustav Klimt', 'Arnold Schwarzenegger', 'Habsburg Empire'],
  ] },
  { name: 'Greece', iso2: 'GR', sets: [
    ['Olives', 'Mythology', 'Santorini', 'Parthenon', 'Athens'],
    ['Feta', 'Island hopping', 'Zeus', 'Acropolis', 'Mykonos'],
    ['Plate smashing', 'Sirtaki dance', 'Ouzo', 'Olympics birthplace', 'Greek salad'],
  ] },
  { name: 'Sweden', iso2: 'SE', sets: [
    ['Fika', 'Meatballs', 'ABBA', 'IKEA', 'Stockholm'],
    ['Midsummer poles', 'Archipelagos', 'Ice hotel', 'Volvo', 'Nobel Prize'],
    ['Crayfish parties', 'Cinnamon buns', 'Zlatan', 'Spotify', 'Swedish House Mafia'],
  ] },
  { name: 'Norway', iso2: 'NO', sets: [
    ['Salmon', 'Northern lights', 'Fjords', 'Vikings', 'Oslo'],
    ['Oil fund', 'Trolls', 'Midnight sun', 'Ski jumping', 'Bergen'],
    ['Brown cheese', 'Slow TV', 'Lofoten Islands', "Munch's Scream", 'Norwegian fjords'],
  ] },
  { name: 'Denmark', iso2: 'DK', sets: [
    ['Pastries', 'Hygge', 'Little Mermaid', 'LEGO', 'Copenhagen'],
    ['Smørrebrød', 'Tivoli Gardens', 'Hans Christian Andersen', 'Carlsberg', 'Danish pastries'],
    ['Interior design', 'Bicycle culture', 'Roskilde Festival', 'Greenland ties', 'Copenhagen harbour'],
  ] },
  { name: 'Finland', iso2: 'FI', sets: [
    ['Reindeer', 'Sauna', 'Santa Claus', 'Nokia', 'Helsinki'],
    ['Salmiakki', 'Thousand lakes', 'Lapland', 'Angry Birds', "Santa's village"],
    ['Heavy metal bands', 'Ice swimming', 'Moomins', 'Kimi Räikkönen', 'Finnish saunas'],
  ] },
  { name: 'Iceland', iso2: 'IS', sets: [
    ['Puffins', 'Geysers', 'Volcanoes', 'Blue Lagoon', 'Reykjavik'],
    ['Elf folklore', 'Waterfalls', 'Glaciers', 'Northern lights island', 'Ring Road'],
    ['Björk', 'Hot springs', 'Viking clap', 'Golden Circle', 'Land of fire and ice'],
  ] },
  { name: 'Croatia', iso2: 'HR', sets: [
    ['Adriatic sailing', 'Game of Thrones', 'Plitvice Lakes', 'Dubrovnik', 'Zagreb'],
    ['Necktie origins', 'Island hopping ferries', 'Hvar', 'Split', 'Adriatic coast'],
    ['Istrian truffles', 'Sea organ', 'Luka Modrić', "King's Landing", 'Croatian islands'],
  ] },
  { name: 'Czechia', iso2: 'CZ', aliases: ['czech republic'], sets: [
    ['Pilsner', 'Bohemia', 'Astronomical clock', 'Charles Bridge', 'Prague'],
    ['Beer spas', 'Fairy-tale castles', 'Moravia', 'Old Town Square', 'Czech beer'],
    ['Marionettes', 'Škoda', 'Kafka', 'Wenceslas Square', 'Bohemian crystal'],
  ] },
  { name: 'Hungary', iso2: 'HU', sets: [
    ['Paprika', 'Goulash', 'Thermal baths', 'Danube', 'Budapest'],
    ['Ruin bars', 'Lake Balaton', "Rubik's Cube", 'Chain Bridge', 'Hungarian parliament'],
    ['Lángos', 'Tokaji wine', 'Sziget Festival', 'Ferenc Puskás', 'Buda and Pest'],
  ] },
  { name: 'Poland', iso2: 'PL', sets: [
    ['Amber', 'Pierogi', 'Chopin', 'Kraków', 'Warsaw'],
    ['Salt mines', 'Bison forests', 'Tatra Mountains', 'Solidarity movement', 'Gdańsk'],
    ['Vodka', 'Lewandowski', 'Copernicus', 'Wawel Castle', 'Polish złoty'],
  ] },
  { name: 'Romania', iso2: 'RO', sets: [
    ['Castles', 'Carpathians', 'Dracula', 'Transylvania', 'Bucharest'],
    ['Painted monasteries', 'Transfăgărășan road', 'Black Sea coast', 'Bran Castle', 'Vlad the Impaler'],
    ['Mămăligă', 'Nadia Comăneci', 'Palace of the Parliament', 'Sibiu', 'Transylvanian castles'],
  ] },
  { name: 'Turkey', iso2: 'TR', aliases: ['türkiye', 'turkiye'], sets: [
    ['Kebab', 'Hot air balloons', 'Bosphorus', 'Hagia Sophia', 'Istanbul'],
    ['Baklava', 'Grand Bazaar', 'Cappadocia', 'Blue Mosque', 'Turkish delight'],
    ['Çay tea', 'Whirling dervishes', 'Pamukkale', 'Antalya', 'Turkish baths'],
  ] },
  { name: 'Russia', iso2: 'RU', aliases: ['russian federation'], sets: [
    ['Tsars', 'Ballet', 'Matryoshka dolls', 'Red Square', 'Moscow'],
    ['Trans-Siberian railway', 'Lake Baikal', 'Winter palaces', "St Basil's Cathedral", 'St Petersburg'],
    ['Caviar', 'Chess masters', 'Cosmonauts', 'Kremlin', 'Siberia'],
  ] },
  { name: 'Ukraine', iso2: 'UA', sets: [
    ['Wheat fields', 'Sunflowers', 'Borscht', 'Chernobyl', 'Kyiv'],
    ['Black Sea ports', 'Carpathian villages', 'Painted Easter eggs', 'Odesa', 'Dnipro River'],
    ['Embroidered shirts', 'Klitschko brothers', 'Golden domes', 'Lviv', 'Blue and yellow flag'],
  ] },
  { name: 'Malta', iso2: 'MT', sets: [
    ['Megalithic temples', 'Knights', 'Mdina', 'Valletta', 'Mediterranean island'],
    ['Blue Grotto', 'Popeye Village', 'Gozo', 'Fortified harbours', 'Maltese cross'],
    ['Rabbit stew', 'British phone boxes', 'Diving wrecks', 'Grand Harbour', 'Island between Sicily and Africa'],
  ] },
  { name: 'Monaco', iso2: 'MC', sets: [
    ['Princess Grace', 'Casino', 'Grand Prix', 'Monte Carlo', 'Riviera micro-state'],
    ['Superyachts', 'Millionaires', 'Oceanographic Museum', 'Casino Square', 'French Riviera enclave'],
    ['F1 street circuit', 'Tax haven', "Prince's Palace", 'Second-smallest country', 'Monte Carlo casino'],
  ] },
  { name: 'Cyprus', iso2: 'CY', sets: [
    ['Halloumi', 'Aphrodite', 'Divided capital', 'Nicosia', 'Mediterranean island east'],
    ['Copper', 'Meze', 'Troodos Mountains', 'Ayia Napa', 'Limassol'],
    ['Commandaria wine', 'UN buffer zone', 'Paphos', 'Green Line', 'Cypriot beaches'],
  ] },
  { name: 'Slovenia', iso2: 'SI', sets: [
    ['Dragon bridge', 'Postojna caves', 'Julian Alps', 'Ljubljana', 'Lake Bled'],
    ['Beekeeping', 'Predjama Castle', 'Mount Triglav', 'Piran', 'Bled island church'],
    ['Luka Dončić', 'Wine hills', 'Soča River', 'Karst caves', 'Between the Alps and Adriatic'],
  ] },
  { name: 'Slovakia', iso2: 'SK', sets: [
    ['High Tatras', 'Bryndza cheese', 'Castles', 'Bratislava', 'Danube capital'],
    ['Wooden churches', 'Spiš Castle', 'Ice hockey', 'Mountain huts', 'Tatra peaks'],
    ['Halušky', 'Andy Warhol roots', 'Devín Castle', 'Košice', "Czechoslovakia's other half"],
  ] },
  { name: 'Serbia', iso2: 'RS', sets: [
    ['Rakija', 'EXIT Festival', 'Djokovic', 'Belgrade', 'Balkans'],
    ['Kafana music', 'Danube fortresses', 'Nikola Tesla', 'Novi Sad', 'The White City'],
    ['Ćevapi', 'Orthodox monasteries', 'Basketball talents', 'Sava River', 'Serbian tennis'],
  ] },
  { name: 'Bulgaria', iso2: 'BG', sets: [
    ['Rose oil', 'Yogurt', 'Black Sea resorts', 'Rila Monastery', 'Sofia'],
    ['Cyrillic origins', 'Sunny Beach', 'Thracian gold', 'Plovdiv', 'Bulgarian roses'],
    ['Banitsa', 'Kukeri masks', 'Seven Rila Lakes', 'Veliko Tarnovo', 'Balkan Mountains'],
  ] },
  { name: 'Albania', iso2: 'AL', sets: [
    ['Bunkers', 'Eagles', 'Adriatic beaches', 'Tirana', 'Albanian Riviera'],
    ['Byrek', "Mother Teresa's heritage", 'Berat', 'Gjirokastër', 'Land of the Eagles'],
    ['Raki', 'Skanderbeg', 'Ksamil beaches', 'Ottoman bazaars', 'Double-headed eagle flag'],
  ] },
  { name: 'Montenegro', iso2: 'ME', sets: [
    ['Black mountain', 'Budva', 'Bay of Kotor', 'Podgorica', 'Adriatic'],
    ['Sveti Stefan', 'Durmitor', 'Tara Canyon', 'Perast', 'Kotor walls'],
    ['Mountain monasteries', 'Lake Skadar', 'Casino Royale setting', 'Herceg Novi', 'Kotor bay cruises'],
  ] },
  { name: 'Bosnia and Herzegovina', iso2: 'BA', aliases: ['bosnia', 'bosnia herzegovina'], sets: [
    ['1984 Winter Olympics', 'Stari Most', 'Mostar', 'Sarajevo', 'Balkan bridges'],
    ['Coffee culture', 'Baščaršija bazaar', 'Neretva River', 'Bridge diving', 'Sarajevo old town'],
    ['Visoko hills', 'Kravice waterfalls', 'Tunnel of Hope', 'Olympic bobsleigh ruins', 'Herzegovina'],
  ] },
  { name: 'Estonia', iso2: 'EE', sets: [
    ['E-residency', 'Skype', 'Medieval old town', 'Baltic Sea', 'Tallinn'],
    ['Digital state', 'Bog trails', 'Saaremaa island', 'Kadriorg Palace', 'Tallinn old town'],
    ['Startup unicorns', 'Bolt and Wise', 'Lahemaa forests', 'Narva border', 'Northernmost Baltic state'],
  ] },
  { name: 'Latvia', iso2: 'LV', sets: [
    ['Black Balsam', 'Song festivals', 'Art Nouveau', 'Baltic Sea', 'Riga'],
    ['Rye bread', 'Jūrmala beach', 'Gauja valley', 'Central Market', 'Riga old town'],
    ['Ice hockey fans', 'Midsummer Līgo', 'Rundāle Palace', 'Daugava River', 'Middle Baltic state'],
  ] },
  { name: 'Lithuania', iso2: 'LT', sets: [
    ['Hill of Crosses', 'Basketball', 'Curonian Spit', 'Baltic Sea', 'Vilnius'],
    ['Cepelinai', 'Trakai Castle', 'Amber coast', 'Užupis republic', 'Kaunas'],
    ['Pink soup', 'Hot air balloons over the capital', 'Grand Duchy history', 'Nida dunes', 'Southern Baltic state'],
  ] },
  { name: 'Luxembourg', iso2: 'LU', sets: [
    ['Grand Duchy', 'Banking', 'EU courts', 'Fortress city', 'Luxembourg City'],
    ['Free public transport', 'Ardennes castles', 'Moselle vineyards', 'Bock casemates', "Benelux's smallest"],
    ['Richest per capita', 'Schengen village', 'Steel history', 'Multilingual signs', 'Tiny Grand Duchy'],
  ] },

  // ---- Asia ----
  { name: 'Japan', iso2: 'JP', sets: [
    ['Bullet train', 'Cherry blossom', 'Sushi', 'Mount Fuji', 'Tokyo'],
    ['Onsen baths', 'Ryokan inns', 'Torii gates', 'Kyoto temples', 'Samurai'],
    ['Anime', 'Ramen', 'Sumo', 'Nintendo', 'Godzilla'],
  ] },
  { name: 'China', iso2: 'CN', sets: [
    ['Calligraphy', 'Pandas', 'Terracotta Army', 'Great Wall', 'Beijing'],
    ['Dumplings', 'High-speed rail', 'Forbidden City', 'Shanghai skyline', 'Yangtze River'],
    ['Mahjong', 'Kung fu', 'Dragon boat races', 'Silk', 'Chinese New Year'],
  ] },
  { name: 'South Korea', iso2: 'KR', aliases: ['korea', 'republic of korea'], sets: [
    ['Kimchi', 'K-pop', 'Taekwondo', 'Gangnam', 'Seoul'],
    ['Jeju Island', 'Hanbok', 'DMZ border', 'Squid Game', 'Korean BBQ'],
    ['Soju', 'K-dramas', 'PC gaming rooms', 'BTS', 'Samsung'],
  ] },
  { name: 'India', iso2: 'IN', sets: [
    ['Bollywood', 'Curry', 'Holi festival', 'Taj Mahal', 'New Delhi'],
    ['Yoga', 'Auto rickshaws', 'The Ganges', 'Jaipur palaces', 'Mumbai'],
    ['Chai', 'Cricket fever', 'Diwali', 'Kerala backwaters', 'Indian railways'],
  ] },
  { name: 'Thailand', iso2: 'TH', sets: [
    ['Elephants', 'Tuk-tuk', 'Pad Thai', 'Phuket', 'Bangkok'],
    ['Andaman islands', 'Full moon parties', 'Floating markets', 'Golden temples', 'Thai massage'],
    ['Street food stalls', 'Koh Samui', 'Muay Thai', 'Songkran water festival', 'Land of Smiles'],
  ] },
  { name: 'Vietnam', iso2: 'VN', sets: [
    ['Motorbikes', 'Pho', 'Rice paddies', 'Ha Long Bay', 'Hanoi'],
    ['Banh mi', 'Lanterns of Hoi An', 'Mekong Delta', 'Cu Chi tunnels', 'Ho Chi Minh City'],
    ['Conical hats', 'Egg coffee', 'Sapa terraces', 'Da Nang', 'Saigon'],
  ] },
  { name: 'Indonesia', iso2: 'ID', sets: [
    ['Komodo dragons', 'Batik', 'Rice terraces', 'Bali', 'Jakarta'],
    ['17,000 islands', 'Borobudur', 'Ubud', 'Volcano sunrises', 'Java'],
    ['Nasi goreng', 'Gamelan', 'Surfing Uluwatu', 'Gili Islands', 'Balinese temples'],
  ] },
  { name: 'Malaysia', iso2: 'MY', sets: [
    ['Durian', 'Orangutans', 'Batu Caves', 'Petronas Towers', 'Kuala Lumpur'],
    ['Nasi lemak', 'Cameron Highlands', 'Langkawi', 'Borneo jungles', 'Penang'],
    ['Roti canai', 'Rainforest canopies', 'Perhentian Islands', 'Malacca', 'Truly Asia slogan'],
  ] },
  { name: 'Philippines', iso2: 'PH', sets: [
    ['Karaoke', 'Jeepneys', 'Adobo', '7,000 islands', 'Manila'],
    ['Chocolate Hills', 'Tarsiers', 'Boracay', 'Palawan', 'Cebu'],
    ['Basketball obsession', 'Halo-halo', 'Banaue rice terraces', 'Manny Pacquiao', 'Filipino hospitality'],
  ] },
  { name: 'Singapore', iso2: 'SG', sets: [
    ['Fines', 'Hawker centres', 'Merlion', 'Marina Bay', 'Changi'],
    ['Chilli crab', 'Gardens by the Bay', 'Sentosa', 'Raffles Hotel', 'City-state'],
    ['Spotless streets', 'Chewing gum ban', 'Orchard Road', 'Supertrees', 'Lion City'],
  ] },
  { name: 'United Arab Emirates', iso2: 'AE', aliases: ['uae', 'emirates'], sets: [
    ['Gold souks', 'Desert safari', 'Palm islands', 'Burj Khalifa', 'Dubai'],
    ['Seven emirates', 'Sheikh Zayed Mosque', 'Ferrari World', 'Louvre outpost', 'Abu Dhabi'],
    ['Skyscrapers in the desert', 'Dune bashing', 'Man-made islands', 'Burj Al Arab', 'Emirates airline'],
  ] },
  { name: 'Israel', iso2: 'IL', sets: [
    ['Kibbutz', 'Dead Sea', 'Western Wall', 'Jerusalem', 'Tel Aviv'],
    ['Masada', 'Sea of Galilee', 'Old City quarters', 'Negev Desert', 'Holy Land'],
    ['Startup nation', 'Bauhaus city', 'Eilat diving', 'Shakshuka', 'Hebrew'],
  ] },
  { name: 'Saudi Arabia', iso2: 'SA', sets: [
    ['Dates', 'Camels', 'Desert kingdom', 'Mecca', 'Riyadh'],
    ['Oil wealth', 'AlUla', 'Red Sea megaprojects', 'Medina', 'Kaaba'],
    ['Empty Quarter', 'NEOM', 'Arabian horses', 'Jeddah', 'Two Holy Mosques'],
  ] },
  { name: 'Nepal', iso2: 'NP', sets: [
    ['Prayer flags', 'Sherpas', 'Himalayas', 'Mount Everest', 'Kathmandu'],
    ['Momos', 'Annapurna', 'Living goddess', 'Lumbini', 'Base camp treks'],
    ['Yaks', 'Non-rectangular flag', 'Pokhara', 'Gurkhas', 'Everest expeditions'],
  ] },
  { name: 'Sri Lanka', iso2: 'LK', sets: [
    ['Cinnamon', 'Tea plantations', 'Surfing', 'Colombo', 'Ceylon'],
    ['Leopards of Yala', 'Sigiriya rock', 'Train to Ella', 'Galle Fort', 'Indian Ocean teardrop'],
    ['Coconut sambol', 'Stilt fishermen', 'Temple of the Tooth', 'Kandy', 'Ceylon tea'],
  ] },
  { name: 'Pakistan', iso2: 'PK', sets: [
    ['K2', 'Cricket', 'Indus River', 'Karachi', 'Islamabad'],
    ['Hunza Valley', 'Truck art', 'Badshahi Mosque', 'Lahore', 'Karakoram Highway'],
    ['Mangoes', 'Squash champions', 'Khyber Pass', 'Gwadar coast', 'Lahore forts'],
  ] },
  { name: 'Kazakhstan', iso2: 'KZ', sets: [
    ['Steppe', 'Nomads', 'Baikonur', 'Almaty', 'Astana'],
    ['Horse milk', "Apples' origin", 'Caspian shore', 'Charyn Canyon', 'Silk Road steppe'],
    ['Kumis', 'Yurts', 'Tulip origins', 'Medeu skating rink', 'Ninth-largest country'],
  ] },
  { name: 'Cambodia', iso2: 'KH', sets: [
    ['Mekong', 'Khmer', 'Siem Reap', 'Phnom Penh', 'Angkor Wat'],
    ['Bayon stone faces', 'Tonlé Sap', 'Fish amok', 'Apsara dance', 'Temples of Angkor'],
    ['Kampot pepper', 'Floating villages', 'Royal Palace', 'Sihanoukville', 'Khmer Empire'],
  ] },
  { name: 'Jordan', iso2: 'JO', sets: [
    ['Bedouin', 'Wadi Rum', 'Amman', 'Dead Sea shore', 'Petra'],
    ['Mansaf', 'Desert castles', 'Aqaba diving', 'Roman Jerash', 'The Rose City'],
    ['Lawrence of Arabia scenery', 'Madaba mosaics', "King's Highway", 'Floating in salt water', 'Treasury carved in rock'],
  ] },
  { name: 'Qatar', iso2: 'QA', sets: [
    ['Falcons', 'Pearl diving', 'World Cup 2022', 'Al Jazeera', 'Doha'],
    ['Souq Waqif', 'Museum of Islamic Art', 'Inland desert sea', 'Corniche skyline', 'Qatar Airways'],
    ['Camel racing', 'Education City', 'The Pearl island', 'Lusail', 'Arabian Gulf peninsula'],
  ] },
  { name: 'Maldives', iso2: 'MV', sets: [
    ['Atolls', 'Overwater villas', 'Underwater restaurants', 'Honeymoons', 'Malé'],
    ['Seaplanes', 'Manta rays', 'House reefs', 'Bioluminescent beaches', 'Indian Ocean resorts'],
    ['Lowest country on Earth', '1,000+ islands', 'Whale sharks', 'Sandbank picnics', 'Luxury water bungalows'],
  ] },
  { name: 'Mongolia', iso2: 'MN', sets: [
    ['Gers', 'Eagle hunters', 'Gobi Desert', 'Genghis Khan', 'Ulaanbaatar'],
    ['Throat singing', 'Przewalski horses', 'Naadam festival', 'Endless steppe', "Khan's empire"],
    ['Airag', 'Two-humped camels', 'Coldest capital', 'Dinosaur fossils', 'Between Russia and China'],
  ] },
  { name: 'Bangladesh', iso2: 'BD', sets: [
    ['Rickshaws', 'Textiles', 'River deltas', 'Bengal tigers', 'Dhaka'],
    ['Monsoon rivers', 'The Sundarbans', "Cox's Bazar", 'Jute', 'Bay of Bengal'],
    ['Hilsa fish', 'Cricket Tigers', 'Garment factories', 'Padma River', 'Bengali language'],
  ] },
  { name: 'Taiwan', iso2: 'TW', sets: [
    ['Bubble tea', 'Night markets', 'Semiconductors', 'Taipei 101', 'Taipei'],
    ['Stinky tofu', 'Taroko Gorge', 'Sun Moon Lake', 'Alishan railway', 'Formosa'],
    ['Scooter waves', 'Convenience stores', 'Sky lantern festival', 'Beef noodle soup', 'TSMC chips'],
  ] },
  { name: 'Laos', iso2: 'LA', sets: [
    ['Sticky rice', 'Waterfalls', 'Luang Prabang', 'Vientiane', 'Mekong riverbanks'],
    ['Alms-giving monks', 'Kuang Si falls', 'Plain of Jars', 'Slow boats', 'Landlocked Southeast Asia'],
    ['Coffee plateau', 'River tubing', 'Golden stupas', 'Vang Vieng', 'Beerlao'],
  ] },
  { name: 'Oman', iso2: 'OM', sets: [
    ['Frankincense', 'Wadis', 'Dhow boats', 'Sultanate', 'Muscat'],
    ['Desert forts', 'Nizwa', 'Turtle beaches', 'Jebel Akhdar', 'Arabian Sea coast'],
    ['Halwa', 'Khanjar daggers', 'Salalah monsoon', 'Empty Quarter edge', 'Sultan Qaboos Mosque'],
  ] },
  { name: 'Uzbekistan', iso2: 'UZ', sets: [
    ['Silk Road', 'Registan', 'Samarkand', 'Bukhara', 'Tashkent'],
    ['Plov', 'Blue domes', 'Khiva', 'Cotton fields', 'Silk Road cities'],
    ['Melons', "Timur's empire", 'Turquoise tilework', 'Aral Sea', "Central Asia's heart"],
  ] },

  // ---- Africa ----
  { name: 'Egypt', iso2: 'EG', sets: [
    ['Pharaohs', 'Nile', 'Hieroglyphs', 'Sphinx', 'Pyramids'],
    ['Felucca boats', 'Valley of the Kings', 'Red Sea diving', 'Luxor', 'Cairo'],
    ['Papyrus', 'Tutankhamun', 'Abu Simbel', 'Alexandria', 'Mummies'],
  ] },
  { name: 'Morocco', iso2: 'MA', sets: [
    ['Tagine', 'Souks', 'Sahara gateway', 'Casablanca', 'Marrakech'],
    ['Mint tea', 'Chefchaouen blue city', 'Fes medina', 'Camel treks in dunes', 'Atlas Mountains'],
    ['Argan oil', 'Riads', 'Djemaa el-Fna', 'Essaouira', 'Kasbahs'],
  ] },
  { name: 'South Africa', iso2: 'ZA', sets: [
    ['Rugby', 'Penguins', 'Winelands', 'Table Mountain', 'Cape Town'],
    ['Big Five safaris', 'Kruger', 'Garden Route', 'Nelson Mandela', 'Johannesburg'],
    ['Braai', 'Biltong', 'Soweto', 'Springboks', 'Cape of Good Hope'],
  ] },
  { name: 'Kenya', iso2: 'KE', sets: [
    ['Marathon runners', 'Maasai', 'Great Migration', 'Safari', 'Nairobi'],
    ['Rift Valley', 'Flamingo lakes', 'Mombasa coast', 'Big cats of the Mara', 'Mount Kenya'],
    ['Ugali', 'Tea highlands', 'Matatus', 'Amboseli elephants', 'Masai Mara'],
  ] },
  { name: 'Tanzania', iso2: 'TZ', sets: [
    ['Spice islands', 'Ngorongoro', 'Zanzibar', 'Serengeti', 'Kilimanjaro'],
    ["Freddie Mercury's birthplace", 'Stone Town', 'Baobab valleys', 'Wildebeest crossings', "Africa's highest peak"],
    ['Swahili coast', 'Dar es Salaam', 'Selous safaris', 'Zanzibar spice tours', 'Tanzanite'],
  ] },
  { name: 'Nigeria', iso2: 'NG', sets: [
    ['Nollywood', 'Afrobeats', 'Jollof rice', 'Lagos', 'Abuja'],
    ['Fela Kuti', 'Suya', 'Niger Delta', '200 million people', 'Naija'],
    ['Green-white-green flag', 'Burna Boy', 'Egusi soup', 'Super Eagles', 'Giant of Africa'],
  ] },
  { name: 'Ghana', iso2: 'GH', sets: [
    ['Highlife music', 'Cocoa', 'Kente cloth', 'Gold Coast', 'Accra'],
    ['Cape Coast castles', 'Lake Volta', 'Year of Return', 'Kakum canopy walk', 'Black Stars'],
    ['Jollof rivalry', 'Kumasi', 'Ashanti kingdom', 'Fantasy coffins', 'Ghanaian cocoa'],
  ] },
  { name: 'Ethiopia', iso2: 'ET', sets: [
    ['Coffee ceremony', 'Injera', 'Lucy fossil', 'Lalibela', 'Addis Ababa'],
    ['13-month calendar', 'Simien Mountains', 'Blue Nile falls', 'Rock-hewn churches', 'Abyssinia'],
    ['Teff grain', 'Danakil Depression', 'Haile Selassie', 'Marathon legends', 'Horn of Africa'],
  ] },
  { name: 'Uganda', iso2: 'UG', sets: [
    ['Crested crane', 'Gorilla trekking', 'Source of the Nile', 'Lake Victoria', 'Kampala'],
    ['Rolex snack', 'Bwindi forest', 'Murchison Falls', 'Boda bodas', 'Pearl of Africa'],
    ['Matoke', 'Shoebill storks', 'White-water rafting at Jinja', 'Equator markers', "The Nile's source"],
  ] },
  { name: 'Rwanda', iso2: 'RW', sets: [
    ['Thousand hills', 'Volcanoes National Park', 'Mountain gorillas', 'Coffee hills', 'Kigali'],
    ['Clean streets', 'Umuganda community day', 'Lake Kivu', 'Canopy walkways', 'Land of a thousand hills'],
    ['Intore dancers', 'Tea terraces', 'Akagera park', 'Car-free Sundays', 'Gorilla naming ceremony'],
  ] },
  { name: 'Namibia', iso2: 'NA', sets: [
    ['Skeleton Coast', 'Red dunes', 'Sossusvlei', 'Windhoek', 'Namib Desert'],
    ['German colonial towns', 'Himba people', 'Etosha pan', 'Fish River Canyon', 'Dune 45'],
    ['Kolmanskop ghost town', 'Desert elephants', 'Star-gazing skies', 'Swakopmund', 'Oldest desert on Earth'],
  ] },
  { name: 'Botswana', iso2: 'BW', sets: [
    ['Elephants', 'Diamonds', 'Kalahari', 'Okavango Delta', 'Gaborone'],
    ['Mokoro canoes', 'Chobe River', 'San bushmen', 'Salt pans', 'Delta safaris'],
    ["No 1 Ladies' Detective Agency", 'Makgadikgadi', 'Meerkats', 'Luxury safari lodges', 'Elephant capital of Africa'],
  ] },
  { name: 'Zimbabwe', iso2: 'ZW', sets: [
    ['Balancing rocks', 'Hwange', 'Zambezi', 'Victoria Falls', 'Harare'],
    ['Stone sculptures', 'Lake Kariba', 'Mana Pools', 'The smoke that thunders', 'Great Zimbabwe ruins'],
    ['Sadza', 'Baobab trees', 'Bulawayo', "Devil's Pool", 'Mosi-oa-Tunya'],
  ] },
  { name: 'Madagascar', iso2: 'MG', sets: [
    ['Vanilla pods', 'Chameleons', 'Pirate history', 'Lemurs', 'Antananarivo'],
    ['Fourth-largest island', 'Nosy Be', 'Zebu cattle', 'Spiny forests', 'Avenue of the Baobabs'],
    ['Ylang-ylang', 'Whale watching', 'Tsingy stone forests', 'Ring-tailed lemurs', 'Malagasy language'],
  ] },
  { name: 'Algeria', iso2: 'DZ', sets: [
    ['Casbah', 'Atlas foothills', 'Couscous', 'Algiers', 'Sahara Desert'],
    ['Largest African country', 'Tuareg south', 'Roman Timgad', 'Oran', 'Barbary coast'],
    ['Raï music', 'Date oases', "Constantine's bridges", 'Hoggar Mountains', 'North African giant'],
  ] },
  { name: 'Tunisia', iso2: 'TN', sets: [
    ['Star Wars sets', 'Sidi Bou Said', 'Medina', 'Carthage', 'Tunis'],
    ['Harissa', 'Djerba', 'El Jem amphitheatre', 'Matmata cave homes', "Hannibal's home"],
    ['Jasmine revolution', 'Dates and olives', 'Blue-and-white villages', 'Mediterranean beaches', 'Carthage ruins'],
  ] },
  { name: 'Senegal', iso2: 'SN', sets: [
    ['Teranga', 'Wrestling', 'Dakar Rally', 'Gorée Island', 'Dakar'],
    ['Thieboudienne', 'Pink Lake Retba', 'Saint-Louis', 'Baobab savannas', 'Westernmost Africa'],
    ['Mbalax music', 'Sabar drums', 'Djoudj pelicans', 'Sine-Saloum delta', 'Paris-Dakar finish line'],
  ] },
  { name: 'Mozambique', iso2: 'MZ', sets: [
    ['Prawns', 'Dhows', 'Bazaruto', 'Indian Ocean coast', 'Maputo'],
    ['Peri-peri', 'Portuguese-speaking Africa', 'Tofo diving', 'Gorongosa', 'Island of Mozambique'],
    ['Marrabenta music', 'Cashews', 'Quirimbas atolls', 'Flag with a rifle', 'Maputo bay'],
  ] },

  // ---- North America ----
  { name: 'United States', iso2: 'US', aliases: ['usa', 'united states of america', 'america'], sets: [
    ['Route 66', 'Hollywood', 'Grand Canyon', 'Statue of Liberty', 'New York'],
    ['Yellowstone', 'Thanksgiving', 'Silicon Valley', 'White House', 'Washington DC'],
    ['Diners', 'Super Bowl', 'Las Vegas', 'Fourth of July', 'Stars and Stripes'],
  ] },
  { name: 'Canada', iso2: 'CA', sets: [
    ['Maple syrup', 'Ice hockey', 'Mounties', 'Niagara Falls', 'Toronto'],
    ['Poutine', 'Banff', 'French-speaking Quebec', 'Polar bears of Churchill', 'Vancouver'],
    ['Politeness jokes', 'Tim Hortons', 'Moose crossings', 'CN Tower', 'Maple leaf flag'],
  ] },
  { name: 'Mexico', iso2: 'MX', sets: [
    ['Mariachi', 'Day of the Dead', 'Tacos', 'Aztecs', 'Cancún'],
    ['Lucha libre', 'Cenotes', 'Frida Kahlo', 'Chichén Itzá', 'Mexico City'],
    ['Tequila', 'Guacamole', 'Mayan Riviera', 'Sombreros', 'Piñatas'],
  ] },
  { name: 'Cuba', iso2: 'CU', sets: [
    ['Classic cars', 'Cigars', 'Salsa', 'Che Guevara', 'Havana'],
    ['Mojitos', 'Buena Vista Social Club', 'Varadero', 'Revolution murals', 'Caribbean time capsule'],
    ['Rum', 'Dominoes', "Hemingway's haunt", 'Trinidad cobblestones', 'Castro'],
  ] },
  { name: 'Costa Rica', iso2: 'CR', sets: [
    ['Pura Vida', 'Sloths', 'Cloud forest', 'Zip-lining', 'San José'],
    ['Gallo pinto', 'Arenal volcano', 'Toucans', 'Surf on both coasts', 'No army since 1948'],
    ['Coffee fincas', 'Monteverde bridges', 'Manuel Antonio', 'Turtle nesting', 'The Rich Coast'],
  ] },
  { name: 'Panama', iso2: 'PA', sets: [
    ['Isthmus', 'Two oceans', 'Balboa', 'Canal', 'Panama City'],
    ['Casco Viejo', 'San Blas islands', 'Bocas del Toro', 'Ship locks', 'Canal between oceans'],
    ['Darién Gap', 'Mola textiles', 'Skyline of the tropics', 'Miraflores locks', 'Hats named elsewhere'],
  ] },
  { name: 'Jamaica', iso2: 'JM', sets: [
    ['Jerk chicken', 'Reggae', 'Bob Marley', 'Usain Bolt', 'Kingston'],
    ['Blue Mountain coffee', "Dunn's River Falls", 'Rastafari', 'Montego Bay', 'Ocho Rios'],
    ['Patois', 'Cool Runnings bobsleigh', 'Ackee and saltfish', 'Negril cliffs', 'One Love'],
  ] },
  { name: 'Dominican Republic', iso2: 'DO', aliases: ['dominican rep'], sets: [
    ['Merengue', 'Baseball players', 'Punta Cana', 'Santo Domingo', 'Hispaniola'],
    ['Bachata', 'Damajagua waterfalls', 'Whales of Samaná', 'Oldest colonial city', 'Caribbean all-inclusives'],
    ['Mamajuana', 'Larimar gemstone', 'Saona Island', 'Colonial Zone', 'Punta Cana resorts'],
  ] },
  { name: 'Guatemala', iso2: 'GT', sets: [
    ['Quetzal bird', 'Lake Atitlán', 'Mayan ruins', 'Antigua', 'Tikal'],
    ['Chicken buses', 'Volcano hikes', 'Semana Santa carpets', 'Chichicastenango market', 'Maya heartland'],
    ['Worry dolls', 'Pacaya lava', 'Textile markets', 'Flores island town', 'Land of eternal spring'],
  ] },
  { name: 'Honduras', iso2: 'HN', sets: [
    ['Roatán', 'Scuba diving', 'Copán ruins', 'Tegucigalpa', 'Caribbean coast'],
    ['Whale sharks of Utila', 'Bay Islands', 'Garifuna culture', 'Pico Bonito', 'Mayan Copán'],
    ['Baleadas', 'Rain of fish legend', 'La Ceiba', 'Coral reef diving', 'Banana republic origin'],
  ] },
  { name: 'Bahamas', iso2: 'BS', aliases: ['the bahamas'], sets: [
    ['Swimming pigs', 'Turquoise water', 'Atlantis resort', 'Nassau', 'Caribbean islands'],
    ['Conch salad', 'The Exumas', 'Junkanoo', 'Pink sand beaches', 'Grand Bahama'],
    ['700 islands', 'Blue holes', 'Paradise Island', 'Cruise capital', 'Nassau straw market'],
  ] },

  // ---- South America ----
  { name: 'Brazil', iso2: 'BR', sets: [
    ['Carnival', 'Amazon', 'Football', 'Copacabana', 'Rio de Janeiro'],
    ['Caipirinha', 'The Pantanal', 'Samba schools', 'Christ the Redeemer', 'São Paulo'],
    ['Açaí', 'Havaianas', 'Pelé', 'Ipanema', 'Portuguese-speaking giant'],
  ] },
  { name: 'Argentina', iso2: 'AR', sets: [
    ['Tango', 'Gauchos', 'Steak', 'Messi', 'Buenos Aires'],
    ['Malbec wine', 'Iguazú Falls', 'Evita', 'La Boca', 'Maradona'],
    ['Empanadas', 'Polo', 'Perito Moreno glacier', 'Ushuaia', 'Land of silver'],
  ] },
  { name: 'Chile', iso2: 'CL', sets: [
    ['Atacama', 'Easter Island', 'Andes ski', 'Patagonia', 'Santiago'],
    ['Thinnest country', 'Torres del Paine', 'Valparaíso murals', 'Moai statues', 'Chilean wine'],
    ['Copper mines', 'Stargazing deserts', 'Chiloé stilt houses', 'Viña del Mar', 'Andes backbone'],
  ] },
  { name: 'Peru', iso2: 'PE', sets: [
    ['Ceviche', 'Llamas', 'Nazca Lines', 'Incas', 'Machu Picchu'],
    ['Pisco sour', 'Rainbow Mountain', 'Sacred Valley', 'Cusco', 'Lima'],
    ['Alpaca wool', 'Amazon headwaters', 'Colca Canyon', 'Quechua', 'Inca Trail'],
  ] },
  { name: 'Colombia', iso2: 'CO', sets: [
    ['Emeralds', 'Coffee triangle', 'Shakira', 'Cartagena', 'Bogotá'],
    ['Salsa of Cali', 'Lost City trek', 'Medellín', 'Caño Cristales rainbow river', 'García Márquez'],
    ['Cumbia', 'Wax palms', 'Tayrona beaches', 'Paisa region', 'Colombian coffee'],
  ] },
  { name: 'Ecuador', iso2: 'EC', sets: [
    ['Panama hats', 'Cotopaxi', 'Quito', 'Equator line', 'Galápagos'],
    ['Banana exports', 'Otavalo market', 'Middle of the World monument', 'Blue-footed boobies', "Darwin's islands"],
    ['Cacao farms', 'Montañita surf', 'Cuenca', 'Chimborazo', 'Named after the equator'],
  ] },
  { name: 'Bolivia', iso2: 'BO', sets: [
    ['Altiplano', 'Lake Titicaca', 'La Paz', 'Salt flats', 'Uyuni'],
    ['Cholitas wrestling', 'Death Road cycling', "Witches' market", 'Highest capital city', 'Salar mirror'],
    ['Coca leaves', 'Dinosaur footprints of Sucre', 'Flamingo lagoons', 'Cable car city', 'Landlocked Andes'],
  ] },
  { name: 'Uruguay', iso2: 'UY', sets: [
    ['Candombe', 'Beef', 'Punta del Este', 'Montevideo', 'River Plate'],
    ['Chivito', 'Colonia del Sacramento', 'Mate culture', 'First World Cup hosts', 'La Celeste'],
    ['Tannat wine', 'Cabo Polonio', 'Rambla sunsets', 'Suárez and Cavani', 'Between Brazil and Argentina'],
  ] },
  { name: 'Venezuela', iso2: 'VE', sets: [
    ['Orinoco', 'Arepas', 'Oil reserves', 'Angel Falls', 'Caracas'],
    ['Miss Universe titles', 'Tepui mountains', 'Catatumbo lightning', 'Margarita Island', "World's highest waterfall"],
    ['Joropo music', 'Andes to Caribbean', 'Canaima', 'Beauty pageants', "Bolívar's homeland"],
  ] },
  { name: 'Paraguay', iso2: 'PY', sets: [
    ['Guaraní language', 'Itaipu Dam', 'Yerba mate', 'Landlocked', 'Asunción'],
    ['Tereré iced mate', 'Jesuit missions', 'Chaco wilderness', 'Ñandutí lace', 'Heart of South America'],
    ['Chipa bread', 'Harp music', 'Mennonite colonies', 'Paraná River', 'Guaraní currency'],
  ] },

  // ---- Oceania ----
  { name: 'Australia', iso2: 'AU', sets: [
    ['Outback', 'Kangaroos', 'Great Barrier Reef', 'Boomerang', 'Sydney Opera House'],
    ['Vegemite', 'Uluru', 'Bondi Beach', 'Koalas', 'Melbourne'],
    ['Surf lifesavers', 'Didgeridoo', 'Tasmania', 'AFL', 'Down Under'],
  ] },
  { name: 'New Zealand', iso2: 'NZ', sets: [
    ['Kiwis', 'Haka', 'Hobbits', 'Sheep', 'Auckland'],
    ['Bungee jumping origin', 'Milford Sound', 'Maori culture', 'Queenstown', 'All Blacks'],
    ['Glowworm caves', 'Rotorua geothermal', 'Lord of the Rings sets', 'Wellington', 'Land of the long white cloud'],
  ] },
  { name: 'Fiji', iso2: 'FJ', sets: [
    ['Kava', 'Rugby sevens', 'Bula', 'Island resorts', 'Suva'],
    ['Coral Coast', 'Firewalking', 'Village homestays', '333 islands', 'Fiji Water'],
    ['Lovo feast', 'Soft coral capital', 'Mamanuca Islands', 'Cloudbreak surf', 'South Pacific paradise'],
  ] },
  { name: 'Papua New Guinea', iso2: 'PG', aliases: ['png'], sets: [
    ['800 languages', 'Birds of paradise', 'Highlands', 'Kokoda Track', 'Port Moresby'],
    ['Sing-sing festivals', 'Sepik River carvings', 'Rainforest tribes', 'Mount Wilhelm', 'Shares an island with Indonesia'],
    ['Bilum bags', 'Huli wigmen', 'Coral Triangle', 'Bougainville', "The Pacific's largest nation"],
  ] },
]

/**
 * Today's puzzle: a country plus one of its three clue sets. Both picks are
 * deterministic (large odd multipliers, Knuth-style) so consecutive days jump
 * around the list and the same country resurfaces later with different clues.
 */
export function pinpointForDay(day) {
  const country = PINPOINT_COUNTRIES[(day * 2654435761) % PINPOINT_COUNTRIES.length]
  // 48271 is coprime with 3, so the set index actually cycles day to day.
  const set = country.sets[(day * 48271) % country.sets.length]
  return { ...country, words: set }
}

/** Does a typed guess match the answer (name or alias, accents ignored)? */
export function pinpointMatches(country, guess) {
  const n = normalize(guess)
  if (!n) return false
  if (normalize(country.name) === n) return true
  return (country.aliases || []).some((a) => normalize(a) === n)
}
