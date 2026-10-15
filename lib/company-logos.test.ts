import { describe, it, expect, vi } from 'vitest'
import { adoptableLogo, adoptCompanyLogo, approvedLogoFor } from './company-logos'
import { fakeDb, type Handler, type Op } from './sync/test-helpers/fake-db'

const has = (ops: Op[], name: string) => ops.some((o) => o.name === name)
const argOf = (ops: Op[], name: string) => ops.find((o) => o.name === name)!.args

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
