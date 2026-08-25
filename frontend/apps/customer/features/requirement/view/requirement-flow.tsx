"use client";

import { describeError, isLifecycleUnsupported } from "@vsolve/query";

import { BROWSE_HREF, requestHref } from "@/lib/routes";
import { ErrorState, useIsWideScreen } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAddresses } from "@/features/addresses/queries";
import {
  VisitPlanChooser as MobileVisitPlanChooser,
  defaultPlanSize,
} from "@/features/project-request/view/parts/visit-plan-chooser";
import { VisitsSendScreen } from "@/features/project-request/view/visits-send-screen";
import { WhatScreen as MobileWhatScreen } from "@/features/project-request/view/what-screen";
import { WhereWhenScreen as MobileWhereWhenScreen } from "@/features/project-request/view/where-when-screen";
import { WizardShell } from "@/features/project-request/view/wizard-shell";

import { toPlanTierViews } from "@/features/access/adapters";
import { useChooseVisitPlan, useVisitPlan } from "@/features/access/queries";
import { VisitPlanChooser } from "@/features/access/view/visit-plan-chooser";
import { guideToVisitPlanSelection } from "@/features/access/view/guide-to-visit-plan";
import {
  selectionOnlyQuestionSet,
  toDraftIntent,
  toLifecycleVerdict,
  toQuestionSet,
  type RequirementService,
  type RequirementVariant,
} from "../adapters";
import { SCREENS, screenIndex } from "../model/screens";
import { clearPersistedRequirement, RequirementProvider, useRequirement } from "./requirement-context";
import {
  useCreateRequirement,
  existingDraftId,
  useMyRequests,
  useProbableDuplicates,
  useRequirement as useRequirementRecord,
  useSaveRequirement,
  useSubmitRequirement,
  isRequirementExpired,
  isSubmitInProgress,
  type SaveRequirementInput,
} from "../queries";
import type { Screen } from "../model/screens";
import { briefSectionBlocks } from "../model/state";
import { ProjectBriefScreen } from "./project-brief-screen";
import { RequirementAddressPicker } from "./requirement-address-picker";
import { RequirementSent } from "./requirement-sent";
import { WhatScreen } from "./what-screen";
import { WhereWhenScreen } from "./where-when-screen";

/**
 * The three screens, wired to the published contract.
 * Step 1 of 3 — What needs doing?
 * Step 2 of 3 — Where and when?
 * Step 3 of 3 — Choose visits & send
 */

export interface RequirementFlowProps {
  /** The service the requirement is for. Its slug is the wire's `category_slug`. */
  service: RequirementService;
  /** The A3/A5 variant chosen by the route. Carries screen 1's questions. */
  variant: RequirementVariant;
  /** Optional catalog choice to save before dropping the Customer on Where/When. */
  initialSelection?: string | null;
}

export function RequirementFlow(props: RequirementFlowProps) {
  return (
    <RequirementProvider categorySlug={props.service.slug}>
      <FlowBody {...props} />
    </RequirementProvider>
  );
}

type FlowBodyProps = RequirementFlowProps;

/** The query parameter carrying the chosen service. Also read on the way in. */
const SELECTED_SERVICE_PARAM = "selected_service";

/**
 * Midnight local, as an ISO date-time.
 */
function startOfLocalDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0).toISOString();
}

export function toPlaceAndDateSaveInput({
  requirementId,
  addressId,
  requestedStart,
  flexibilityDays,
  serviceBy,
}: {
  requirementId: string;
  addressId: string | null;
  requestedStart: string | null;
  flexibilityDays: number;
  serviceBy: string | null;
}): SaveRequirementInput | null {
  if (addressId === null || requestedStart === null) return null;
  return {
    requirementId,
    addressId,
    requestedStart: startOfLocalDay(requestedStart),
    flexibilityDays,
    serviceBy,
  };
}

export function isWorkspaceAdvancingForScreen({
  screen,
  isCreatingRequirement,
  isSavingRequirement,
}: {
  screen: Screen;
  isCreatingRequirement: boolean;
  isSavingRequirement: boolean;
}): boolean {
  if (screen === "what") return isCreatingRequirement || isSavingRequirement;
  return isSavingRequirement;
}

