import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LegalPage } from "@/components/legal-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      icon={ShieldCheck}
      tone="brand"
      title="Privacy Policy"
      updated="July 2, 2026"
      intro="This Privacy Policy explains how V Solve Hub collects, uses, and protects your personal information when you register and work as a service partner. We are committed to handling your data responsibly and in accordance with India’s Digital Personal Data Protection Act, 2023."
      sections={[
        {
          heading: "Information We Collect",
          body: (
            <>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Identity & contact:</strong> name, gender, phone number, and profile
                  photo.
                </li>
                <li>
                  <strong>KYC documents:</strong> Aadhaar, trade certificates, driving licence,
                  vehicle registration, and bank/UPI details.
                </li>
                <li>
                  <strong>Service data:</strong> skills, service area, ratings, jobs completed,
                  and earnings.
                </li>
                <li>
                  <strong>Location & device:</strong> approximate location used for job
                  matching, and basic device/usage data.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "How We Use Your Information",
          body: (
            <>
              <p>We use your information to:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>verify your identity and eligibility to work on the platform;</li>
                <li>match you with nearby jobs and enable customer bookings;</li>
                <li>process payouts and maintain earnings records;</li>
                <li>maintain safety, prevent fraud, and comply with legal obligations; and</li>
                <li>communicate service updates and support.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Sensitive Data & Encryption",
          body: (
            <>
              <p>
                Sensitive identifiers such as your Aadhaar and bank account number are encrypted
                before storage and are never displayed in full within the platform — only the
                last four digits are shown for reference. KYC files are stored in private,
                access-controlled storage and are viewable only by authorised reviewers through
                short-lived, expiring links.
              </p>
            </>
          ),
        },
        {
          heading: "How We Share Information",
          body: (
            <>
              <p>We share information only as necessary to operate the service:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Customers</strong> see limited profile details (name, photo, rating,
                  and trade) to complete a booking.
                </li>
                <li>
                  <strong>Verification and payment providers</strong> process KYC and payouts on
                  our behalf.
                </li>
                <li>
                  <strong>Authorities</strong> where disclosure is required by law or to protect
                  safety and rights.
                </li>
              </ul>
              <p>We do not sell your personal data.</p>
            </>
          ),
        },
        {
          heading: "Data Retention",
          body: (
            <>
              <p>
                We retain your information for as long as your account is active and thereafter
                only as required to meet legal, tax, accounting, and dispute-resolution
                obligations. When no longer required, data is deleted or anonymised.
              </p>
            </>
          ),
        },
        {
          heading: "Security",
          body: (
            <>
              <p>
                We apply administrative and technical safeguards — including encryption of
                sensitive fields, access controls, and audit logging of reviewer actions — to
                protect your data. No system is perfectly secure, but we work continuously to
                safeguard your information.
              </p>
            </>
          ),
        },
        {
          heading: "Your Rights",
          body: (
            <>
              <p>
                Subject to applicable law, you may request access to, correction of, or deletion
                of your personal data, and you may withdraw consent for optional processing. To
                exercise these rights, contact us using the details below. Some data may be
                retained where we are legally required to keep it.
              </p>
            </>
          ),
        },
        {
          heading: "Changes to This Policy",
          body: (
            <>
              <p>
                We may update this Policy from time to time. Material changes will be notified
                through the partner app or by email. The “last updated” date above reflects the
                most recent revision.
              </p>
            </>
          ),
        },
        {
          heading: "Contact & Grievances",
          body: (
            <>
              <p>
                For privacy questions or grievances, contact our grievance officer at{" "}
                <a href="mailto:privacy@vsolvehub.com">privacy@vsolvehub.com</a>. We aim to
                acknowledge and address requests within the timelines prescribed by applicable
                law.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
