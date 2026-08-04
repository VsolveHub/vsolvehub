"use client";

import { Spinner } from "@vsolve/ui";

import { usePartnerApplication } from "@/features/application/queries";
import { ApprovalRequired } from "@/features/application/view/approval-required";

import { OfferInbox } from "./offer-inbox";

/**
 * Offers, behind approval.
 *
 * The session, the Partner role and every recovery from either now belong to
 * `PartnerShell` in this route's layout. Approval is still checked here because
 * Django's offer list is `IsPartnerUser` and answers an empty page to an
 * unapproved applicant: rendering "no offers right now" to someone whose
 * application is still in review is accurate and misleading at once.
 */
export function OffersGate() {
  const application = usePartnerApplication();
  const isApproved = application.data?.status === "APPROVED";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-text">Your offers</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Each offer is one visit. Accepting gives you two minutes to change your mind at no
        cost.
      </p>

      <div className="mt-6">
        {application.isPending ? (
          <p className="flex items-center gap-2 text-text-secondary">
            <Spinner size="sm" />
            Loading your account…
          </p>
        ) : isApproved ? (
          <OfferInbox />
        ) : (
          <ApprovalRequired detail="Offers start arriving once a reviewer has approved your application. This is not the same as there being no work — nothing is being offered to you yet." />
        )}
      </div>
    </main>
  );
}
