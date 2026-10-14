import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitiser for job description HTML.
 *
 * Descriptions are rich text, stored as HTML, and rendered with
 * dangerouslySetInnerHTML. Until now nothing sanitised them at any point, and
 * the content is not trusted: anyone can POST a description to /api/submit-job,
 * and the approve route copies it verbatim onto the public job. An admin
 * reviewing the queue sees the *rendered* output, so a payload like
 * `<img src=x onerror=...>` is invisible at the moment of approval.
 *
 * The allowlist is deliberately the set the editor can actually produce
 * (components/admin/rich-text-editor.tsx): Tiptap StarterKit, plus its Image
 * and Link extensions. Anything outside that is not "rich text a user wrote",
 * it is something else wearing its clothes.
 */
const ALLOWED_TAGS = [
  // StarterKit block + inline nodes
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'hr', 'br',
  'strong', 'em', 's',
  // Extensions
  'a', 'img',
]

const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title']

/**
 * Any link that opens in a new tab gets rel="noopener noreferrer".
 *
 * Tiptap's Link extension already emits this, but the HTML here is not
 * necessarily Tiptap's — it can arrive from the AI prefill route or straight
 * from a hand-written request body. Without it, a submitted
 * `<a target="_blank">` hands the opened page a reference back to
 * window.opener, which is reverse tabnabbing.
 *
 * DOMPurify hooks are registered on the shared instance, so this runs once at
 * module load rather than per call.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A' && node.hasAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Returns HTML safe to pass to dangerouslySetInnerHTML.
 *
 * DOMPurify rejects `javascript:` and `data:` URLs in href/src by default, so
 * links and images are covered without extra configuration here.
 */
export function sanitizeDescription(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

// ── Synced descriptions ─────────────────────────────────────────────────

const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
const INLINE = new Set(['STRONG', 'EM', 'S', 'A', 'CODE'])
const TEXT_NODE = 3

function isBr(node: Node): boolean {
  return node.nodeName === 'BR'
}

function isBlank(node: Node): boolean {
  return node.nodeType === TEXT_NODE && !node.textContent?.trim()
}

/** Text or an image -- something a reader would see. */
function hasContent(node: Node): boolean {
  if (node.nodeType === TEXT_NODE) return Boolean(node.textContent?.trim())
  if (node.nodeName === 'IMG') return true
  return Array.from(node.childNodes).some(hasContent)
}

/**
 * Splits a run of inline children at every gap of two or more <br>s
 * (whitespace between them allowed), dropping <br>s and blank text at the
 * edges of each piece. A single <br> stays inside its piece as a line break.
 */
function splitAtBreakRuns(nodes: Node[]): Node[][] {
  const pieces: Node[][] = []
  let current: Node[] = []
  let i = 0
  while (i < nodes.length) {
    if (isBr(nodes[i])) {
      let j = i
      let brs = 0
      while (j < nodes.length && (isBr(nodes[j]) || isBlank(nodes[j]))) {
        if (isBr(nodes[j])) brs++
        j++
      }
      if (brs >= 2) {
        pieces.push(current)
        current = []
        i = j
        continue
      }
    }
    current.push(nodes[i])
    i++
  }
  pieces.push(current)

  return pieces
    .map((piece) => {
      let start = 0
      let end = piece.length
      while (start < end && (isBr(piece[start]) || isBlank(piece[start]))) start++
      while (end > start && (isBr(piece[end - 1]) || isBlank(piece[end - 1]))) end--
      return piece.slice(start, end)
    })
    .filter((piece) => piece.some(hasContent))
}

/** Wraps a container's loose inline children into one <p> per piece; block children stay as they are. */
function rebuildAsParagraphs(container: Element) {
  const doc = container.ownerDocument
  const out: Node[] = []
  let inline: Node[] = []
  const flush = () => {
    for (const piece of splitAtBreakRuns(inline)) {
      const p = doc.createElement('p')
      p.append(...piece)
      out.push(p)
    }
    inline = []
  }
  for (const child of Array.from(container.childNodes)) {
    const isInline = child.nodeType === TEXT_NODE || INLINE.has(child.nodeName) || isBr(child) || child.nodeName === 'IMG'
    if (isInline) inline.push(child)
    else {
      flush()
      out.push(child)
    }
  }
  flush()
  container.replaceChildren(...out)
}

const ESCAPED_TAG_SRC = String.raw`<\/?(?:p|br|div|span|ul|ol|li|strong|em|b|i|u|h[1-6])\b[^<>]*>`
const ESCAPED_TAG = new RegExp(ESCAPED_TAG_SRC, 'i')
const ESCAPED_TAG_ALL = new RegExp(ESCAPED_TAG_SRC, 'gi')

/** A bullet typed as a character: `• Item`, `- Item`. */
const BULLET = /^\s*[•·▪◦‣●○■➢►✓✔*–-]\s+/

/** Small words left lowercase in a title-cased label. */
const MINOR_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'our', 'your', 'you', 'we', '&', 'is', 'are'])

