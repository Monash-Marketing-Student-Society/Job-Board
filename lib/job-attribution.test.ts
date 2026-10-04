import { describe, it, expect } from 'vitest'
import { sourceAttribution } from './job-attribution'

describe('sourceAttribution', () => {
  it('labels LinkedIn-sourced jobs', () => {
    expect(sourceAttribution('sync:linkedin')).toBe('via LinkedIn')
  })

  it("leaves employer-site, manual and submitted jobs unlabelled", () => {
    expect(sourceAttribution('sync:unilever')).toBeNull()
    expect(sourceAttribution('manual')).toBeNull()
    expect(sourceAttribution('submission')).toBeNull()
    expect(sourceAttribution(undefined)).toBeNull()
  })
})
