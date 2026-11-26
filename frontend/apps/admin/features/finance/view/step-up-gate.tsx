"use client";

import {
  describeOtpFailure,
  sanitizeCodeInput,
  useCurrentSession,
  type OtpFailure,
} from "@vsolve/query";
import { Button, Card, ErrorState, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";

import {
  isStepUpIdentityMismatch,
  useConfirmStepUp,
  useRequestStepUpCode,
  type StepUpSession,
} from "../queries";

/**
 * Confirming who you are before money moves.
 *
 * ## Why this does not gate the commands itself
 *
 * `HasRecentOperationsStepUp` compares `UserSession.stepped_up_at` against
 * `OPERATIONS_STEP_UP_TTL_SECONDS`, and that TTL is not published in the contract.
 * A countdown here would be a number this component invented about an
 * authorization decision, and it would be wrong in the direction that matters:
 * an operator watching "4 minutes left" while Django has already refused.
 *
 * So this component records the step-up and reports the instant Django stamped,
 * and nothing else. The refund commands stay available, and a `403` from one of
 * them is what brings the operator back here. The server is asked; the client
 * does not keep its own copy of the answer.
 *
 * ## Always the signed-in person's own number
 *
 * Nobody types a number here. The form asks for a code without one and Django sends it (MSG91)
 * to the account's own number. A code for anyone else proves nothing about the person signed
 * in, and used to be refused as if the code itself were wrong (contract 1.114.0).
 *
 * ## The code is never stored
 *
 * It lives in component state for the length of the attempt and is cleared the
 * moment it is spent. Same rule as `useOtpFlow`, for the same reason.
 */

function formatStamp(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/**
 * The same check as one line, for screens where it sits above every tab. It opens itself when
 * a command was refused for want of it, and otherwise stays out of the way until asked.
 */
export function CompactStepUpGate({
  session,
  onSteppedUp,
  reason,
}: {
  session: StepUpSession | null;
  onSteppedUp: (session: StepUpSession) => void;
  reason?: string;
}) {
  const [opened, setOpened] = useState(false);
  const open = opened || Boolean(reason);

  return (
    <Card className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {session ? (
            <>
              <span className="font-semibold text-success-text">✓ Confirmed it is you</span> at{" "}
              <time dateTime={session.stepped_up_at} data-numeric>
                {formatStamp(session.stepped_up_at)}
              </time>
              . Approving and paying will work until it lapses.
            </>
          ) : (
            <>
              <span className="font-semibold text-text">Approving, paying and correcting</span>{" "}
              need a quick code to confirm it is you.
            </>
          )}
        </p>
        {!open ? (
          <Button size="sm" variant={session ? "ghost" : "primary"} onClick={() => setOpened(true)}>
            {session ? "Confirm again" : "Confirm it is you"}
          </Button>
        ) : reason ? null : (
          <Button size="sm" variant="ghost" onClick={() => setOpened(false)}>
            Not now
          </Button>
        )}
      </div>
      {reason ? (
        <ErrorState
          inline
          className="mt-3"
          severity="warning"
          title="Confirm again to continue"
          message={reason}
        />
      ) : null}
      {open ? (
        <OtpStepUpForm
          onSteppedUp={(stepped) => {
            setOpened(false);
            onSteppedUp(stepped);
          }}
        />
      ) : null}
    </Card>
  );
}

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

      <OtpStepUpForm onSteppedUp={onSteppedUp} />
    </Card>
  );
}

function FailureBanner({ failure }: { failure: OtpFailure | null }) {
  if (!failure) return null;
  return (
    <ErrorState
      inline
      className="mt-4"
      severity={failure.severity}
      title={failure.title}
      message={failure.message}
      reference={failure.reference ?? undefined}
    />
  );
}

