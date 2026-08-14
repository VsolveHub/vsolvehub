"use client";

import {
  describeError,
  isLifecycleUnsupported,
  isRateCardUnavailable,
  isRequirementDuplicate,
  isPresetIncomplete,
} from "@vsolve/query";
import { Button, ErrorState, Field, Input, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BROWSE_HREF, requestHref } from "@/lib/routes";
import {
  toQuestionSet,
  type RequirementService,
  type RequirementVariant,
} from "@/features/requirement/adapters";
import { useCreateRequirement, useSaveRequirement } from "@/features/requirement/queries";
import { toRateDisclosureView, toRateUnavailableView } from "../adapters";
import { clearBookAtRateKey, useBookAtPublishedRate, useRateCardState } from "../queries";
import { CrewAddressPicker } from "./crew-address-picker";
import { PresetQuestions, requiredAnswersPresent } from "./preset-questions";
import { RateDisclosure } from "./rate-disclosure";

/**
 * The A3 preset — `M2-FE-425`, and the rate it shows — `M2-FE-426`.
 *
 * One screen, opened by the catalog's **Book a crew** action. ADR-0009: what
 * this market sells is a commodity priced per worker per day at a street rate
 * everybody already knows, so a Customer asking for four helpers for two days of
 * shifting does not need three competing essays inside a 72-hour SLA and a
 * paywall to compare numbers the street already agrees on.
 *
 * ## This is deliberately not the four-screen flow
 *
 * The four screens remain the A5 shape and the A3 **fallback's**. This asks the
 * skill (chosen by the route), the headcount, the dates and the price-moving
 * facts, and then shows the published rate — nothing else, because the rate card
 * has already decided the price and the remaining unknowns are the ones that
 * move it.
 *
 * ## The rate is on screen before the booking, and it is never guessed
 *
 * Two steps in one screen. The form writes a **draft** — free, charged nothing,
 * abandonable — and the draft is what `GET .../rate-card/` prices. Only then
 * does the rate appear, with its inclusion list, and only then is there a
 * booking control. When the server answers `is_available: false` there is **no
 * booking control at all** and the screen offers the quote flow instead: no
 * card, no instant booking, and never a number this client made up.
 *
 * ## Changing an answer takes the price back down
 *
 * The same invalidation cascade the requirement reducer runs, for the same
 * reason: a rate priced against three helpers must not stay on screen while the
 * Customer edits it to five. Editing clears the priced state and the rate has to
 * be asked for again.
 */

export interface BookCrewScreenProps {
  service: RequirementService;
  /** The A3 variant resolved by the route. Carries the preset's questions. */
  variant: RequirementVariant;
}

/**
 * Midnight local as an ISO date-time.
 *
 * Copied in behaviour from the requirement flow, deliberately and not imported:
 * the Customer chose a *day*, `requested_start` is a `DateTimeField`, and the
 * start of their own day is the only moment that invents no intention. Built
 * from local date parts rather than `new Date(iso)` so a browser east of UTC
 * does not send the previous day.
 */
function startOfLocalDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0).toISOString();
}

