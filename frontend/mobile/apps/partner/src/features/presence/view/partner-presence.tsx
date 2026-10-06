// Ported from frontend/apps/partner/features/presence/view/partner-presence.tsx
import { Text } from "@vsolve/mobile-ui";

import { usePartnerApplication } from "@/features/application/queries";
import { useApplicationReference } from "@/features/application/reference-queries";

import { PresencePanel } from "./presence-panel";

export function PartnerPresence({ variant = "default" }: { variant?: "default" | "driver" }) {
  const application = usePartnerApplication();
  const reference = useApplicationReference();

  if (application.isPending) {
    return <Text className="text-text-secondary">Loading your account…</Text>;
  }

  const accepted =
    application.data?.consents.find(
      (consent) =>
        consent.withdrawn_at === null &&
        reference.requiredConsents.some(
          (document) =>
            document.purpose === consent.purpose && document.document_version === consent.document_version,
        ),
    ) ?? null;

  return <PresencePanel consentVersion={accepted?.document_version ?? null} variant={variant} />;
}
