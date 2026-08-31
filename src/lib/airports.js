// FOUR CODES WERE WRONG, AND THEY WERE ALL WRONG THE SAME WAY (21 Aug 2026).
//
// Found by cross-checking every row here against OpenFlights while building the
// world airport layer for the map: four entries carried the right airport, with
// the right coordinates, under the IATA code of a DIFFERENT airport serving the
// same city. Somebody had entered the newer field and labelled it with the
// city's better-known code.
//
//   VIS -> VBY   Visby, Gotland. VIS is Visalia Municipal in California, and
//                that is where the dot was being drawn: 8,845 km out.
//   CTU -> TFU   Chengdu Tianfu. CTU is Shuangliu, 56 km west.
//   DKR -> DSS   Dakar Blaise Diagne. DKR is Leopold Sedar Senghor, 45 km west.
//   TIP -> MJI   Tripoli Mitiga. TIP is Tripoli International, 28 km south.
//
// The code is the part that matters, because it is what `flights.from_iata`
// stores and what a boarding pass barcode hands over - a scanned pass reading
// CTU has to resolve to Shuangliu. So the codes were corrected AND the airport
// each code really means was added alongside, which is why Chengdu, Dakar and
// Tripoli now have two entries each. Visalia does not get one: it is a
// municipal field nobody here will fly through, and it is in the world file.
//
// Nothing had been logged against any of the four, so no stored flight changed
// meaning. scripts/gen-world-airports.py now fails the build if a curated
// airport sits more than 50 km from its OpenFlights counterpart, so this class
// of error cannot come back silently.

