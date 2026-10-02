/**
 * The 57 allowlisted employers from the PRD's "Recruitment URLs" tab (doc
 * Wbb8bmW8msELQ11JaGkd6g, rev 4, read 2 Oct 2026), each with a starting
 * domain for its logo.
 *
 * TEMPORARY: lives only as long as /admin/logos. `domain` is a suggestion the
 * admin confirms by eye, taken from the employer's own site; each was checked
 * to return a real logo from Brandfetch on 2 Oct 2026. null = no reliable
 * match found (the page falls back to a name search and a paste box).
 */
export interface Employer {
  name: string
  group: string
  domain: string | null
}

export const EMPLOYERS: Employer[] = [
  // Consumer brands
  { name: 'Red Bull', group: 'Consumer brands', domain: 'redbull.com' },
  { name: 'Canva', group: 'Consumer brands', domain: 'canva.com' },
  { name: 'Bondi Sands', group: 'Consumer brands', domain: 'bondisands.com.au' },
  { name: "L'Oréal", group: 'Consumer brands', domain: 'loreal.com' },
  { name: 'Mars', group: 'Consumer brands', domain: 'mars.com' },
  { name: 'Kraft Heinz', group: 'Consumer brands', domain: 'kraftheinzcompany.com' },
  { name: 'Asahi', group: 'Consumer brands', domain: 'asahi.com.au' },
  { name: 'Penfolds (TWE)', group: 'Consumer brands', domain: 'penfolds.com' },
  { name: 'Mondelēz', group: 'Consumer brands', domain: 'mondelezinternational.com' },
  { name: 'Nestlé', group: 'Consumer brands', domain: 'nestle.com' },
  { name: 'P&G', group: 'Consumer brands', domain: 'pg.com' },
  { name: 'Unilever', group: 'Consumer brands', domain: 'unilever.com' },
  { name: 'Uniqlo', group: 'Consumer brands', domain: 'uniqlo.com' },
  { name: 'Coles Group', group: 'Consumer brands', domain: 'coles.com.au' },
  { name: 'Luxury Escapes', group: 'Consumer brands', domain: 'luxuryescapes.com' },
  { name: 'Vidacorp', group: 'Consumer brands', domain: 'vidacorp.com' },
  // Consulting
  { name: 'Accenture', group: 'Consulting', domain: 'accenture.com' },
  { name: 'Capgemini', group: 'Consulting', domain: 'capgemini.com' },
  { name: 'Deloitte', group: 'Consulting', domain: 'deloitte.com' },
  { name: 'EY', group: 'Consulting', domain: 'ey.com' },
  { name: 'KPMG', group: 'Consulting', domain: 'kpmg.com' },
  { name: 'Protiviti', group: 'Consulting', domain: 'protiviti.com' },
  // Market research
  { name: 'Ipsos', group: 'Market research', domain: 'ipsos.com' },
  { name: 'Forethought', group: 'Market research', domain: 'forethought.com.au' },
  { name: 'Honeycomb Strategy', group: 'Market research', domain: 'honeycombstrategy.com.au' },
  { name: 'The Lab Insight & Strategy', group: 'Market research', domain: 'thelabstrategy.com' },
  { name: 'Nature', group: 'Market research', domain: 'nature.com.au' },
  // Banking, telco & auto
  { name: 'CommBank', group: 'Banking, telco & auto', domain: 'commbank.com.au' },
  { name: 'ANZ', group: 'Banking, telco & auto', domain: 'anz.com.au' },
  { name: 'Westpac', group: 'Banking, telco & auto', domain: 'westpac.com.au' },
  { name: 'Telstra', group: 'Banking, telco & auto', domain: 'telstra.com.au' },
  { name: 'BMW', group: 'Banking, telco & auto', domain: 'bmw.com.au' },
  { name: 'Mercedes-Benz', group: 'Banking, telco & auto', domain: 'mercedes-benz.com.au' },
  // Media & sport
  { name: 'AFL', group: 'Media & sport', domain: 'afl.com.au' },
  { name: 'oOh!media', group: 'Media & sport', domain: 'oohmedia.com.au' },
  { name: 'News Corp Australia', group: 'Media & sport', domain: 'newscorpaustralia.com' },
  { name: 'Nine', group: 'Media & sport', domain: 'nine.com.au' },
  // Creative & media agencies
  { name: 'Clemenger', group: 'Creative & media agencies', domain: 'clemenger.com.au' },
  { name: 'Ogilvy', group: 'Creative & media agencies', domain: 'ogilvy.com' },
  { name: 'Thinkerbell', group: 'Creative & media agencies', domain: 'thinkerbell.com' },
  { name: 'Dentsu', group: 'Creative & media agencies', domain: 'dentsu.com' },
  { name: 'DDB', group: 'Creative & media agencies', domain: 'ddb.com.au' },
  { name: 'OMD', group: 'Creative & media agencies', domain: 'omd.com' },
  { name: 'McCann Australia', group: 'Creative & media agencies', domain: 'mccann.com' },
  { name: 'Kinesso', group: 'Creative & media agencies', domain: 'kinesso.com' },
  { name: 'MADE THIS', group: 'Creative & media agencies', domain: null },
  { name: 'Onetwo Agency', group: 'Creative & media agencies', domain: 'onetwo.agency' },
  { name: 'Taboo Group', group: 'Creative & media agencies', domain: 'taboo.com.au' },
  { name: 'iD Collective', group: 'Creative & media agencies', domain: 'idcollective.com.au' },
  { name: 'MAXMEDIALAB', group: 'Creative & media agencies', domain: 'maxmedialab.com.au' },
  { name: 'Melbourne Social Co', group: 'Creative & media agencies', domain: 'melbournesocialco.com.au' },
  // PR & comms
  { name: 'Porter Novelli', group: 'PR & comms', domain: 'porternovelli.com.au' },
  { name: 'Thrive PR', group: 'PR & comms', domain: 'thrivepr.com.au' },
  { name: 'MCMPR', group: 'PR & comms', domain: 'mcmpr.com.au' },
  { name: 'Mango Communications', group: 'PR & comms', domain: null },
  { name: 'AMPR', group: 'PR & comms', domain: 'ampr.com.au' },
  { name: 'Zinc Group', group: 'PR & comms', domain: null },
]
