import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section } from '@/components/legal/legal-page'
import { PARTNERSHIPS_EMAIL } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Terms of Service | MMSS Job Board',
  description:
    'The terms for using the MMSS Job Board, for both students browsing roles and employers posting them.',
}

const CONTACT = 'enquires@monashmss.com'

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="2026-09-19"
      intro={
        <p>
          These terms apply to the MMSS Job Board at jobs.monashmss.com, run by the Monash
          Marketing Students&apos; Society. By browsing the board or submitting a listing, you
          agree to them.
        </p>
      }
    >
      <Section heading="What this board is, and is not">
        <p>
          The Job Board is a free noticeboard run by student volunteers. We collect marketing
          roles that look relevant to Monash students and list them in one place.
        </p>
        <p>
          We are not a recruiter or an employment agency, and we are not a party to anything
          that happens between you and an employer. Committee members apply judgement when
          reviewing a listing, but we do not formally verify employers, confirm that a role
          exists, or check pay and conditions. A listing appearing here is not an endorsement
          by MMSS.
        </p>
      </Section>

      <Section heading="If you are looking for a job">
        <p>
          Applications are made directly with the employer, through the link on the listing.
          Those sites are not ours and we are not responsible for them.
        </p>
        <p>
          Use ordinary caution. A legitimate employer will not ask you to pay to apply, to be
          hired, or for training or equipment before you start. Be wary of anyone asking for
          bank details, identity documents or money before you have a written offer. If a
          listing here looks like a scam, tell us at{' '}
          <a
            href={`mailto:${PARTNERSHIPS_EMAIL}`}
            className="text-slate-900 underline underline-offset-2"
          >
            {PARTNERSHIPS_EMAIL}
          </a>{' '}
          and we will look into it and remove it if warranted.
        </p>
      </Section>

      <Section heading="If you are posting a role">
        <p>By submitting a listing you confirm that:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>the role is real, and you are authorised to advertise it;</li>
          <li>the details you give are accurate and not misleading;</li>
          <li>
            the role complies with Australian workplace law, including minimum pay entitlements
            and the rules about unpaid work and internships;
          </li>
          <li>
            the listing does not discriminate against applicants on any ground protected by
            Australian anti-discrimination law;
          </li>
          <li>you will not charge applicants a fee of any kind;</li>
          <li>
            you own or have permission to use any logo or material you upload, and you allow us
            to display it on the board.
          </li>
        </ul>
        <p>
          A committee member reviews every listing before it appears, and we may edit it for
          length, clarity, formatting or tagging. We may decline or remove any listing at any
          time, usually because it is out of scope for a marketing student audience, looks
          unsafe, or cannot be verified. Review is a check by volunteers, not an investigation.
          Approval carries no warranty.
        </p>
        <p>
          Your confirmation email contains a private link for editing your listing. Treat it as
          you would a password, since anyone holding it can change the listing. Tell us if it
          goes astray and we will issue a new one.
        </p>
      </Section>

      <Section heading="Things you must not do">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            post anything misleading, fraudulent, or designed to harvest personal information;
          </li>
          <li>
            advertise multi-level marketing, commission-only schemes presented as salaried
            employment, or &ldquo;opportunities&rdquo; that require an upfront payment;
          </li>
          <li>post anything unlawful, defamatory, or that infringes someone else&apos;s rights;</li>
          <li>
            submit listings through automated means, or attempt to get around the submission
            limits on the form;
          </li>
          <li>
            scrape, copy or republish the board in bulk, or interfere with how the site runs.
          </li>
        </ul>
      </Section>

      <Section heading="Content and ownership">
        <p>
          You keep ownership of what you submit. By submitting it you give MMSS permission to
          display, edit for presentation, and archive it in connection with the Job Board.
        </p>
        <p>
          The design, code, and the MMSS name and logo belong to MMSS.
        </p>
      </Section>

      <Section heading="Availability and liability">
        <p>
          The board is provided as-is. It is run by volunteers alongside their studies, and we
          do not promise uninterrupted availability or that every listing is current, accurate
          and complete.
        </p>
        <p>
          To the extent the law allows, MMSS and its committee members are not liable for loss
          arising from your use of the board, including anything following from an application
          you make, a hire you make, or a listing being wrong, removed or delayed. Nothing here
          excludes rights under the Australian Consumer Law that cannot be excluded.
        </p>
      </Section>

      <Section heading="Removing a listing">
        <p>
          Use the edit link in your confirmation email, or email{' '}
          <a
            href={`mailto:${PARTNERSHIPS_EMAIL}`}
            className="text-slate-900 underline underline-offset-2"
          >
            {PARTNERSHIPS_EMAIL}
          </a>{' '}
          and ask. We will take a listing down promptly on request from the organisation that
          posted it.
        </p>
      </Section>

      <Section heading="Changes and contact">
        <p>
          We may update these terms; the date at the top of this page shows when they last
          changed. These terms are governed by the laws of Victoria, Australia.
        </p>
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${CONTACT}`} className="text-slate-900 underline underline-offset-2">
            {CONTACT}
          </a>
          . See also our{' '}
          <Link href="/privacy" className="text-slate-900 underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
