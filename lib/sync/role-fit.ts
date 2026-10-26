/**
 * What a description says about who the role is for, beyond seniority
 * (experience.ts, description-signals.ts): the degree it asks for, and the
 * technical skills it needs.
 *
 * The admin rule (23 Oct 2026): titles alone let tech roles through --
 * "Capgemini Summer Internship" asks for "software engineering, computer
 * science or artificial intelligence" degrees -- so the description is read
 * for the degree it requires or prefers. Fewer, better-chosen jobs over more.
 *
 * Both checks err towards keeping: a degree list that names any field a
 * marketing student studies ("business, marketing, engineering") keeps the
 * job, as does "any discipline". Only a list made entirely of other fields
 * removes it. Checked against the trial's decisions before going in.
 */

import { decodeHtmlEntities } from '../utils'

/**
 * The description as separate statements: list items, paragraphs and
 * sentences stay apart, so a degree line never runs into the next bullet.
 */
function statements(html: string | null | undefined): string[] {
  if (!html) return []
  const text = decodeHtmlEntities(html.replace(/<\s*(?:\/(?:li|p|div|h\d|tr)|br\s*\/?)\s*>/gi, ' \n ').replace(/<[^>]*>/g, ' '))
  return text
    .split(/\n|(?<=[.;!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// Where a description names the degree: "degree in", "Bachelor of",
// "studying", "currently pursuing", "qualification in", "major in".
const DEGREE_CUE = /\b(?:degree|bachelor(?:'s|’s)?|studying|pursuing|qualifications?|major(?:ing)? in)\b/i

// Fields a marketing student studies, or an open door. Any one keeps the job.
const MARKETING_FRIENDLY_FIELDS = [
  /\bmarketing\b/i, /\bbusiness\b/i, /\bcommerce\b/i, /\bcommunications?\b/i, /\bmedia\b/i,
  /\badvertising\b/i, /\bpublic relations\b/i, /\bjournalism\b/i, /\barts\b/i,
  // Design only where it is a marketing-side field: "Product/Industrial
  // Design" sits with mechatronics in Capgemini's engineering stream.
  /\b(?:graphic|communications?|visual|digital|brand|fashion|ux|creative) design\b/i,
  /\bpsychology\b/i, /\bmanagement\b/i, /\bhumanities\b/i, /\bsocial sciences?\b/i, /\bcreative\b/i,
  /\bconsumer\b/i, /\bsociology\b/i, /\bbehaviou?ral\b/i,
  /\bany (?:degree|discipline|field|major|background)\b/i, /\ball (?:degrees|disciplines|backgrounds)\b/i,
  /\b(?:range|variety|mix) of (?:degrees|disciplines|backgrounds)\b/i,
]

// Fields that point away from marketing. Economics and "quantitative" are in
// neither list: they decide nothing on their own.
const OTHER_FIELDS = [
  /\bcomputer science\b/i, /\bsoftware\b/i, /\bengineering\b/i, /\binformation (?:technology|systems|security)\b/i,
  /\bdata science\b/i, /\bcyber ?security\b/i, /\bartificial intelligence\b/i, /\bmath(?:ematic)?s\b/i,
  /\bstatistics\b/i, /\bphysics\b/i, /\bactuarial\b/i, /\baccounting\b/i, /\bfinance\b/i, /\blaw\b/i,
  /\bnursing\b/i, /\bmedicine\b/i, /\bpharmacy\b/i, /\bchemistry\b/i, /\bbiology\b/i, /\bscience\b/i,
  /\bmechatronics?\b/i, /\bsupply chain\b/i, /\blogistics\b/i, /\bSTEM\b/,
]

/**
 * The degree statement that rules a marketing student out, or null.
 * Every statement naming a degree is read; one that names a marketing-
 * friendly field anywhere keeps the job.
 */
export function nonMarketingDegree(description: string | null | undefined): string | null {
  // Only the words right after the degree cue name the field: "Currently
  // studying, and you'll support the finance team" is not a finance degree
  // ... unless the field sits within the next ~150 characters, which is how
  // degree lines are written.
  const named: string[] = []
  for (const statement of statements(description)) {
    const cue = statement.match(DEGREE_CUE)
    if (!cue || cue.index === undefined) continue
    const fields = statement.slice(cue.index, cue.index + 150)
    if (OTHER_FIELDS.some((f) => f.test(fields)) || MARKETING_FRIENDLY_FIELDS.some((f) => f.test(fields))) named.push(fields)
  }
  if (named.length === 0) return null
  if (named.some((s) => MARKETING_FRIENDLY_FIELDS.some((f) => f.test(s)))) return null
  return named[0].length > 140 ? `${named[0].slice(0, 137)}…` : named[0]
}

// Programming languages, cloud and data-engineering tools. SQL, Excel,
// Tableau and Google Analytics are left out: marketing analysts use them.
const TECH_SKILLS: Array<[string, RegExp]> = [
  ['Python', /\bpython\b/i], ['Java', /\bjava\b(?!script)/i], ['JavaScript', /\bjavascript\b/i],
  ['TypeScript', /\btypescript\b/i], ['C++', /\bc\+\+/i], ['C#', /\bc#/i], ['Go', /\bgolang\b/i],
  ['Kubernetes', /\bkubernetes\b/i], ['Docker', /\bdocker\b/i], ['AWS', /\baws\b/i], ['Azure', /\bazure\b/i],
  ['GCP', /\bgcp\b/i], ['Terraform', /\bterraform\b/i], ['React', /\breact(?:\.js)?\b/i], ['Node.js', /\bnode\.js\b/i],
  ['.NET', /\.net\b/i], ['Linux', /\blinux\b/i], ['Snowflake', /\bsnowflake\b/i], ['BigQuery', /\bbigquery\b/i],
  ['dbt', /\bdbt\b/i], ['Spark', /\bapache spark\b|\bpyspark\b/i],
]
export const MIN_TECH_SKILLS = 2

/** The technical skills a description asks for, when there are enough to make it a technical role. */
export function technicalSkills(description: string | null | undefined): string[] | null {
  const text = statements(description).join(' ')
  const found = TECH_SKILLS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  return found.length >= MIN_TECH_SKILLS ? found : null
}
