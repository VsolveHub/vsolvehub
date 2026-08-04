"use client";

import { Spinner } from "@vsolve/ui";

import { usePartnerApplication } from "@/features/application/queries";
import { ApprovalRequired } from "@/features/application/view/approval-required";

import { PartnerPresence } from "./partner-presence";

/**
 * Availability, behind approval.
 *
 * The session, the Partner role and every recovery from either now belong to
 * `PartnerShell` in this route's layout. What is left here is the one question
 * the shell cannot answer: Django's presence endpoints fail closed for an
 * unapproved Partner, so showing the control to someone who cannot use it would
 * produce a refusal they have no way to act on.
 */
export function PresenceGate() {
  const application = usePartnerApplication();
  const isApproved = application.data?.status === "APPROVED";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold text-text">Your availability</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        You are only offered work while you are online.
      </p>

      <div className="mt-6">
        {application.isPending ? (
          <p className="flex items-center gap-2 text-text-secondary">
            <Spinner size="sm" />
            Loading your account…
          </p>
        ) : isApproved ? (
          <PartnerPresence />
        ) : (
          <ApprovalRequired detail="Going online opens once a reviewer has approved your application. Nothing is waiting on you here." />
        )}
      </div>
    </main>
  );
}
