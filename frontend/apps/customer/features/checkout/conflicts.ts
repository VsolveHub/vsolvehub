import { ApiRequestError } from "@vsolve/api-client";

/**
 * The server refusals the group booking flow has to act on differently.
 *
 * Every narrowing here keys on the `code` Django publishes, never on the HTTP
 * status: a stale cart, a duplicate request, a merge that needs a human decision,
 * a plan that has moved on and a plan that was never feasible all arrive as 409,
 * and each one has a different recovery. Collapsing any two of them produces the
 * same failure — a customer told "something went wrong" about a decision they
 * could have made themselves.
 *
 * `details` is typed `unknown` by the published contract, so every reader below
 * narrows defensively rather than asserting a shape the contract does not
 * promise. A refusal that arrives without its context is still a refusal, and is
 * surfaced as one; it never degrades into a success.
 */

function detailsOf(error: unknown, code: string): Record<string, unknown> | null {
  if (!(error instanceof ApiRequestError)) return null;
  if (error.code !== code) return null;
  const { details } = error;
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return details as Record<string, unknown>;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/* -------------------------------------------------------------------------
   Cart
   ------------------------------------------------------------------------- */

/** The cart moved under an edit. The version the server now holds, when it said. */
export interface CartVersionConflict {
  currentVersion: number | null;
}

/**
 * `cart_version_conflict` — another tab, or this tab's own stale render, sent a
 * version the server has already left behind.
 *
 * Nothing was applied: the command is rejected whole. The only correct response
 * is to refetch authoritative cart state and let the customer decide again
 * against what is actually there.
 */
export function cartVersionConflict(error: unknown): CartVersionConflict | null {
  const details = detailsOf(error, "cart_version_conflict");
  if (details === null) return null;
  return { currentVersion: readNumber(details, "current_version") };
}

/**
 * `cart_item_not_found` — the addressed row is not an active item of this cart.
 *
 * Removed, unknown and another Customer's ids answer identically. The recovery
 * is the same in every case: refetch the cart and treat the service as already
 * gone. Never style this as a hard failure the customer can "fix".
 */
export function isCartItemNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "cart_item_not_found";
}

/** The item that already expresses this exact request. */
export interface DuplicateCartItemConflict {
  existingItemId: string | null;
  currentVersion: number | null;
}

/**
 * `duplicate_cart_item` — the same variant with the same scope is already in the
 * cart.
 *
 * Django's own published recovery is `update_existing_item`, so this is never a
 * replacement prompt and never a silent no-op. The customer is pointed at the
 * item they already have.
 */
export function duplicateCartItemConflict(error: unknown): DuplicateCartItemConflict | null {
  const details = detailsOf(error, "duplicate_cart_item");
  if (details === null) return null;
  return {
    existingItemId: readString(details, "existing_item_id"),
    currentVersion: readNumber(details, "current_version"),
  };
}

/* -------------------------------------------------------------------------
   Login cart merge
   ------------------------------------------------------------------------- */

/**
 * The merge actions Django publishes.
 *
 * Sourced from the generated `ActionEnum`, not from a local list, so a contract
 * change is a type error rather than a dead button.
 */
export const MERGE_ACTIONS = ["KEEP_CUSTOMER", "KEEP_SESSION", "KEEP_BOTH"] as const;
export type MergeAction = (typeof MERGE_ACTIONS)[number];

/** One overlapping item the customer has to rule on. */
export interface MergeDuplicate {
  customerItemId: string | null;
  sessionItemId: string;
}

/**
 * A merge Django refused to perform on its own.
 *
 * Two kinds arrive here and they are not interchangeable:
 *
 *  - `EXACT_DUPLICATE` / `DECISION_REQUIRED` carry a `session_item_id`, so the
 *    customer can resolve them by choosing per item.
 *  - `CART_LIMIT_EXCEEDED` and `CART_VERSION_CHANGED` carry no item, so no
 *    per-item choice can resolve them. Presenting a decision UI for those would
 *    offer a control that cannot work.
 */