// Airports, as a flat table you can search.
//
// WHY A LIST IN THE REPO AND NOT A LOOKUP SERVICE. Logging a flight has to be
// fast enough to do on the walk off the aircraft, and a type-ahead that waits
// on a network round trip per keystroke is not that. The whole table is about
// twenty kilobytes, it is loaded only by the flight log (which is itself
// lazily routed), and an airport's coordinates do not change.
//
// WHAT IS IN IT. Roughly the three hundred airports people in this community
// actually fly through: every significant European field (this is a European
// creator programme), the North American and Asian majors, and the biggest
// airport in most countries that has one - so a route to Reykjavik, Marrakesh
// or Tbilisi resolves rather than dead-ending. It is deliberately NOT the full
// 9,000-row OpenFlights dump: that is a megabyte to make "LHR" work.
//
// Each row is [iata, name, city, iso2, lat, lng]. A tuple rather than an object
// because there are three hundred of them and the shape never varies; they are
// expanded into objects once, on first use.
const RAW = [
  // ---- United Kingdom & Ireland
  ['LHR', 'Heathrow', 'London', 'GB', 51.4706, -0.4619],
  ['LGW', 'Gatwick', 'London', 'GB', 51.1537, -0.1821],
  ['STN', 'Stansted', 'London', 'GB', 51.885, 0.235],
  ['LTN', 'Luton', 'London', 'GB', 51.8747, -0.3683],
  ['LCY', 'City', 'London', 'GB', 51.5053, 0.0553],
  ['SEN', 'Southend', 'London', 'GB', 51.5714, 0.6956],
  ['MAN', 'Manchester', 'Manchester', 'GB', 53.3537, -2.275],
  ['BHX', 'Birmingham', 'Birmingham', 'GB', 52.4539, -1.748],
  ['EDI', 'Edinburgh', 'Edinburgh', 'GB', 55.95, -3.3725],
  ['GLA', 'Glasgow', 'Glasgow', 'GB', 55.8719, -4.4331],
  ['BRS', 'Bristol', 'Bristol', 'GB', 51.3827, -2.7191],
  ['NCL', 'Newcastle', 'Newcastle', 'GB', 55.0375, -1.6917],
  ['LPL', 'John Lennon', 'Liverpool', 'GB', 53.3336, -2.8497],
  ['LBA', 'Leeds Bradford', 'Leeds', 'GB', 53.8659, -1.6606],
  ['EMA', 'East Midlands', 'Nottingham', 'GB', 52.8311, -1.3281],
  ['ABZ', 'Aberdeen', 'Aberdeen', 'GB', 57.2019, -2.1978],
  ['BFS', 'Belfast International', 'Belfast', 'GB', 54.6575, -6.2158],
  ['CWL', 'Cardiff', 'Cardiff', 'GB', 51.3967, -3.3433],
  ['DUB', 'Dublin', 'Dublin', 'IE', 53.4213, -6.2701],
  ['ORK', 'Cork', 'Cork', 'IE', 51.8413, -8.4911],
  ['SNN', 'Shannon', 'Shannon', 'IE', 52.702, -8.9248],

  // ---- Iberia
  ['MAD', 'Barajas', 'Madrid', 'ES', 40.4719, -3.5626],
  ['BCN', 'El Prat', 'Barcelona', 'ES', 41.2971, 2.0785],
  ['AGP', 'Malaga', 'Malaga', 'ES', 36.6749, -4.4991],
  ['PMI', 'Palma de Mallorca', 'Palma', 'ES', 39.5517, 2.7388],
  ['ALC', 'Alicante', 'Alicante', 'ES', 38.2822, -0.5582],
  ['VLC', 'Valencia', 'Valencia', 'ES', 39.4893, -0.4816],
  ['SVQ', 'Seville', 'Seville', 'ES', 37.418, -5.8931],
  ['BIO', 'Bilbao', 'Bilbao', 'ES', 43.3011, -2.9106],
  ['IBZ', 'Ibiza', 'Ibiza', 'ES', 38.8729, 1.3731],
  ['TFS', 'Tenerife South', 'Tenerife', 'ES', 28.0445, -16.5725],
  ['TFN', 'Tenerife North', 'Tenerife', 'ES', 28.4827, -16.3415],
  ['LPA', 'Gran Canaria', 'Las Palmas', 'ES', 27.9319, -15.3866],
  ['ACE', 'Lanzarote', 'Arrecife', 'ES', 28.9455, -13.6052],
  ['FUE', 'Fuerteventura', 'Puerto del Rosario', 'ES', 28.4527, -13.8638],
  ['MAH', 'Menorca', 'Mahon', 'ES', 39.8626, 4.2186],
  ['SCQ', 'Santiago de Compostela', 'Santiago', 'ES', 42.8963, -8.4151],
  ['LIS', 'Humberto Delgado', 'Lisbon', 'PT', 38.7742, -9.1342],
  ['OPO', 'Francisco Sa Carneiro', 'Porto', 'PT', 41.2481, -8.6814],
  ['FAO', 'Faro', 'Faro', 'PT', 37.0144, -7.9659],
  ['FNC', 'Madeira', 'Funchal', 'PT', 32.6979, -16.7745],
  ['PDL', 'Joao Paulo II', 'Ponta Delgada', 'PT', 37.7412, -25.6979],

  // ---- France, Benelux
  ['CDG', 'Charles de Gaulle', 'Paris', 'FR', 49.0097, 2.5479],
  ['ORY', 'Orly', 'Paris', 'FR', 48.7233, 2.3794],
  ['BVA', 'Beauvais', 'Paris', 'FR', 49.4544, 2.1128],
  ['NCE', 'Cote d Azur', 'Nice', 'FR', 43.6584, 7.2159],
  ['LYS', 'Saint Exupery', 'Lyon', 'FR', 45.7256, 5.0811],
  ['MRS', 'Provence', 'Marseille', 'FR', 43.4393, 5.2214],
  ['TLS', 'Blagnac', 'Toulouse', 'FR', 43.6293, 1.3638],
  ['BOD', 'Merignac', 'Bordeaux', 'FR', 44.8283, -0.7156],
  ['NTE', 'Atlantique', 'Nantes', 'FR', 47.1532, -1.6107],
  ['AMS', 'Schiphol', 'Amsterdam', 'NL', 52.3105, 4.7683],
  ['EIN', 'Eindhoven', 'Eindhoven', 'NL', 51.4501, 5.3745],
  ['RTM', 'Rotterdam The Hague', 'Rotterdam', 'NL', 51.9569, 4.4372],
  ['BRU', 'Zaventem', 'Brussels', 'BE', 50.9014, 4.4844],
  ['CRL', 'Charleroi', 'Brussels', 'BE', 50.4592, 4.4538],
  ['LUX', 'Findel', 'Luxembourg', 'LU', 49.6233, 6.2044],

  // ---- Germany, Austria, Switzerland
  ['FRA', 'Frankfurt', 'Frankfurt', 'DE', 50.0379, 8.5622],
  ['MUC', 'Munich', 'Munich', 'DE', 48.3538, 11.7861],
  ['BER', 'Brandenburg', 'Berlin', 'DE', 52.3667, 13.5033],
  ['DUS', 'Dusseldorf', 'Dusseldorf', 'DE', 51.2895, 6.7668],
  ['HAM', 'Hamburg', 'Hamburg', 'DE', 53.6304, 9.9882],
  ['CGN', 'Cologne Bonn', 'Cologne', 'DE', 50.8659, 7.1427],
  ['STR', 'Stuttgart', 'Stuttgart', 'DE', 48.6899, 9.2219],
  ['HAJ', 'Hannover', 'Hannover', 'DE', 52.4611, 9.6851],
  ['NUE', 'Nuremberg', 'Nuremberg', 'DE', 49.4987, 11.0781],
  ['VIE', 'Schwechat', 'Vienna', 'AT', 48.1103, 16.5697],
  ['SZG', 'Salzburg', 'Salzburg', 'AT', 47.7933, 13.0043],
  ['INN', 'Innsbruck', 'Innsbruck', 'AT', 47.2602, 11.344],
  ['ZRH', 'Zurich', 'Zurich', 'CH', 47.4647, 8.5492],
  ['GVA', 'Geneva', 'Geneva', 'CH', 46.2381, 6.1089],
  ['BSL', 'EuroAirport', 'Basel', 'CH', 47.5896, 7.5299],

  // ---- Italy, Greece, Malta, Cyprus
  ['FCO', 'Fiumicino', 'Rome', 'IT', 41.8003, 12.2389],
  ['CIA', 'Ciampino', 'Rome', 'IT', 41.7994, 12.5949],
  ['MXP', 'Malpensa', 'Milan', 'IT', 45.6306, 8.7281],
  ['LIN', 'Linate', 'Milan', 'IT', 45.4451, 9.2767],
  ['BGY', 'Orio al Serio', 'Milan', 'IT', 45.6739, 9.7042],
  ['VCE', 'Marco Polo', 'Venice', 'IT', 45.5053, 12.3519],
  ['NAP', 'Capodichino', 'Naples', 'IT', 40.8843, 14.2908],
  ['BLQ', 'Bologna', 'Bologna', 'IT', 44.5354, 11.2887],
  ['FLR', 'Peretola', 'Florence', 'IT', 43.81, 11.2051],
  ['PSA', 'Pisa', 'Pisa', 'IT', 43.6839, 10.3927],
  ['CTA', 'Catania', 'Catania', 'IT', 37.4668, 15.0664],
  ['PMO', 'Palermo', 'Palermo', 'IT', 38.1759, 13.091],
  ['BRI', 'Bari', 'Bari', 'IT', 41.1389, 16.7606],
  ['CAG', 'Cagliari', 'Cagliari', 'IT', 39.2515, 9.0543],
  ['ATH', 'Eleftherios Venizelos', 'Athens', 'GR', 37.9364, 23.9445],
  ['SKG', 'Macedonia', 'Thessaloniki', 'GR', 40.5197, 22.9709],
  ['HER', 'Heraklion', 'Crete', 'GR', 35.3397, 25.1803],
  ['CHQ', 'Chania', 'Crete', 'GR', 35.5317, 24.1497],
  ['RHO', 'Rhodes', 'Rhodes', 'GR', 36.4054, 28.0862],
  ['JTR', 'Santorini', 'Santorini', 'GR', 36.3992, 25.4793],
  ['JMK', 'Mykonos', 'Mykonos', 'GR', 37.4351, 25.3481],
  ['CFU', 'Corfu', 'Corfu', 'GR', 39.6019, 19.9117],
  ['MLA', 'Malta', 'Valletta', 'MT', 35.8575, 14.4775],
  ['LCA', 'Larnaca', 'Larnaca', 'CY', 34.8751, 33.6249],
  ['PFO', 'Paphos', 'Paphos', 'CY', 34.718, 32.4857],

  // ---- Nordics & Baltics
  ['CPH', 'Kastrup', 'Copenhagen', 'DK', 55.6181, 12.656],
  ['BLL', 'Billund', 'Billund', 'DK', 55.7403, 9.1518],
  ['ARN', 'Arlanda', 'Stockholm', 'SE', 59.6519, 17.9186],
  ['BMA', 'Bromma', 'Stockholm', 'SE', 59.3544, 17.9417],
  ['GOT', 'Landvetter', 'Gothenburg', 'SE', 57.6628, 12.2798],
  ['MMX', 'Malmo', 'Malmo', 'SE', 55.5363, 13.3762],
  ['OSL', 'Gardermoen', 'Oslo', 'NO', 60.1939, 11.1004],
  ['BGO', 'Flesland', 'Bergen', 'NO', 60.2934, 5.2181],
  ['TRD', 'Vaernes', 'Trondheim', 'NO', 63.4576, 10.9239],
  ['TOS', 'Tromso', 'Tromso', 'NO', 69.6833, 18.9189],
  ['SVG', 'Sola', 'Stavanger', 'NO', 58.8767, 5.6378],
  ['HEL', 'Vantaa', 'Helsinki', 'FI', 60.3172, 24.9633],
  ['RVN', 'Rovaniemi', 'Rovaniemi', 'FI', 66.5648, 25.8304],
  ['KEF', 'Keflavik', 'Reykjavik', 'IS', 63.985, -22.6056],
  ['TLL', 'Lennart Meri', 'Tallinn', 'EE', 59.4133, 24.8328],
  ['RIX', 'Riga', 'Riga', 'LV', 56.9236, 23.9711],
  ['VNO', 'Vilnius', 'Vilnius', 'LT', 54.6341, 25.2858],

  // ---- Central & Eastern Europe
  ['WAW', 'Chopin', 'Warsaw', 'PL', 52.1657, 20.9671],
  ['WMI', 'Modlin', 'Warsaw', 'PL', 52.451, 20.6518],
  ['KRK', 'John Paul II', 'Krakow', 'PL', 50.0777, 19.7848],
  ['GDN', 'Lech Walesa', 'Gdansk', 'PL', 54.3776, 18.4662],
  ['WRO', 'Copernicus', 'Wroclaw', 'PL', 51.1027, 16.8858],
  ['PRG', 'Vaclav Havel', 'Prague', 'CZ', 50.1008, 14.26],
  ['BUD', 'Ferenc Liszt', 'Budapest', 'HU', 47.4369, 19.2556],
  ['BTS', 'M R Stefanik', 'Bratislava', 'SK', 48.1702, 17.2127],
  ['OTP', 'Henri Coanda', 'Bucharest', 'RO', 44.5711, 26.085],
  ['CLJ', 'Avram Iancu', 'Cluj-Napoca', 'RO', 46.7852, 23.6862],
  ['TSR', 'Traian Vuia', 'Timisoara', 'RO', 45.8099, 21.3379],
  ['IAS', 'Iasi', 'Iasi', 'RO', 47.1785, 27.6206],
  ['SOF', 'Sofia', 'Sofia', 'BG', 42.6967, 23.4114],
  ['VAR', 'Varna', 'Varna', 'BG', 43.2322, 27.8251],
  ['BOJ', 'Burgas', 'Burgas', 'BG', 42.5696, 27.5152],
  ['ZAG', 'Franjo Tudman', 'Zagreb', 'HR', 45.7429, 16.0688],
  ['SPU', 'Split', 'Split', 'HR', 43.539, 16.298],
  ['DBV', 'Dubrovnik', 'Dubrovnik', 'HR', 42.5614, 18.2682],
  ['LJU', 'Joze Pucnik', 'Ljubljana', 'SI', 46.2237, 14.4576],
  ['BEG', 'Nikola Tesla', 'Belgrade', 'RS', 44.8184, 20.3091],
  ['SJJ', 'Sarajevo', 'Sarajevo', 'BA', 43.8246, 18.3315],
  ['TIA', 'Nene Tereza', 'Tirana', 'AL', 41.4147, 19.7206],
  ['SKP', 'Skopje', 'Skopje', 'MK', 41.9616, 21.6214],
  ['TGD', 'Podgorica', 'Podgorica', 'ME', 42.3594, 19.2519],
  ['KBP', 'Boryspil', 'Kyiv', 'UA', 50.345, 30.8947],
  ['TBS', 'Tbilisi', 'Tbilisi', 'GE', 41.6692, 44.9547],
  ['EVN', 'Zvartnots', 'Yerevan', 'AM', 40.1473, 44.3959],

  // ---- Turkey, Middle East
  ['IST', 'Istanbul', 'Istanbul', 'TR', 41.2753, 28.7519],
  ['SAW', 'Sabiha Gokcen', 'Istanbul', 'TR', 40.8986, 29.3092],
  ['AYT', 'Antalya', 'Antalya', 'TR', 36.8987, 30.8005],
  ['ADB', 'Adnan Menderes', 'Izmir', 'TR', 38.2924, 27.157],
  ['ESB', 'Esenboga', 'Ankara', 'TR', 40.1281, 32.9951],
  ['DXB', 'Dubai International', 'Dubai', 'AE', 25.2532, 55.3657],
  ['DWC', 'Al Maktoum', 'Dubai', 'AE', 24.8964, 55.1614],
  ['AUH', 'Zayed International', 'Abu Dhabi', 'AE', 24.433, 54.6511],
  ['DOH', 'Hamad', 'Doha', 'QA', 25.2731, 51.6081],
  ['BAH', 'Bahrain', 'Manama', 'BH', 26.2708, 50.6336],
  ['KWI', 'Kuwait', 'Kuwait City', 'KW', 29.2266, 47.9689],
  ['MCT', 'Muscat', 'Muscat', 'OM', 23.5933, 58.2844],
  ['RUH', 'King Khalid', 'Riyadh', 'SA', 24.9576, 46.6988],
  ['JED', 'King Abdulaziz', 'Jeddah', 'SA', 21.6796, 39.1565],
  ['TLV', 'Ben Gurion', 'Tel Aviv', 'IL', 32.0114, 34.8867],
  ['AMM', 'Queen Alia', 'Amman', 'JO', 31.7226, 35.9932],
  ['BEY', 'Rafic Hariri', 'Beirut', 'LB', 33.8209, 35.4884],

  // ---- Africa
  ['CMN', 'Mohammed V', 'Casablanca', 'MA', 33.3675, -7.5899],
  ['RAK', 'Menara', 'Marrakesh', 'MA', 31.6069, -8.0363],
  ['AGA', 'Al Massira', 'Agadir', 'MA', 30.325, -9.4131],
  ['TNG', 'Ibn Battouta', 'Tangier', 'MA', 35.7269, -5.9169],
  ['FEZ', 'Saiss', 'Fez', 'MA', 33.9273, -4.9779],
  ['TUN', 'Carthage', 'Tunis', 'TN', 36.851, 10.2272],
  ['ALG', 'Houari Boumediene', 'Algiers', 'DZ', 36.691, 3.2154],
  ['CAI', 'Cairo', 'Cairo', 'EG', 30.1219, 31.4056],
  ['HRG', 'Hurghada', 'Hurghada', 'EG', 27.1783, 33.7994],
  ['SSH', 'Sharm el Sheikh', 'Sharm el Sheikh', 'EG', 27.9773, 34.395],
  ['CPT', 'Cape Town', 'Cape Town', 'ZA', -33.9649, 18.6017],
  ['JNB', 'O R Tambo', 'Johannesburg', 'ZA', -26.1392, 28.246],
  ['DUR', 'King Shaka', 'Durban', 'ZA', -29.6144, 31.1197],
  ['NBO', 'Jomo Kenyatta', 'Nairobi', 'KE', -1.3192, 36.9278],
  ['MBA', 'Moi', 'Mombasa', 'KE', -4.0348, 39.5942],
  ['ADD', 'Bole', 'Addis Ababa', 'ET', 8.9779, 38.7993],
  ['LOS', 'Murtala Muhammed', 'Lagos', 'NG', 6.5774, 3.3212],
  ['ACC', 'Kotoka', 'Accra', 'GH', 5.6052, -0.1668],
  ['DSS', 'Blaise Diagne', 'Dakar', 'SN', 14.6708, -17.0733],
  ['DKR', 'Leopold Sedar Senghor', 'Dakar', 'SN', 14.7397, -17.4902],
  ['ZNZ', 'Abeid Amani Karume', 'Zanzibar', 'TZ', -6.222, 39.2249],
  ['JRO', 'Kilimanjaro', 'Arusha', 'TZ', -3.4294, 37.0745],
  ['MRU', 'Sir Seewoosagur Ramgoolam', 'Mauritius', 'MU', -20.4302, 57.6836],
  ['SEZ', 'Seychelles', 'Mahe', 'SC', -4.6743, 55.5218],

  // ---- North America
  ['JFK', 'John F Kennedy', 'New York', 'US', 40.6413, -73.7781],
  ['EWR', 'Newark', 'New York', 'US', 40.6895, -74.1745],
  ['LGA', 'LaGuardia', 'New York', 'US', 40.7769, -73.874],
  ['LAX', 'Los Angeles', 'Los Angeles', 'US', 33.9416, -118.4085],
  ['SFO', 'San Francisco', 'San Francisco', 'US', 37.6213, -122.379],
  ['ORD', 'O Hare', 'Chicago', 'US', 41.9742, -87.9073],
  ['MIA', 'Miami', 'Miami', 'US', 25.7959, -80.287],
  ['MCO', 'Orlando', 'Orlando', 'US', 28.4312, -81.3081],
  ['ATL', 'Hartsfield Jackson', 'Atlanta', 'US', 33.6407, -84.4277],
  ['DFW', 'Dallas Fort Worth', 'Dallas', 'US', 32.8998, -97.0403],
  ['DEN', 'Denver', 'Denver', 'US', 39.8561, -104.6737],
  ['SEA', 'Seattle Tacoma', 'Seattle', 'US', 47.4502, -122.3088],
  ['BOS', 'Logan', 'Boston', 'US', 42.3656, -71.0096],
  ['LAS', 'Harry Reid', 'Las Vegas', 'US', 36.084, -115.1537],
  ['PHX', 'Sky Harbor', 'Phoenix', 'US', 33.4373, -112.0078],
  ['IAH', 'George Bush', 'Houston', 'US', 29.9902, -95.3368],
  ['IAD', 'Dulles', 'Washington', 'US', 38.9531, -77.4565],
  ['DCA', 'Reagan National', 'Washington', 'US', 38.8512, -77.0402],
  ['PHL', 'Philadelphia', 'Philadelphia', 'US', 39.8744, -75.2424],
  ['MSP', 'Minneapolis Saint Paul', 'Minneapolis', 'US', 44.8848, -93.2223],
  ['DTW', 'Detroit Metro', 'Detroit', 'US', 42.2162, -83.3554],
  ['SAN', 'San Diego', 'San Diego', 'US', 32.7338, -117.1933],
  ['AUS', 'Austin Bergstrom', 'Austin', 'US', 30.1975, -97.6664],
  ['NAS', 'Lynden Pindling', 'Nassau', 'BS', 25.039, -77.4661],
  ['HNL', 'Daniel K Inouye', 'Honolulu', 'US', 21.3245, -157.9251],
  ['ANC', 'Ted Stevens', 'Anchorage', 'US', 61.1743, -149.9962],
  ['YYZ', 'Pearson', 'Toronto', 'CA', 43.6777, -79.6248],
  ['YVR', 'Vancouver', 'Vancouver', 'CA', 49.1967, -123.1815],
  ['YUL', 'Trudeau', 'Montreal', 'CA', 45.4706, -73.7408],
  ['YYC', 'Calgary', 'Calgary', 'CA', 51.1315, -114.0106],
  ['MEX', 'Benito Juarez', 'Mexico City', 'MX', 19.4363, -99.0721],
  ['CUN', 'Cancun', 'Cancun', 'MX', 21.0365, -86.877],
  ['GDL', 'Guadalajara', 'Guadalajara', 'MX', 20.5218, -103.311],
  ['SJD', 'Los Cabos', 'San Jose del Cabo', 'MX', 23.1518, -109.7211],
  ['PVR', 'Puerto Vallarta', 'Puerto Vallarta', 'MX', 20.6801, -105.2544],
  ['SJU', 'Luis Munoz Marin', 'San Juan', 'PR', 18.4394, -66.0018],
  ['HAV', 'Jose Marti', 'Havana', 'CU', 22.9892, -82.4091],
  ['PUJ', 'Punta Cana', 'Punta Cana', 'DO', 18.5674, -68.3634],
  ['MBJ', 'Sangster', 'Montego Bay', 'JM', 18.5037, -77.9134],
  ['SJO', 'Juan Santamaria', 'San Jose', 'CR', 9.9939, -84.2088],
  ['PTY', 'Tocumen', 'Panama City', 'PA', 9.0714, -79.3835],

  // ---- South America
  ['GRU', 'Guarulhos', 'Sao Paulo', 'BR', -23.4356, -46.4731],
  ['GIG', 'Galeao', 'Rio de Janeiro', 'BR', -22.8099, -43.2506],
  ['BSB', 'Juscelino Kubitschek', 'Brasilia', 'BR', -15.8697, -47.9208],
  ['SSA', 'Deputado Luis Eduardo Magalhaes', 'Salvador', 'BR', -12.9086, -38.3225],
  ['REC', 'Guararapes', 'Recife', 'BR', -8.1264, -34.9236],
  ['FOR', 'Pinto Martins', 'Fortaleza', 'BR', -3.7763, -38.5326],
  ['EZE', 'Ezeiza', 'Buenos Aires', 'AR', -34.8222, -58.5358],
  ['AEP', 'Jorge Newbery', 'Buenos Aires', 'AR', -34.5592, -58.4156],
  ['SCL', 'Arturo Merino Benitez', 'Santiago', 'CL', -33.3928, -70.7858],
  ['LIM', 'Jorge Chavez', 'Lima', 'PE', -12.0219, -77.1143],
  ['CUZ', 'Alejandro Velasco Astete', 'Cusco', 'PE', -13.5357, -71.9388],
  ['BOG', 'El Dorado', 'Bogota', 'CO', 4.7016, -74.1469],
  ['MDE', 'Jose Maria Cordova', 'Medellin', 'CO', 6.1645, -75.4231],
  ['CTG', 'Rafael Nunez', 'Cartagena', 'CO', 10.4424, -75.513],
  ['UIO', 'Mariscal Sucre', 'Quito', 'EC', -0.1292, -78.3576],
  ['MVD', 'Carrasco', 'Montevideo', 'UY', -34.8384, -56.0308],

  // ---- Asia
  ['HND', 'Haneda', 'Tokyo', 'JP', 35.5494, 139.7798],
  ['NRT', 'Narita', 'Tokyo', 'JP', 35.7719, 140.3928],
  ['KIX', 'Kansai', 'Osaka', 'JP', 34.4348, 135.2441],
  ['ITM', 'Itami', 'Osaka', 'JP', 34.7855, 135.4382],
  ['CTS', 'New Chitose', 'Sapporo', 'JP', 42.7752, 141.6923],
  ['FUK', 'Fukuoka', 'Fukuoka', 'JP', 33.5859, 130.4506],
  ['OKA', 'Naha', 'Okinawa', 'JP', 26.1958, 127.6459],
  ['ICN', 'Incheon', 'Seoul', 'KR', 37.4602, 126.4407],
  ['GMP', 'Gimpo', 'Seoul', 'KR', 37.5583, 126.7906],
  ['PEK', 'Capital', 'Beijing', 'CN', 40.0799, 116.6031],
  ['PKX', 'Daxing', 'Beijing', 'CN', 39.5098, 116.4109],
  ['PVG', 'Pudong', 'Shanghai', 'CN', 31.1443, 121.8083],
  ['SHA', 'Hongqiao', 'Shanghai', 'CN', 31.1979, 121.3363],
  ['CAN', 'Baiyun', 'Guangzhou', 'CN', 23.3924, 113.2988],
  ['SZX', 'Baoan', 'Shenzhen', 'CN', 22.6393, 113.8107],
  ['TFU', 'Tianfu', 'Chengdu', 'CN', 30.3125, 104.4413],
  ['CTU', 'Shuangliu', 'Chengdu', 'CN', 30.5785, 103.947],
  ['HKG', 'Hong Kong', 'Hong Kong', 'HK', 22.308, 113.9185],
  ['TPE', 'Taoyuan', 'Taipei', 'TW', 25.0777, 121.2328],
  ['SIN', 'Changi', 'Singapore', 'SG', 1.3644, 103.9915],
  ['BKK', 'Suvarnabhumi', 'Bangkok', 'TH', 13.69, 100.7501],
  ['DMK', 'Don Mueang', 'Bangkok', 'TH', 13.9126, 100.607],
  ['HKT', 'Phuket', 'Phuket', 'TH', 8.1132, 98.3169],
  ['CNX', 'Chiang Mai', 'Chiang Mai', 'TH', 18.7669, 98.9626],
  ['USM', 'Samui', 'Koh Samui', 'TH', 9.5479, 100.0623],
  ['KUL', 'Kuala Lumpur', 'Kuala Lumpur', 'MY', 2.7456, 101.7099],
  ['PEN', 'Penang', 'Penang', 'MY', 5.2971, 100.2769],
  ['CGK', 'Soekarno Hatta', 'Jakarta', 'ID', -6.1256, 106.6559],
  ['DPS', 'Ngurah Rai', 'Bali', 'ID', -8.7482, 115.1672],
  ['MNL', 'Ninoy Aquino', 'Manila', 'PH', 14.5086, 121.0198],
  ['CEB', 'Mactan Cebu', 'Cebu', 'PH', 10.3075, 123.9794],
  ['SGN', 'Tan Son Nhat', 'Ho Chi Minh City', 'VN', 10.8188, 106.6519],
  ['HAN', 'Noi Bai', 'Hanoi', 'VN', 21.2212, 105.8072],
  ['DAD', 'Da Nang', 'Da Nang', 'VN', 16.0439, 108.1994],
  ['REP', 'Siem Reap Angkor', 'Siem Reap', 'KH', 13.4103, 103.8134],
  ['PNH', 'Phnom Penh', 'Phnom Penh', 'KH', 11.5466, 104.8441],
  ['DEL', 'Indira Gandhi', 'Delhi', 'IN', 28.5562, 77.1],
  ['BOM', 'Chhatrapati Shivaji', 'Mumbai', 'IN', 19.0896, 72.8656],
  ['BLR', 'Kempegowda', 'Bengaluru', 'IN', 13.1986, 77.7066],
  ['MAA', 'Chennai', 'Chennai', 'IN', 12.9941, 80.1709],
  ['HYD', 'Rajiv Gandhi', 'Hyderabad', 'IN', 17.2403, 78.4294],
  ['COK', 'Cochin', 'Kochi', 'IN', 10.152, 76.4019],
  ['GOI', 'Goa Dabolim', 'Goa', 'IN', 15.3808, 73.8314],
  ['CMB', 'Bandaranaike', 'Colombo', 'LK', 7.1808, 79.8841],
  ['MLE', 'Velana', 'Male', 'MV', 4.1918, 73.5291],
  ['KTM', 'Tribhuvan', 'Kathmandu', 'NP', 27.6966, 85.3591],
  ['ALA', 'Almaty', 'Almaty', 'KZ', 43.3521, 77.0405],
  ['TAS', 'Islam Karimov', 'Tashkent', 'UZ', 41.2579, 69.2812],
  ['BKO', 'Modibo Keita', 'Bamako', 'ML', 12.5335, -7.9499],

  // ---- Oceania
  ['SYD', 'Kingsford Smith', 'Sydney', 'AU', -33.9399, 151.1753],
  ['MEL', 'Tullamarine', 'Melbourne', 'AU', -37.669, 144.841],
  ['BNE', 'Brisbane', 'Brisbane', 'AU', -27.3842, 153.1175],
  ['PER', 'Perth', 'Perth', 'AU', -31.9385, 115.9672],
  ['ADL', 'Adelaide', 'Adelaide', 'AU', -34.945, 138.5306],
  ['OOL', 'Gold Coast', 'Gold Coast', 'AU', -28.1644, 153.5047],
  ['CNS', 'Cairns', 'Cairns', 'AU', -16.8858, 145.7554],
  ['AKL', 'Auckland', 'Auckland', 'NZ', -37.0082, 174.7917],
  ['CHC', 'Christchurch', 'Christchurch', 'NZ', -43.4894, 172.5322],
  ['WLG', 'Wellington', 'Wellington', 'NZ', -41.3272, 174.8053],
  ['ZQN', 'Queenstown', 'Queenstown', 'NZ', -45.0211, 168.7392],
  ['NAN', 'Nadi', 'Nadi', 'FJ', -17.7554, 177.4434],
  ['PPT', 'Faaa', 'Papeete', 'PF', -17.5537, -149.6069],

  // ==================================================================
  // THE SECOND PASS: SMALL AND REGIONAL FIELDS.
  //
  // Ethan: "ensure you have all the routes, short and longhaul and from small
  // airports." The block above is majors and flag-carrier hubs, which is the
  // right first three hundred and is exactly wrong for the person who flew
  // Inverness to Amsterdam or Bergerac to Stansted - they got "no airport
  // matches that", which reads as the log refusing their flight rather than as
  // a gap in a table.
  //
  // A regional field is also where the derivation earns its keep: almost
  // nothing serves them, so the airline shortlist for one is short and nearly
  // always right. The majors are the hard case, not these.
  //
  // Everything here is a scheduled passenger airport with an IATA code. It is
  // still not the 9,000-row OpenFlights dump - see the note at the top of the
  // file - but it now covers essentially every field a European creator can
  // buy a ticket from, plus the regional network of the places this community
  // actually travels to.
  // ==================================================================

  // ---- UK & Ireland, regional
  ['INV', 'Inverness', 'Inverness', 'GB', 57.5425, -4.0475],
  ['SOU', 'Southampton', 'Southampton', 'GB', 50.9503, -1.3568],
  ['EXT', 'Exeter', 'Exeter', 'GB', 50.7344, -3.4139],
  ['NQY', 'Newquay', 'Newquay', 'GB', 50.4406, -4.9954],
  ['BOH', 'Bournemouth', 'Bournemouth', 'GB', 50.78, -1.8425],
  ['NWI', 'Norwich', 'Norwich', 'GB', 52.6758, 1.2828],
  ['HUY', 'Humberside', 'Grimsby', 'GB', 53.5744, -0.3508],
  ['DSA', 'Doncaster Sheffield', 'Doncaster', 'GB', 53.4805, -1.0106],
  ['MME', 'Teesside', 'Durham', 'GB', 54.5092, -1.4294],
  ['BLK', 'Blackpool', 'Blackpool', 'GB', 53.7717, -3.0286],
  ['IOM', 'Isle of Man', 'Douglas', 'IM', 54.0833, -4.6239],
  ['JER', 'Jersey', 'Saint Helier', 'JE', 49.2079, -2.1955],
  ['GCI', 'Guernsey', 'Saint Peter Port', 'GG', 49.435, -2.6019],
  ['LDY', 'City of Derry', 'Londonderry', 'GB', 55.0428, -7.1611],
  ['BHD', 'George Best City', 'Belfast', 'GB', 54.6181, -5.8725],
  ['KOI', 'Kirkwall', 'Orkney', 'GB', 58.9578, -2.905],
  ['LSI', 'Sumburgh', 'Shetland', 'GB', 59.8789, -1.2956],
  ['SYY', 'Stornoway', 'Stornoway', 'GB', 58.2156, -6.3231],
  ['NOC', 'Ireland West', 'Knock', 'IE', 53.9103, -8.8185],
  ['KIR', 'Kerry', 'Killarney', 'IE', 52.1809, -9.5238],
  ['DND', 'Dundee', 'Dundee', 'GB', 56.4525, -3.0258],

  // ---- France, regional
  ['LIL', 'Lesquin', 'Lille', 'FR', 50.5619, 3.0894],
  ['SXB', 'Entzheim', 'Strasbourg', 'FR', 48.5383, 7.6282],
  ['MPL', 'Mediterranee', 'Montpellier', 'FR', 43.5762, 3.963],
  ['BIQ', 'Pays Basque', 'Biarritz', 'FR', 43.4684, -1.5233],
  ['PGF', 'Rivesaltes', 'Perpignan', 'FR', 42.7404, 2.8707],
  ['EGC', 'Roumaniere', 'Bergerac', 'FR', 44.8253, 0.5186],
  ['LRH', 'Ile de Re', 'La Rochelle', 'FR', 46.1792, -1.1953],
  ['RNS', 'Saint Jacques', 'Rennes', 'FR', 48.0695, -1.7348],
  ['BES', 'Bretagne', 'Brest', 'FR', 48.4479, -4.4185],
  ['CFE', 'Auvergne', 'Clermont-Ferrand', 'FR', 45.7867, 3.1692],
  ['GNB', 'Alpes Isere', 'Grenoble', 'FR', 45.3629, 5.3294],
  ['CMF', 'Chambery', 'Chambery', 'FR', 45.6381, 5.8802],
  ['TLN', 'Hyeres', 'Toulon', 'FR', 43.0973, 6.146],
  ['AJA', 'Napoleon Bonaparte', 'Ajaccio', 'FR', 41.9236, 8.8029],
  ['BIA', 'Poretta', 'Bastia', 'FR', 42.5527, 9.4837],
  ['FSC', 'Figari', 'Figari', 'FR', 41.5006, 9.0978],
  ['MLH', 'EuroAirport', 'Basel Mulhouse', 'FR', 47.59, 7.5292],
  ['CCF', 'Salvaza', 'Carcassonne', 'FR', 43.216, 2.3063],
  ['FNI', 'Garons', 'Nimes', 'FR', 43.7574, 4.4163],
  ['TUF', 'Val de Loire', 'Tours', 'FR', 47.4322, 0.7276],

  // ---- Iberia, regional
  ['LCG', 'A Coruna', 'A Coruna', 'ES', 43.302, -8.3773],
  ['VGO', 'Vigo', 'Vigo', 'ES', 42.2318, -8.6273],
  ['OVD', 'Asturias', 'Oviedo', 'ES', 43.5636, -6.0346],
  ['SDR', 'Seve Ballesteros', 'Santander', 'ES', 43.4271, -3.82],
  ['EAS', 'San Sebastian', 'San Sebastian', 'ES', 43.3565, -1.7906],
  ['PNA', 'Pamplona', 'Pamplona', 'ES', 42.77, -1.6463],
  ['ZAZ', 'Zaragoza', 'Zaragoza', 'ES', 41.6662, -1.0416],
  ['RMU', 'Region de Murcia', 'Murcia', 'ES', 37.803, -1.125],
  ['GRO', 'Costa Brava', 'Girona', 'ES', 41.901, 2.7605],
  ['REU', 'Reus', 'Reus', 'ES', 41.1474, 1.1672],
  ['XRY', 'Jerez', 'Jerez', 'ES', 36.7446, -6.0601],
  ['GRX', 'Federico Garcia Lorca', 'Granada', 'ES', 37.1887, -3.7776],
  ['LEI', 'Almeria', 'Almeria', 'ES', 36.8439, -2.3701],
  ['VDE', 'El Hierro', 'Valverde', 'ES', 27.8148, -17.8871],
  ['SPC', 'La Palma', 'Santa Cruz de la Palma', 'ES', 28.6265, -17.7556],
  ['GMZ', 'La Gomera', 'San Sebastian de la Gomera', 'ES', 28.0296, -17.2146],
  ['MLN', 'Melilla', 'Melilla', 'ES', 35.2798, -2.9563],
  ['BJZ', 'Badajoz', 'Badajoz', 'ES', 38.8913, -6.8213],
  ['VLL', 'Valladolid', 'Valladolid', 'ES', 41.7061, -4.8519],
  ['LEN', 'Leon', 'Leon', 'ES', 42.589, -5.6556],
  ['TER', 'Lajes', 'Terceira', 'PT', 38.7618, -27.0908],
  ['HOR', 'Horta', 'Faial', 'PT', 38.52, -28.7159],
  ['PXO', 'Porto Santo', 'Porto Santo', 'PT', 33.0734, -16.35],

  // ---- Italy, regional
  ['TRN', 'Caselle', 'Turin', 'IT', 45.2008, 7.6497],
  ['GOA', 'Cristoforo Colombo', 'Genoa', 'IT', 44.4133, 8.8375],
  ['VRN', 'Villafranca', 'Verona', 'IT', 45.3957, 10.8885],
  ['TSF', 'Antonio Canova', 'Treviso', 'IT', 45.6484, 12.1944],
  ['TRS', 'Trieste', 'Trieste', 'IT', 45.8275, 13.4722],
  ['AOI', 'Ancona', 'Ancona', 'IT', 43.6163, 13.3623],
  ['PEG', 'San Francesco', 'Perugia', 'IT', 43.0959, 12.5132],
  ['PSR', 'Abruzzo', 'Pescara', 'IT', 42.4317, 14.1811],
  ['SUF', 'Lamezia Terme', 'Lamezia Terme', 'IT', 38.9054, 16.2423],
  ['BDS', 'Papola Casale', 'Brindisi', 'IT', 40.6576, 17.947],
  ['REG', 'Reggio Calabria', 'Reggio Calabria', 'IT', 38.0712, 15.6516],
  ['TPS', 'Birgi', 'Trapani', 'IT', 37.9114, 12.488],
  ['OLB', 'Costa Smeralda', 'Olbia', 'IT', 40.8987, 9.5176],
  ['AHO', 'Alghero', 'Alghero', 'IT', 40.6321, 8.2908],
  ['CUF', 'Levaldigi', 'Cuneo', 'IT', 44.5470, 7.6232],

  // ---- Greece, islands
  ['KGS', 'Hippocrates', 'Kos', 'GR', 36.7933, 27.0917],
  ['ZTH', 'Dionysios Solomos', 'Zakynthos', 'GR', 37.7509, 20.8843],
  ['EFL', 'Kefalonia', 'Kefalonia', 'GR', 38.1201, 20.5005],
  ['PVK', 'Aktion', 'Preveza', 'GR', 38.9255, 20.7653],
  ['JSI', 'Skiathos', 'Skiathos', 'GR', 39.1771, 23.5037],
  ['SMI', 'Samos', 'Samos', 'GR', 37.69, 26.9117],
  ['MJT', 'Mytilene', 'Lesbos', 'GR', 39.0567, 26.5983],
  ['JNX', 'Naxos', 'Naxos', 'GR', 37.0811, 25.3681],
  ['PAS', 'Paros', 'Paros', 'GR', 37.0203, 25.1281],
  ['KLX', 'Kalamata', 'Kalamata', 'GR', 37.0683, 22.0255],
  ['AXD', 'Alexandroupoli', 'Alexandroupoli', 'GR', 40.8559, 25.9563],
  ['KVA', 'Kavala', 'Kavala', 'GR', 40.9133, 24.6192],
  ['IOA', 'Ioannina', 'Ioannina', 'GR', 39.6963, 20.8225],

  // ---- Germany, Austria, Switzerland, regional
  ['BRE', 'Bremen', 'Bremen', 'DE', 53.0475, 8.7867],
  ['LEJ', 'Leipzig Halle', 'Leipzig', 'DE', 51.4239, 12.2364],
  ['DRS', 'Dresden', 'Dresden', 'DE', 51.1328, 13.7672],
  ['FMM', 'Memmingen', 'Munich West', 'DE', 47.9888, 10.2395],
  ['FKB', 'Karlsruhe Baden-Baden', 'Karlsruhe', 'DE', 48.7794, 8.0805],
  ['SCN', 'Saarbrucken', 'Saarbrucken', 'DE', 49.2146, 7.1095],
  ['MST', 'Maastricht Aachen', 'Maastricht', 'NL', 50.9117, 5.7701],
  ['DTM', 'Dortmund', 'Dortmund', 'DE', 51.5183, 7.6122],
  ['PAD', 'Paderborn Lippstadt', 'Paderborn', 'DE', 51.6141, 8.6163],
  ['RLG', 'Rostock Laage', 'Rostock', 'DE', 53.9182, 12.2783],
  ['GRZ', 'Graz', 'Graz', 'AT', 46.9911, 15.4396],
  ['KLU', 'Klagenfurt', 'Klagenfurt', 'AT', 46.6425, 14.3377],
  ['LNZ', 'Linz', 'Linz', 'AT', 48.2332, 14.1875],
  ['BRN', 'Bern', 'Bern', 'CH', 46.9141, 7.4971],
  ['LUG', 'Lugano', 'Lugano', 'CH', 46.0043, 8.9106],
  ['SIR', 'Sion', 'Sion', 'CH', 46.2196, 7.3268],

  // ---- Nordics & Baltics, regional
  ['AAL', 'Aalborg', 'Aalborg', 'DK', 57.0928, 9.8492],
  ['AAR', 'Aarhus', 'Aarhus', 'DK', 56.3, 10.619],
  ['NYO', 'Skavsta', 'Stockholm', 'SE', 58.7886, 16.9122],
  ['LLA', 'Lulea', 'Lulea', 'SE', 65.5438, 22.122],
  ['UME', 'Umea', 'Umea', 'SE', 63.7918, 20.2828],
  ['VXO', 'Vaxjo', 'Vaxjo', 'SE', 56.9291, 14.728],
  ['KRN', 'Kiruna', 'Kiruna', 'SE', 67.822, 20.3368],
  ['VBY', 'Visby', 'Gotland', 'SE', 57.6628, 18.3462],
  ['TRF', 'Torp', 'Sandefjord', 'NO', 59.1867, 10.2586],
  ['AES', 'Vigra', 'Alesund', 'NO', 62.5625, 6.1197],
  ['BOO', 'Bodo', 'Bodo', 'NO', 67.2692, 14.3653],
  ['EVE', 'Harstad Narvik', 'Evenes', 'NO', 68.4913, 16.678],
  ['KKN', 'Kirkenes', 'Kirkenes', 'NO', 69.7258, 29.8913],
  ['LYR', 'Svalbard', 'Longyearbyen', 'NO', 78.2461, 15.4656],
  ['KRS', 'Kjevik', 'Kristiansand', 'NO', 58.2042, 8.0853],
  ['MOL', 'Aro', 'Molde', 'NO', 62.7447, 7.2625],
  ['TKU', 'Turku', 'Turku', 'FI', 60.5141, 22.2628],
  ['TMP', 'Tampere Pirkkala', 'Tampere', 'FI', 61.4141, 23.6044],
  ['OUL', 'Oulu', 'Oulu', 'FI', 64.93, 25.3546],
  ['KTT', 'Kittila', 'Kittila', 'FI', 67.701, 24.8467],
  ['IVL', 'Ivalo', 'Ivalo', 'FI', 68.6073, 27.4053],
  ['AEY', 'Akureyri', 'Akureyri', 'IS', 65.66, -18.0727],
  ['RKV', 'Reykjavik City', 'Reykjavik', 'IS', 64.13, -21.9406],
  ['PLQ', 'Palanga', 'Palanga', 'LT', 55.9733, 21.0939],
  ['KUN', 'Kaunas', 'Kaunas', 'LT', 54.9639, 24.0848],
  ['TAY', 'Tartu', 'Tartu', 'EE', 58.3075, 26.6903],
  ['LPX', 'Liepaja', 'Liepaja', 'LV', 56.5175, 21.0969],
  ['FAE', 'Vagar', 'Faroe Islands', 'FO', 62.0636, -7.2772],
  ['SFJ', 'Kangerlussuaq', 'Kangerlussuaq', 'GL', 67.0122, -50.7116],
  ['GOH', 'Nuuk', 'Nuuk', 'GL', 64.1909, -51.6781],

  // ---- Central & Eastern Europe, regional
  ['POZ', 'Lawica', 'Poznan', 'PL', 52.421, 16.8263],
  ['KTW', 'Pyrzowice', 'Katowice', 'PL', 50.4743, 19.08],
  ['RZE', 'Jasionka', 'Rzeszow', 'PL', 50.11, 22.019],
  ['SZZ', 'Goleniow', 'Szczecin', 'PL', 53.5847, 14.9022],
  ['LUZ', 'Lublin', 'Lublin', 'PL', 51.2403, 22.7136],
  ['BZG', 'Bydgoszcz', 'Bydgoszcz', 'PL', 53.0968, 17.9777],
  ['BRQ', 'Turany', 'Brno', 'CZ', 49.1513, 16.6944],
  ['OSR', 'Leos Janacek', 'Ostrava', 'CZ', 49.6963, 18.1111],
  ['DEB', 'Debrecen', 'Debrecen', 'HU', 47.4889, 21.6153],
  ['KSC', 'Kosice', 'Kosice', 'SK', 48.6631, 21.2411],
  ['CND', 'Mihail Kogalniceanu', 'Constanta', 'RO', 44.3622, 28.4883],
  ['SBZ', 'Sibiu', 'Sibiu', 'RO', 45.7856, 24.0913],
  ['SCV', 'Suceava', 'Suceava', 'RO', 47.6875, 26.3541],
  ['BCM', 'George Enescu', 'Bacau', 'RO', 46.5219, 26.9103],
  ['CRA', 'Craiova', 'Craiova', 'RO', 44.3181, 23.8886],
  ['OMR', 'Oradea', 'Oradea', 'RO', 47.0253, 21.9025],
  ['PDV', 'Plovdiv', 'Plovdiv', 'BG', 42.0678, 24.8508],
  ['ZAD', 'Zadar', 'Zadar', 'HR', 44.1083, 15.3467],
  ['PUY', 'Pula', 'Pula', 'HR', 44.8935, 13.9222],
  ['RJK', 'Rijeka', 'Rijeka', 'HR', 45.2169, 14.5703],
  ['OSI', 'Osijek', 'Osijek', 'HR', 45.4627, 18.8102],
  ['MBX', 'Maribor', 'Maribor', 'SI', 46.4799, 15.6861],
  ['INI', 'Constantine the Great', 'Nis', 'RS', 43.3373, 21.8537],
  ['TZL', 'Tuzla', 'Tuzla', 'BA', 44.4587, 18.7248],
  ['BNX', 'Banja Luka', 'Banja Luka', 'BA', 44.9414, 17.2975],
  ['OHD', 'Ohrid', 'Ohrid', 'MK', 41.18, 20.7423],
  ['TIV', 'Tivat', 'Tivat', 'ME', 42.4047, 18.7233],
  ['PRN', 'Pristina', 'Pristina', 'XK', 42.5728, 21.0358],
  ['LWO', 'Lviv', 'Lviv', 'UA', 49.8125, 23.9561],
  ['ODS', 'Odesa', 'Odesa', 'UA', 46.4268, 30.6765],
  ['KIV', 'Chisinau', 'Chisinau', 'MD', 46.9277, 28.931],
  ['MSQ', 'Minsk', 'Minsk', 'BY', 53.8825, 28.0307],
  ['GYD', 'Heydar Aliyev', 'Baku', 'AZ', 40.4675, 50.0467],
  ['BUS', 'Batumi', 'Batumi', 'GE', 41.6103, 41.5997],
  ['KUT', 'Kutaisi', 'Kutaisi', 'GE', 42.1767, 42.4826],

  // ---- Turkey & Middle East, regional
  ['BJV', 'Milas Bodrum', 'Bodrum', 'TR', 37.2506, 27.6643],
  ['DLM', 'Dalaman', 'Dalaman', 'TR', 36.7131, 28.7925],
  ['GZP', 'Gazipasa Alanya', 'Alanya', 'TR', 36.2992, 32.3006],
  ['TZX', 'Trabzon', 'Trabzon', 'TR', 40.995, 39.7897],
  ['ADA', 'Sakirpasa', 'Adana', 'TR', 36.9822, 35.2803],
  ['ASR', 'Kayseri', 'Kayseri', 'TR', 38.7704, 35.4954],
  ['NAV', 'Nevsehir Cappadocia', 'Cappadocia', 'TR', 38.7719, 34.5345],
  ['SHJ', 'Sharjah', 'Sharjah', 'AE', 25.3286, 55.5172],
  ['RKT', 'Ras Al Khaimah', 'Ras Al Khaimah', 'AE', 25.6135, 55.9388],
  ['DMM', 'King Fahd', 'Dammam', 'SA', 26.4712, 49.7979],
  ['MED', 'Prince Mohammad', 'Medina', 'SA', 24.5534, 39.705],
  ['AQJ', 'King Hussein', 'Aqaba', 'JO', 29.6116, 35.0181],
  ['ETH', 'Ramon', 'Eilat', 'IL', 29.7233, 35.0114],
  ['SLL', 'Salalah', 'Salalah', 'OM', 17.0387, 54.0913],

  // ---- Africa, regional
  ['NDR', 'Nador', 'Nador', 'MA', 34.9888, -3.0282],
  ['OZZ', 'Ouarzazate', 'Ouarzazate', 'MA', 30.9391, -6.9094],
  ['ESU', 'Essaouira', 'Essaouira', 'MA', 31.3975, -9.6817],
  ['RBA', 'Sale', 'Rabat', 'MA', 34.0515, -6.7515],
  ['MIR', 'Monastir', 'Monastir', 'TN', 35.7581, 10.7547],
  ['DJE', 'Djerba', 'Djerba', 'TN', 33.875, 10.7755],
  ['NBE', 'Enfidha', 'Hammamet', 'TN', 36.0758, 10.4386],
  ['LXR', 'Luxor', 'Luxor', 'EG', 25.671, 32.7066],
  ['ASW', 'Aswan', 'Aswan', 'EG', 23.9644, 32.82],
  ['RUN', 'Roland Garros', 'Reunion', 'RE', -20.8871, 55.5103],
  ['TNR', 'Ivato', 'Antananarivo', 'MG', -18.7969, 47.4788],
  ['WDH', 'Hosea Kutako', 'Windhoek', 'NA', -22.4799, 17.4709],
  ['VFA', 'Victoria Falls', 'Victoria Falls', 'ZW', -18.0959, 25.839],
  ['SID', 'Amilcar Cabral', 'Sal', 'CV', 16.7414, -22.9494],
  ['RAI', 'Praia', 'Praia', 'CV', 14.9245, -23.4935],
  ['FNA', 'Lungi', 'Freetown', 'SL', 8.6164, -13.1955],
  ['BJL', 'Banjul', 'Banjul', 'GM', 13.338, -16.6522],

  // ---- North America, regional & secondary
  ['BUR', 'Hollywood Burbank', 'Los Angeles', 'US', 34.2007, -118.359],
  ['SNA', 'John Wayne', 'Orange County', 'US', 33.6757, -117.8682],
  ['OAK', 'Oakland', 'San Francisco Bay', 'US', 37.7213, -122.2207],
  ['SJC', 'Mineta San Jose', 'San Jose', 'US', 37.3639, -121.9289],
  ['MDW', 'Midway', 'Chicago', 'US', 41.7868, -87.7522],
  ['HOU', 'Hobby', 'Houston', 'US', 29.6454, -95.2789],
  ['DAL', 'Love Field', 'Dallas', 'US', 32.8471, -96.8518],
  ['BWI', 'Baltimore Washington', 'Baltimore', 'US', 39.1754, -76.6683],
  ['PVD', 'T F Green', 'Providence', 'US', 41.7267, -71.4325],
  ['BDL', 'Bradley', 'Hartford', 'US', 41.9389, -72.6832],
  ['PDX', 'Portland', 'Portland', 'US', 45.5887, -122.5975],
  ['SLC', 'Salt Lake City', 'Salt Lake City', 'US', 40.7884, -111.9778],
  ['RDU', 'Raleigh Durham', 'Raleigh', 'US', 35.8776, -78.7875],
  ['CLT', 'Charlotte Douglas', 'Charlotte', 'US', 35.214, -80.9431],
  ['MSY', 'Louis Armstrong', 'New Orleans', 'US', 29.9934, -90.258],
  ['SAT', 'San Antonio', 'San Antonio', 'US', 29.5337, -98.4698],
  ['ABQ', 'Albuquerque', 'Albuquerque', 'US', 35.0402, -106.6091],
  ['RSW', 'Southwest Florida', 'Fort Myers', 'US', 26.5362, -81.7552],
  ['TPA', 'Tampa', 'Tampa', 'US', 27.9755, -82.5332],
  ['PBI', 'Palm Beach', 'West Palm Beach', 'US', 26.6832, -80.0956],
  ['JAX', 'Jacksonville', 'Jacksonville', 'US', 30.4941, -81.6879],
  ['SAV', 'Savannah Hilton Head', 'Savannah', 'US', 32.1276, -81.2021],
  ['CHS', 'Charleston', 'Charleston', 'US', 32.8986, -80.0405],
  ['BNA', 'Nashville', 'Nashville', 'US', 36.1263, -86.6774],
  ['OGG', 'Kahului', 'Maui', 'US', 20.8986, -156.4305],
  ['KOA', 'Ellison Onizuka', 'Kona', 'US', 19.7388, -156.0456],
  ['YOW', 'Ottawa Macdonald-Cartier', 'Ottawa', 'CA', 45.3225, -75.6692],
  ['YHZ', 'Stanfield', 'Halifax', 'CA', 44.8808, -63.5086],
  ['YQB', 'Jean Lesage', 'Quebec City', 'CA', 46.7911, -71.3933],
  ['YEG', 'Edmonton', 'Edmonton', 'CA', 53.3097, -113.5801],
  ['YWG', 'Richardson', 'Winnipeg', 'CA', 49.91, -97.2399],
  ['YYJ', 'Victoria', 'Victoria', 'CA', 48.6469, -123.4258],
  ['MTY', 'Monterrey', 'Monterrey', 'MX', 25.7785, -100.107],
  ['TQO', 'Felipe Carrillo Puerto', 'Tulum', 'MX', 20.2264, -87.5661],
  ['BGI', 'Grantley Adams', 'Barbados', 'BB', 13.0746, -59.4925],
  ['AUA', 'Queen Beatrix', 'Aruba', 'AW', 12.5014, -70.0152],
  ['CUR', 'Hato', 'Curacao', 'CW', 12.1889, -68.9598],
  ['SXM', 'Princess Juliana', 'Sint Maarten', 'SX', 18.041, -63.1089],
  ['ANU', 'V C Bird', 'Antigua', 'AG', 17.1367, -61.7927],
  ['LIR', 'Guanacaste', 'Liberia', 'CR', 10.5933, -85.5444],
  ['BZE', 'Philip Goldson', 'Belize City', 'BZ', 17.5391, -88.3082],

  // ---- South America, regional
  ['CNF', 'Confins', 'Belo Horizonte', 'BR', -19.6244, -43.9719],
  ['POA', 'Salgado Filho', 'Porto Alegre', 'BR', -29.9939, -51.1711],
  ['CWB', 'Afonso Pena', 'Curitiba', 'BR', -25.5285, -49.1758],
  ['MAO', 'Eduardo Gomes', 'Manaus', 'BR', -3.0386, -60.0497],
  ['FLN', 'Hercilio Luz', 'Florianopolis', 'BR', -27.6705, -48.5477],
  ['IGU', 'Foz do Iguacu', 'Foz do Iguacu', 'BR', -25.6003, -54.4850],
  ['MDZ', 'El Plumerillo', 'Mendoza', 'AR', -32.8317, -68.7929],
  ['BRC', 'Bariloche', 'Bariloche', 'AR', -41.1512, -71.1575],
  ['USH', 'Malvinas Argentinas', 'Ushuaia', 'AR', -54.8433, -68.2958],
  ['AQP', 'Rodriguez Ballon', 'Arequipa', 'PE', -16.3411, -71.5831],
  ['CLO', 'Alfonso Bonilla', 'Cali', 'CO', 3.5432, -76.3816],
  ['GYE', 'Jose Joaquin de Olmedo', 'Guayaquil', 'EC', -2.1574, -79.8836],
  ['GPS', 'Seymour', 'Galapagos', 'EC', -0.4536, -90.2659],
  ['CCS', 'Simon Bolivar', 'Caracas', 'VE', 10.6013, -66.9911],
  ['ASU', 'Silvio Pettirossi', 'Asuncion', 'PY', -25.24, -57.5199],
  ['VVI', 'Viru Viru', 'Santa Cruz', 'BO', -17.6448, -63.1354],
  ['LPB', 'El Alto', 'La Paz', 'BO', -16.5133, -68.1923],

  // ---- Asia, regional
  ['NGO', 'Chubu Centrair', 'Nagoya', 'JP', 34.8584, 136.8054],
  ['CJU', 'Jeju', 'Jeju', 'KR', 33.5113, 126.4930],
  ['PUS', 'Gimhae', 'Busan', 'KR', 35.1795, 128.9382],
  ['KBV', 'Krabi', 'Krabi', 'TH', 8.0992, 98.9862],
  ['SUB', 'Juanda', 'Surabaya', 'ID', -7.3798, 112.7869],
  ['BKI', 'Kota Kinabalu', 'Kota Kinabalu', 'MY', 5.9372, 116.0511],
  ['LGK', 'Langkawi', 'Langkawi', 'MY', 6.3298, 99.7287],
  ['DVO', 'Francisco Bangoy', 'Davao', 'PH', 7.1255, 125.6456],
  ['PQC', 'Phu Quoc', 'Phu Quoc', 'VN', 10.171, 103.9931],
  ['VTE', 'Wattay', 'Vientiane', 'LA', 17.9883, 102.5633],
  ['RGN', 'Yangon', 'Yangon', 'MM', 16.9073, 96.1332],
  ['AMD', 'Ahmedabad', 'Ahmedabad', 'IN', 23.0772, 72.6347],
  ['JAI', 'Jaipur', 'Jaipur', 'IN', 26.8242, 75.8122],
  ['CCU', 'Netaji Subhas', 'Kolkata', 'IN', 22.6547, 88.4467],
  ['CJB', 'Coimbatore', 'Coimbatore', 'IN', 11.03, 77.0434],
  ['ISB', 'Islamabad', 'Islamabad', 'PK', 33.5607, 72.8516],
  ['LHE', 'Allama Iqbal', 'Lahore', 'PK', 31.5216, 74.4036],
  ['KHI', 'Jinnah', 'Karachi', 'PK', 24.9065, 67.1608],
  ['DAC', 'Hazrat Shahjalal', 'Dhaka', 'BD', 23.8433, 90.3978],
  ['PBH', 'Paro', 'Paro', 'BT', 27.4032, 89.4246],
  ['ULN', 'Chinggis Khaan', 'Ulaanbaatar', 'MN', 47.6469, 106.8199],
  ['XIY', 'Xianyang', 'Xian', 'CN', 34.4471, 108.7516],
  ['KHH', 'Kaohsiung', 'Kaohsiung', 'TW', 22.5771, 120.3499],
  ['MFM', 'Macau', 'Macau', 'MO', 22.1496, 113.5915],

  // ---- Oceania, regional
  ['HBA', 'Hobart', 'Hobart', 'AU', -42.8361, 147.5103],
  ['DRW', 'Darwin', 'Darwin', 'AU', -12.4147, 130.8767],
  ['CBR', 'Canberra', 'Canberra', 'AU', -35.3069, 149.1950],
  ['TSV', 'Townsville', 'Townsville', 'AU', -19.2526, 146.7653],
  ['ASP', 'Alice Springs', 'Alice Springs', 'AU', -23.8067, 133.9022],
  ['AYQ', 'Ayers Rock', 'Uluru', 'AU', -25.1861, 130.9756],
  ['HLZ', 'Hamilton', 'Hamilton', 'NZ', -37.8667, 175.3321],
  ['DUD', 'Dunedin', 'Dunedin', 'NZ', -45.9281, 170.1983],
  ['ROT', 'Rotorua', 'Rotorua', 'NZ', -38.1092, 176.3172],
  ['APW', 'Faleolo', 'Apia', 'WS', -13.83, -172.0083],
  ['RAR', 'Rarotonga', 'Rarotonga', 'CK', -21.2027, -159.7957],
  ['VLI', 'Bauerfield', 'Port Vila', 'VU', -17.6993, 168.3197],
  ['NOU', 'La Tontouta', 'Noumea', 'NC', -22.0146, 166.213],
  ['GUM', 'Antonio B Won Pat', 'Guam', 'GU', 13.4834, 144.7961],

  // ---- Hubs the airline table referenced that the list above had missed.
  ['HHN', 'Frankfurt Hahn', 'Frankfurt', 'DE', 49.9487, 7.2639],
  ['FLL', 'Fort Lauderdale Hollywood', 'Fort Lauderdale', 'US', 26.0726, -80.1527],
  ['YTZ', 'Billy Bishop', 'Toronto', 'CA', 43.6275, -79.3962],
  ['TIJ', 'Tijuana', 'Tijuana', 'MX', 32.5411, -116.9702],
  ['SAL', 'El Salvador', 'San Salvador', 'SV', 13.4409, -89.0558],
  ['POS', 'Piarco', 'Port of Spain', 'TT', 10.5954, -61.3372],
  ['KIN', 'Norman Manley', 'Kingston', 'JM', 17.9357, -76.7875],
  ['VCP', 'Viracopos', 'Campinas', 'BR', -23.0074, -47.1345],
  ['CGH', 'Congonhas', 'Sao Paulo', 'BR', -23.6262, -46.6564],
  ['DAR', 'Julius Nyerere', 'Dar es Salaam', 'TZ', -6.8781, 39.2026],
  ['XMN', 'Gaoqi', 'Xiamen', 'CN', 24.544, 118.1274],
  ['KMG', 'Changshui', 'Kunming', 'CN', 25.1019, 102.9292],

  // ---- EVERY COUNTRY THAT HAS A COMMERCIAL AIRPORT NOW HAS ONE HERE.
  //
  // Ethan: "ensure every possible airport and flight combination is on."
  //
  // The table above is the three hundred fields this community actually flies
  // through, which is the right basis for a type-ahead and the wrong basis for
  // a LOG: the whole promise of the boarding-pass builder is that you type two
  // codes and it fills itself in, and a code it has never heard of does not
  // half-work, it dead-ends. Fifty-four countries had nothing at all in here,
  // and one of them was RUSSIA - so SVO, DME and LED, three of the busiest
  // airports on the continent this programme is run from, resolved to nothing.
  //
  // What is added is one primary international airport for every country that
  // was missing, plus the second or third field where a country genuinely has
  // more than one door (Libya, Honduras, Botswana, Malawi, St Lucia) and the
  // Russian majors. That is the honest reading of "every combination": any two
  // countries in the world can now be joined by a route this log will price,
  // time and draw.
  //
  // It is still NOT the nine-thousand-row OpenFlights dump, for the reason at
  // the top of this file - that is a megabyte to make "LHR" work - and it never
  // needs to be: the log's aircraft picker already has an "Other" escape, and
  // a field small enough to be missing from this list is a field somebody
  // reaches by a connection that is itself in it.

  // ---- Russia
  ['SVO', 'Sheremetyevo', 'Moscow', 'RU', 55.9726, 37.4146],
  ['DME', 'Domodedovo', 'Moscow', 'RU', 55.4088, 37.9063],
  ['VKO', 'Vnukovo', 'Moscow', 'RU', 55.5915, 37.2615],
  ['LED', 'Pulkovo', 'St Petersburg', 'RU', 59.8003, 30.2625],
  ['AER', 'Sochi', 'Sochi', 'RU', 43.4499, 39.9566],
  ['SVX', 'Koltsovo', 'Yekaterinburg', 'RU', 56.7431, 60.8027],
  ['KZN', 'Kazan', 'Kazan', 'RU', 55.6062, 49.2787],
  ['OVB', 'Tolmachevo', 'Novosibirsk', 'RU', 55.0126, 82.6507],
  ['VVO', 'Knevichi', 'Vladivostok', 'RU', 43.399, 132.148],

  // ---- Asia & the Middle East
  ['KBL', 'Hamid Karzai', 'Kabul', 'AF', 34.5658, 69.2125],
  ['BWN', 'Brunei', 'Bandar Seri Begawan', 'BN', 4.9442, 114.9283],
  ['IKA', 'Imam Khomeini', 'Tehran', 'IR', 35.4161, 51.1522],
  ['BGW', 'Baghdad', 'Baghdad', 'IQ', 33.2625, 44.2346],
  ['EBL', 'Erbil', 'Erbil', 'IQ', 36.2376, 43.9632],
  ['FRU', 'Manas', 'Bishkek', 'KG', 43.0613, 74.4776],
  ['FNJ', 'Pyongyang', 'Pyongyang', 'KP', 39.2241, 125.67],
  ['DAM', 'Damascus', 'Damascus', 'SY', 33.4114, 36.5156],
  ['DYU', 'Dushanbe', 'Dushanbe', 'TJ', 38.5433, 68.825],
  ['DIL', 'Presidente Nicolau Lobato', 'Dili', 'TL', -8.5464, 125.526],
  ['ASB', 'Ashgabat', 'Ashgabat', 'TM', 37.9868, 58.361],
  ['ADE', 'Aden', 'Aden', 'YE', 12.8295, 45.0288],

  // ---- Africa
  ['LAD', 'Quatro de Fevereiro', 'Luanda', 'AO', -8.8584, 13.2312],
  ['COO', 'Cadjehoun', 'Cotonou', 'BJ', 6.3573, 2.3844],
  ['GBE', 'Sir Seretse Khama', 'Gaborone', 'BW', -24.5552, 25.9182],
  ['MUB', 'Maun', 'Maun', 'BW', -19.9726, 23.4311],
  ['OUA', 'Thomas Sankara', 'Ouagadougou', 'BF', 12.3532, -1.5124],
  ['BJM', 'Melchior Ndadaye', 'Bujumbura', 'BI', -3.324, 29.3185],
  ['DLA', 'Douala', 'Douala', 'CM', 4.0061, 9.7195],
  ['NSI', 'Nsimalen', 'Yaounde', 'CM', 3.7226, 11.5533],
  ['BGF', 'Bangui M Poko', 'Bangui', 'CF', 4.3985, 18.5188],
  ['NDJ', 'Hassan Djamous', 'N Djamena', 'TD', 12.1337, 15.034],
  ['HAH', 'Prince Said Ibrahim', 'Moroni', 'KM', -11.5337, 43.2719],
  ['BZV', 'Maya-Maya', 'Brazzaville', 'CG', -4.2517, 15.253],
  ['FIH', 'N djili', 'Kinshasa', 'CD', -4.3858, 15.4446],
  ['ABJ', 'Felix Houphouet-Boigny', 'Abidjan', 'CI', 5.2614, -3.9263],
  ['JIB', 'Ambouli', 'Djibouti', 'DJ', 11.5473, 43.1595],
  ['SSG', 'Malabo', 'Malabo', 'GQ', 3.7553, 8.7087],
  ['ASM', 'Asmara', 'Asmara', 'ER', 15.2919, 38.9107],
  ['SHO', 'King Mswati III', 'Manzini', 'SZ', -26.3585, 31.7167],
  ['LBV', 'Leon-Mba', 'Libreville', 'GA', 0.4586, 9.4123],
  ['CKY', 'Ahmed Sekou Toure', 'Conakry', 'GN', 9.5769, -13.612],
  ['OXB', 'Osvaldo Vieira', 'Bissau', 'GW', 11.8948, -15.6537],
  ['MSU', 'Moshoeshoe I', 'Maseru', 'LS', -29.4623, 27.5525],
  ['ROB', 'Roberts', 'Monrovia', 'LR', 6.2337, -10.3623],
  ['MJI', 'Mitiga', 'Tripoli', 'LY', 32.8940, 13.2760],
  ['TIP', 'Tripoli International', 'Tripoli', 'LY', 32.6635, 13.1590],
  ['BEN', 'Benina', 'Benghazi', 'LY', 32.0968, 20.2695],
  ['LLW', 'Kamuzu', 'Lilongwe', 'MW', -13.7894, 33.781],
  ['BLZ', 'Chileka', 'Blantyre', 'MW', -15.6791, 34.974],
  ['NKC', 'Oumtounsy', 'Nouakchott', 'MR', 18.31, -15.9697],
  ['MPM', 'Maputo', 'Maputo', 'MZ', -25.9208, 32.5726],
  ['NIM', 'Diori Hamani', 'Niamey', 'NE', 13.4815, 2.1836],
  ['KGL', 'Kigali', 'Kigali', 'RW', -1.9686, 30.1395],
  ['TMS', 'Sao Tome', 'Sao Tome', 'ST', 0.3781, 6.7122],
  ['MGQ', 'Aden Adde', 'Mogadishu', 'SO', 2.0144, 45.3047],
  ['JUB', 'Juba', 'Juba', 'SS', 4.872, 31.6011],
  ['KRT', 'Khartoum', 'Khartoum', 'SD', 15.5895, 32.5532],
  ['LFW', 'Gnassingbe Eyadema', 'Lome', 'TG', 6.1656, 1.2544],
  ['EBB', 'Entebbe', 'Entebbe', 'UG', 0.0424, 32.4435],
  ['LUN', 'Kenneth Kaunda', 'Lusaka', 'ZM', -15.3308, 28.4526],
  ['EUN', 'Hassan I', 'Laayoune', 'EH', 27.1517, -13.2192],

  // ---- The Americas & the Caribbean
  ['DOM', 'Douglas-Charles', 'Dominica', 'DM', 15.547, -61.3],
  ['GND', 'Maurice Bishop', 'St George s', 'GD', 11.9902, -61.7862],
  ['GUA', 'La Aurora', 'Guatemala City', 'GT', 14.5833, -90.5275],
  ['PAP', 'Toussaint Louverture', 'Port-au-Prince', 'HT', 18.58, -72.2925],
  ['TGU', 'Toncontin', 'Tegucigalpa', 'HN', 14.0608, -87.2172],
  ['SAP', 'Ramon Villeda Morales', 'San Pedro Sula', 'HN', 15.4526, -87.9236],
  ['RTB', 'Juan Manuel Galvez', 'Roatan', 'HN', 16.3168, -86.523],
  ['MGA', 'Augusto C Sandino', 'Managua', 'NI', 12.1415, -86.1682],
  ['SKB', 'Robert L Bradshaw', 'Basseterre', 'KN', 17.3111, -62.7187],
  ['UVF', 'Hewanorra', 'St Lucia', 'LC', 13.7332, -60.9526],
  ['SLU', 'George F L Charles', 'Castries', 'LC', 14.0202, -60.9929],
  ['SVD', 'Argyle', 'Kingstown', 'VC', 13.1567, -61.1497],
  ['GEO', 'Cheddi Jagan', 'Georgetown', 'GY', 6.4986, -58.2541],
  ['PBM', 'Johan Adolf Pengel', 'Paramaribo', 'SR', 5.4528, -55.1878],

  // ---- The Pacific
  ['TRW', 'Bonriki', 'Tarawa', 'KI', 1.3816, 173.147],
  ['MAJ', 'Marshall Islands', 'Majuro', 'MH', 7.0648, 171.272],
  ['PNI', 'Pohnpei', 'Pohnpei', 'FM', 6.9851, 158.209],
  ['INU', 'Nauru', 'Yaren', 'NR', -0.5472, 166.919],
  ['ROR', 'Roman Tmetuchl', 'Koror', 'PW', 7.3673, 134.544],
  ['POM', 'Jacksons', 'Port Moresby', 'PG', -9.4433, 147.22],
  ['HIR', 'Honiara', 'Honiara', 'SB', -9.428, 160.055],
  ['TBU', 'Fua amotu', 'Nuku alofa', 'TO', -21.2412, -175.15],
  ['FUN', 'Funafuti', 'Funafuti', 'TV', -8.525, 179.196],

  // ---- The far north, which had nothing either
]