function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function BookCrewScreen({ service, variant }: BookCrewScreenProps) {
  const router = useRouter();
  const questionSet = toQuestionSet(variant);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [addressId, setAddressId] = useState<string | null>(null);
  const [requestedStart, setRequestedStart] = useState<string>("");
  const [serviceBy, setServiceBy] = useState<string>("");
  const [requirementId, setRequirementId] = useState<string | null>(null);
  /** True only once the draft on the server matches what is on screen. */
  const [isPriced, setIsPriced] = useState(false);
  /** Set after the Customer read a duplicate warning and said the jobs differ. */
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const createRequirement = useCreateRequirement();
  const saveRequirement = useSaveRequirement();
  const book = useBookAtPublishedRate();

  // Enabled only once a draft exists *and* the form has not moved under it.
  // Reading a rate against a stale draft is how a Customer is shown a price for
  // the job they had before they edited it.
  const rateQuery = useRateCardState(requirementId, isPriced);
  const state = rateQuery.data ?? null;
  const rate = state === null ? null : toRateDisclosureView(state.preview);
  const unavailable = state === null ? null : toRateUnavailableView(state.preview);

  const today = todayIso();
  const formComplete =
    requiredAnswersPresent(questionSet.questions, answers) &&
    addressId !== null &&
    requestedStart !== "" &&
    serviceBy !== "";

  /** Any edit invalidates the price. See the header. */
  function edited() {
    setIsPriced(false);
    setAllowDuplicate(false);
  }

  /**
   * Writes the draft, then asks the server what it costs.
   *
   * Two calls at most and one on every press after the first: `POST
   * /requirements/` cannot carry an address or dates, so a new draft needs the
   * `PATCH` behind it, and an existing one needs only the `PATCH`. The answers
   * ride on whichever call is the update — sending them twice would be two
   * writes racing to set the same field.
   */
  async function handlePrice() {
    if (!formComplete || addressId === null) return;
    try {
      const isNew = requirementId === null;
      const targetId = isNew
        ? (
            await createRequirement.mutateAsync({
              variantId: variant.id,
              answers,
              // The server defaults this; sent explicitly because the generated
              // request type requires it.
              language: "en-IN",
            })
          ).id
        : requirementId;

      const draft = await saveRequirement.mutateAsync({
        requirementId: targetId,
        // On a new draft the create already wrote them. `PATCH` distinguishes an
        // absent key from an explicit value, so omitting it is not the same as
        // resending it.
        ...(isNew ? {} : { answers }),
        addressId,
        requestedStart: startOfLocalDay(requestedStart),
        serviceBy,
      });

      setRequirementId(draft.id);
      setIsPriced(true);
    } catch {
      // Rendered from the mutations' own errors below, next to the form they are
      // about. Swallowed here so a handled rejection does not reach the console.
    }
  }

  function handleBook() {
    if (requirementId === null) return;
    book.mutate(
      { requirementId, allowDuplicate },
      {
        onSuccess: () => router.push(requestHref(requirementId)),
      },
    );
  }

  const writeError = createRequirement.error ?? saveRequirement.error ?? null;
  const isWriting = createRequirement.isPending || saveRequirement.isPending;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-16 pt-6">
      <h1 className="text-xl font-semibold text-text">Book a crew for {service.name}</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Tell us how many people you need, for how long, and the few things that
        change the price. We will show you our published day rate before you book
        anything.
      </p>

      {questionSet.unsupported.length > 0 ? (
        <div
          role="alert"
          className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4"
        >
          <p className="font-semibold text-text">
            This service is not fully set up for instant booking yet
          </p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Part of the form is missing on our side, so a booking sent from here
            may be refused. Nothing you enter is charged for.
          </p>
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-text">The job</h2>
        <div className="mt-4">
          <PresetQuestions
            questions={questionSet.questions}
            answers={answers}
            onAnswer={(code, value) => {
              setAnswers((current) => ({ ...current, [code]: value }));
              edited();
            }}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Where and when</h2>
        <div className="mt-3">
          <p className="text-sm font-semibold text-text">Where is the work?</p>
          <div className="mt-2">
            <CrewAddressPicker
              variantId={variant.id}
              selectedAddressId={addressId}
              onSelect={(id) => {
                setAddressId(id);
                edited();
              }}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <Field
            label="Start from"
            description="The first day you need the crew. The rate is per person per day from here."
            required
          >
            <Input
              type="date"
              min={today}
              value={requestedStart}
              onChange={(event) => {
                setRequestedStart(event.target.value);
                edited();
              }}
            />
          </Field>

          <Field
            label="Needed by"
            description="After this date we stop looking and close the request. Anything unearned comes back to you — pick the date the job stops being useful, not your ideal date."
            required
          >
            <Input
              type="date"
              min={today}
              value={serviceBy}
              onChange={(event) => {
                setServiceBy(event.target.value);
                edited();
              }}
            />
          </Field>
        </div>
      </section>

      {writeError !== null ? (
        <div className="mt-6">
          <ErrorState
            title="We could not save that"
            message={
              isLifecycleUnsupported(writeError)
                ? "We do not take crew bookings for this service yet. Nothing you entered has been sent."
                : describeError(writeError, "mutation").message
            }
            severity="error"
            inline
          />
        </div>
      ) : null}

      <div className="mt-8 border-t border-line pt-6">
        {!isPriced ? (
          <div>
            <Button
              onClick={() => void handlePrice()}
              disabled={!formComplete}
              loading={isWriting}
              loadingLabel="Checking the rate"
            >
              See the published rate
            </Button>
            <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
              This costs nothing and books nothing. It saves what you have entered
              so we can price it.
            </p>
          </div>
        ) : rateQuery.isPending ? (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Working out the published rate</span>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : rateQuery.isError ? (
          <ErrorState
            title="We could not read the rate"
            message={describeError(rateQuery.error, "read").message}
            severity="error"
            actionLabel="Try again"
            onAction={() => void rateQuery.refetch()}
            reference={describeError(rateQuery.error, "read").reference}
            inline
          />
        ) : rate !== null && state !== null ? (
          <div>
            <RateDisclosure rate={rate} />

            <div className="mt-6">
              {isRequirementDuplicate(book.error) ? (
                <div className="mb-4 rounded-card border border-warning-line bg-warning-surface p-4">
                  <p className="font-semibold text-text">
                    You may already have a request open for this
                  </p>
                  <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
                    We found one at the same address around the same dates.
                    Booking again would send two crews.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        // The decision spends the key the refused attempt used.
                        // Without this the override is sent under a key whose
                        // stored payload said `allow_duplicate: false`, and the
                        // server refuses the mismatch — the Customer would press
                        // this and never get past the warning.
                        if (requirementId !== null) clearBookAtRateKey(requirementId);
                        setAllowDuplicate(true);
                      }}
                    >
                      These are different jobs
                    </Button>
                    <Link
                      href="/requests"
                      className={buttonStyles({ variant: "ghost" })}
                    >
                      See my requests
                    </Link>
                  </div>
                </div>
              ) : book.error !== null ? (
                <div className="mb-4">
                  <ErrorState
                    title="We could not book that"
                    message={bookFailureCopy(book.error)}
                    severity="error"
                    // No retry control. Every refusal reachable here is a state
                    // the Customer has to read — an unpriced city, a service
                    // with no instant dispatch — and none of them changes on a
                    // resend. The quote flow below is the honest next step.
                    inline
                  />
                </div>
              ) : null}

              <Button
                onClick={handleBook}
                loading={book.isPending}
                loadingLabel="Booking your crew"
              >
                Book this crew — {rate.totalLabel}
              </Button>
              <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
                <strong className="font-semibold text-text">
                  Nothing is charged now.
                </strong>{" "}
                We send this to supervisors nearby at the rate above. You pay the{" "}
                {rate.bookingFeeLabel} booking fee only once one of them accepts —
                and if nobody does, you pay nothing at all.
              </p>
            </div>
          </div>
        ) : (
          <RateUnavailable
            reason={unavailable?.reason ?? null}
            isIncompletePreset={state !== null && isPresetIncomplete(state.preview)}
            serviceSlug={service.slug}
            onEdit={() => setIsPriced(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * No published rate — the fail-closed state, and it is the honest one.
 *
 * Two branches because the recoveries are opposite. An incomplete preset is the
 * Customer's own draft and they can fix it; an unpriced city or an unconfigured
 * service is not something anybody on this screen can change, and the honest
 * degradation is the quote flow, which is still built and still works. **Neither
 * branch prints a number.**
 */
function RateUnavailable({
  reason,
  isIncompletePreset,
  serviceSlug,
  onEdit,
}: {
  reason: string | null;
  isIncompletePreset: boolean;
  serviceSlug: string;
  onEdit: () => void;
}) {
  if (isIncompletePreset) {
    return (
      <div className="rounded-card border border-warning-line bg-warning-surface p-4">
        <p className="font-semibold text-text">We need a little more to price this</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          {reason ?? "Tell us how many people you need, and for how many days."}
        </p>
        <div className="mt-3">
          <Button variant="outline" onClick={onEdit}>
            Go back to the form
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface-sunken p-4">
      <p className="font-semibold text-text">
        We do not have a published day rate for this yet
      </p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        {reason ??
          "We have not published a day rate for this work in this area, so we cannot book a crew instantly here."}{" "}
        We will not guess a price. You can describe the job instead and get quotes
        from professionals — that costs nothing to send.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href={`/requests/new/${serviceSlug}`}
          className={buttonStyles({ variant: "primary" })}
        >
          Get quotes instead
        </Link>
        <Link href={BROWSE_HREF} className={buttonStyles({ variant: "ghost" })}>
          Browse other services
        </Link>
      </div>
    </div>
  );
}

/** The sentence under a refused booking. Named refusals first, generic last. */
function bookFailureCopy(error: unknown): string {
  if (isRateCardUnavailable(error)) {
    return "We do not have a published day rate for this work in this area, so we cannot book a crew instantly. Nothing has been sent and nothing is charged — describing the job and collecting quotes still works.";
  }
  if (isLifecycleUnsupported(error)) {
    return "We do not take crew bookings for this service yet. Nothing has been sent and nothing is charged.";
  }
  return describeError(error, "mutation").message;
}