/** Only the action visible on the current phone screen may busy its CTA. */
export function isWizardActionPending({
  screen,
  isAdvancingCurrentScreen,
  isPreparingSubmit,
  isSubmittingRequirement,
  isChoosingPlan,
}: {
  screen: Screen;
  isAdvancingCurrentScreen: boolean;
  isPreparingSubmit: boolean;
  isSubmittingRequirement: boolean;
  isChoosingPlan: boolean;
}): boolean {
  if (screen === "visits_send") {
    return (
      isAdvancingCurrentScreen ||
      isPreparingSubmit ||
      isSubmittingRequirement ||
      isChoosingPlan
    );
  }
  return isAdvancingCurrentScreen;
}

/**
 * The saved draft, as much of it as the submit path needs.
 */
export interface PreparedDraft {
  requirementId: string;
  isA5: boolean;
}

interface SubmitPreparation {
  saveAnswers: () => Promise<PreparedDraft | null>;
  savePlaceAndDates: (requirementId: string) => Promise<boolean>;
  onPlaceAndDateFailure: () => void;
}

/** Make the server draft match the brief currently visible in the browser. */
export async function prepareRequirementForSubmit({
  saveAnswers,
  savePlaceAndDates,
  onPlaceAndDateFailure,
}: SubmitPreparation): Promise<PreparedDraft | null> {
  const prepared = await saveAnswers();
  if (prepared === null) return null;

  if (!(await savePlaceAndDates(prepared.requirementId))) {
    onPlaceAndDateFailure();
    return null;
  }
  return prepared;
}

