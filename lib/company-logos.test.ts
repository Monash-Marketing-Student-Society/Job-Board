import { describe, it, expect, vi } from 'vitest'
import { adoptableLogo, adoptCompanyLogo, approveCompanyLogo, approvedLogoFor, removeCompanyLogo } from './company-logos'
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

const LICDN = 'https://media.licdn.com/dms/image/v2/X/company-logo_100_100/0/1/park_hyatt_logo?e=2147483647&v=beta&t=x'

describe('adoptableLogo', () => {
  it("takes the record's LinkedIn logo when it names the same company", () => {
    expect(adoptableLogo(LICDN, 'Park Hyatt', 'Park Hyatt')).toBe(LICDN)
    expect(adoptableLogo(LICDN, 'Mars, Inc.', 'Mars')).toBe(LICDN)
  })

  it('refuses a logo from a poster re-attributed to another employer', () => {
    expect(adoptableLogo(LICDN, 'Hatch', 'Deloitte')).toBeNull()
  })

  it('refuses hosts other than LinkedIn, non-https and junk', () => {
    expect(adoptableLogo('https://evil.test/logo.png', 'Mars', 'Mars')).toBeNull()
    expect(adoptableLogo(LICDN.replace('https:', 'http:'), 'Mars', 'Mars')).toBeNull()
    expect(adoptableLogo(null, 'Mars', 'Mars')).toBeNull()
    expect(adoptableLogo('not a url', 'Mars', 'Mars')).toBeNull()
  })
})

describe('adoptCompanyLogo', () => {
  const PUBLIC = 'https://x.supabase.co/storage/v1/object/public/company-logos/auto/abc.jpg'

  function storageDb(handler: Handler = () => undefined, uploadError: { message: string } | null = null) {
    const { db, log } = fakeDb(handler)
    const upload = vi.fn().mockResolvedValue({ error: uploadError })
    ;(db as unknown as { storage: unknown }).storage = {
      from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: PUBLIC } }) }),
    }
    return { db, log, upload }
  }

  const image = (type = 'image/jpeg', bytes = 1500, status = 200) =>
    vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes), { status, headers: { 'content-type': type } }))

  const saved: Handler = (table, ops) => (table === 'company_logos' && has(ops, 'maybeSingle') ? { data: { logo_url: PUBLIC } } : undefined)

  it('copies the image into the bucket and saves it as the company logo, never overwriting one', async () => {
    const { db, log, upload } = storageDb(saved)
    expect(await adoptCompanyLogo(db, 'Park Hyatt', LICDN, image())).toBe(PUBLIC)

    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^auto\/[0-9a-f]{24}\.jpg$/), expect.any(Uint8Array), { contentType: 'image/jpeg', upsert: true })
    const upsert = log.find((c) => c.table === 'company_logos' && has(c.ops, 'upsert'))!.ops
    expect(argOf(upsert, 'upsert')[0]).toMatchObject({ company_key: 'park hyatt', company: 'Park Hyatt', logo_url: PUBLIC, approved_by: null })
    expect(argOf(upsert, 'upsert')[1]).toEqual({ onConflict: 'company_key', ignoreDuplicates: true })
  })

  it('stores nothing for a failed download, a non-raster image, or a tiny or huge file', async () => {
    for (const fetchImpl of [image('image/jpeg', 1500, 404), image('image/svg+xml'), image('text/html'), image('image/png', 50), image('image/png', 3 * 1024 * 1024)]) {
      const { db, log, upload } = storageDb(saved)
      expect(await adoptCompanyLogo(db, 'Park Hyatt', LICDN, fetchImpl)).toBeNull()
      expect(upload).not.toHaveBeenCalled()
      expect(log).toHaveLength(0)
    }
  })

  it('returns null, saving no row, when the upload fails or the fetch throws', async () => {
    const failed = storageDb(saved, { message: 'bucket down' })
    expect(await adoptCompanyLogo(failed.db, 'Park Hyatt', LICDN, image())).toBeNull()
    expect(failed.log).toHaveLength(0)

    const thrown = storageDb(saved)
    expect(await adoptCompanyLogo(thrown.db, 'Park Hyatt', LICDN, vi.fn().mockRejectedValue(new Error('timeout')))).toBeNull()
  })
})