export const AIRPORTS = RAW.map(([iata, name, city, country, lat, lng]) => ({
  iata, name, city, country, lat, lng,
  // Precomputed once, because the search runs on every keystroke and
  // lower-casing three hundred strings per keystroke is work nobody asked for.
  haystack: `${iata} ${name} ${city}`.toLowerCase(),
}))

const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]))

export function airport(iata) {
  return iata ? BY_IATA.get(iata.toUpperCase()) || null : null
}

// Search, ranked so the thing you typed the code of is first.
//
// Somebody typing "LIS" wants Lisbon, not the eleven airports with "lis"
// somewhere in a city name. An exact code wins, then a code that starts with
// the query, then a name or city that starts with it, then anything containing
// it.
export function searchAirports(query, limit = 8) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const scored = []
  for (const a of AIRPORTS) {
    const code = a.iata.toLowerCase()
    let score = -1
    if (code === q) score = 0
    else if (code.startsWith(q)) score = 1
    else if (a.city.toLowerCase().startsWith(q)) score = 2
    else if (a.name.toLowerCase().startsWith(q)) score = 3
    else if (a.haystack.includes(q)) score = 4
    if (score >= 0) scored.push([score, a])
  }
  scored.sort((x, y) => x[0] - y[0] || x[1].city.localeCompare(y[1].city))
  return scored.slice(0, limit).map(([, a]) => a)
}

