// What time it is where somebody is.
//
// "3:41pm for them" is the single most useful thing a profile can tell you
// before you press Message. It is the difference between a DM that gets a reply
// in four minutes and one that lands at four in the morning, and it is the one
// fact about a creator that the app already knows and never said.
//
// HOW THE ZONE IS WORKED OUT, AND WHY NOT WITH A LIBRARY.
//
// The profile carries a country code and, for anybody who set a town, a
// longitude. That is enough. A tz-lookup package is a megabyte of polygon data
// to answer a question that has one answer for 90% of countries: most countries
// occupy exactly one zone, so the country code IS the zone. The handful that
// span several are resolved by longitude, coarsely and honestly - the bands
// below are the real zone boundaries rounded to the nearest degree, which puts
// a city in the wrong zone only if it sits within a few miles of a border, and
// a profile that says 2:41pm instead of 3:41pm is still telling you the useful
// thing (they are asleep / they are at lunch).
//
// The clock arithmetic itself is `Intl.DateTimeFormat` with a `timeZone`, which
// is in every browser we support and knows about daylight saving. We are only
// choosing WHICH zone; we are not doing date maths.

// ISO-2 -> IANA zone, for countries with one. A representative city per zone,
// which is what IANA names are.
const ZONE = {
  AD: 'Europe/Andorra', AE: 'Asia/Dubai', AF: 'Asia/Kabul', AG: 'America/Antigua',
  AI: 'America/Anguilla', AL: 'Europe/Tirane', AM: 'Asia/Yerevan', AO: 'Africa/Luanda',
  AR: 'America/Argentina/Buenos_Aires', AT: 'Europe/Vienna', AW: 'America/Aruba',
  AZ: 'Asia/Baku', BA: 'Europe/Sarajevo', BB: 'America/Barbados', BD: 'Asia/Dhaka',
  BE: 'Europe/Brussels', BF: 'Africa/Ouagadougou', BG: 'Europe/Sofia', BH: 'Asia/Bahrain',
  BI: 'Africa/Bujumbura', BJ: 'Africa/Porto-Novo', BM: 'Atlantic/Bermuda', BN: 'Asia/Brunei',
  BO: 'America/La_Paz', BS: 'America/Nassau', BT: 'Asia/Thimphu', BW: 'Africa/Gaborone',
  BY: 'Europe/Minsk', BZ: 'America/Belize', CF: 'Africa/Bangui', CG: 'Africa/Brazzaville',
  CH: 'Europe/Zurich', CI: 'Africa/Abidjan', CM: 'Africa/Douala', CO: 'America/Bogota',
  CR: 'America/Costa_Rica', CU: 'America/Havana', CV: 'Atlantic/Cape_Verde',
  CW: 'America/Curacao', CY: 'Asia/Nicosia', CZ: 'Europe/Prague', DE: 'Europe/Berlin',
  DJ: 'Africa/Djibouti', DK: 'Europe/Copenhagen', DM: 'America/Dominica',
  DO: 'America/Santo_Domingo', DZ: 'Africa/Algiers', EE: 'Europe/Tallinn',
  EG: 'Africa/Cairo', ER: 'Africa/Asmara', ES: 'Europe/Madrid', ET: 'Africa/Addis_Ababa',
  FI: 'Europe/Helsinki', FJ: 'Pacific/Fiji', FO: 'Atlantic/Faroe', FR: 'Europe/Paris',
  GA: 'Africa/Libreville', GB: 'Europe/London', GD: 'America/Grenada', GE: 'Asia/Tbilisi',
  GH: 'Africa/Accra', GI: 'Europe/Gibraltar', GM: 'Africa/Banjul', GN: 'Africa/Conakry',
  GQ: 'Africa/Malabo', GR: 'Europe/Athens', GT: 'America/Guatemala', GW: 'Africa/Bissau',
  GY: 'America/Guyana', HK: 'Asia/Hong_Kong', HN: 'America/Tegucigalpa', HR: 'Europe/Zagreb',
  HT: 'America/Port-au-Prince', HU: 'Europe/Budapest', IE: 'Europe/Dublin',
  IL: 'Asia/Jerusalem', IN: 'Asia/Kolkata', IQ: 'Asia/Baghdad', IR: 'Asia/Tehran',
  IS: 'Atlantic/Reykjavik', IT: 'Europe/Rome', JM: 'America/Jamaica', JO: 'Asia/Amman',
  JP: 'Asia/Tokyo', KE: 'Africa/Nairobi', KG: 'Asia/Bishkek', KH: 'Asia/Phnom_Penh',
  KM: 'Indian/Comoro', KP: 'Asia/Pyongyang', KR: 'Asia/Seoul', KW: 'Asia/Kuwait',
  KY: 'America/Cayman', LA: 'Asia/Vientiane', LB: 'Asia/Beirut', LC: 'America/St_Lucia',
  LI: 'Europe/Vaduz', LK: 'Asia/Colombo', LR: 'Africa/Monrovia', LS: 'Africa/Maseru',
  LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg', LV: 'Europe/Riga', LY: 'Africa/Tripoli',
  MA: 'Africa/Casablanca', MC: 'Europe/Monaco', MD: 'Europe/Chisinau', ME: 'Europe/Podgorica',
  MG: 'Indian/Antananarivo', MK: 'Europe/Skopje', ML: 'Africa/Bamako', MM: 'Asia/Yangon',
  MO: 'Asia/Macau', MR: 'Africa/Nouakchott', MT: 'Europe/Malta', MU: 'Indian/Mauritius',
  MV: 'Indian/Maldives', MW: 'Africa/Blantyre', MY: 'Asia/Kuala_Lumpur',
  MZ: 'Africa/Maputo', NA: 'Africa/Windhoek', NE: 'Africa/Niamey', NG: 'Africa/Lagos',
  NI: 'America/Managua', NL: 'Europe/Amsterdam', NO: 'Europe/Oslo', NP: 'Asia/Kathmandu',
  NZ: 'Pacific/Auckland', OM: 'Asia/Muscat', PA: 'America/Panama', PE: 'America/Lima',
  PH: 'Asia/Manila', PK: 'Asia/Karachi', PL: 'Europe/Warsaw', PR: 'America/Puerto_Rico',
  PS: 'Asia/Gaza', PY: 'America/Asuncion', QA: 'Asia/Qatar', RO: 'Europe/Bucharest',
  RS: 'Europe/Belgrade', RW: 'Africa/Kigali', SA: 'Asia/Riyadh', SC: 'Indian/Mahe',
  SD: 'Africa/Khartoum', SE: 'Europe/Stockholm', SG: 'Asia/Singapore', SI: 'Europe/Ljubljana',
  SK: 'Europe/Bratislava', SL: 'Africa/Freetown', SM: 'Europe/San_Marino',
  SN: 'Africa/Dakar', SO: 'Africa/Mogadishu', SR: 'America/Paramaribo', SS: 'Africa/Juba',
  SV: 'America/El_Salvador', SY: 'Asia/Damascus', SZ: 'Africa/Mbabane', TD: 'Africa/Ndjamena',
  TG: 'Africa/Lome', TH: 'Asia/Bangkok', TJ: 'Asia/Dushanbe', TM: 'Asia/Ashgabat',
  TN: 'Africa/Tunis', TR: 'Europe/Istanbul', TT: 'America/Port_of_Spain', TW: 'Asia/Taipei',
  TZ: 'Africa/Dar_es_Salaam', UA: 'Europe/Kyiv', UG: 'Africa/Kampala', UY: 'America/Montevideo',
  UZ: 'Asia/Tashkent', VA: 'Europe/Vatican', VE: 'America/Caracas', VN: 'Asia/Ho_Chi_Minh',
  YE: 'Asia/Aden', ZA: 'Africa/Johannesburg', ZM: 'Africa/Lusaka', ZW: 'Africa/Harare',
}

