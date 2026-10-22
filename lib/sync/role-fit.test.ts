import { describe, it, expect } from 'vitest'
import { nonMarketingDegree, technicalSkills } from './role-fit'

// Real phrasings from the trial's postings (Oct 2026).
describe('nonMarketingDegree — removes', () => {
  const removed = [
    '<ul><li>Currently studying either Software Engineering, Computer science or Artificial Intelligence adjacent degree</li><li>Python (Required)</li></ul>',
    '<p>Degree in Computer Science, Information Systems, or related field.</p>',
    "<li>Bachelor's degree in Finance, Accounting, Economics, or a related field</li>",
    '<li>Studying a quantitative or technically focused degree, such as Maths, Statistics, Physics, Electrical / Mechatronic engineering</li>',
    '<li>Degree in a STEM-related field (Information Systems, IT, Computer Science) OR equivalent QA experience</li>',
    '<li>Currently studying either Mechanical, Engineering, Mechatronics or Product/Industrial Design</li>',
  ]
  for (const html of removed) {
    it(html.replace(/<[^>]+>/g, ' ').trim().slice(0, 70), () => {
      expect(nonMarketingDegree(html)).not.toBeNull()
    })
  }
})

describe('nonMarketingDegree — keeps', () => {
  const kept = [
    // A marketing-side field anywhere in the list keeps it.
    '<li>Studying a bachelor degree in business, marketing, engineering or a related discipline</li>',
    '<p>We welcome all degree types, including accounting, law, engineering, commerce, information technology, and business management.</p>',
    "<li>Bachelor's or master's degree (business, accounting, finance, engineering, actuarial science or any major with quantitative focus)</li>",
    '<li>Degree (preferably in psychology, data analytics, information technology or marketing/business studies)</li>',
    '<li>Currently pursuing a bachelor degree or above in management, statistics, economics, computer science, advertising</li>',
    '<li>Degree in Graphic Design or Visual Communication</li>',
    // No field named, or a field outside the degree line.
    '<p>You will be in your penultimate or final year of a degree.</p>',
    '<p>Currently studying, and you will support the team.</p><p>Exposure to finance teams is a plus.</p>',
    '<p>From major banks to emerging players, you will cover finance and policy.</p>',
    null,
  ]
  for (const html of kept) {
    it(String(html).replace(/<[^>]+>/g, ' ').trim().slice(0, 70), () => {
      expect(nonMarketingDegree(html)).toBeNull()
    })
  }
})

describe('technicalSkills', () => {
  it('names a technical role from two or more programming or cloud skills', () => {
    expect(technicalSkills('<li>Experience with Python and Linux</li>')).toEqual(['Python', 'Linux'])
    expect(technicalSkills('<li>Hands-on with Snowflake or BigQuery</li>')).toEqual(['Snowflake', 'BigQuery'])
  })
  it('ignores one skill, and the tools marketing analysts use', () => {
    expect(technicalSkills('<li>Python (nice to have)</li>')).toBeNull()
    expect(technicalSkills('<li>SQL, Excel, Tableau and Google Analytics</li>')).toBeNull()
    expect(technicalSkills('<li>JavaScript</li>')).toBeNull() // not counted twice as Java
  })
})
