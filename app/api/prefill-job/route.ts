import { NextResponse } from 'next/server'
import { normalizeJobType, truncateText } from '@/lib/utils'
import { JOB_FUNCTIONS, toJobFunctions, type JobFunction } from '@/lib/tags'
import { fetchPublicUrl } from '@/lib/ssrf'

interface PrefillData {
  title?: string
  company?: string
  company_logo_url?: string
  description?: string
  /** Short 1-2 line card-preview summary. AI-only — no other tier produces this. */
  summary?: string
  location?: string
  job_type?: string
  closing_at?: string
  /**
   * Always canonical. Every tier that can produce tags is filtered through
   * toJobFunctions before it reaches this shape, so nothing outside the
   * vocabulary can leave this route — the combobox is a UI affordance, not
   * the guarantee.
   */
  tags?: JobFunction[]
}

// ─── Extraction helpers ──────────────────────────────────────────────────────

function extractOgTag(html: string, property: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]*>`, 'i'))?.[0]
  if (!tag) return null
  return tag.match(/content=["']([^"']*?)["']/i)?.[1]?.trim() || null
}

function extractMetaTag(html: string, name: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]*>`, 'i'))?.[0]
  if (!tag) return null
  return tag.match(/content=["']([^"']*?)["']/i)?.[1]?.trim() || null
}

function stripTitleSuffix(title: string): string {
  return title.split(/\s+[|–—\-]\s+/)[0].trim()
}

function extractLocation(jobLocation: unknown): string | null {
  const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation
  if (!loc) return null
  if (typeof loc === 'string') return loc.trim() || null
  if (typeof loc === 'object') {
    const addr = (loc as Record<string, unknown>).address
    if (typeof addr === 'string') return addr.trim() || null
    if (typeof addr === 'object' && addr !== null) {
      const a = addr as Record<string, string>
      return [a.addressLocality, a.addressRegion, a.addressCountry]
        .filter(Boolean).join(', ') || null
    }
  }
  return null
}

function mapEmploymentType(raw: unknown): string | null {
  if (!raw) return null
  const val = (Array.isArray(raw) ? raw[0] : raw) as string
  const normalized = val
    .toLowerCase()
    .replace(/_/g, '-')
    .replace('contractor', 'contract')
    .replace(/\bintern\b/, 'internship')
  return normalizeJobType(normalized)
}