export interface CartMergeConflict {
  customerCartVersion: number | null;
  sessionCartVersion: number | null;
  /** Items the customer must rule on. Empty when the refusal is not per-item. */
  duplicates: MergeDuplicate[];
  /** Set when the combined cart would exceed the server's item limit. */
  limit: { combinedItemCount: number | null; maximumItemCount: number | null } | null;
  /** True when a cart changed mid-merge and the versions must be re-read. */
  versionChanged: boolean;
}

export function cartMergeConflict(error: unknown): CartMergeConflict | null {
  const details = detailsOf(error, "cart_merge_conflict");
  if (details === null) return null;

  const rows = Array.isArray(details.conflicts) ? (details.conflicts as unknown[]) : [];
  const duplicates: MergeDuplicate[] = [];
  let limit: CartMergeConflict["limit"] = null;
  let versionChanged = false;

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const entry = row as Record<string, unknown>;
    const kind = readString(entry, "kind");

    if (kind === "CART_LIMIT_EXCEEDED") {
      limit = {
        combinedItemCount: readNumber(entry, "combined_item_count"),
        maximumItemCount: readNumber(entry, "maximum_item_count"),
      };
      continue;
    }
    if (kind === "CART_VERSION_CHANGED") {
      versionChanged = true;
      continue;
    }

    const sessionItemId = readString(entry, "session_item_id");
    if (sessionItemId !== null) {
      duplicates.push({
        customerItemId: readString(entry, "customer_item_id"),
        sessionItemId,
      });
    }
  }

  return {
    customerCartVersion: readNumber(details, "customer_cart_version"),
    sessionCartVersion: readNumber(details, "session_cart_version"),
    duplicates,
    limit,
    versionChanged,
  };
}

/* -------------------------------------------------------------------------
   Fulfilment plans and quotes
   ------------------------------------------------------------------------- */

/** One cart item the planner could not place, with the server's own reason. */
export interface PlanItemFailure {
  cartItemId: string | null;
  reason: string | null;
}

/**
 * `fulfilment_plan_unavailable` — no safe plan covers every active cart item.
 *
 * This is a complete answer, not an error to retry through. The per-item reasons
 * are what let the screen say which request is the problem instead of blaming
 * the whole cart.
 */
export function planUnavailable(error: unknown): PlanItemFailure[] | null {
  const details = detailsOf(error, "fulfilment_plan_unavailable");
  if (details === null) return null;

  const rows = Array.isArray(details.item_failures) ? (details.item_failures as unknown[]) : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const entry = row as Record<string, unknown>;
    return [{ cartItemId: readString(entry, "cart_item_id"), reason: readString(entry, "reason") }];
  });
}

/** `fulfilment_plan_stale` — the plan's cart or policy inputs have moved on. */
export function isPlanStale(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "fulfilment_plan_stale";
}

/**
 * `scheduling_groups_changed` — the visits the customer picked times for are not
 * the visits this cart makes now.
 *
 * Recovery is always "ask again", never a local repair. Group keys are derived
 * from membership, so this fires whenever the cart moved underneath a chosen
 * schedule — and silently reassigning those times would put a visit at a slot
 * nobody agreed to.
 */
export function isSchedulingGroupsChanged(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "scheduling_groups_changed";
}

/** `quote_expired` — the quote aged out before it was used. */
export function isQuoteExpired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "quote_expired";
}

/**
 * An idempotent command that is still running server-side.
 *
 * The correct response is to wait for the authoritative result, never to send
 * the command again under a new key.
 */
export function isCommandInFlight(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}

/**
 * The same key was replayed with a different body.
 *
 * Always a client bug — it means a key outlived the intent it was minted for —
 * so it is surfaced rather than papered over with a fresh key, which would
 * convert a caught mistake into a duplicated command.
 */
export function isIdempotencyKeyReused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_key_reused";
}
