"use client";

import { useOtpFlow } from "@vsolve/query";
import { Button, ErrorState, OtpForm, Spinner } from "@vsolve/ui";

import { getApiClient } from "@/lib/api/browser";
import { useCustomerSession } from "@/features/session/queries";

import { STAGE_LABELS, type Stage } from "../model/stages";
import { useWorkspace } from "./workspace-context";

/**
 * Login, reached as an interrupt rather than as a step.
 *
 * The customer is part-way through configuring a job when this appears, so the
 * screen's first job is to say that nothing has been lost. That sentence is not
 * decoration: without it, an unexpected login screen reads as "start again", and
 * the booking is abandoned at the one point where the customer has already done
 * all the work.
 *
 * Authentication itself is `useOtpFlow` + `OtpForm` from the shared packages —
 * there is no second implementation of the OTP flow here. This component only
 * decides what the login means *in a booking*: what is preserved, where the
 * customer goes back to, and what happens the moment Django issues a session.
 */

export interface LoginStageProps {
  /** Shown so the customer can see the booking is still there. */
  summary: readonly { label: string; value: string }[];
}

export function LoginStage({ summary }: LoginStageProps) {
  const { state, dispatch } = useWorkspace();
  const session = useCustomerSession();

  const flow = useOtpFlow(getApiClient(), {
    // The verify mutation writes the session into the cache and tells sibling
    // tabs; this returns the customer to what they were doing.
    onAuthenticated: () => dispatch({ type: "LOGIN_COMPLETED" }),
  });

  const returnTo: Stage = state.resumeStage ?? "address";

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Log in to continue</h2>
      <p className="mt-1.5 max-w-prose text-sm text-text-secondary">
        We need an account to save the service address and to tell you which
        professional is coming.
      </p>

      {summary.length > 0 ? (
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-text">
            Your booking is saved — nothing here is lost.
          </p>
          <dl className="mt-2 flex flex-col gap-1">
            {summary.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-text-secondary">{row.label}</dt>
                <dd className="min-w-0 text-right text-sm text-text">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="mt-6">
        {session.isResolving ? (
          <p className="flex items-center gap-2 py-4 text-text-secondary">
            <Spinner size="sm" />
            Checking whether you are already logged in…
          </p>
        ) : session.isAuthenticated ? (
          // Reachable when the customer logged in from another tab while this
          // one was waiting. Asking for a code they do not need would spend one
          // of the five Django allows per number.
          <div>
            <p className="text-sm text-text-secondary">Logged in as</p>
            <p data-numeric className="text-base font-semibold text-text">
              {session.phoneNumber}
            </p>
            <Button
              className="mt-3"
              onClick={() => dispatch({ type: "LOGIN_COMPLETED" })}
            >
              Continue to {STAGE_LABELS[returnTo].toLowerCase()}
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
        <Button variant="ghost" className="px-0" onClick={() => dispatch({ type: "BACK" })}>
          Back to {STAGE_LABELS[returnTo].toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

/**
 * The panel that raises the interrupt.
 *
 * Used wherever a stage needs a session it does not have — today the address
 * stage, which reads and writes `/api/v1/addresses/`, and the review stage when
 * a session ends mid-booking.
 */
export function LoginRequired({
  title,
  message,
  returnTo,
}: {
  title: string;
  message: string;
  returnTo: Stage;
}) {
  const { dispatch } = useWorkspace();

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="mt-1.5 max-w-prose text-sm text-text-secondary">{message}</p>
      <Button
        className="mt-4"
        onClick={() => dispatch({ type: "REQUIRE_LOGIN", returnTo })}
      >
        Log in
      </Button>
    </div>
  );
}
