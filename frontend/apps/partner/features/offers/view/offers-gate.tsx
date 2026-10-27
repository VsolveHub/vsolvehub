"use client";

import { Spinner, useT } from "@vsolve/ui";

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
  const t = useT();
  const application = usePartnerApplication();
  const isApproved = application.data?.status === "APPROVED";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold text-text">{t("offers.gate.title")}</h1>
      <p className="mt-1.5 text-sm leading-6 text-text-secondary">
        {t("offers.gate.subtitle")}
      </p>

      <div className="mt-5">
        {application.isPending ? (
          <p className="flex items-center gap-2 text-text-secondary">
            <Spinner size="sm" />
            {t("offers.gate.loading")}
          </p>
        ) : isApproved ? (
          <OfferInbox />
        ) : (
          <ApprovalRequired detail={t("offers.gate.approvalRequired")} />
        )}
      </div>
    </main>
  );
}
