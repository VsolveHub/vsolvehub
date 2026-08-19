"use client";

import type { Schemas } from "@vsolve/api-client";
import {
  describeError,
  isLifecycleUnsupported,
  isRateCardUnavailable,
  isRequirementDuplicate,
  isPresetIncomplete,
} from "@vsolve/query";
import {
  Button,
  ErrorState,
  Field,
  Input,
  RailLayout,
  Skeleton,
  buttonStyles,
  useIsWideScreen,
} from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BROWSE_HREF, requestHref } from "@/lib/routes";
import {
  toQuestionSet,
  type RequirementService,
  type RequirementVariant,
} from "@/features/requirement/adapters";
import { useCreateRequirement, useSaveRequirement } from "@/features/requirement/queries";
import { toRateDisclosureView, toRateUnavailableView } from "../adapters";
import { initialAnswers, presetSize, type PresetSize } from "../model/size";
import {
  clearBookAtRateKey,
  useBookAtPublishedRate,
  useRateCardPreview,
} from "../queries";
import { CrewAddressPicker } from "./crew-address-picker";
import { JobFormError, JobFormScreen } from "./mobile/job-form-screen";
import { RateScreen } from "./mobile/rate-screen";
import { PresetQuestions, requiredAnswersPresent } from "./preset-questions";
import { RateRail } from "./rate-rail";

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
 * facts, and shows the published rate beside them — nothing else, because the
 * rate card has already decided the price and the remaining unknowns are the
 * ones that move it.
 *
 * ## The rate is beside the form, not after it
 *
 * There is no longer a "see the rate" step. The form is on the left and the
 * price is on the right, and the price follows the form: change the headcount
 * and the rail re-prices. That is the whole reason the desktop layout exists —
 * on a phone the rate had to be a second screen, and a second screen turns a
 * published price into something you go and ask for.
 *
 * **Nothing on this screen calculates money.** The rail's figures come from
 * `GET .../rate-card/?headcount=&days=`, which prices a size without saving it;
 * see `useRateCardPreview`. The alternative — multiplying a day rate by a
 * headcount in the browser — is the one thing `features/crew/adapters` forbids,
 * because the day rate, the wage half and the fee component are three separately
 * published numbers whose relationship is the card's to define.
 *
 * ## Where the writes are, now that pricing is not one
 *
 * Two, and neither is on the hot path:
 *
 * 1. **The address decides the card.** `rate_card_for_requirement` resolves it
 *    through `requirement.service_area`, so an address that is not on the draft
 *    cannot be priced at all. Choosing one writes the draft.
 * 2. **Booking prices the draft, not the preview.** `rate-card/book/` reads the
 *    size from stored answers, so the answers are saved immediately before it
 *    runs. Without that, a Customer could book a size they never saw priced.
 *
 * Changing a stepper writes nothing. It changes a query string.
 */

type Address = Schemas["Address"];

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

/**
 * How long the rail waits after the last press before it re-prices.
 *
 * Long enough that walking a stepper from 1 to 6 is one request rather than
 * six, short enough that a single press feels answered rather than queued. A
 * Customer adjusting a headcount presses in bursts, so the debounce is measured
 * from the *last* press.
 */
const REPRICE_DELAY_MS = 400;

/**
 * The size to actually ask the server about: the current one, once it has held
 * still.
 *
 * Clearing is **derived rather than timed**. When the form stops being
 * priceable there is nothing to wait for — a rail holding a total for another
 * 400ms is quoting a job that no longer exists — so `null` passes straight
 * through, and only a real size goes through the timer. That also keeps the
 * effect free of a synchronous `setState`, which is the shape the React
 * compiler rules reject: the only state write here happens in the timeout's
 * callback, which is the external event this effect exists to subscribe to.
 */
