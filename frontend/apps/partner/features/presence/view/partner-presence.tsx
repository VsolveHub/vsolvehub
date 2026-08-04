"use client";

import { Spinner } from "@vsolve/ui";

import { usePartnerApplication } from "@/features/application/queries";
import { useApplicationReference } from "@/features/application/reference-queries";

import { PresencePanel } from "./presence-panel";

/**
 * The presence control, wired to the consent the Partner actually gave.
 *
 * Going online records a location against a consent receipt, so the version sent
 * has to be the one on file rather than the newest published — those differ
 * exactly when legal text was republished and the Partner has not re-accepted,
 * which is the case where guessing would attach a location to an agreement
 * nobody signed.
 *
 * Its own component because both `/availability` and the signed-in home show
 * this control. The lookup lived inside the availability screen when that was
 * the only caller; a second copy on the home would have been a second chance to
 * get the version wrong.
 */
export function PartnerPresence() {
  const application = usePartnerApplication();
  const reference = useApplicationReference();

  if (application.isPending) {
    return (
      <p className="flex items-center gap-2 text-text-secondary">
        <Spinner size="sm" />
        Loading your account…
      </p>
    );
  }

  const accepted =
    application.data?.consents.find(
      (consent) =>
        consent.withdrawn_at === null &&
        reference.requiredConsents.some(
          (document) =>
            document.purpose === consent.purpose &&
            document.document_version === consent.document_version,
        ),
    ) ?? null;

  return <PresencePanel consentVersion={accepted?.document_version ?? null} />;
}
