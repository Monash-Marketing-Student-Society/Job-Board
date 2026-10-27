/**
 * What kind of role a posting is, from its title, employer and description --
 * for the kinds the admins ruled out after three weeks of review (27 Oct
 * 2026). Each rule was checked against the 3-23 Oct decisions before going
 * in, and is kept narrow enough that it removed none of the approved jobs
 * except where the admins accepted the loss (public sector, thin marketing
 * descriptions).
 *
 * Kept: newsroom and broadcast roles (communications students want them),
 * and market research and consumer insights roles.
 */

import { decodeHtmlEntities } from '../utils'
import { matchesAny } from './text-match'
import type { JobType } from '../types'

export interface RoleTypeInput {
  title: string
  jobType: JobType | null
  description?: string | null
  company?: string | null
  industries?: string | null
  employerSize?: number | null
  listEmployer?: boolean
  /** A graduate program or internship (target.ts isEntryRoute). */
  entryRoute: boolean
}

export type RoleTypeRule =
  | 'admin_role'
  | 'tech_title'
  | 'sales_role'
  | 'blocked_poster'
  | 'public_sector'
  | 'gambling'
  | 'thin_marketing'

export interface RoleTypeHit {
  rule: RoleTypeRule
  evidence: string
}

// Office administration under an entry-level-sounding title ("Administration
// Support Officer", "Graduate Personal Assistant"). "Marketing Assistant"
// isn't here: only these words trigger it.
const ADMIN_TITLE_PHRASES = [
  'administration', 'administrative', 'administrator', 'admin', 'secretariat', 'personal assistant',
  'executive assistant', 'support officer', 'program support', 'management assistant', 'reception',
  'receptionist',
]

// Product, data-engineering and technology roles with business-sounding
// titles. Market research and consumer insights stay ("Consumer Data
// Insights", "Research Analyst"): those are marketing.
const TECH_TITLE_PHRASES = [
  'product manager', 'product owner', 'business intelligence', 'functional analyst',
  'technology graduate', 'technology intern', 'technology internship',
]

// Sales roles count only as an entry route: a graduate program or
// internship, or an entry role with proper training at a large employer
// (Mars). A sales title that also names a marketing function is left alone
// ("Sales & Marketing Coordinator").
const SALES_TITLE_WORDS = ['sales', 'salesperson', 'business development']
const SALES_MARKETING_WORDS = ['marketing', 'brand', 'social', 'content', 'media', 'communications']
const SALES_TRAINING = /\b(?:training|trained|graduate program(?:me)?|development program(?:me)?|learning and development|structured program(?:me)?|mentoring)\b/i
export const SALES_MIN_EMPLOYEES = 1000

/** A sales title with no marketing word -- the kind the sales rule reads an employer size for. */
export function isSalesTitle(title: string): boolean {
  return matchesAny(title, SALES_TITLE_WORDS) && !matchesAny(title, SALES_MARKETING_WORDS)
}

// Posters whose listings were paid programs, recruitment funnels or not
// aimed at Melbourne students at all.
const BLOCKED_TITLE_PHRASES = ['startup experience program', 'career transition', 'praktikant', 'mandarin speaking']
const BLOCKED_EMPLOYERS = ['district x', 'tmgm', 'best investment', 'your own unique reality']

// Public-sector and university roles (27 Oct 2026: "No university roles").
// Councils, departments, universities and health or emergency services list
// community engagement and administration under officer titles. Graduate
// programs and internships stay.
const PUBLIC_SECTOR_TITLE_WORDS = ['officer', 'adviser', 'advisor', 'liaison', 'assistant']
const PUBLIC_SECTOR_EMPLOYERS = [
  'council', 'shire', 'department of', 'university', 'tafe', 'ambulance', 'fire authority', 'legal aid',
]
const PUBLIC_SECTOR_INDUSTRIES = ['government administration', 'higher education', 'hospitals and health care', 'public safety']

