"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError, isLifecycleUnsupported } from "@vsolve/query";
import { ErrorState } from "@vsolve/ui";
import { useEffect, useState } from "react";

import {
  flexibilityDaysFor,
  toDuplicateView,
  toLifecycleVerdict,
  toQuestionSet,
} from "../adapters";
import { clearPersistedRequirement, RequirementProvider, useRequirement } from "./requirement-context";
import {
  useCreateRequirement,
  useProbableDuplicates,
  useSaveRequirement,
  useSubmitRequirement,
  isRequirementExpired,
  isSubmitInProgress,
} from "../queries";
import { DetailsScreen } from "./details-screen";
import { DuplicateNotice } from "./duplicate-notice";
import { RequirementAddressPicker } from "./requirement-address-picker";
import { RequirementSent } from "./requirement-sent";
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
 * | `details` | `PATCH {additional_details, language}` | Nothing else on that screen can be saved yet — upload is Wave C1. |
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
  service: Schemas["ServiceDetail"];
  /** The A3/A5 variant chosen by the route. Carries screen 1's questions. */
  variant: Schemas["ServiceVariantConfiguration"];
  /** Where a submitted request is followed. Injected — this feature owns no route. */
  requestHrefFor: (requirementId: string) => string;
  browseHref: string;
}

export function RequirementFlow(props: RequirementFlowProps) {
  // Lifted above the provider because the provider takes the unresolved-duplicate
  // flag as a prop while the query that answers it needs `addressId` from
  // inside. A boolean rather than the list: React bails out of a set to the
  // same value, so the child reporting on every render cannot loop.
  const [hasDuplicate, setHasDuplicate] = useState(false);

  return (
    <RequirementProvider categorySlug={props.service.slug} hasUnresolvedDuplicate={hasDuplicate}>
      <FlowBody {...props} onDuplicatesChange={setHasDuplicate} />
    </RequirementProvider>
  );
}

interface FlowBodyProps extends RequirementFlowProps {
  onDuplicatesChange: (hasDuplicate: boolean) => void;
}

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

function FlowBody({
  service,
  variant,
  requestHrefFor,
  browseHref,
  onDuplicatesChange,
}: FlowBodyProps) {
  const { state, dispatch, today, advance, canContinue } = useRequirement();

  const createRequirement = useCreateRequirement();
  const saveRequirement = useSaveRequirement();
  const submitRequirement = useSubmitRequirement();

  const questionSet = toQuestionSet(variant);

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

  useEffect(() => {
    onDuplicatesChange(duplicates.length > 0);
  }, [duplicates.length, onDuplicatesChange]);

  const submitted = submitRequirement.data;

  useEffect(() => {
    // The draft has left the browser and lives on the server now. Leaving the
    // persisted intent behind would restore a form for a request that has
    // already gone out the next time this service is opened.
    if (submitted !== undefined) clearPersistedRequirement(service.slug);
  }, [submitted, service.slug]);

  if (submitted !== undefined) {
    return (
      <RequirementSent
        requirementId={submitted.id}
        isFree={submitted.is_free}
        quoteDeadlineAt={submitted.quote_delivery_deadline_at}
        requestHref={requestHrefFor(submitted.id)}
        browseHref={browseHref}
      />
    );
  }

  /** The verdict, the id, or a refusal the Customer has to read. */
  async function saveAnswers(): Promise<boolean> {
    try {
      const draft =
        state.requirementId === null
          ? await createRequirement.mutateAsync({
              variantId: variant.id,
              answers: state.answers,
              // The server defaults this too. Sent explicitly because the
              // generated request type requires it, and because once the voice
              // note lands the language is the Customer's, not a default.
              language: state.language ?? "en-IN",
            })
          : await saveRequirement.mutateAsync({
              requirementId: state.requirementId,
              answers: state.answers,
            });
      dispatch({
        type: "APPLY_VERDICT",
        verdict: toLifecycleVerdict(draft),
        requirementId: draft.id,
      });
      return true;
    } catch {
      // Rendered from the mutation's own error below, next to the fields it is
      // about. Swallowed here so a rejected promise does not reach the console
      // as an unhandled rejection on a path that is already handled.
      return false;
    }
  }

  async function savePlaceAndDates(): Promise<boolean> {
    if (state.requirementId === null || state.addressId === null || state.requestedStart === null) {
      return false;
    }
    try {
      await saveRequirement.mutateAsync({
        requirementId: state.requirementId,
        addressId: state.addressId,
        requestedStart: startOfLocalDay(state.requestedStart),
        serviceBy: state.serviceBy,
        flexibilityDays: flexibilityDaysFor(state.isDateFlexible),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function saveDetails(): Promise<boolean> {
    if (state.requirementId === null) return false;
    try {
      await saveRequirement.mutateAsync({
        requirementId: state.requirementId,
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
    const saved =
      state.screen === "what"
        ? await saveAnswers()
        : state.screen === "where_when"
          ? await savePlaceAndDates()
          : await saveDetails();
    if (saved) advance();
  }

  function handleSubmit() {
    if (state.requirementId === null) return;
    submitRequirement.mutate({
      requirementId: state.requirementId,
      // The server's `allow_duplicate` and the client's "they were shown the
      // notice and said these are different jobs" are the same fact. Sending
      // `true` by default would turn `GAP-004` into decoration.
      allowDuplicate: state.duplicateOverridden,
    });
  }

  const writeError = createRequirement.error ?? saveRequirement.error ?? null;
  const isWriting = createRequirement.isPending || saveRequirement.isPending;

  return (
    <RequirementWorkspace
      isAdvancing={isWriting}
      onAdvance={() => void handleAdvance()}
      notice={
        <FlowNotices
          writeError={writeError}
          duplicates={duplicates.map((duplicate) =>
            toDuplicateView(
              duplicate,
              new Date(duplicate.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              }),
            ),
          )}
          duplicateHrefFor={requestHrefFor}
        />
      }
    >
      {state.screen === "what" ? (
        <WhatScreen
          categoryName={service.name}
          questions={questionSet.questions}
          unsupportedQuestions={questionSet.unsupported}
        />
      ) : state.screen === "where_when" ? (
        <WhereWhenScreen
          addressPicker={<RequirementAddressPicker variantId={variant.id} />}
          minDate={today}
        />
      ) : state.screen === "details" ? (
        <DetailsScreen
          // Both null: an attachment needs an upload command and a voice note is
          // an attachment. `M2-BE-202` is Wave C1, and screen 3 says so rather
          // than offering a control that drops the file.
          onAttachFiles={null}
          onRecordVoice={null}
          onRemoveAttachment={(id) => dispatch({ type: "REMOVE_ATTACHMENT", id })}
          onRetryAttachment={() => undefined}
        />
      ) : (
        <ReviewScreen
          categoryName={service.name}
          addressLines={null}
          // Nothing published says the requirement is free until the server
          // answers the submit. See `RequirementSent`.
          isFree={null}
          onSubmit={handleSubmit}
          isSubmitting={submitRequirement.isPending}
          submitError={submitFailureCopy(submitRequirement.error)}
        />
      )}
    </RequirementWorkspace>
  );
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
  duplicates,
  duplicateHrefFor,
}: {
  writeError: unknown;
  duplicates: readonly { id: string; summary: string; createdLabel: string; mergeable: boolean }[];
  duplicateHrefFor: (requirementId: string) => string;
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

      {duplicates.length > 0 ? (
        <DuplicateNotice duplicates={duplicates} hrefFor={duplicateHrefFor} />
      ) : null}
    </div>
  );
}
