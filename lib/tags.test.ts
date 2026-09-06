import { describe, it, expect } from 'vitest'
import {
  JOB_FUNCTIONS,
  MAX_JOB_FUNCTIONS,
  isJobFunction,
  toJobFunction,
  toJobFunctions,
} from './tags'

describe('JOB_FUNCTIONS', () => {
  it('is the nine-value vocabulary', () => {
    expect(JOB_FUNCTIONS).toHaveLength(9)
    expect([...JOB_FUNCTIONS].sort()).toEqual([
      'Analytics',
      'Brand',
      'Communications',
      'Creative',
      'Digital',
      'Events',
      'Sales',
      'Social Media',
      'Strategy',
    ])
  })

  it('keeps the spreadsheet order the bulk-import help text is built from', () => {
    expect(JOB_FUNCTIONS.join(', ')).toBe(
      'Strategy, Sales, Creative, Events, Communications, Analytics, Social Media, Digital, Brand'
    )
  })
})

describe('isJobFunction', () => {
  it('accepts exact canonical values', () => {
    expect(isJobFunction('Social Media')).toBe(true)
    expect(isJobFunction('Brand')).toBe(true)
  })

  it('rejects anything else, including case variants', () => {
    expect(isJobFunction('social media')).toBe(false)
    expect(isJobFunction('Marketing')).toBe(false)
    expect(isJobFunction('')).toBe(false)
    expect(isJobFunction(null)).toBe(false)
    expect(isJobFunction(42)).toBe(false)
  })
})

describe('toJobFunction', () => {
  it('folds case and surrounding whitespace onto the canonical spelling', () => {
    expect(toJobFunction('social media')).toBe('Social Media')
    expect(toJobFunction('  BRAND  ')).toBe('Brand')
  })

  it('does not alias distinct strings', () => {
    // "Social" is a different string from "Social Media" — mapping it would be
    // guessing intent, which is how a controlled vocabulary stops being one.
    expect(toJobFunction('Social')).toBeNull()
    expect(toJobFunction('Comms')).toBeNull()
    expect(toJobFunction('digital marketing')).toBeNull()
  })

  it('returns null for non-strings', () => {
    expect(toJobFunction(undefined)).toBeNull()
    expect(toJobFunction(['Brand'])).toBeNull()
  })
})

describe('toJobFunctions', () => {
  it('accepts an array and drops unrecognised entries', () => {
    expect(toJobFunctions(['Brand', 'Nonsense', 'Digital'])).toEqual(['Brand', 'Digital'])
  })

  it('accepts the comma-separated string the free-text era produced', () => {
    expect(toJobFunctions('Brand, social media, Marketing')).toEqual(['Brand', 'Social Media'])
  })

  it('removes duplicates that differ only by case', () => {
    expect(toJobFunctions(['Brand', 'brand', 'BRAND'])).toEqual(['Brand'])
  })

  it('caps at MAX_JOB_FUNCTIONS', () => {
    const all = toJobFunctions([...JOB_FUNCTIONS])
    expect(all).toHaveLength(MAX_JOB_FUNCTIONS)
    expect(all).toEqual(['Strategy', 'Sales', 'Creative'])
  })

  it('honours an explicit cap', () => {
    expect(toJobFunctions(['Brand', 'Digital', 'Sales'], 2)).toEqual(['Brand', 'Digital'])
  })

  it('returns an empty array for junk input', () => {
    expect(toJobFunctions(null)).toEqual([])
    expect(toJobFunctions(undefined)).toEqual([])
    expect(toJobFunctions(123)).toEqual([])
    expect(toJobFunctions('')).toEqual([])
  })
})
