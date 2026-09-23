/**
 * Identity: the two hashes that decide whether a posting is one the pipeline
 * has already seen, and the apply-URL normalisation that feeds one of them.
 *
 * lib/utils.ts already has a `generateJobHash()`, unused anywhere in the
 * repo (a leftover of the external-sync feature CLAUDE.md notes was removed
 * and is non-functional). Deliberately not reused here: it hashes
 * title+company+url+postedAt with no noise-stripping, which is a different
 * shape from what this needs -- the TDD's content fingerprint is
 * company+title+city with the closing date and the URL both excluded on
 * purpose (an extended deadline, or a URL that gained a tracking param,
 * must not mint a second listing for the same role), and it needs title
 * normalisation strong enough to collapse "2027 Graduate Program —
 * Melbourne (Full-time)" onto "Graduate Program, Melbourne".
 *
 * Source-identity dedup (the third and first-checked layer, `jobs (source,
 * external_id)`) isn't here -- that's a database unique index, not logic a
 * pure function decides.
 */

import { createHash } from 'crypto'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

// A 4-digit year, standalone -- "2027 Graduate Program" and "Graduate
// Program 2027" both collapse onto "Graduate Program". Deliberately not
// anchored to the string start: employers put the intake year in different
// positions ("Graduate Program 2027", "2027 Intake").
const YEAR_TOKEN = /\b(19|20)\d{2}\b/g

// A trailing parenthetical is almost always incidental (employment type,
// a location aside, a req id) rather than part of the role's identity --
// "(Full-time)" is the TDD's own example. Only trailing ones are stripped:
// a parenthetical in the middle of a title is more likely to be load-bearing
// ("Marketing (Digital) Graduate"), so this doesn't touch those.
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/

/**
 * Collapses cosmetic title variation so the same role posted with different
 * punctuation, intake year or a trailing "(Full-time)" hashes identically.
 * Not a general title-cleaning function -- only removes what's demonstrably
 * noise for identity purposes, kept deliberately narrow so it can't also
 * collapse two genuinely different roles onto the same string.
 */
export function normaliseTitleForFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(TRAILING_PAREN, ' ')
    .replace(YEAR_TOKEN, ' ')
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation, dashes, slashes, ampersands -> space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The content fingerprint: normalised employer + normalised title + city.
 * `city` is the already-resolved value from lib/sync/location.ts
 * (`resolveCity()`), not text pulled back out of the title -- a title that
 * happens to name its city (both of the TDD's own examples do) doesn't need
 * that stripped separately, since identical noise-stripped titles already
 * collapse onto the same string regardless.
 */
export function computeFingerprint(company: string, title: string, city: string): string {
  const normalisedCompany = company.toLowerCase().trim()
  const normalisedTitle = normaliseTitleForFingerprint(title)
  return sha256(`${normalisedCompany}|${normalisedTitle}|${city.toLowerCase().trim()}`)
}

// Query parameters that identify a *campaign*, not a *posting* -- stripping
// them is what lets the same URL shared via two channels (an email link and
// an organic one) hash identically. Deliberately not a blanket "strip every
// param": a param the posting itself needs (?jobId=, ?gh_jid=, etc. -- see
// lib/sync/link.ts's JOB_ID_PARAMS) must survive, or two DIFFERENT postings
// on the same generic-looking path would wrongly collapse onto one hash.
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid',
  'ref', 'referrer', 'source',
]

/**
 * Normalises an apply URL for hashing: strips tracking parameters, lowercases
 * the host, and drops a trailing slash -- the parts of a URL that vary
 * between two shares of the exact same posting without the posting itself
 * being any different.
 *
 * Does NOT resolve an aggregator redirect to its final destination -- that
 * needs a network round trip (fetchPublicUrl), which a pure, synchronous
 * function can't do. A worker resolving an Adzuna `redirect_url` before
 * calling this is a later concern (Adzuna/tier B is out of the current
 * build window entirely, per the Roadmap).
 *
 * Returns the original string, untouched, if it doesn't parse as a URL --
 * never throws, since a malformed apply URL is exactly the kind of thing
 * this pipeline has to keep running past, not crash on.
 */
export function normaliseApplyUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param)
  }
  url.searchParams.sort()

  url.hostname = url.hostname.toLowerCase()
  url.hash = ''

  let result = url.toString()
  if (result.endsWith('/') && url.pathname !== '/') {
    result = result.slice(0, -1)
  }
  return result
}

export function computeApplyUrlHash(rawUrl: string): string {
  return sha256(normaliseApplyUrl(rawUrl))
}
