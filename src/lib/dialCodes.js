// International dialling codes for the phone-number field.
//   iso2 - used to render the flag emoji (regional-indicator pair)
//   code - the dial code we store in creator_private.phone_country (e.g. "+44")
//   name - shown in the dropdown
//
// EVERY COUNTRY AND TERRITORY WITH A CALLING CODE IS HERE, NOT A SHORTLIST.
// A Bulgarian creator could not finish signing up because the field is
// compulsory and "his" code was not where he looked - and the list was a hand
// picked ninety out of ~240, so the next missing country would have been the
// same dead end. The picker is searchable by name AND by code, and a number
// typed or pasted with its own "+359 ..." is recognised too (`splitInternational`).
//
// Countries that share a code (US/Canada +1, Russia/Kazakhstan +7, ...) are
// separate rows so each is findable by its own name; `code` is what is stored.
const ALL = [
  ['AF', '+93', 'Afghanistan'], ['AL', '+355', 'Albania'], ['DZ', '+213', 'Algeria'],
  ['AS', '+1684', 'American Samoa'], ['AD', '+376', 'Andorra'], ['AO', '+244', 'Angola'],
  ['AI', '+1264', 'Anguilla'], ['AG', '+1268', 'Antigua and Barbuda'], ['AR', '+54', 'Argentina'],
  ['AM', '+374', 'Armenia'], ['AW', '+297', 'Aruba'], ['AU', '+61', 'Australia'],
  ['AT', '+43', 'Austria'], ['AZ', '+994', 'Azerbaijan'], ['BS', '+1242', 'Bahamas'],
  ['BH', '+973', 'Bahrain'], ['BD', '+880', 'Bangladesh'], ['BB', '+1246', 'Barbados'],
  ['BY', '+375', 'Belarus'], ['BE', '+32', 'Belgium'], ['BZ', '+501', 'Belize'],
  ['BJ', '+229', 'Benin'], ['BM', '+1441', 'Bermuda'], ['BT', '+975', 'Bhutan'],
  ['BO', '+591', 'Bolivia'], ['BA', '+387', 'Bosnia and Herzegovina'], ['BW', '+267', 'Botswana'],
  ['BR', '+55', 'Brazil'], ['IO', '+246', 'British Indian Ocean Territory'],
  ['VG', '+1284', 'British Virgin Islands'], ['BN', '+673', 'Brunei'], ['BG', '+359', 'Bulgaria'],
  ['BF', '+226', 'Burkina Faso'], ['BI', '+257', 'Burundi'], ['KH', '+855', 'Cambodia'],
  ['CM', '+237', 'Cameroon'], ['CA', '+1', 'Canada'], ['CV', '+238', 'Cape Verde'],
  ['KY', '+1345', 'Cayman Islands'], ['CF', '+236', 'Central African Republic'], ['TD', '+235', 'Chad'],
  ['CL', '+56', 'Chile'], ['CN', '+86', 'China'], ['CX', '+61', 'Christmas Island'],
  ['CC', '+61', 'Cocos (Keeling) Islands'], ['CO', '+57', 'Colombia'], ['KM', '+269', 'Comoros'],
  ['CG', '+242', 'Congo'], ['CD', '+243', 'Congo (Democratic Republic)'], ['CK', '+682', 'Cook Islands'],
  ['CR', '+506', 'Costa Rica'], ['CI', '+225', 'Cote d\'Ivoire'], ['HR', '+385', 'Croatia'],
  ['CU', '+53', 'Cuba'], ['CW', '+599', 'Curacao'], ['CY', '+357', 'Cyprus'],
  ['CZ', '+420', 'Czechia'], ['DK', '+45', 'Denmark'], ['DJ', '+253', 'Djibouti'],
  ['DM', '+1767', 'Dominica'], ['DO', '+1809', 'Dominican Republic'], ['EC', '+593', 'Ecuador'],
  ['EG', '+20', 'Egypt'], ['SV', '+503', 'El Salvador'], ['GQ', '+240', 'Equatorial Guinea'],
  ['ER', '+291', 'Eritrea'], ['EE', '+372', 'Estonia'], ['SZ', '+268', 'Eswatini'],
  ['ET', '+251', 'Ethiopia'], ['FK', '+500', 'Falkland Islands'], ['FO', '+298', 'Faroe Islands'],
  ['FJ', '+679', 'Fiji'], ['FI', '+358', 'Finland'], ['FR', '+33', 'France'],
  ['GF', '+594', 'French Guiana'], ['PF', '+689', 'French Polynesia'], ['GA', '+241', 'Gabon'],
  ['GM', '+220', 'Gambia'], ['GE', '+995', 'Georgia'], ['DE', '+49', 'Germany'],
  ['GH', '+233', 'Ghana'], ['GI', '+350', 'Gibraltar'], ['GR', '+30', 'Greece'],
  ['GL', '+299', 'Greenland'], ['GD', '+1473', 'Grenada'], ['GP', '+590', 'Guadeloupe'],
  ['GU', '+1671', 'Guam'], ['GT', '+502', 'Guatemala'], ['GG', '+44', 'Guernsey'],
  ['GN', '+224', 'Guinea'], ['GW', '+245', 'Guinea-Bissau'], ['GY', '+592', 'Guyana'],
  ['HT', '+509', 'Haiti'], ['HN', '+504', 'Honduras'], ['HK', '+852', 'Hong Kong'],
  ['HU', '+36', 'Hungary'], ['IS', '+354', 'Iceland'], ['IN', '+91', 'India'],
  ['ID', '+62', 'Indonesia'], ['IR', '+98', 'Iran'], ['IQ', '+964', 'Iraq'],
  ['IE', '+353', 'Ireland'], ['IM', '+44', 'Isle of Man'], ['IL', '+972', 'Israel'],
  ['IT', '+39', 'Italy'], ['JM', '+1876', 'Jamaica'], ['JP', '+81', 'Japan'],
  ['JE', '+44', 'Jersey'], ['JO', '+962', 'Jordan'], ['KZ', '+7', 'Kazakhstan'],
  ['KE', '+254', 'Kenya'], ['KI', '+686', 'Kiribati'], ['XK', '+383', 'Kosovo'],
  ['KW', '+965', 'Kuwait'], ['KG', '+996', 'Kyrgyzstan'], ['LA', '+856', 'Laos'],
  ['LV', '+371', 'Latvia'], ['LB', '+961', 'Lebanon'], ['LS', '+266', 'Lesotho'],
  ['LR', '+231', 'Liberia'], ['LY', '+218', 'Libya'], ['LI', '+423', 'Liechtenstein'],
  ['LT', '+370', 'Lithuania'], ['LU', '+352', 'Luxembourg'], ['MO', '+853', 'Macao'],
  ['MG', '+261', 'Madagascar'], ['MW', '+265', 'Malawi'], ['MY', '+60', 'Malaysia'],
  ['MV', '+960', 'Maldives'], ['ML', '+223', 'Mali'], ['MT', '+356', 'Malta'],
  ['MH', '+692', 'Marshall Islands'], ['MQ', '+596', 'Martinique'], ['MR', '+222', 'Mauritania'],
  ['MU', '+230', 'Mauritius'], ['YT', '+262', 'Mayotte'], ['MX', '+52', 'Mexico'],
  ['FM', '+691', 'Micronesia'], ['MD', '+373', 'Moldova'], ['MC', '+377', 'Monaco'],
  ['MN', '+976', 'Mongolia'], ['ME', '+382', 'Montenegro'], ['MS', '+1664', 'Montserrat'],
  ['MA', '+212', 'Morocco'], ['MZ', '+258', 'Mozambique'], ['MM', '+95', 'Myanmar'],
  ['NA', '+264', 'Namibia'], ['NR', '+674', 'Nauru'], ['NP', '+977', 'Nepal'],
  ['NL', '+31', 'Netherlands'], ['NC', '+687', 'New Caledonia'], ['NZ', '+64', 'New Zealand'],
  ['NI', '+505', 'Nicaragua'], ['NE', '+227', 'Niger'], ['NG', '+234', 'Nigeria'],
  ['NU', '+683', 'Niue'], ['NF', '+672', 'Norfolk Island'], ['KP', '+850', 'North Korea'],
  ['MK', '+389', 'North Macedonia'], ['MP', '+1670', 'Northern Mariana Islands'], ['NO', '+47', 'Norway'],
  ['OM', '+968', 'Oman'], ['PK', '+92', 'Pakistan'], ['PW', '+680', 'Palau'],
  ['PS', '+970', 'Palestine'], ['PA', '+507', 'Panama'], ['PG', '+675', 'Papua New Guinea'],
  ['PY', '+595', 'Paraguay'], ['PE', '+51', 'Peru'], ['PH', '+63', 'Philippines'],
  ['PL', '+48', 'Poland'], ['PT', '+351', 'Portugal'], ['PR', '+1787', 'Puerto Rico'],
  ['QA', '+974', 'Qatar'], ['RE', '+262', 'Reunion'], ['RO', '+40', 'Romania'],
  ['RU', '+7', 'Russia'], ['RW', '+250', 'Rwanda'], ['BL', '+590', 'Saint Barthelemy'],
  ['SH', '+290', 'Saint Helena'], ['KN', '+1869', 'Saint Kitts and Nevis'], ['LC', '+1758', 'Saint Lucia'],
  ['MF', '+590', 'Saint Martin'], ['PM', '+508', 'Saint Pierre and Miquelon'],
  ['VC', '+1784', 'Saint Vincent and the Grenadines'], ['WS', '+685', 'Samoa'], ['SM', '+378', 'San Marino'],
  ['ST', '+239', 'Sao Tome and Principe'], ['SA', '+966', 'Saudi Arabia'], ['SN', '+221', 'Senegal'],
  ['RS', '+381', 'Serbia'], ['SC', '+248', 'Seychelles'], ['SL', '+232', 'Sierra Leone'],
  ['SG', '+65', 'Singapore'], ['SX', '+1721', 'Sint Maarten'], ['SK', '+421', 'Slovakia'],
  ['SI', '+386', 'Slovenia'], ['SB', '+677', 'Solomon Islands'], ['SO', '+252', 'Somalia'],
  ['ZA', '+27', 'South Africa'], ['KR', '+82', 'South Korea'], ['SS', '+211', 'South Sudan'],
  ['ES', '+34', 'Spain'], ['LK', '+94', 'Sri Lanka'], ['SD', '+249', 'Sudan'],
  ['SR', '+597', 'Suriname'], ['SE', '+46', 'Sweden'], ['CH', '+41', 'Switzerland'],
  ['SY', '+963', 'Syria'], ['TW', '+886', 'Taiwan'], ['TJ', '+992', 'Tajikistan'],
  ['TZ', '+255', 'Tanzania'], ['TH', '+66', 'Thailand'], ['TL', '+670', 'Timor-Leste'],
  ['TG', '+228', 'Togo'], ['TK', '+690', 'Tokelau'], ['TO', '+676', 'Tonga'],
  ['TT', '+1868', 'Trinidad and Tobago'], ['TN', '+216', 'Tunisia'], ['TR', '+90', 'Turkey'],
  ['TM', '+993', 'Turkmenistan'], ['TC', '+1649', 'Turks and Caicos Islands'], ['TV', '+688', 'Tuvalu'],
  ['UG', '+256', 'Uganda'], ['UA', '+380', 'Ukraine'], ['AE', '+971', 'United Arab Emirates'],
  ['GB', '+44', 'United Kingdom'], ['US', '+1', 'United States'], ['UY', '+598', 'Uruguay'],
  ['VI', '+1340', 'US Virgin Islands'], ['UZ', '+998', 'Uzbekistan'], ['VU', '+678', 'Vanuatu'],
  ['VA', '+379', 'Vatican City'], ['VE', '+58', 'Venezuela'], ['VN', '+84', 'Vietnam'],
  ['WF', '+681', 'Wallis and Futuna'], ['YE', '+967', 'Yemen'], ['ZM', '+260', 'Zambia'],
  ['ZW', '+263', 'Zimbabwe'],
]

