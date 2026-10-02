/**
 * The JobAdder job-board widget adapter.
 *
 * Verified against the real widget on 2 Oct 2026 (Yo-Chi, key
 * AU6_uxaopqd4cg2uxhjrm6zxpyn3tm -- 51 postings; Seed Heritage, key
 * AU1_cxvuzgzqvk4u7hwfbsuyc52koi -- 100+ over two pages). Fixtures in
 * __fixtures__/jobadder-*.json are trimmed from those calls.
 *
 * Employers embed JobAdder's widget script on their own careers page, and
 * the script loads rendered HTML fragments from apps.jobadder.com as JSONP:
 * `cb("<div ...>")`. The list endpoint refuses a plain JSON GET (HTTP 500,
 * ASP.NET's "set JsonRequestBehavior to AllowGet"), so this sends a callback
 * name too and unwraps the string argument as text with JSON.parse -- the
 * response is never evaluated. apps.jobadder.com/robots.txt disallows
 * everything except `/widgets/V1/*`, so this stays on those two paths:
 *   list    GET <endpoint>/RenderJobList?key&jobsPerPage&pageNumber&callback
 *   detail  GET <endpoint>/RenderJobDetails?key&jobID&callback
 * `sources.endpoint` is `https://apps.jobadder.com/widgets/V1/Jobs`.
 *
 * Config (each employer sets its board up differently):
 *   - `config.key`: the widget key from the employer's careers page source.
 *   - `config.page_url`: that careers page. A posting has no page of its
 *     own; the widget opens one from `?ja-job=<id>` on this page, so that is
 *     the apply URL.
 *   - `config.categories = { location, job_type }`: which classification
 *     ids carry the location and the work type. Classifications are the
 *     board owner's own labelled categories (Yo-Chi's 26694 is the venue or
 *     city, Seed's 17152 the city), so they can't be guessed.
 *   - `config.include = { category, values }`: optional. A posting is read
 *     only if that category's label is one of `values`. Yo-Chi and Seed list
 *     dozens of venue and store roles; their head-office roles are labelled
 *     "Support Team" / "Support Office", so this skips the rest before any
 *     detail request.
 *
 * What the widget doesn't carry: a closing date. Every JobAdder posting is
 * held for review as `missing_closing_date` -- correct under the PRD.
 */

import { fetchPublicUrl } from '../../ssrf'
import { decodeHtmlEntities } from '../../utils'
import type { Adapter, RawPosting, SourceRow } from './types'

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)' }
const REQUEST_TIMEOUT_MS = 15_000
const PAGE_SIZE = 100
const MAX_PAGES = 20
const CALLBACK = 'mmss'

export interface JobAdderClassification {
  id: string
  label: string
}

/** What the adapter hands the normaliser: the list entry plus the detail page's text. */
export interface JobAdderRawPosting {
  jobId: string
  title: string
  classifications: JobAdderClassification[]
  /** `d/M/yyyy` as the widget prints it, converted to `yyyy-mm-dd`; null if unparseable. */
  postedOn: string | null
  location: string | null
  jobType: string | null
  /** The detail page's bullet points and description, as HTML. */
  descriptionHtml: string | null
}

interface JobAdderConfig {
  key: string
  pageUrl: string
  categories: { location: string | null; jobType: string | null }
  include: { category: string; values: string[] } | null
}

/** Reads and checks a source's JobAdder config. Throws on anything missing or malformed. */
export function jobAdderConfig(source: SourceRow): JobAdderConfig {
  const c = source.config
  const bad = (field: string) =>
    new Error(`Source "${source.slug}" has a missing or malformed config.${field}: ${JSON.stringify(c[field])}`)

  if (typeof c.key !== 'string' || !c.key) throw bad('key')
  if (typeof c.page_url !== 'string') throw bad('page_url')
  try {
    new URL(c.page_url)
  } catch {
    throw bad('page_url')
  }

  const cats = (c.categories ?? {}) as Record<string, unknown>
  if (typeof cats !== 'object' || Array.isArray(cats)) throw bad('categories')
  const optionalId = (v: unknown) => (typeof v === 'string' && v ? v : null)

  let include: JobAdderConfig['include'] = null
  if (c.include !== undefined && c.include !== null) {
    const inc = c.include as Record<string, unknown>
    const values = inc.values
    if (
      typeof inc.category !== 'string' ||
      !inc.category ||
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every((v) => typeof v === 'string')
    ) {
      throw bad('include')
    }
    include = { category: inc.category, values: values as string[] }
  }

  return {
    key: c.key,
    pageUrl: c.page_url,
    categories: { location: optionalId(cats.location), jobType: optionalId(cats.job_type) },
    include,
  }
}

/** The posting's own view on the employer's careers page. */
export function jobAdderApplyUrl(pageUrl: string, jobId: string): string {
  const url = new URL(pageUrl)
  url.searchParams.set('ja-job', jobId)
  return url.toString()
}