/**
 * Lines feeds and aggregators put at the top that the board already shows
 * as the title, company, location or job-type chips, or that only restate
 * the panel's own "Job Description" heading.
 */
const PREAMBLE = [
  /^This is an? .+ role with .+ based in .+$/i, // Hatch via LinkedIn
  /^==.*==$/, // Hatch's `== Deloitte ==` banner
  /^Role Seniority\b/i,
  /^Location\s*:.{0,80}$/i,
  /^(job description|description|about the (job|role|position)|about this (job|role|position)|the role|role description|position description|job details|job summary)\s*:?$/i,
  /^More about the .+ role at .+$/i, // Hatch, under "About The Role"
]

/**
 * Sections a student never needs before applying: how the employer stores
 * their data. Only a *labelled* section goes -- a background or criminal
 * history check written into the requirements is something they must meet.
 */
const NOISE_LABEL = /^(privacy (statement|notice|policy|collection notice)|background (screening|checks?))\s*:?$/i

/** Whole paragraphs that only point at a privacy policy. */
const NOISE_LINE = /^(please (read|review|see) our (full )?privacy (notice|policy|statement)\b|this site is protected by reCAPTCHA)/i

/** Where Hatch's own template starts at the bottom of a LinkedIn post. */
const HATCH_TAIL = /^Before we jump into the responsibilities|consider applying even if you don.t meet 100%|partnering with Hatch/i

function textOf(node: Node): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function meaningfulChildren(node: Node): Node[] {
  return Array.from(node.childNodes).filter((n) => !isBlank(n))
}

/** `<p><strong>Label</strong></p>`: how the tidy writes a heading. */
function isHeading(node: Node): boolean {
  if (node.nodeName !== 'P') return false
  const kids = meaningfulChildren(node)
  return kids.length > 0 && kids.every((k) => k.nodeName === 'STRONG') && textOf(node).length <= 80
}

/** A paragraph of nothing but text. */
function isPlainParagraph(node: Node): boolean {
  return node.nodeName === 'P' && Array.from(node.childNodes).every((n) => n.nodeType === TEXT_NODE)
}

/**
 * Short, unpunctuated, mostly capitalised: a section label typed as a plain
 * line ("Skills and Qualifications", "What's the role?"). A lowercase one
 * still counts when a list follows it ("Key job responsibilities").
 * A lead-in that ends in a colon needs the capitals ("We offer:" stays text).
 */
function looksLikeLabel(text: string, nextIsList: boolean): boolean {
  if (!text || text.length > 60 || /[.!,;]$/.test(text) || !/^[A-Z0-9]/.test(text)) return false
  if (text.slice(0, -1).includes(':')) return false // "STEP 6: Background Check" is a line, not a label
  const words = text.split(' ')
  if (words.length > 6) return false
  const significant = words.filter((w) => !MINOR_WORDS.has(w.toLowerCase().replace(/[:?]$/, '')))
  const capitalised = significant.filter((w) => /^[A-Z0-9]/.test(w)).length
  const titleCase = significant.length > 0 && capitalised / significant.length >= 0.6
  return text.endsWith(':') ? titleCase : titleCase || nextIsList
}

