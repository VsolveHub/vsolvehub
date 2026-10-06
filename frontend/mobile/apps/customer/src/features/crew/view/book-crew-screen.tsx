// Ported from frontend/apps/customer/features/crew/view/book-crew-screen.tsx
import type { Schemas } from "@vsolve/api-client";
import { kvGet, kvRemove, kvSet } from "@vsolve/mobile-core";
import {
  describeError,
  isLifecycleUnsupported,
  isPresetIncomplete,
  isRateCardUnavailable,
  isRequirementDuplicate,
} from "@vsolve/query/native";
import { EmptyState, ErrorState, Skeleton, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { preferredAddressId, useAddresses } from "@/features/addresses/queries";
import { useServiceDetail } from "@/features/catalog/client-queries";
import { toDraftIntent, toQuestionSet, type RequirementQuestionView, type RequirementService, type RequirementVariant } from "@/features/requirement/adapters";
import {
  existingDraftId,
  useCreateRequirement,
  useMyRequests,
  useProbableDuplicates,
  useRequirement as useRequirementRecord,
  useSaveRequirement,
} from "@/features/requirement/queries";
import { BROWSE_HREF, requestHref } from "@/lib/routes";

import { toRateDisclosureView, toRateUnavailableView } from "../adapters";
import {
  clearCrewBookingIntent,
  crewBookingStorageKey,
  readCrewBookingIntent,
  writeCrewBookingIntent,
} from "../model/booking-intent";
import {
  OTHER_WORK_TYPE,
  WORK_DESCRIPTION_CODE,
  crewDetailQuestions,
  crewFlowShape,
  fixedTeamGuestLimit,
  hiddenCrewQuestionCodes,
  initialCrewBookingStep,
  isFixedTeamCrewFlow,
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
  applyServingSuggestion,
  crewMixLabel,
  hiddenEventQuestionCodes,
  isExactGuestCount,
  occasionQuestions,
  presentationQuestions,
  roleQuestions,
  roleTotal,
  suggestedServers,
  syncHeadcount,
  withRoleCount,
  withRoleGenderCount,
} from "../model/event-flow";
import { combineStart, formatReportingTime } from "../model/reporting-time";
import { DURATION_CODE, initialAnswers, presetSize, type PresetSize } from "../model/size";
import { useBookAtPublishedRate, useRateCardPreview } from "../queries";
import { CrewAboutPanel } from "./crew-about-panel";
import { CrewAddressPicker } from "./crew-address-picker";
import { CrewScreen } from "./crew-composer";
import { EventSummaryCard, type SummaryLine } from "./event-summary";
import { JobFormError, JobFormScreen } from "./job-form-screen";
import { OccasionScreen } from "./occasion-screen";
import { requiredAnswersPresent } from "./preset-questions";
import { RateScreen } from "./rate-screen";
import { WorkPickerScreen } from "./work-picker-screen";

type Address = Schemas["Address"];
const A3 = "A3_TIME_BLOCK";
const EVENT_DATE_HORIZON_DAYS = 60;
const REPRICE_DELAY_MS = 400;

const memory = new Map<string, string>();

function crewIntentStorage() {
  return {
    getItem(key: string) {
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      void kvSet(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
      void kvRemove(key);
    },
  };
}

function useDebouncedSize(size: PresetSize | null): PresetSize | null {
  const [settled, setSettled] = useState(size);
  useEffect(() => {
    if (size === null) return;
    const timer = setTimeout(() => setSettled(size), REPRICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [size]);
  return size === null ? null : settled;
}

function optionLabel(questions: readonly RequirementQuestionView[], code: string, answers: Readonly<Record<string, unknown>>): string | null {
  const question = questions.find((entry) => entry.code === code);
  const value = answers[code];
  if (question === undefined || typeof value !== "string") return null;
  return question.options?.find((option) => option.value === value)?.label ?? null;
}

function guestCountLabel(questions: readonly RequirementQuestionView[], answers: Readonly<Record<string, unknown>>): string | null {
  const value = answers[GUEST_BAND_CODE];
  if (isExactGuestCount(value)) return String(value).trim();
  return optionLabel(questions, GUEST_BAND_CODE, answers);
}

function joinPresent(parts: readonly (string | null)[], separator = " · "): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== "");
  return present.length === 0 ? null : present.join(separator);
}

const STEP_ORDER: readonly CrewBookingStep[] = ["occasion", "work", "crew", "details", "rate"];
function stepIndex(step: CrewBookingStep): number {
  return STEP_ORDER.indexOf(step);
}

export function BookCrewScreen({ serviceSlug }: { serviceSlug: string }) {
  const serviceQuery = useServiceDetail(serviceSlug);
  if (serviceQuery.isPending) {
    return (
      <View className="flex-1 px-4 py-6" accessibilityState={{ busy: true }}>
        <Text className="sr-only">Loading this crew</Text>
        <Skeleton className="h-40 w-full" />
      </View>
    );
  }
  if (serviceQuery.isError || serviceQuery.data === undefined) {
    return (
      <View className="px-4 py-6">
        <ErrorState
          title="We could not open this crew"
          message={describeError(serviceQuery.error, "read").message}
          severity="error"
          actionLabel="Try again"
          onAction={() => void serviceQuery.refetch()}
        />
      </View>
    );
  }
  const variant = serviceQuery.data.requirement_variants.find((entry) => entry.fulfilment_archetype === A3);
  if (variant === undefined) {
    return (
      <View className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
        <EmptyState
          title="We do not book crews for this at a published rate"
          description={`${serviceQuery.data.name} is not set up for instant crew booking. Nothing has been sent and nothing is charged — you can describe the job instead and professionals will quote for it.`}
          action={
            <View className="flex-row flex-wrap items-center gap-3">
              <Link href={`/requests/new/${serviceQuery.data.slug}` as never} asChild>
                <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
                  <Text className="text-sm font-semibold text-action-text">Tell us what you need</Text>
                </Pressable>
              </Link>
              <Link href="/catalog" asChild>
                <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })}>
                  <Text className="text-sm font-semibold text-text">Browse other services</Text>
                </Pressable>
              </Link>
            </View>
          }
        />
      </View>
    );
  }
  return <BookCrewFlow service={serviceQuery.data} variant={variant} />;
}

