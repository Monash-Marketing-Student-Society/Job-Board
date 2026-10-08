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
