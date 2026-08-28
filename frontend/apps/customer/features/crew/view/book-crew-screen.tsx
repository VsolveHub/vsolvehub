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
  Select,
  Skeleton,
  buttonStyles,
  cn,
  useIsWideScreen,
} from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BROWSE_HREF, requestHref } from "@/lib/routes";
import { preferredAddressId, useAddresses } from "@/features/addresses/queries";
import {
  toDraftIntent,
  toQuestionSet,
  type RequirementQuestionView,
  type RequirementService,
  type RequirementVariant,
} from "@/features/requirement/adapters";
import {
  existingDraftId,
  useCreateRequirement,
  useMyRequests,
  useProbableDuplicates,
  useRequirement as useRequirementRecord,
  useSaveRequirement,
} from "@/features/requirement/queries";
import { toRateDisclosureView, toRateUnavailableView } from "../adapters";
import {
  clearCrewBookingIntent,
  readCrewBookingIntent,
  writeCrewBookingIntent,
} from "../model/booking-intent";
import {
  OTHER_WORK_TYPE,
  WORK_DESCRIPTION_CODE,
  crewDetailQuestions,
  crewFlowShape,
  hiddenCrewQuestionCodes,
  initialCrewBookingStep,
  resumeCrewBookingStep,
  selectedWorkLabel,
  selectedWorkValue,
  workTypeQuestion,
  type CrewBookingStep,
} from "../model/booking-flow";
import {
  DRESS_CODE_CODE,
  EVENT_TYPE_CODE,
  GUEST_BAND_CODE,
  SERVICE_STYLE_CODE,
  STAFF_MEAL_CODE,
  STAFF_PREFERENCE_CODE,
  applyServingSuggestion,
  crewMixLabel,
  hiddenEventQuestionCodes,
  occasionQuestions,
  presentationQuestions,
  roleQuestions,
  roleTotal,
  suggestedServers,
  syncHeadcount,
  withRoleCount,
} from "../model/event-flow";
import {
  combineStart,
  formatReportingTime,
  reportingTimeOptions,
} from "../model/reporting-time";
import { CrewAboutPanel } from "./crew-about-panel";
import { DURATION_CODE, initialAnswers, presetSize, type PresetSize } from "../model/size";
import { useBookAtPublishedRate, useRateCardPreview } from "../queries";
import { CrewAddressPicker } from "./crew-address-picker";
import { CrewComposer, CrewScreen } from "./crew-composer";
import { EventTypeIcon } from "./event-icons";
import { EventSummaryCard, type SummaryLine } from "./event-summary";
import { JobFormError, JobFormScreen } from "./mobile/job-form-screen";
import { RateScreen } from "./mobile/rate-screen";
import { OccasionFields, OccasionScreen, occasionAnswered } from "./occasion-screen";
import { PresetQuestions, requiredAnswersPresent } from "./preset-questions";
import { RateRail } from "./rate-rail";
import { WorkPickerScreen, WorkTypeIcon } from "./work-picker-screen";

/**
 * The A3 preset — `M2-FE-425`, and the rate it shows — `M2-FE-426`.
 *
 * One screen, three shapes, read off the catalogue rather than the slug:
 *
 * - **plain** — a specific day-hire. Details, then the rate.
 * - **work** — generic labour. Choose the work, plan the crew, see the rate.
 * - **event** — event staff. The occasion, the crew by role, when and where
 *   and how they should turn up, then the rate.
 *
 * ADR-0009: what this market sells is a commodity priced per worker per day at
 * a street rate everybody already knows. What changed for events is not the
 * price but the *brief*: a lead staffing a wedding needs the occasion, the
 * crowd, the roles and the dress code before they can say yes, and every one
 * of those now travels with the offer.
 *
 * ## The rate follows an explicit confirmation
 *
 * Browsing, choosing and shaping a crew remain local until the Customer presses
 * **See my live rate**. Desktop uses a review-and-rate layout; a phone uses the
 * compact rate screen. Both are the same last stage and the same server price.
 *
 * **Nothing on this screen calculates money.** The rail's figures come from
 * `GET .../rate-card/?headcount=&days=`, which prices a size without saving it;
 * see `useRateCardPreview`. The one arithmetic this screen does is a *count* —
 * the headcount is the sum of the roles — and that is a fact about the crew,
 * not a price.
 *
 * ## Where the writes are, now that pricing is not one
 *
 * Two explicit actions:
 *
 * 1. **See my live rate prepares the draft.** `rate_card_for_requirement`
 *    resolves the card through `requirement.service_area`, so the chosen
 *    address, start and size are saved together at that deliberate boundary.
 * 2. **Booking prices the draft, not the preview.** `rate-card/book/` reads the
 *    size from stored answers, so the answers are saved immediately before it
 *    runs. Without that, a Customer could book a size they never saw priced.
 *
 * Opening the page, choosing an address and changing a stepper write nothing.
 */

type Address = Schemas["Address"];

