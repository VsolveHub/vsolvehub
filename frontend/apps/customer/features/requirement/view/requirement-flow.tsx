"use client";

import { describeError, isLifecycleUnsupported } from "@vsolve/query";

import { BROWSE_HREF, requestHref } from "@/lib/routes";
import { ErrorState, useIsWideScreen } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAddresses } from "@/features/addresses/queries";
import {
  VisitPlanChooser as MobileVisitPlanChooser,
  defaultPlanSize,
} from "@/features/project-request/view/parts/visit-plan-chooser";
import { VisitsSendScreen } from "@/features/project-request/view/visits-send-screen";
import { CustomerVisitSlotChooser } from "@/features/project-request/view/parts/customer-visit-slot-chooser";
import {
  customerVisitSelectionVersion,
  readCustomerVisitSlotGrid,
  tokensForCustomerVisitSelection,
} from "@/features/project-request/model/customer-visit-slots";
import { WhatScreen as MobileWhatScreen } from "@/features/project-request/view/what-screen";
import { WhereWhenScreen as MobileWhereWhenScreen } from "@/features/project-request/view/where-when-screen";
import { WizardShell } from "@/features/project-request/view/wizard-shell";

import { toPlanTierViews } from "@/features/access/adapters";
import {
  useChooseCustomerVisitSlots,
  useChooseVisitPlan,
  useCustomerVisitSlotGrid,
  useVisitPlan,
  type ChooseCustomerVisitSlotsInput,
  type CustomerVisitSlotGrid,
} from "@/features/access/queries";
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
import { activeScreens, firstScreen, stepNumber } from "../model/active-screens";
import { eventBriefShape } from "../model/event-brief";
import { screenIndex } from "../model/screens";
import { clearPersistedRequirement, RequirementProvider, useRequirement } from "./requirement-context";
import {
  useCreateRequirement,
  existingDraftId,
  useMyRequests,
  useProbableDuplicates,
  useRequirement as useRequirementRecord,
  useSaveRequirement,
  useSubmitRequirement,
  isDraftUnusable,
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
 *
 * ## Visit-first briefs skip step 1
 *
 * A variant that publishes no questions has nothing to show on "What needs
 * doing", so the flow opens on "Where and when" and counts "1 of 2" — see
 * `model/active-screens.ts`. The server draft is still created on the first
 * Continue (with `{}` answers); only the trigger moved from leaving step 1 to
 * leaving step 2.
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
  // The step-1 guard needs the catalogue's required codes before the server
  // has given a verdict; the provider cannot read the variant, so they are
  // derived here from the same question set the screens render.
  const questions = useMemo(
    () => selectionOnlyQuestionSet(props.service.slug, toQuestionSet(props.variant)).questions,
    [props.service.slug, props.variant],
  );
  const requiredAnswerCodes = useMemo(
    () => questions.filter((question) => question.required).map((question) => question.code),
    [questions],
  );
  const screens = useMemo(() => activeScreens(questions), [questions]);

  return (
    <RequirementProvider
      categorySlug={props.service.slug}
      requiredAnswerCodes={requiredAnswerCodes}
      screens={screens}
    >
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
  isChoosingSlots,
}: {
  screen: Screen;
  isAdvancingCurrentScreen: boolean;
  isPreparingSubmit: boolean;
  isSubmittingRequirement: boolean;
  isChoosingPlan: boolean;
  isChoosingSlots: boolean;
}): boolean {
  if (screen === "visits_send") {
    return (
      isAdvancingCurrentScreen ||
      isPreparingSubmit ||
      isSubmittingRequirement ||
      isChoosingPlan ||
      isChoosingSlots
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
  const [visitSlotOverrides, setVisitSlotOverrides] = useState<{
    requirementId: string | null;
    startsByIndex: Readonly<Record<number, string>>;
  }>({ requirementId: null, startsByIndex: {} });
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
  const briefShape = eventBriefShape(questionSet.questions);
  const requiredAnswerCodes = questionSet.questions
    .filter((question) => question.required)
    .map((question) => question.code);
  // The screens this brief walks. Same derivation the provider was given, so
  // the reducer, the step meter and the desktop rail all agree on the count.
  const screens = activeScreens(questionSet.questions);
  // Visit-first is the A5 shape: a pro visits, measures and quotes, so the
  // date is the visit date and there is no flexibility band or deadline to
  // ask. Read off the variant rather than the verdict because the verdict
  // does not exist until the first save — which, on a question-free brief,
  // is the Continue *after* this screen. Events keep their own date wording.
  const visitFirst =
    variant.fulfilment_archetype === "A5_CUSTOM_PROJECT" && !briefShape.isEvent;

  // `?selected_service=` is the service-picker brief's one choice — a brief
  // whose whole step 1 is a single choice question (the fit-out picker). On a
  // brief with several questions the first choice is merely the first
  // question, and syncing it to the URL would re-apply it on reload and skip
  // the rest of step 1.
  const serviceQuestion =
    questionSet.questions.length === 1
      ? questionSet.questions.find((question) => question.kind === "choice")
      : undefined;
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
  const chooseVisitSlots = useChooseCustomerVisitSlots();
  const visitSlotGridQuery = useCustomerVisitSlotGrid(
    state.requirementId,
    isA5 && state.screen === "visits_send",
  );
  const planState = planQuery.data ?? null;
  const savedPlanSize = planState?.plan?.plan_size ?? null;
  const planTiers = toPlanTierViews(planState?.available_tiers ?? []);
  const chosenPlanSize =
    pendingPlanSize !== null && pendingPlanSize !== savedPlanSize
      ? pendingPlanSize
      : (savedPlanSize ?? defaultPlanSize(planTiers));
  const customerVisitSlotGrid =
    visitSlotGridQuery.data === undefined
      ? null
      : readCustomerVisitSlotGrid(visitSlotGridQuery.data);
  const currentSlotOverrides =
    visitSlotOverrides.requirementId === state.requirementId
      ? visitSlotOverrides.startsByIndex
      : {};
  const selectedVisitStarts: readonly (string | null)[] =
    chosenPlanSize === null
      ? []
      : Array.from({ length: chosenPlanSize }, (_, index) => {
          const overridden = currentSlotOverrides[index];
          if (overridden !== undefined) return overridden;
          return (
            planState?.plan?.shares.find((share) => share.position === index + 1)
              ?.requested_start ?? null
          );
        });
  const selectedVisitSlotTokens = tokensForCustomerVisitSelection(
    customerVisitSlotGrid,
    selectedVisitStarts,
    chosenPlanSize,
  );

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

    const question = serviceQuestion;
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
    serviceQuestion,
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
      let draft;
      if (targetId === null) {
        draft = await createRequirement.mutateAsync({
          variantId: variant.id,
          answers,
          language: "en-IN",
        });
      } else {
        try {
          draft = await saveRequirement.mutateAsync({
            requirementId: targetId,
            answers,
          });
        } catch (saveError) {
          // Only a remembered draft that is gone (404) or already sent to vendors (409) is
          // replaced. A bad answer or a network failure must reach the customer instead of
          // quietly opening a second request.
          if (!isDraftUnusable(saveError)) throw saveError;
          clearPersistedRequirement(service.slug);
          draft = await createRequirement.mutateAsync({
            variantId: variant.id,
            answers,
            language: "en-IN",
          });
        }
      }
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
  const setupAccessQuestion = briefShape.setupAccessQuestion;
  const setupAccessControl =
    setupAccessQuestion === null
      ? null
      : {
          question: setupAccessQuestion,
          value:
            typeof state.answers[setupAccessQuestion.code] === "string"
              ? (state.answers[setupAccessQuestion.code] as string)
              : null,
          onChange: (value: string) =>
            dispatch({ type: "ANSWER", questionCode: setupAccessQuestion.code, value }),
        };
  const chosenPlanPrice =
    planTiers.find((tier) => tier.planSize === chosenPlanSize)?.priceLabel ?? null;
  const needsVisitPlanSelection = isA5 && chosenPlanSize === null;
  const needsVisitSlotSelection =
    isA5 && chosenPlanSize !== null && selectedVisitSlotTokens === null;

  const stateSectionBlocks = briefSectionBlocks(
    state,
    today,
    false,
    requiredAnswerCodes,
    screens,
  );
  const sectionBlocks = {
    ...stateSectionBlocks,
    visits_send:
      stateSectionBlocks.visits_send ??
      (needsVisitPlanSelection
        ? ("VISIT_PLAN_NOT_CHOSEN" as const)
        : needsVisitSlotSelection
          ? ("VISIT_SLOTS_NOT_CHOSEN" as const)
          : null),
  };
  /** What is stopping the send, in the order the page reads. */
  const briefBlocked =
    sectionBlocks.what ?? sectionBlocks.where_when ?? sectionBlocks.visits_send ?? null;
  const canSendBrief = briefBlocked === null;
  const canSubmit = canSendBrief;

  async function handleSubmit() {
    if (
      !canSendBrief ||
      isWriting ||
      isPreparingSubmit ||
      choosePlan.isPending ||
      chooseVisitSlots.isPending ||
      submitRequirement.isPending
    ) {
      return;
    }

    submitRequirement.reset();
    chooseVisitSlots.reset();
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

      const selectedStartsForSubmit = selectedVisitStarts.filter(
        (startsAt): startsAt is string => startsAt !== null,
      );
      if (
        prepared.isA5 &&
        (chosenPlanSize === null || selectedStartsForSubmit.length !== chosenPlanSize)
      ) {
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

      if (prepared.isA5 && chosenPlanSize !== null) {
        await persistCustomerVisitSlotsForSubmit({
          requirementId: prepared.requirementId,
          planSize: chosenPlanSize,
          selectedStarts: selectedStartsForSubmit,
          refreshGrid: async () => {
            const refreshed = await visitSlotGridQuery.refetch();
            if (refreshed.isError) throw refreshed.error;
            return refreshed.data ?? null;
          },
          choose: (input) => chooseVisitSlots.mutateAsync(input),
        });
      }

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
    isPreparingSubmit ||
    submitRequirement.isPending ||
    choosePlan.isPending ||
    chooseVisitSlots.isPending;
  const wizardActionPending = isWizardActionPending({
    screen: state.screen,
    isAdvancingCurrentScreen,
    isPreparingSubmit,
    isSubmittingRequirement: submitRequirement.isPending,
    isChoosingPlan: choosePlan.isPending,
    isChoosingSlots: chooseVisitSlots.isPending,
  });

  const notices = (
    <FlowNotices
      writeError={writeError}
      choosePlanError={choosePlan.error}
      chooseVisitSlotsError={chooseVisitSlots.error}
      submitError={submitFailureCopy(submitRequirement.error)}
    />
  );

  const sendLabel = needsVisitPlanSelection
    ? "Select number of estimates"
    : needsVisitSlotSelection
      ? "Choose visit times"
    : visitPlanSubmitLabel(chosenPlanSize);

  const visitSlotChooser =
    isA5 && state.requirementId !== null ? (
      <CustomerVisitSlotChooser
        planSize={chosenPlanSize}
        grid={customerVisitSlotGrid}
        selectedStarts={selectedVisitStarts}
        onChange={(visitIndex, startsAt) => {
          chooseVisitSlots.reset();
          setVisitSlotOverrides((current) => ({
            requirementId: state.requirementId,
            startsByIndex: {
              ...(current.requirementId === state.requirementId
                ? current.startsByIndex
                : {}),
              [visitIndex]: startsAt,
            },
          }));
        }}
        isLoading={visitSlotGridQuery.isPending}
        error={visitSlotGridQuery.error}
        onRetry={() => void visitSlotGridQuery.refetch()}
      />
    ) : undefined;

  function handleSend() {
    if (needsVisitPlanSelection) {
      guideToVisitPlanSelection();
      return;
    }
    if (needsVisitSlotSelection) {
      const chooser = document.querySelector<HTMLElement>("[data-customer-visit-slots]");
      chooser?.scrollIntoView({ behavior: "smooth", block: "center" });
      chooser?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      return;
    }
    void handleSubmit();
  }

  if (!isWide) {
    const isFinal = state.screen === "visits_send";

    return (
      <WizardShell
        title={service.name}
        step={stepNumber(screens, state.screen)}
        total={screens.length}
        onBack={() => (state.screen === firstScreen(screens) ? router.back() : back())}
        onContinue={() => {
          if (!isFinal) {
            void handleAdvance();
            return;
          }
          handleSend();
        }}
        canContinue={isFinal ? canSubmit : canContinue}
        isSaving={wizardActionPending}
        continueLabel={isFinal ? "Send a request" : "Continue →"}
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
            questions={briefShape.whatQuestions}
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
            eventMode={briefShape.isEvent}
            visitFirst={visitFirst}
            setupAccess={setupAccessControl}
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
            eventMode={briefShape.isEvent}
            visitFirst={visitFirst}
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
            visitSlotChooser={visitSlotChooser}
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
      activeIndex={screenIndex(state.screen, screens)}
      onSelectSection={(index) => {
        const screen = screens[index];
        if (screen !== undefined) open(screen);
      }}
      onContinue={() => {
        void handleAdvance();
      }}
      onLeave={() => router.back()}
      onSend={handleSend}
      sendLabel={sendLabel}
      isSaving={isWriting || sendActionPending}
      blocked={briefBlocked}
      sections={[
        // Only the sections this brief walks. A question-free variant renders
        // two; the rail numbers whatever it is handed.
        ...(screens.includes("what")
          ? [
              {
                title: "What needs doing",
                blocked: sectionBlocks.what,
                children: (
                  <WhatScreen
                    categoryName={service.name}
                    questions={briefShape.whatQuestions}
                    isChoosing={isWriting}
                    unsupportedQuestions={questionSet.unsupported}
                    hideHeading
                  />
                ),
              },
            ]
          : []),
        {
          title: "Where and when",
          blocked: sectionBlocks.where_when,
          children: (
            <WhereWhenScreen
              addressPicker={<RequirementAddressPicker variantId={variant.id} />}
              minDate={today}
              hideHeading
              eventMode={briefShape.isEvent}
              visitFirst={visitFirst}
              setupAccessQuestion={briefShape.setupAccessQuestion}
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
              eventMode={briefShape.isEvent}
              visitFirst={visitFirst}
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
              visitSlotChooser={visitSlotChooser}
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

interface PersistCustomerVisitSlotsInput {
  readonly requirementId: string;
  readonly planSize: number;
  readonly selectedStarts: readonly string[];
  readonly refreshGrid: () => Promise<CustomerVisitSlotGrid | null>;
  readonly choose: (input: ChooseCustomerVisitSlotsInput) => Promise<unknown>;
}

/**
 * Refresh expiring signed tokens, resolve the Customer's visible choices
 * against that snapshot, and store them before matching is opened.
 */
export async function persistCustomerVisitSlotsForSubmit({
  requirementId,
  planSize,
  selectedStarts,
  refreshGrid,
  choose,
}: PersistCustomerVisitSlotsInput): Promise<void> {
  const rawGrid = await refreshGrid();
  if (rawGrid === null) throw new Error("Visit times could not be refreshed.");
  const grid = readCustomerVisitSlotGrid(rawGrid);
  const slotIds = tokensForCustomerVisitSelection(grid, selectedStarts, planSize);
  if (slotIds === null) {
    throw new Error("One or more selected visit times are no longer available.");
  }
  await choose({
    requirementId,
    slotIds,
    selectionVersion: customerVisitSelectionVersion(grid, selectedStarts),
  });
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
  chooseVisitSlotsError,
  submitError,
}: {
  writeError: unknown;
  choosePlanError?: unknown;
  chooseVisitSlotsError?: unknown;
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
      {chooseVisitSlotsError !== null && chooseVisitSlotsError !== undefined ? (
        <ErrorState
          title="We could not save those visit times"
          message={describeError(chooseVisitSlotsError, "mutation").message}
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