function text(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function parseWidgetDate(value: string | undefined): string | null {
  const m = value && /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export interface JobAdderListEntry {
  jobId: string
  title: string
  classifications: JobAdderClassification[]
  postedOn: string | null
}

/** Every posting in a RenderJobList fragment. */
export function parseJobList(html: string): JobAdderListEntry[] {
  const entries: JobAdderListEntry[] = []
  // Each posting is a `<div class="job">` (or "job alt") ending at its "More.." link.
  for (const m of html.matchAll(/<div class="job(?: alt)?">([\s\S]*?)<a class="view-details"/g)) {
    const block = m[1]
    const link = /<h2 class="title">\s*<a data-job-id="(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
    if (!link) continue
    const classifications = [...block.matchAll(/<li data-id="(\d+)">([\s\S]*?)<\/li>/g)].map(([, id, label]) => ({
      id,
      label: text(label),
    }))
    entries.push({
      jobId: link[1],
      title: text(link[2]),
      classifications,
      postedOn: parseWidgetDate(/<p class="date-posted">\s*([^<]*?)\s*<\/p>/.exec(block)?.[1]),
    })
  }
  return entries
}

/**
 * A RenderJobDetails fragment's bullet points and description, as HTML, or
 * null when the job is gone (the widget answers a filled job with a
 * `ja-job-unavailable` block, still HTTP 200).
 */
export function parseJobDetails(html: string): { descriptionHtml: string | null } | null {
  if (html.includes('ja-job-unavailable')) return null
  const bullets = /<ul class="bullet-points">[\s\S]*?<\/ul>/.exec(html)?.[0] ?? ''
  const description = /<div class="description">([\s\S]*?)<\/div>\s*<div class="apply">/.exec(html)?.[1] ?? ''
  const combined = `${bullets}${description}`.trim()
  return { descriptionHtml: combined || null }
}

/** The string argument of a `<callback>("...")` JSONP response, or null if it isn't one. */
export function unwrapJsonp(body: string, callback = CALLBACK): string | null {
  const prefix = `${callback}(`
  const trimmed = body.trim().replace(/;$/, '')
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(')')) return null
  try {
    const value: unknown = JSON.parse(trimmed.slice(prefix.length, -1))
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

async function fetchFragment(url: URL, what: string, slug: string): Promise<string> {
  url.searchParams.set('callback', CALLBACK)
  const res = await fetchPublicUrl(url, { timeoutMs: REQUEST_TIMEOUT_MS, headers: REQUEST_HEADERS })
  if (!res || !res.ok) {
    throw new Error(`JobAdder ${what} request failed for ${slug} (HTTP ${res?.status ?? 'no response'})`)
  }
  // A wrong key is an HTML 404 page, caught above; anything but a wrapped string is a changed API.
  const fragment = unwrapJsonp(await res.text())
  if (fragment === null) throw new Error(`JobAdder ${what} for ${slug} did not return a JSONP HTML fragment`)
  return fragment
}

export const jobAdderAdapter: Adapter = {
  kind: 'ats',

  async fetch(source: SourceRow): Promise<RawPosting[]> {
    const config = jobAdderConfig(source)
    const base = source.endpoint.replace(/\/$/, '')

    const listed: JobAdderListEntry[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(`${base}/RenderJobList`)
      url.searchParams.set('key', config.key)
      url.searchParams.set('jobsPerPage', String(PAGE_SIZE))
      url.searchParams.set('pageNumber', String(page))
      const entries = parseJobList(await fetchFragment(url, 'list', source.slug))
      listed.push(...entries)
      if (entries.length < PAGE_SIZE) break
    }

    const label = (entry: JobAdderListEntry, category: string | null) =>
      category ? (entry.classifications.find((c) => c.id === category)?.label ?? null) : null

    const postings: RawPosting[] = []
    for (const entry of listed) {
      if (config.include && !config.include.values.includes(label(entry, config.include.category) ?? '')) continue

      const url = new URL(`${base}/RenderJobDetails`)
      url.searchParams.set('key', config.key)
      url.searchParams.set('jobID', entry.jobId)
      const details = parseJobDetails(await fetchFragment(url, 'detail', source.slug))
      // Filled between the list and detail calls: skipped, not an error.
      if (!details) continue

      const raw: JobAdderRawPosting = {
        ...entry,
        location: label(entry, config.categories.location),
        jobType: label(entry, config.categories.jobType),
        descriptionHtml: details.descriptionHtml,
      }

      const read = new Set(['title', 'company', 'applyUrl'])
      if (raw.location) read.add('location')
      if (raw.jobType) read.add('job_type')
      if (raw.descriptionHtml) read.add('description')

      postings.push({
        sourceJobId: entry.jobId,
        applyUrl: jobAdderApplyUrl(config.pageUrl, entry.jobId),
        title: entry.title,
        company: source.name,
        raw: raw as unknown as Record<string, unknown>,
        read,
      })
    }
    return postings
  },
}