function useDebouncedSize(size: PresetSize | null): PresetSize | null {
  const [settled, setSettled] = useState(size);

  useEffect(() => {
    if (size === null) return;
    const timer = setTimeout(() => setSettled(size), REPRICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [size]);

  return size === null ? null : settled;
}

export function BookCrewScreen({ service, variant }: BookCrewScreenProps) {
  const router = useRouter();
  const questionSet = useMemo(() => toQuestionSet(variant), [variant]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    // Seeded so the steppers' displayed value and the stored answer agree from
    // the first render — see `initialAnswers`.
    initialAnswers(questionSet.questions),
  );
  const [address, setAddress] = useState<Address | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [requestedStart, setRequestedStart] = useState<string>("");
  const [requirementId, setRequirementId] = useState<string | null>(null);
  /** Set after the Customer read a duplicate warning and said the jobs differ. */
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  /**
   * Which of the phone's two steps is showing. Ignored on a wide screen.
   *
   * Held here rather than in the mobile view so a resize does not reset it, and
   * so the wide layout — which shows both halves at once — cannot get out of
   * step with a value it does not read.
   */
  const [mobileStep, setMobileStep] = useState<"form" | "rate">("form");
  /** Incremented to ask the address dialog to open. See `AddressStage`. */
  const [addressSignal, setAddressSignal] = useState(0);
  /**
   * Which layout to render. See `useIsWideScreen` on why this is a hook rather
   * than a CSS branch: the two views hold the same form controls, and rendering
   * both would put two radio groups with the same `name` in one document.
   */
  const isWide = useIsWideScreen();

  const createRequirement = useCreateRequirement();
  const saveRequirement = useSaveRequirement();
  const book = useBookAtPublishedRate();

  const size = presetSize(answers);
  const settledSize = useDebouncedSize(size);

  const previewQuery = useRateCardPreview(requirementId, settledSize);
  const state = previewQuery.data ?? null;
  const rate = state === null ? null : toRateDisclosureView(state.preview);
  const unavailable = state === null ? null : toRateUnavailableView(state.preview);

  const today = todayIso();
  const formComplete =
    requiredAnswersPresent(questionSet.questions, answers) &&
    addressId !== null &&
    requestedStart !== "" &&
    size !== null;

  /**
   * The draft's id, created at most once however many times this is called.
   *
   * The in-flight promise is held in a ref, not just the resolved id: a
   * Customer who picks an address and presses Book before the create has landed
   * would otherwise start a second one, and two drafts for one form is two
   * requests a lead can be sent to.
   */
  const creating = useRef<Promise<string> | null>(null);
  async function ensureRequirementId(): Promise<string> {
    if (requirementId !== null) return requirementId;
    creating.current ??= createRequirement
      .mutateAsync({
        variantId: variant.id,
        answers,
        // The server defaults this; sent explicitly because the generated
        // request type requires it.
        language: "en-IN",
      })
      .then((draft) => {
        setRequirementId(draft.id);
        return draft.id;
      })
      .catch((error: unknown) => {
        // Cleared so the next attempt genuinely retries rather than re-awaiting
        // a promise that is already rejected.
        creating.current = null;
        throw error;
      });
    return creating.current;
  }

  /**
   * Persists the address, because the address is what resolves the rate card.
   *
   * `rate_card_for_requirement` reads `requirement.service_area`, so a draft
   * without an address cannot be priced at all — this is the one form change
   * that has to reach the server before the rail can say anything.
   *
   * Driven by the event rather than by an effect watching the state it sets.
   * Choosing an address is a deliberate act with a dialog in front of it, so
   * there is a real user action to hang the write on, and hanging it there
   * keeps the write out of the render path entirely.
   */
  async function handleAddressSelected(nextAddressId: string) {
    setAddressId(nextAddressId);
    edited();
    try {
      const targetId = await ensureRequirementId();
      await saveRequirement.mutateAsync({
        requirementId: targetId,
        addressId: nextAddressId,
        // No `serviceBy`. The server derives the closing date from the start day
        // (`services._closing_date`); sending one here would make this screen the
        // authority on when a request dies, which is exactly the question the
        // Customer was being asked and could not answer well.
      });
    } catch {
      // Rendered from the mutations' own errors below, next to the form they are
      // about. Swallowed here so a handled rejection does not reach the console.
    }
  }

  /** Any edit re-opens the duplicate question. */
  function edited() {
    setAllowDuplicate(false);
  }

  /**
   * Saves what is on screen, then books it.
   *
   * The save is not optional and not an optimisation. The rail has been pricing
   * sizes through query parameters, which write nothing, so the draft still
   * holds whatever size was last persisted — and `rate-card/book/` prices the
   * **draft**. Booking without this would charge for a job the Customer never
   * saw priced, which is the exact failure the query-parameter preview was
   * designed to make impossible.
   */
  async function handleBook() {
    if (!formComplete || addressId === null) return;
    let targetId: string;
    try {
      targetId = await ensureRequirementId();
      await saveRequirement.mutateAsync({
        requirementId: targetId,
        answers,
        addressId,
        requestedStart: startOfLocalDay(requestedStart),
      });
    } catch {
      return; // Rendered below. Booking an unsynced draft is not a fallback.
    }
    book.mutate(
      { requirementId: targetId, allowDuplicate },
      { onSuccess: () => router.push(requestHref(targetId)) },
    );
  }

  const writeError = createRequirement.error ?? saveRequirement.error ?? null;
  const isBooking = book.isPending || saveRequirement.isPending;

  const writeErrorMessage =
    writeError === null
      ? null
      : isLifecycleUnsupported(writeError)
        ? "We do not take crew bookings for this service yet. Nothing you entered has been sent."
        : describeError(writeError, "mutation").message;

  const addressPicker = (
    <CrewAddressPicker
      variantId={variant.id}
      selectedAddressId={addressId}
      presentation={isWide ? "row" : "none"}
      openSignal={addressSignal}
      onSelect={(id) => void handleAddressSelected(id)}
      onResolved={setAddress}
    />
  );

  if (!isWide) {
    return mobileStep === "form" ? (
      <JobFormScreen
        serviceName={service.name}
        questions={questionSet.questions}
        answers={answers}
        hiddenCodes={hiddenQuestionCodes(answers)}
        onAnswer={(code, value) => {
          setAnswers((current) => ({ ...current, [code]: value }));
          edited();
        }}
        requestedStart={requestedStart === "" ? null : requestedStart}
        onRequestedStart={(isoDate) => {
          setRequestedStart(isoDate);
          edited();
        }}
        addressLine={address === null ? null : addressSummaryLine(address)}
        onOpenAddress={() => setAddressSignal((signal) => signal + 1)}
        addressPicker={addressPicker}
        canContinue={formComplete}
        isSaving={saveRequirement.isPending || createRequirement.isPending}
        // Advancing does not write. The draft was written when the address was
        // chosen, and the rate is a query — so step two is a render, not a save,
        // and stepping back costs nothing.
        onContinue={() => setMobileStep("rate")}
        saveError={
          writeErrorMessage === null ? undefined : <JobFormError message={writeErrorMessage} />
        }
        onBack={() => router.back()}
      />
    ) : (
      <RateScreen
        rate={rate}
        city={address?.city ?? null}
        isStale={previewQuery.isFetching}
        onBack={() => setMobileStep("form")}
        onBook={() => void handleBook()}
        isBooking={isBooking}
        notice={
          <RailFooterNotices
            book={book}
            onClearDuplicate={() => {
              if (requirementId !== null) clearBookAtRateKey(requirementId);
              setAllowDuplicate(true);
            }}
          />
        }
        unavailable={
          rate === null && state !== null && !previewQuery.isFetching ? (
            <RateUnavailable
              reason={unavailable?.reason ?? null}
              isIncompletePreset={isPresetIncomplete(state.preview)}
              serviceSlug={service.slug}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Book a crew</h1>
        <p className="mt-1.5 max-w-prose text-sm leading-6 text-text-secondary">
          Set the job on the left. The rate on the right updates as you go.
        </p>
      </header>

      {questionSet.unsupported.length > 0 ? (
        <div
          role="alert"
          className="mb-6 rounded-card border border-warning-line bg-warning-surface p-4"
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

      <RailLayout
        railLabel="What this costs"
        rail={
          <RateRail
            rate={rate}
            cityLabel={address?.city ?? null}
            // Stale while the debounce has not fired yet, and while the server
            // is answering the size it did fire for. Both are "the figures on
            // screen are not for the size you can see".
            isStale={
              previewQuery.isFetching ||
              (size !== null && settledSize !== null && !sameSize(size, settledSize))
            }
            placeholder={placeholderFor({
              hasAddress: addressId !== null,
              hasSize: size !== null,
              unavailableReason: unavailable?.reason ?? null,
            })}
            footer={
              <RailFooter
                rate={rate}
                state={state}
                previewQuery={previewQuery}
                book={book}
                service={service}
                formComplete={formComplete}
                isBooking={isBooking}
                onBook={() => void handleBook()}
                onClearDuplicate={() => {
                  // The decision spends the key the refused attempt used.
                  // Without this the override is sent under a key whose stored
                  // payload said `allow_duplicate: false`, and the server
                  // refuses the mismatch — the Customer would press this and
                  // never get past the warning.
                  if (requirementId !== null) clearBookAtRateKey(requirementId);
                  setAllowDuplicate(true);
                }}
              />
            }
          />
        }
      >
        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="sr-only">The job</h2>
            <PresetQuestions
              questions={questionSet.questions}
              answers={answers}
              hiddenCodes={hiddenQuestionCodes(answers)}
              onAnswer={(code, value) => {
                setAnswers((current) => ({ ...current, [code]: value }));
                edited();
              }}
            />
          </section>

          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="sr-only">Where and when</h2>
            <div className="flex flex-col gap-5">
              <Field
                label="Start from"
                description="The first day you need the crew. If no supervisor has taken it by then we close the request — nothing is charged."
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

              <div>
                <p className="mb-2.5 text-sm font-bold text-text">Where</p>
                {/* The same instance the phone layout mounts. One picker means
                    one address book, one dialog and one place a Customer can
                    create an address. */}
                {addressPicker}
              </div>
            </div>
          </section>

          {writeError !== null ? (
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
          ) : null}
        </div>
      </RailLayout>
    </div>
  );
}

function sameSize(a: PresetSize, b: PresetSize): boolean {
  return a.headcount === b.headcount && a.days === b.days;
}

/**
 * The address as one line, for a row that has one line to give it.
 *
 * Locality and pincode, not the full postal address: the phone's picker row
 * truncates, and "Flat 402, Lotus Residency, Kondapur…" truncates to the part
 * that identifies nothing. What somebody checks at a glance is *which site*.
 */
function addressSummaryLine(address: Address): string {
  const locality = address.locality || address.city;
  return locality === "" ? address.postal_code : `${locality} — ${address.postal_code}`;
}

/**
 * The refusals that must be read before booking, shared by both layouts.
 *
 * Extracted because the phone and the wide screen put them in different places —
 * above the rate on one, in the rail on the other — and a duplicate override
 * that behaved differently in the two would be the worst kind of bug to find:
 * only reproducible at one window width.
 */
function RailFooterNotices({
  book,
  onClearDuplicate,
}: {
  book: ReturnType<typeof useBookAtPublishedRate>;
  onClearDuplicate: () => void;
}) {
  if (isRequirementDuplicate(book.error)) {
    return (
      <div className="rounded-card border border-warning-line bg-warning-surface p-4">
        <p className="font-semibold text-text">You may already have a request open for this</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          We found one at the same address around the same dates. Booking again
          would send two crews.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onClearDuplicate}>
            These are different jobs
          </Button>
          <Link href="/requests" className={buttonStyles({ variant: "ghost" })}>
            See my requests
          </Link>
        </div>
      </div>
    );
  }
  if (book.error !== null) {
    return (
      <ErrorState
        title="We could not book that"
        message={bookFailureCopy(book.error)}
        severity="error"
        // No retry. Every refusal reachable here is a state the Customer has to
        // read, and none of them changes on a resend.
        inline
      />
    );
  }
  return null;
}

/**
 * Why there is no price yet, in the order the Customer can act on.
 *
 * The address comes first because it is the only one that makes pricing
 * *impossible* rather than merely incomplete — the card is resolved through the
 * service area. The server's own reason wins over both, because an unpriced city
 * is a fact about the world that no amount of form-filling changes.
 */
function placeholderFor({
  hasAddress,
  hasSize,
  unavailableReason,
}: {
  hasAddress: boolean;
  hasSize: boolean;
  unavailableReason: string | null;
}): string {
  if (unavailableReason !== null) return unavailableReason;
  if (!hasAddress) return "Choose where the work is and we will show the rate for that area.";
  if (!hasSize) return "Tell us how many people you need, and for how many days.";
  return "Working out the rate for this job.";
}

/**
 * The action, and everything that has to be read before pressing it.
 *
 * Split out because the rail's *shape* is stable while this is a five-way
 * branch: loading, a failed read, an unavailable rate, a duplicate warning, or
 * the booking control. Inlining it put five nested ternaries between the reader
 * and the layout.
 */
function RailFooter({
  rate,
  state,
  previewQuery,
  book,
  service,
  formComplete,
  isBooking,
  onBook,
  onClearDuplicate,
}: {
  rate: ReturnType<typeof toRateDisclosureView>;
  state: { preview: Schemas["RatePreview"] } | null;
  previewQuery: ReturnType<typeof useRateCardPreview>;
  book: ReturnType<typeof useBookAtPublishedRate>;
  service: RequirementService;
  formComplete: boolean;
  isBooking: boolean;
  onBook: () => void;
  onClearDuplicate: () => void;
}) {
  // First load only. A re-price keeps the previous figures and dims them, which
  // `RateRail` handles — swapping to a skeleton on every stepper press would be
  // the flicker the debounce exists to avoid.
  if (previewQuery.isPending && previewQuery.fetchStatus === "fetching") {
    return (
      <div aria-busy="true">
        <span className="sr-only">Working out the published rate</span>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (previewQuery.isError) {
    return (
      <ErrorState
        title="We could not read the rate"
        message={describeError(previewQuery.error, "read").message}
        severity="error"
        actionLabel="Try again"
        onAction={() => void previewQuery.refetch()}
        reference={describeError(previewQuery.error, "read").reference}
        inline
      />
    );
  }

  if (rate === null) {
    // No priced rate. Either the draft is unfinished or this area has no card —
    // and the two have opposite recoveries, so they are never one message.
    if (state === null) return null;
    return (
      <RateUnavailable
        reason={toRateUnavailableView(state.preview)?.reason ?? null}
        isIncompletePreset={isPresetIncomplete(state.preview)}
        serviceSlug={service.slug}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {isRequirementDuplicate(book.error) ? (
        <div className="rounded-card border border-warning-line bg-warning-surface p-4">
          <p className="font-semibold text-text">
            You may already have a request open for this
          </p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            We found one at the same address around the same dates. Booking again
            would send two crews.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onClearDuplicate}>
              These are different jobs
            </Button>
            <Link href="/requests" className={buttonStyles({ variant: "ghost" })}>
              See my requests
            </Link>
          </div>
        </div>
      ) : book.error !== null ? (
        <ErrorState
          title="We could not book that"
          message={bookFailureCopy(book.error)}
          severity="error"
          // No retry control. Every refusal reachable here is a state the
          // Customer has to read — an unpriced city, a service with no instant
          // dispatch — and none of them changes on a resend. The quote flow is
          // the honest next step.
          inline
        />
      ) : null}

      <Button
        block
        size="lg"
        onClick={onBook}
        disabled={!formComplete}
        loading={isBooking}
        loadingLabel="Booking your crew"
      >
        Book this crew
      </Button>
      <p className="text-center text-[0.8125rem] leading-5 text-text-secondary">
        You pay {rate.bookingFeeLabel} only when a supervisor accepts.
      </p>
    </div>
  );
}

/**
 * No published rate — the fail-closed state, and it is the honest one.
 *
 * Two branches because the recoveries are opposite. An incomplete preset is the
 * Customer's own draft and they can fix it by scrolling left; an unpriced city
 * or an unconfigured service is not something anybody on this screen can change,
 * and the honest degradation is the quote flow, which is still built and still
 * works. **Neither branch prints a number.**
 */
function RateUnavailable({
  reason,
  isIncompletePreset,
  serviceSlug,
}: {
  reason: string | null;
  isIncompletePreset: boolean;
  serviceSlug: string;
}) {
  if (isIncompletePreset) {
    return (
      <div className="rounded-card border border-warning-line bg-warning-surface p-4">
        <p className="font-semibold text-text">We need a little more to price this</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          {reason ?? "Tell us how many people you need, and for how many days."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface-sunken p-4">
      <p className="font-semibold text-text">
        We do not have a published day rate for this yet
      </p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {reason ??
          "We have not published a day rate for this work in this area, so we cannot book a crew instantly here."}{" "}
        We will not guess a price. You can describe the job instead and get quotes
        from professionals — that costs nothing to send.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
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

/**
 * The free-text box belongs to one branch of the picker.
 *
 * `work_type` replaced a free-text "What will they be doing?" that most Customers
 * left blank — leaving a lead to read "3 people, 2 days" and guess what to bring.
 * The named options answer it in one tap, and `work_description` survives only to
 * carry the "Something else" case.
 *
 * Rendering both at once would put the abandoned box straight back on the screen,
 * under a list that has already answered it.
 *
 * Reads the server's own option code rather than a position in the list: the
 * catalogue owns this vocabulary, and a Customer whose variant does not publish
 * an `other` option simply never sees the box.
 */
const OTHER_WORK_TYPE = "other";

export function hiddenQuestionCodes(
  answers: Readonly<Record<string, unknown>>,
): readonly string[] {
  return answers.work_type === OTHER_WORK_TYPE ? [] : ["work_description"];
}
