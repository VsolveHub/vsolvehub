// Ported from frontend/apps/customer/features/requirement/model/machine.ts
import { SCREENS, screenIndex, type Screen } from "./screens";
import {
  type DraftAttachment,
  type LifecycleVerdict,
  type RequirementDraftState,
  advance as advanceScreen,
  canNavigateTo,
} from "./state";

/**
 * The requirement draft reducer.
 *
 * Two rules here carry more weight than ordinary state management:
 *
 * 1. **Changing an answer invalidates the verdict it produced.** The server reads
 *    the answers and returns the inferred lifecycle, the plain-language sentence
 *    shown to the Customer, and which answers are still required. All three are
 *    derived from the exact answer set that was sent. Editing an answer without
 *    clearing them leaves a sentence on screen describing a requirement the
 *    Customer no longer has — and, worse, leaves `missingRequiredAnswers`
 *    describing a question set that may no longer apply, which is the guard the
 *    "next" button reads. Same cascade discipline as the M1 booking machine, for
 *    the same reason: a server answer outliving its inputs.
 *
 * 2. **An attachment is never silently dropped.** Removal is explicit, failure is
 *    a recorded state with a reason, and neither is inferred from absence. A
 *    photo of the actual problem is often the difference between a usable quote
 *    and a guess, so losing one quietly is not a cosmetic bug.
 *
 * Nothing in this reducer touches money. The requirement is free.
 */

/**
 * One attachment as the server holds it, already narrowed by the adapter.
 *
 * A view-model rather than the wire shape: `scan_status` is a bare `string` on
 * the wire and the mapping from it to `state`/`failure` — the mapping that
 * decides whether a retry button appears — belongs in one place with the rest of
 * the wire knowledge, not in the reducer.
 */
export interface ServerAttachment {
  attachmentId: string;
  kind: DraftAttachment["kind"];
  /** What to call it when no local row remembers the file's own name. */
  fallbackName: string;
  byteSize: number;
  language: string | null;
  state: "scanning" | "attached" | "failed";
  failure: DraftAttachment["failure"];
}

export type RequirementAction =
  | { type: "ANSWER"; questionCode: string; value: unknown }
  /**
   * The server's reading of the current answers.
   *
   * Applied wholesale rather than merged: it is one coherent verdict about one
   * answer set, and merging halves of two verdicts would produce a reading of a
   * requirement that was never sent.
   */
  /**
   * `verdict` is nullable because the server's is.
   *
   * `lifecycle_explanation` is `LIFECYCLE_EXPLANATIONS.get(archetype)` and
   * returns nothing for an archetype with no sentence — deliberately, so an
   * unexplained lifecycle shows the Customer nothing rather than a generic
   * reassurance. The **requirement id still has to be recorded**: the draft
   * exists server-side either way and every later `PATCH` addresses it, so
   * discarding the id along with the missing sentence would strand the draft.
   */
  | { type: "APPLY_VERDICT"; verdict: LifecycleVerdict | null; requirementId: string }
  /** Canonical editable intent discovered on the server from another visit or device. */
  | {
      type: "RESTORE_SERVER_DRAFT";
      requirementId: string;
      answers: Readonly<Record<string, unknown>>;
      verdict: LifecycleVerdict | null;
      addressId: string | null;
      requestedStart: string | null;
      serviceBy: string | null;
      flexibilityDays: number;
    }
  | { type: "SET_ADDRESS"; addressId: string }
  | { type: "SET_REQUESTED_START"; requestedStart: string | null }
  /**
   * The hard deadline, which is optional and usually absent.
   *
   * `service_by` used to be a required second date on the capture screen with a
   * paragraph explaining that it closes the request from any state when it
   * passes. The server derives a closing date from the start day now, so this
   * exists only for the Customers who genuinely have a deadline — and `null` is
   * how they take it back off.
   */
  | { type: "SET_SERVICE_BY"; serviceBy: string | null }
  /**
   * Where the Customer was, from the URL, after a reload. See the reducer case.
   *
   * `screens` is the active sequence (`activeScreens`) on this and on the two
   * movement actions below. The reducer does not know the variant, and the
   * budget list would put a step-1 the brief never asked back into `visited`.
   */
  | { type: "RESTORE_SCREEN"; screen: Screen; screens?: readonly Screen[] }
  | { type: "SET_FLEXIBILITY_DAYS"; days: number }
  | { type: "ADD_ATTACHMENT"; attachment: DraftAttachment }
  | { type: "UPDATE_ATTACHMENT"; id: string; patch: Partial<DraftAttachment> }
  | { type: "REMOVE_ATTACHMENT"; id: string }
  /**
   * Reconciles the rows against what the server actually holds.
   *
   * The server is the authority for one thing this device cannot know: the scan
   * verdict. It is also the authority for *existence* — an attachment uploaded
   * from another tab, or one this draft was resumed with, is real and has to
   * appear, and one removed elsewhere has to disappear.
   *
   * So the local row keeps what only it knows (the file name, which the wire
   * does not carry at all) and takes everything else from the record. Rows that
   * have not reached a finalize yet — queued, uploading, or refused before a
   * byte moved — have no server counterpart and are left alone.
   */
  | { type: "SYNC_SERVER_ATTACHMENTS"; attachments: readonly ServerAttachment[] }
  /** The Customer saw the probable duplicate and chose to continue anyway. */
  | { type: "OVERRIDE_DUPLICATE" }
  /**
   * Persisted intent, replayed once after the client has mounted.
   *
   * An action rather than a reducer initializer, for the hydration reason the M1
   * booking machine documents: an initializer that reads `sessionStorage` renders
   * one tree on the server and another on the client's first pass, and React
   * resolves that by discarding the client tree. Both renders start empty and the
   * restore is a second, deliberate commit.
   *
   * Customer intent travels with the opaque id of its server draft. The id is
   * re-read under the current Customer before it is used, which resumes the
   * canonical visit plan and stored attachments without serializing either.
   * The verdict is still omitted because it is a server answer that may be
   * stale, and a local attachment handle still cannot survive a reload.
   */
  | {
      type: "RESTORE_INTENT";
      requirementId: string | null;
      answers: Readonly<Record<string, unknown>>;
      addressId: string | null;
      requestedStart: string | null;
      serviceBy: string | null;
      flexibilityDays: number;
    }
  | { type: "GO_TO"; screen: Screen }
  | { type: "OPEN"; screen: Screen }
  | { type: "ADVANCE"; screens?: readonly Screen[] }
  | { type: "BACK"; screens?: readonly Screen[] };