// The countries wide enough to hold more than one clock. Each band is
// [westernLimit, zone]; the first band whose limit the longitude is under wins,
// and the last is the catch-all. Longitudes only - latitude never decides a zone.
const BANDS = {
  US: [[-141, 'America/Anchorage'], [-115, 'America/Los_Angeles'], [-101, 'America/Denver'],
    [-87, 'America/Chicago'], [180, 'America/New_York']],
  CA: [[-120, 'America/Vancouver'], [-110, 'America/Edmonton'], [-90, 'America/Winnipeg'],
    [-68, 'America/Toronto'], [180, 'America/Halifax']],
  RU: [[40, 'Europe/Moscow'], [60, 'Asia/Yekaterinburg'], [82, 'Asia/Omsk'],
    [95, 'Asia/Krasnoyarsk'], [113, 'Asia/Irkutsk'], [130, 'Asia/Yakutsk'],
    [145, 'Asia/Vladivostok'], [180, 'Asia/Kamchatka']],
  AU: [[129, 'Australia/Perth'], [141, 'Australia/Adelaide'], [155, 'Australia/Sydney']],
  BR: [[-58, 'America/Manaus'], [180, 'America/Sao_Paulo']],
  MX: [[-110, 'America/Tijuana'], [-102, 'America/Chihuahua'], [180, 'America/Mexico_City']],
  ID: [[115, 'Asia/Jakarta'], [128, 'Asia/Makassar'], [180, 'Asia/Jayapura']],
  KZ: [[68, 'Asia/Aqtobe'], [180, 'Asia/Almaty']],
  CD: [[24, 'Africa/Kinshasa'], [180, 'Africa/Lubumbashi']],
  CL: [[180, 'America/Santiago']],
  CN: [[180, 'Asia/Shanghai']],
  PT: [[-20, 'Atlantic/Azores'], [180, 'Europe/Lisbon']],
  EC: [[-85, 'Pacific/Galapagos'], [180, 'America/Guayaquil']],
  GL: [[-50, 'America/Thule'], [180, 'America/Nuuk']],
}