export interface BookCrewScreenProps {
  service: RequirementService;
  /** The A3 variant resolved by the route. Carries the preset's questions. */
  variant: RequirementVariant;
}

function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Storage access itself can throw in locked-down or private browser contexts. */
function crewIntentStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** An event is booked weeks out; a helper crew, days. */
const EVENT_DATE_HORIZON_DAYS = 60;

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
 * through, and only a real size goes through the timer.
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

function optionLabel(
  questions: readonly RequirementQuestionView[],
  code: string,
  answers: Readonly<Record<string, unknown>>,
): string | null {
  const question = questions.find((entry) => entry.code === code);
  const value = answers[code];
  if (question === undefined || typeof value !== "string") return null;
  return question.options?.find((option) => option.value === value)?.label ?? null;
}

function joinPresent(parts: readonly (string | null)[], separator = " · "): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== "");
  return present.length === 0 ? null : present.join(separator);
}

export function BookCrewScreen({ service, variant }: BookCrewScreenProps) {
  const router = useRouter();
  const questionSet = useMemo(() => toQuestionSet(variant), [variant]);
  const questions = questionSet.questions;
  const shape = useMemo(() => crewFlowShape(questions), [questions]);
  const isEvent = shape === "event";
  const roles = useMemo(() => roleQuestions(questions), [questions]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    // Seeded so the steppers' displayed value and the stored answer agree from
    // the first render — see `initialAnswers`. An event crew opens empty: the
    // headcount is the sum of roles nobody has chosen yet.
    const seeded = initialAnswers(questions);
    return isEvent ? syncHeadcount(seeded, roles) : seeded;
  });
  const [addressId, setAddressId] = useState<string | null>(null);
  const [requestedStart, setRequestedStart] = useState<string>("");
  const [reportingTime, setReportingTime] = useState<string | null>(null);
  const [requirementId, setRequirementId] = useState<string | null>(null);
  /**
   * Which stage is showing on both phone and desktop.
   *
   * Held here rather than in a view so a resize does not reset the Customer's
   * progress or create a second source of truth for navigation.
   */
  const [bookingStep, setBookingStep] = useState<CrewBookingStep>(() =>
    initialCrewBookingStep(questions),
  );
  /** Incremented to ask the address dialog to open. See `AddressStage`. */
  const [addressSignal, setAddressSignal] = useState(0);
  const isWide = useIsWideScreen();

  const createRequirement = useCreateRequirement();
  const saveRequirement = useSaveRequirement();
  const book = useBookAtPublishedRate();
  const requestsQuery = useMyRequests();
  const resumableRequirementId =
    requirementId ?? existingDraftId(requestsQuery.data ?? [], service.slug);
  const requirementQuery = useRequirementRecord(resumableRequirementId);
  const addressesQuery = useAddresses();
  const addresses = addressesQuery.data ?? [];
  const effectiveAddressId = preferredAddressId(addresses, addressId);
  const address =
    addresses.find((candidate) => candidate.id === effectiveAddressId) ?? null;

  const workQuestion = workTypeQuestion(questions);
  const detailQuestions = crewDetailQuestions(questions);
  const workValue = selectedWorkValue(answers);
  const workLabel = selectedWorkLabel(workQuestion, answers);

  const occasion = useMemo(() => occasionQuestions(questions), [questions]);
  const presentation = useMemo(() => presentationQuestions(questions), [questions]);
  const daysQuestion = questions.find((question) => question.code === DURATION_CODE) ?? null;
  const crewTotal = roleTotal(roles, answers);
  const suggestion = isEvent
    ? suggestedServers(answers[GUEST_BAND_CODE], answers[SERVICE_STYLE_CODE])
    : null;
  const eventTypeLabel = optionLabel(occasion, EVENT_TYPE_CODE, answers);
  const guestBandLabel = optionLabel(occasion, GUEST_BAND_CODE, answers);
  const serviceStyleLabel = optionLabel(occasion, SERVICE_STYLE_CODE, answers);
  const mixLabel = crewMixLabel(roles, answers);

  const localIntentRestored = useRef(false);
  const restoredServerDraftId = useRef<string | null>(null);

  const size = presetSize(answers);
  const settledSize = useDebouncedSize(size);

  const previewQuery = useRateCardPreview(requirementId, settledSize);
  const state = previewQuery.data ?? null;
  const rate = state === null ? null : toRateDisclosureView(state.preview);
  const unavailable = state === null ? null : toRateUnavailableView(state.preview);

  const today = todayIso();
  const formComplete =
    requiredAnswersPresent(questions, answers) &&
    effectiveAddressId !== null &&
    requestedStart !== "" &&
    (!isEvent || reportingTime !== null) &&
    size !== null;

  /**
   * Restores local intent after hydration. No storage read happens in the state
   * initializer, so the server and first client render stay identical.
   */
  useEffect(() => {
    const restore = window.setTimeout(() => {
      const intent = readCrewBookingIntent(crewIntentStorage(), service.slug, variant.id);
      if (intent !== null) {
        const restored = isEvent ? syncHeadcount(intent.answers, roles) : intent.answers;
        setAnswers((current) => ({ ...current, ...restored }));
        setAddressId(intent.addressId);
        setRequestedStart(intent.requestedStart);
        setReportingTime(intent.reportingTime);
        setRequirementId(intent.requirementId);
        // The remembered screen, unless the answers no longer earn it — a
        // stale work choice or an occasion the catalogue retired goes back to
        // the stage that asks again. The rate is never resumed into: it needs
        // the saved draft, which "See my live rate" is the deliberate way to get.
        const earliest = resumeCrewBookingStep(questions, restored);
        const remembered = intent.step === "rate" ? earliest : intent.step;
        setBookingStep(stepIndex(remembered) <= stepIndex(earliest) ? remembered : earliest);
      }
      localIntentRestored.current = true;
    }, 0);
    return () => window.clearTimeout(restore);
  }, [isEvent, questions, roles, service.slug, variant.id]);

  useEffect(() => {
    if (!localIntentRestored.current) return;
    writeCrewBookingIntent(crewIntentStorage(), {
      serviceSlug: service.slug,
      variantId: variant.id,
      requirementId,
      answers,
      addressId,
      requestedStart,
      reportingTime,
      step: bookingStep,
    });
  }, [
    addressId,
    answers,
    bookingStep,
    reportingTime,
    requirementId,
    requestedStart,
    service.slug,
    variant.id,
  ]);

  useEffect(() => {
    const draft = requirementQuery.data;
    if (draft === undefined) return;
    if (draft.status !== "DRAFT") {
      clearCrewBookingIntent(crewIntentStorage(), service.slug);
      router.replace(requestHref(draft.id));
      return;
    }
    if (restoredServerDraftId.current === draft.id) return;

    const intent = toDraftIntent(draft);
    const restore = window.setTimeout(() => {
      restoredServerDraftId.current = draft.id;
      const restored = isEvent ? syncHeadcount(intent.answers, roles) : intent.answers;
      setRequirementId(draft.id);
      setAnswers((current) => ({ ...current, ...restored }));
      setAddressId(intent.addressId);
      setRequestedStart(intent.requestedStart ?? "");
      setReportingTime(intent.requestedStartTime);
      setBookingStep(resumeCrewBookingStep(questions, restored));
    }, 0);
    return () => window.clearTimeout(restore);
  }, [isEvent, questions, requirementQuery.data, roles, router, service.slug]);

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
    creating.current ??= (async () => {
      let existingId = existingDraftId(requestsQuery.data ?? [], service.slug);
      if (existingId === null && requestsQuery.isPending) {
        const lookup = await requestsQuery.refetch();
        existingId = existingDraftId(lookup.data ?? [], service.slug);
      }
      if (existingId !== null) {
        setRequirementId(existingId);
        return existingId;
      }

      const draft = await createRequirement.mutateAsync({
        variantId: variant.id,
        answers,
        language: "en-IN",
      });
      setRequirementId(draft.id);
      return draft.id;
    })().catch((error: unknown) => {
      // Cleared so the next attempt genuinely retries rather than re-awaiting
      // a promise that is already rejected.
      creating.current = null;
      throw error;
    });
    return creating.current;
  }

  async function handleAddressSelected(nextAddressId: string) {
    setAddressId(nextAddressId);
  }

  /** The instant to save: the chosen day, at the reporting time for a shift crew. */
  function startInstant(): string {
    return combineStart(requestedStart, isEvent ? reportingTime : null);
  }

  /**
   * Saves what is on screen, then books it.
   *
   * The save is not optional and not an optimisation. The rail has been pricing
   * sizes through query parameters, which write nothing, so the draft still
   * holds whatever size was last persisted — and `rate-card/book/` prices the
   * **draft**. Booking without this would charge for a job the Customer never
   * saw priced.
   */
  async function saveCrewDraft(): Promise<string | null> {
    if (!formComplete || effectiveAddressId === null) return null;
    try {
      const targetId = await ensureRequirementId();
      await saveRequirement.mutateAsync({
        requirementId: targetId,
        answers,
        addressId: effectiveAddressId,
        requestedStart: startInstant(),
      });
      return targetId;
    } catch {
      return null;
    }
  }

  async function handleShowRate() {
    if ((await saveCrewDraft()) !== null) setBookingStep("rate");
  }

  function handleAnswer(code: string, value: unknown) {
    setAnswers((current) => {
      if (isEvent && typeof value === "number" && roles.some((role) => role.code === code)) {
        return withRoleCount(current, roles, code, value);
      }
      if (isEvent && (code === GUEST_BAND_CODE || code === SERVICE_STYLE_CODE)) {
        // The crowd or the style changed, so the serving staff follow — unless
        // the customer already set that count themselves.
        const next = { ...current, [code]: value };
        return applyServingSuggestion(
          next,
          roles,
          suggestedServers(next[GUEST_BAND_CODE], next[SERVICE_STYLE_CODE]),
          suggestedServers(current[GUEST_BAND_CODE], current[SERVICE_STYLE_CODE]),
        );
      }
      if (code !== workQuestion?.code || value === OTHER_WORK_TYPE) {
        return { ...current, [code]: value };
      }
      const next = { ...current, [code]: value };
      delete next[WORK_DESCRIPTION_CODE];
      return next;
    });
  }

  async function handleBook() {
    const targetId = await saveCrewDraft();
    if (targetId === null) return;
    book.mutate(
      { requirementId: targetId, allowDuplicate: false },
      {
        onSuccess: () => {
          clearCrewBookingIntent(crewIntentStorage(), service.slug);
          router.push(requestHref(targetId));
        },
      },
    );
  }

  const duplicatesQuery = useProbableDuplicates(
    effectiveAddressId !== null && requestedStart !== ""
      ? {
          addressId: effectiveAddressId,
          requestedStart: startInstant(),
          variantId: variant.id,
        }
      : null,
  );
  const requestToReopen =
    duplicatesQuery.data?.find((duplicate) => duplicate.mergeable) ?? null;
  const refetchDuplicates = duplicatesQuery.refetch;

  useEffect(() => {
    if (requestToReopen === null) return;
    clearCrewBookingIntent(crewIntentStorage(), service.slug);
    router.replace(requestHref(requestToReopen.id));
  }, [requestToReopen, router, service.slug]);

  useEffect(() => {
    if (!isRequirementDuplicate(book.error)) return;
    void refetchDuplicates();
  }, [book.error, refetchDuplicates]);

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
      selectedAddressId={effectiveAddressId}
      presentation={isWide ? "row" : "none"}
      openSignal={addressSignal}
      onSelect={(id) => void handleAddressSelected(id)}
    />
  );

  const hiddenCodes = isEvent ? hiddenEventQuestionCodes(answers) : hiddenCrewQuestionCodes(answers);
  const siteLine = address === null ? null : addressSummaryLine(address);
  const whenLine = joinPresent([
    requestedStart === "" ? null : formatShortDate(requestedStart),
    isEvent && reportingTime !== null ? formatReportingTime(reportingTime) : null,
  ]);

  const eventSummary: readonly SummaryLine[] = isEvent
    ? [
        {
          key: "occasion",
          label: "Occasion",
          value: joinPresent([eventTypeLabel, guestBandLabel === null ? null : `${guestBandLabel} guests`, serviceStyleLabel]),
          icon: <EventTypeIcon code={typeof answers[EVENT_TYPE_CODE] === "string" ? (answers[EVENT_TYPE_CODE] as string) : ""} />,
        },
        {
          key: "crew",
          label: "Crew",
          value:
            mixLabel === null
              ? null
              : `${mixLabel} — ${crewTotal} ${crewTotal === 1 ? "person" : "people"} × ${size?.days ?? 1} ${(size?.days ?? 1) === 1 ? "day" : "days"}`,
          icon: <CrewIcon />,
        },
        { key: "when", label: "Reports", value: whenLine, icon: <CalendarIcon /> },
        { key: "site", label: "Venue", value: siteLine, icon: <PinIcon /> },
        {
          key: "presentation",
          label: "Turnout",
          value: joinPresent([
            optionLabel(presentation, DRESS_CODE_CODE, answers),
            answers[STAFF_MEAL_CODE] === true
              ? "Meal provided"
              : answers[STAFF_MEAL_CODE] === false
                ? "No meal"
                : null,
            optionLabel(presentation, STAFF_PREFERENCE_CODE, answers),
          ]),
          icon: <ShirtIcon />,
        },
      ]
    : [];

  /* ---------------------------------------------------------------------
     Phone
     --------------------------------------------------------------------- */

  if (bookingStep === "work" && workQuestion !== null) {
    return (
      <WorkPickerScreen
        serviceName={service.name}
        question={workQuestion}
        value={workValue}
        isWide={isWide}
        onSelect={(value) => {
          if (workQuestion !== null) handleAnswer(workQuestion.code, value);
        }}
        onContinue={() => {
          if (workLabel !== null) setBookingStep("details");
        }}
        onBack={() => router.back()}
      />
    );
  }

  if (!isWide && isEvent && bookingStep === "occasion") {
    return (
      <OccasionScreen
        serviceName={service.name}
        questions={occasion}
        answers={answers}
        onAnswer={handleAnswer}
        hiddenCodes={hiddenCodes}
        onContinue={() => setBookingStep("crew")}
        onBack={() => router.back()}
      />
    );
  }

  if (!isWide && isEvent && bookingStep === "crew") {
    return (
      <CrewScreen
        serviceName={service.name}
        roles={roles}
        daysQuestion={daysQuestion}
        answers={answers}
        onRoleCount={handleAnswer}
        onDays={(value) => handleAnswer(DURATION_CODE, value)}
        suggestion={suggestion}
        suggestionBasis={joinPresent([guestBandLabel === null ? null : `a ${guestBandLabel.toLowerCase()} guest`, serviceStyleLabel?.toLowerCase() ?? null], " ")}
        total={crewTotal}
        onContinue={() => setBookingStep("details")}
        onBack={() => setBookingStep("occasion")}
      />
    );
  }

  if (!isWide) {
    if (bookingStep !== "rate") {
      return isEvent ? (
        <JobFormScreen
          serviceName={service.name}
          title="Book event staff"
          heading="When, where and how they turn up"
          questions={presentation}
          answers={answers}
          hiddenCodes={hiddenCodes}
          onAnswer={handleAnswer}
          requestedStart={requestedStart === "" ? null : requestedStart}
          onRequestedStart={setRequestedStart}
          dateLabel="Event date"
          dateHorizonDays={EVENT_DATE_HORIZON_DAYS}
          reportingTime={reportingTime}
          onReportingTime={setReportingTime}
          addressLine={siteLine}
          onOpenAddress={() => setAddressSignal((signal) => signal + 1)}
          addressPicker={addressPicker}
          canContinue={formComplete}
          isSaving={saveRequirement.isPending || createRequirement.isPending}
          onContinue={() => void handleShowRate()}
          saveError={
            writeErrorMessage === null ? undefined : <JobFormError message={writeErrorMessage} />
          }
          stepLabel="Step 3 of 3"
          selectedWorkEyebrow="Your event"
          selectedWorkLabel={joinPresent([eventTypeLabel, mixLabel]) ?? "Your crew"}
          onChangeWork={() => setBookingStep("crew")}
          onBack={() => setBookingStep("crew")}
        />
      ) : (
        <JobFormScreen
          serviceName={service.name}
          questions={detailQuestions}
          answers={answers}
          hiddenCodes={hiddenCodes}
          onAnswer={handleAnswer}
          requestedStart={requestedStart === "" ? null : requestedStart}
          onRequestedStart={setRequestedStart}
          addressLine={siteLine}
          onOpenAddress={() => setAddressSignal((signal) => signal + 1)}
          addressPicker={addressPicker}
          canContinue={formComplete}
          isSaving={saveRequirement.isPending || createRequirement.isPending}
          // This explicit action is the first write for a new crew. Merely opening
          // the service and choosing an address stays local.
          onContinue={() => void handleShowRate()}
          saveError={
            writeErrorMessage === null ? undefined : <JobFormError message={writeErrorMessage} />
          }
          stepLabel={workQuestion === null ? "Step 1 of 2" : "Step 2 of 3"}
          selectedWorkLabel={workQuestion === null ? null : (workLabel ?? "Selected work")}
          onChangeWork={workQuestion === null ? undefined : () => setBookingStep("work")}
          aboutPanel={workQuestion === null ? <CrewAboutPanel service={service} /> : null}
          onBack={workQuestion === null ? () => router.back() : () => setBookingStep("work")}
        />
      );
    }

    return (
      <RateScreen
        rate={rate}
        city={address?.city ?? null}
        isStale={previewQuery.isFetching}
        onBack={() => setBookingStep("details")}
        onBook={() => void handleBook()}
        isBooking={isBooking}
        notice={<RailFooterNotices book={book} />}
        summary={
          isEvent ? (
            <EventSummaryCard lines={eventSummary} onChange={() => setBookingStep("details")} />
          ) : undefined
        }
        crewLabel={isEvent && mixLabel !== null ? "Whole event at this rate" : undefined}
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

  /* ---------------------------------------------------------------------
     Wide screen
     --------------------------------------------------------------------- */

  const planning = bookingStep !== "rate";
  const eventPlanReady = isEvent && occasionAnswered(occasion, answers);

  return (
    <div
      key={planning ? "plan" : "rate"}
      className="crew-stage-enter mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6"
    >
      <DesktopBookingHero
        serviceName={service.name}
        step={bookingStep}
        shape={shape}
        count={isEvent ? crewTotal : (size?.headcount ?? 1)}
        days={size?.days ?? 1}
      />

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

      {planning ? (
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-6">
            {isEvent ? (
              <>
                <section className="rounded-[20px] border border-line bg-surface p-5 shadow-sm sm:p-6">
                  <SectionLabel number="1" title="What's the occasion?" caption="Helps us suggest the right crew" />
                  <OccasionFields
                    questions={occasion}
                    answers={answers}
                    onAnswer={handleAnswer}
                    hiddenCodes={hiddenCodes}
                    wide
                  />
                </section>

                <section
                  className={cn(
                    "rounded-[20px] border border-line bg-surface p-5 shadow-sm transition-opacity duration-base sm:p-6",
                    !eventPlanReady && "opacity-60",
                  )}
                >
                  <SectionLabel number="2" title="Who do you need?" caption="Set each role and the days" />
                  <CrewComposer
                    roles={roles}
                    daysQuestion={daysQuestion}
                    answers={answers}
                    onRoleCount={handleAnswer}
                    onDays={(value) => handleAnswer(DURATION_CODE, value)}
                    suggestion={suggestion}
                    suggestionBasis={joinPresent([guestBandLabel === null ? null : `a ${guestBandLabel.toLowerCase()} guest`, serviceStyleLabel?.toLowerCase() ?? null], " ")}
                    total={crewTotal}
                    wide
                  />
                </section>

                <section className="rounded-[20px] border border-line bg-surface p-5 shadow-sm sm:p-6">
                  <SectionLabel number="3" title="When, where and how they turn up" caption="Date, reporting time, venue and dress code" />
                  <div className="flex flex-col gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Event date" required>
                        <Input
                          type="date"
                          min={today}
                          value={requestedStart}
                          onChange={(event) => setRequestedStart(event.target.value)}
                        />
                      </Field>
                      <Field
                        label="Reporting time"
                        description="When the crew should be at the venue, ready to work."
                        required
                      >
                        <Select
                          value={reportingTime ?? ""}
                          onChange={(event) =>
                            setReportingTime(event.target.value === "" ? null : event.target.value)
                          }
                        >
                          <option value="">Choose a time</option>
                          {reportingTimeOptions().map((time) => (
                            <option key={time} value={time}>
                              {formatReportingTime(time)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <p className="-mt-2 text-xs leading-5 text-text-muted">
                      One 8-hour shift from reporting time. After that, overtime runs only when you
                      approve it in the app, at the published rate.
                    </p>
                    <div>
                      <p className="mb-2.5 text-sm font-bold text-text">Venue</p>
                      {addressPicker}
                    </div>
                    <PresetQuestions
                      questions={presentation}
                      answers={answers}
                      hiddenCodes={hiddenCodes}
                      onAnswer={handleAnswer}
                    />
                  </div>
                </section>
              </>
            ) : (
              <>
                {workQuestion !== null ? (
                  <button
                    type="button"
                    onClick={() => setBookingStep("work")}
                    className="group flex min-h-20 items-center gap-4 rounded-[20px] border border-selected-line bg-selected-surface p-4 text-left transition-[border-color,box-shadow,transform] duration-base hover:-translate-y-0.5 hover:border-selected hover:shadow-raised active:translate-y-0 active:scale-[0.99] motion-reduce:transform-none"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-navy-900 text-signal-300">
                      <WorkTypeIcon code={workValue ?? "other"} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold uppercase tracking-[0.11em] text-text-muted">
                        Work selected
                      </span>
                      <span className="mt-1 block text-lg font-bold text-text">{workLabel}</span>
                    </span>
                    <span className="text-sm font-bold text-text-link group-hover:underline">Change</span>
                  </button>
                ) : (
                  // The service IS the work: the flow opens on what a day of it covers.
                  <CrewAboutPanel service={service} />
                )}

                <section className="rounded-[20px] border border-line bg-surface p-5 shadow-sm sm:p-6">
                  <SectionLabel
                    number={workQuestion === null ? "1" : "2"}
                    title="How much help do you need?"
                    caption="Set the crew and duration"
                  />
                  <PresetQuestions
                    questions={detailQuestions}
                    answers={answers}
                    hiddenCodes={hiddenCodes}
                    onAnswer={handleAnswer}
                  />
                </section>

                <section className="rounded-[20px] border border-line bg-surface p-5 shadow-sm sm:p-6">
                  <SectionLabel
                    number={workQuestion === null ? "2" : "3"}
                    title="Where and when?"
                    caption="Date and saved address"
                  />
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
                        onChange={(event) => setRequestedStart(event.target.value)}
                      />
                    </Field>

                    <div>
                      <p className="mb-2.5 text-sm font-bold text-text">Where</p>
                      {addressPicker}
                    </div>
                  </div>
                </section>
              </>
            )}

            <Button
              block
              size="lg"
              disabled={!formComplete}
              loading={createRequirement.isPending || saveRequirement.isPending}
              loadingLabel="Preparing your live rate"
              onClick={() => void handleShowRate()}
            >
              See my live rate
            </Button>

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

          <aside className="sticky top-6 rounded-[22px] bg-navy-900 p-5 text-white shadow-raised">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-signal-300">
              {isEvent ? "Event plan" : "Crew plan"}
            </p>
            <CrewConstellation
              count={isEvent ? crewTotal : (size?.headcount ?? 1)}
              days={size?.days ?? 1}
              compact
            />
            <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-sm">
              {isEvent ? (
                <>
                  <PlanLine label="Occasion" value={joinPresent([eventTypeLabel, guestBandLabel === null ? null : `${guestBandLabel} guests`]) ?? "Choose occasion"} />
                  <PlanLine label="Crew" value={mixLabel ?? "Add people"} />
                  <PlanLine label="Reports" value={whenLine ?? "Choose date and time"} />
                  <PlanLine label="Venue" value={siteLine ?? "Add an address"} />
                </>
              ) : (
                <>
                  <PlanLine
                    label="Work"
                    value={workQuestion === null ? service.name : (workLabel ?? "Choose work")}
                  />
                  <PlanLine label="Start" value={requestedStart === "" ? "Choose date" : formatShortDate(requestedStart)} />
                  <PlanLine label="Site" value={siteLine ?? "Add an address"} />
                </>
              )}
            </dl>
            <p className="mt-4 text-xs leading-5 text-white/60">
              Nothing is sent until you ask for the live rate.
            </p>
          </aside>
        </div>
      ) : (
        <RailLayout
          railLabel="What this costs"
          rail={
            <RateRail
              rate={rate}
              cityLabel={address?.city ?? null}
              isStale={
                previewQuery.isFetching ||
                (size !== null && settledSize !== null && !sameSize(size, settledSize))
              }
              placeholder={placeholderFor({
                hasAddress: effectiveAddressId !== null,
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
                />
              }
            />
          }
        >
          <div className="flex flex-col gap-5">
            <section className="rounded-[22px] border border-line bg-surface p-6 shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-signal-700">Ready to review</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-text">
                {isEvent ? "Your event, at a glance" : "Your crew, at a glance"}
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {isEvent ? (
                  eventSummary.map((line) => (
                    <ReviewTile
                      key={line.key}
                      label={line.label}
                      value={line.value ?? "Not chosen"}
                      icon={line.icon}
                    />
                  ))
                ) : (
                  <>
                    <ReviewTile
                      label="Work"
                      value={workQuestion === null ? service.name : (workLabel ?? "Selected work")}
                      icon={<WorkTypeIcon code={workValue ?? "other"} />}
                    />
                    <ReviewTile label="Crew" value={`${size?.headcount ?? 1} ${(size?.headcount ?? 1) === 1 ? "person" : "people"} × ${size?.days ?? 1} ${(size?.days ?? 1) === 1 ? "day" : "days"}`} icon={<CrewIcon />} />
                    <ReviewTile label="Starts" value={requestedStart === "" ? "Not chosen" : formatShortDate(requestedStart)} icon={<CalendarIcon />} />
                    <ReviewTile label="Site" value={siteLine ?? "Not chosen"} icon={<PinIcon />} />
                  </>
                )}
              </div>
              <Button variant="outline" className="mt-5" onClick={() => setBookingStep("details")}>
                {isEvent ? "Change event plan" : "Change crew plan"}
              </Button>
            </section>
            <div className="rounded-[18px] border border-warning-line bg-warning-surface p-4">
              <p className="text-sm font-bold text-text">Pay the crew directly after each day.</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Vsolve charges only the booking fee shown in the rate panel, and only after a supervisor accepts.
              </p>
            </div>
            <RailFooterNotices book={book} />
          </div>
        </RailLayout>
      )}
    </div>
  );
}

/** The flow's stages in order, so a remembered step can be checked against the earliest earned one. */
const STEP_ORDER: readonly CrewBookingStep[] = ["occasion", "work", "crew", "details", "rate"];

function stepIndex(step: CrewBookingStep): number {
  return STEP_ORDER.indexOf(step);
}

function DesktopBookingHero({
  serviceName,
  step,
  shape,
  count,
  days,
}: {
  serviceName: string;
  step: CrewBookingStep;
  shape: "plain" | "work" | "event";
  count: number;
  days: number;
}) {
  // A service that publishes no work question has a two-step flow: the picker
  // pill disappears rather than showing a step nobody will visit. An event's
  // three planning sections live on one page, so it is two pills as well.
  const labels =
    shape === "work"
      ? ["Choose work", "Plan crew", "Review rate"]
      : shape === "event"
        ? ["Plan your event", "Review rate"]
        : ["Plan crew", "Review rate"];
  const activeIndex =
    step === "rate" ? labels.length - 1 : shape === "work" && step !== "work" ? 1 : shape === "work" ? 0 : 0;
  return (
    <header className="relative mb-7 overflow-hidden rounded-[28px] bg-navy-900 px-6 py-7 text-white sm:px-8 sm:py-9">
      <div aria-hidden className="absolute -right-16 -top-24 size-64 rounded-full bg-signal-500/20 blur-3xl" />
      <div className="relative grid items-center gap-7 md:grid-cols-[1fr_300px]">
        <div>
          <Link
            href="/catalog"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-white/75 transition-colors duration-base hover:text-white focus-visible:outline-white"
          >
            <svg viewBox="0 0 20 20" fill="none" className="mr-1 size-4" aria-hidden>
              <path d="m12 5-5 5 5 5M7 10h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Browse crews
          </Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-signal-300">
            {step === "rate" ? "Your live rate" : shape === "event" ? "Plan your event crew" : "Plan your crew"}
          </p>
          <h1 className="mt-2 max-w-xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {step === "rate"
              ? "One last look before you book."
              : shape === "work"
                ? `Build your ${serviceName.toLowerCase()} crew`
                : shape === "event"
                  ? "Staff your event, role by role."
                  : serviceName}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-white/80">
            {labels.map((label, index) => (
              <span key={label} className="contents">
                {index > 0 ? <span aria-hidden className="text-white/30">&rarr;</span> : null}
                <FlowPill
                  number={`${index + 1}`}
                  label={label}
                  status={index === activeIndex ? "active" : index < activeIndex ? "complete" : "upcoming"}
                />
              </span>
            ))}
          </div>
        </div>
        <CrewConstellation count={count} days={days} />
      </div>
    </header>
  );
}

function FlowPill({
  number,
  label,
  status,
}: {
  number: string;
  label: string;
  status: "active" | "complete" | "upcoming";
}) {
  const active = status === "active";
  return (
    <span
      className={
        active
          ? "inline-flex min-h-9 items-center gap-2 rounded-full bg-white px-3 font-semibold text-navy-900"
          : status === "complete"
            ? "inline-flex min-h-9 items-center gap-2 rounded-full border border-success-line/40 bg-success-surface/10 px-3 text-white"
            : "inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3"
      }
    >
      <span className={active ? "text-signal-700" : status === "complete" ? "text-signal-300" : "text-white/50"}>
        {status === "complete" ? (
          <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : number}
      </span>
      {label}
    </span>
  );
}

function SectionLabel({
  number,
  title,
  caption,
}: {
  number: string;
  title: string;
  caption: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-action-surface text-sm font-bold text-signal-700">
        {number}
      </span>
      <div>
        <h2 className="font-bold text-text">{title}</h2>
        <p className="text-xs text-text-secondary">{caption}</p>
      </div>
    </div>
  );
}

/** The signature roster: it grows as the Customer adds people. */
function CrewConstellation({ count, days, compact = false }: { count: number; days: number; compact?: boolean }) {
  const visible = Math.min(Math.max(count, 1), 6);
  const empty = count < 1;
  return (
    <figure className={cn("group rounded-[22px] border border-white/10 bg-white/[0.07] backdrop-blur-sm", compact ? "mt-4 p-4" : "p-5")}>
      <div className={cn("flex items-end justify-center gap-2", compact ? "min-h-20" : "min-h-28", empty && "opacity-40")} aria-hidden>
        {Array.from({ length: visible }, (_, index) => (
          <span
            key={index}
            className="flex w-8 flex-col items-center transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transform-none"
            style={{ transitionDelay: `${index * 45}ms` }}
          >
            <span className="size-4 rounded-full bg-signal-300" />
            <span className={cn("mt-1 w-6 rounded-t-full bg-white/90", compact ? "h-9" : "h-12")} />
          </span>
        ))}
      </div>
      <figcaption className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4">
        <span className="text-sm text-white/65">Crew plan</span>
        <strong className="text-lg tabular-nums text-white">
          {empty
            ? "Nobody yet"
            : `${count} ${count === 1 ? "person" : "people"} × ${days} ${days === 1 ? "day" : "days"}`}
        </strong>
      </figcaption>
    </figure>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-3 py-3">
      <dt className="text-white/55">{label}</dt>
      <dd className="text-right font-semibold text-white">{value}</dd>
    </div>
  );
}

function ReviewTile({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-[16px] border border-line bg-surface-hover p-4">
      {icon ? (
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-action-surface text-navy-700 [&>svg]:size-6">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-text-muted">{label}</span>
        <span className="mt-1 block text-sm font-bold leading-5 text-text">{value}</span>
      </span>
    </div>
  );
}

function CrewIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.5 2.5 0 1 0 0-5M3 19v-2a5 5 0 0 1 10 0v2M14 14a4 4 0 0 1 7 3v2" /></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4v3M19 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1Z" /></svg>;
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}

function ShirtIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 4-5 2.5L6 11l2-.8V20h8v-9.8l2 .8 2-4.5L15 4a3 3 0 0 1-6 0Z" /></svg>;
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(year, month - 1, day),
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
}: {
  book: ReturnType<typeof useBookAtPublishedRate>;
}) {
  if (isRequirementDuplicate(book.error)) {
    return (
      <div className="rounded-card border border-line bg-surface-sunken p-4" aria-live="polite">
        <p className="font-semibold text-text">Opening your existing request</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          This crew is already requested for the same place and dates, so we are reopening it.
        </p>
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
}: {
  rate: ReturnType<typeof toRateDisclosureView>;
  state: { preview: Schemas["RatePreview"] } | null;
  previewQuery: ReturnType<typeof useRateCardPreview>;
  book: ReturnType<typeof useBookAtPublishedRate>;
  service: RequirementService;
  formComplete: boolean;
  isBooking: boolean;
  onBook: () => void;
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
        <div className="rounded-card border border-line bg-surface-sunken p-4" aria-live="polite">
          <p className="font-semibold text-text">Opening your existing request</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            This crew is already requested for the same place and dates, so we are reopening it.
          </p>
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
 */
export function hiddenQuestionCodes(
  answers: Readonly<Record<string, unknown>>,
): readonly string[] {
  return hiddenCrewQuestionCodes(answers);
}
