import type { Metadata } from "next";
import { UserX } from "lucide-react";

import { LegalPage } from "@/components/legal-page";
import {
  PARTNER_SUPPORT_EMAIL,
  PARTNER_SUPPORT_HOURS,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
} from "@/features/support/contact";

/**
 * The public account-deletion page Google Play asks for: reachable without the app, naming the
 * app and the developer, showing the steps first, and saying what is deleted and what is kept.
 *
 * Every promise here is a rule in `backend/apps/identity/account_deletion.py`: the 30-day grace
 * period (`ACCOUNT_DELETION_GRACE_DAYS`), signing in again cancels, open bookings refuse the
 * request, unpaid earnings hold the deletion, and the list of what erasure removes. Change them
 * together.
 */

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How to delete your V Solve Hub Partner account, what we delete, and what the law requires us to keep.",
};

const EMAIL_SUBJECT = encodeURIComponent("Delete my V Solve Hub Partner account");

export default function DeleteAccountPage() {
  return (
    <LegalPage
      icon={UserX}
      tone="brand"
      title="Delete your account"
      updated="November 18, 2026"
      intro="This page explains how to delete your account in the V Solve Hub Partner app (by V Solve Hub), what happens after you ask, and which records Indian law requires us to keep. You can delete your account at any time. You do not need to give a reason."
      sections={[
        {
          heading: "Delete it in the app",
          body: (
            <ol className="list-decimal space-y-1 pl-5">
              <li>Open the V Solve Hub Partner app and sign in.</li>
              <li>
                Tap <strong>Me</strong>, then <strong>Delete account</strong>. If you are still
                applying, tap your profile picture at the top, then{" "}
                <strong>Delete account</strong>.
              </li>
              <li>
                Read what will happen, tap <strong>Delete my account</strong>, type{" "}
                <strong>DELETE</strong> and confirm.
              </li>
            </ol>
          ),
        },
        {
          heading: "Delete it on the website",
          body: (
            <p>
              If you are applying on the website, sign in at{" "}
              <a href="/login">partner.vsolvehub.com</a>, open your account menu at the top of the
              application and choose <strong>Delete account</strong>.
            </p>
          ),
        },
        {
          heading: "Can't open the app?",
          body: (
            <>
              <p>
                Call us on{" "}
                <a href={`tel:${PARTNER_SUPPORT_PHONE}`}>{PARTNER_SUPPORT_PHONE_DISPLAY}</a> (
                {PARTNER_SUPPORT_HOURS}), or email{" "}
                <a href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=${EMAIL_SUBJECT}`}>
                  {PARTNER_SUPPORT_EMAIL}
                </a>{" "}
                with the mobile number you registered with.
              </p>
              <p>
                We first confirm it is really you, for example by calling you back on that number.
                Then we file the request for you, and the same steps below apply.
              </p>
            </>
          ),
        },
        {
          heading: "What happens after you ask",
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Your account closes straight away.</strong> You are signed out on every
                phone and computer, and you stop getting job offers.
              </li>
              <li>
                <strong>It is deleted 30 days later.</strong> Changed your mind? Sign in again
                before then and your account stays exactly as it was.
              </li>
              <li>
                <strong>Open jobs come first.</strong> If you have a job that is booked or in
                progress, finish it, or call us to pass it to another partner, before you delete
                your account.
              </li>
              <li>
                <strong>You get paid first.</strong> If we still owe you earnings, we pay them to
                your bank account before the deletion goes ahead.
              </li>
            </ul>
          ),
        },
        {
          heading: "What we delete",
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>Your name, mobile number, email address and profile photo.</li>
              <li>
                Your ID and KYC documents, including the stored files, and your UPI ID and business
                name.
              </li>
              <li>
                Your saved addresses. Past bookings keep only the city and the general area.
              </li>
              <li>
                Your bank account is closed for payouts, your devices and notification settings
                are removed, and you are signed out everywhere.
              </li>
              <li>
                Your partner profile is taken down. Reviews you received stay on past jobs, shown
                as &ldquo;Deleted partner&rdquo;.
              </li>
            </ul>
          ),
        },
        {
          heading: "What we keep, and for how long",
          body: (
            <>
              <p>
                Indian tax and accounting law requires us to keep the record of work and money
                that went through the platform. We keep it without your name or number attached:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Jobs you did, the payments for them, invoices, and your payouts (amounts, dates,
                  and the last four digits of the bank account they went to): kept for up to 8
                  years, then deleted.
                </li>
                <li>
                  Records of the agreements you accepted, and security logs of who opened your
                  account: kept as evidence for as long as the law requires.
                </li>
              </ul>
              <p>
                We also keep a request on hold, and tell you why, if a dispute, a payment or a legal
                request about your account is still open.
              </p>
            </>
          ),
        },
        {
          heading: "Questions",
          body: (
            <p>
              Write to{" "}
              <a href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=${EMAIL_SUBJECT}`}>
                {PARTNER_SUPPORT_EMAIL}
              </a>
              . Our <a href="/privacy">Privacy Policy</a> explains everything else we do with your
              data.
            </p>
          ),
        },
      ]}
    />
  );
}
