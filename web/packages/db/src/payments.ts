// ─────────────────────────────────────────────────────────────────────────────
// Payment abstraction. The booking engine speaks only authorize/capture/void/
// refund; the ADAPTER decides what those mean per method.
//
// This matters in India: card authorizations hold funds for a few days, but
// plain UPI has no hold at all — it captures immediately, and "void" is really a
// refund. Keeping that knowledge in the adapter is what lets the engine stay
// branch-free and lets a later Razorpay client drop in as a constructor change.
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentMethod = "card" | "upi" | "wallet" | "cod";

/** What "authorize" physically does for a given method. */
export type AuthStrategy = "hold" | "immediate" | "none";

export function authStrategy(method: PaymentMethod): AuthStrategy {
  if (method === "card") return "hold";
  if (method === "upi" || method === "wallet") return "immediate";
  return "none";
}

export type GatewayPaymentState = "AUTHORIZED" | "CAPTURED" | "COD_PENDING";

export type AuthorizeInput = {
  amountPaise: number;
  method: PaymentMethod;
  /** Reused across retries so a double-submit never double-charges. */
  idempotencyKey: string;
};

export type GatewayResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type AuthorizeResult = GatewayResult<{
  intentId: string;
  state: GatewayPaymentState;
  expiresAt: Date | null;
}>;

export interface PaymentGateway {
  authorize(input: AuthorizeInput): Promise<AuthorizeResult>;
  capture(intentId: string, amountPaise: number): Promise<GatewayResult>;
  void(intentId: string, amountPaise: number): Promise<GatewayResult>;
  refund(intentId: string, amountPaise: number): Promise<GatewayResult>;
}

/** Card holds are good for ~5 days at most Indian acquirers; stay inside that. */
export const CARD_HOLD_DAYS = 5;

type Intent = {
  id: string;
  method: PaymentMethod;
  authorizedPaise: number;
  capturedPaise: number;
  voidedPaise: number;
  refundedPaise: number;
};

/**
 * In-memory demo gateway, shaped like Razorpay so swapping in the real client is
 * a constructor change. Enforces the same money invariants the Order ledger does,
 * which means integration bugs surface here rather than in production reconciliation.
 */
export class DemoPaymentGateway implements PaymentGateway {
  private intents = new Map<string, Intent>();
  private byKey = new Map<string, string>();

  async authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
    if (input.amountPaise <= 0) return { ok: false, error: "Amount must be positive" };

    const existingId = this.byKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.intents.get(existingId)!;
      return {
        ok: true,
        intentId: existing.id,
        state: this.stateFor(existing),
        expiresAt: this.expiryFor(existing.method),
      };
    }

    const strategy = authStrategy(input.method);
    const intent: Intent = {
      id: `demo_${Math.random().toString(36).slice(2, 12)}`,
      method: input.method,
      authorizedPaise: strategy === "none" ? 0 : input.amountPaise,
      // "immediate" methods are already captured the moment they authorize.
      capturedPaise: strategy === "immediate" ? input.amountPaise : 0,
      voidedPaise: 0,
      refundedPaise: 0,
    };
    this.intents.set(intent.id, intent);
    this.byKey.set(input.idempotencyKey, intent.id);

    return {
      ok: true,
      intentId: intent.id,
      state: this.stateFor(intent),
      expiresAt: this.expiryFor(input.method),
    };
  }

  async capture(intentId: string, amountPaise: number): Promise<GatewayResult> {
    const intent = this.intents.get(intentId);
    if (!intent) return { ok: false, error: "Unknown payment intent" };
    if (amountPaise <= 0) return { ok: false, error: "Amount must be positive" };
    const settled = intent.capturedPaise + intent.voidedPaise;
    if (settled + amountPaise > intent.authorizedPaise) {
      return { ok: false, error: "Capture exceeds authorized amount" };
    }
    intent.capturedPaise += amountPaise;
    return { ok: true };
  }

  async void(intentId: string, amountPaise: number): Promise<GatewayResult> {
    const intent = this.intents.get(intentId);
    if (!intent) return { ok: false, error: "Unknown payment intent" };
    if (amountPaise <= 0) return { ok: false, error: "Amount must be positive" };
    const settled = intent.capturedPaise + intent.voidedPaise;
    if (settled + amountPaise > intent.authorizedPaise) {
      return { ok: false, error: "Void exceeds authorized amount" };
    }
    intent.voidedPaise += amountPaise;
    return { ok: true };
  }

  async refund(intentId: string, amountPaise: number): Promise<GatewayResult> {
    const intent = this.intents.get(intentId);
    if (!intent) return { ok: false, error: "Unknown payment intent" };
    if (amountPaise <= 0) return { ok: false, error: "Amount must be positive" };
    if (intent.refundedPaise + amountPaise > intent.capturedPaise) {
      return { ok: false, error: "Refund exceeds captured amount" };
    }
    intent.refundedPaise += amountPaise;
    return { ok: true };
  }

  private stateFor(intent: Intent): GatewayPaymentState {
    if (authStrategy(intent.method) === "none") return "COD_PENDING";
    return intent.capturedPaise >= intent.authorizedPaise && intent.authorizedPaise > 0
      ? "CAPTURED"
      : "AUTHORIZED";
  }

  private expiryFor(method: PaymentMethod): Date | null {
    if (authStrategy(method) !== "hold") return null;
    return new Date(Date.now() + CARD_HOLD_DAYS * 24 * 60 * 60 * 1000);
  }
}
