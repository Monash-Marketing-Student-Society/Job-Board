import { describe, it, expect } from 'vitest'
import { approveCompanyLogo, approvedLogoFor, removeCompanyLogo } from './company-logos'
import { brandfetchLogoUrl } from './logos'
import { fakeDb, type Handler, type Op } from './sync/test-helpers/fake-db'

const has = (ops: Op[], name: string) => ops.some((o) => o.name === name)
const argOf = (ops: Op[], name: string) => ops.find((o) => o.name === name)!.args

const JOBS = [
  { id: 'j1', company: 'Mars' },
  { id: 'j2', company: 'Mars, Inc.' },
  { id: 'j3', company: 'Marsh' },
]

const happy: Handler = (table, ops) => {
  if (table === 'company_logos' && has(ops, 'upsert'))
    return { data: { ...(argOf(ops, 'upsert')[0] as object), approved_at: 'now' } }
  if (table === 'jobs' && has(ops, 'select')) return { data: JOBS }
  return undefined
}

describe('approveCompanyLogo', () => {
  it('stores the logo under the folded company name, keyed for upsert', async () => {
    const { db, log } = fakeDb(happy)
    const result = await approveCompanyLogo(db, { company: ' Mars ', link: 'mars.com' }, 'admin-1')

    expect(result.ok).toBe(true)
    const upsert = log.find((c) => c.table === 'company_logos')!.ops
    expect(argOf(upsert, 'upsert')[0]).toMatchObject({
      company_key: 'mars',
      company: 'Mars',
      domain: 'mars.com',
      logo_url: brandfetchLogoUrl('mars.com'),
      approved_by: 'admin-1',
    })
    expect(argOf(upsert, 'upsert')[1]).toEqual({ onConflict: 'company_key' })
  })

  it("rewrites the logo on every job of that company -- and only that company's", async () => {
    const { db, log } = fakeDb(happy)
    const result = await approveCompanyLogo(db, { company: 'Mars', link: 'https://brandfetch.com/mars.com' }, 'admin-1')

    expect(result).toMatchObject({ ok: true, jobsUpdated: 2 })
    const update = log.find((c) => c.table === 'jobs' && has(c.ops, 'update'))!.ops
    expect(argOf(update, 'update')[0]).toEqual({ company_logo_url: brandfetchLogoUrl('mars.com') })
    expect(argOf(update, 'in')).toEqual(['id', ['j1', 'j2']])
  })

  it('stores a direct image link as-is', async () => {
    const link = 'https://play-lh.googleusercontent.com/AZEIGHgTZc'
    const { db, log } = fakeDb(happy)
    expect(await approveCompanyLogo(db, { company: 'ATO', link }, 'admin-1')).toMatchObject({ ok: true })
    expect(argOf(log.find((c) => c.table === 'company_logos')!.ops, 'upsert')[0]).toMatchObject({ logo_url: link, domain: null })
  })

  it('refuses a page link, before writing anything', async () => {
    const { db, log } = fakeDb(happy)
    const result = await approveCompanyLogo(db, { company: 'Mars', link: 'https://www.facebook.com/mars' }, 'admin-1')
    expect(result).toMatchObject({ ok: false, kind: 'invalid' })
    expect(log).toHaveLength(0)
  })

  it('refuses an empty company name', async () => {
    const { db } = fakeDb(happy)
    expect(await approveCompanyLogo(db, { company: ' , ', link: 'mars.com' }, null)).toMatchObject({ ok: false, kind: 'invalid' })
  })

  it('skips the jobs update when the company has no jobs yet', async () => {
    const { db, log } = fakeDb((table, ops) => (table === 'jobs' ? { data: [] } : happy(table, ops)))
    const result = await approveCompanyLogo(db, { company: 'Canva', link: 'canva.com' }, 'admin-1')
    expect(result).toMatchObject({ ok: true, jobsUpdated: 0 })
    expect(log.some((c) => c.table === 'jobs' && has(c.ops, 'update'))).toBe(false)
  })

  it('reports a failed save', async () => {
    const { db } = fakeDb((table) => (table === 'company_logos' ? { error: { message: 'boom' } } : undefined))
    expect(await approveCompanyLogo(db, { company: 'Mars', link: 'mars.com' }, null)).toMatchObject({ ok: false, kind: 'error' })
  })
})

describe('removeCompanyLogo', () => {
  it('deletes by folded name and leaves jobs alone', async () => {
    const { db, log } = fakeDb()
    expect(await removeCompanyLogo(db, 'MARS, Inc')).toEqual({ ok: true })
    expect(log.map((c) => c.table)).toEqual(['company_logos'])
    expect(argOf(log[0].ops, 'eq')).toEqual(['company_key', 'mars'])
  })
})

describe('approvedLogoFor', () => {
  it('looks up by folded name', async () => {
    const { db, log } = fakeDb(() => ({ data: { logo_url: 'https://cdn.brandfetch.io/x' } }))
    expect(await approvedLogoFor(db, 'Mars Inc.')).toBe('https://cdn.brandfetch.io/x')
    expect(argOf(log[0].ops, 'eq')).toEqual(['company_key', 'mars'])
  })

  it('is null when nothing is approved', async () => {
    const { db } = fakeDb()
    expect(await approvedLogoFor(db, 'Mars')).toBeNull()
  })
})
