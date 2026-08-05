"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Readout, formatMoney } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { isUuid, maskId } from "@/features/shared/identifiers";
import {
  isNotOfferable,
  isUnknownTarget,
  useCreateManualOffer,
  type ManualOfferInput,
  type OfferTarget,
} from "../queries";

/**
 * Offering work to a named Partner.
 *
 * ## What the Partner will see is what is shown back
 *
 * The created offer is rendered from the server's own projection — the same
 * approximate area, service lines and money the Partner's inbox will show. The
 * console does not re-derive or enrich any of it. The projection withholds the
 * exact address on purpose; reconstructing it here would undo a privacy decision
 * made deliberately upstream.
 *
 * ## The wording never promises an assignment
 *
 * Operations offers; the Partner decides. Every label on this screen says
 * "offer", including the success state, so nobody tells a waiting Customer that
 * their job is booked when it is pending somebody else's answer.
 */

const TARGETS: { value: OfferTarget; label: string; description: string }[] = [
  {
    value: "checkout",
    label: "A whole checkout",
    description: "Offers every unit of the booking to this Partner.",
  },
  {
    value: "fulfilment-unit",
    label: "One fulfilment unit",
    description: "Offers a single visit within a booking.",
  },
];

const EMPTY: ManualOfferInput = { target: "checkout", targetId: "", partnerId: "" };

function validate(input: ManualOfferInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isUuid(input.targetId)) {
    errors.targetId =
      input.target === "checkout" ? "Paste the checkout id." : "Paste the fulfilment unit id.";
  }
  if (!isUuid(input.partnerId)) {
    errors.partnerId = "Paste the Partner's id.";
  }
  return errors;
}

const TIME = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function OfferResult({ offer }: { offer: Schemas["Offer"] }) {
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-text">Offer sent</h3>
        <Badge tone={offer.status === "OFFERED" ? "info" : "neutral"}>
          {offer.status.toLowerCase().replace(/_/g, " ")}
        </Badge>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        Reference <span data-numeric>{maskId(offer.id)}</span>
        {offer.approximate_area ? ` · ${offer.approximate_area}` : ""}
      </p>

      <p className="mt-3 text-sm leading-6 text-text-secondary">
        The Partner has until{" "}
        <time dateTime={offer.expires_at} data-numeric>
          {TIME.format(new Date(offer.expires_at))}
        </time>{" "}
        to accept. They may also decline, or let it lapse — this is not an
        assignment yet.
      </p>

      {offer.estimated_net ? (
        <div className="mt-4">
          <Readout
            label="Partner earns, estimated"
            value={formatMoney(offer.estimated_net.amount_paise)}
            size="sm"
          />
        </div>
      ) : null}

      {offer.service_lines.length > 0 ? (
        <ul className="mt-4 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
          {offer.service_lines.map((line) => (
            <li key={line.line_id}>
              {line.service_label} × <span data-numeric>{line.quantity}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function ManualOfferForm() {
  const [input, setInput] = useState<ManualOfferInput>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const create = useCreateManualOffer();

  const errors = validate(input);

  function set<K extends keyof ManualOfferInput>(key: K, value: ManualOfferInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    if (create.isError || create.isSuccess) create.reset();
  }

  return (
    <div>
      <Card className="p-5">
        <h2 className="text-base font-bold text-text">Offer work to a Partner</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Use this when automatic dispatch cannot place a job, or a Customer asked
          for a specific Partner. The Partner still has to accept.
        </p>

        <fieldset className="mt-4 border-0 p-0">
          <legend className="text-sm font-semibold text-text">What are you offering?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {TARGETS.map((entry) => (
              <label
                key={entry.value}
                className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface p-3"
              >
                <input
                  type="radio"
                  name="offer-target"
                  className="mt-1"
                  checked={input.target === entry.value}
                  onChange={() => set("target", entry.value)}
                />
                <span>
                  <span className="block text-sm font-semibold text-text">{entry.label}</span>
                  <span className="block text-sm text-text-secondary">{entry.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label={input.target === "checkout" ? "Checkout id" : "Fulfilment unit id"}
            required
            error={submitted ? errors.targetId : undefined}
          >
            <Input
              value={input.targetId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => set("targetId", event.target.value)}
            />
          </Field>

          <Field label="Partner id" required error={submitted ? errors.partnerId : undefined}>
            <Input
              value={input.partnerId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => set("partnerId", event.target.value)}
            />
          </Field>
        </div>

        <Button
          className="mt-4"
          loading={create.isPending}
          loadingLabel="Sending the offer"
          onClick={() => {
            setSubmitted(true);
            if (Object.keys(errors).length === 0) create.mutate(input);
          }}
        >
          Send offer
        </Button>
      </Card>

      {create.isError ? (
        <ErrorState
          className="mt-5"
          severity={isNotOfferable(create.error) ? "warning" : "error"}
          title={
            isUnknownTarget(create.error)
              ? "We could not find that work or Partner"
              : isNotOfferable(create.error)
                ? "This work cannot be offered right now"
                : "We could not send the offer"
          }
          message={
            isUnknownTarget(create.error)
              ? "Check both ids against the case you are working. No offer was sent."
              : isNotOfferable(create.error)
                ? "It may already be assigned, cancelled or offered to someone else. No offer was sent — check its current state before trying again."
                : "No offer was sent. Check your connection and try again."
          }
        />
      ) : null}

      {create.isSuccess ? <OfferResult offer={create.data} /> : null}
    </div>
  );
}
