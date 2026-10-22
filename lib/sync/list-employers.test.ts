import { describe, it, expect } from 'vitest'
import { isListEmployer } from './list-employers'

describe('isListEmployer', () => {
  it('matches listed employers as LinkedIn names them', () => {
    for (const name of ['Nine', 'Nine Entertainment', 'Dentsu', 'dentsu B2B', 'Publicis Groupe', 'Publicis Sapient', "L'Oréal", 'oOh!media', 'Mondelēz International', 'EY', 'Commonwealth Bank', 'Coles Group']) {
      expect(isListEmployer(name)).toBe(true)
    }
  })

  it('does not match a name that only contains a listed one', () => {
    for (const name of ['Cloud Nine', 'Eyecare Plus', 'Marsden Group', 'The Crowd', 'Hatch', null, '']) {
      expect(isListEmployer(name)).toBe(false)
    }
  })
})
