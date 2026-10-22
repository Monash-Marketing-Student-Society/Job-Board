'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

/**
 * The Continue button on /admin/confirm.
 *
 * A plain form post, but it locks after the first click. The token is single
 * use, so a second click (easy while the server is still answering) would post
 * an already-spent token, and the browser would follow that second response to
 * "link invalid" even though the first one had signed the person in.
 */
export function AuthConfirmForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      action="/api/auth/confirm"
      method="post"
      onSubmit={(e) => {
        if (submitting) e.preventDefault()
        else setSubmitting(true)
      }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <Button type="submit" variant="primary" className="w-full" loading={submitting}>
        Continue
      </Button>
    </form>
  )
}