/**
 * Drops the server's reading of the answers.
 *
 * Called from every action that changes what the server was asked. Keeping the
 * requirement id is deliberate — the draft still exists server-side and the next
 * save patches it; it is the *derived* fields that are now untrue.
 */
function invalidateVerdict(state: RequirementDraftState): RequirementDraftState {
  return state.verdict === null ? state : { ...state, verdict: null };
}

/**
 * Merges the server's attachment records into the rows on screen.
 *
 * **Returns the state object unchanged when nothing differs**, and that is the
 * load-bearing part rather than an optimisation: this action is dispatched from
 * an effect that runs on every read of the requirement, so a reducer that always
 * produced a new object would re-render, re-run the effect and never settle.
 * React bails out of a dispatch that returns the identical state, which is what
 * makes "reconcile on every render" safe to write.
 *
 * Three rules, in order:
 *
 * 1. a local row carrying an `attachmentId` the server still has takes the
 *    record's state, verdict and size, and keeps its own file name — the wire
 *    carries no `file_name` at all, so the local one is the only real name that
 *    exists;
 * 2. a local row whose `attachmentId` the server no longer has is dropped: it
 *    was removed from another tab, and leaving it would let the Customer press
 *    Remove on a row that is already gone;
 * 3. a record with no local row is appended. A resumed draft and a second
 *    device both produce this, and the alternative — showing only what this tab
 *    uploaded — is a Customer removing a photograph they cannot see.
 */
function syncServerAttachments(
  state: RequirementDraftState,
  records: readonly ServerAttachment[],
): RequirementDraftState {
  const byId = new Map(records.map((record) => [record.attachmentId, record]));
  let changed = false;

  const reconciled: DraftAttachment[] = [];
  for (const attachment of state.attachments) {
    if (attachment.attachmentId === null) {
      // Never finalized, so the server has nothing to say about it.
      reconciled.push(attachment);
      continue;
    }
    const record = byId.get(attachment.attachmentId);
    if (record === undefined) {
      changed = true;
      continue;
    }
    byId.delete(attachment.attachmentId);
    if (
      attachment.state === record.state &&
      attachment.failure === record.failure &&
      attachment.byteSize === record.byteSize
    ) {
      reconciled.push(attachment);
      continue;
    }
    changed = true;
    reconciled.push({
      ...attachment,
      state: record.state,
      failure: record.failure,
      // The scan verdict replaces whatever the upload said. A row that failed to
      // finalize and then turned out to exist should not keep the transport's
      // sentence next to a scan result that contradicts it.
      failureDetail: null,
      byteSize: record.byteSize,
      progress: record.state === "attached" ? 100 : attachment.progress,
    });
  }

  for (const record of byId.values()) {
    changed = true;
    reconciled.push({
      id: `server:${record.attachmentId}`,
      attachmentId: record.attachmentId,
      kind: record.kind,
      fileName: record.fallbackName,
      byteSize: record.byteSize,
      language: record.language,
      state: record.state,
      progress: null,
      failure: record.failure,
      failureDetail: null,
    });
  }

  return changed ? { ...state, attachments: reconciled } : state;
}

