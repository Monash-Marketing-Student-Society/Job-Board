import { describe, it, expect } from 'vitest'
import { descriptionText, requiredExperience } from './experience'

// The same phrasings the Filter tab of the Job Sync doc lists -- keep the two
// in step when either changes.
describe('requiredExperience — removes a stated 1+ year', () => {
  const removed: Array<[string, number]> = [
    // "Ideally" is a no (admin rule, 23 Oct 2026)
    ["What you can bring Ideally: Around 1-3 years' experience in copywriting, social content", 1],
    // Colliers, Graphic Design & Marketing Assistant
    ['<p><strong>Ideally you will bring:</strong></p><ul><li>Recent completion of a Graphic Design or Marketing course</li><li>1-2 years of experience in a similar role</li></ul>', 1],
    // AICD, Enterprise Markets Coordinator
    ["<p>Ideally, You'll Bring</p><ul><li>Approximately 1–2 years of professional experience in marketing</li></ul>", 1],
    // Internships mentioned elsewhere don't make the years optional
    ["<ul><li>2+ years' experience in a marketing role.</li><li>Our internship program runs every summer.</li></ul>", 2],
    ["3+ years' experience in brand marketing", 3],
    ['minimum of 2 years agency experience', 2],
    ['at least two years of relevant experience', 2],
    ['2-3 years in a similar role', 2],
    ['2 – 4 yrs experience across social', 2],
    ['Experience: minimum 3 years', 3],
    ['experience of at least five years', 5],
    ["24 months' experience", 2],
    ['5 years of B2B marketing experience', 5],
    ["Join our team! You bring 3+ years' experience", 3],
    ['Join us if you have 2+ years experience', 2],
    // Real phrasings from the pending queue, 3 Oct 2026
    ['Qualifications 8+ years’ experience in a strategy role within an agency', 8],
    ['You bring 5+ years of Account Executive experience', 5],
    ['20+ years of experience in Digital Transformation, Consulting, Delivery', 20],
    ['A bit about you: 2 + years’ experience in digital content publishing', 2],
    ["Around 5 years' experience in a production role", 5],
    ['At least three years’ proven journalism experience', 3],
    ['3+ Years experience in account management', 3],
    ['early in your career with approximately 2 years of experience', 2],
    ['You have 2-3 years of hands-on experience configuring enterprise CDPs', 2],
    ['Experience: 3-5 years of experience in a similar role', 3],
    ['5+ years of digital marketing or content strategy experience', 5],
    ['Meticulous attention to detail 3-5 years work experience', 3],
    // One year counts from 5 Oct 2026
    ['1+ year experience', 1],
    ["12 months' experience", 1],
    ["18 months' experience in retail", 1.5],
    ["1-2 years' experience", 1],
    ["1-2 years' experience in a Design Assistant, Buying Assistant or similar role", 1],
    // Real phrasings from the pending queue, 5 Oct 2026
    ['You will bring: 1+ years’ experience in digital advertising, particularly across paid social', 1],
    ['You’ll have at least one year of professional experience and around one year of hands-on experience', 1],
    ["What You'll Bring 1-2 years integrated agency experience (account service or production management)", 1],
    ['Fluent in Thai and English, both spoken and written 1-2 years of experience in affiliate marketing', 1],
    ['Required Skills & Qualities 1–3 years’ experience in a marketing role', 1],
    ["We're looking for someone who has 2+ years of experience in social", 2],
  ]
  for (const [text, years] of removed) {
    it(text, () => {
      expect(requiredExperience(`<p>About you</p><ul><li>${text}</li></ul>`)?.years).toBe(years)
    })
  }
})

