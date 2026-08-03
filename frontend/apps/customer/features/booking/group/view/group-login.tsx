"use client";

import { useOtpFlow } from "@vsolve/query";
import { Button, ErrorState, OtpForm, Spinner } from "@vsolve/ui";

import { getApiClient } from "@/lib/api/browser";
import { useCustomerSession } from "@/features/session/queries";

/**
 * The login interrupt for the group booking flow.
 *
 * Same shared `useOtpFlow` machine and `OtpForm` as everywhere else — the phase
 * handling, countdowns and per-number cooldown are not reimplemented here. What
 * differs is only what happens afterwards: the anonymous cart has to be merged
 * into the account's, and that is a server decision, so this component reports
 * authentication and lets the workspace re-read the cart.
 */

export interface GroupLoginProps {
  /** Shown so the customer can see the booking survived. */
  itemCount: number;
  onAuthenticated: () => void;
  onCancel: () => void;
}

export function GroupLogin({ itemCount, onAuthenticated, onCancel }: GroupLoginProps) {
  const session = useCustomerSession();
  const flow = useOtpFlow(getApiClient(), { onAuthenticated });

  return (
    <div>
      <h2 className="text-lg font-bold text-text">Log in to continue</h2>
      <p className="mt-1.5 max-w-prose text-sm text-text-secondary">
        We need an account to save the service address and to tell you which
        professionals are coming.
      </p>

      {itemCount > 0 ? (
        <p className="mt-4 rounded-card border border-line bg-surface p-4 text-sm text-text">
          Your {itemCount} {itemCount === 1 ? "service is" : "services are"} saved —
          nothing here is lost.
        </p>
      ) : null}

      <div className="mt-6">
        {session.isResolving ? (
          <p className="flex items-center gap-2 py-4 text-text-secondary">
            <Spinner size="sm" />
            Checking whether you are already logged in…
          </p>
        ) : session.isAuthenticated ? (
          // Reachable when the customer logged in from another tab. Asking for a
          // code they do not need would spend one of the five Django allows.
          <div>
            <p className="text-sm text-text-secondary">Logged in as</p>
            <p data-numeric className="text-base font-semibold text-text">
              {session.phoneNumber}
            </p>
            <Button className="mt-3" onClick={onAuthenticated}>
              Continue
            </Button>
          </div>
        ) : session.isUnavailable ? (
          <ErrorState
            title="We could not check your account"
            message="Nothing has been lost. Check your connection and try again."
            actionLabel="Try again"
            onAction={session.refetch}
          />
        ) : (
          <OtpForm
            {...flow}
            heading="Enter your mobile number"
            headingLevel={3}
            description="We will text you a code. No password to remember."
            verifyLabel="Verify and continue"
          />
        )}
      </div>

      <div className="mt-6">
        <Button variant="ghost" className="px-0" onClick={onCancel}>
          Back to my booking
        </Button>
      </div>
    </div>
  );
}