export function requirementReducer(
  state: RequirementDraftState,
  action: RequirementAction,
): RequirementDraftState {
  switch (action.type) {
    case "ANSWER": {
      const answers = { ...state.answers, [action.questionCode]: action.value };
      return invalidateVerdict({ ...state, answers });
    }

    case "APPLY_VERDICT":
      return { ...state, verdict: action.verdict, requirementId: action.requirementId };

    case "RESTORE_SERVER_DRAFT":
      return {
        ...state,
        requirementId: action.requirementId,
        answers: action.answers,
        verdict: action.verdict,
        addressId: action.addressId,
        requestedStart: action.requestedStart,
        serviceBy: action.serviceBy,
        flexibilityDays: action.flexibilityDays,
      };

    case "SET_ADDRESS":
      // The address does not feed lifecycle inference — what the Customer needs
      // is not decided by where they need it — so the verdict survives.
      return { ...state, addressId: action.addressId };

    case "SET_REQUESTED_START":
      // Neither date feeds lifecycle inference — *when* the work happens does
      // not change *what kind* of work it is — so the verdict survives both.
      return { ...state, requestedStart: action.requestedStart };

    case "SET_SERVICE_BY":
      // Same reasoning as the start date: when the work must finish does not
      // change what kind of work it is, so the verdict survives.
      return { ...state, serviceBy: action.serviceBy };

    case "SET_FLEXIBILITY_DAYS":
      return { ...state, flexibilityDays: action.days };

    case "ADD_ATTACHMENT":
      return { ...state, attachments: [...state.attachments, action.attachment] };

    case "UPDATE_ATTACHMENT":
      return {
        ...state,
        attachments: state.attachments.map((attachment) =>
          attachment.id === action.id ? { ...attachment, ...action.patch } : attachment,
        ),
      };

    case "REMOVE_ATTACHMENT":
      return {
        ...state,
        attachments: state.attachments.filter((attachment) => attachment.id !== action.id),
      };

    case "SYNC_SERVER_ATTACHMENTS":
      return syncServerAttachments(state, action.attachments);

    case "OVERRIDE_DUPLICATE":
      return { ...state, duplicateOverridden: true };

    case "RESTORE_INTENT":
      // Restoring answers means the verdict that described the *empty* draft no
      // longer applies, so it goes the same way as an edit.
      return invalidateVerdict({
        ...state,
        requirementId: action.requirementId,
        answers: action.answers,
        addressId: action.addressId,
        requestedStart: action.requestedStart,
        serviceBy: action.serviceBy,
        flexibilityDays: action.flexibilityDays,
      });

    case "RESTORE_SCREEN": {
      // Where the Customer was, from the URL, after a reload.
      //
      // **Not `GO_TO`.** That refuses any screen not already in `visited`, and
      // `visited` starts empty on a fresh reducer and is deliberately not
      // persisted — so a restore through `GO_TO` could never reach anything past
      // the first screen, which is exactly the bug this replaces.
      //
      // Restoring a position implies the screens before it were visited: that is
      // what makes Back work immediately after a reload instead of dead-ending.
      // The per-screen guards are untouched, so landing here does not let anybody
      // past a rule — a restored `review` still cannot submit without an address.
      const screens = action.screens ?? SCREENS;
      const index = screenIndex(action.screen, screens);
      if (index === -1) return state;
      return {
        ...state,
        screen: action.screen,
        visited: screens.slice(0, index),
      };
    }

    case "GO_TO":
      return canNavigateTo(state, action.screen) ? { ...state, screen: action.screen } : state;

    case "OPEN": {
      // Navigation that does **not** require the target to have been visited.
      //
      // `GO_TO` refuses any forward move, which is right for the phone wizard: a
      // stepper whose steps can be skipped is not a stepper. It is wrong for the
      // desktop brief, where the rail is the navigation and every section is a
      // button — there, `GO_TO` silently refused every forward click and every
      // `goTo("review")` at the end of a successful send, so the CTA ran three
      // writes and then appeared to do nothing at all.
      //
      // The guard is not lost, it moves: exactly as `ADVANCE` documents below,
      // it lives in the container, which knows today's date and whether a
      // duplicate is unresolved. `handleReviewAndSend` checks it before writing
      // anything, and every per-screen rule still applies on the screen it
      // belongs to. Reaching `review` has never been what lets somebody submit.
      //
      // The screen being left is recorded as visited, so `BACK` works from
      // wherever this lands.
      if (screenIndex(action.screen) === -1) return state;
      return {
        ...state,
        screen: action.screen,
        visited: state.visited.includes(state.screen)
          ? state.visited
          : [...state.visited, state.screen],
      };
    }

    case "ADVANCE":
      // The guard lives in the container, which knows today's date and whether a
      // duplicate is unresolved. The reducer only moves.
      return advanceScreen(state, action.screens ?? SCREENS);

    case "BACK": {
      const screens = action.screens ?? SCREENS;
      const previous = [...state.visited]
        .reverse()
        .find((screen) => screen !== state.screen && screens.includes(screen));
      return previous === undefined ? state : { ...state, screen: previous };
    }

    default:
      return state;
  }
}
