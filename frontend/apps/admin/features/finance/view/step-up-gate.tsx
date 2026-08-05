"use client";

import { describeOtpFailure, sanitizeCodeInput, sanitizePhoneInput } from "@vsolve/query";
import { Button, Card, ErrorState, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { useConfirmStepUp, useRequestStepUpCode, type StepUpSession } from "../queries";

/**
 * Confirming who you are before money moves.
 *
 * ## Why this does not gate the commands itself
 *
 * `HasRecentFinanceStepUp` compares `UserSession.stepped_up_at` against
 * `FINANCE_STEP_UP_TTL_SECONDS`, and that TTL is not published in the contract.
 * A countdown here would be a number this component invented about an
 * authorization decision, and it would be wrong in the direction that matters:
 * an operator watching "4 minutes left" while Django has already refused.
 *
 * So this component records the step-up and reports the instant Django stamped,
 * and nothing else. The refund commands stay available, and a `403` from one of
 * them is what brings the operator back here. The server is asked; the client
 * does not keep its own copy of the answer.
 *
 * ## The code is never stored
 *
 * It lives in component state for the length of the attempt and is cleared the
 * moment it is spent. Same rule as `useOtpFlow`, for the same reason.
 */

export function StepUpGate({
  session,
  onSteppedUp,
  reason,
}: {
  /** The last step-up Django confirmed in this browser, if any. */
  session: StepUpSession | null;
  onSteppedUp: (session: StepUpSession) => void;
  /** Why the operator is being asked, when a command sent them here. */
  reason?: string;
}) {
  const requestCode = useRequestStepUpCode();
  const confirm = useConfirmStepUp();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [codeLength, setCodeLength] = useState(6);

  const failure = requestCode.error ? describeOtpFailure(requestCode.error) : null;

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Confirm it is you</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Refunds and reconciliation need a fresh confirmation, separate from
        signing in. It lapses on its own after a while — how long is the
        server&apos;s decision, so this screen does not count it down. If a
        command is refused, confirm again here.
      </p>

      {reason ? (
        <ErrorState
          inline
          className="mt-4"
          severity="warning"
          title="Confirm again to continue"
          message={reason}
        />
      ) : null}

      {session ? (
        <p className="mt-4 text-sm text-text-secondary">
          Last confirmed{" "}
          <time dateTime={session.stepped_up_at} data-numeric>
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(session.stepped_up_at))}
          </time>
          .
        </p>
      ) : null}

      {failure ? (
        <ErrorState
          inline
          className="mt-4"
          severity={failure.severity}
          title={failure.title}
          message={failure.message}
          reference={failure.reference ?? undefined}
        />
      ) : null}

      {challengeId === null ? (
        <div className="mt-4 max-w-sm">
          <Field
            label="Your mobile number"
            description="The number your Finance access was granted to."
            required
          >
            <Input
              value={phone}
              inputMode="tel"
              autoComplete="tel"
              onChange={(event) => setPhone(sanitizePhoneInput(event.target.value))}
            />
          </Field>
          <Button
            className="mt-4"
            loading={requestCode.isPending}
            loadingLabel="Sending a code"
            onClick={() =>
              requestCode.mutate(
                { phone_number: phone },
                {
                  onSuccess: (issued) => {
                    setChallengeId(issued.challenge_id);
                    setCodeLength(issued.code_length);
                    setCode("");
                  },
                },
              )
            }
          >
            Send me a code
          </Button>
        </div>
      ) : (
        <div className="mt-4 max-w-sm">
          <Field
            label="The code we sent you"
            description={`${codeLength} digits.`}
            required
            error={
              confirm.isError
                ? "That code is not right, or it has expired. Ask for a new one."
                : undefined
            }
          >
            <Input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              data-numeric
              onChange={(event) => setCode(sanitizeCodeInput(event.target.value, codeLength))}
            />
          </Field>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={code.length !== codeLength}
              loading={confirm.isPending}
              loadingLabel="Confirming"
              onClick={() =>
                confirm.mutate(
                  { challengeId, phoneNumber: phone, code },
                  {
                    onSuccess: (stepped) => {
                      // Single-use and now spent.
                      setCode("");
                      setChallengeId(null);
                      onSteppedUp(stepped);
                    },
                  },
                )
              }
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setChallengeId(null);
                setCode("");
                confirm.reset();
              }}
            >
              Use a different number
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
