import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, Bullets } from '@/components/legal/legal-page'
import { PARTNERSHIPS_EMAIL } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Privacy Policy | MMSS Job Board',
  description:
    'What the MMSS Job Board collects, why, who it is shared with, and how to have it removed.',
}

const CONTACT = 'enquires@monashmss.com'

const THIRD_PARTIES = [
  { name: 'Supabase', href: 'https://supabase.com/privacy' },
  { name: 'Vercel', href: 'https://vercel.com/legal/privacy-policy' },
  { name: 'Resend', href: 'https://resend.com/legal/privacy-policy' },
  { name: 'Google', href: 'https://policies.google.com/privacy' },
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
        <Bullets
          items={[
            {
              lead: 'Listing submissions',
              text: 'your name, email and organisation, plus the role details (title, employer, location, work arrangement, job type, closing date, description, application link and any logo).',
            },
            {
              lead: 'Browsing',
              text: 'anonymous usage events recording a random cookie identifier, the listing, its job type and tags at the time, and when. No IP address, name, browser or device details.',
            },
            {
              lead: 'Submitting a listing',
              text: 'a one-way keyed hash of the sending IP address, to stop automated abuse. The address itself is never stored.',
            },
            {
              lead: 'Administrator accounts',
              text: 'email address, sign-in method (password or Google), and last sign-in.',
            },
          ]}
        />
        <p>
          Your browser also keeps a list of listings you clicked apply on, so the site can ask
          whether you finished. It stays on your device.
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
          Two first-party cookies. No third-party advertising or tracking cookies, and no Google
          Analytics. Our analytics run on our own database.
        </p>
        <Bullets
          items={[
            {
              lead: 'mmss_vid',
              text: 'a random visitor identifier, expiring after a year. It counts people rather than page loads. It holds nothing about you and is not linked to your name or email.',
            },
            {
              lead: 'Sign-in cookies',
              text: 'set only for committee administrators, to keep them signed in.',
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
        <Bullets
          items={[
            {
              lead: 'Listings',
              text: 'kept while live, then as a record of what we published. Ask us and we will delete yours.',
            },
            {
              lead: 'Usage events',
              text: 'kept as long-term history so the committee can see how the board is used across years. They are anonymous.',
            },
            { lead: 'Rate-limit hashes', text: 'deleted automatically about an hour after they are written.' },
            { lead: 'Administrator accounts', text: 'removed when a committee member\u2019s term ends.' },
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
        <p>
          These links may help you understand how some of our service providers handle
          information:
        </p>
        {/* Inline row rather than a list: four short names read as a set of
            links here, where a stacked list makes each one look like a section. */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          {THIRD_PARTIES.map((party) => (
            <a
              key={party.name}
              href={party.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-600 transition-colors"
            >
              {party.name}
            </a>
          ))}
        </div>
        <p className="pt-3">
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
