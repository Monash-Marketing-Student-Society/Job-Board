/**
 * Turns a careers link an employer pastes into the feed endpoint one of our
 * adapters reads -- the step that makes "List your roles with MMSS" a few
 * clicks instead of a support ticket.
 *
 * Only vendors with an adapter are recognised (lib/sync/vendors.ts). Any
 * other link returns null and the request is handled by hand. Verified
 * shapes (from the live sources and the PRD's employer list):
 *
 *   Workday     https://<tenant>.wd<N>.myworkdayjobs.com/[<locale>/]<site>[/job/...]
 *               -> https://<tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>
 *               https://wd<N>.myworkdaysite.com/[<locale>/]recruiting/<tenant>/<site>[/...]
 *               -> https://wd<N>.myworkdaysite.com/wday/cxs/<tenant>/<site>
 *   Greenhouse  https://job-boards.greenhouse.io/<token>[/jobs/<id>]
 *               https://boards.greenhouse.io/<token>, .../embed/job_board?for=<token>
 *               https://boards-api.greenhouse.io/v1/boards/<token>[/jobs]
 *               -> https://boards-api.greenhouse.io/v1/boards/<token>
 */

export type DetectedAts = { vendor: 'workday' | 'greenhouse'; endpoint: string }

const LOCALE = /^[a-z]{2}(-[A-Za-z]{2})?$/
const WORKDAY_HOST = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i
/** Workday's other domain: the tenant is in the path, not the host (Mondelēz, News Corp). */
const WORKDAY_SITE_HOST = /^wd\d+\.myworkdaysite\.com$/i
const GREENHOUSE_BOARD_HOSTS = new Set(['job-boards.greenhouse.io', 'boards.greenhouse.io', 'job-boards.eu.greenhouse.io'])
/** Workday path segments that are never a site name. */
const WORKDAY_RESERVED = new Set(['wday', 'job', 'jobs', 'details'])

export function detectAts(raw: string): DetectedAts | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s))

  if (WORKDAY_SITE_HOST.test(host)) {
    if (segments[0] === 'wday' && segments[1] === 'cxs' && segments[3]) {
      return { vendor: 'workday', endpoint: `https://${host}/wday/cxs/${segments[2]}/${segments[3]}` }
    }
    const rest = segments[0] && LOCALE.test(segments[0]) ? segments.slice(1) : segments
    if (rest[0] !== 'recruiting' || !rest[1] || !rest[2]) return null
    return { vendor: 'workday', endpoint: `https://${host}/wday/cxs/${rest[1]}/${rest[2]}` }
  }

  const workday = WORKDAY_HOST.exec(host)
  if (workday) {
    const tenant = workday[1].toLowerCase()
    // An API link already names tenant and site: /wday/cxs/<tenant>/<site>
    if (segments[0] === 'wday' && segments[1] === 'cxs' && segments[3]) {
      return { vendor: 'workday', endpoint: `https://${host}/wday/cxs/${segments[2]}/${segments[3]}` }
    }
    const rest = segments[0] && LOCALE.test(segments[0]) ? segments.slice(1) : segments
    const site = rest[0]
    if (!site || WORKDAY_RESERVED.has(site.toLowerCase())) return null
    return { vendor: 'workday', endpoint: `https://${host}/wday/cxs/${tenant}/${site}` }
  }

  if (host === 'boards-api.greenhouse.io') {
    if (segments[0] === 'v1' && segments[1] === 'boards' && segments[2]) {
      return { vendor: 'greenhouse', endpoint: greenhouseEndpoint(segments[2]) }
    }
    return null
  }

  if (GREENHOUSE_BOARD_HOSTS.has(host)) {
    const embedded = url.searchParams.get('for')
    if (segments[0] === 'embed') return embedded ? { vendor: 'greenhouse', endpoint: greenhouseEndpoint(embedded) } : null
    if (segments[0]) return { vendor: 'greenhouse', endpoint: greenhouseEndpoint(segments[0]) }
  }

  return null
}

function greenhouseEndpoint(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token.toLowerCase())}`
}
