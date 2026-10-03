/**
 * Reads a job description for an explicit experience requirement of two
 * years or more -- the point at which a student realistically can't get the
 * role, whatever its title says ("Marketing Coordinator", 3+ years required).
 *
 * The threshold is 2, not 1, by the committee's call (3 Oct 2026): "1 year
 * experience" is often written loosely and students with a year of part-time
 * or placement work can still compete. Only an explicit requirement counts --
 * nothing is inferred from tone or seniority words here (target.ts does
 * titles).
 *
 * The number has to sit right next to "experience" (or "in a similar role"),
 * so the common false hits don't fire: "our 2-year graduate program", "a
 * 12-month contract", "two years of rotations", "up to 3 years' experience
 * welcome". Pure and synchronous, like the rest of the gates.
 */

import { decodeHtmlEntities } from '../utils'

/** The threshold: a stated requirement at or above this many years rejects. */
export const MIN_REJECT_YEARS = 2

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`
// "2-3", "2 – 3", "2 to 3": the lower bound is what the employer insists on.
const RANGE = `${NUM}\\s*\\+?(?:\\s*(?:-|–|—|to)\\s*${NUM})?\\s*\\+?`
const UNIT = `(years?|yrs?|months?)`
// Up to five words between the unit and "experience" -- "years of agency
// experience", "years' relevant industry experience" -- but never across a
// sentence or list item, which the character class can't step over. A filler
// word that names the program itself ("2 year graduate program that builds
// experience") means the number is the program's length, not a requirement.
const FILLER = `(?:(?!program|rotation|contract|course|degree|stud|internship|placement)[\\w'’&/,-]+\\s+){0,5}?`
const AFTER_NUMBER = new RegExp(
  `(up\\s+to\\s+|under\\s+|less\\s+than\\s+)?\\b${RANGE}\\s*${UNIT}\\b['’]?\\s*(?:of\\s+)?${FILLER}(?:experience|in\\s+a\\s+(?:similar|related|relevant|comparable)\\s+(?:role|position))\\b`,
  'gi'
)
// "Experience: minimum 3 years", "experience of at least two years".
const BEFORE_NUMBER = new RegExp(
  `\\bexperience\\b\\s*(?:of|:|-|–)?\\s*(?:at\\s+least|a\\s+minimum\\s+of|minimum(?:\\s+of)?|min\\.?|over|more\\s+than)\\s+${RANGE}\\s*${UNIT}\\b`,
  'gi'
)

/** Plain text from a sanitised HTML description, with entities decoded. */
export function descriptionText(html: string | null | undefined): string {
  if (!html) return ''
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

// Words directly before the number that make it something other than a
// requirement on the candidate. Only those words, so "Join our team: you
// bring 3+ years' experience" still counts.
const NOT_A_REQUIREMENT = [
  // The employer describing itself: "we have 10 years of experience", "our
  // agency has over 10 years' experience", "Managing Directors have a
  // collective 50 years of experience" (Accenture, 3 Oct 2026).
  /\b(?:we|we've|our\s+\w+|the\s+(?:company|business|agency|group))\s+(?:have|has|bring|brings|boasts?)(?:\s+(?:over|more\s+than|almost|nearly))?\s*$/i,
  /\b(?:collective|combined)\s*$/i,
  // One route in among others: "tertiary qualifications, or 3–5 years'
  // experience" (Deloitte, 3 Oct 2026) -- a graduate qualifies by the degree.
  /\bor\s*$/i,
]

function toNumber(token: string): number {
  return NUMBER_WORDS[token.toLowerCase()] ?? Number(token)
}

function toYears(amount: number, unit: string): number {
  return unit.toLowerCase().startsWith('m') ? amount / 12 : amount
}

export interface ExperienceRequirement {
  /** The smallest requirement the posting states, in years. */
  years: number
  /** The phrase that said so, for the admin to see why a job was removed. */
  evidence: string
}

/**
 * The first stated requirement of MIN_REJECT_YEARS or more, or null. A
 * posting that says "0-2 years" or "up to 3 years" states no minimum worth
 * rejecting on, so those are skipped rather than ending the search -- a
 * later sentence may still say "minimum 3 years".
 */
export function requiredExperience(description: string | null | undefined): ExperienceRequirement | null {
  const text = descriptionText(description)
  if (!text) return null

  const requirement = (phrase: string, index: number, low: string, unit: string): ExperienceRequirement | null => {
    const years = toYears(toNumber(low), unit)
    if (years < MIN_REJECT_YEARS) return null
    const before = text.slice(Math.max(0, index - 60), index)
    if (NOT_A_REQUIREMENT.some((pattern) => pattern.test(before))) return null
    return { years, evidence: phrase.trim() }
  }

  for (const match of text.matchAll(AFTER_NUMBER)) {
    const [phrase, ceiling, low, , unit] = match
    if (ceiling) continue
    const found = requirement(phrase, match.index, low, unit)
    if (found) return found
  }
  for (const match of text.matchAll(BEFORE_NUMBER)) {
    const [phrase, low, , unit] = match
    const found = requirement(phrase, match.index, low, unit)
    if (found) return found
  }
  return null
}
