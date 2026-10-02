/**
 * The consent check every source passes before it is read.
 *
 * Agreed rule (2 Oct 2026): read an employer's job system only when the
 * employer has signalled it's happy to be found. Two signals count:
 *
 *   - implied: the career site's robots.txt allows crawling it. Workday
 *     generates each tenant's robots.txt from the employer's own
 *     search-engine setting, so `Allow: /Unilever_Early_Careers/` is the
 *     employer opting in, and `Disallow: /External/` (Mars) is opting out.
 *   - explicit: the employer told MMSS directly. Recorded on the source as
 *     `config.consent = { type: 'explicit', ... }`, which skips the check.
 *
 * Note the path checked is the PUBLIC career site (`/<site>/` for Workday),
 * not the JSON endpoint the adapter calls (`/wday/cxs/...`), which no
 * employer's robots.txt ever names. The robots.txt is the employer's stated
 * preference for that site; the JSON behind it inherits it.
 *
 * Parsing follows RFC 9309: the group naming our product token wins over
 * `*`; within a group the longest matching rule wins, and Allow wins a tie;
 * `*` and a trailing `$` are supported. A missing robots.txt (any 4xx)
 * means no restriction. An unreachable one (5xx, no response) fails the run
 * rather than guessing -- the RFC treats it as "disallow everything", and a
 * failed run is visible on /admin/sources and retried the next night.
 */

import { fetchPublicUrl } from '../ssrf'
import type { SourceRow } from './adapters/types'

/** Our product token, as sent in the adapters' User-Agent. */
export const ROBOTS_PRODUCT_TOKEN = 'mmssjobboard'
const USER_AGENT = 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)'
const TIMEOUT_MS = 10_000

interface Rule {
  allow: boolean
  pattern: string
}

/** The rules that apply to us: our own group if one exists, else `*`, else none. */
export function rulesFor(robotsTxt: string, productToken = ROBOTS_PRODUCT_TOKEN): Rule[] {
  const groups: Array<{ agents: string[]; rules: Rule[] }> = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()

    if (key === 'user-agent') {
      // Consecutive user-agent lines share one group.
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false
      // An empty Disallow means "nothing disallowed": no rule at all.
      if (value) current.rules.push({ allow: key === 'allow', pattern: value })
    } else {
      lastWasAgent = false
    }
  }

  const ours = groups.filter((g) => g.agents.some((a) => a === productToken))
  if (ours.length > 0) return ours.flatMap((g) => g.rules)
  return groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules)
}

/** A robots.txt path pattern as a regex: `*` matches anything, a trailing `$` anchors. */
function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path)
}

export function isPathAllowed(robotsTxt: string, path: string, productToken = ROBOTS_PRODUCT_TOKEN): boolean {
  let best: Rule | null = null
  for (const rule of rulesFor(robotsTxt, productToken)) {
    if (!patternMatches(rule.pattern, path)) continue
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule
    }
  }
  return best ? best.allow : true
}

/** `config.consent.type === 'explicit'`: the employer told MMSS directly. */
export function hasExplicitConsent(source: Pick<SourceRow, 'config'>): boolean {
  const consent = source.config.consent as { type?: unknown } | undefined
  return consent?.type === 'explicit'
}

export type ConsentResult = { ok: true; basis: 'explicit' | 'robots' } | { ok: false; reason: string }

/**
 * Checks `target` (the public page the source represents) against its
 * host's robots.txt, unless the source carries explicit consent.
 */
export async function checkConsent(source: SourceRow, target: URL): Promise<ConsentResult> {
  if (hasExplicitConsent(source)) return { ok: true, basis: 'explicit' }

  const res = await fetchPublicUrl(new URL('/robots.txt', target.origin), {
    timeoutMs: TIMEOUT_MS,
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res || res.status >= 500) {
    return { ok: false, reason: `robots.txt at ${target.host} could not be read (HTTP ${res?.status ?? 'no response'})` }
  }
  if (res.status >= 400) return { ok: true, basis: 'robots' } // no robots.txt: no restriction

  const robotsTxt = await res.text()
  if (isPathAllowed(robotsTxt, target.pathname)) return { ok: true, basis: 'robots' }
  return {
    ok: false,
    reason: `robots.txt at ${target.host} disallows ${target.pathname}. Record the employer's explicit consent on the source to read it.`,
  }
}