// WHEN A MULTI-ZONE COUNTRY HAS NO TOWN SET.
//
// Some of these are not really a coin toss. Nearly every Portuguese creator is
// on the mainland and not in the Azores; nearly every Indonesian is on Java.
// Naming the zone that holds the overwhelming majority is right far more often
// than saying nothing, and this line is worth having.
//
// The countries NOT in here are the ones where the guess would be a genuine
// coin toss - the United States, Canada, Russia and Australia each hold several
// zones with large populations in each, so without a town we say nothing rather
// than tell somebody it is 9am when it is 6am.
const DOMINANT = {
  BR: 'America/Sao_Paulo',
  CD: 'Africa/Kinshasa',
  CL: 'America/Santiago',
  CN: 'Asia/Shanghai',
  EC: 'America/Guayaquil',
  GL: 'America/Nuuk',
  ID: 'Asia/Jakarta',
  KZ: 'Asia/Almaty',
  MX: 'America/Mexico_City',
  PT: 'Europe/Lisbon',
}

/**
 * The IANA zone for a creator, or null if their profile does not say enough.
 * @param {{country_code?: string, city_lng?: number}} profile
 */
export function timezoneFor(profile) {
  const iso = (profile?.country_code || '').trim().toUpperCase()
  if (!iso) return null
  const bands = BANDS[iso]
  if (bands) {
    const lng = Number(profile?.city_lng)
    if (!Number.isFinite(lng)) return DOMINANT[iso] || null
    for (const [limit, zone] of bands) if (lng < limit) return zone
    return bands[bands.length - 1][1]
  }
  return ZONE[iso] || null
}

/** "3:41pm" - lowercase meridiem, no leading zero, which is how people write it. */
export function clockIn(zone, now = new Date()) {
  if (!zone) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
    })
      .format(now)
      .replace(/\s?(AM|PM)$/i, (_, m) => m.toLowerCase())
      .replace(/^0/, '')
  } catch {
    return null // an engine without that zone in its database
  }
}

/** Minutes a zone is ahead of the viewer's own, at this instant. */
export function offsetMinutes(zone, now = new Date()) {
  if (!zone) return null
  try {
    const there = new Date(now.toLocaleString('en-US', { timeZone: zone }))
    const here = new Date(now.toLocaleString('en-US'))
    return Math.round((there - here) / 60000)
  } catch {
    return null
  }
}

/**
 * The line a profile shows, or null when there is nothing worth saying.
 * Same clock as the reader gets "same time as you" rather than the time they
 * can already read off their own screen.
 */
export function localTimeLine(profile, now = new Date()) {
  const zone = timezoneFor(profile)
  const time = clockIn(zone, now)
  if (!time) return null
  const off = offsetMinutes(zone, now)
  if (off === 0) return { time, note: 'same time as you', zone }
  const hours = off == null ? null : off / 60
  const note = hours == null
    ? null
    : `${Math.abs(hours) % 1 === 0 ? Math.abs(hours) : Math.abs(hours).toFixed(1)} ${Math.abs(hours) === 1 ? 'hour' : 'hours'} ${hours > 0 ? 'ahead of' : 'behind'} you`
  return { time, note, zone }
}
