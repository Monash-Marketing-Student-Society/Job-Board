'use client'

import { useEffect, useState } from 'react'
import { NOTES_STORAGE_KEY } from '../lib/adjustable'

/**
 * A note pinned to one specimen.
 *
 * Storage is localStorage, so a note stays in this browser and reaches
 * nobody else — no table, no migration, and nothing to apply to prod. That
 * is a deliberate ceiling, not an oversight: `Copy all notes` is how a note
 * leaves the machine. If these ever need to be shared with the committee,
 * the upgrade is a Supabase table keyed by the same `id` used here.
 *
 * `id` must be stable across renders and releases — it is the storage key.
 */

type Notes = Record<string, string>

function read(): Notes {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Notes) : {}
  } catch {
    return {}
  }
}

function write(notes: Notes) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // Blocked site data — the note stays on screen for this view only.
  }
}

/** Broadcasts within the tab, so every Note and the export stay in sync. */
const CHANGED = 'mmss-style-notes-changed'

export function Note({ id, label }: { id: string; label: string }) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const sync = () => setValue(read()[id] ?? '')
    sync()
    window.addEventListener(CHANGED, sync)
    return () => window.removeEventListener(CHANGED, sync)
  }, [id])

  function save(next: string) {
    setValue(next)
    const notes = read()
    if (next.trim()) notes[id] = next
    else delete notes[id]
    write(notes)
    window.dispatchEvent(new Event(CHANGED))
  }

  if (!open && !value) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-slate-400 underline underline-offset-2 hover:text-slate-700"
      >
        + note
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={(e) => save(e.target.value)}
        placeholder={`Note on ${label}…`}
        rows={2}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] leading-snug text-slate-700"
      />
      {value && <p className="text-[10px] text-slate-400">Saved in this browser only.</p>}
    </div>
  )
}

export function NotesExport() {
  const [notes, setNotes] = useState<Notes>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const sync = () => setNotes(read())
    sync()
    window.addEventListener(CHANGED, sync)
    return () => window.removeEventListener(CHANGED, sync)
  }, [])

  const entries = Object.entries(notes).filter(([, v]) => v.trim())
  if (!entries.length) return null

  async function copyAll() {
    const text = entries.map(([id, v]) => `- **${id}** — ${v.trim()}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copyAll}
      className="w-full rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/15"
    >
      {copied ? 'Copied' : `Copy all notes (${entries.length})`}
    </button>
  )
}
