import { describe, it, expect } from 'vitest'
import { roleTypeRule, thinMarketing, type RoleTypeInput } from './role-type'
import { assessTarget } from './target'

// A description that mentions marketing often enough for the thin-marketing rule.
const MARKETING = '<p>Support our marketing team on brand campaigns, social media and content.</p>'

function role(overrides: Partial<RoleTypeInput>): RoleTypeInput {
  return { title: 'Marketing Coordinator', jobType: null, description: MARKETING, entryRoute: false, ...overrides }
}
const rule = (overrides: Partial<RoleTypeInput>) => roleTypeRule(role(overrides))?.rule ?? null

// Each case is a posting from the 3-23 Oct review, decided by the admins.
describe('roleTypeRule', () => {
  it('removes admin and support roles', () => {
    expect(rule({ title: 'Administration Support Officer - Medical Response' })).toBe('admin_role')
    expect(rule({ title: 'Graduate Personal Assistant to the Director', entryRoute: true })).toBe('admin_role')
    expect(rule({ title: 'Coordination and Secretariat Officer' })).toBe('admin_role')
    expect(rule({ title: 'Marketing Assistant' })).toBeNull()
  })

  it('removes product and tech titles but keeps market research', () => {
    expect(rule({ title: 'Graduate Product Manager', entryRoute: true })).toBe('tech_title')
    expect(rule({ title: 'Business Intelligence Intern: Revenue & Trade Management', entryRoute: true })).toBe('tech_title')
    expect(rule({ title: '2027 DXC Technology Graduate Program Australia', entryRoute: true })).toBe('tech_title')
    expect(rule({ title: 'Consumer Data Insights Graduate', entryRoute: true })).toBeNull()
    expect(rule({ title: 'Product Marketing Coordinator' })).toBeNull()
  })

  it('keeps sales programs and trained sales roles at large employers', () => {
    expect(rule({ title: 'Cellar Door Sales Attendant', listEmployer: true, description: `${MARKETING}<p>Serve guests.</p>` })).toBe('sales_role')
    expect(rule({ title: 'Diageo Liquor Sales Rep – Graduate Role', entryRoute: true })).toBeNull()
    expect(rule({ title: 'Territory Sales Representative', employerSize: 10001, description: `${MARKETING}<p>Full training provided.</p>` })).toBeNull()
    expect(rule({ title: 'Territory Sales Representative', employerSize: 11, description: `${MARKETING}<p>Full training provided.</p>` })).toBe('sales_role')
    // Size unknown: review rather than remove.
    expect(rule({ title: 'Territory Sales Representative', description: `${MARKETING}<p>Full training provided.</p>` })).toBeNull()
    expect(rule({ title: 'Sales & Marketing Coordinator' })).toBeNull()
  })

  it('removes blocked posters', () => {
    expect(rule({ title: 'Social Media & Content – Startup Experience Program', company: 'District X' })).toBe('blocked_poster')
    expect(rule({ title: 'Marketing Intern', company: 'TMGM', entryRoute: true })).toBe('blocked_poster')
    expect(rule({ title: 'Praktikant' })).toBe('blocked_poster')
  })

  it('removes public-sector and university officer roles, not their programs', () => {
    expect(rule({ title: 'Community Communications Officer', company: 'Bayside City Council', industries: 'Government Administration' })).toBe('public_sector')
    expect(rule({ title: 'Schools Engagement and Recruitment Assistant', company: 'Swinburne University of Technology' })).toBe('public_sector')
    expect(rule({ title: 'Marketing Graduate Program', company: 'Department of Transport and Planning', entryRoute: true })).toBeNull()
    expect(rule({ title: 'Communications Officer', company: 'Nine' })).toBeNull()
  })

  it('removes gambling employers', () => {
    expect(rule({ title: 'Content Coordinator', company: 'Easygo' })).toBe('gambling')
    expect(rule({ title: 'Content Coordinator', company: 'Acme', industries: 'Gambling Facilities and Casinos' })).toBe('gambling')
  })

  it('removes non-program roles whose description barely mentions marketing', () => {
    expect(thinMarketing(role({ title: 'Stakeholder Services Officer', description: '<p>Answer member enquiries by phone.</p>' }))).toEqual({
      rule: 'thin_marketing',
      evidence: 'Mentions marketing words 0 times',
    })
    expect(thinMarketing(role({ title: 'Graduate Program', entryRoute: true, description: '<p>Rotate through finance and risk.</p>' }))).toBeNull()
    expect(thinMarketing(role({ title: 'Account Coordinator', description: null }))).toBeNull()
    expect(thinMarketing(role({ title: 'Account Coordinator' }))).toBeNull()
  })
})

describe('assessTarget — role types', () => {
  it('reports the role-type rule', () => {
    const result = assessTarget({ title: 'Program Support Officer', jobType: null, location: 'Melbourne', tags: ['Brand'], description: MARKETING })
    expect(result).toMatchObject({ verdict: 'reject', rule: 'admin_role', evidence: 'support officer' })
  })
})
