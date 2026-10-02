/**
 * The PageUp adapter: an employer's public PageUp job RSS feed.
 *
 * Verified live on 2 Oct 2026 against Asahi (careers.pageuppeople.com, client
 * 527): one GET of `/527/cw/en/rss` returns every open job -- 43 that day --
 * each with title, full HTML description, closing date, location, work type
 * and category. No per-job request, no paging. A feed is the employer's own
 * syndication channel, and robots.txt allows `/527/cw/` (it blocks admin,
 * test and `/ci` paths only).
 *
 * `sources.endpoint` is the RSS URL. Each item's `link` is the job's page on
 * the employer's PageUp careers site, with its Apply button, so that is the
 * apply link. `job:applyLink` points straight into the application form and
 * isn't used: a student should see the ad first.
 *
 * Parsed with patterns rather than an XML library (the repo has none): the
 * feed has a fixed, flat shape -- one level of `<item>` children, no CDATA,
 * the description entity-escaped once. A feed that doesn't look like that
 * throws, so a changed format records a failed run instead of a quiet zero.
 */

import { fetchPublicUrl } from '../../ssrf'
import { decodeHtmlEntities } from '../../utils'
import type { Adapter, RawPosting, SourceRow } from './types'
import { titleFilter } from './workday'

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }
const REQUEST_TIMEOUT_MS = 20_000

/** One feed item's fields, decoded. Empty elements (`<job:subCategory />`) come back as null. */
export interface PageUpItem {
  link: string
  title: string
  summary: string | null
  pubDate: string | null
  refNo: string | null
  description: string | null
  closingDate: string | null
  location: string | null
  workType: string | null
  category: string | null
}

function field(itemXml: string, tag: string): string | null {
  const escaped = tag.replace(':', '\\:')
  const m = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`).exec(itemXml)
  if (!m) return null
  const value = decodeHtmlEntities(m[1]).trim()
  return value || null
}

/** Every `<item>` in a PageUp RSS feed. Throws if the document isn't one. */
export function parsePageUpFeed(xml: string): PageUpItem[] {
  if (!/<rss[\s>]/.test(xml) || !/<channel[\s>]/.test(xml)) throw new Error('not an RSS feed')
  const items: PageUpItem[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1]
    const link = field(x, 'link')
    const title = field(x, 'title')
    if (!link || !title) continue // a malformed item is skipped, not fatal
    items.push({
      link,
      title,
      summary: field(x, 'description'),
      pubDate: field(x, 'pubDate'),
      refNo: field(x, 'job:refNo'),
      description: field(x, 'job:description'),
      closingDate: field(x, 'job:closingDate'),
      location: field(x, 'job:location'),
      workType: field(x, 'job:workType'),
      category: field(x, 'job:category'),
    })
  }
  return items
}

export const pageupAdapter: Adapter = {
  kind: 'ats',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const res = await fetchPublicUrl(new URL(source.endpoint), { timeoutMs: REQUEST_TIMEOUT_MS, headers: REQUEST_HEADERS })
    if (!res || !res.ok) {
      throw new Error(`PageUp feed request failed for ${source.slug} (HTTP ${res?.status ?? 'no response'})`)
    }
    let items: PageUpItem[]
    try {
      items = parsePageUpFeed(await res.text())
    } catch (e) {
      throw new Error(`PageUp feed for ${source.slug} is not a readable RSS feed: ${(e as Error).message}`)
    }

    const filter = titleFilter(source)
    const postings: RawPosting[] = []
    for (const item of items) {
      if (filter && !filter.test(item.title)) continue
      const read = new Set(['title', 'company', 'applyUrl'])
      if (item.location) read.add('location')
      if (item.description) read.add('description')
      if (item.closingDate) read.add('closing_at')
      if (item.workType) read.add('job_type')
      postings.push({
        sourceJobId: item.refNo,
        applyUrl: item.link,
        title: item.title,
        company: source.name,
        raw: item as unknown as Record<string, unknown>,
        read,
      })
    }
    return postings
  },
}
