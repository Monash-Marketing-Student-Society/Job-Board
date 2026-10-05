import { OPEN_ENDED_MAX_DAYS } from '@/lib/maintain/open-ended'

/**
 * The "No closing date" checkbox under a closing-date input. Some roles stay
 * open until filled; ticking this saves the job with no date, and the nightly
 * check takes it down instead (lib/maintain/open-ended.ts) -- the helper line
 * says how, so nobody ticks it expecting the job to stay up forever.
 */
export function NoClosingDateField({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="mt-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="no_closing_date"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm">No closing date</span>
      </label>
      {checked && (
        <p className="mt-1 text-xs text-muted-foreground">
          Checked every night: taken down when the posting says it has closed, when it disappears from the
          employer&apos;s site, or after {OPEN_ENDED_MAX_DAYS} days.
        </p>
      )}
    </div>
  )
}