// Gambling (27 Oct 2026): not on the board, whatever the role.
const GAMBLING_EMPLOYERS = [
  'easygo', 'gamblingcareers', 'gambling careers', 'stake.com', 'sportsbet', 'tabcorp', 'tab', 'entain',
  'ladbrokes', 'neds', 'bet365', 'pointsbet', 'betr', 'crown resorts', 'star entertainment',
  'aristocrat', 'lottery corporation',
]
const GAMBLING_INDUSTRIES = /\bgambling\b|\bcasinos?\b|\bbetting\b|\bwagering\b/i

// A description that barely mentions marketing (27 Oct 2026): fewer than
// three of these words, counted every time they appear. Graduate programs
// and internships are exempt -- the banks' and the big four's barely
// mention marketing, and the admins approve them.
const MARKETING_WORDS = /\b(?:marketing|brand|campaigns?|social media|content|communications|advertising|media|public relations|creative|digital)\b/gi
export const MIN_MARKETING_WORDS = 3
const PROGRAM_TITLE = /\b(?:graduate|intern|internship|program|programme|vacation|vacationer|trainee|cadet|cadetship)\b/i

function plainText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')
}

function firstMatch(text: string, phrases: string[]): string | null {
  return phrases.find((phrase) => matchesAny(text, [phrase])) ?? null
}

/** The first role-type rule a posting breaks, or null (thin descriptions: thinMarketing). */
export function roleTypeRule(job: RoleTypeInput): RoleTypeHit | null {
  const company = job.company ?? ''
  const industries = job.industries ?? ''
  const entryRoute = job.entryRoute

  const blockedPhrase = firstMatch(job.title, BLOCKED_TITLE_PHRASES)
  if (blockedPhrase) return { rule: 'blocked_poster', evidence: blockedPhrase }
  const blockedEmployer = firstMatch(company, BLOCKED_EMPLOYERS)
  if (blockedEmployer) return { rule: 'blocked_poster', evidence: company }

  if (firstMatch(company, GAMBLING_EMPLOYERS) || GAMBLING_INDUSTRIES.test(industries)) {
    return { rule: 'gambling', evidence: industries && GAMBLING_INDUSTRIES.test(industries) ? `${company} (${industries})` : company }
  }

  const admin = firstMatch(job.title, ADMIN_TITLE_PHRASES)
  if (admin) return { rule: 'admin_role', evidence: admin }

  const tech = firstMatch(job.title, TECH_TITLE_PHRASES)
  if (tech) return { rule: 'tech_title', evidence: tech }

  if (isSalesTitle(job.title) && !entryRoute) {
    const large = job.listEmployer || (typeof job.employerSize === 'number' && job.employerSize >= SALES_MIN_EMPLOYEES)
    const unknownSize = !job.listEmployer && typeof job.employerSize !== 'number'
    const trained = !!job.description && SALES_TRAINING.test(plainText(job.description))
    // An unknown size with training on offer goes to review, not out.
    if (!(trained && (large || unknownSize))) {
      return {
        rule: 'sales_role',
        evidence: trained ? 'Sales role at an employer under 1,000' : 'Sales role with no graduate program, internship or training',
      }
    }
  }

  if (!entryRoute) {
    const publicSector = firstMatch(company, PUBLIC_SECTOR_EMPLOYERS) ?? firstMatch(industries, PUBLIC_SECTOR_INDUSTRIES)
    if (publicSector && matchesAny(job.title, PUBLIC_SECTOR_TITLE_WORDS)) {
      return { rule: 'public_sector', evidence: `${company}${industries ? ` (${industries})` : ''}` }
    }
  }

  return null
}

/**
 * A non-program role whose description barely mentions marketing, or null.
 * Checked last in target.ts, so a more specific reason wins.
 */
export function thinMarketing(job: Pick<RoleTypeInput, 'title' | 'description' | 'entryRoute'>): RoleTypeHit | null {
  if (!job.description || job.entryRoute || PROGRAM_TITLE.test(job.title)) return null
  const count = plainText(job.description).match(MARKETING_WORDS)?.length ?? 0
  if (count >= MIN_MARKETING_WORDS) return null
  return { rule: 'thin_marketing', evidence: `Mentions marketing words ${count} time${count === 1 ? '' : 's'}` }
}
