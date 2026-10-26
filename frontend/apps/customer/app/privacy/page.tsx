import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, type LegalSection } from "@/features/legal/legal-document";
import { grievanceOfficerLabel, SUPPORT } from "@/lib/support";

export const metadata: Metadata = {
  title: "Privacy Policy | V Solve Hub",
  description:
    "What personal data V Solve Hub collects, why, who it is shared with, and your rights under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "26 October 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Account details:</strong> your mobile number, and your name and email if you
          add them.
        </li>
        <li>
          <strong>Addresses and location:</strong> the service addresses you save and the map pin
          you place, so we can check we serve the area and send a professional to the right door.
        </li>
        <li>
          <strong>Booking details:</strong> what you book, your answers about the job, photos you
          upload, scheduled times, and ratings and feedback you give.
        </li>
        <li>
          <strong>Payments:</strong> amounts, payment status and references. Card and UPI details
          are handled by Razorpay; we never receive your full card number or UPI PIN.
        </li>
        <li>
          <strong>Messages:</strong> what you send our support team, including through the contact
          form.
        </li>
        <li>
          <strong>Technical data:</strong> sign-in session cookies, device and browser type, and
          logs needed to keep the service secure and working.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To provide what you book: matching you with a professional, scheduling and the visit itself.</li>
        <li>To take payments, issue receipts and process refunds.</li>
        <li>To answer you when you contact support and to resolve complaints and disputes.</li>
        <li>To keep the platform safe, prevent fraud and enforce our terms.</li>
        <li>To meet legal obligations such as tax and accounting records.</li>
        <li>
          To send service messages about your bookings. We send promotional messages only with your
          consent, and you can withdraw it at any time.
        </li>
      </ul>
    ),
  },
  {
    id: "share",
    title: "Who we share it with",
    body: (
      <>
        <ul>
          <li>
            <strong>The professional on your booking</strong> sees what they need to do the job:
            your name, the service address and the job details, and can contact you about the visit.
          </li>
          <li>
            <strong>Service providers who run parts of the platform for us:</strong> Razorpay
            (payments and refunds), Google Firebase (sending sign-in codes), Google Maps (finding
            addresses from a map pin), Cloudflare (secure file storage) and our hosting provider.
            They may use your data only to provide their service to us.
          </li>
          <li>
            <strong>Authorities</strong>, when the law requires it or to protect someone&apos;s
            safety.
          </li>
        </ul>
        <p>We do not sell your personal data.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <p>
        We keep your data while your account is active and for as long as we need it for the
        purposes above. Booking, payment and invoice records are kept for as long as tax and
        accounting law requires. Everything else is deleted or anonymised once it is no longer
        needed.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        Data travels over encrypted connections. Uploaded documents are stored privately and opened
        only through short-lived links, access inside our team is limited to the people who need it,
        and sensitive actions such as refunds need an extra confirmation. No system is perfectly
        secure, and we will tell you and the authorities about a breach as the law requires.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
        <ul>
          <li>ask what personal data we hold about you and how we use it;</li>
          <li>ask us to correct, complete or update it;</li>
          <li>ask us to erase it, unless we must keep it by law;</li>
          <li>withdraw consent you have given, for the future;</li>
          <li>nominate someone to exercise these rights for you; and</li>
          <li>raise a grievance with us, and then with the Data Protection Board of India.</li>
        </ul>
        <p>
          Write to{" "}
          <a href={`mailto:${SUPPORT.email}?subject=Privacy%20request`}>{SUPPORT.email}</a> with
          &ldquo;Privacy request&rdquo; in the subject, from the email or phone number on your
          account so we can verify it is you.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        V Solve Hub is for adults. You must be 18 or over to create an account, and we do not
        knowingly collect data about children.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use cookies that are needed for the site to work: to keep you signed in and to protect
        your session and forms against misuse. We do not use them to show you advertising.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We will update this page when our practices change and tell you about material changes in
        the app or by message.
      </p>
    ),
  },
  {
    id: "grievances",
    title: "Contact and grievances",
    body: (
      <p>
        For privacy questions, requests or grievances, write to {grievanceOfficerLabel()} at{" "}
        <a href={`mailto:${SUPPORT.email}?subject=Grievance`}>{SUPPORT.email}</a>. We respond within
        the time the law allows. For anything else, see <Link href="/contact">Contact us</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <p>
          This policy explains what personal data V Solve Hub collects when you use our website and
          apps as a customer, why we collect it, who we share it with and the rights you have.
          Professionals using the partner app are covered by the partner privacy policy.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
