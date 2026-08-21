"use client";

import { describeError, isLifecycleUnsupported } from "@vsolve/query";

import type { Schemas } from "@vsolve/api-client";
import { BROWSE_HREF, requestHref } from "@/lib/routes";
import { ErrorState, useIsWideScreen } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAddresses } from "@/features/addresses/queries";
import { DetailsScreen as MobileDetailsScreen } from "@/features/project-request/view/details-screen";
import { ReviewScreen as MobileReviewScreen } from "@/features/project-request/view/review-screen";
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
  toAttachmentRows,
  toQuestionSet,
  toServerAttachments,
  type RequirementQuestionView,
  type RequirementService,
  type RequirementVariant,
} from "../adapters";
import { SCREENS, screenIndex } from "../model/screens";
import type { DraftAttachment } from "../model/state";
import { MAXIMUM_ATTACHMENTS } from "../model/upload";
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
import { useAttachments } from "../use-attachments";
import type { Screen } from "../model/screens";
import { briefSectionBlocks } from "../model/state";
import { DetailsScreen } from "./details-screen";
import { ProjectBriefScreen } from "./project-brief-screen";
import { RequirementAddressPicker } from "./requirement-address-picker";
import { RequirementSent } from "./requirement-sent";
import { VoiceNoteRecorder } from "./voice-note-recorder";
import { RequirementWorkspace } from "./requirement-workspace";
import { ReviewScreen } from "./review-screen";
import { WhatScreen } from "./what-screen";
import { WhereWhenScreen } from "./where-when-screen";

