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