function BookCrewFlow({ service, variant }: { service: RequirementService; variant: RequirementVariant }) {
  const router = useRouter();
  const questionSet = useMemo(() => toQuestionSet(variant), [variant]);
  const questions = questionSet.questions;
  const shape = useMemo(() => crewFlowShape(questions), [questions]);
  const isEvent = shape === "event";
  const isFixedTeam = useMemo(() => isFixedTeamCrewFlow(questions), [questions]);
  const guestLimit = useMemo(() => fixedTeamGuestLimit(questions), [questions]);
  const asksReportingTime = isEvent || isFixedTeam;
  const roles = useMemo(() => roleQuestions(questions), [questions]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const seeded = initialAnswers(questions);
    return isEvent ? syncHeadcount(seeded, roles) : seeded;
  });
  const [addressId, setAddressId] = useState<string | null>(null);
  const [requestedStart, setRequestedStart] = useState("");
  const [reportingTime, setReportingTime] = useState<string | null>(null);
  const [requirementId, setRequirementId] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState<CrewBookingStep>(() => initialCrewBookingStep(questions));
  const [addressSignal, setAddressSignal] = useState(0);

  const createRequirement = useCreateRequirement();
  const saveRequirement = useSaveRequirement();
  const book = useBookAtPublishedRate();
  const requestsQuery = useMyRequests();
  const resumableRequirementId = requirementId ?? existingDraftId(requestsQuery.data ?? [], service.slug);
  const requirementQuery = useRequirementRecord(resumableRequirementId);
  const addressesQuery = useAddresses();
  const addresses = addressesQuery.data ?? [];
  const effectiveAddressId = preferredAddressId(addresses, addressId);
  const address = addresses.find((candidate) => candidate.id === effectiveAddressId) ?? null;

  const workQuestion = workTypeQuestion(questions);
  const detailQuestions = crewDetailQuestions(questions);
  const workValue = selectedWorkValue(answers);
  const workLabel = selectedWorkLabel(workQuestion, answers);
  const occasion = useMemo(() => occasionQuestions(questions), [questions]);
  const presentation = useMemo(() => presentationQuestions(questions), [questions]);
  const daysQuestion = questions.find((question) => question.code === DURATION_CODE) ?? null;
  const suggestion = isEvent ? suggestedServers(answers[GUEST_BAND_CODE], answers[SERVICE_STYLE_CODE]) : null;
  const eventTypeLabel = optionLabel(occasion, EVENT_TYPE_CODE, answers);
  const guestBandLabel = guestCountLabel(occasion, answers);
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

  const formComplete =
    requiredAnswersPresent(questions, answers) &&
    effectiveAddressId !== null &&
    requestedStart !== "" &&
    (!asksReportingTime || reportingTime !== null) &&
    size !== null;

  useEffect(() => {
    let cancelled = false;
    void kvGet(crewBookingStorageKey(service.slug)).then((raw) => {
      if (cancelled) return;
      if (raw !== null) memory.set(crewBookingStorageKey(service.slug), raw);
      const intent = readCrewBookingIntent(crewIntentStorage(), service.slug, variant.id);
      if (intent !== null) {
        const restored = isEvent ? syncHeadcount(intent.answers, roles) : intent.answers;
        setAnswers((current) => ({ ...current, ...restored }));
        setAddressId(intent.addressId);
        setRequestedStart(intent.requestedStart);
        setReportingTime(intent.reportingTime);
        setRequirementId(intent.requirementId);
        const earliest = resumeCrewBookingStep(questions, restored);
        const remembered = intent.step === "rate" ? earliest : intent.step;
        setBookingStep(stepIndex(remembered) <= stepIndex(earliest) ? remembered : earliest);
      }
      localIntentRestored.current = true;
    });
    return () => {
      cancelled = true;
    };
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
  }, [addressId, answers, bookingStep, reportingTime, requirementId, requestedStart, service.slug, variant.id]);

  useEffect(() => {
    const draft = requirementQuery.data;
    if (draft === undefined || draft === null) return;
    if (draft.status !== "DRAFT") {
      clearCrewBookingIntent(crewIntentStorage(), service.slug);
      router.replace(requestHref(draft.id) as never);
      return;
    }
    if (restoredServerDraftId.current === draft.id) return;
    const intent = toDraftIntent(draft);
    const restore = setTimeout(() => {
      restoredServerDraftId.current = draft.id;
      const restored = isEvent ? syncHeadcount(intent.answers, roles) : intent.answers;
      setRequirementId(draft.id);
      setAnswers((current) => ({ ...current, ...restored }));
      setAddressId(intent.addressId);
      setRequestedStart(intent.requestedStart ?? "");
      setReportingTime(intent.requestedStartTime);
      setBookingStep(resumeCrewBookingStep(questions, restored));
    }, 0);
    return () => clearTimeout(restore);
  }, [isEvent, questions, requirementQuery.data, roles, router, service.slug]);

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
      const draft = await createRequirement.mutateAsync({ variantId: variant.id, answers, language: "en-IN" });
      restoredServerDraftId.current = draft.id;
      setRequirementId(draft.id);
      return draft.id;
    })().catch((error: unknown) => {
      creating.current = null;
      throw error;
    });
    return creating.current;
  }

  function startInstant(): string {
    return combineStart(requestedStart, asksReportingTime ? reportingTime : null);
  }

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

  function handleRoleGender(code: string, gender: "men" | "women", value: number) {
    setAnswers((current) => withRoleGenderCount(current, roles, code, gender, value));
  }

  function handleAnswer(code: string, value: unknown) {
    setAnswers((current) => {
      if (isEvent && typeof value === "number" && roles.some((role) => role.code === code)) {
        return withRoleCount(current, roles, code, value);
      }
      if (isEvent && (code === GUEST_BAND_CODE || code === SERVICE_STYLE_CODE)) {
        const next = { ...current, [code]: value };
        return applyServingSuggestion(
          next,
          roles,
          suggestedServers(next[GUEST_BAND_CODE], next[SERVICE_STYLE_CODE]),
          suggestedServers(current[GUEST_BAND_CODE], current[SERVICE_STYLE_CODE]),
        );
      }
      if (code !== workQuestion?.code || value === OTHER_WORK_TYPE) return { ...current, [code]: value };
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
          router.push(requestHref(targetId) as never);
        },
      },
    );
  }

  const duplicatesQuery = useProbableDuplicates(
    effectiveAddressId !== null && requestedStart !== ""
      ? { addressId: effectiveAddressId, requestedStart: startInstant(), variantId: variant.id }
      : null,
  );
  const requestToReopen = duplicatesQuery.data?.find((duplicate) => duplicate.mergeable) ?? null;
  const refetchDuplicates = duplicatesQuery.refetch;

  useEffect(() => {
    if (requestToReopen === null) return;
    clearCrewBookingIntent(crewIntentStorage(), service.slug);
    router.replace(requestHref(requestToReopen.id) as never);
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
      presentation="none"
      openSignal={addressSignal}
      onSelect={(id) => setAddressId(id)}
    />
  );
  const hiddenCodes = isEvent ? hiddenEventQuestionCodes(answers) : hiddenCrewQuestionCodes(answers, questions);
  const siteLine = address === null ? null : addressSummaryLine(address);
  const whenLine = joinPresent([
    requestedStart === "" ? null : formatShortDate(requestedStart),
    asksReportingTime && reportingTime !== null ? formatReportingTime(reportingTime) : null,
  ]);
  const eventSummary: readonly SummaryLine[] = isEvent
    ? [
        { key: "occasion", label: "Occasion", value: joinPresent([eventTypeLabel, guestBandLabel === null ? null : `${guestBandLabel} guests`, serviceStyleLabel]) },
        {
          key: "crew",
          label: "Crew",
          value: mixLabel === null ? null : `${mixLabel} — ${roleTotal(roles, answers)} people × ${size?.days ?? 1} days`,
        },
        { key: "when", label: "Reports", value: whenLine },
        { key: "site", label: "Venue", value: siteLine },
        {
          key: "presentation",
          label: "Turnout",
          value: joinPresent([
            optionLabel(presentation, DRESS_CODE_CODE, answers),
            answers[STAFF_MEAL_CODE] === true ? "Meal provided" : answers[STAFF_MEAL_CODE] === false ? "No meal" : null,
          ]),
        },
      ]
    : [];

  function handleExitFlow() {
    if (router.canGoBack()) router.back();
    else router.push("/catalog");
  }

  if (bookingStep === "work" && workQuestion !== null) {
    return (
      <WorkPickerScreen
        serviceName={service.name}
        question={workQuestion}
        value={workValue}
        onSelect={(value) => handleAnswer(workQuestion.code, value)}
        onContinue={() => {
          if (workLabel !== null) setBookingStep("details");
        }}
        onBack={handleExitFlow}
      />
    );
  }

  if (isEvent && bookingStep === "occasion") {
    return (
      <OccasionScreen
        serviceName={service.name}
        questions={occasion}
        answers={answers}
        onAnswer={handleAnswer}
        hiddenCodes={hiddenCodes}
        onContinue={() => setBookingStep("crew")}
        onBack={handleExitFlow}
      />
    );
  }

  if (isEvent && bookingStep === "crew") {
    return (
      <CrewScreen
        serviceName={service.name}
        roles={roles}
        daysQuestion={daysQuestion}
        answers={answers}
        onRoleGender={handleRoleGender}
        onDays={(value) => handleAnswer(DURATION_CODE, value)}
        suggestion={suggestion}
        suggestionBasis={joinPresent([guestBandLabel === null ? null : `a ${guestBandLabel.toLowerCase()} guest`, serviceStyleLabel?.toLowerCase() ?? null], " ")}
        onContinue={() => setBookingStep("details")}
        onBack={() => setBookingStep("occasion")}
      />
    );
  }

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
        saveError={writeErrorMessage === null ? undefined : <JobFormError message={writeErrorMessage} />}
        stepLabel="Step 3 of 3"
        selectedWorkEyebrow="Your event"
        selectedWorkLabel={joinPresent([eventTypeLabel, mixLabel]) ?? "Your crew"}
        onChangeWork={() => setBookingStep("crew")}
        onBack={() => setBookingStep("crew")}
      />
    ) : (
      <JobFormScreen
        serviceName={service.name}
        title={isFixedTeam ? "Book a cook" : undefined}
        heading={isFixedTeam ? "Plan your house function" : undefined}
        questions={detailQuestions}
        answers={answers}
        hiddenCodes={hiddenCodes}
        onAnswer={handleAnswer}
        requestedStart={requestedStart === "" ? null : requestedStart}
        onRequestedStart={setRequestedStart}
        dateLabel={isFixedTeam ? "Event date" : undefined}
        dateHorizonDays={isFixedTeam ? EVENT_DATE_HORIZON_DAYS : undefined}
        reportingTime={isFixedTeam ? reportingTime : undefined}
        onReportingTime={isFixedTeam ? setReportingTime : undefined}
        addressLine={siteLine}
        onOpenAddress={() => setAddressSignal((signal) => signal + 1)}
        addressPicker={addressPicker}
        canContinue={formComplete}
        isSaving={saveRequirement.isPending || createRequirement.isPending}
        onContinue={() => void handleShowRate()}
        saveError={writeErrorMessage === null ? undefined : <JobFormError message={writeErrorMessage} />}
        stepLabel={workQuestion === null ? "Step 1 of 2" : "Step 2 of 3"}
        selectedWorkLabel={workQuestion === null ? null : (workLabel ?? "Selected work")}
        onChangeWork={workQuestion === null ? undefined : () => setBookingStep("work")}
        aboutPanel={
          workQuestion === null ? (
            <View className="gap-3">
              <CrewAboutPanel service={service} />
              {isFixedTeam ? <FixedTeamAssurance /> : null}
            </View>
          ) : null
        }
        afterQuestions={isFixedTeam && guestLimit !== null ? <LargeFunctionHandoff guestLimit={guestLimit} /> : undefined}
        onBack={workQuestion === null ? handleExitFlow : () => setBookingStep("work")}
      />
    );
  }

  return (
    <RateScreen
      rate={rate}
      isStale={previewQuery.isFetching}
      onBack={() => setBookingStep("details")}
      onBook={() => void handleBook()}
      isBooking={isBooking}
      notice={<RailFooterNotices book={book} />}
      summary={
        isEvent ? (
          <EventSummaryCard lines={eventSummary} onChange={() => setBookingStep("details")} />
        ) : isFixedTeam && guestLimit !== null ? (
          <FixedTeamRateSummary days={size?.days ?? 1} guestLimit={guestLimit} />
        ) : undefined
      }
      crewLabel={isEvent && mixLabel !== null ? "for the whole event" : isFixedTeam ? "for the cook team, full day" : undefined}
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

function FixedTeamAssurance() {
  return (
    <View className="rounded-[18px] border border-selected-line bg-selected-surface p-4">
      <Text className="text-sm font-bold text-text">Your cook brings their own helpers.</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        For 25–50 guests that's usually a master cook and 2 helpers. You don't pay them separately — it's one price.
      </Text>
    </View>
  );
}

function LargeFunctionHandoff({ guestLimit }: { guestLimit: number }) {
  return (
    <View className="rounded-[18px] border border-line-strong bg-surface-sunken p-4">
      <Text className="text-sm font-bold text-text">Planning something bigger?</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        Above {guestLimit} guests, cooks price the menu rather than the day — dish count and veg/non-veg change the work a lot.
      </Text>
      <Link href="/requests/new/event-cook" asChild>
        <Pressable accessibilityRole="button" className="mt-3 min-h-12 flex-row items-center justify-between gap-3 rounded-[14px] bg-navy-900 px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-white">Get quotes from event cooks</Text>
            <Text className="mt-0.5 text-xs leading-5 text-white/70">
              Up to 3 written quotes, priced per plate. You still buy the groceries — they'll send you the shopping list.
            </Text>
          </View>
          <Text className="shrink-0 text-lg text-white">→</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function FixedTeamRateSummary({ days, guestLimit }: { days: number; guestLimit: number }) {
  return (
    <View className="rounded-2xl border border-selected-line bg-selected-surface p-4">
      <Text className="text-sm font-bold text-text">
        One cook team · {days} {days === 1 ? "day" : "days"} · up to {guestLimit} guests
      </Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        Includes the master cook and their helpers. You provide groceries, gas and vessels.
      </Text>
    </View>
  );
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function addressSummaryLine(address: Address): string {
  const locality = address.locality || address.city;
  return locality === "" ? address.postal_code : `${locality} — ${address.postal_code}`;
}

function RailFooterNotices({ book }: { book: ReturnType<typeof useBookAtPublishedRate> }) {
  if (isRequirementDuplicate(book.error)) {
    return (
      <View accessibilityLiveRegion="polite" className="rounded-card border border-line bg-surface-sunken p-4">
        <Text className="font-semibold text-text">Opening your existing request</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          This crew is already requested for the same place and dates, so we are reopening it.
        </Text>
      </View>
    );
  }
  if (book.error !== null) {
    return <ErrorState title="We could not book that" message={bookFailureCopy(book.error)} severity="error" inline />;
  }
  return null;
}

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
      <View className="rounded-card border border-warning-line bg-warning-surface p-4">
        <Text className="font-semibold text-text">We need a little more to price this</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          {reason ?? "Tell us how many people you need, and for how many days."}
        </Text>
      </View>
    );
  }
  return (
    <View className="rounded-card border border-line bg-surface-sunken p-4">
      <Text className="font-semibold text-text">We do not have a published day rate for this yet</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        {reason ??
          "We have not published a day rate for this work in this area, so we cannot book a crew instantly here."}{" "}
        We will not guess a price. You can describe the job instead and get quotes from professionals — that costs nothing to send.
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Link href={`/requests/new/${serviceSlug}` as never} asChild>
          <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
            <Text className="text-sm font-semibold text-action-text">Get quotes instead</Text>
          </Pressable>
        </Link>
        <Link href={BROWSE_HREF as never} asChild>
          <Pressable accessibilityRole="button" className={buttonStyles({ variant: "ghost" })}>
            <Text className="text-sm font-semibold text-text-link">Browse other services</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function bookFailureCopy(error: unknown): string {
  if (isRateCardUnavailable(error)) {
    return "We do not have a published day rate for this work in this area, so we cannot book a crew instantly. Nothing has been sent and nothing is charged — describing the job and collecting quotes still works.";
  }
  if (isLifecycleUnsupported(error)) {
    return "We do not take crew bookings for this service yet. Nothing has been sent and nothing is charged.";
  }
  return describeError(error, "mutation").message;
}
