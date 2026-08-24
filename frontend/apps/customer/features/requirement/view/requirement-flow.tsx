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
 * The two screens, wired to the published contract.
 *
 * Everything under `features/requirement/` was built to take what a query would
 * give it. This is that query layer's one call site, and the shape of the file
 * is the evidence that the seam held: it holds no copy, no layout and no
 * validation rule — only *when* to write to the server and what to do with the
 * answer.
 *
 * ## When it writes
 *
 * Once per screen, on the way forward — not on every keystroke:
 *
 * | Leaving | Sends | Because |
 * |---|---|---|
 * | `what` | `POST /requirements/` or `PATCH {answers}` | The answers are what the lifecycle is inferred from, and the response *is* the verdict screen 1 renders. |
 * | `where_when` | `PATCH {address, dates, flexibility}`, then the visit plan, then `POST /submit/` | The last screen is the send since the M2-revamp removed review. |
 *
 * Autosaving on change was the alternative and it is worse here: every answer
 * would re-run the lifecycle inference, so the sentence under the heading would
 * rewrite itself while the Customer tapped, and the reducer's invalidation
 * cascade — change an answer, lose the verdict it produced — would flicker on
 * and off between taps.
 *
 * ## Why the write happens before the screen changes and not after
 *
 * A `PATCH` that fails must leave the Customer on the screen that owns the
 * field, with the failure next to it. Advancing first and reporting the error
 * on the following screen is how someone ends up reading "we could not save
 * your address" on a page with no address on it.
 *
 * ## Where review went
 *
 * Nowhere it was needed. The review screen restated an address and a date the
 * Customer chose one screen earlier; the submit guard (`where_when`'s, which
 * re-asserts screen 1's rule) is what actually protected the send, and it
 * still runs. The estimate-count chooser it hosted now lives on `where_when`.
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
  if (screen === "where_when") {
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
 *
 * `isA5` rides along because the A5 plan requirement can only be decided
 * *after* the answers are saved — the lifecycle is the server's inference, and
 * on a first send from the desktop brief (or a catalog shortcut) nothing has
 * been saved before the CTA is pressed.
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
   * they inspected silently became the invitation count. Keep it local
   * instead; `handleSubmit` persists exactly this final value and awaits the
   * server before opening matching.
   */
  const [pendingPlanSize, setPendingPlanSize] = useState<number | null>(null);
  /** True only for writes started by pressing the send CTA. */
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
   * address and the dates are the Customer's own circumstances, and they belong
   * in the session entry that never leaves the browser.
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

  /**
   * The requirement's own record — the flow's resume read.
   *
   * Enabled from the moment a draft is discoverable, so a reload or a second
   * device lands on the same server draft instead of creating a duplicate.
   */
  const record = useRequirementRecord(resumableRequirementId);

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
  const planTiers = toPlanTierViews(planState?.available_tiers ?? []);
  /**
   * What the chooser shows: this screen's choice, then the saved draft, then
   * the tier most people want.
   *
   * The default is *derived*, never written: the review screen used to carry
   * the chooser and the Customer dwelt there, but on `where_when` it shares
   * the screen with the send button, and a null selection would turn the CTA
   * into "Select number of estimates" for everyone. `defaultPlanSize` prefers
   * two — comparing two estimates is the ordinary case — and the choice still
   * costs nothing until a pro confirms. Submitting persists whatever is on
   * screen, so the displayed default and the sent count cannot disagree.
   */
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
    // background mutation (and used to turn the send CTA into a spinner).
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
      // the complete resume source: address, dates and answers as well as the id.
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

    // A browser entry may contain newer unsaved input, so only restore the
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
   * The verdict, **the requirement id**, and whether the draft is A5 — or null
   * for a refusal to save.
   *
   * Returns them rather than a boolean because the writes that follow need the
   * id and the submit path needs the lifecycle, and neither can be read from
   * `state`: `dispatch` does not mutate the `state` this render closed over, so
   * a caller that ran this and then looked at `state.requirementId` saw the
   * value from *before* the draft was created — `null` on a first send — and
   * bailed silently.
   */
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
              // The server defaults this too. Sent explicitly because the
              // generated request type requires it. The flow no longer captures
              // a language — the voice note went with the details screen.
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
      // Rendered from the mutation's own error below, next to the fields it is
      // about. Swallowed here so a rejected promise does not reach the console
      // as an unhandled rejection on a path that is already handled.
      return null;
    }
  }

  /**
   * `requirementId` is a parameter, not a read of `state`.
   *
   * The caller may have created the draft moments ago in the same event, and the
   * `state` this closure captured still says `null`. Passing it in is what makes
   * the write chain work on a first send.
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

  async function handleAdvance() {
    if (!canContinue) return;
    if (state.screen !== "what") return;
    if ((await saveAnswers()) === null) return;
    advance();
  }

  const addressLine = addressSummaryLine(addresses.data ?? [], state.addressId);
  const chosenPlanPrice =
    planTiers.find((tier) => tier.planSize === chosenPlanSize)?.priceLabel ?? null;
  /**
   * The A5 plan must be chosen before the send, and the control is on this
   * screen — so the CTA is repurposed to point at it rather than met as a
   * `409` after the tap, the one place a Customer would read a refusal for
   * something in front of them. Before the first save the lifecycle is
   * unknown; `handleSubmit` saves first and re-checks from the response.
   */
  const needsVisitPlanSelection = isA5 && chosenPlanSize === null;

  const sectionBlocks = briefSectionBlocks(state, today, false);
  /** What is stopping the send, in the order the page reads. */
  const briefBlocked = sectionBlocks.what ?? sectionBlocks.where_when ?? null;
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

      // Now the lifecycle is the saved draft's, not a stale render's. A first
      // send that turns out to be A5 stops here, with the chooser now mounted
      // and pointed at, instead of collecting the server's 409.
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

  /**
   * The phone flow: the same two screens, one at a time, in their own shell.
   *
   * Same reducer, same guards, same writes as the desktop brief. Going back
   * preserves answers and a reload restores the draft, because both are the
   * reducer's, not this branch's.
   *
   * The second screen's CTA is the send: leaving `what` saved the answers, so
   * by the time somebody is choosing a date the draft, the lifecycle and the
   * estimate-count chooser are all live on the screen with the button.
   */
  if (!isWide) {
    const stepFor: Record<Screen, number> = {
      what: 1,
      where_when: 2,
    };
    const isFinal = state.screen === "where_when";

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
        ) : (
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
      // The rail navigates the *reducer* — the same `state.screen` the phone
      // wizard runs on and the same value mirrored into `?step=`. So a link
      // into a section, a reload and a back button all land where they should,
      // and the desktop and phone flows cannot drift into two ideas of where
      // somebody is.
      activeIndex={screenIndex(state.screen)}
      onSelectSection={(index) => {
        const screen = SCREENS[index];
        // `open` rather than `goTo`: the rail is navigation, and `goTo`
        // refuses any section the Customer has not already been to — which
        // made every forward click on this rail do nothing at all.
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
              visitPlanChooser={
                isA5 && state.requirementId !== null ? (
                  <VisitPlanChooser
                    tiers={planTiers}
                    chosenPlanSize={chosenPlanSize}
                    // Nothing can have committed to a slot on a requirement
                    // that has not been submitted, so this is always false
                    // here. Passed explicitly rather than omitted: the same
                    // component renders on a live request, and a default would
                    // decide the harder case.
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
