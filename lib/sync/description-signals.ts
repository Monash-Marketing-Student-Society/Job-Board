/**
 * What a description says about who the employer will hire, beyond a number
 * of years (experience.ts does years).
 *
 * The admin rule from 12 Oct 2026: the description decides, not the title.
 * A mid-level title ("Specialist", "Executive") is only kept when the
 * description explicitly welcomes students or graduates, and any title --
 * "Coordinator" included -- goes when the description states seniority.
 *
 * Both lists are explicit phrases, never tone. Checked against the trial's
 * decisions before going in: generic wording like "proven experience in",
 * "proven ability" or "experience managing multiple deadlines" appears in
 * nine approved coordinator jobs, so none of it is here.
 */

import { descriptionText } from './experience'

const STUDENT_WELCOME = [
  /\b(?:recent|new)\s+graduates?\b/i,
  /\bgraduates?\s+(?:are\s+)?(?:welcome|encouraged)\b/i,
  /\b(?:university|current|tertiary)\s+students?\b/i,
  /\bpenultimate\b/i,
  /\bfinal[-\s]year\b/i,
  /\bentry[-\s]level\b/i,
  /\bearly[-\s]career\b(?![-\s]to)/i,
  /\bno\s+(?:prior\s+|previous\s+)?experience\s+(?:is\s+)?(?:required|necessary|needed)\b/i,
  /\bstudying\s+towards\b/i,
  /\bcompleting\s+(?:a|your)\s+(?:degree|studies)\b/i,
]

const STATED_SENIORITY = [
  /\bmid[-\s](?:career|level)\b/i,
  /\bmid[-\s]to[-\s]senior\b/i,
  /\bearly[-\s]to[-\s]mid\b/i,
  /\bexperience\s+as\s+a\s+senior\b/i,
  /\btrack\s+record\s+of\s+(?:managing|leading)\s+(?:a\s+|the\s+)?(?:teams?|people|staff|reporters)\b/i,
  /\bpeople\s+leadership\b/i,
  /\bline\s+management\b/i,
  /\bpeople\s+management\s+experience\b/i,
  /\bexperience\s+(?:leading|managing)\s+(?:a\s+)?(?:high[-\s]performing\s+)?teams?\b/i,
  /\bmanag(?:e|ing)\s+a\s+team\s+of\b/i,
  /(?<!\bno\s)\bdirect\s+reports\b/i,
]

/** True when the description explicitly opens the role to students or graduates. */
export function welcomesStudents(description: string | null | undefined): boolean {
  const text = descriptionText(description)
  return STUDENT_WELCOME.some((pattern) => pattern.test(text))
}

/** The phrase stating the role is beyond entry level, or null. */
export function statedSeniority(description: string | null | undefined): string | null {
  const text = descriptionText(description)
  for (const pattern of STATED_SENIORITY) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return null
}
