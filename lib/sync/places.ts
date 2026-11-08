/**
 * Place names for the location gate (location.ts): countries and the cities
 * global employers' career sites list most, so a posting overseas is removed
 * rather than sent to review. Unilever's site listed "Guayaquil, Ecuador" and
 * Uniqlo's "Frankfurt, Germany" (Oct 2026); the old list named neither.
 *
 * Left out on purpose: names that are also Australian places or common words
 * in a location field: "Jordan" (Jordan Springs, NSW), "Victoria"
 * (Seychelles), "Wellington" (NSW).
 */

export const COUNTRIES = [
  'afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'argentina', 'armenia', 'austria', 'azerbaijan',
  'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium', 'belize', 'benin', 'bhutan', 'bolivia',
  'bosnia', 'botswana', 'brazil', 'brasil', 'brunei', 'bulgaria', 'burkina faso', 'burundi', 'cambodia', 'cameroon',
  'canada', 'cape verde', 'chile', 'china', 'colombia', 'congo', 'costa rica', 'croatia', 'cuba', 'cyprus',
  'czech republic', 'czechia', 'denmark', 'djibouti', 'dominican republic', 'ecuador', 'egypt', 'el salvador',
  'estonia', 'eswatini', 'ethiopia', 'fiji', 'finland', 'france', 'gabon', 'gambia', 'germany', 'deutschland',
  'ghana', 'greece', 'guatemala', 'guinea', 'guyana', 'haiti', 'honduras', 'hong kong', 'hungary', 'iceland',
  'india', 'indonesia', 'iran', 'iraq', 'ireland', 'israel', 'italy', 'italia', 'ivory coast', 'jamaica', 'japan',
  'kazakhstan', 'kenya', 'kosovo', 'kuwait', 'kyrgyzstan', 'laos', 'latvia', 'lebanon', 'lesotho', 'liberia',
  'libya', 'liechtenstein', 'lithuania', 'luxembourg', 'macau', 'madagascar', 'malawi', 'malaysia', 'maldives',
  'mali', 'malta', 'mauritius', 'mexico', 'méxico', 'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco',
  'mozambique', 'myanmar', 'namibia', 'nepal', 'netherlands', 'the netherlands', 'nicaragua', 'niger', 'nigeria',
  'north macedonia', 'norway', 'oman', 'pakistan', 'panama', 'papua new guinea', 'paraguay', 'peru', 'perú',
  'philippines', 'poland', 'portugal', 'puerto rico', 'qatar', 'romania', 'russia', 'rwanda', 'samoa',
  'saudi arabia', 'senegal', 'serbia', 'sierra leone', 'singapore', 'slovakia', 'slovenia', 'solomon islands',
  'somalia', 'south africa', 'south korea', 'korea', 'spain', 'españa', 'sri lanka', 'sudan', 'suriname', 'sweden',
  'switzerland', 'syria', 'taiwan', 'tajikistan', 'tanzania', 'thailand', 'timor-leste', 'togo', 'tonga',
  'trinidad', 'tunisia', 'turkey', 'türkiye', 'turkmenistan', 'uganda', 'ukraine', 'united arab emirates', 'uae',
  'united kingdom', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'united states',
  'usa', 'u.s.a', 'uruguay', 'uzbekistan', 'vanuatu', 'venezuela', 'vietnam', 'viet nam', 'yemen', 'zambia',
  'zimbabwe', 'new zealand', 'aotearoa',
]

export const WORLD_CITIES = [
  'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'dublin', 'paris', 'lyon', 'berlin', 'frankfurt',
  'munich', 'münchen', 'hamburg', 'düsseldorf', 'cologne', 'amsterdam', 'rotterdam', 'brussels', 'madrid',
  'barcelona', 'lisbon', 'milan', 'milano', 'rome', 'zurich', 'zürich', 'geneva', 'vienna', 'stockholm',
  'copenhagen', 'oslo', 'helsinki', 'warsaw', 'prague', 'budapest', 'athens', 'istanbul', 'dubai', 'abu dhabi',
  'doha', 'riyadh', 'tel aviv', 'cairo', 'johannesburg', 'cape town', 'lagos', 'nairobi', 'mumbai', 'bangalore',
  'bengaluru', 'delhi', 'new delhi', 'gurgaon', 'gurugram', 'hyderabad', 'chennai', 'pune', 'kolkata', 'karachi',
  'lahore', 'dhaka', 'colombo', 'bangkok', 'kuala lumpur', 'jakarta', 'ho chi minh', 'hanoi', 'shanghai',
  'beijing', 'shenzhen', 'guangzhou', 'taipei', 'seoul', 'tokyo', 'osaka', 'auckland', 'christchurch',
  'new york', 'san francisco', 'los angeles', 'chicago', 'boston', 'seattle', 'austin', 'atlanta', 'miami',
  'dallas', 'houston', 'denver', 'toronto', 'vancouver', 'montreal', 'mexico city', 'são paulo', 'sao paulo',
  'rio de janeiro', 'buenos aires', 'santiago', 'bogotá', 'bogota', 'lima', 'quito', 'guayaquil',
]

/**
 * Regions with a Melbourne or a Sydney of their own -- Melbourne, Florida and
 * Sydney, Nova Scotia. A city match next to one of these, with nothing
 * Australian in the string, is the namesake.
 */
export const NAMESAKE_REGIONS = [
  'florida', 'fl', 'united states', 'usa', 'u.s.a', 'canada', 'nova scotia', 'ns', 'england', 'united kingdom',
  'derbyshire', 'arkansas', 'iowa', 'kentucky', 'ohio', 'texas', 'montana',
]

/** Words that say "somewhere in Australia" without naming a place: keep these for review. */
export const PLACELESS = [
  'remote', 'hybrid', 'flexible', 'national', 'nationwide', 'australia-wide', 'various', 'multiple', 'anywhere',
  'work from home', 'wfh', 'all locations', 'several locations', 'tbc', 'tba', 'other',
]

/** Words that put a location string in Australia. */
export const AUSTRALIA_SIGNALS = [
  'australia', 'au', 'aus', 'vic', 'victoria', 'nsw', 'new south wales', 'act', 'australian capital territory',
  'queensland', 'qld', 'western australia', 'wa', 'south australia', 'sa', 'tasmania', 'tas',
  'northern territory', 'nt',
]