// ------------------------------------------------------------------ geometry

const R = 6371 // mean earth radius, km
const rad = (d) => (d * Math.PI) / 180

// Great-circle distance. This is THE number the whole page is built on, so it
// is the haversine formula rather than anything cheaper: a flat-earth
// approximation is fine over England and wrong by hundreds of kilometres over
// the Pacific, and "wrong by hundreds of kilometres" is exactly the kind of
// error that makes somebody stop trusting a stats page.
export function distanceKm(a, b) {
  if (!a || !b) return 0
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Block time, when nobody wrote one down.
//
// A gate-to-gate figure is not distance / cruise speed: there is taxi at both
// ends, a climb and a descent that are slower than cruise, and a routing that
// is never the straight line the distance assumed. Thirty-five minutes of fixed
// overhead plus 820 km/h puts a London to New York flight at about 7h50, which
// is what the airlines schedule. It is an ESTIMATE and the page says so - a
// logged duration always wins.
export function estimateMinutes(km) {
  if (!km) return 0
  return Math.round(35 + (km / 820) * 60)
}

// ------------------------------------------------- everything else a route
//                                                    already knows about itself
//
// WHY THESE LIVE HERE. Every one of them is a pure function of two airports and
// a distance, which means the flight log can fill them in the moment somebody
// picks the two ends - no typing, no lookup, no round trip. That is the whole
// point of the rebuilt form: a person supplies where they went, and the app
// supplies everything that follows from it.

/** Initial great-circle bearing from a to b, in degrees clockwise from north. */
export function bearing(a, b) {
  if (!a || !b) return 0
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

const POINTS = ['north', 'north east', 'east', 'south east', 'south', 'south west', 'west', 'north west']
/** "north east" - the compass point a bearing falls in. */
export const compass = (deg) => POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]

/**
 * Short, medium or long haul, on the thresholds the industry actually uses
 * (roughly 1,500km and 4,000km). This is worth saying because it is the single
 * word that tells somebody what kind of flight a row was.
 */
export function haul(km) {
  if (km < 1500) return 'Short haul'
  if (km < 4000) return 'Medium haul'
  if (km < 11000) return 'Long haul'
  return 'Ultra long haul'
}

/**
 * Kilograms of CO2 for one passenger, estimated.
 *
 * A fixed ~11kg for the take-off and landing cycle (which is the same however
 * far you then fly, and is why short flights are so much worse per kilometre),
 * plus a per-km rate that falls as the aircraft spends proportionally more of
 * its trip at efficient cruise. The rates are the DEFRA/BEIS order of magnitude
 * for economy seating and this is presented as an estimate, never as a figure
 * anybody should offset against - a real number needs the actual aircraft, the
 * actual load factor and the actual cabin.
 */
export function co2Kg(km) {
  if (!km) return 0
  const perKm = km < 1500 ? 0.156 : km < 4000 ? 0.13 : 0.11
  return Math.round(11 + km * perKm)
}

/**
 * THE AIRPORT SOMEBODY ACTUALLY FLIES FROM.
 *
 * The log's form opened with an empty "from" every time, so a Dublin creator
 * typed DUB before every single flight they have ever logged. Ethan: "always
 * show flights from the home airport (Dublin for a Dublin creator)."
 *
 * Two sources, in this order, because they answer the question with different
 * confidence:
 *
 *  1. THE LOG ITSELF. The airport you have departed from most often is your
 *     home airport, by definition and without anybody having to tell us. It
 *     beats geography: somebody living between two cities flies from whichever
 *     one they actually use.
 *  2. THE NEAREST AIRPORT TO THEIR TOWN, for a creator with nothing logged yet
 *     - which is exactly the person the empty field costs the most. Capped at
 *     250km so that somebody in a place with no airport gets no guess rather
 *     than a wrong one two countries away, and restricted to the sizeable
 *     fields so it never proposes an airstrip.
 *
 * @param flights rows with `from_iata`
 * @param coords  { lat, lng } of their town, or null
 * @returns an IATA code, or '' when neither source can answer
 */
export function homeAirport(flights = [], coords = null) {
  const counts = new Map()
  for (const f of flights) {
    const code = f?.from_iata
    if (!code) continue
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  if (counts.size) {
    // Ties break on the code so the answer is stable between renders rather
    // than depending on Map insertion order after an edit.
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
  }

  const lat = Number(coords?.lat)
  const lng = Number(coords?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  let best = null
  let bestKm = Infinity
  for (const a of AIRPORTS) {
    const d = distanceKm({ lat, lng }, a)
    if (d < bestKm) { bestKm = d; best = a }
  }
  return best && bestKm <= 250 ? best.iata : ''
}
