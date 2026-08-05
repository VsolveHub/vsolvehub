"use client";

import { OperationsShell } from "@/features/session/operations-shell";
import { AvailabilityEditor } from "@/features/partner-availability/view/availability-editor";

/**
 * Partner availability, changed on the Partner's behalf.
 *
 * The last resort, not the normal path: Partners set their own hours in their
 * own app, where they can see what those hours currently are. This exists for
 * the cases where they cannot — a lost device, an account being recovered, a
 * Partner on the phone — and the screen is written to keep it that way.
 */
export default function PartnerAvailabilityPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Partner availability</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Rewrite a Partner&apos;s working week when they cannot do it themselves.
        You need the consent they gave for this, and it replaces everything they
        have.
      </p>

      <div className="mt-6 max-w-4xl">
        <AvailabilityEditor />
      </div>
    </OperationsShell>
  );
}
