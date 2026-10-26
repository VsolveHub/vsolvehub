import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { LegalPage } from "@/components/legal-page";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage
      icon={FileText}
      tone="slate"
      title="Terms of Service"
      updated="July 2, 2026"
      intro="These Terms of Service (“Terms”) govern your registration and activity as a service partner on V Solve Hub. By creating a partner account and submitting your application, you agree to be bound by these Terms. Please read them carefully."
      sections={[
        {
          heading: "Eligibility",
          body: (
            <>
              <p>
                To become a partner you must be at least 18 years old, legally permitted to
                work in India, and able to provide valid government identification (including
                Aadhaar) for verification. You agree that all information you submit during
                onboarding is true, accurate, and current.
              </p>
            </>
          ),
        },
        {
          heading: "Independent Contractor Relationship",
          body: (
            <>
              <p>
                You provide services as an <strong>independent contractor</strong>, not as an
                employee, agent, or partner of V Solve Hub. Nothing in these Terms creates an
                employment relationship. You are responsible for your own taxes, tools, and any
                statutory registrations applicable to your trade.
              </p>
            </>
          ),
        },
        {
          heading: "Verification & KYC",
          body: (
            <>
              <p>
                Your account is reviewed by our team before activation. We may request, verify,
                approve, or reject the documents you upload (identity, trade certificates, bank
                details, and, for drivers, vehicle documents). We may keep your account in a
                pending or action-required state until verification is complete, and may
                suspend or reject accounts where documents cannot be verified.
              </p>
            </>
          ),
        },
        {
          heading: "Your Conduct & Service Standards",
          body: (
            <>
              <p>You agree to:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>perform services professionally, safely, and in line with applicable law;</li>
                <li>honour accepted jobs and communicate promptly with customers;</li>
                <li>not discriminate against customers or engage in harassment of any kind;</li>
                <li>not solicit customers to transact outside the platform; and</li>
                <li>keep your profile, skills, and service area accurate.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Payments, Commission & Payouts",
          body: (
            <>
              <p>
                Customer charges, platform commission, and your payout share are shown in the
                partner app and may be updated from time to time. Earnings are paid by bank
                transfer to the bank account you add in the partner app, after our team has
                verified it; a new or changed account is paid into only after a short cooling
                period. You are responsible for the accuracy of your payout information.
                V Solve Hub is not liable for payouts delayed or misdirected due to incorrect
                details supplied by you.
              </p>
            </>
          ),
        },
        {
          heading: "Ratings, Suspension & Termination",
          body: (
            <>
              <p>
                Your performance may be measured through customer ratings, acceptance, and
                completion history. We may suspend or deactivate your account for policy
                violations, repeated cancellations, safety concerns, fraud, or where required by
                law. You may stop offering services or request account closure at any time,
                subject to completing any jobs already in progress.
              </p>
            </>
          ),
        },
        {
          heading: "Prohibited Activity",
          body: (
            <>
              <p>
                You may not use the platform to engage in any unlawful, fraudulent, or unsafe
                activity, impersonate another person, submit forged documents, or interfere with
                the platform’s operation or security. Violations may result in immediate
                termination and may be reported to the authorities.
              </p>
            </>
          ),
        },
        {
          heading: "Limitation of Liability",
          body: (
            <>
              <p>
                The platform is provided on an “as is” basis. To the maximum extent permitted by
                law, V Solve Hub is not liable for indirect, incidental, or consequential
                damages arising from your use of the platform or your provision of services to
                customers. Nothing in these Terms limits liability that cannot be limited under
                applicable law.
              </p>
            </>
          ),
        },
        {
          heading: "Changes to These Terms",
          body: (
            <>
              <p>
                We may update these Terms from time to time. Material changes will be
                communicated through the partner app or by email. Your continued use of the
                platform after an update constitutes acceptance of the revised Terms.
              </p>
            </>
          ),
        },
        {
          heading: "Governing Law",
          body: (
            <>
              <p>
                These Terms are governed by the laws of India. Any disputes are subject to the
                exclusive jurisdiction of the courts at Hyderabad, Telangana.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
