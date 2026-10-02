'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckIcon, LinkSimpleIcon } from '@phosphor-icons/react'
import { Button, Input, useConfirmDialog } from '@/components/ui'
import { segmentedTabsListClassName, segmentedTabsTriggerClassName } from '@/components/ui/segmented-tabs'
import { tableCardClassName } from '@/components/admin/table/table-styles'
import { autoMatch, brandfetchLogoUrl, brandSearchUrl, parseBrandSearch, parseBrandfetchInput, type BrandMatch } from '@/lib/logos'
import type { LogoReviewRow } from '@/lib/logo-review'

/**
 * TEMPORARY (Oct 2026) -- backs /admin/logos; delete with that page.
 *
 * Each row offers candidates -- the employer list's domain, the logo its jobs
 * show today, and Brandfetch Brand Search matches for the name -- with one
 * preselected, so the common case is a glance and one click. Brand Search runs
 * here in the browser because Brandfetch's terms allow it only as client-side
 * autocomplete; a few at a time, to stay far inside its per-IP limit.
 */

type Filter = 'pending' | 'approved' | 'all'

interface Candidate {
  /** Sent to the API as `link`: a domain, or a Brandfetch URL. */
  link: string
  logoUrl: string
  label: string
  detail: string
}

const SEARCH_CONCURRENCY = 3

function candidatesFor(row: LogoReviewRow, matches: BrandMatch[] | undefined): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (c: Candidate | null) => {
    if (!c || seen.has(c.logoUrl)) return
    seen.add(c.logoUrl)
    out.push(c)
  }
  const byDomain = (domain: string, label: string): Candidate => ({
    link: domain,
    logoUrl: brandfetchLogoUrl(domain)!,
    label,
    detail: domain,
  })

  if (row.approved) {
    add({
      link: row.approved.domain ?? row.approved.logoUrl,
      logoUrl: row.approved.logoUrl,
      label: 'Approved',
      detail: row.approved.domain ?? 'pasted link',
    })
  }
  if (row.suggestedDomain) add(byDomain(row.suggestedDomain, 'Suggested'))
  if (row.currentLogo) {
    const parsed = parseBrandfetchInput(row.currentLogo)
    // A non-Brandfetch logo (LinkedIn, an upload) can't be approved here, but is worth seeing.
    add(
      parsed
        ? { link: parsed.domain ?? parsed.logoUrl, logoUrl: parsed.logoUrl, label: 'On its jobs now', detail: parsed.domain ?? 'Brandfetch file' }
        : null
    )
  }
  for (const m of matches ?? []) add(byDomain(m.domain, m.name))
  return out
}

function defaultChoice(row: LogoReviewRow, candidates: Candidate[], matches: BrandMatch[] | undefined): string | null {
  if (candidates.length === 0) return null
  if (row.approved || row.suggestedDomain) return candidates[0].logoUrl
  const auto = matches ? autoMatch(row.company, matches) : null
  return auto ? brandfetchLogoUrl(auto.domain) : (candidates.find((c) => c.label === 'On its jobs now')?.logoUrl ?? null)
}

