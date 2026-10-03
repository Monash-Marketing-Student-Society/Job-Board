/**
 * Where a public listing says it came from, when that matters to a student.
 *
 * Only LinkedIn is named: its jobs are found by search rather than read from
 * the employer's own careers site, and the apply link often lands on
 * LinkedIn rather than the employer, so saying so up front sets the right
 * expectation. Employer-site and human-entered jobs carry no label -- they
 * are the employer's own listing.
 */

const ATTRIBUTIONS: Record<string, string> = {
  'sync:linkedin': 'via LinkedIn',
}

export function sourceAttribution(source: string | null | undefined): string | null {
  return (source && ATTRIBUTIONS[source]) || null
}
