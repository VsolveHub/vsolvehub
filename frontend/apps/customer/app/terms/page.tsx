import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, type LegalSection } from "@/features/legal/legal-document";
import { grievanceOfficerLabel, SUPPORT } from "@/lib/support";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for using V Solve Hub to book home services, projects, crews, rentals and stays with verified professionals.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "26 October 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "about",
    title: "About V Solve Hub and these terms",
    body: (
      <>
        <p>
          V Solve Hub (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs the website www.vsolvehub.com and
          its apps, a marketplace that connects customers with independent, verified professionals
          for home services, custom projects, crews and day hire, equipment rentals, stays and job
          listings.
        </p>
        <p>
          By creating an account or making a booking you agree to these terms, our{" "}
          <Link href="/privacy">Privacy Policy</Link> and our{" "}
          <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>. If you do not agree,
          please do not use the platform.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>You sign in with your mobile number and a one-time code. There is no password.</li>
        <li>You must be at least 18 years old to book.</li>
        <li>
          Keep your details accurate, especially your phone number and service address, and keep
          your phone secure: you are responsible for bookings made from your account.
        </li>
      </ul>
    ),
  },
  {
    id: "booking",
    title: "How booking works",
    body: (
      <>
        <ul>
          <li>
            Prices are shown before you book. Depending on the service, that is a fixed price per
            task, a visit plan, a booking fee, or quotes from professionals. The platform fee, where
            one applies, is shown separately.
          </li>
          <li>
            Checking out does not charge you. Your request goes to verified professionals, and you
            pay once a professional has accepted every visit in your booking. If nobody accepts,
            nothing is charged.
          </li>
          <li>
            The professional who accepts carries out the work. Anything outside the booked scope is
            added only if you approve it in the app, at the published rate.
          </li>
          <li>
            A booking is confirmed only when the app shows it as confirmed. We may decline or cancel
            a request we cannot serve, in which case you are not charged or are refunded in full.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "payments",
    title: "Payments",
    body: (
      <ul>
        <li>
          Payments are processed securely by our payment partner, Razorpay. We never see or store
          your full card number or UPI PIN.
        </li>
        <li>All prices are in Indian rupees and include the platform fee shown at checkout.</li>
        <li>A receipt for every payment is available from your booking.</li>
        <li>
          For crew and day hire, daily wages are paid by you directly to the crew lead. Those
          payments are between you and the crew; V Solve Hub does not collect or hold them.
        </li>
        <li>
          Please do not pay a professional outside the app for work booked through it. Off-platform
          payments are not covered by our refunds, support or dispute process.
        </li>
      </ul>
    ),
  },
  {
    id: "cancellations",
    title: "Cancellations, rescheduling and refunds",
    body: (
      <p>
        What cancelling costs, when rescheduling is free and how refunds are paid are set out in
        our <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>, which forms part
        of these terms. The app always shows the exact fee and refund before you confirm a
        cancellation.
      </p>
    ),
  },
  {
    id: "your-responsibilities",
    title: "Your responsibilities",
    body: (
      <ul>
        <li>Give safe access to the service address at the booked time, or arrange someone to.</li>
        <li>Describe the job accurately; the price and the professional depend on it.</li>
        <li>Treat professionals with respect. Harassment or unsafe conduct ends access to the platform.</li>
        <li>Do not use the platform for anything unlawful or to book work that is unsafe.</li>
      </ul>
    ),
  },
  {
    id: "professionals",
    title: "Professionals and the quality of work",
    body: (
      <>
        <p>
          Professionals are independent and are not our employees. Before they can accept work
          they complete identity and document checks, and their work is rated by customers.
        </p>
        <p>
          If something is wrong with the work, report it from your booking or through{" "}
          <Link href="/contact">Contact us</Link> within 72 hours of completion. We review every
          report and may arrange a revisit or a refund under our Refund &amp; Cancellation Policy.
        </p>
      </>
    ),
  },
  {
    id: "reviews",
    title: "Ratings and reviews",
    body: (
      <p>
        Ratings help other customers and help us keep standards high, so please keep them honest
        and about the job. We may remove reviews that are abusive, off-topic or not based on a real
        booking.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility to you",
    body: (
      <>
        <p>
          We work hard to keep the platform available and accurate, but it is provided &ldquo;as
          is&rdquo;. To the extent the law allows, our total liability for any booking is limited to
          the amount you paid through the platform for that booking, and we are not liable for
          indirect or consequential loss.
        </p>
        <p>
          Nothing in these terms limits any right you have under the Consumer Protection Act, 2019
          or any liability that cannot be limited by law.
        </p>
      </>
    ),
  },
  {
    id: "suspension",
    title: "Suspending or closing an account",
    body: (
      <p>
        We may suspend or close an account involved in fraud, abuse, unsafe behaviour or repeated
        non-payment. You can stop using the platform at any time, and ask us to close your account
        by writing to <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>; bookings already in
        progress are completed or settled first.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. We will tell you about material changes in the app or by
        message before they take effect. Bookings already made keep the terms and prices that
        applied when you booked.
      </p>
    ),
  },
  {
    id: "law-and-grievances",
    title: "Governing law and grievances",
    body: (
      <>
        <p>
          These terms are governed by the laws of India, and the courts at Hyderabad, Telangana
          have exclusive jurisdiction.
        </p>
        <p>
          For any complaint, write to {grievanceOfficerLabel()} at{" "}
          <a href={`mailto:${SUPPORT.email}?subject=Grievance`}>{SUPPORT.email}</a>
          {SUPPORT.phone ? (
            <>
              {" "}
              or call <a href={SUPPORT.phone.telHref}>{SUPPORT.phone.display}</a>
            </>
          ) : null}
          . We acknowledge a grievance within 48 hours and aim to resolve it within one month, as
          the Consumer Protection (E-Commerce) Rules, 2020 require.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated={UPDATED}
      intro={
        <p>
          These terms explain how V Solve Hub works and what you and we can expect of each other
          when you book through the platform. Professionals who offer services on V Solve Hub agree
          to separate partner terms.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