/** `+91 •••••• 0002`: enough to recognise your own number, not enough to read it out. */
export function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 3)} •••••• ${phone.slice(-4)}` : "••••";
}

/** The signed-in operator's own number, from the session Django already holds. */
function useOwnPhone(): { phone: string | null; loading: boolean } {
  const session = useCurrentSession(getApiClient());
  return { phone: session.data?.user?.phone_number || null, loading: session.isPending };
}

function SendStep({
  maskedPhone,
  sending,
  onSend,
}: {
  maskedPhone: string | null;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <div className="mt-4 max-w-sm">
      <p className="text-sm text-text-secondary">
        {maskedPhone ? (
          <>
            We will send a code to your number,{" "}
            <span data-numeric className="font-medium text-text">
              {maskedPhone}
            </span>
            .
          </>
        ) : (
          "We will send a code to the number you signed in with."
        )}
      </p>
      <Button className="mt-4" loading={sending} loadingLabel="Sending a code" onClick={onSend}>
        Send me a code
      </Button>
    </div>
  );
}

function CodeStep({
  code,
  codeLength,
  onCodeChange,
  codeError,
  confirming,
  onConfirm,
  onSendAgain,
  developmentCode,
}: {
  code: string;
  codeLength: number;
  onCodeChange: (value: string) => void;
  codeError?: string;
  confirming: boolean;
  onConfirm: () => void;
  onSendAgain: () => void;
  developmentCode?: string | null;
}) {
  return (
    <div className="mt-4 max-w-sm">
      <Field
        label="The code we sent you"
        description={`${codeLength} digits.${developmentCode ? ` Dev OTP: ${developmentCode}` : ""}`}
        required
        error={codeError}
      >
        <Input
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          data-numeric
          onChange={(event) => onCodeChange(sanitizeCodeInput(event.target.value, codeLength))}
        />
      </Field>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={code.length !== codeLength}
          loading={confirming}
          loadingLabel="Confirming"
          onClick={onConfirm}
        >
          Confirm
        </Button>
        <Button variant="ghost" onClick={onSendAgain}>
          Send a new code
        </Button>
      </div>
    </div>
  );
}

/** Django issues and checks the code (`OTP_PROVIDER`, MSG91 in production). */
function OtpStepUpForm({ onSteppedUp }: { onSteppedUp: (session: StepUpSession) => void }) {
  const requestCode = useRequestStepUpCode();
  const confirm = useConfirmStepUp();
  const own = useOwnPhone();

  const [code, setCode] = useState("");
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [codeLength, setCodeLength] = useState(6);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const failure = requestCode.error ? describeOtpFailure(requestCode.error) : null;

  const startOver = () => {
    setChallengeId(null);
    setCode("");
    setDevelopmentCode(null);
    confirm.reset();
  };

  return (
    <>
      <FailureBanner failure={failure} />

      {challengeId === null ? (
        <SendStep
          maskedPhone={sentTo ?? (own.phone ? maskPhone(own.phone) : null)}
          sending={requestCode.isPending}
          onSend={() =>
            requestCode.mutate(undefined, {
              onSuccess: (issued) => {
                setChallengeId(issued.challenge_id);
                setCodeLength(issued.code_length);
                setSentTo(issued.phone_number_masked);
                setDevelopmentCode(issued.development_code ?? null);
                setCode(issued.development_code ?? "");
              },
            })
          }
        />
      ) : (
        <CodeStep
          code={code}
          codeLength={codeLength}
          developmentCode={developmentCode}
          onCodeChange={setCode}
          codeError={
            confirm.isError
              ? isStepUpIdentityMismatch(confirm.error)
                ? "That confirmation was for a different number. Send a new code."
                : "That code is not right, or it has expired. Ask for a new one."
              : undefined
          }
          confirming={confirm.isPending}
          onConfirm={() =>
            confirm.mutate(
              { challengeId, code },
              {
                onSuccess: (stepped) => {
                  // Single-use and now spent.
                  startOver();
                  onSteppedUp(stepped);
                },
              },
            )
          }
          onSendAgain={startOver}
        />
      )}
    </>
  );
}
