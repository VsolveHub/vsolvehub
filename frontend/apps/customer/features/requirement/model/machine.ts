import { type Screen } from "./screens";
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
  | { type: "SET_ADDRESS"; addressId: string }
  | { type: "SET_REQUESTED_START"; requestedStart: string | null }
  | { type: "SET_SERVICE_BY"; serviceBy: string | null }
  | { type: "SET_DATE_FLEXIBLE"; isFlexible: boolean }
  | { type: "ADD_ATTACHMENT"; attachment: DraftAttachment }
  | { type: "UPDATE_ATTACHMENT"; id: string; patch: Partial<DraftAttachment> }
  | { type: "REMOVE_ATTACHMENT"; id: string }
  | { type: "SET_LANGUAGE"; language: string | null }
  | { type: "SET_ADDITIONAL_DETAILS"; text: string }
  | { type: "SET_OPTIONAL_DETAIL"; key: string; value: unknown }
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
   * Only Customer intent travels. No verdict, no requirement id, no attachment:
   * the verdict is a server answer that may be stale, and an attachment is a file
   * handle that does not survive a reload. Restoring either would put a claim on
   * screen that nothing behind it can honour.
   */
  | {
      type: "RESTORE_INTENT";
      answers: Readonly<Record<string, unknown>>;
      addressId: string | null;
      requestedStart: string | null;
      serviceBy: string | null;
      isDateFlexible: boolean;
      additionalDetails: string;
      language: string | null;
      /**
       * Restored, because the four extras are Customer intent like everything
       * else here — and because a Customer who typed out a page of access
       * instructions and reloaded would otherwise find the panel empty and the
       * review row saying they had asked for nothing. Every value is normalised
       * on read (`readOptionalDetail`), so untrusted storage cannot reach a
       * control.
       */
      optionalDetails: Readonly<Record<string, unknown>>;
    }
  | { type: "GO_TO"; screen: Screen }
  | { type: "ADVANCE" }
  | { type: "BACK" };

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

    case "SET_ADDRESS":
      // The address does not feed lifecycle inference — what the Customer needs
      // is not decided by where they need it — so the verdict survives.
      return { ...state, addressId: action.addressId };

    case "SET_REQUESTED_START":
      // Neither date feeds lifecycle inference — *when* the work happens does
      // not change *what kind* of work it is — so the verdict survives both.
      return { ...state, requestedStart: action.requestedStart };

    case "SET_SERVICE_BY":
      return { ...state, serviceBy: action.serviceBy };

    case "SET_DATE_FLEXIBLE":
      return { ...state, isDateFlexible: action.isFlexible };

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

    case "SET_LANGUAGE":
      return { ...state, language: action.language };

    case "SET_ADDITIONAL_DETAILS":
      return { ...state, additionalDetails: action.text };

    case "SET_OPTIONAL_DETAIL":
      return {
        ...state,
        optionalDetails: { ...state.optionalDetails, [action.key]: action.value },
      };

    case "OVERRIDE_DUPLICATE":
      return { ...state, duplicateOverridden: true };

    case "RESTORE_INTENT":
      // Restoring answers means the verdict that described the *empty* draft no
      // longer applies, so it goes the same way as an edit.
      return invalidateVerdict({
        ...state,
        answers: action.answers,
        addressId: action.addressId,
        requestedStart: action.requestedStart,
        serviceBy: action.serviceBy,
        isDateFlexible: action.isDateFlexible,
        additionalDetails: action.additionalDetails,
        language: action.language,
        optionalDetails: action.optionalDetails,
      });

    case "GO_TO":
      return canNavigateTo(state, action.screen) ? { ...state, screen: action.screen } : state;

    case "ADVANCE":
      // The guard lives in the container, which knows today's date and whether a
      // duplicate is unresolved. The reducer only moves.
      return advanceScreen(state);

    case "BACK": {
      const previous = [...state.visited].reverse().find((screen) => screen !== state.screen);
      return previous === undefined ? state : { ...state, screen: previous };
    }

    default:
      return state;
  }
}