describe('requiredExperience — keeps everything else', () => {
  const kept = [
    "0-2 years' experience",
    "6 months' experience in retail",
    "up to 3 years' experience welcome",
    "less than 2 years' experience",
    'our 2 year graduate program builds your experience',
    'a 2-year rotational programme that gives you experience across the business',
    '2 years of study at university',
    'Two years of rotations, then a permanent role',
    'We have 20 years of experience as a business',
    'No experience necessary',
    "Our agency has over 10 years' experience in retail",
    'Managing Directors have a collective 50 years of experience in Salesforce delivery',
    'Business or marketing-related tertiary qualifications, or 3–5 years’ experience in a marketing role',
    '5 weeks annual leave after 2 years of service',
    'This role will be offered as a 12 month max term contract',
    // Graduates or a degree offered as the other route in (queue, 5 Oct 2026)
    'Recent graduates and those with 1-3 years of practical or professional work experience across analytics',
    'seeking a journalism, media, communications or public relations graduate or emerging professional with 1-4 years’ experience',
    'Graduate or early career professional with 1–4 years’ relevant experience',
    'Bachelor’s degree in Marketing or related field or minimum 1 year experience in a similar role.',
    // A preference, not a requirement
    "1 year of experience in social media preferred",
    "2+ years' agency experience is an advantage",
    'Experience through internships, university projects, or 1-2 years in market research',
    'a 12-month internship. This is an exciting opportunity to gain hands-on experience',
    // The employer's own people, not the candidate (Oct 2026 wrong removals)
    'We are privileged to have 25+ years combined experience between our two Founders',
    "You'll work closely with Caleb, StudioBetter's founder, who has over nine years of experience across agency-side",
    'Our CEO brings 15 years of experience in retail',
  ]
  for (const text of kept) {
    it(text, () => {
      expect(requiredExperience(text)).toBeNull()
    })
  }

  it('still finds a later requirement after a phrase it skipped', () => {
    expect(requiredExperience('Up to 1 year experience in social. Minimum 3 years experience in brand.')?.years).toBe(3)
  })

  it('handles an empty description', () => {
    expect(requiredExperience(null)).toBeNull()
    expect(requiredExperience('')).toBeNull()
  })
})

describe('descriptionText', () => {
  it('strips tags and decodes entities', () => {
    expect(descriptionText('<p>3&#43; years&#8217;<br/>experience</p>')).toBe('3+ years’ experience')
  })
})

// 23 Oct 2026: years under a "nice to have" style heading are a preference --
// a student can still be shortlisted, so the job stays.
describe('requiredExperience — preference sections', () => {
  const kept = [
    // Experience a student can have (23 Oct 2026)
    "<ul><li>1+ years' experience in marketing, including internships</li></ul>",
    "<ul><li>1-2 years of experience (internships count)</li></ul>",
    "<ul><li>At least 1 year of experience, inclusive of placements or internships</li></ul>",
    "<ul><li>1+ years' experience in social media, e.g. through internships or freelance work</li></ul>",
    '<h3>Preferred Qualifications:</h3><ul><li>2–5 years of experience in B2B marketing</li></ul>',
    '<p>Nice to have</p><ul><li>2+ years in a creative agency</li></ul>',
    '<ul><li>Nice to have: 2+ years of experience in agency</li></ul>',
    '<p>Bonus points:</p><ul><li>3 years of experience with Salesforce</li></ul>',
    "<ul><li>2+ years' experience in social media is not essential</li></ul>",
    "<ul><li>Agency experience (1+ years' experience) highly regarded</li></ul>",
  ]
  for (const html of kept) {
    it(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80), () => {
      expect(requiredExperience(html)).toBeNull()
    })
  }

  const removed: Array<[string, number]> = [
    // A requirements heading, not a preference
    ["<p>THE IDEAL CANDIDATE:</p><ul><li>Minimum 3+ years' experience in production</li></ul>", 3],
    // A preference section ends at the next heading
    ["<p>Nice to have:</p><ul><li>Canva skills</li></ul><p>Essential:</p><ul><li>2+ years' experience in marketing</li></ul>", 2],
    // "preferred" in a sentence doesn't make the next section a preference (SantaFe)
    ['<p>Immediate Joiners preferred.</p><p>Experience And Education</p><p>Minimum 3 years of experience in PR</p>', 3],
    // Describing who the role is for is still a requirement
    ["<p>This role is ideal for someone with around 3+ years' experience in retail marketing.</p>", 3],
  ]
  for (const [html, years] of removed) {
    it(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80), () => {
      expect(requiredExperience(html)?.years).toBe(years)
    })
  }
})
