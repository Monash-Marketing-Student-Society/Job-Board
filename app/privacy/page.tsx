import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, Defs } from '@/components/legal/legal-page'
import { PARTNERSHIPS_EMAIL } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Privacy Policy | MMSS Job Board',
  description:
    'What the MMSS Job Board collects, why, who it is shared with, and how to have it removed.',
}

const CONTACT = 'enquires@monashmss.com'

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-09-19"
      intro={
        <p>
          This policy covers the MMSS Job Board at jobs.monashmss.com, run by the Monash
          Marketing Students&apos; Society. It describes what we collect, why we collect it, and
          what you can ask us to do with it. We have tried to describe what the site actually
          does rather than what a privacy policy usually says.
        </p>
      }
    >
      <Section heading="Who we are">
        <p>
          The Monash Marketing Students&apos; Society (MMSS) is a student society at Monash
          University. The Job Board is run by our committee on a volunteer basis. You can reach
          us at{' '}
          <a href={`mailto:${CONTACT}`} className="text-slate-900 underline underline-offset-2">
            {CONTACT}
          </a>
          , or about listings specifically at{' '}
          <a
            href={`mailto:${PARTNERSHIPS_EMAIL}`}
            className="text-slate-900 underline underline-offset-2"
          >
            {PARTNERSHIPS_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section heading="What we collect">
        <p>
          There are only a few kinds of information on this site, and most visitors give us
          none of them.
        </p>
        <Defs
          items={[
            {
              term: 'If you submit a job listing',
              detail: (
                <>
                  Your name, email address and organisation name, together with the details of
                  the role you are posting — title, employer, location, work arrangement, job
                  type, closing date, description, application link and any logo you supply. We
                  need your contact details to confirm the submission, ask questions about it,
                  and tell you whether it was published.
                </>
              ),
            },
            {
              term: 'If you browse the board',
              detail: (
                <>
                  We record anonymous usage events: that a listing was viewed, opened, shared,
                  or that an apply link was clicked, along with how long a listing was on
                  screen. Each event stores a random identifier from a cookie, the listing
                  involved, its job type and tags at that moment, and the time. It does{' '}
                  <strong className="font-semibold text-slate-800">not</strong> store your IP
                  address, your name, your browser or device details, or anything that
                  identifies you personally.
                </>
              ),
            },
            {
              term: 'When a listing is submitted',
              detail: (
                <>
                  To stop automated abuse of the submission form, we store a one-way keyed hash
                  of the sending IP address for a short period, together with a timestamp. The
                  hash is computed with a secret key held on our server, and the IP address
                  itself is never written down.
                </>
              ),
            },
            {
              term: 'If you are a committee administrator',
              detail: (
                <>
                  Your email address, the method you sign in with (a password, or Google), and
                  when you last signed in.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section heading="Cookies">
        <p>
          We use two, both first-party, and neither is for advertising. We do not use
          third-party advertising or tracking cookies, and we do not sell data to anyone.
        </p>
        <Defs
          items={[
            {
              term: 'mmss_vid',
              detail: (
                <>
                  A random identifier used to count visitors and returning visitors. It expires
                  after one year. It is not linked to your name or email, and it carries no
                  information about you — it exists so that one person reading five listings is
                  not counted as five people.
                </>
              ),
            },
            {
              term: 'Sign-in cookies',
              detail: (
                <>
                  Set only for committee administrators, to keep them signed in to the admin
                  dashboard. They are never set for ordinary visitors.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section heading="Who else handles this information">
        <p>
          We use a small number of service providers to run the site. They process information
          on our behalf and are not permitted to use it for their own purposes.
        </p>
        <Defs
          items={[
            {
              term: 'Supabase',
              detail: 'Hosts the database, administrator sign-in, and uploaded logo files.',
            },
            { term: 'Vercel', detail: 'Hosts and serves the website itself.' },
            {
              term: 'Resend',
              detail:
                'Delivers the emails we send — submission confirmations to you, and notifications to our committee.',
            },
            {
              term: 'Google',
              detail: (
                <>
                  Two separate uses. Committee administrators may sign in with a Google account.
                  Separately, when a job listing is submitted with a link, we may fetch that
                  public page and pass its text to Google&apos;s Gemini API to pre-fill the form
                  — this sends the employer&apos;s public job advertisement, not your personal
                  details.
                </>
              ),
            },
          ]}
        />
        <p>
          We will also disclose information if we are required to by law. Published job listings
          are, by their nature, public — the employer and role details you submit appear on the
          site once approved. Your name, email address and organisation name are{' '}
          <strong className="font-semibold text-slate-800">not</strong> published; they are seen
          only by our committee.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <Defs
          items={[
            {
              term: 'Job submissions',
              detail:
                'Kept while the listing is live and afterwards as a record of what we have published. Tell us if you want yours removed and we will do it.',
            },
            {
              term: 'Usage events',
              detail:
                'Kept as aggregate history so the committee can see how the board is used over time. They are anonymous and are not traced back to individuals.',
            },
            {
              term: 'Submission rate-limit hashes',
              detail: 'Deleted automatically about an hour after they are written.',
            },
            {
              term: 'Administrator accounts',
              detail: 'Removed when a committee member’s term ends.',
            },
          ]}
        />
      </Section>

      <Section heading="Your choices and rights">
        <p>
          Email us at{' '}
          <a href={`mailto:${CONTACT}`} className="text-slate-900 underline underline-offset-2">
            {CONTACT}
          </a>{' '}
          and you can ask us to:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>tell you what information we hold about you;</li>
          <li>correct anything that is wrong;</li>
          <li>delete your submission and your contact details.</li>
        </ul>
        <p>
          If you submitted a listing, the confirmation email includes a private link that lets
          you edit it yourself without contacting us. You can stop the anonymous usage
          collection at any time by blocking or clearing cookies for this site, or by using your
          browser&apos;s private browsing mode — the board works normally either way.
        </p>
        <p>
          We aim to handle personal information consistently with the Australian Privacy
          Principles. If you are unhappy with how we have handled something, tell us first and
          we will try to put it right.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Information is held in an access-controlled database, and the admin dashboard requires
          a sign-in. No system is perfectly secure, and we would rather say that plainly than
          promise otherwise. If you believe you have found a security problem with this site,
          please email{' '}
          <a href={`mailto:${CONTACT}`} className="text-slate-900 underline underline-offset-2">
            {CONTACT}
          </a>{' '}
          rather than posting it publicly.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy we will update the date at the top of this page. The Job
          Board is run by students, and the committee changes each year; the commitments here
          carry over regardless.
        </p>
        <p className="pt-2">
          See also our{' '}
          <Link href="/terms" className="text-slate-900 underline underline-offset-2">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
