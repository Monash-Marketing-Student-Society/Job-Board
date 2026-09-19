import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, Bullets, Summary } from '@/components/legal/legal-page'
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
        <p>
          A privacy policy explains what a website does with information about you, so you can
          decide whether you are comfortable using it. This one covers the MMSS Job Board at
          jobs.monashmss.com. We have written it in plain English, because a policy you cannot
          follow is not much use to you.
        </p>
      }
    >
      <Summary
        points={[
          'You can browse every listing without telling us anything about yourself.',
          'There are no student accounts, and nothing to sign up for.',
          'We never sell your information, and there are no advertising trackers on this site.',
          'If you post a job, we keep your contact details so we can talk to you about it.',
        ]}
      />

      <Section heading="Who we are, and why we built the board">
        <p>
          We are the Monash Marketing Students&apos; Society, a student society at Monash
          University. The Job Board is run by our committee, who are all students and
          volunteers.
        </p>
        <p>
          Marketing roles for students tend to be scattered across big job sites, buried under
          hundreds of listings that are not relevant. We built the board to gather the good ones
          in one place. It is free for students to use and free for employers to post to.
        </p>
        <p>
          If you have a question about anything here, please just email us at{' '}
          <Mail address={CONTACT} />. For anything about a specific listing,{' '}
          <Mail address={PARTNERSHIPS_EMAIL} /> reaches us faster.
        </p>
      </Section>

      <Section heading="Information we collect">
        <p>
          If you are here to look for a job, the answer is almost nothing. You do not need an
          account, and we do not ask you to identify yourself.
        </p>
        <Bullets
          items={[
            {
              lead: 'If you post a job',
              text: 'your name, email address and organisation, along with the details of the role you are advertising.',
            },
            {
              lead: 'If you are just browsing',
              text: 'we note things like "a listing was opened" or "someone clicked apply", along with which listing and when. These notes do not include your name, your email, or the address your device connects from, so we cannot tell who you are from them.',
            },
            {
              lead: 'When someone posts a job',
              text: 'we take the internet address the form was sent from and scramble it into a code. It helps us spot one person flooding the form with fake listings. The code cannot be turned back into the original address, and we never save the address itself.',
            },
            {
              lead: 'If you are on our committee',
              text: 'your email address, how you sign in, and when you last signed in.',
            },
          ]}
        />
        <p>
          Your own browser also remembers which listings you clicked apply on, so the site can
          check whether you got the application finished. That list stays on your device and is
          never sent to us.
        </p>
      </Section>

      <Section heading="How we use information">
        <Bullets
          items={[
            { text: 'To read, publish and keep track of job listings.' },
            { text: 'To get in touch with you about a listing you posted.' },
            {
              text: 'To see how the board is being used, so we know what kinds of roles are worth chasing for next year.',
            },
            { text: 'To stop people spamming the submission form.' },
            { text: 'To let committee members sign in to manage listings.' },
          ]}
        />
        <p>
          That is the whole list. We do not sell information, we do not hand it to advertisers,
          and we do not build profiles of the people who visit.
        </p>
      </Section>

      <Section heading="Analytics, cookies and similar technologies">
        <p>
          Cookies are small files a website saves in your browser so it can remember something.
          We use two, and both are ours rather than an outside company&apos;s. There are no
          advertising or tracking cookies on this site, and we do not use Google Analytics.
        </p>
        <Bullets
          items={[
            {
              lead: 'A visitor cookie, called mmss_vid',
              text: 'a random number with no name attached. It lets us tell whether a hundred visits came from a hundred people or one person visiting a hundred times. It expires after a year.',
            },
            {
              lead: 'Sign-in cookies',
              text: 'these keep committee members signed in to the part of the site where listings are managed. If you are not on the committee, you will never be given one.',
            },
          ]}
        />
        <p>
          If you would rather not have them, you can clear or block cookies for this site, or
          open it in a private browsing window. Everything on the board keeps working normally.
        </p>
      </Section>

      <Section heading="When we share information">
        <p>
          We use a few outside companies to actually run the site: to store the listings, send
          our emails, and keep the website online. They handle this information only to provide
          that service to us, and are not allowed to use it for anything of their own. You can
          find them listed at the bottom of this page.
        </p>
        <p>We would also share information if the law required us to.</p>
        <p>
          One thing worth being clear about: job listings are public once approved, but{' '}
          <strong className="font-semibold text-slate-800">
            your name, email address and organisation are not published
          </strong>
          . Only our committee sees those.
        </p>
      </Section>

      <Section heading="Data retention">
        <Bullets
          items={[
            {
              lead: 'Job listings',
              text: 'we keep these while they are live, and afterwards as a record of what the board has advertised. If you would like yours removed, just ask.',
            },
            {
              lead: 'Browsing notes',
              text: 'kept long term, so future committees can see how the board has been used over the years. They are anonymous, so they are not linked back to anyone.',
            },
            {
              lead: 'The scrambled codes above',
              text: 'deleted automatically about an hour after they are created.',
            },
            {
              lead: 'Committee accounts',
              text: 'removed when someone’s time on the committee ends.',
            },
          ]}
        />
      </Section>

      <Section heading="Your choices">
        <p>
          You are welcome to email <Mail address={CONTACT} /> and ask us what we hold about you,
          to correct something that is wrong, or to delete your listing and contact details. You
          do not need a reason, and we will not make it difficult.
        </p>
        <p>
          If you posted a job, the confirmation email we sent you has a private link for editing
          it yourself. Keep that link to yourself, as anyone who has it can change your listing.
        </p>
        <p>
          We aim to handle personal information in line with the Australian Privacy Principles.
          If anything here does not look right to you, we are always happy to hear about it.
        </p>
      </Section>

      <Section heading="International processing">
        <p>
          The companies that help us run the site are based overseas, mostly in the United
          States, so this information is stored on computers outside Australia. This is normal
          for almost any website, and it is protected by those companies&apos; own security and
          privacy commitments, linked below.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          The listings are kept in a database that is not open to the public, and the area where
          committee members manage them requires a sign-in. No website can promise perfect
          security, so we will not claim to.
        </p>
        <p>
          If you spot a security problem with the board, we would love to hear from you at{' '}
          <Mail address={CONTACT} />.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          We may update this policy from time to time. If we change something significant we
          will update the date at the top of this page and, where it makes sense, add a notice
          on the site. The committee changes every year, but these commitments carry over.
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
