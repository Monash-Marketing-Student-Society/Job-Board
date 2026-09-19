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

const THIRD_PARTIES = [
  { name: 'Supabase', role: 'Database, administrator sign-in, uploaded logos', href: 'https://supabase.com/privacy' },
  { name: 'Vercel', role: 'Website hosting', href: 'https://vercel.com/legal/privacy-policy' },
  { name: 'Resend', role: 'Email delivery', href: 'https://resend.com/legal/privacy-policy' },
  { name: 'Google', role: 'Administrator sign-in, listing pre-fill', href: 'https://policies.google.com/privacy' },
]

function Mail({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="text-slate-900 underline underline-offset-2">
      {address}
    </a>
  )
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-09-19"
      intro={
        <>
          <p>
            A privacy policy sets out what a service does with information about you, so you can
            decide whether to use it. This one covers the MMSS Job Board at jobs.monashmss.com.
          </p>
          <p className="mt-3">
            It explains how we collect, use, store and share information when you browse
            listings, submit a role, or sign in as a committee administrator. There are no
            public accounts. You do not need to sign in to read listings or apply for anything.
          </p>
        </>
      }
    >
      <Section heading="Who we are, and why we built the board">
        <p>
          The Monash Marketing Students&apos; Society is a student society at Monash University.
          The Job Board is run by our committee, who are volunteers.
        </p>
        <p>
          Marketing roles for students are scattered across general job sites, and most of what
          those sites return is irrelevant. We built the board to keep the relevant ones in one
          place. It is free for students to use and free for employers to post to.
        </p>
        <p>
          General enquiries: <Mail address={CONTACT} />. Anything about a listing:{' '}
          <Mail address={PARTNERSHIPS_EMAIL} />.
        </p>
      </Section>

      <Section heading="Information we collect">
        <p>Most visitors give us none of this.</p>
        <Defs
          items={[
            {
              term: 'If you submit a listing',
              detail:
                'Your name, email address and organisation, plus the details of the role: title, employer, location, work arrangement, job type, closing date, description, application link and any logo you upload.',
            },
            {
              term: 'If you browse the board',
              detail: (
                <>
                  Anonymous usage events. Each one records a random cookie identifier, which
                  listing was involved, its job type and tags at that moment, and the time. No IP
                  address, name, browser or device details are stored with them.
                </>
              ),
            },
            {
              term: 'When a listing is submitted',
              detail:
                'A one-way keyed hash of the sending IP address, to stop automated abuse of the form. The address itself is never stored.',
            },
            {
              term: 'If you are a committee administrator',
              detail:
                'Your email address, how you sign in (password or Google), and when you last signed in.',
            },
          ]}
        />
        <p>
          Your browser also keeps a short list of listings you clicked apply on, so the site can
          ask whether you finished. That list stays on your device and is not sent to us.
        </p>
      </Section>

      <Section heading="How we use information">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To review, publish and manage listings.</li>
          <li>To contact you about a listing you submitted.</li>
          <li>To measure how the board is used, so we know which roles are worth chasing.</li>
          <li>To limit automated submissions.</li>
          <li>To sign committee administrators in.</li>
        </ul>
        <p>
          We do not sell information, share it for advertising, or use it to build profiles of
          individuals.
        </p>
      </Section>

      <Section heading="Analytics, cookies and similar technologies">
        <p>
          We use two cookies, both first-party. There are no third-party advertising or tracking
          cookies on this site, and no Google Analytics. Our analytics run on our own database.
        </p>
        <Defs
          items={[
            {
              term: 'mmss_vid',
              detail:
                'A random visitor identifier that expires after a year. It lets us count people rather than page loads, so one person reading five listings is not counted as five. It holds nothing about you and is not linked to your name or email.',
            },
            {
              term: 'Sign-in cookies',
              detail: 'Set only for committee administrators, to keep them signed in.',
            },
          ]}
        />
        <p>
          To opt out, block or clear cookies for this site, or use private browsing. The board
          works normally either way.
        </p>
      </Section>

      <Section heading="When we share information">
        <p>
          With the providers listed at the bottom of this page, who run parts of the site on our
          behalf and cannot use the information for their own purposes. We will also disclose
          information if the law requires it.
        </p>
        <p>
          Published listings are public. Your name, email address and organisation are not
          published. Only our committee sees those.
        </p>
      </Section>

      <Section heading="Data retention">
        <Defs
          items={[
            {
              term: 'Listings',
              detail:
                'Kept while live, and afterwards as a record of what we have published. Ask us and we will delete yours.',
            },
            {
              term: 'Usage events',
              detail:
                'Kept as long-term history so the committee can see how the board is used across years. They are anonymous and are not traced back to individuals.',
            },
            { term: 'Rate-limit hashes', detail: 'Deleted automatically about an hour after they are written.' },
            {
              term: 'Administrator accounts',
              detail: 'Removed when a committee member’s term ends.',
            },
          ]}
        />
      </Section>

      <Section heading="Your choices">
        <p>
          Email <Mail address={CONTACT} /> to ask what we hold about you, to correct it, or to
          have your submission and contact details deleted. If you submitted a listing, your
          confirmation email contains a private link that lets you edit it yourself. Treat that
          link as you would a password.
        </p>
        <p>
          We aim to handle personal information consistently with the Australian Privacy
          Principles. If you think we have got something wrong, tell us and we will try to fix
          it.
        </p>
      </Section>

      <Section heading="International processing">
        <p>
          Our providers operate outside Australia, mainly in the United States, so information
          may be stored and processed overseas. By using the board you agree to that transfer.
          We use established providers and do not transfer information to anyone else.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Information is held in an access-controlled database, and the admin dashboard requires
          a sign-in. No system is completely secure, and we would rather say so than promise
          otherwise. If you believe you have found a security problem with this site, email{' '}
          <Mail address={CONTACT} /> rather than posting it publicly.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          We may update this policy from time to time. If we make material changes we will
          update the date above and, where appropriate, add a notice on the site.
        </p>
      </Section>

      <Section heading="Third-party privacy policies">
        <p>The providers we rely on publish their own policies:</p>
        <ul className="space-y-2 mt-1">
          {THIRD_PARTIES.map((party) => (
            <li key={party.name} className="text-[15px]">
              <a
                href={party.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-900 underline underline-offset-2 font-medium"
              >
                {party.name}
              </a>
              <span className="text-slate-500">, {party.role.toLowerCase()}</span>
            </li>
          ))}
        </ul>
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