/**
 * The four screens, wired to contract 1.21.0.
 *
 * Everything under `features/requirement/` was built to take what a query would
 * give it. This is that query layer's one call site, and the shape of the file
 * is the evidence that the seam held: it holds no copy, no layout and no
 * validation rule — only *when* to write to the server and what to do with the
 * answer.
 *
 * ## When it writes
 *
 * Once per screen, on the way forward — not on every keystroke. Four writes for
 * four screens, each carrying only what that screen collected:
 *
 * | Leaving | Sends | Because |
 * |---|---|---|
 * | `what` | `POST /requirements/` or `PATCH {answers}` | The answers are what the lifecycle is inferred from, and the response *is* the verdict screen 1 renders. |
 * | `where_when` | `PATCH {address, dates, flexibility}` | Serviceability is resolved server-side from the address, and the duplicate check needs a saved start. |
 * | `details` | `PATCH {additional_details, language}` | Attachments write themselves as they are picked — an upload cannot wait for "Next" — so what is left is the text and the language the voice note was recorded in. |
 * | `review` | `POST /submit/` | The one command. |
 *
 * Autosaving on change was the alternative and it is worse here: every answer
 * would re-run the lifecycle inference, so the sentence under the heading would
 * rewrite itself while the Customer typed, and the reducer's invalidation
 * cascade — change an answer, lose the verdict it produced — would flicker on
 * and off between keystrokes.
 *
 * ## Why the write happens before the screen changes and not after
 *
 * A `PATCH` that fails must leave the Customer on the screen that owns the
 * field, with the failure next to it. Advancing first and reporting the error
 * on the following screen is how someone ends up reading "we could not save
 * your address" on a page with no address on it.
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
 *
 * The Customer chose a day. `requested_start` is a `DateTimeField`, so a moment
 * has to be picked, and the start of their own day is the only one that does
 * not invent an intention — matching treats it as the middle of a ±3-day window
 * (`DUPLICATE_WINDOW_DAYS`, and the same window the wave uses), never as an
 * appointment. Built from the local date parts rather than `new Date(iso)` so a
 * browser east of UTC does not send the previous day.
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
  if (screen === "where_when" || screen === "details") return isSavingRequirement;
  return false;
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
  if (screen === "review") {
    return isPreparingSubmit || isSubmittingRequirement || isChoosingPlan;
  }
  return isAdvancingCurrentScreen;
}

interface SubmitPreparation {
  saveAnswers: () => Promise<string | null>;
  savePlaceAndDates: (requirementId: string) => Promise<boolean>;
  saveDetails: (requirementId: string) => Promise<boolean>;
  onPlaceAndDateFailure: () => void;
}

/** Make the server draft match the brief currently visible in the browser. */
export async function prepareRequirementForSubmit({
  saveAnswers,
  savePlaceAndDates,
  saveDetails,
  onPlaceAndDateFailure,
}: SubmitPreparation): Promise<string | null> {
  const requirementId = await saveAnswers();
  if (requirementId === null) return null;

  if (!(await savePlaceAndDates(requirementId))) {
    onPlaceAndDateFailure();
    return null;
  }

  if (!(await saveDetails(requirementId))) return null;
  return requirementId;
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
  // Above every early return, because hooks are. `useIsWideScreen` decides
  // between the phone wizard and the desktop brief — see its own note on why
  // that cannot be a CSS branch when both layouts hold the same form controls.
  const isWide = useIsWideScreen();
  const router = useRouter();
  /** Incremented to ask the address dialog to open. See `AddressStage`. */
  const [addressSignal, setAddressSignal] = useState(0);
  const addresses = useAddresses();
  /**
   * The final tier the Customer wants to send.
   *
   * Earlier, every card tap immediately resized the server plan. A Customer
   * comparing 1, 2 and 3 therefore wrote all three choices, and the last card
   * they inspected silently became the invitation count. Keep review-form state
   * local instead; `handleSubmit` persists exactly this final value and awaits
   * the server before opening matching.
   */
  const [pendingPlanSize, setPendingPlanSize] = useState<number | null>(null);
  /** True only for writes started by pressing the review CTA. */
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
  const isSelectionOnlyWhatScreen =
    state.screen === "what" &&
    service.slug === "interior-fit-out-project" &&
    questionSet.questions.length === 1 &&
    questionSet.questions[0]?.kind === "choice";

  /**
   * The chosen service, mirrored into the URL beside the step.
   *
   * `?selected_service=` was already an *inbound* parameter — the catalogue's
   * picker built links with it — but nothing ever wrote it back, so a brief in
   * progress could not be linked to or restored with its service intact.
   *
   * ## Why this parameter and not the rest of the answers
   *
   * A URL gets pasted into chat, logged by proxies and left in history. The
   * service is a catalogue code — public, already in the link that reached this
   * page, and the one answer that changes what the rest of the form asks. The
   * address, the dates, the budget and the free text are the Customer's own
   * circumstances, and they belong in the session entry that never leaves the
   * browser. "Detailed" is not the same as "all of it".
   */
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
    // `replace`, like the step: choosing a service is not a navigation, and a
    // history entry per answer would make Back mean "undo one field".
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

  const attachments = useAttachments({
    requirementId: state.requirementId,
    attachments: state.attachments,
    dispatch,
  });

  /**
   * The requirement's own record, read only for one thing this device cannot
   * know: the scan verdict on each attachment.
   *
   * Enabled from the moment the draft exists rather than only while a file is in
   * flight, because a resumed draft arrives with attachments this tab never
   * uploaded and they have to appear before the Customer can decide about them.
   * `VOLATILE_STATE` refetches on focus, which is what makes a verdict that
   * lands while the tab is in the background show up on return.
   */
  const record = useRequirementRecord(resumableRequirementId);
  const serverAttachments = record.data?.attachments;

  useEffect(() => {
    if (serverAttachments === undefined) return;
    // Safe to run on every render: `SYNC_SERVER_ATTACHMENTS` returns the state
    // object unchanged when nothing differs, and React bails out of a dispatch
    // that changes nothing.
    dispatch({
      type: "SYNC_SERVER_ATTACHMENTS",
      attachments: toServerAttachments(serverAttachments),
    });
  }, [serverAttachments, dispatch]);

  /**
   * The A5 visit plan — `M2-FE-216`.
   *
   * Read only once the server has said this requirement is A5, and only once a
   * draft exists to hang a plan on. Both conditions are the server's: the
   * archetype is inferred from the answers and the Customer never picks it, and
   * `POST .../visit-plan/` needs a requirement id.
   *
   * On A3 nothing is mounted at all. The endpoint answers `400
   * m2_lifecycle_not_supported` there, and a refusal on every workforce request
   * would be noise that eventually hides a real one.
   */
  const isA5 = state.verdict?.lifecycle === "A5_CUSTOM_PROJECT";
  const planQuery = useVisitPlan(state.requirementId, isA5);
  const choosePlan = useChooseVisitPlan();
  const planState = planQuery.data ?? null;
  const savedPlanSize = planState?.plan?.plan_size ?? null;
  /** What the chooser shows: this review's final choice, then the saved draft. */
  const chosenPlanSize =
    pendingPlanSize !== null && pendingPlanSize !== savedPlanSize
      ? pendingPlanSize
      : savedPlanSize;

  const submitted = submitRequirement.data;
  const writeError = createRequirement.error ?? saveRequirement.error ?? null;
  const isWriting = createRequirement.isPending || saveRequirement.isPending;
  const isAdvancingCurrentScreen = isWorkspaceAdvancingForScreen({
    screen: state.screen,
    isCreatingRequirement: createRequirement.isPending,
    isSavingRequirement: saveRequirement.isPending,
  });

  useEffect(() => {
    // The draft has left the browser and lives on the server now. Leaving the
    // persisted intent behind would restore a form for a request that has
    // already gone out the next time this service is opened.
    if (submitted !== undefined) clearPersistedRequirement(service.slug);
  }, [submitted, service.slug]);

  useEffect(() => {
    if (!hasRestoredIntent) return;
    if (initialSelectionApplied.current) return;
    if (isWriting) return;

    if (initialSelection === null || initialSelection === undefined) return;

    // The first choice question, whether or not it is the only one. This used to
    // require the selection-only shape, which stopped being true the moment the
    // catalogue published a fuller brief — so a link carrying a chosen service
    // silently did nothing.
    const question = questionSet.questions.find((candidate) => candidate.kind === "choice");
    if (question === undefined) return;
    if (!(question.options ?? []).some((option) => option.value === initialSelection)) return;

    // A reload restored the same server draft and answer. Its canonical record
    // is being re-read below, so another POST/PATCH here would only create a
    // background mutation (and used to turn the review CTA into a spinner).
    if (chosenService === initialSelection && state.requirementId !== null) {
      initialSelectionApplied.current = true;
      return;
    }

    initialSelectionApplied.current = true;
    dispatch({ type: "ANSWER", questionCode: question.code, value: initialSelection });
    // Catalog selection is navigation intent, not a database command. The
    // first draft write happens only when the Customer explicitly continues or
    // sends the completed brief.
    advance();
  }, [
    advance,
    chosenService,
    dispatch,
    hasRestoredIntent,
    initialSelection,
    isSelectionOnlyWhatScreen,
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
      // No browser entry named this draft, so the server's editable intent is
      // the complete resume source: address, dates and detail as well as the id.
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
        additionalDetails: intent.additionalDetails,
        language: intent.language,
      });
      return;
    }

    // A browser entry may contain newer unsaved typing, so only restore the
    // server-owned verdict when it already points at this same draft.
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

  /**
   * The verdict, and **the requirement id**, or null for a refusal to read.
   *
   * Returns the id rather than a boolean because the two writes that follow it
   * need it and cannot read it from `state`. `dispatch` does not mutate the
   * `state` this render closed over, so a caller that ran this and then looked
   * at `state.requirementId` saw the value from *before* the draft was created —
   * `null` on a first send — and bailed silently. That is the whole of why
   * "Review and send" ran three writes and appeared to do nothing.
   */
  async function saveAnswers(answers = state.answers): Promise<string | null> {
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
              // The server defaults this too. Sent explicitly because the
              // generated request type requires it, and because once the voice
              // note lands the language is the Customer's, not a default.
              language: state.language ?? "en-IN",
            })
          : await saveRequirement.mutateAsync({
              requirementId: targetId,
              answers,
            });
      dispatch({
        type: "APPLY_VERDICT",
        verdict: toLifecycleVerdict(draft),
        requirementId: draft.id,
      });
      return draft.id;
    } catch {
      // Rendered from the mutation's own error below, next to the fields it is
      // about. Swallowed here so a rejected promise does not reach the console
      // as an unhandled rejection on a path that is already handled.
      return null;
    }
  }

  /**
   * Keeps a picked service card local, and **does not advance**.
   *
   * It used to advance, because the fit-out picker was a screen whose only job
   * was that one choice and moving on was the whole interaction. On the one-page
   * brief there is nowhere to move on *to*: the next section is already on
   * screen, and advancing would slide `state.screen` from `what` to `where_when`
   * under a form that renders both — hidden state whose only effect is to make
   * every later read of `state.screen` mean something different from what it
   * looks like.
   *
   * A card press is browsing intent, not permission to create a request. The
   * completed brief writes it when the Customer presses Review and send.
   */
  function handleChoiceSelect(_questionCode: string, _value: string) {
    // `WhatScreen` dispatches the answer before notifying this boundary.
  }

  /**
   * `requirementId` is a parameter, not a read of `state`.
   *
   * The caller may have created the draft moments ago in the same event, and the
   * `state` this closure captured still says `null`. Passing it in is what makes
   * the three-write chain work on a first send.
   */
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

  /** Same reason as `savePlaceAndDates`: the id is given, never re-read. */
  async function saveDetails(requirementId: string): Promise<boolean> {
    try {
      await saveRequirement.mutateAsync({
        requirementId,
        additionalDetails: state.additionalDetails,
        ...(state.language === null ? {} : { language: state.language }),
      });
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
      return;
    }
    // A catalog link may skip the one-question first screen without writing.
    // Continuing from location is then the first explicit commit.
    const requirementId = state.requirementId ?? (await saveAnswers());
    if (requirementId === null) return;
    const saved =
      state.screen === "where_when"
        ? await savePlaceAndDates(requirementId)
        : await saveDetails(requirementId);
    if (saved) advance();
  }

  /**
   * The one-page brief's single forward control.
   *
   * Runs the same three writes the wizard ran, **in the same order and stopping
   * at the first failure**. The order is not cosmetic: `saveAnswers` is what
   * creates the draft and returns its id, and the other two need that id —
   * *passed in*, because `state` in this closure still holds the value from
   * before the create. A parallel send would race the create and lose two of
   * the three.
   *
   * Stopping early is what leaves the Customer looking at the section that
   * failed, with the error beside it, rather than on a review screen describing
   * a draft the server never received.
   */
  async function handleReviewAndSend() {
    if (!canSendBrief) return;
    const requirementId = await prepareRequirementForSubmit({
      saveAnswers,
      savePlaceAndDates,
      saveDetails,
      onPlaceAndDateFailure: () => open("where_when"),
    });
    if (requirementId === null) return;
    // `open`, not `goTo`. `review` is never in `visited` from the brief, so
    // `goTo` refused it and the send ended in silence after three good writes.
    open("review");
  }

  /**
   * The brief is every screen that is not `review`.
   *
   * Derived from the reducer rather than held separately, so `back` from review
   * lands on the page without a second source of truth about where somebody is.
   */
  const isBrief = state.screen !== "review";
  const addressLine = addressSummaryLine(addresses.data ?? [], state.addressId);
  const planTiers = toPlanTierViews(planState?.available_tiers ?? []);
  const chosenPlanPrice =
    planTiers.find((tier) => tier.planSize === chosenPlanSize)?.priceLabel ?? null;
  /**
   * Submitting needs the plan as well as the guard.
   *
   * `_assert_visit_plan_chosen` refuses an A5 submit without one, so the control
   * is disabled here rather than the refusal met after the tap — the one place a
   * Customer would read a `409` for something that was on the screen in front of
   * them.
   */
  const canSubmit =
    canContinue && state.verdict !== null && (!isA5 || chosenPlanSize !== null);
  const needsVisitPlanSelection = isA5 && chosenPlanSize === null;

  /**
   * The three-row recap on review, each row returning to the step that owns it.
   *
   * `open` rather than `goTo` for the same reason the rail uses it: these send
   * somebody *back into* a section to change it, and `goTo` refuses any screen
   * not already in `visited`.
   */
  const reviewRows = [
    {
      label: "Work",
      value: summariseAnswers(questionSet.questions, state.answers),
      onEdit: () => open("what"),
    },
    {
      label: "Where and when",
      value: [addressLine, state.requestedStart].filter(Boolean).join(" · ") || null,
      onEdit: () => open("where_when"),
    },
    {
      label: "Attached",
      value: summariseAttachments(state.attachments),
      onEdit: () => open("details"),
    },
  ];
  const sectionBlocks = briefSectionBlocks(state, today, false);
  /**
   * What is stopping the send, in the order the page reads.
   *
   * `details` is optional and never blocks — except when an attachment is
   * mid-flight or came back rejected, which is what its guard actually checks.
   * So it is included, and "optional" describes the section rather than the
   * rule.
   */
  const briefBlocked =
    sectionBlocks.what ?? sectionBlocks.where_when ?? sectionBlocks.details ?? null;
  const canSendBrief = briefBlocked === null;

  async function handleSubmit() {
    if (
      !canSubmit ||
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
      const requirementId = await prepareRequirementForSubmit({
        saveAnswers,
        savePlaceAndDates,
        saveDetails,
        onPlaceAndDateFailure: () => open("where_when"),
      });
      if (requirementId === null) return;

      await persistVisitPlanSelectionForSubmit({
        isA5,
        requirementId,
        selectedPlanSize: chosenPlanSize,
        savedPlanSize,
        choose: (input) => choosePlan.mutateAsync(input),
      });
      setPendingPlanSize(null);

      await submitRequirement.mutateAsync({
        requirementId,
        // A same-place/date match is reopened automatically before this point;
        // this flow never silently forces a second live request through.
        allowDuplicate: false,
      });
    } catch {
      // The mutation owns the visible refusal. Keeping it here prevents an
      // expected API rejection from becoming an unhandled event promise.
    } finally {
      setIsPreparingSubmit(false);
    }
  }

  const reviewActionPending =
    isPreparingSubmit || submitRequirement.isPending || choosePlan.isPending;
  const wizardActionPending = isWizardActionPending({
    screen: state.screen,
    isAdvancingCurrentScreen,
    isPreparingSubmit,
    isSubmittingRequirement: submitRequirement.isPending,
    isChoosingPlan: choosePlan.isPending,
  });

  const notices = (
    <FlowNotices writeError={writeError} />
  );

  // The brief is its own page and does not live inside the wizard shell — that
  // shell is a stepper and a Next button, and the whole point of the page is
  // that it has neither. `review` keeps the shell, because going back from it is
  // a real navigation and the stepper is what says where "back" goes.
  /**
   * The phone flow: the same four screens, one at a time, in their own shell.
   *
   * Same reducer, same guards, same writes — `handleAdvance` is the wizard's own
   * forward step and it is what the desktop brief's single CTA calls three times
   * in a row. So going back preserves answers and a reload restores the draft,
   * because both are the reducer's, not this branch's.
   *
   * `canContinue` is the reducer's answer **for the current screen**, which is
   * the rule the brief asked for: a wizard that disables step 2 because step 4 is
   * empty cannot be finished and cannot explain why.
   */
  if (!isWide) {
    const stepFor: Record<Screen, number> = {
      what: 1,
      where_when: 2,
      details: 3,
      review: 4,
    };

    return (
      <WizardShell
        title={service.name}
        step={stepFor[state.screen]}
        onBack={() => (state.screen === "what" ? router.back() : back())}
        onContinue={() => {
          if (state.screen !== "review") {
            void handleAdvance();
            return;
          }
          if (needsVisitPlanSelection) {
            guideToVisitPlanSelection();
            return;
          }
          void handleSubmit();
        }}
        canContinue={
          state.screen === "review"
            ? needsVisitPlanSelection
              ? canContinue
              : canSubmit
            : canContinue
        }
        isSaving={wizardActionPending}
        continueLabel={
          state.screen === "review"
            ? needsVisitPlanSelection
              ? "Select number of estimates"
              : visitPlanSubmitLabel(chosenPlanSize)
            : "Continue"
        }
        reassurance={
          state.screen === "review"
            ? chosenPlanPrice === null
              ? "Free to send. Nothing is booked yet."
              : `Free to send. ${chosenPlanPrice} only when a pro confirms a time.`
            : state.screen === "details"
              ? undefined
              : undefined
        }
        headerAction={
          // Step 3 is entirely optional, so the header says so rather than
          // showing a position the meter under it is already showing.
          state.screen === "details" ? (
            <button
              type="button"
              onClick={() => void handleAdvance()}
              className="px-2 py-1 text-[13px] font-semibold text-text-link"
            >
              Skip
            </button>
          ) : undefined
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
        ) : state.screen === "details" ? (
          <MobileDetailsScreen
            rows={toAttachmentRows(state.attachments)}
            previewUrlFor={attachments.previewUrlFor}
            onAttach={attachments.attachFiles}
            onRemove={attachments.remove}
            voiceRecorder={
              <VoiceNoteRecorder
                onRecorded={attachments.attachRecording}
                language={state.language}
                onLanguageChange={(language) =>
                  dispatch({ type: "SET_LANGUAGE", language })
                }
                enabled={state.requirementId !== null}
                compact
              />
            }
            canAttach={state.requirementId !== null}
            remaining={MAXIMUM_ATTACHMENTS - state.attachments.length}
            additionalDetails={state.additionalDetails}
            onAdditionalDetails={(value) =>
              dispatch({ type: "SET_ADDITIONAL_DETAILS", text: value })
            }
          />
        ) : (
          <MobileReviewScreen
            rows={reviewRows}
            tiers={planTiers}
            planSize={chosenPlanSize}
            onPlanSize={(planSize) => {
              if (state.requirementId === null) return;
              choosePlan.reset();
              setPendingPlanSize(planSize);
            }}
            isLoadingTiers={planQuery.isPending}
            notice={
              choosePlan.error !== null ? (
                <ErrorState
                  title="We could not save that choice"
                  message={describeError(choosePlan.error, "mutation").message}
                  severity="error"
                  inline
                />
              ) : submitFailureCopy(submitRequirement.error) === null ? undefined : (
                <ErrorState
                  title="We could not send that"
                  message={submitFailureCopy(submitRequirement.error)!}
                  severity="error"
                  inline
                />
              )
            }
          />
        )}
      </WizardShell>
    );
  }

  if (isBrief) {
    return (
      <ProjectBriefScreen
        notice={notices}
        heading={`Tell us about ${service.name.toLowerCase()}`}
          intro="Nobody prices work like this without seeing it, so this is a brief — not a checkout."
          // The rail navigates now, and it navigates the *reducer* — the same
          // `state.screen` the phone wizard runs on and the same value mirrored
          // into `?step=`. So a link into a section, a reload and a back button
          // all land where they should, and the desktop and phone flows cannot
          // drift into two ideas of where somebody is.
          activeIndex={screenIndex(state.screen)}
          onSelectSection={(index) => {
            const screen = SCREENS[index];
            // `open` rather than `goTo`: the rail is navigation, and `goTo`
            // refuses any section the Customer has not already been to — which
            // made every forward click on this rail do nothing at all.
            if (screen !== undefined) open(screen);
          }}
          onReviewAndSend={() => void handleReviewAndSend()}
          isSaving={isWriting}
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
                  onChoiceSelect={(questionCode, value) =>
                    void handleChoiceSelect(questionCode, value)
                  }
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
              title: "Show us the space",
              hint: "Optional · sharper estimates",
              optional: true,
              blocked: sectionBlocks.details,
              children: (
                <DetailsScreen
                  onAttachFiles={attachments.attachFiles}
                  onRecordVoice={attachments.attachRecording}
                  onRemoveAttachment={attachments.remove}
                  onRetryAttachment={attachments.retry}
                  previewUrlFor={attachments.previewUrlFor}
                  // An attachment hangs off a requirement, so the draft has to
                  // exist first. It does once anything in section 1 is saved;
                  // this is the honest state before that.
                  canAttach={state.requirementId !== null}
                  isBusy={attachments.isRemoving}
                  hideHeading
                />
              ),
            },
        ]}
      />
    );
  }

  return (
    <RequirementWorkspace
      isAdvancing={isAdvancingCurrentScreen}
      hideForwardControl={isSelectionOnlyWhatScreen}
      onAdvance={() => void handleAdvance()}
      notice={notices}
    >
      <ReviewScreen
          categoryName={service.name}
          addressLines={addressLine === null ? null : [addressLine]}
          // Nothing published says the requirement is free until the server
          // answers the submit. See `RequirementSent`.
          isFree={null}
          onSubmit={() => void handleSubmit()}
          isSubmitting={reviewActionPending}
          submitError={submitFailureCopy(submitRequirement.error)}
          submitLabel={visitPlanSubmitLabel(chosenPlanSize)}
          visitPlanChooser={
            isA5 && state.requirementId !== null ? (
              <VisitPlanChooser
                tiers={toPlanTierViews(planState?.available_tiers ?? [])}
                chosenPlanSize={chosenPlanSize}
                // Nothing can have committed to a slot on a requirement that has
                // not been submitted, so this is always false here. Passed
                // explicitly rather than omitted: the same component renders on
                // a live request, and a default would decide the harder case.
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
          // `_assert_visit_plan_chosen` refuses an A5 submit without a plan.
          // Stated here rather than met as a 409 after the Send button — the one
          // place a Customer reads a refusal for something that was on screen.
          submitBlockedReason={
            needsVisitPlanSelection
              ? "Choose how many professionals should visit before you send this. It costs nothing now."
              : null
          }
          requiresVisitPlanSelection={needsVisitPlanSelection}
          isChoosingVisitPlan={choosePlan.isPending}
        />
    </RequirementWorkspace>
  );
}

/** "Full fit-out · office · 1,250 sq ft" — the answers, in the catalogue's order. */
function summariseAnswers(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): string | null {
  const parts = questions
    .map((question) => {
      const value = answers[question.code];
      if (value === undefined || value === null || value === "") return null;
      if (question.kind === "choice") {
        // The option's own label, never the stored code — the catalogue owns
        // both and only one of them is English.
        return question.options?.find((option) => option.value === value)?.label ?? null;
      }
      if (question.kind === "number") return `${String(value)}${unitSuffix(question)}`;
      if (question.kind === "boolean") return value === true ? question.label : null;
      return null;
    })
    .filter(Boolean);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The one unit this app names. See `features/project-request/model/questions`. */
function unitSuffix(question: RequirementQuestionView): string {
  return question.code === "floor_area_sqft" ? " sq ft" : "";
}

/** "2 photos · 1 voice note", counting only what actually attached. */
function summariseAttachments(attachments: readonly DraftAttachment[]): string | null {
  const attached = attachments.filter((item) => item.state === "attached");
  if (attached.length === 0) return null;
  const photos = attached.filter((item) => item.kind === "IMAGE").length;
  const notes = attached.filter(
    (item) => item.kind === "AUDIO" || item.kind === "VOICE_NOTE",
  ).length;
  const parts = [
    photos === 0 ? null : `${photos} ${photos === 1 ? "photo" : "photos"}`,
    notes === 0 ? null : `${notes} ${notes === 1 ? "voice note" : "voice notes"}`,
  ].filter(Boolean);
  return parts.length === 0 ? `${attached.length} attached` : parts.join(" · ");
}

/** Locality and pincode. A full address truncates to the part that identifies nothing. */
function addressSummaryLine(
  addresses: readonly Schemas["Address"][],
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
 * Save the one count visible on Review before matching is opened.
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
}: {
  writeError: unknown;
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
    </div>
  );
}
