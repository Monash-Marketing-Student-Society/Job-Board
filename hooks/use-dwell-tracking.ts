'use client'

import { useEffect, useRef } from 'react'

import { trackDwell } from '@/lib/analytics/track'

/**
 * Measures how long a visitor actually spends on one listing.
 *
 * Only *foreground* time counts. A tab left open behind another window is not
 * somebody reading a job ad, and counting it would make the average a measure
 * of how often people forget to close tabs. So the clock runs while the
 * document is visible and stops the moment it is not.
 *
 * A measurement is sent when the reading stretch ends — the listing is closed
 * or swapped, the tab is hidden, or the page goes away — which means a visitor
 * who leaves and comes back produces two measurements rather than one long
 * one. That is the honest reading of "time on page" here: each row is one
 * uninterrupted stretch of attention, not a session total that quietly
 * includes the twenty minutes they spent in another tab.
 *
 * Pass the id only for a listing the visitor deliberately opened. The board
 * auto-selects the first job on desktop, and timing a panel nobody asked for
 * would credit whatever happens to sort first with every idle minute on the
 * page.
 */
export function useDwellTracking(jobId: string | null | undefined) {
  // Refs, not state: every value here changes on events that must not re-render
  // the job board, and the cleanup needs the live value rather than the one
  // captured when the effect ran.
  const elapsed = useRef(0)
  const visibleSince = useRef<number | null>(null)

  useEffect(() => {
    if (!jobId) return

    elapsed.current = 0
    visibleSince.current = document.visibilityState === 'visible' ? performance.now() : null

    /** Fold the open stretch into the total and stop the clock. */
    const pause = () => {
      if (visibleSince.current === null) return
      elapsed.current += performance.now() - visibleSince.current
      visibleSince.current = null
    }

    const flush = () => {
      pause()
      const total = elapsed.current
      // Reset before sending, so a pagehide immediately followed by unmount
      // cannot report the same stretch twice.
      elapsed.current = 0
      trackDwell(jobId, total)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        visibleSince.current = performance.now()
      } else {
        // Hidden is a real ending: on mobile it is usually the last event
        // before the tab is discarded, and waiting for `pagehide` there loses
        // the measurement altogether.
        flush()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [jobId])
}
