"use client";

import { Badge, Button, Card, ErrorState, Field, Input } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { isConsentPurpose, isUuid, maskId } from "@/features/shared/identifiers";
import {
  isInProgress,
  isKeyReused,
  isUnknownSubject,
  useCreateAssistedCheckout,
  type AssistedCheckoutInput,
} from "../queries";

/**
 * Starting a checkout for a Customer who is not at the keyboard.
 *
 * ## Confirm before, not undo after
 *
 * There is no published command that reverses an assisted checkout, so the
 * operator reads back what they are about to do — which Customer, which quote,
 * under which consent — and presses a second, differently worded button. The
 * form and the commitment are separate steps because typing an id and
 * committing somebody to a purchase are separate decisions.
 *
 * ## Consent is named, never defaulted
 *
 * Both consent fields start empty. Prefilling them would make the console assert
 * a consent nobody took, on a record that exists specifically to prove one was.
 *
 * ## Ids are masked once entered
 *
 * The confirmation quotes the last segment of each id rather than the whole
 * thing. Enough to recognise the record you just typed; not enough to be a
 * useful thing to photograph.
 */

const EMPTY: AssistedCheckoutInput = {
  customerId: "",
  quoteId: "",
  consentPurpose: "",
  consentVersion: "",
};

function validate(input: AssistedCheckoutInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isUuid(input.customerId)) {
    errors.customerId = "Paste the Customer's id from the case you are working.";
  }
  if (!isUuid(input.quoteId)) {
    errors.quoteId = "Paste the quote id the Customer agreed to.";
  }
  if (!isConsentPurpose(input.consentPurpose)) {
    errors.consentPurpose =
      "Use the purpose exactly as it is recorded — letters, numbers, hyphens and underscores only.";
  }
  if (input.consentVersion.trim() === "" || input.consentVersion.trim().length > 100) {
    errors.consentVersion = "Name the version of the consent document they were read.";
  }

  return errors;
}

function CheckoutResult({ checkout }: { checkout: Schemas["Checkout"] }) {
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-text">Checkout for this quote</h3>
        <Badge
          tone={
            checkout.status === "CANCELLED" || checkout.status === "EXPIRED"
              ? "danger"
              : checkout.status === "COMPLETED"
                ? "success"
                : "info"
          }
        >
          {checkout.status.toLowerCase().replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        Reference <span data-numeric>{maskId(checkout.id)}</span> · expires{" "}
        <time dateTime={checkout.expires_at} data-numeric>
          {new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }).format(new Date(checkout.expires_at))}
        </time>
      </p>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        The Customer pays from their own account. Send them to their bookings —
        this console does not take payment on their behalf.
      </p>
    </Card>
  );
}

export function AssistedCheckoutForm() {
  const [input, setInput] = useState<AssistedCheckoutInput>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const create = useCreateAssistedCheckout();

  const errors = validate(input);
  const hasErrors = Object.keys(errors).length > 0;

  function set<K extends keyof AssistedCheckoutInput>(key: K, value: string) {
    setInput((current) => ({ ...current, [key]: value }));
    // Editing after a refusal must not leave the old outcome on screen next to
    // new inputs it no longer describes.
    if (create.isError || create.isSuccess) create.reset();
    setConfirming(false);
  }

  return (
    <div>
      <Card className="p-5">
        <h2 className="text-base font-bold text-text">Start a checkout for a Customer</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Use this only when you have already taken the Customer&apos;s consent
          for this booking. The checkout is recorded as assisted, with your
          account and their consent against it.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Customer id"
            required
            error={submitted ? errors.customerId : undefined}
          >
            <Input
              value={input.customerId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => set("customerId", event.target.value)}
            />
          </Field>

          <Field label="Quote id" required error={submitted ? errors.quoteId : undefined}>
            <Input
              value={input.quoteId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => set("quoteId", event.target.value)}
            />
          </Field>

          <Field
            label="Consent purpose"
            description="As recorded when they agreed, for example assisted-booking."
            required
            error={submitted ? errors.consentPurpose : undefined}
          >
            <Input
              value={input.consentPurpose}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => set("consentPurpose", event.target.value)}
            />
          </Field>

          <Field
            label="Consent document version"
            description="The version they were read."
            required
            error={submitted ? errors.consentVersion : undefined}
          >
            <Input
              value={input.consentVersion}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => set("consentVersion", event.target.value)}
            />
          </Field>
        </div>

        {!confirming ? (
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setSubmitted(true);
              if (!hasErrors) setConfirming(true);
            }}
          >
            Review this checkout
          </Button>
        ) : null}
      </Card>

      {confirming ? (
        <Card className="mt-5 p-5">
          <h3 className="text-base font-bold text-text">Confirm before you commit them</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-text-muted">Customer</dt>
            <dd className="text-text" data-numeric>
              {maskId(input.customerId)}
            </dd>
            <dt className="text-text-muted">Quote</dt>
            <dd className="text-text" data-numeric>
              {maskId(input.quoteId)}
            </dd>
            <dt className="text-text-muted">Consent</dt>
            <dd className="text-text">
              {input.consentPurpose.trim()}, version {input.consentVersion.trim()}
            </dd>
          </dl>

          <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
            This creates a checkout in the Customer&apos;s name. There is no
            command in this console that undoes it — the Customer cancels from
            their own bookings.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => create.mutate(input)}
              loading={create.isPending}
              loadingLabel="Starting the checkout"
            >
              Start checkout for this Customer
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </div>
        </Card>
      ) : null}

      {create.isError ? (
        <ErrorState
          className="mt-5"
          severity={isInProgress(create.error) ? "warning" : "error"}
          title={
            isInProgress(create.error)
              ? "This checkout is still being processed"
              : isUnknownSubject(create.error)
                ? "We could not find that Customer or quote"
                : isKeyReused(create.error)
                  ? "Those details do not match the earlier attempt"
                  : "We could not start the checkout"
          }
          message={
            isInProgress(create.error)
              ? "An identical request for this Customer and quote has not finished. Wait, then check their bookings before trying again — do not start a second one."
              : isUnknownSubject(create.error)
                ? "Check both ids. Nothing was created."
                : isKeyReused(create.error)
                  ? "An earlier attempt for this Customer and quote used different details. Check their bookings for what already exists rather than sending this again."
                  : "Nothing was created. Check the details and try again."
          }
        />
      ) : null}

      {create.isSuccess ? <CheckoutResult checkout={create.data} /> : null}
    </div>
  );
}