function nextElement(node: Node): Element | null {
  let next = node.nextSibling
  while (next && isBlank(next)) next = next.nextSibling
  return next && next.nodeType === 1 ? (next as Element) : null
}

function isList(node: Node | null): boolean {
  return node?.nodeName === 'UL' || node?.nodeName === 'OL'
}

/** Drops a typed bullet character from the start of a line. */
function stripBullet(nodes: Node[]) {
  const first = nodes.find((n) => !isBlank(n))
  if (first?.nodeType === TEXT_NODE) first.textContent = first.textContent!.replace(BULLET, '')
}

function listOf(doc: Document, items: Node[][]): HTMLUListElement {
  const ul = doc.createElement('ul')
  for (const item of items) {
    const li = doc.createElement('li')
    li.append(...item)
    ul.append(li)
  }
  return ul
}

/**
 * `<p><strong>About You</strong><br>Successful applicants…</p>`: a bold
 * label glued to its first line. The label becomes its own heading.
 */
function splitGluedLabels(body: HTMLElement) {
  for (const p of Array.from(body.children)) {
    if (p.nodeName !== 'P') continue
    const kids = meaningfulChildren(p)
    if (kids.length < 3 || kids[0].nodeName !== 'STRONG' || !isBr(kids[1])) continue
    const label = textOf(kids[0])
    if (label.length > 80 || label.split(' ').length > 10) continue
    const heading = p.ownerDocument.createElement('p')
    heading.append(kids[0])
    p.before(heading)
    while (p.firstChild && (isBr(p.firstChild) || isBlank(p.firstChild))) p.firstChild.remove()
    if (p.firstChild?.nodeType === TEXT_NODE) p.firstChild.textContent = p.firstChild.textContent!.trimStart()
  }
}

/**
 * A paragraph whose lines are bullets typed as characters, or a lead-in
 * ending in a colon followed by short lines, becomes a real list.
 */
function linesToLists(body: HTMLElement) {
  const doc = body.ownerDocument
  for (const p of Array.from(body.children)) {
    if (p.nodeName !== 'P' || !p.querySelector('br')) continue
    const lines: Node[][] = [[]]
    for (const child of Array.from(p.childNodes)) {
      if (isBr(child)) lines.push([])
      else lines[lines.length - 1].push(child)
    }
    const text = lines.map((line) => line.map((n) => n.textContent ?? '').join('').trim())
    if (text.some((t) => !t)) continue

    const firstIsBullet = BULLET.test(text[0])
    const restAreBullets = text.slice(1).every((t) => BULLET.test(t))
    const colonLeadIn = text[0].endsWith(':') && lines.length >= 3 && text.slice(1).every((t) => t.length <= 150)
    if (!(restAreBullets || colonLeadIn)) continue

    const items = firstIsBullet && restAreBullets ? lines : lines.slice(1)
    if (restAreBullets) items.forEach(stripBullet)
    const ul = listOf(doc, items)
    if (items === lines) p.replaceWith(ul)
    else {
      p.replaceChildren(...lines[0])
      p.after(ul)
    }
  }
}

/**
 * Top-level runs of paragraphs that are really list items: each starts with
 * a typed bullet, or two or more short lines follow a lead-in ending in a
 * colon (LinkedIn sends "We offer:<br><br>Item<br><br>Item").
 */
