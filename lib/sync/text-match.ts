/**
 * Shared word-boundary text matching for the targeting gates (location.ts,
 * target.ts). Plain `includes()` lets a needle match inside an unrelated
 * word -- "kew" inside "Kewpie", "us" inside "Australia" -- which is exactly
 * wrong for gates where a false match silently rejects or accepts a real job.
 */

/** Word-boundary, case-insensitive containment check for a single phrase. */
export function containsWord(text: string, needle: string): boolean {
  const escaped = needle.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return false
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

/** True if any of `needles` matches `text` as a whole word/phrase. */
export function matchesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => containsWord(text, needle))
}