function FlowBody({
  service,
  variant,
  initialSelection = null,
}: FlowBodyProps) {
  const {
    state,
    dispatch,
    hasRestoredIntent,
    today,
    advance,
    back,
    open,
    canContinue,
  } = useRequirement();
  const initialSelectionApplied = useRef(false);
  const isWide = useIsWideScreen();
  const router = useRouter();
  const [addressSignal, setAddressSignal] = useState(0);
  const addresses = useAddresses();
  const [pendingPlanSize, setPendingPlanSize] = useState<number | null>(null);
  const [isPreparingSubmit, setIsPreparingSubmit] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createRequirement = useCreateRequirement();
  const saveRequirement = useSaveRequirement();
  const submitRequirement = useSubmitRequirement();
  const requestsQuery = useMyRequests(hasRestoredIntent && state.requirementId === null);
  const resumableRequirementId =
    state.requirementId ?? existingDraftId(requestsQuery.data ?? [], service.slug);

  const questionSet = selectionOnlyQuestionSet(service.slug, toQuestionSet(variant));

  const serviceQuestion = questionSet.questions.find((question) => question.kind === "choice");
  const chosenService =
    serviceQuestion === undefined
      ? null
      : typeof state.answers[serviceQuestion.code] === "string"
        ? (state.answers[serviceQuestion.code] as string)
        : null;

  useEffect(() => {
    if (chosenService === null) return;
    if (searchParams.get(SELECTED_SERVICE_PARAM) === chosenService) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(SELECTED_SERVICE_PARAM, chosenService);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [chosenService, pathname, router, searchParams]);

  const duplicatesQuery = useProbableDuplicates(
    state.addressId !== null && state.requestedStart !== null
      ? {
          addressId: state.addressId,
          requestedStart: startOfLocalDay(state.requestedStart),
          variantId: variant.id,
        }
      : null,
  );
  const duplicates = duplicatesQuery.data ?? [];
  const requestToReopen = duplicates.find((duplicate) => duplicate.mergeable) ?? null;

  useEffect(() => {
    if (requestToReopen === null) return;
    clearPersistedRequirement(service.slug);
    router.replace(requestHref(requestToReopen.id));
  }, [requestToReopen, router, service.slug]);

  const record = useRequirementRecord(resumableRequirementId);

  const isA5 = state.verdict?.lifecycle === "A5_CUSTOM_PROJECT";
  const planQuery = useVisitPlan(state.requirementId, isA5);
  const choosePlan = useChooseVisitPlan();
  const planState = planQuery.data ?? null;
  const savedPlanSize = planState?.plan?.plan_size ?? null;
  const planTiers = toPlanTierViews(planState?.available_tiers ?? []);
  const chosenPlanSize =
    pendingPlanSize !== null && pendingPlanSize !== savedPlanSize
      ? pendingPlanSize
      : (savedPlanSize ?? defaultPlanSize(planTiers));

  const submitted = submitRequirement.data;
  const writeError = createRequirement.error ?? saveRequirement.error ?? null;
  const isWriting = createRequirement.isPending || saveRequirement.isPending;
  const isAdvancingCurrentScreen = isWorkspaceAdvancingForScreen({
    screen: state.screen,
    isCreatingRequirement: createRequirement.isPending,
    isSavingRequirement: saveRequirement.isPending,
  });

  useEffect(() => {
    if (submitted !== undefined) clearPersistedRequirement(service.slug);
  }, [submitted, service.slug]);

  useEffect(() => {
    if (!hasRestoredIntent) return;
    if (initialSelectionApplied.current) return;
    if (isWriting) return;

    if (initialSelection === null || initialSelection === undefined) return;

    const question = questionSet.questions.find((candidate) => candidate.kind === "choice");
    if (question === undefined) return;
    if (!(question.options ?? []).some((option) => option.value === initialSelection)) return;

    if (chosenService === initialSelection && state.requirementId !== null) {
      initialSelectionApplied.current = true;
      return;
    }

    initialSelectionApplied.current = true;
    dispatch({ type: "ANSWER", questionCode: question.code, value: initialSelection });
    advance();
  }, [
    advance,
    chosenService,
    dispatch,
    hasRestoredIntent,
    initialSelection,
    isWriting,
    questionSet.questions,
    state.requirementId,
  ]);

  useEffect(() => {
    const draft = record.data;
    if (!hasRestoredIntent || submitted !== undefined || draft === undefined) return;

    if (draft.status !== "DRAFT") {
      clearPersistedRequirement(service.slug);
      router.replace(requestHref(draft.id));
      return;
    }

    if (state.requirementId === null) {
      const intent = toDraftIntent(draft);
      dispatch({
        type: "RESTORE_SERVER_DRAFT",
        requirementId: draft.id,
        answers: intent.answers,
        verdict: toLifecycleVerdict(draft),
        addressId: intent.addressId,
        requestedStart: intent.requestedStart,
        serviceBy: intent.serviceBy,
        flexibilityDays: intent.flexibilityDays,
      });
      return;
    }

    dispatch({
      type: "APPLY_VERDICT",
      verdict: toLifecycleVerdict(draft),
      requirementId: draft.id,
    });
  }, [
    dispatch,
    hasRestoredIntent,
    record.data,
    router,
    service.slug,
    state.requirementId,
    submitted,
  ]);

  if (submitted !== undefined) {
    return (
      <RequirementSent
        requirementId={submitted.id}
        isFree={submitted.is_free}
        quoteDeadlineAt={submitted.quote_delivery_deadline_at}
        requestHref={requestHref(submitted.id)}
        browseHref={BROWSE_HREF}
      />
    );
  }

  async function saveAnswers(answers = state.answers): Promise<PreparedDraft | null> {
    try {
      let targetId = state.requirementId ?? existingDraftId(requestsQuery.data ?? [], service.slug);
      if (targetId === null && requestsQuery.isPending) {
        const lookup = await requestsQuery.refetch();
        targetId = existingDraftId(lookup.data ?? [], service.slug);
      }
      const draft =
        targetId === null
          ? await createRequirement.mutateAsync({
              variantId: variant.id,
              answers,
              language: "en-IN",
            })
          : await saveRequirement.mutateAsync({
              requirementId: targetId,
              answers,
            });
      const verdict = toLifecycleVerdict(draft);
      dispatch({
        type: "APPLY_VERDICT",
        verdict,
        requirementId: draft.id,
      });
      return {
        requirementId: draft.id,
        isA5: verdict?.lifecycle === "A5_CUSTOM_PROJECT",
      };
    } catch {
      return null;
    }
  }

  async function savePlaceAndDates(requirementId: string): Promise<boolean> {
    const input = toPlaceAndDateSaveInput({
      requirementId,
      addressId: state.addressId,
      requestedStart: state.requestedStart,
      flexibilityDays: state.flexibilityDays,
      serviceBy: state.serviceBy,
    });
    if (input === null) return false;
    try {
      await saveRequirement.mutateAsync(input);
      return true;
    } catch {
      return false;
    }
  }

  async function handleAdvance() {
    if (!canContinue) return;
    if (state.screen === "what") {
      if ((await saveAnswers()) === null) return;
      advance();
    } else if (state.screen === "where_when") {
      let targetId = state.requirementId;
      if (targetId === null) {
        const prepared = await saveAnswers();
        if (prepared === null) return;
        targetId = prepared.requirementId;
      }
      if (await savePlaceAndDates(targetId)) {
        advance();
      }
    }
  }

  const addressLine = addressSummaryLine(addresses.data ?? [], state.addressId);
  const chosenPlanPrice =
    planTiers.find((tier) => tier.planSize === chosenPlanSize)?.priceLabel ?? null;
  const needsVisitPlanSelection = isA5 && chosenPlanSize === null;

  const sectionBlocks = briefSectionBlocks(state, today, false);
  /** What is stopping the send, in the order the page reads. */
  const briefBlocked =
    sectionBlocks.what ?? sectionBlocks.where_when ?? sectionBlocks.visits_send ?? null;
  const canSendBrief = briefBlocked === null;
  const canSubmit = canSendBrief && !needsVisitPlanSelection;

  async function handleSubmit() {
    if (
      !canSendBrief ||
      isWriting ||
      isPreparingSubmit ||
      choosePlan.isPending ||
      submitRequirement.isPending
    ) {
      return;
    }

    submitRequirement.reset();
    setIsPreparingSubmit(true);
    try {
      const prepared = await prepareRequirementForSubmit({
        saveAnswers,
        savePlaceAndDates,
        onPlaceAndDateFailure: () => open("where_when"),
      });
      if (prepared === null) return;

      if (prepared.isA5 && chosenPlanSize === null) {
        guideToVisitPlanSelection();
        return;
      }

      await persistVisitPlanSelectionForSubmit({
        isA5: prepared.isA5,
        requirementId: prepared.requirementId,
        selectedPlanSize: chosenPlanSize,
        savedPlanSize,
        choose: (input) => choosePlan.mutateAsync(input),
      });
      setPendingPlanSize(null);

      await submitRequirement.mutateAsync({
        requirementId: prepared.requirementId,
        allowDuplicate: false,
      });
    } catch {
      // Swallowed mutation errors handled in notices
    } finally {
      setIsPreparingSubmit(false);
    }
  }

  const sendActionPending =
    isPreparingSubmit || submitRequirement.isPending || choosePlan.isPending;
  const wizardActionPending = isWizardActionPending({
    screen: state.screen,
    isAdvancingCurrentScreen,
    isPreparingSubmit,
    isSubmittingRequirement: submitRequirement.isPending,
    isChoosingPlan: choosePlan.isPending,
  });

  const notices = (
    <FlowNotices
      writeError={writeError}
      choosePlanError={choosePlan.error}
      submitError={submitFailureCopy(submitRequirement.error)}
    />
  );

  const sendLabel = needsVisitPlanSelection
    ? "Select number of estimates"
    : visitPlanSubmitLabel(chosenPlanSize);

  function handleSend() {
    if (needsVisitPlanSelection) {
      guideToVisitPlanSelection();
      return;
    }
    void handleSubmit();
  }

  if (!isWide) {
    const stepFor: Record<Screen, number> = {
      what: 1,
      where_when: 2,
      visits_send: 3,
    };
    const isFinal = state.screen === "visits_send";

    return (
      <WizardShell
        title={service.name}
        step={stepFor[state.screen]}
        onBack={() => (state.screen === "what" ? router.back() : back())}
        onContinue={() => {
          if (!isFinal) {
            void handleAdvance();
            return;
          }
          handleSend();
        }}
        canContinue={isFinal ? (needsVisitPlanSelection ? canSendBrief : canSubmit) : canContinue}
        isSaving={wizardActionPending}
        continueLabel={isFinal ? sendLabel : "Continue"}
        reassurance={
          isFinal
            ? chosenPlanPrice === null
              ? "Free to send. Nothing is booked yet."
              : `Free to send. ${chosenPlanPrice} only when a pro confirms a time.`
            : undefined
        }
      >
        {notices}

        {state.screen === "what" ? (
          <MobileWhatScreen
            questions={questionSet.questions}
            answers={state.answers}
            onAnswer={(code, value) => dispatch({ type: "ANSWER", questionCode: code, value })}
          />
        ) : state.screen === "where_when" ? (
          <MobileWhereWhenScreen
            addressLine={addressLine}
            onOpenAddress={() => setAddressSignal((signal) => signal + 1)}
            addressPicker={
              <RequirementAddressPicker
                variantId={variant.id}
                presentation="none"
                openSignal={addressSignal}
              />
            }
            requestedStart={state.requestedStart}
            onRequestedStart={(isoDate) =>
              dispatch({ type: "SET_REQUESTED_START", requestedStart: isoDate })
            }
            flexibilityDays={state.flexibilityDays}
            onFlexibilityDays={(days) => dispatch({ type: "SET_FLEXIBILITY_DAYS", days })}
            serviceBy={state.serviceBy}
            onServiceBy={(isoDate) => dispatch({ type: "SET_SERVICE_BY", serviceBy: isoDate })}
          />
        ) : (
          <VisitsSendScreen
            serviceName={service.name}
            questions={questionSet.questions}
            answers={state.answers}
            addressLine={addressLine}
            requestedStart={state.requestedStart}
            flexibilityDays={state.flexibilityDays}
            serviceBy={state.serviceBy}
            visitPlanChooser={
              isA5 && state.requirementId !== null ? (
                <MobileVisitPlanChooser
                  tiers={planTiers}
                  value={chosenPlanSize}
                  onChange={(planSize) => {
                    choosePlan.reset();
                    setPendingPlanSize(planSize);
                  }}
                  isLoading={planQuery.isPending}
                />
              ) : undefined
            }
          />
        )}
      </WizardShell>
    );
  }

  return (
    <ProjectBriefScreen
      notice={notices}
      heading={`Tell us about ${service.name.toLowerCase()}`}
      intro="Nobody prices work like this without seeing it, so this is a brief — not a checkout."
      activeIndex={screenIndex(state.screen)}
      onSelectSection={(index) => {
        const screen = SCREENS[index];
        if (screen !== undefined) open(screen);
      }}
      onSend={handleSend}
      sendLabel={sendLabel}
      isSaving={isWriting || sendActionPending}
      blocked={briefBlocked}
      sections={[
        {
          title: "What needs doing",
          blocked: sectionBlocks.what,
          children: (
            <WhatScreen
              categoryName={service.name}
              questions={questionSet.questions}
              isChoosing={isWriting}
              unsupportedQuestions={questionSet.unsupported}
              hideHeading
            />
          ),
        },
        {
          title: "Where and when",
          blocked: sectionBlocks.where_when,
          children: (
            <WhereWhenScreen
              addressPicker={<RequirementAddressPicker variantId={variant.id} />}
              minDate={today}
              hideHeading
            />
          ),
        },
        {
          title: "Choose visits & send",
          blocked: sectionBlocks.visits_send,
          children: (
            <VisitsSendScreen
              serviceName={service.name}
              questions={questionSet.questions}
              answers={state.answers}
              addressLine={addressLine}
              requestedStart={state.requestedStart}
              flexibilityDays={state.flexibilityDays}
              serviceBy={state.serviceBy}
              visitPlanChooser={
                isA5 && state.requirementId !== null ? (
                  <VisitPlanChooser
                    tiers={planTiers}
                    chosenPlanSize={chosenPlanSize}
                    locked={false}
                    isLoading={planQuery.isPending}
                    readError={planQuery.error}
                    onRetryRead={() => void planQuery.refetch()}
                    onChoose={(planSize) => {
                      choosePlan.reset();
                      setPendingPlanSize(planSize);
                    }}
                    isChoosing={choosePlan.isPending}
                    chooseError={choosePlan.error}
                  />
                ) : undefined
              }
            />
          ),
        },
      ]}
    />
  );
}

/** Locality and pincode. A full address truncates to the part that identifies nothing. */
function addressSummaryLine(
  addresses: readonly { id: string; locality: string; city: string; postal_code: string }[],
  addressId: string | null,
): string | null {
  if (addressId === null) return null;
  const address = addresses.find((candidate) => candidate.id === addressId);
  if (address === undefined) return null;
  const locality = address.locality || address.city;
  return locality === "" ? address.postal_code : `${locality} — ${address.postal_code}`;
}

interface PersistVisitPlanSelectionInput {
  readonly isA5: boolean;
  readonly requirementId: string;
  readonly selectedPlanSize: number | null;
  readonly savedPlanSize: number | null;
  readonly choose: (input: { requirementId: string; planSize: number }) => Promise<unknown>;
}

/**
 * Save the one count visible on screen before matching is opened.
 *
 * A tap is only form state. The submit action awaits this write, so a draft
 * that previously held three cannot be sent while the screen says one.
 */
export async function persistVisitPlanSelectionForSubmit({
  isA5,
  requirementId,
  selectedPlanSize,
  savedPlanSize,
  choose,
}: PersistVisitPlanSelectionInput): Promise<void> {
  if (!isA5 || selectedPlanSize === null || selectedPlanSize === savedPlanSize) return;
  await choose({ requirementId, planSize: selectedPlanSize });
}

function visitPlanSubmitLabel(planSize: number | null): string {
  if (planSize === null) return "Send this request";
  return planSize === 1 ? "Send to 1 professional" : `Send to ${planSize} professionals`;
}

/**
 * The sentence under a refused submit.
 *
 * Three refusals are named because each needs a different next action and the
 * generic recovery copy gets all three wrong: a duplicate is resolved by the
 * notice above rather than by retrying, an expiry never comes back, and an
 * in-progress idempotent command must be waited out rather than resent.
 */
function submitFailureCopy(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (isSubmitInProgress(error)) {
    return "We are already sending this one. Give it a moment and refresh — sending it twice would ask the same professionals twice.";
  }
  if (isRequirementExpired(error)) {
    return "The date you needed this by has passed, so we have closed it. Start a new request with a later date.";
  }
  if (isLifecycleUnsupported(error)) {
    return "We do not cover this kind of request yet. Nothing has been sent and nothing is charged.";
  }
  return describeError(error, "mutation").message;
}

function FlowNotices({
  writeError,
  choosePlanError,
  submitError,
}: {
  writeError: unknown;
  choosePlanError?: unknown;
  submitError?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {writeError !== null && writeError !== undefined ? (
        <ErrorState
          title="We could not save that"
          message={
            isLifecycleUnsupported(writeError)
              ? "We do not take requests for this service yet. Nothing you entered has been sent."
              : describeError(writeError, "mutation").message
          }
          severity="error"
          inline
        />
      ) : null}
      {choosePlanError !== null && choosePlanError !== undefined ? (
        <ErrorState
          title="We could not save that choice"
          message={describeError(choosePlanError, "mutation").message}
          severity="error"
          inline
        />
      ) : null}
      {submitError !== null && submitError !== undefined ? (
        <ErrorState
          title="We could not send that"
          message={submitError}
          severity="error"
          inline
        />
      ) : null}
    </div>
  );
}
