/**
 * Is a LinkedIn job still open? Asked of Bright Data, because LinkedIn
 * answers the maintain worker's own requests (a cloud IP) with its 999 bot
 * wall (lib/sync/link.ts), so the page check never sees a LinkedIn posting.
 *
 * On 7 Nov 2026, 10 of the 50 live jobs (all LinkedIn) had closed on
 * LinkedIn days or weeks before their inferred closing date (posted + 30
 * days), the only thing that took them down before this.
 *
 * Bright Data's job dataset, collected by URL, returns the same record a
 * search does, with `application_availability: false` once the employer
 * stops taking applications, or an error record when the posting is gone.
 * Each URL costs one record from the shared monthly pool, so this runs every
 * other day over the live jobs and the review queue, within what the month
 * has left (MONTHLY_RECORD_CAP).
 */

/** How often the check runs: every other day, a little early so the 03:00 run never slips to day three. */
export const AVAILABILITY_EVERY_MS = 44 * 60 * 60 * 1000
/** Most postings one check buys -- about 50 live jobs and 70 in review today. */
export const MAX_AVAILABILITY_CHECKS = 150

/** The posting id in a LinkedIn job URL: ".../jobs/view/4480748607/" -> "4480748607". */
export function linkedInPostingId(url: string | null | undefined): string | null {
  const match = url?.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i)
  return match ? match[1] : null
}

export interface AvailabilityRecord {
  input?: { url?: string } | null
  url?: string | null
  job_posting_id?: string | null
  application_availability?: boolean | null
  error?: string | null
  error_code?: string | null
}

// Error records that mean the posting is gone, not that the lookup failed.
const GONE_ERROR = /dead.?page|not.?found|404|no longer|removed|expired|closed/i

/**
 * The posting ids that have closed, with why. A record that failed for any
 * other reason (blocked, timeout) closes nothing: the next check asks again.
 */
export function closedPostings(records: AvailabilityRecord[]): Map<string, string> {
  const closed = new Map<string, string>()
  for (const record of records) {
    const id = record.job_posting_id ?? linkedInPostingId(record.input?.url ?? record.url ?? null)
    if (!id) continue
    if (record.error || record.error_code) {
      const text = `${record.error_code ?? ''} ${record.error ?? ''}`
      if (GONE_ERROR.test(text)) closed.set(id, 'Removed from LinkedIn')
      continue
    }
    if (record.application_availability === false) closed.set(id, 'No longer accepting applications on LinkedIn')
  }
  return closed
}

/** Whether the last check (its trigger time) is old enough for another. */
export function availabilityDue(lastCheckedAt: string | null, now: Date = new Date()): boolean {
  if (!lastCheckedAt) return true
  return now.getTime() - Date.parse(lastCheckedAt) >= AVAILABILITY_EVERY_MS
}