export function LogoApprovals({ rows: initialRows }: { rows: LogoReviewRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>('pending')
  const [matches, setMatches] = useState<Record<string, BrandMatch[]>>({})
  const [chosen, setChosen] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const { confirm, dialog } = useConfirmDialog()

  // Brand Search for every row, a few at a time. Results only add candidates.
  useEffect(() => {
    let cancelled = false
    const queue = initialRows.map((r) => r.company)
    const worker = async () => {
      while (!cancelled && queue.length > 0) {
        const company = queue.shift()!
        try {
          const res = await fetch(brandSearchUrl(company))
          const found = res.ok ? parseBrandSearch(await res.json()) : []
          if (!cancelled) setMatches((prev) => ({ ...prev, [company]: found }))
        } catch {
          if (!cancelled) setMatches((prev) => ({ ...prev, [company]: [] }))
        }
      }
    }
    void Promise.all(Array.from({ length: SEARCH_CONCURRENCY }, worker))
    return () => {
      cancelled = true
    }
  }, [initialRows])

  const view = useMemo(
    () =>
      rows.map((row) => {
        const m = matches[row.company]
        const candidates = candidatesFor(row, m)
        const picked = row.key in chosen ? chosen[row.key] : defaultChoice(row, candidates, m)
        return { row, candidates, picked: candidates.find((c) => c.logoUrl === picked) ?? null, searching: !m }
      }),
    [rows, matches, chosen]
  )

  const counts = {
    pending: view.filter((v) => !v.row.approved).length,
    approved: view.filter((v) => v.row.approved).length,
    all: view.length,
  }
  const shown = view.filter((v) => (filter === 'all' ? true : filter === 'approved' ? !!v.row.approved : !v.row.approved))
  const readyToBulk = view.filter((v) => !v.row.approved && v.picked)

  async function approve(row: LogoReviewRow, link: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
    setBusy((b) => ({ ...b, [row.key]: true }))
    try {
      const res = await fetch('/api/admin/company-logos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: row.company, link }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`${row.company}: ${payload.error || 'could not save'}`)
        return false
      }
      const logo = payload.logo as { logo_url: string; domain: string | null; approved_at: string }
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key
            ? { ...r, approved: { logoUrl: logo.logo_url, domain: logo.domain, approvedAt: logo.approved_at } }
            : r
        )
      )
      setChosen((c) => ({ ...c, [row.key]: logo.logo_url }))
      if (!opts.quiet) {
        const jobs = payload.jobsUpdated as number
        toast.success(`${row.company} approved${jobs ? ` · ${jobs} job${jobs === 1 ? '' : 's'} updated` : ''}`)
      }
      return true
    } catch {
      toast.error(`${row.company}: could not save`)
      return false
    } finally {
      setBusy((b) => ({ ...b, [row.key]: false }))
    }
  }

  async function unapprove(row: LogoReviewRow) {
    setBusy((b) => ({ ...b, [row.key]: true }))
    try {
      const res = await fetch('/api/admin/company-logos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: row.company }),
      })
      if (!res.ok) {
        toast.error(`${row.company}: could not undo`)
        return
      }
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, approved: null } : r)))
      toast.success(`${row.company} moved back to review. Its jobs keep the logo they have.`)
    } finally {
      setBusy((b) => ({ ...b, [row.key]: false }))
    }
  }

  async function approveAllPicked() {
    const targets = readyToBulk
    const { confirmed } = await confirm({
      title: `Approve ${targets.length} logos?`,
      description:
        'Approves the logo selected on each company still to review, and updates their jobs. ' +
        'Companies with no logo selected are skipped. Scroll the list first if you have not looked at them all.',
      confirmLabel: `Approve ${targets.length}`,
    })
    if (!confirmed) return
    setBulk({ done: 0, total: targets.length })
    let ok = 0
    for (const t of targets) {
      if (await approve(t.row, t.picked!.link, { quiet: true })) ok++
      setBulk((b) => (b ? { ...b, done: b.done + 1 } : b))
    }
    setBulk(null)
    toast.success(`${ok} of ${targets.length} approved`)
  }

  return (
    <div className={tableCardClassName}>
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className={segmentedTabsListClassName} role="tablist">
          {(['pending', 'approved', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={segmentedTabsTriggerClassName(filter === f)}
            >
              {f === 'pending' ? 'To review' : f === 'approved' ? 'Approved' : 'All'} · {counts[f]}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={readyToBulk.length === 0 || bulk !== null}
          loading={bulk !== null}
          onClick={approveAllPicked}
        >
          {bulk ? `Approving ${bulk.done}/${bulk.total}…` : `Approve all selected · ${readyToBulk.length}`}
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {filter === 'pending' ? 'Every company has an approved logo.' : 'Nothing here yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map(({ row, candidates, picked, searching }, i) => (
            <LogoRow
              key={row.key}
              row={row}
              showGroup={i === 0 || shown[i - 1].row.group !== row.group}
              candidates={candidates}
              picked={picked}
              searching={searching}
              busy={!!busy[row.key] || bulk !== null}
              onPick={(url) => setChosen((c) => ({ ...c, [row.key]: url }))}
              onApprove={(link) => approve(row, link)}
              onUnapprove={() => unapprove(row)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface LogoRowProps {
  row: LogoReviewRow
  showGroup: boolean
  candidates: Candidate[]
  picked: Candidate | null
  searching: boolean
  busy: boolean
  onPick: (logoUrl: string) => void
  onApprove: (link: string) => Promise<boolean>
  onUnapprove: () => void
}

function LogoRow({ row, showGroup, candidates, picked, searching, busy, onPick, onApprove, onUnapprove }: LogoRowProps) {
  const [paste, setPaste] = useState('')
  const pasted = paste.trim() ? parseBrandfetchInput(paste) : null
  const pasteInvalid = paste.trim() !== '' && !pasted
  const approvedIsPicked = !!row.approved && picked?.logoUrl === row.approved.logoUrl

  return (
    <li className="py-4">
      {showGroup && <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{row.group}</p>}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex w-full items-center gap-3 lg:w-64 lg:shrink-0">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white">
            {picked ? (
              <img src={picked.logoUrl} alt="" className="size-12 rounded-lg object-contain" />
            ) : (
              <span className="text-xs text-slate-400">None</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">{row.company}</p>
            <p className="text-xs text-slate-500">
              {row.jobCount === 0 ? 'No jobs yet' : `${row.jobCount} job${row.jobCount === 1 ? '' : 's'} · ${row.activeJobCount} live`}
            </p>
            {row.approved && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CheckIcon weight="bold" className="size-3" /> Approved
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => {
              const selected = picked?.logoUrl === c.logoUrl
              return (
                <button
                  key={c.logoUrl}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPick(c.logoUrl)}
                  className={`flex items-center gap-2 rounded-lg border py-1 pl-1 pr-2.5 text-left text-xs transition-colors ${
                    selected ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <img src={c.logoUrl} alt="" className="size-8 rounded-md border border-slate-200 bg-white object-contain" />
                  <span className="min-w-0">
                    <span className="block max-w-40 truncate font-medium text-slate-800">{c.label}</span>
                    <span className="block max-w-40 truncate text-slate-500">{c.detail}</span>
                  </span>
                </button>
              )
            })}
            {searching && <span className="self-center text-xs text-slate-400">Searching Brandfetch…</span>}
            {!searching && candidates.length === 0 && (
              <span className="self-center text-xs text-slate-500">No matches. Paste a Brandfetch link below.</span>
            )}
          </div>

          <form
            className="mt-2 flex max-w-xl gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (pasted && (await onApprove(paste))) setPaste('')
            }}
          >
            <div className="relative flex-1">
              <LinkSimpleIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Wrong logo? Paste a Brandfetch link or domain"
                aria-label={`Brandfetch link for ${row.company}`}
                aria-invalid={pasteInvalid}
                className="h-9 pl-8 text-sm"
              />
            </div>
            {pasted && <img src={pasted.logoUrl} alt="Pasted logo preview" className="size-9 rounded-md border border-slate-200 bg-white object-contain" />}
            <Button type="submit" variant="outline" size="sm" disabled={!pasted || busy}>
              Use this
            </Button>
          </form>
          {pasteInvalid && (
            <p className="mt-1 text-xs text-destructive">
              Not a Brandfetch logo. Use a brandfetch.com/… or cdn.brandfetch.io/… link, or a domain like ogilvy.com.
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2 lg:flex-col lg:items-stretch">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!picked || busy || approvedIsPicked}
            onClick={() => picked && onApprove(picked.link)}
          >
            {approvedIsPicked ? 'Approved' : row.approved ? 'Approve change' : 'Approve'}
          </Button>
          {row.approved && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onUnapprove}>
              Undo
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
