// ─────────────────────────────────────────────────────────────────────────────
// The Order ledger. An Order is the money envelope for a cart: ONE gateway
// authorization covering N bookings, each captured or voided independently as
// its provider accepts or its pool runs dry.
//
// Bookings stay the unit of work. This is the only place money is accounted, so
// "how much of this order is authorized vs. captured vs. voided" has exactly one
// answer.
// ─────────────────────────────────────────────────────────────────────────────

export type MoneyLedger = {
  authorizedPaise: number;
  capturedPaise: number;
  voidedPaise: number;
  refundedPaise: number;
};

export type OrderStatusValue =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "AUTHORIZED"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "CANCELLED";

/** Job states from which a booking can never move again. */
export const TERMINAL_JOB_STATUSES = ["COMPLETED", "CANCELLED", "NO_WORKER_FOUND"] as const;

function isTerminal(status: string): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

/**
 * Throws when a ledger is impossible. Call before every write that moves money —
 * a corrupted ledger is far more expensive to discover during reconciliation
 * than to reject at the point of writing.
 */
export function assertMoneyInvariant(ledger: MoneyLedger): void {
  for (const [name, value] of Object.entries(ledger)) {
    if (value < 0) throw new Error(`Order ledger has a negative ${name}`);
  }
  if (ledger.capturedPaise + ledger.voidedPaise > ledger.authorizedPaise) {
    throw new Error("Order ledger: captured + voided exceeds authorized");
  }
  if (ledger.refundedPaise > ledger.capturedPaise) {
    throw new Error("Order ledger: refunded exceeds captured");
  }
}

/**
 * Derive the order's status from the states of its bookings. An order is only
 * CANCELLED when nothing in it was ever fulfilled; a cancellation next to a
 * completion is a settled order that happened to include a cancelled job.
 */
export function rollUpOrderStatus(jobStatuses: string[]): OrderStatusValue {
  if (jobStatuses.length === 0) return "DRAFT";
  if (jobStatuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (jobStatuses.every(isTerminal)) return "SETTLED";
  if (jobStatuses.some(isTerminal)) return "PARTIALLY_SETTLED";
  return "AUTHORIZED";
}
