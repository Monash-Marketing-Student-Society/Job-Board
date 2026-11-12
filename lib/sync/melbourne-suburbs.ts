/**
 * Metropolitan Melbourne: the suburbs a Monash student can reasonably commute
 * to (12 Nov 2026: "I only want ... Melbourne so people can easily commute
 * from Monash"). A Victorian location outside this list -- Geelong,
 * Ballarat, Wodonga, the Mornington Peninsula, the Yarra Valley -- is
 * removed by the location gate (location.ts).
 *
 * The line: suburbs on or near the metropolitan train network, out to
 * Frankston, Cranbourne, Pakenham, Lilydale, Belgrave, Hurstbridge, Mernda,
 * Craigieburn, Sunbury and Werribee. Left out on purpose: Melton and Bacchus
 * Marsh (V/Line), the peninsula beyond Frankston (Mornington, Mount Martha,
 * Rosebud, Hastings), the Yarra Valley beyond Lilydale (Coldstream,
 * Healesville), Phillip Island (Cowes) and Geelong's suburbs (Corio).
 *
 * LinkedIn writes "Suburb, Victoria", so this list, not a postcode, is what
 * places most postings. A metro suburb missing from it would be removed --
 * add it here; the Filtered out tab shows anything removed as "Outside
 * Melbourne/Sydney" so it can be restored.
 */

export const MELBOURNE_METRO_SUBURBS = [
  // CBD and inner city
  'carlton', 'carlton north', 'docklands', 'east melbourne', 'north melbourne', 'west melbourne',
  'south melbourne', 'southbank', 'port melbourne', 'parkville', 'kensington', 'flemington', 'fitzroy',
  'fitzroy north', 'collingwood', 'abbotsford', 'richmond', 'cremorne', 'burnley', 'south yarra', 'prahran',
  'windsor', 'st kilda', 'st kilda east', 'st kilda west', 'albert park', 'middle park', 'balaclava',
  'elwood', 'ripponlea', 'toorak', 'armadale', 'freshwater place', 'fishermans bend', 'montague',
  // Inner north and west
  'brunswick', 'brunswick east', 'brunswick west', 'coburg', 'coburg north', 'pascoe vale', 'pascoe vale south',
  'northcote', 'thornbury', 'fairfield', 'alphington', 'clifton hill', 'preston', 'reservoir', 'ascot vale',
  'moonee ponds', 'essendon', 'essendon north', 'essendon fields', 'airport west', 'niddrie', 'strathmore',
  'footscray', 'west footscray', 'seddon', 'yarraville', 'maribyrnong', 'braybrook', 'kingsville',
  'spotswood', 'williamstown', 'newport', 'altona', 'altona north', 'altona meadows', 'laverton',
  'laverton north', 'brooklyn', 'tottenham', 'sunshine', 'sunshine north', 'sunshine west', 'albion',
  'ardeer', 'deer park', 'derrimut', 'st albans', 'keilor', 'keilor east', 'keilor park', 'tullamarine',
  'gladstone park', 'broadmeadows', 'glenroy', 'fawkner', 'hadfield', 'oak park', 'campbellfield',
  'coolaroo', 'meadow heights', 'roxburgh park', 'greenvale', 'craigieburn', 'somerton', 'thomastown',
  'lalor', 'epping', 'mill park', 'bundoora', 'kingsbury', 'macleod', 'south morang', 'mernda', 'doreen',
  'wollert', 'sunbury', 'caroline springs', 'burnside', 'hillside', 'taylors lakes', 'sydenham',
  'ravenhall', 'truganina', 'tarneit', 'hoppers crossing', 'werribee', 'point cook', 'williams landing',
  'wyndham vale',
  // North east
  'heidelberg', 'heidelberg west', 'heidelberg heights', 'ivanhoe', 'ivanhoe east', 'eaglemont',
  'rosanna', 'viewbank', 'bulleen', 'balwyn', 'balwyn north', 'kew', 'kew east', 'doncaster',
  'doncaster east', 'templestowe', 'templestowe lower', 'greensborough', 'watsonia', 'montmorency',
  'eltham', 'eltham north', 'diamond creek', 'hurstbridge', 'warrandyte', 'donvale', 'park orchards',
  // East
  'hawthorn', 'hawthorn east', 'camberwell', 'canterbury', 'surrey hills', 'mont albert', 'box hill',
  'box hill north', 'box hill south', 'blackburn', 'blackburn north', 'blackburn south', 'nunawading',
  'mitcham', 'vermont', 'vermont south', 'forest hill', 'burwood', 'burwood east', 'ashburton', 'ashwood',
  'glen iris', 'malvern', 'malvern east', 'kooyong', 'chadstone', 'mount waverley', 'glen waverley',
  'wheelers hill', 'mulgrave', 'notting hill', 'clayton', 'clayton south', 'oakleigh', 'oakleigh east',
  'oakleigh south', 'huntingdale', 'hughesdale', 'carnegie', 'murrumbeena', 'caulfield', 'caulfield east',
  'caulfield north', 'caulfield south', 'glen huntly', 'elsternwick', 'ringwood', 'ringwood east',
  'ringwood north', 'heathmont', 'croydon', 'croydon north', 'croydon south', 'bayswater',
  'bayswater north', 'boronia', 'ferntree gully', 'upper ferntree gully', 'knoxfield', 'scoresby',
  'rowville', 'lysterfield', 'wantirna', 'wantirna south', 'kilsyth', 'mooroolbark', 'chirnside park',
  'lilydale', 'montrose', 'belgrave', 'tecoma', 'upwey', 'warranwood', 'wonga park',
  // South east and bayside
  'brighton', 'brighton east', 'hampton', 'hampton east', 'sandringham', 'black rock', 'beaumaris',
  'cheltenham', 'highett', 'moorabbin', 'bentleigh', 'bentleigh east', 'mckinnon', 'ormond', 'heatherton',
  'mentone', 'parkdale', 'mordialloc', 'aspendale', 'edithvale', 'chelsea', 'bonbeach', 'carrum',
  'seaford', 'frankston', 'frankston south', 'langwarrin', 'carrum downs', 'skye', 'braeside',
  'dingley village', 'keysborough', 'springvale', 'springvale south', 'noble park', 'noble park north',
  'dandenong', 'dandenong north', 'dandenong south', 'doveton', 'hallam', 'endeavour hills',
  'narre warren', 'narre warren south', 'berwick', 'beaconsfield', 'officer', 'pakenham', 'clyde',
  'clyde north', 'cranbourne', 'cranbourne east', 'cranbourne north', 'cranbourne west', 'lynbrook',
  'lyndhurst', 'hampton park',
]

/**
 * Victorian towns whose names contain a metropolitan one, or that sit just
 * past the line: checked first so "Pakenham Upper" isn't read as Pakenham.
 */
export const OUTSIDE_METRO = [
  'pakenham upper', 'mornington', 'mount martha', 'rosebud', 'sorrento', 'hastings', 'somerville', 'coldstream',
  'healesville', 'yarra glen', 'melton', 'bacchus marsh', 'cowes', 'corio', 'lara',
]
