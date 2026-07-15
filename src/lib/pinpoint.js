import { normalize } from './countries'

// Pinpoint: guess the country. Five clue words per country, revealed one at a
// time, ordered from subtle to giveaway. The puzzle rotates daily and is the
// same for everyone (deterministic day index, like the creator spotlight).
//
//   name    - the answer (accepted when typed)
//   iso2    - flag emoji on the win screen
//   aliases - extra accepted spellings
//   words   - exactly five clues, hardest first
export const PINPOINT_COUNTRIES = [
  // ---- Europe ----
  { name: 'Italy', iso2: 'IT', words: ['Renaissance', 'Vespa', 'Espresso', 'Pasta', 'Colosseum'] },
  { name: 'France', iso2: 'FR', words: ['Riviera', 'Croissant', 'Louvre', 'Baguette', 'Eiffel Tower'] },
  { name: 'Spain', iso2: 'ES', words: ['Siesta', 'Tapas', 'Flamenco', 'Sagrada Família', 'Paella'] },
  { name: 'Portugal', iso2: 'PT', words: ['Azulejo tiles', 'Port wine', 'Fado', 'Algarve', 'Lisbon'] },
  { name: 'United Kingdom', iso2: 'GB', aliases: ['uk', 'great britain', 'britain', 'england'], words: ['Pubs', 'Double-decker bus', 'Afternoon tea', 'Big Ben', 'London'] },
  { name: 'Ireland', iso2: 'IE', aliases: ['republic of ireland'], words: ['Shamrock', 'Guinness', 'Leprechaun', 'St Patrick', 'Dublin'] },
  { name: 'Germany', iso2: 'DE', words: ['Autobahn', 'Bratwurst', 'Oktoberfest', 'Berlin Wall', 'Berlin'] },
  { name: 'Netherlands', iso2: 'NL', aliases: ['holland'], words: ['Canals', 'Clogs', 'Tulips', 'Windmills', 'Amsterdam'] },
  { name: 'Belgium', iso2: 'BE', words: ['Tintin', 'Waffles', 'Fries', 'Chocolate', 'Brussels'] },
  { name: 'Switzerland', iso2: 'CH', words: ['Banks', 'Watches', 'Fondue', 'Matterhorn', 'Zurich'] },
  { name: 'Austria', iso2: 'AT', words: ['Strudel', 'Waltz', 'Mozart', 'Sound of Music', 'Vienna'] },
  { name: 'Greece', iso2: 'GR', words: ['Olives', 'Mythology', 'Santorini', 'Parthenon', 'Athens'] },
  { name: 'Sweden', iso2: 'SE', words: ['Fika', 'Meatballs', 'ABBA', 'IKEA', 'Stockholm'] },
  { name: 'Norway', iso2: 'NO', words: ['Salmon', 'Northern lights', 'Fjords', 'Vikings', 'Oslo'] },
  { name: 'Denmark', iso2: 'DK', words: ['Pastries', 'Hygge', 'Little Mermaid', 'LEGO', 'Copenhagen'] },
  { name: 'Finland', iso2: 'FI', words: ['Reindeer', 'Sauna', 'Santa Claus', 'Nokia', 'Helsinki'] },
  { name: 'Iceland', iso2: 'IS', words: ['Puffins', 'Geysers', 'Volcanoes', 'Blue Lagoon', 'Reykjavik'] },
  { name: 'Croatia', iso2: 'HR', words: ['Adriatic sailing', 'Game of Thrones', 'Plitvice Lakes', 'Dubrovnik', 'Zagreb'] },
  { name: 'Czechia', iso2: 'CZ', aliases: ['czech republic'], words: ['Pilsner', 'Bohemia', 'Astronomical clock', 'Charles Bridge', 'Prague'] },
  { name: 'Hungary', iso2: 'HU', words: ['Paprika', 'Goulash', 'Thermal baths', 'Danube', 'Budapest'] },
  { name: 'Poland', iso2: 'PL', words: ['Amber', 'Pierogi', 'Chopin', 'Kraków', 'Warsaw'] },
  { name: 'Romania', iso2: 'RO', words: ['Castles', 'Carpathians', 'Dracula', 'Transylvania', 'Bucharest'] },
  { name: 'Turkey', iso2: 'TR', aliases: ['türkiye', 'turkiye'], words: ['Kebab', 'Hot air balloons', 'Bosphorus', 'Hagia Sophia', 'Istanbul'] },
  { name: 'Russia', iso2: 'RU', aliases: ['russian federation'], words: ['Tsars', 'Ballet', 'Matryoshka dolls', 'Red Square', 'Moscow'] },
  { name: 'Ukraine', iso2: 'UA', words: ['Wheat fields', 'Sunflowers', 'Borscht', 'Chernobyl', 'Kyiv'] },
  { name: 'Malta', iso2: 'MT', words: ['Megalithic temples', 'Knights', 'Mdina', 'Valletta', 'Mediterranean island'] },
  { name: 'Monaco', iso2: 'MC', words: ['Princess Grace', 'Casino', 'Grand Prix', 'Monte Carlo', 'Riviera micro-state'] },
  { name: 'Cyprus', iso2: 'CY', words: ['Halloumi', 'Aphrodite', 'Divided capital', 'Nicosia', 'Mediterranean island east'] },
  { name: 'Slovenia', iso2: 'SI', words: ['Dragon bridge', 'Postojna caves', 'Julian Alps', 'Ljubljana', 'Lake Bled'] },
  { name: 'Slovakia', iso2: 'SK', words: ['High Tatras', 'Bryndza cheese', 'Castles', 'Bratislava', 'Danube capital'] },
  { name: 'Serbia', iso2: 'RS', words: ['Rakija', 'EXIT Festival', 'Djokovic', 'Belgrade', 'Balkans'] },
  { name: 'Bulgaria', iso2: 'BG', words: ['Rose oil', 'Yogurt', 'Black Sea resorts', 'Rila Monastery', 'Sofia'] },
  { name: 'Albania', iso2: 'AL', words: ['Bunkers', 'Eagles', 'Adriatic beaches', 'Tirana', 'Albanian Riviera'] },
  { name: 'Montenegro', iso2: 'ME', words: ['Black mountain', 'Budva', 'Bay of Kotor', 'Podgorica', 'Adriatic'] },
  { name: 'Bosnia and Herzegovina', iso2: 'BA', aliases: ['bosnia', 'bosnia herzegovina'], words: ['1984 Winter Olympics', 'Stari Most', 'Mostar', 'Sarajevo', 'Balkan bridges'] },
  { name: 'Estonia', iso2: 'EE', words: ['E-residency', 'Skype', 'Medieval old town', 'Baltic Sea', 'Tallinn'] },
  { name: 'Latvia', iso2: 'LV', words: ['Black Balsam', 'Song festivals', 'Art Nouveau', 'Baltic Sea', 'Riga'] },
  { name: 'Lithuania', iso2: 'LT', words: ['Hill of Crosses', 'Basketball', 'Curonian Spit', 'Baltic Sea', 'Vilnius'] },
  { name: 'Luxembourg', iso2: 'LU', words: ['Grand Duchy', 'Banking', 'EU courts', 'Fortress city', 'Luxembourg City'] },

  // ---- Asia ----
  { name: 'Japan', iso2: 'JP', words: ['Bullet train', 'Cherry blossom', 'Sushi', 'Mount Fuji', 'Tokyo'] },
  { name: 'China', iso2: 'CN', words: ['Calligraphy', 'Pandas', 'Terracotta Army', 'Great Wall', 'Beijing'] },
  { name: 'South Korea', iso2: 'KR', aliases: ['korea', 'republic of korea'], words: ['Kimchi', 'K-pop', 'Taekwondo', 'Gangnam', 'Seoul'] },
  { name: 'India', iso2: 'IN', words: ['Bollywood', 'Curry', 'Holi festival', 'Taj Mahal', 'New Delhi'] },
  { name: 'Thailand', iso2: 'TH', words: ['Elephants', 'Tuk-tuk', 'Pad Thai', 'Phuket', 'Bangkok'] },
  { name: 'Vietnam', iso2: 'VN', words: ['Motorbikes', 'Pho', 'Rice paddies', 'Ha Long Bay', 'Hanoi'] },
  { name: 'Indonesia', iso2: 'ID', words: ['Komodo dragons', 'Batik', 'Rice terraces', 'Bali', 'Jakarta'] },
  { name: 'Malaysia', iso2: 'MY', words: ['Durian', 'Orangutans', 'Batu Caves', 'Petronas Towers', 'Kuala Lumpur'] },
  { name: 'Philippines', iso2: 'PH', words: ['Karaoke', 'Jeepneys', 'Adobo', '7,000 islands', 'Manila'] },
  { name: 'Singapore', iso2: 'SG', words: ['Fines', 'Hawker centres', 'Merlion', 'Marina Bay', 'Changi'] },
  { name: 'United Arab Emirates', iso2: 'AE', aliases: ['uae', 'emirates'], words: ['Gold souks', 'Desert safari', 'Palm islands', 'Burj Khalifa', 'Dubai'] },
  { name: 'Israel', iso2: 'IL', words: ['Kibbutz', 'Dead Sea', 'Western Wall', 'Jerusalem', 'Tel Aviv'] },
  { name: 'Saudi Arabia', iso2: 'SA', words: ['Dates', 'Camels', 'Desert kingdom', 'Mecca', 'Riyadh'] },
  { name: 'Nepal', iso2: 'NP', words: ['Prayer flags', 'Sherpas', 'Himalayas', 'Mount Everest', 'Kathmandu'] },
  { name: 'Sri Lanka', iso2: 'LK', words: ['Cinnamon', 'Tea plantations', 'Surfing', 'Colombo', 'Ceylon'] },
  { name: 'Pakistan', iso2: 'PK', words: ['K2', 'Cricket', 'Indus River', 'Karachi', 'Islamabad'] },
  { name: 'Kazakhstan', iso2: 'KZ', words: ['Steppe', 'Nomads', 'Baikonur', 'Almaty', 'Astana'] },
  { name: 'Cambodia', iso2: 'KH', words: ['Mekong', 'Khmer', 'Siem Reap', 'Phnom Penh', 'Angkor Wat'] },
  { name: 'Jordan', iso2: 'JO', words: ['Bedouin', 'Wadi Rum', 'Amman', 'Dead Sea shore', 'Petra'] },
  { name: 'Qatar', iso2: 'QA', words: ['Falcons', 'Pearl diving', 'World Cup 2022', 'Al Jazeera', 'Doha'] },
  { name: 'Maldives', iso2: 'MV', words: ['Atolls', 'Overwater villas', 'Underwater restaurants', 'Honeymoons', 'Malé'] },
  { name: 'Mongolia', iso2: 'MN', words: ['Gers', 'Eagle hunters', 'Gobi Desert', 'Genghis Khan', 'Ulaanbaatar'] },
  { name: 'Bangladesh', iso2: 'BD', words: ['Rickshaws', 'Textiles', 'River deltas', 'Bengal tigers', 'Dhaka'] },
  { name: 'Taiwan', iso2: 'TW', words: ['Bubble tea', 'Night markets', 'Semiconductors', 'Taipei 101', 'Taipei'] },
  { name: 'Laos', iso2: 'LA', words: ['Sticky rice', 'Waterfalls', 'Luang Prabang', 'Vientiane', 'Mekong riverbanks'] },
  { name: 'Oman', iso2: 'OM', words: ['Frankincense', 'Wadis', 'Dhow boats', 'Sultanate', 'Muscat'] },
  { name: 'Uzbekistan', iso2: 'UZ', words: ['Silk Road', 'Registan', 'Samarkand', 'Bukhara', 'Tashkent'] },

  // ---- Africa ----
  { name: 'Egypt', iso2: 'EG', words: ['Pharaohs', 'Nile', 'Hieroglyphs', 'Sphinx', 'Pyramids'] },
  { name: 'Morocco', iso2: 'MA', words: ['Tagine', 'Souks', 'Sahara gateway', 'Casablanca', 'Marrakech'] },
  { name: 'South Africa', iso2: 'ZA', words: ['Rugby', 'Penguins', 'Winelands', 'Table Mountain', 'Cape Town'] },
  { name: 'Kenya', iso2: 'KE', words: ['Marathon runners', 'Maasai', 'Great Migration', 'Safari', 'Nairobi'] },
  { name: 'Tanzania', iso2: 'TZ', words: ['Spice islands', 'Ngorongoro', 'Zanzibar', 'Serengeti', 'Kilimanjaro'] },
  { name: 'Nigeria', iso2: 'NG', words: ['Nollywood', 'Afrobeats', 'Jollof rice', 'Lagos', 'Abuja'] },
  { name: 'Ghana', iso2: 'GH', words: ['Highlife music', 'Cocoa', 'Kente cloth', 'Gold Coast', 'Accra'] },
  { name: 'Ethiopia', iso2: 'ET', words: ['Coffee ceremony', 'Injera', 'Lucy fossil', 'Lalibela', 'Addis Ababa'] },
  { name: 'Uganda', iso2: 'UG', words: ['Crested crane', 'Gorilla trekking', 'Source of the Nile', 'Lake Victoria', 'Kampala'] },
  { name: 'Rwanda', iso2: 'RW', words: ['Thousand hills', 'Volcanoes National Park', 'Mountain gorillas', 'Coffee hills', 'Kigali'] },
  { name: 'Namibia', iso2: 'NA', words: ['Skeleton Coast', 'Red dunes', 'Sossusvlei', 'Windhoek', 'Namib Desert'] },
  { name: 'Botswana', iso2: 'BW', words: ['Elephants', 'Diamonds', 'Kalahari', 'Okavango Delta', 'Gaborone'] },
  { name: 'Zimbabwe', iso2: 'ZW', words: ['Balancing rocks', 'Hwange', 'Zambezi', 'Victoria Falls', 'Harare'] },
  { name: 'Madagascar', iso2: 'MG', words: ['Vanilla', 'Chameleons', 'Baobab avenue', 'Lemurs', 'Antananarivo'] },
  { name: 'Algeria', iso2: 'DZ', words: ['Casbah', 'Atlas Mountains', 'Couscous', 'Algiers', 'Sahara Desert'] },
  { name: 'Tunisia', iso2: 'TN', words: ['Star Wars sets', 'Sidi Bou Said', 'Medina', 'Carthage', 'Tunis'] },
  { name: 'Senegal', iso2: 'SN', words: ['Teranga', 'Wrestling', 'Dakar Rally', 'Gorée Island', 'Dakar'] },
  { name: 'Mozambique', iso2: 'MZ', words: ['Prawns', 'Dhows', 'Bazaruto', 'Indian Ocean coast', 'Maputo'] },

  // ---- North America ----
  { name: 'United States', iso2: 'US', aliases: ['usa', 'united states of america', 'america'], words: ['Route 66', 'Hollywood', 'Grand Canyon', 'Statue of Liberty', 'New York'] },
  { name: 'Canada', iso2: 'CA', words: ['Maple syrup', 'Ice hockey', 'Mounties', 'Niagara Falls', 'Toronto'] },
  { name: 'Mexico', iso2: 'MX', words: ['Mariachi', 'Day of the Dead', 'Tacos', 'Aztecs', 'Cancún'] },
  { name: 'Cuba', iso2: 'CU', words: ['Classic cars', 'Cigars', 'Salsa', 'Che Guevara', 'Havana'] },
  { name: 'Costa Rica', iso2: 'CR', words: ['Pura Vida', 'Sloths', 'Cloud forest', 'Zip-lining', 'San José'] },
  { name: 'Panama', iso2: 'PA', words: ['Isthmus', 'Two oceans', 'Balboa', 'Canal', 'Panama City'] },
  { name: 'Jamaica', iso2: 'JM', words: ['Jerk chicken', 'Reggae', 'Bob Marley', 'Usain Bolt', 'Kingston'] },
  { name: 'Dominican Republic', iso2: 'DO', aliases: ['dominican rep'], words: ['Merengue', 'Baseball players', 'Punta Cana', 'Santo Domingo', 'Hispaniola'] },
  { name: 'Guatemala', iso2: 'GT', words: ['Quetzal bird', 'Lake Atitlán', 'Mayan ruins', 'Antigua', 'Tikal'] },
  { name: 'Honduras', iso2: 'HN', words: ['Roatán', 'Scuba diving', 'Copán ruins', 'Tegucigalpa', 'Caribbean coast'] },
  { name: 'Bahamas', iso2: 'BS', aliases: ['the bahamas'], words: ['Swimming pigs', 'Turquoise water', 'Atlantis resort', 'Nassau', 'Caribbean islands'] },

  // ---- South America ----
  { name: 'Brazil', iso2: 'BR', words: ['Carnival', 'Amazon', 'Football', 'Copacabana', 'Rio de Janeiro'] },
  { name: 'Argentina', iso2: 'AR', words: ['Tango', 'Gauchos', 'Steak', 'Messi', 'Buenos Aires'] },
  { name: 'Chile', iso2: 'CL', words: ['Atacama', 'Easter Island', 'Andes ski', 'Patagonia', 'Santiago'] },
  { name: 'Peru', iso2: 'PE', words: ['Ceviche', 'Llamas', 'Nazca Lines', 'Incas', 'Machu Picchu'] },
  { name: 'Colombia', iso2: 'CO', words: ['Emeralds', 'Coffee triangle', 'Shakira', 'Cartagena', 'Bogotá'] },
  { name: 'Ecuador', iso2: 'EC', words: ['Panama hats', 'Cotopaxi', 'Quito', 'Equator line', 'Galápagos'] },
  { name: 'Bolivia', iso2: 'BO', words: ['Altiplano', 'Lake Titicaca', 'La Paz', 'Salt flats', 'Uyuni'] },
  { name: 'Uruguay', iso2: 'UY', words: ['Candombe', 'Beef', 'Punta del Este', 'Montevideo', 'River Plate'] },
  { name: 'Venezuela', iso2: 'VE', words: ['Orinoco', 'Arepas', 'Oil reserves', 'Angel Falls', 'Caracas'] },
  { name: 'Paraguay', iso2: 'PY', words: ['Guaraní language', 'Itaipu Dam', 'Yerba mate', 'Landlocked', 'Asunción'] },

  // ---- Oceania ----
  { name: 'Australia', iso2: 'AU', words: ['Outback', 'Kangaroos', 'Great Barrier Reef', 'Boomerang', 'Sydney Opera House'] },
  { name: 'New Zealand', iso2: 'NZ', words: ['Kiwis', 'Haka', 'Hobbits', 'Sheep', 'Auckland'] },
  { name: 'Fiji', iso2: 'FJ', words: ['Kava', 'Rugby sevens', 'Bula', 'Island resorts', 'Suva'] },
  { name: 'Papua New Guinea', iso2: 'PG', aliases: ['png'], words: ['800 languages', 'Birds of paradise', 'Highlands', 'Kokoda Track', 'Port Moresby'] },
]

/** Days since the epoch (UTC), the shared clock for all daily puzzles. */
export function dayIndex(now = Date.now()) {
  return Math.floor(now / 86_400_000)
}

/**
 * Today's Pinpoint country. Deterministic for everyone; the multiplier is a
 * large odd constant (Knuth) so consecutive days jump around the list instead
 * of walking it alphabetically.
 */
export function pinpointForDay(day) {
  return PINPOINT_COUNTRIES[(day * 2654435761) % PINPOINT_COUNTRIES.length]
}

/** Does a typed guess match the answer (name or alias, accents ignored)? */
export function pinpointMatches(country, guess) {
  const n = normalize(guess)
  if (!n) return false
  if (normalize(country.name) === n) return true
  return (country.aliases || []).some((a) => normalize(a) === n)
}
