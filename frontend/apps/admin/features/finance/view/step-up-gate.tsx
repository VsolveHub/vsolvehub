"use client";

import { ApiRequestError, request } from "@vsolve/api-client";
import {
  describeOtpFailure,
  formatToE164,
  isFirebasePhoneAuth,
  mapFirebaseError,
  sanitizeCodeInput,
  sanitizePhoneInput,
  startFirebasePhoneVerification,
  type OtpFailure,
} from "@vsolve/query";
import { Button, Card, ErrorState, Field, Input } from "@vsolve/ui";
import { useRef, useState } from "react";

import { getApiClient } from "@/lib/api/browser";

import {
  useConfirmFirebaseStepUp,
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
 * ## Two ways to send the code, one stamp
 *
 * Django's own OTP (MSG91) or Firebase, whichever `NEXT_PUBLIC_PHONE_AUTH_PROVIDER`
 * names — the same switch the sign-in screen follows (contract 1.77.0). Both end in
 * the same `stepped_up_at`; only the proof sent to Django differs.
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

      {isFirebasePhoneAuth() ? (
        <FirebaseStepUpForm onSteppedUp={onSteppedUp} />
      ) : (
        <OtpStepUpForm onSteppedUp={onSteppedUp} />
      )}
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

function PhoneStep({
  phone,
  onPhoneChange,
  phoneError,
  sending,
  onSend,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError?: string;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <div className="mt-4 max-w-sm">
      <Field
        label="Your mobile number"
        description="The number your Operations access was granted to."
        required
        error={phoneError}
      >
        <Input
          value={phone}
          inputMode="tel"
          autoComplete="tel"
          onChange={(event) => onPhoneChange(sanitizePhoneInput(event.target.value))}
        />
      </Field>
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
  onUseDifferentNumber,
}: {
  code: string;
  codeLength: number;
  onCodeChange: (value: string) => void;
  codeError?: string;
  confirming: boolean;
  onConfirm: () => void;
  onUseDifferentNumber: () => void;
}) {
  return (
    <div className="mt-4 max-w-sm">
      <Field
        label="The code we sent you"
        description={`${codeLength} digits.`}
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
        <Button variant="ghost" onClick={onUseDifferentNumber}>
          Use a different number
        </Button>
      </div>
    </div>
  );
}

/** Django issues and checks the code (`OTP_PROVIDER`, MSG91 in production). */
function OtpStepUpForm({ onSteppedUp }: { onSteppedUp: (session: StepUpSession) => void }) {
  const requestCode = useRequestStepUpCode();
  const confirm = useConfirmStepUp();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [codeLength, setCodeLength] = useState(6);

  const failure = requestCode.error ? describeOtpFailure(requestCode.error) : null;

  return (
    <>
      <FailureBanner failure={failure} />

      {challengeId === null ? (
        <PhoneStep
          phone={phone}
          onPhoneChange={setPhone}
          sending={requestCode.isPending}
          onSend={() =>
            requestCode.mutate(
              // `""` is the non-partner path, the same value `useOtpFlow`
              // sends when no role was asked for. An operator stepping up is
              // already signed in as staff; this challenge re-proves the
              // person, and sending `"partner"` here would ask Django to
              // issue a code against a role they do not hold.
              { phone_number: phone, intended_role: "" },
              {
                onSuccess: (issued) => {
                  setChallengeId(issued.challenge_id);
                  setCodeLength(issued.code_length);
                  setCode("");
                },
              },
            )
          }
        />
      ) : (
        <CodeStep
          code={code}
          codeLength={codeLength}
          onCodeChange={setCode}
          codeError={
            confirm.isError
              ? "That code is not right, or it has expired. Ask for a new one."
              : undefined
          }
          confirming={confirm.isPending}
          onConfirm={() =>
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
          onUseDifferentNumber={() => {
            setChallengeId(null);
            setCode("");
            confirm.reset();
          }}
        />
      )}
    </>
  );
}

const FIREBASE_CODE_LENGTH = 6;

/**
 * Firebase sends and checks the code; Django checks the resulting ID token is
 * fresh, unspent and for the signed-in operator's own number.
 */
function FirebaseStepUpForm({ onSteppedUp }: { onSteppedUp: (session: StepUpSession) => void }) {
  const confirmStepUp = useConfirmFirebaseStepUp();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<OtpFailure | null>(null);
  // The confirm step Firebase handed back. Held in a ref: it is a capability for
  // this one attempt, not something to render.
  const confirmCodeRef = useRef<((code: string) => Promise<string>) | null>(null);

  const backToPhone = () => {
    confirmCodeRef.current = null;
    setAwaitingCode(false);
    setCode("");
    setCodeError(undefined);
  };

  const showFirebaseError = (error: unknown) => {
    const mapped = mapFirebaseError(error);
    if (mapped.target === "phone") setPhoneError(mapped.message);
    else if (mapped.target === "code") setCodeError(mapped.message);
    else
      setFailure(
        mapped.failure ?? {
          kind: "unexpected",
          title: "That did not go through",
          message: mapped.message,
          severity: "error",
          reference: null,
        },
      );
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    setFailure(null);
    setPhoneError(undefined);
    try {
      // Django's rate limit and grant check first, so a refused number costs no SMS.
      await request(() =>
        getApiClient().POST("/api/v1/auth/firebase/precheck/", {
          body: { phone_number: formatToE164(phone), intended_role: "operations" },
        }),
      );
    } catch (error) {
      setFailure(describeOtpFailure(error, "operations"));
      setSending(false);
      return;
    }
    try {
      confirmCodeRef.current = await startFirebasePhoneVerification(phone);
      setCode("");
      setAwaitingCode(true);
    } catch (error) {
      showFirebaseError(error);
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    const confirmCode = confirmCodeRef.current;
    if (!confirmCode || confirming) return;
    setConfirming(true);
    setFailure(null);
    setCodeError(undefined);

    let idToken: string;
    try {
      idToken = await confirmCode(code);
    } catch (error) {
      showFirebaseError(error);
      setConfirming(false);
      return;
    }

    confirmStepUp.mutate(idToken, {
      onSuccess: (stepped) => {
        backToPhone();
        onSteppedUp(stepped);
      },
      onError: (error) => {
        // The token is spent whatever Django said, so the next try needs a new code.
        backToPhone();
        setFailure(
          error instanceof ApiRequestError && error.status === 403
            ? {
                kind: "unexpected",
                title: "That is not your number",
                message:
                  "Confirm with the mobile number you signed in with. Nothing was confirmed.",
                severity: "error",
                reference: error.requestId,
              }
            : {
                kind: "unexpected",
                title: "We could not confirm it is you",
                message: "The code expired or was already used. Ask for a new one.",
                severity: "error",
                reference: error instanceof ApiRequestError ? error.requestId : null,
              },
        );
      },
      onSettled: () => setConfirming(false),
    });
  };

  return (
    <>
      <FailureBanner failure={failure} />

      {awaitingCode ? (
        <CodeStep
          code={code}
          codeLength={FIREBASE_CODE_LENGTH}
          onCodeChange={(value) => {
            setCode(value);
            setCodeError(undefined);
          }}
          codeError={codeError}
          confirming={confirming}
          onConfirm={() => void confirm()}
          onUseDifferentNumber={backToPhone}
        />
      ) : (
        <PhoneStep
          phone={phone}
          onPhoneChange={(value) => {
            setPhone(value);
            setPhoneError(undefined);
          }}
          phoneError={phoneError}
          sending={sending}
          onSend={() => void send()}
        />
      )}
    </>
  );
}