function toDateString(iso: unknown): string | null {
  if (!iso || typeof iso !== 'string') return null
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

function extractLogoUrl(logo: unknown): string | null {
  if (!logo) return null
  if (typeof logo === 'string') return logo
  if (typeof logo === 'object') {
    const l = logo as Record<string, unknown>
    return (l.url as string) || (l.contentUrl as string) || null
  }
  return null
}

/** Convert a skills/qualifications field (string or array) to a comma-separated tag string */
function extractTagString(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw.trim() || null
  if (Array.isArray(raw)) {
    return raw
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .join(', ') || null
  }
  return null
}

/** Extract tags from a job description HTML by finding list items near skills/requirements headings */
function extractTagsFromDescriptionHtml(descHtml: string): string | null {
  if (!descHtml) return null

  const requirementsRe = /\b(?:requirements?|skills?|qualifications?|your\s+profile|what\s+you(?:'ll|'ll)?\s+(?:need|bring)|who\s+you\s+are|about\s+you|what\s+we(?:'re|'re)?\s+looking\s+for|experience\s+required)\b/i

  const tags: string[] = []

  const headingRe = /<(?:h[1-6]|strong|b)(?:[^>]*)>([\s\S]*?)<\/(?:h[1-6]|strong|b)>/gi
  const headings: Array<{ end: number }> = []

  let m: RegExpExecArray | null
  while ((m = headingRe.exec(descHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (requirementsRe.test(text)) {
      headings.push({ end: m.index + m[0].length })
    }
  }

  for (const heading of headings) {
    const section = descHtml.slice(heading.end, heading.end + 2000)
    const listMatch = /<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/i.exec(section)
    if (!listMatch) continue

    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let liMatch: RegExpExecArray | null
    while ((liMatch = liRe.exec(listMatch[1])) !== null) {
      const text = liMatch[1].replace(/<[^>]+>/g, '').trim()
      if (text.length >= 3 && text.length <= 100) tags.push(text)
    }
  }

  if (tags.length === 0) return null
  return [...new Set(tags)].slice(0, 15).join(', ')
}

/** Try to find a closing/deadline date from prose HTML near relevant keywords */
function extractClosingDateFromHtml(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const contextRe = /(?:closing\s+date|applications?\s+close[sd]?|apply\s+by|deadline|closes?)\s*[:\-–]?\s*/gi
  let match: RegExpExecArray | null

  while ((match = contextRe.exec(text)) !== null) {
    const snippet = text.slice(match.index + match[0].length, match.index + match[0].length + 60)

    const wordy = snippet.match(
      /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i
    )
    if (wordy) {
      const d = new Date(`${wordy[2]} ${wordy[1]}, ${wordy[3]}`)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }

    const iso = snippet.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/)
    if (iso) {
      const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }

    const dmy = snippet.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (dmy) {
      const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }
  }

  return null
}

/** Extract company name from "Job Title at Company Name" pattern */
function extractCompanyFromTitle(title: string | undefined): string | null {
  if (!title) return null
  const match = title.match(/\bat\s+([A-Z][^|–—\-\n]+?)(?:\s*[|–—\-]|$)/)
  return match?.[1]?.trim() || null
}

/** Strip HTML tags from a description string and return clean plain text or light HTML */
function cleanDescription(raw: string): string {
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return `<p>${raw.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  }
  return raw
}

// ─── Tier 1a: JSON-LD ────────────────────────────────────────────────────────

function findJobPosting(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  if (obj['@type'] === 'JobPosting') return obj

  if (Array.isArray(obj['@graph'])) {
    for (const node of obj['@graph']) {
      const found = findJobPosting(node)
      if (found) return found
    }
  }

  if (Array.isArray(data)) {
    for (const node of data) {
      const found = findJobPosting(node)
      if (found) return found
    }
  }

  return null
}

/** Shared mapping: convert a JobPosting node to PrefillData fields */
function mapJobPostingToData(job: Record<string, unknown>): Partial<PrefillData> {
  const org = job.hiringOrganization as Record<string, unknown> | undefined

  const closingAt =
    toDateString(job.validThrough) ||
    toDateString(job.applicationDeadline) ||
    null

  const skillTags = extractTagString(job.skills)
  const qualTags = extractTagString(job.qualifications)
  const allTags = [skillTags, qualTags]
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  const uniqueTags = [...new Set(allTags)]

  const rawDesc = job.description as string | undefined
  const jobFunctions = toJobFunctions(uniqueTags)

  return {
    title: (job.title as string) || undefined,
    company: (org?.name as string) || undefined,
    company_logo_url: extractLogoUrl(org?.logo) || undefined,
    description: rawDesc ? cleanDescription(rawDesc) : undefined,
    location: extractLocation(job.jobLocation) || undefined,
    job_type: mapEmploymentType(job.employmentType) || undefined,
    closing_at: closingAt || undefined,
    tags: jobFunctions.length > 0 ? jobFunctions : undefined,
  }
}

function extractJsonLd(html: string): Partial<PrefillData> {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      const job = findJobPosting(parsed)
      if (job) return mapJobPostingToData(job)
    } catch {
      // Malformed JSON-LD — try next block
    }
  }

  return {}
}

// ─── Tier 1b: Embedded JS state ──────────────────────────────────────────────

/**
 * Many modern SPAs (Next.js, Greenhouse, Lever) embed their initial data as JSON
 * in the HTML before hydration. This extracts job posting data from those payloads.
 */
function extractEmbeddedState(html: string): Partial<PrefillData> {
  const patterns = [
    // Next.js __NEXT_DATA__ (used by Greenhouse, Lever, many ATS platforms)
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    // Generic window state objects
    /window\.__(?:INITIAL_STATE|REDUX_STATE|APP_STATE|APP_DATA)__\s*=\s*(\{[\s\S]{0,50000}?\})\s*;/,
    // ATS-specific named script tags
    /<script[^>]+id=["'](?:gh-job-data|lever-job-info|ats-job-data)["'][^>]*>([\s\S]*?)<\/script>/i,
  ]

  for (const re of patterns) {
    const m = re.exec(html)
    if (!m) continue
    try {
      const parsed = JSON.parse(m[1])
      // Quick pre-check: look for a JobPosting @type anywhere in the blob
      if (!/"@type"\s*:\s*"JobPosting"/.test(m[1])) continue
      const job = findJobPosting(parsed)
      if (job) return mapJobPostingToData(job)
    } catch {
      // Malformed — try next pattern
    }
  }

  return {}
}

// ─── Tier 2: AI extraction (Gemini 2.5 Flash) ───────────────────────────────

/** Strip HTML noise to get clean text suitable for AI extraction */
function prepareTextForAI(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(?:nav|footer|header|aside|noscript)[\s\S]*?<\/(?:nav|footer|header|aside|noscript)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
}

function buildAIPrompt(text: string): string {
  return `You are extracting structured data from a job listing page. The text below is the visible text content of a job advertisement web page.

Extract the following fields and return ONLY a valid JSON object with no markdown, no code fences, no explanation:
- "title": the job title (e.g. "Marketing Coordinator")
- "company": the hiring company name — must be the specific employer, NOT a job board or recruitment agency
- "tags": array of up to 3 job functions, chosen ONLY from this exact list: ${JOB_FUNCTIONS.join(', ')}. Copy the spelling exactly. Do not invent values, do not return skills, tools or seniority. Return an empty array if none clearly apply — an empty array is better than a wrong guess, since anything not on the list is discarded.
- "description": the full job description as clean HTML using only <p> <ul> <ol> <li> <strong> <em> <br> tags. Preserve all substantive content including responsibilities, requirements, and about-the-company sections.
- "summary": ONE plain-text sentence, no more than 140 characters, no HTML or markdown, capturing the core responsibility or opportunity in plain language. This is shown as a 1-2 line preview on a small card, not the full posting — be concrete and specific, not a generic restatement of the job title.

Rules:
- Omit any field you cannot find with confidence (do not use null or empty string values).
- "company" must be the specific hiring entity — if the page is on a job board (Seek, Indeed, LinkedIn), extract the company name from the listing content, not the site name.
- Return ONLY the JSON object. No other text before or after.

Page text:
${text}`
}

function parseAIResponse(raw: string): Partial<PrefillData> {
  // Strip markdown fences if the model ignored the instruction
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return {}
  }

  const result: Partial<PrefillData> = {}

  if (typeof parsed.title === 'string' && parsed.title.trim()) {
    result.title = parsed.title.trim()
  }
  if (typeof parsed.company === 'string' && parsed.company.trim()) {
    result.company = parsed.company.trim()
  }
  if (typeof parsed.description === 'string' && parsed.description.trim()) {
    result.description = parsed.description.trim()
  }
  if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
    // Backstop against the model ignoring the 140-char instruction — cut at
    // a word boundary rather than trusting raw length, same fix as the
    // card's own fallback truncation (see truncateText in lib/utils.ts).
    result.summary = truncateText(parsed.summary.trim(), 140)
  }
  // The prompt names the vocabulary, but a model instruction is a request, not
  // a constraint — anything off-list is dropped here rather than trusted.
  const tags = toJobFunctions(parsed.tags)
  if (tags.length > 0) result.tags = tags

  return result
}

async function extractWithAI(text: string): Promise<Partial<PrefillData>> {
  // Skip if no API key or if the page is a JS skeleton with no real content
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || text.length < 50) return {}

  try {
    const res = await fetch(
      // "-latest" tracks Google's current recommended model rather than a
      // dated snapshot — avoids silent breakage when a specific model ID is
      // retired (gemini-2.5-flash was gated from new API keys as of 2026-08,
      // which is what caused this tier to silently no-op).
      //
      // Deliberately "flash-lite", not "flash": the plain flash-latest alias
      // currently resolves to a model that reasons by default ("thinking"),
      // which burns almost the entire maxOutputTokens budget on internal
      // reasoning before it can write the answer — verified live, it hit
      // MAX_TOKENS and returned a truncated, unparseable fragment. This is a
      // structured single-shot extraction task with no need for chain-of-
      // thought; flash-lite returns complete, correct JSON in ~3s instead.
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildAIPrompt(text) }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
        }),
      }
    )

    if (!res.ok) return {}

    const json = await res.json()
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    return parseAIResponse(raw)
  } catch {
    // Auth error, rate limit, network timeout — all fail silently
    return {}
  }
}

// ─── Tier 3: HTML heuristics ─────────────────────────────────────────────────
// extractTagsFromDescriptionHtml and extractClosingDateFromHtml defined above.

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('url')

  if (!raw) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 })
  }

  // Fetch the page.
  //
  // fetchPublicUrl re-checks the host at every redirect hop. The previous code
  // validated only this first hostname and then let fetch follow redirects
  // itself, so a page on a public host could reply
  // `302 -> http://169.254.169.254/...` and be followed unchecked — and since
  // extracted fields are echoed back in the response, that read internal data
  // out, not just reached it.
  //
  // A blocked target returns the same empty payload as a fetch failure, so this
  // endpoint cannot be used to probe which internal hosts exist.
  let html: string
  const res = await fetchPublicUrl(target, {
    timeoutMs: 5000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MMSSJobBoard/1.0)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  })

  if (!res) {
    return NextResponse.json({ data: {} })
  }

  try {
    html = (await res.text()).slice(0, 512_000)
  } catch {
    return NextResponse.json({ data: {} })
  }

  // ── Tier 1a: JSON-LD ────────────────────────────────────────────────────────
  const jsonLd = extractJsonLd(html)

  // ── Tier 1b: Embedded JS state ──────────────────────────────────────────────
  const embedded = extractEmbeddedState(html)

  // ── Tier 1c: OG tags + meta ─────────────────────────────────────────────────
  const og = {
    title: extractOgTag(html, 'og:title'),
    description: extractOgTag(html, 'og:description'),
    image: extractOgTag(html, 'og:image'),
    siteName: extractOgTag(html, 'og:site_name'),
  }
  const metaDesc = extractMetaTag(html, 'description')
  const metaKeywords = extractMetaTag(html, 'keywords')

  // ── Tier 2: AI — only fires when title OR company are still unknown ──────────
  let ai: Partial<PrefillData> = {}
  const tier1Title = jsonLd.title || embedded.title
  const tier1Company = jsonLd.company || embedded.company
  if (!tier1Title || !tier1Company) {
    ai = await extractWithAI(prepareTextForAI(html))
  }

  // ── Merge (most → least trusted) ────────────────────────────────────────────
  const rawTitle =
    jsonLd.title ||
    embedded.title ||
    ai.title ||
    (og.title ? stripTitleSuffix(og.title) : undefined)

  const company =
    jsonLd.company ||
    embedded.company ||
    ai.company ||
    og.siteName ||
    extractCompanyFromTitle(rawTitle) ||
    undefined

  const rawDesc =
    jsonLd.description ||
    embedded.description ||
    ai.description ||
    og.description ||
    metaDesc

  const description = rawDesc
    ? (/<[a-z][\s\S]*>/i.test(rawDesc) ? rawDesc : `<p>${rawDesc}</p>`)
    : undefined

  const closingAt =
    jsonLd.closing_at ||
    embedded.closing_at ||
    extractClosingDateFromHtml(html) ||
    undefined

  // Tags: structured → AI → meta keywords → description heuristic.
  //
  // Each candidate is canonicalised before it is considered, and the first one
  // that yields anything wins. The old `||` chain took the first *truthy* tier,
  // which meant a tier full of unusable free text (a <meta name="keywords">
  // stuffed with SEO terms, say) beat a later tier that had real matches.
  //
  // metaKeywords and the description heuristic are raw third-party text and
  // never had any filtering at all before this.
  const tagCandidates: unknown[] = [
    jsonLd.tags,
    embedded.tags,
    ai.tags,
    metaKeywords,
    description ? extractTagsFromDescriptionHtml(description) : null,
  ]

  let tags: JobFunction[] = []
  for (const candidate of tagCandidates) {
    tags = toJobFunctions(candidate)
    if (tags.length > 0) break
  }

  const rawLogoUrl =
    jsonLd.company_logo_url || embedded.company_logo_url || og.image || undefined
  const company_logo_url =
    rawLogoUrl && /^https?:\/\//i.test(rawLogoUrl) ? rawLogoUrl : undefined

  const result: PrefillData = {
    title: rawTitle || undefined,
    company,
    company_logo_url,
    description,
    // AI-only — JSON-LD/embedded-state/OG tags don't carry a ready-made
    // short summary distinct from the full description, so there's nothing
    // to fall back to. Stays undefined whenever the AI tier didn't run
    // (tier 1 already found title+company) or found nothing.
    summary: ai.summary,
    location: jsonLd.location || embedded.location || undefined,
    job_type: jsonLd.job_type || embedded.job_type || undefined,
    closing_at: closingAt,
    // Undefined rather than [] so the key is stripped below with every other
    // empty field, instead of the response carrying a meaningless empty array.
    tags: tags.length > 0 ? tags : undefined,
  }

  // Strip undefined/empty keys
  const cleaned = Object.fromEntries(
    Object.entries(result).filter(([, v]) => v !== undefined && v !== '')
  )

  return NextResponse.json({ data: cleaned })
}