// The markets and the most likely audience first, then everyone else A-Z.
const FIRST = ['GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'FR', 'DE', 'ES', 'PT', 'IT', 'NL', 'BE', 'CH', 'AT', 'PL', 'SE', 'NO', 'DK', 'FI', 'RO', 'BG', 'GR']

export const DIAL_CODES = (() => {
  const rows = ALL.map(([iso2, code, name]) => ({ iso2, code, name }))
  const head = FIRST.map((iso) => rows.find((r) => r.iso2 === iso)).filter(Boolean)
  const rest = rows.filter((r) => !FIRST.includes(r.iso2)).sort((a, b) => a.name.localeCompare(b.name))
  return [...head, ...rest]
})()

// "+359 88 123 4567" (or "00359...") -> { code: '+359', iso2: 'BG', national: '88 123 4567' }.
// The LONGEST matching code wins, so +1242 is the Bahamas rather than "+1" with
// a 242 prefix. Returns null when it does not begin with a plus or 00, or no
// code matches. Used when somebody types or pastes the full international
// number into the number box instead of choosing a code first.
export function splitInternational(raw) {
  const s = String(raw ?? '').trim()
  const m = s.match(/^(?:\+|00)\s*([\d\s().-]+)$/)
  if (!m) return null
  const digits = m[1].replace(/\D/g, '')
  let best = null
  for (const r of DIAL_CODES) {
    const c = r.code.slice(1)
    if (digits.startsWith(c) && digits.length > c.length && (!best || c.length > best.code.length - 1)) best = r
  }
  if (!best) return null
  return { code: best.code, iso2: best.iso2, national: digits.slice(best.code.length - 1) }
}

// Flag emoji from an ISO 3166-1 alpha-2 code. Re-exported so the phone-code
// picker keeps its one-stop import, but there is only ONE implementation.
export { flagEmoji } from './countries'
