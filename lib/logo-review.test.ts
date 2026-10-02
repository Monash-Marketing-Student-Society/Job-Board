import { describe, it, expect } from 'vitest'
import { BOARD_ONLY_GROUP, buildLogoReviewRows } from './logo-review'

const EMPLOYERS = [
  { name: 'Mars', group: 'Consumer brands', domain: 'mars.com' },
  { name: 'MADE THIS', group: 'Creative', domain: null },
]

describe('buildLogoReviewRows', () => {
  it('lists every allowlisted employer, even with no jobs', () => {
    const rows = buildLogoReviewRows(EMPLOYERS, [], [])
    expect(rows.map((r) => [r.company, r.onAllowlist, r.suggestedDomain, r.jobCount])).toEqual([
      ['Mars', true, 'mars.com', 0],
      ['MADE THIS', true, null, 0],
    ])
  })

  it('folds board jobs into their employer row and counts them', () => {
    const rows = buildLogoReviewRows(
      EMPLOYERS,
      [
        { company: 'Mars, Inc.', company_logo_url: 'https://x/a.png', is_active: true },
        { company: 'mars', company_logo_url: 'https://x/a.png', is_active: false },
        { company: 'MARS', company_logo_url: 'https://x/b.png', is_active: false },
      ],
      []
    )
    expect(rows[0]).toMatchObject({ company: 'Mars', jobCount: 3, activeJobCount: 1, currentLogo: 'https://x/a.png' })
    expect(rows).toHaveLength(2)
  })

  it('adds board-only companies after the allowlist, sorted, with a domain read off a Brandfetch logo', () => {
    const rows = buildLogoReviewRows(
      EMPLOYERS,
      [
        { company: 'Zeta', company_logo_url: null, is_active: true },
        { company: 'Alpha ', company_logo_url: 'https://cdn.brandfetch.io/alpha.com/w/400?c=other', is_active: true },
      ],
      []
    )
    expect(rows.slice(2).map((r) => [r.company, r.group, r.suggestedDomain])).toEqual([
      ['Alpha', BOARD_ONLY_GROUP, 'alpha.com'],
      ['Zeta', BOARD_ONLY_GROUP, null],
    ])
  })

  it('attaches approvals, and keeps an approval whose company has since left both lists', () => {
    const rows = buildLogoReviewRows(EMPLOYERS, [], [
      { company_key: 'mars', company: 'Mars', domain: 'mars.com', logo_url: 'L1', approved_at: 't1' },
      { company_key: 'gone', company: 'Gone', domain: null, logo_url: 'L2', approved_at: 't2' },
    ])
    expect(rows[0].approved).toEqual({ logoUrl: 'L1', domain: 'mars.com', approvedAt: 't1' })
    expect(rows.find((r) => r.key === 'gone')).toMatchObject({ company: 'Gone', approved: { logoUrl: 'L2' } })
  })
})