function paragraphsToLists(body: HTMLElement) {
  const doc = body.ownerDocument
  const children = Array.from(body.children)
  let i = 0
  while (i < children.length) {
    const el = children[i]
    if (el.nodeName === 'P' && BULLET.test(textOf(el))) {
      let j = i
      while (j < children.length && children[j].nodeName === 'P' && BULLET.test(textOf(children[j]))) j++
      const items = children.slice(i, j).map((p) => Array.from(p.childNodes))
      items.forEach(stripBullet)
      children[i].before(listOf(doc, items))
      children.slice(i, j).forEach((p) => p.remove())
      i = j
      continue
    }

    const text = textOf(el)
    if (el.nodeName === 'P' && !isHeading(el) && text.endsWith(':') && !looksLikeLabel(text, false)) {
      let j = i + 1
      while (
        j < children.length &&
        children[j].nodeName === 'P' &&
        !isHeading(children[j]) &&
        textOf(children[j]).length <= 150 &&
        !textOf(children[j]).endsWith(':')
      )
        j++
      if (j - i - 1 >= 2) {
        const items = children.slice(i + 1, j).map((p) => Array.from(p.childNodes))
        el.after(listOf(doc, items))
        children.slice(i + 1, j).forEach((p) => p.remove())
        i = j
        continue
      }
    }
    i++
  }
}

/** Plain-text section labels become bold, like every other heading. */
function boldenLabels(body: HTMLElement) {
  for (const p of Array.from(body.children)) {
    if (!isPlainParagraph(p)) continue
    const next = nextElement(p)
    if (!next || !looksLikeLabel(textOf(p), isList(next))) continue
    const strong = p.ownerDocument.createElement('strong')
    strong.textContent = textOf(p)
    p.replaceChildren(strong)
  }
}

/** Removes the leading lines in PREAMBLE, privacy and screening notices, then Hatch's closing template. */
function dropBoilerplate(body: HTMLElement) {
  let first = body.firstElementChild
  while (first && first.nodeName === 'P' && PREAMBLE.some((re) => re.test(textOf(first!)))) {
    first.remove()
    first = body.firstElementChild
  }

  for (const el of Array.from(body.children)) {
    if (!el.parentNode || el.nodeName !== 'P') continue
    const text = textOf(el)
    if (isHeading(el) && NOISE_LABEL.test(text)) {
      // The heading and everything under it, up to the next heading.
      let next = nextElement(el)
      while (next && !isHeading(next)) {
        const after = nextElement(next)
        next.remove()
        next = after
      }
      el.remove()
      continue
    }
    const lead = meaningfulChildren(el)[0]
    if (lead?.nodeName === 'STRONG' && NOISE_LABEL.test(textOf(lead))) el.remove()
    else if (NOISE_LINE.test(text) && text.length <= 250) el.remove()
  }

  if (!/not with Hatch|partnering with Hatch/i.test(textOf(body))) return
  const start = Array.from(body.children).find((el) => HATCH_TAIL.test(textOf(el)))
  if (!start) return
  while (start.nextSibling) start.nextSibling.remove()
  start.remove()
}

/**
 * Evens out the structure feeds leave behind: labels glued to text, labels
 * typed as plain lines, lines that are really bullets, and aggregator
 * preamble the board already shows elsewhere. Wording is never changed --
 * only which tag holds it, and whole boilerplate lines dropped.
 */
function restructure(body: HTMLElement) {
  splitGluedLabels(body)
  linesToLists(body)
  paragraphsToLists(body)
  boldenLabels(body)
  dropBoilerplate(body)
}

/**
 * True when the description starts with its own heading, so the panel's
 * "Job Description" heading would sit directly on top of another one.
 */
export function opensWithHeading(html: string): boolean {
  return /^\s*(<h[1-6][\s>]|<p>\s*<strong>[^<]{1,80}<\/strong>\s*<\/p>)/i.test(html)
}

