/**
 * MMSS's employer list: the companies on the "Recruitment URLs" tab of the
 * PRD (https://claude.ai/artifact/Wbb8bmW8msELQ11JaGkd6g), plus Publicis
 * Groupe (added 22 Oct 2026). Keep the two in step -- a company added there
 * goes here too.
 *
 * Why the sync needs it (22 Oct 2026): the Sydney rule in target.ts limits
 * Sydney jobs to graduate programs and internships at big employers, but an
 * employer on the list keeps all its Sydney roles. A job read from one of
 * these employers' own career sites is on the list by construction; a
 * LinkedIn job is matched by its company name here.
 *
 * Matching is by the start of the company name, word for word: "Nine" covers
 * "Nine" and "Nine Entertainment" but not "Cloud Nine"; "Dentsu" covers
 * "dentsu B2B"; "Publicis" covers every Publicis agency name that starts with it.
 */

const LIST_EMPLOYER_NAMES = [
  // Consumer and retail
  'red bull', 'canva', 'bondi sands', 'loreal', 'mars', 'kraft heinz', 'asahi', 'penfolds',
  'treasury wine estates', 'mondelez', 'nestle', 'procter gamble', 'p g', 'unilever', 'uniqlo',
  'coles', 'luxury escapes', 'vidacorp', 'yochi', 'seed heritage', 'david jones', 'myer',
  // Professional services
  'accenture', 'capgemini', 'deloitte', 'ey', 'ernst young', 'kpmg', 'protiviti',
  // Research
  'ipsos', 'forethought', 'honeycomb strategy', 'the lab insight', 'nature',
  // Banking, telco, auto
  'commbank', 'commonwealth bank', 'anz', 'westpac', 'telstra', 'bmw', 'mercedes benz',
  // Media and entertainment
  'afl', 'ooh media', 'news corp', 'nine', 'abc', 'australian broadcasting corporation', 'ticketmaster',
  // Agencies
  'clemenger', 'ogilvy', 'thinkerbell', 'dentsu', 'ddb', 'omd', 'mccann', 'kinesso', 'onetwo',
  'taboo group', 'id collective', 'maxmedialab', 'publicis',
  // PR
  'porter novelli', 'thrive pr', 'mcmpr', 'ampr', 'zinc group',
]

/** Lower case, accents and punctuation gone, single spaces: "L'Oréal" -> "loreal", "oOh!media" -> "ooh media". */
function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/!/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** True when a company name is one of MMSS's listed employers. */
export function isListEmployer(company: string | null | undefined): boolean {
  if (!company) return false
  const name = normaliseName(company)
  return LIST_EMPLOYER_NAMES.some((entry) => name === entry || name.startsWith(`${entry} `))
}
