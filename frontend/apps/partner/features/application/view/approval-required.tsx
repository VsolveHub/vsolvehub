"use client";

import { Card, useT } from "@vsolve/ui";
import Link from "next/link";

/**
 * What a Partner sees where work would be, before a reviewer has approved them.
 *
 * One component for offers and availability alike, because the mistake it
 * prevents is the same on both: Django's offer list answers an empty page to an
 * unapproved applicant, and "no offers right now" is technically accurate and
 * completely misleading — it reads as "no work available" rather than "you
 * cannot receive work yet".
 *
 * The second sentence is a prop rather than shared copy. Offers and going online
 * open at the same moment but fail differently until then, and flattening both
 * into one generic line is how a screen stops answering the question the person
 * actually has.
 */
export function ApprovalRequired({ detail }: { detail: string }) {
  const t = useT();
  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">{t("apply.approvalRequired.heading")}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{detail}</p>
      <Link
        href="/apply"
        className="mt-4 inline-flex min-h-11 items-center font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        {t("apply.approvalRequired.cta")}
      </Link>
    </Card>
  );
}
