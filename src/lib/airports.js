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
  ['DKR', 'Blaise Diagne', 'Dakar', 'SN', 14.6708, -17.0733],
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
  ['CTU', 'Tianfu', 'Chengdu', 'CN', 30.3125, 104.4413],
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