/**
 * Sanitises a description pulled in by the sync and evens out its spacing,
 * so every synced job reads the same on the board whatever ATS it came from.
 *
 * - Headings become bold paragraphs. An ATS's <h1>/<h2> is page-sized type
 *   inside a job card.
 * - Empty paragraphs (`<p></p>`, `<p>&nbsp;</p>`, `<p><br></p>`) go. They
 *   are the blank line between sections, on top of the paragraph gap.
 * - Gaps of two or more <br>s become paragraph breaks. LinkedIn sends whole
 *   descriptions as text split by <br><br>.
 * - Non-breaking spaces become ordinary spaces. Feeds indent paragraphs with
 *   a leading &nbsp;.
 * - Structure is evened out without rewording (see restructure): labels
 *   become bold headings, typed bullets and colon lead-ins become lists, and
 *   aggregator preamble, labelled privacy/screening notices and Hatch's
 *   closing template are dropped.
 *
 * Only for synced descriptions. Anything typed in the editor -- by an admin
 * or an employer -- keeps its blank lines; that spacing is deliberate.
 * Idempotent, so it is safe to re-run over descriptions already tidied.
 */
export function sanitizeSyncedDescription(html: string | null | undefined): string {
  if (!html) return ''
  // RETURN_DOM hands back the parsed <body>; 2.x's types only say Node.
  const body = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, RETURN_DOM: true }) as HTMLElement
  const doc = body.ownerDocument

  const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.includes('\u00a0')) node.textContent = node.textContent.replace(/\u00a0/g, ' ')
    // Coles' JSON-LD escapes only some of its tags, so `<p>` shows as text.
    if (ESCAPED_TAG.test(node.textContent ?? '')) node.textContent = node.textContent!.replace(ESCAPED_TAG_ALL, '')
  }

  for (const heading of Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    const p = doc.createElement('p')
    const meaningful = Array.from(heading.childNodes).filter((n) => !isBlank(n))
    if (meaningful.length === 1 && meaningful[0].nodeName === 'STRONG') {
      p.append(meaningful[0])
    } else {
      const strong = doc.createElement('strong')
      strong.append(...Array.from(heading.childNodes))
      p.append(strong)
    }
    heading.replaceWith(p)
  }

  // `<strong>Description<br><br></strong>`: move edge <br>s out of inline
  // tags so the gap can split the paragraph. Deepest first.
  for (const el of Array.from(body.querySelectorAll('strong, em, s, a, code')).reverse()) {
    while (el.lastChild && isBr(el.lastChild)) el.after(el.lastChild)
    while (el.firstChild && isBr(el.firstChild)) el.before(el.firstChild)
    if (!hasContent(el)) el.remove()
  }

  for (const p of Array.from(body.querySelectorAll('p'))) {
    rebuildAsParagraphs(p)
    p.replaceWith(...Array.from(p.childNodes))
  }
  rebuildAsParagraphs(body)

  // Whatever <br> gaps are left sit inside a list item, quote or inline tag,
  // where there's no paragraph to split -- one line break instead.
  for (const br of Array.from(body.querySelectorAll('br'))) {
    let next = br.nextSibling
    while (next && isBlank(next)) next = next.nextSibling
    if (next && isBr(next)) br.remove()
  }
  for (const el of Array.from(body.querySelectorAll('li, blockquote'))) {
    while (el.lastChild && (isBr(el.lastChild) || isBlank(el.lastChild))) el.lastChild.remove()
    while (el.firstChild && (isBr(el.firstChild) || isBlank(el.firstChild))) el.firstChild.remove()
  }

  for (const p of Array.from(body.querySelectorAll('p'))) {
    if (!hasContent(p)) p.remove()
  }

  restructure(body)

  // ANZ puts every bullet in its own <ul>, spaced apart by the empty
  // paragraphs just removed; each list's margin would still gap the bullets.
  for (const list of Array.from(body.querySelectorAll('ul, ol'))) {
    let next = list.nextSibling
    while (next && isBlank(next)) next = next.nextSibling
    if (next && next.nodeName === list.nodeName) {
      ;(next as Element).prepend(...Array.from(list.childNodes))
      list.remove()
    }
  }

  return body.innerHTML
}
