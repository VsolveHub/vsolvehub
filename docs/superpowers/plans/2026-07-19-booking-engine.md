# Booking Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-service booking engine — an `Order` money envelope over draft `Booking` rows, "starts at" pricing resolved by a requirement configurator, and per-service slot selection at checkout.

**Architecture:** The cart is `Booking WHERE status='DRAFT'` (no cart tables). `Order` holds the single gateway authorization for the cart total. Each booking fans out to its own provider pool and is captured independently on accept. Pricing is a pure function whose result is snapshotted onto the booking, so catalog drift can never mutate a live cart.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 6 + Postgres (Supabase), TanStack Query 5, Zod 3, Tailwind v4, pnpm workspaces + Turbo. Tests: Vitest (introduced in Task 1).

## Global Constraints

- Money is always **integer paise**. Never floats, never rupees, in any variable, column, or API field.
- Booking slots must satisfy `slot ≤ now + 7 days`, enforced in Zod **and** a DB check constraint.
- Existing status names (`PENDING`, `SEARCHING_PROVIDER`, `ASSIGNED`, `PROVIDER_ARRIVING`, `STARTED`, `COMPLETED`, `CANCELLED`, `NO_WORKER_FOUND`) are **preserved**. Only `DRAFT` and `AUTHORIZED` are added. Do not rename.
- Client-supplied prices are never trusted. The server recomputes every price with `estimatePrice`.
- Every query that lists or dispatches bookings must exclude `DRAFT` via the shared `ACTIVE_BOOKING_WHERE`.
- Migrations are hand-authored SQL committed to `web/packages/db/prisma/migrations/`. Never run `prisma migrate dev` against the shared database.
- Spec: `docs/superpowers/specs/2026-07-19-booking-engine-design.md`.

---

## File Structure

**Created**
| Path | Responsibility |
|---|---|
| `web/vitest.config.ts` | Workspace test runner config |
| `web/packages/db/src/payments.ts` | `PaymentGateway` interface + method strategy + demo adapter |
| `web/packages/db/src/orders.ts` | Order money invariant + status roll-up |
| `web/packages/db/src/booking-scope.ts` | `ACTIVE_BOOKING_WHERE` — DRAFT containment |
| `web/apps/customer/lib/catalog/pricing.ts` | `estimatePrice`, `startingPricePaise` (pure) |
| `web/apps/customer/lib/cart/queries.ts` | Cart read/write over draft bookings |
| `web/apps/customer/lib/orders/checkout.ts` | Revalidate → authorize → fan-out |
| `web/apps/customer/components/customer/booking/RequirementSheet.tsx` | Configurator with live total |
| `web/apps/customer/components/customer/cart/SlotSheet.tsx` | Per-service slot picker |

**Modified**
| Path | Change |
|---|---|
| `web/packages/db/prisma/schema.prisma` | `Order`, enums, `Booking` columns |
| `web/packages/db/src/fulfillment.ts` | Capture on accept; DRAFT refusal |
| `web/apps/customer/lib/catalog/service-config.ts` | Priced field types |
| `web/apps/customer/lib/bookings/queries.ts` | Scope to active bookings |
| `web/apps/customer/lib/bookings/user-bookings.ts` | Scope to active bookings |
| `web/apps/customer/lib/fulfillment/push-dispatch.ts` | Refuse DRAFT/PENDING_PAYMENT |
| `web/apps/customer/app/api/bookings/route.ts` | Server-side price recompute |

---

## Task 1: Test infrastructure

**Files:**
- Create: `web/vitest.config.ts`, `web/packages/db/src/__tests__/smoke.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `pnpm test` at `web/` runs Vitest across the workspace.

- [ ] **Step 1: Install Vitest**

```bash
cd web && pnpm add -Dw vitest@^3.0.0
```

- [ ] **Step 2: Write the config**

```ts
// web/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["{apps,packages}/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/customer"),
      "@vsolve/db": path.resolve(__dirname, "packages/db/src/index.ts"),
    },
  },
});
```

- [ ] **Step 3: Add the script to `web/package.json`**

Add to `"scripts"`: `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 4: Write a smoke test**

```ts
// web/packages/db/src/__tests__/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("test infrastructure", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run and verify**

Run: `cd web && pnpm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add web/vitest.config.ts web/package.json web/pnpm-lock.yaml web/packages/db/src/__tests__/smoke.test.ts
git commit -m "test: add vitest to the web workspace"
```

---

## Task 2: Pricing engine (pure function)

**Files:**
- Create: `web/apps/customer/lib/catalog/pricing.ts`, `web/apps/customer/lib/catalog/pricing.test.ts`

**Interfaces:**
- Produces:
  - `estimatePrice(fields: PricedDetailField[], selections: Selections): PriceEstimate`
  - `startingPricePaise(fields: PricedDetailField[]): number`
  - Types `PricedDetailField`, `Selections`, `LineItem`, `PriceEstimate`

- [ ] **Step 1: Write the failing tests**

```ts
// web/apps/customer/lib/catalog/pricing.test.ts
import { describe, expect, it } from "vitest";
import { estimatePrice, startingPricePaise, type PricedDetailField } from "./pricing";

const FIELDS: PricedDetailField[] = [
  {
    key: "area", label: "Select area", type: "variant",
    options: [
      { value: "Only kitchen", pricePaise: 99800 },
      { value: "1 Bathroom & kitchen", pricePaise: 109800 },
      { value: "2 Bathrooms & kitchen", pricePaise: 119800 },
    ],
  },
  { key: "balconies", label: "Balconies", type: "counter", perUnitPaise: 20000, min: 0, max: 5 },
  {
    key: "extras", label: "Select add-ons", type: "addons",
    options: [
      { value: "Deep sanitisation", pricePaise: 30000 },
      { value: "Odour treatment", pricePaise: 15000 },
    ],
  },
  { key: "notes", label: "Notes", type: "text" },
];

describe("startingPricePaise", () => {
  it("is the cheapest variant", () => {
    expect(startingPricePaise(FIELDS)).toBe(99800);
  });

  it("is zero when there is no variant field", () => {
    expect(startingPricePaise([{ key: "n", label: "N", type: "text" }])).toBe(0);
  });
});

describe("estimatePrice", () => {
  it("falls back to the cheapest variant when nothing is selected", () => {
    const r = estimatePrice(FIELDS, {});
    expect(r.basePaise).toBe(99800);
    expect(r.totalPaise).toBe(99800);
  });

  it("uses the selected variant as the base", () => {
    const r = estimatePrice(FIELDS, { area: "2 Bathrooms & kitchen" });
    expect(r.basePaise).toBe(119800);
    expect(r.totalPaise).toBe(119800);
  });

  it("multiplies counters by their unit price", () => {
    const r = estimatePrice(FIELDS, { area: "Only kitchen", balconies: 2 });
    expect(r.totalPaise).toBe(99800 + 40000);
  });

  it("sums selected add-ons", () => {
    const r = estimatePrice(FIELDS, {
      area: "Only kitchen",
      extras: ["Deep sanitisation", "Odour treatment"],
    });
    expect(r.addOnsPaise).toBe(45000);
    expect(r.totalPaise).toBe(144800);
  });

  it("ignores unknown keys and unknown option values", () => {
    const r = estimatePrice(FIELDS, { area: "Nonexistent", mystery: "x", extras: ["Nope"] });
    expect(r.totalPaise).toBe(99800);
  });

  it("emits a line item per priced selection", () => {
    const r = estimatePrice(FIELDS, { area: "Only kitchen", balconies: 1 });
    expect(r.lineItems).toEqual([
      { key: "area", label: "Select area", value: "Only kitchen", qty: 1, unitPaise: 99800, totalPaise: 99800, kind: "variant" },
      { key: "balconies", label: "Balconies", value: "1", qty: 1, unitPaise: 20000, totalPaise: 20000, kind: "counter" },
    ]);
  });

  it("never returns a negative total", () => {
    const fields: PricedDetailField[] = [
      { key: "v", label: "V", type: "variant", options: [{ value: "a", pricePaise: 10000 }] },
      { key: "d", label: "D", type: "select", options: [{ value: "off", priceDeltaPaise: -99999 }] },
    ];
    expect(estimatePrice(fields, { v: "a", d: "off" }).totalPaise).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test pricing`
Expected: FAIL — cannot resolve `./pricing`.

- [ ] **Step 3: Implement**

```ts
// web/apps/customer/lib/catalog/pricing.ts
// Pure pricing engine. Given a service's priced requirement fields and the
// customer's selections, produce an exact total plus the line-item breakdown
// that gets snapshotted onto the booking.
//
// Total by construction: unknown keys and unknown option values are ignored
// rather than throwing, because config can drift ahead of a persisted cart.

export type PricedOption = { value: string; pricePaise: number; description?: string };
export type SelectOption = { value: string; priceDeltaPaise?: number };

export type PricedDetailField =
  | { key: string; label: string; type: "variant"; options: PricedOption[]; required?: boolean }
  | {
      key: string; label: string; type: "select"; options: SelectOption[];
      defaultValue?: string; required?: boolean; variant?: "pills" | "dropdown";
    }
  | {
      key: string; label: string; type: "counter"; perUnitPaise?: number;
      min?: number; max?: number; defaultValue?: number; required?: boolean;
    }
  | { key: string; label: string; type: "addons"; options: PricedOption[] }
  | { key: string; label: string; type: "text"; placeholder?: string; defaultValue?: string; required?: boolean };

export type Selections = Record<string, string | number | string[] | undefined>;

export type LineItemKind = "variant" | "option" | "counter" | "addon";

export type LineItem = {
  key: string;
  label: string;
  value: string;
  qty: number;
  unitPaise: number;
  totalPaise: number;
  kind: LineItemKind;
};

export type PriceEstimate = {
  basePaise: number;
  addOnsPaise: number;
  totalPaise: number;
  lineItems: LineItem[];
};

/** The "Starts at" price — the cheapest variant, or 0 when a service has none. */
export function startingPricePaise(fields: PricedDetailField[]): number {
  const variant = fields.find((f) => f.type === "variant");
  if (!variant || variant.type !== "variant" || variant.options.length === 0) return 0;
  return Math.min(...variant.options.map((o) => o.pricePaise));
}

function asArray(v: Selections[string]): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v !== "") return [v];
  return [];
}

export function estimatePrice(
  fields: PricedDetailField[],
  selections: Selections,
): PriceEstimate {
  const lineItems: LineItem[] = [];
  let basePaise = 0;
  let addOnsPaise = 0;

  for (const field of fields) {
    const raw = selections[field.key];

    if (field.type === "variant") {
      const picked = field.options.find((o) => o.value === raw);
      // No selection (or a stale one) falls back to the cheapest option so the
      // displayed total always matches the advertised "starts at" price.
      const option =
        picked ??
        field.options.reduce<PricedOption | undefined>(
          (min, o) => (!min || o.pricePaise < min.pricePaise ? o : min),
          undefined,
        );
      if (!option) continue;
      basePaise += option.pricePaise;
      lineItems.push({
        key: field.key, label: field.label, value: option.value, qty: 1,
        unitPaise: option.pricePaise, totalPaise: option.pricePaise, kind: "variant",
      });
      continue;
    }

    if (field.type === "select") {
      const option = field.options.find((o) => o.value === raw);
      if (!option?.priceDeltaPaise) continue;
      addOnsPaise += option.priceDeltaPaise;
      lineItems.push({
        key: field.key, label: field.label, value: option.value, qty: 1,
        unitPaise: option.priceDeltaPaise, totalPaise: option.priceDeltaPaise, kind: "option",
      });
      continue;
    }

    if (field.type === "counter") {
      const unit = field.perUnitPaise ?? 0;
      const qty = Math.max(0, Number(raw ?? field.defaultValue ?? field.min ?? 0) || 0);
      if (unit === 0 || qty === 0) continue;
      const total = unit * qty;
      addOnsPaise += total;
      lineItems.push({
        key: field.key, label: field.label, value: String(qty), qty,
        unitPaise: unit, totalPaise: total, kind: "counter",
      });
      continue;
    }

    if (field.type === "addons") {
      for (const value of asArray(raw)) {
        const option = field.options.find((o) => o.value === value);
        if (!option) continue;
        addOnsPaise += option.pricePaise;
        lineItems.push({
          key: field.key, label: field.label, value: option.value, qty: 1,
          unitPaise: option.pricePaise, totalPaise: option.pricePaise, kind: "addon",
        });
      }
    }
    // "text" fields carry no price.
  }

  const totalPaise = Math.max(0, basePaise + addOnsPaise);
  return { basePaise, addOnsPaise, totalPaise, lineItems };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && pnpm test pricing`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/apps/customer/lib/catalog/pricing.ts web/apps/customer/lib/catalog/pricing.test.ts
git commit -m "feat: add pure pricing engine for requirement-based estimates"
```

---

## Task 3: Payment gateway interface

**Files:**
- Create: `web/packages/db/src/payments.ts`, `web/packages/db/src/payments.test.ts`
- Modify: `web/packages/db/src/index.ts`

**Interfaces:**
- Produces: `PaymentGateway`, `authStrategy(method)`, `DemoPaymentGateway`, types `PaymentMethod`, `GatewayResult`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/packages/db/src/payments.test.ts
import { describe, expect, it } from "vitest";
import { DemoPaymentGateway, authStrategy } from "./payments";

describe("authStrategy", () => {
  it("holds funds for cards", () => expect(authStrategy("card")).toBe("hold"));
  it("captures UPI immediately", () => expect(authStrategy("upi")).toBe("immediate"));
  it("captures wallet immediately", () => expect(authStrategy("wallet")).toBe("immediate"));
  it("does nothing for COD", () => expect(authStrategy("cod")).toBe("none"));
});

describe("DemoPaymentGateway", () => {
  it("authorizes a card as a hold with an expiry", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toBe("AUTHORIZED");
    expect(r.expiresAt).toBeInstanceOf(Date);
  });

  it("authorizes UPI as an immediate capture", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 10000, method: "upi", idempotencyKey: "k2" });
    expect(r.ok && r.state).toBe("CAPTURED");
  });

  it("marks COD as pending with no money moved", async () => {
    const gw = new DemoPaymentGateway();
    const r = await gw.authorize({ amountPaise: 10000, method: "cod", idempotencyKey: "k3" });
    expect(r.ok && r.state).toBe("COD_PENDING");
  });

  it("is idempotent — the same key returns the same intent", async () => {
    const gw = new DemoPaymentGateway();
    const a = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "same" });
    const b = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "same" });
    expect(a.ok && b.ok && a.intentId).toBe(b.ok ? b.intentId : "");
  });

  it("refuses to capture more than was authorized", async () => {
    const gw = new DemoPaymentGateway();
    const auth = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k4" });
    if (!auth.ok) throw new Error("setup failed");
    const r = await gw.capture(auth.intentId, 20000);
    expect(r.ok).toBe(false);
  });

  it("allows capture in parts up to the authorized total", async () => {
    const gw = new DemoPaymentGateway();
    const auth = await gw.authorize({ amountPaise: 10000, method: "card", idempotencyKey: "k5" });
    if (!auth.ok) throw new Error("setup failed");
    expect((await gw.capture(auth.intentId, 6000)).ok).toBe(true);
    expect((await gw.capture(auth.intentId, 4000)).ok).toBe(true);
    expect((await gw.capture(auth.intentId, 1)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test payments`
Expected: FAIL — cannot resolve `./payments`.

- [ ] **Step 3: Implement**

```ts
// web/packages/db/src/payments.ts
// Payment abstraction. The booking engine speaks only authorize/capture/void/
// refund; the ADAPTER decides what those mean per method. This matters in India:
// card auths hold funds for a few days, but plain UPI has no hold at all — it
// captures immediately and "void" is really a refund. Keeping that knowledge in
// the adapter is what lets the engine stay branch-free.

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
 * a constructor change. Enforces the same money invariants the ledger does.
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
    // Immediate methods captured at authorize time; treat further captures as no-ops
    // only when they stay inside the authorized envelope.
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
```

- [ ] **Step 4: Export it**

Add `export * from "./payments";` to `web/packages/db/src/index.ts`.

- [ ] **Step 5: Run to verify pass**

Run: `cd web && pnpm test payments`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/packages/db/src/payments.ts web/packages/db/src/payments.test.ts web/packages/db/src/index.ts
git commit -m "feat: add payment gateway abstraction with per-method auth strategy"
```

---

## Task 4: Order money ledger

**Files:**
- Create: `web/packages/db/src/orders.ts`, `web/packages/db/src/orders.test.ts`
- Modify: `web/packages/db/src/index.ts`

**Interfaces:**
- Produces: `assertMoneyInvariant(ledger)`, `rollUpOrderStatus(jobStatuses)`, `TERMINAL_JOB_STATUSES`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/packages/db/src/orders.test.ts
import { describe, expect, it } from "vitest";
import { assertMoneyInvariant, rollUpOrderStatus } from "./orders";

describe("assertMoneyInvariant", () => {
  const ok = { authorizedPaise: 1000, capturedPaise: 600, voidedPaise: 400, refundedPaise: 0 };

  it("accepts a balanced ledger", () => {
    expect(() => assertMoneyInvariant(ok)).not.toThrow();
  });

  it("rejects captured + voided over authorized", () => {
    expect(() => assertMoneyInvariant({ ...ok, capturedPaise: 700 })).toThrow(/exceeds authorized/);
  });

  it("rejects refund over captured", () => {
    expect(() => assertMoneyInvariant({ ...ok, refundedPaise: 700 })).toThrow(/exceeds captured/);
  });

  it("rejects negative amounts", () => {
    expect(() => assertMoneyInvariant({ ...ok, voidedPaise: -1 })).toThrow(/negative/);
  });
});

describe("rollUpOrderStatus", () => {
  it("stays AUTHORIZED while every job is live", () => {
    expect(rollUpOrderStatus(["ASSIGNED", "SEARCHING_PROVIDER"])).toBe("AUTHORIZED");
  });

  it("is PARTIALLY_SETTLED when some jobs are terminal", () => {
    expect(rollUpOrderStatus(["COMPLETED", "ASSIGNED"])).toBe("PARTIALLY_SETTLED");
  });

  it("is SETTLED when every job is terminal", () => {
    expect(rollUpOrderStatus(["COMPLETED", "NO_WORKER_FOUND"])).toBe("SETTLED");
  });

  it("is CANCELLED when every job was cancelled", () => {
    expect(rollUpOrderStatus(["CANCELLED", "CANCELLED"])).toBe("CANCELLED");
  });

  it("treats an empty order as DRAFT", () => {
    expect(rollUpOrderStatus([])).toBe("DRAFT");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test orders`
Expected: FAIL — cannot resolve `./orders`.

- [ ] **Step 3: Implement**

```ts
// web/packages/db/src/orders.ts
// The Order ledger. An Order is the money envelope for a cart: one gateway
// authorization covering N bookings, each captured or voided independently.

export type MoneyLedger = {
  authorizedPaise: number;
  capturedPaise: number;
  voidedPaise: number;
  refundedPaise: number;
};

export type OrderStatusValue =
  | "DRAFT" | "PENDING_PAYMENT" | "AUTHORIZED"
  | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED";

/** Job states from which a booking can never move again. */
export const TERMINAL_JOB_STATUSES = ["COMPLETED", "CANCELLED", "NO_WORKER_FOUND"] as const;

function isTerminal(status: string): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

/**
 * Throws when a ledger is impossible. Call before every write that moves money —
 * a corrupted ledger is far more expensive to discover later than to reject now.
 */
export function assertMoneyInvariant(ledger: MoneyLedger): void {
  const { authorizedPaise, capturedPaise, voidedPaise, refundedPaise } = ledger;
  for (const [name, value] of Object.entries(ledger)) {
    if (value < 0) throw new Error(`Order ledger has a negative ${name}`);
  }
  if (capturedPaise + voidedPaise > authorizedPaise) {
    throw new Error("Order ledger: captured + voided exceeds authorized");
  }
  if (refundedPaise > capturedPaise) {
    throw new Error("Order ledger: refunded exceeds captured");
  }
}

/** Derive the order's status from the states of its bookings. */
export function rollUpOrderStatus(jobStatuses: string[]): OrderStatusValue {
  if (jobStatuses.length === 0) return "DRAFT";
  if (jobStatuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (jobStatuses.every(isTerminal)) return "SETTLED";
  if (jobStatuses.some(isTerminal)) return "PARTIALLY_SETTLED";
  return "AUTHORIZED";
}
```

- [ ] **Step 4: Export it**

Add `export * from "./orders";` to `web/packages/db/src/index.ts`.

- [ ] **Step 5: Run to verify pass**

Run: `cd web && pnpm test orders`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/packages/db/src/orders.ts web/packages/db/src/orders.test.ts web/packages/db/src/index.ts
git commit -m "feat: add order money ledger invariant and status roll-up"
```

---

## Task 5: Schema and migration

**Files:**
- Modify: `web/packages/db/prisma/schema.prisma`
- Create: `web/packages/db/prisma/migrations/20260719120000_booking_engine_orders/migration.sql`

**Interfaces:**
- Produces: Prisma models `Order`, enums `OrderStatus`, `PaymentState`, `JobStatus`; `Booking.orderId`, `Booking.lineItems`, `Booking.capturedPaise`, `Booking.providerLat/Lng/LocatedAt`, `Booking.etaMinutes`.

- [ ] **Step 1: Add enums and the Order model to `schema.prisma`**

```prisma
enum OrderStatus {
  DRAFT
  PENDING_PAYMENT
  AUTHORIZED
  PARTIALLY_SETTLED
  SETTLED
  CANCELLED
}

enum PaymentState {
  NONE
  AUTHORIZED
  PARTIALLY_CAPTURED
  CAPTURED
  VOIDED
  REFUNDED
  COD_PENDING
}

/// Job lifecycle. Names match the pre-existing string statuses on purpose — the
/// partner app and shared fulfillment engine depend on them. DRAFT (in cart) and
/// AUTHORIZED (paid hold placed, not yet dispatched) are the only new states.
enum JobStatus {
  DRAFT
  AUTHORIZED
  PENDING
  SEARCHING_PROVIDER
  ASSIGNED
  PROVIDER_ARRIVING
  STARTED
  COMPLETED
  CANCELLED
  NO_WORKER_FOUND
}

/// The money envelope for a cart: ONE gateway authorization covering N bookings.
/// Bookings stay the unit of work; this is the only place money is accounted.
model Order {
  id              String       @id @default(cuid())
  orderRef        String       @unique
  userId          String
  status          OrderStatus  @default(DRAFT)
  paymentState    PaymentState @default(NONE)
  paymentMethod   String?
  gatewayIntentId String?
  idempotencyKey  String?      @unique
  authorizedPaise Int          @default(0)
  capturedPaise   Int          @default(0)
  voidedPaise     Int          @default(0)
  refundedPaise   Int          @default(0)
  authorizedAt    DateTime?
  authExpiresAt   DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  user     User      @relation(fields: [userId], references: [id])
  bookings Booking[]

  @@index([userId, status])
}
```

- [ ] **Step 2: Add the `Booking` columns and switch `status` to the enum**

In `model Booking`, change `status String @default("REQUESTED")` to `status JobStatus @default(PENDING)` and add:

```prisma
  orderId           String?
  order             Order?    @relation(fields: [orderId], references: [id])
  /// Snapshot of the priced requirement selections at add-to-cart time. JSON
  /// array of { key, label, value, qty, unitPaise, totalPaise, kind }.
  lineItems         String    @default("[]")
  capturedPaise     Int       @default(0)
  providerLat       Float?
  providerLng       Float?
  providerLocatedAt DateTime?
  etaMinutes        Int?
```

- [ ] **Step 3: Add the `orders` relation to `model User`**

Add `orders Order[]` to the `User` model's relation block.

- [ ] **Step 4: Hand-author the migration**

```sql
-- web/packages/db/prisma/migrations/20260719120000_booking_engine_orders/migration.sql

-- 1. Enums -------------------------------------------------------------------
CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT','PENDING_PAYMENT','AUTHORIZED','PARTIALLY_SETTLED','SETTLED','CANCELLED'
);

CREATE TYPE "PaymentState" AS ENUM (
  'NONE','AUTHORIZED','PARTIALLY_CAPTURED','CAPTURED','VOIDED','REFUNDED','COD_PENDING'
);

CREATE TYPE "JobStatus" AS ENUM (
  'DRAFT','AUTHORIZED','PENDING','SEARCHING_PROVIDER','ASSIGNED',
  'PROVIDER_ARRIVING','STARTED','COMPLETED','CANCELLED','NO_WORKER_FOUND'
);

-- 2. Order table -------------------------------------------------------------
CREATE TABLE "Order" (
  "id"              TEXT PRIMARY KEY,
  "orderRef"        TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "status"          "OrderStatus"  NOT NULL DEFAULT 'DRAFT',
  "paymentState"    "PaymentState" NOT NULL DEFAULT 'NONE',
  "paymentMethod"   TEXT,
  "gatewayIntentId" TEXT,
  "idempotencyKey"  TEXT,
  "authorizedPaise" INTEGER NOT NULL DEFAULT 0,
  "capturedPaise"   INTEGER NOT NULL DEFAULT 0,
  "voidedPaise"     INTEGER NOT NULL DEFAULT 0,
  "refundedPaise"   INTEGER NOT NULL DEFAULT 0,
  "authorizedAt"    TIMESTAMP(3),
  "authExpiresAt"   TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Order_orderRef_key"       ON "Order"("orderRef");
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX        "Order_userId_status_idx"  ON "Order"("userId","status");

-- A user may hold at most one open order at a time (idempotent checkout).
CREATE UNIQUE INDEX "Order_one_open_per_user" ON "Order"("userId")
  WHERE "status" IN ('DRAFT','PENDING_PAYMENT');

-- 3. Booking columns ---------------------------------------------------------
ALTER TABLE "Booking"
  ADD COLUMN "orderId"           TEXT,
  ADD COLUMN "lineItems"         TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "capturedPaise"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerLat"       DOUBLE PRECISION,
  ADD COLUMN "providerLng"       DOUBLE PRECISION,
  ADD COLUMN "providerLocatedAt" TIMESTAMP(3),
  ADD COLUMN "etaMinutes"        INTEGER;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");

-- 4. Backfill legacy statuses BEFORE converting the column -------------------
UPDATE "Booking" SET "status" = 'PENDING'            WHERE "status" = 'REQUESTED';
UPDATE "Booking" SET "status" = 'SEARCHING_PROVIDER' WHERE "status" = 'SEARCHING';
UPDATE "Booking" SET "status" = 'ASSIGNED'           WHERE "status" = 'ACCEPTED';
UPDATE "Booking" SET "status" = 'PROVIDER_ARRIVING'  WHERE "status" IN ('ON_THE_WAY','ARRIVED');
UPDATE "Booking" SET "status" = 'STARTED'            WHERE "status" = 'IN_PROGRESS';

-- Fail loudly rather than silently coercing an unmapped value.
DO $$
DECLARE bad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM "Booking"
  WHERE "status" NOT IN (
    'DRAFT','AUTHORIZED','PENDING','SEARCHING_PROVIDER','ASSIGNED',
    'PROVIDER_ARRIVING','STARTED','COMPLETED','CANCELLED','NO_WORKER_FOUND'
  );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: % booking rows have an unmapped status', bad_count;
  END IF;
END $$;

-- 5. Convert the column ------------------------------------------------------
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking"
  ALTER COLUMN "status" TYPE "JobStatus" USING "status"::"JobStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 6. Keep carts out of every existing booking list --------------------------
CREATE INDEX "Booking_userId_status_idx" ON "Booking"("userId","status");

-- 7. Enforce the 7-day booking window ---------------------------------------
-- Existing rows predate the rule, so validate only new/updated rows.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slot_within_window"
  CHECK ("slot" <= "createdAt" + INTERVAL '8 days') NOT VALID;
```

- [ ] **Step 5: Regenerate the client and typecheck**

Run: `cd web && pnpm db:generate && pnpm typecheck`
Expected: Prisma client regenerates. Fix any `status` comparison the enum now rejects — names are unchanged, so failures should be limited to places typed as bare `string`.

- [ ] **Step 6: Commit**

```bash
git add web/packages/db/prisma
git commit -m "feat: add Order model, JobStatus enum, and booking engine columns"
```

> **Deployment note:** this migration is applied with `pnpm db:migrate:deploy`. It is
> additive apart from the `status` type change, which is guarded by the backfill and the
> loud failure check above.

---

## Task 6: DRAFT containment

**Files:**
- Create: `web/packages/db/src/booking-scope.ts`, `web/packages/db/src/booking-scope.test.ts`
- Modify: `web/packages/db/src/index.ts`, `web/packages/db/src/fulfillment.ts`, `web/apps/customer/lib/bookings/queries.ts`, `web/apps/customer/lib/bookings/user-bookings.ts`, `web/apps/customer/lib/fulfillment/push-dispatch.ts`

**Interfaces:**
- Consumes: `JobStatus` from Task 5.
- Produces: `ACTIVE_BOOKING_WHERE`, `CART_STATUSES`, `isDispatchable(status)`.

- [ ] **Step 1: Write the failing test**

```ts
// web/packages/db/src/booking-scope.test.ts
import { describe, expect, it } from "vitest";
import { ACTIVE_BOOKING_WHERE, isDispatchable } from "./booking-scope";

describe("ACTIVE_BOOKING_WHERE", () => {
  it("excludes cart states from every booking list", () => {
    expect(ACTIVE_BOOKING_WHERE).toEqual({ status: { notIn: ["DRAFT", "PENDING_PAYMENT"] } });
  });
});

describe("isDispatchable", () => {
  it("refuses a draft booking", () => expect(isDispatchable("DRAFT")).toBe(false));
  it("refuses an unpaid checkout", () => expect(isDispatchable("PENDING_PAYMENT")).toBe(false));
  it("allows an authorized booking", () => expect(isDispatchable("AUTHORIZED")).toBe(true));
  it("allows a pending booking", () => expect(isDispatchable("PENDING")).toBe(true));
  it("refuses a terminal booking", () => expect(isDispatchable("COMPLETED")).toBe(false));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test booking-scope`
Expected: FAIL — cannot resolve `./booking-scope`.

- [ ] **Step 3: Implement**

```ts
// web/packages/db/src/booking-scope.ts
// DRAFT containment. Once the cart is "bookings with status DRAFT", every query
// that lists or dispatches bookings must exclude them or carts leak into order
// history, partner feeds, and dispatch waves. Import this instead of hand-writing
// a status filter — one definition means one place to get it right.

export const CART_STATUSES = ["DRAFT", "PENDING_PAYMENT"] as const;

/** Spread into any Prisma `where` that lists real (non-cart) bookings. */
export const ACTIVE_BOOKING_WHERE = {
  status: { notIn: [...CART_STATUSES] },
} as const;

const NON_DISPATCHABLE = [
  ...CART_STATUSES,
  "COMPLETED",
  "CANCELLED",
  "NO_WORKER_FOUND",
] as readonly string[];

/** Guard at every dispatch entry point — a defensive assert, not a filter. */
export function isDispatchable(status: string): boolean {
  return !NON_DISPATCHABLE.includes(status);
}
```

- [ ] **Step 4: Export it**

Add `export * from "./booking-scope";` to `web/packages/db/src/index.ts`.

- [ ] **Step 5: Apply to every leak site**

`web/apps/customer/lib/bookings/queries.ts` — `getUserBookings`:
```ts
where: { userId, ...ACTIVE_BOOKING_WHERE },
```

`web/apps/customer/lib/bookings/user-bookings.ts` — `getUserBookingCount`:
```ts
prisma.booking.count({ where: { userId, ...ACTIVE_BOOKING_WHERE } }),
```

`web/packages/db/src/fulfillment.ts` — `getPartnerActiveJobs`, `getPartnerJobHistory`,
`getPartnerPendingOffers` all filter on explicit status lists already, but add the guard to
`acceptJobOffer` right after the assignment lookup:
```ts
if (!isDispatchable(assignment.booking.status)) {
  return { ok: false, error: "This job is no longer available" };
}
```

`web/apps/customer/lib/fulfillment/push-dispatch.ts` — at the top of
`dispatchBookingOffers` and `dispatchDirectOffer`:
```ts
if (!isDispatchable(booking.status)) return { ok: false as const, error: "Booking is not dispatchable" };
```
(In `dispatchBookingOffers`, whose return shape has no `ok`, use `return { offersCreated: 0 }`.)

- [ ] **Step 6: Run tests and typecheck**

Run: `cd web && pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/packages/db/src web/apps/customer/lib
git commit -m "feat: contain DRAFT bookings from lists, dispatch, and partner feeds"
```

---

## Task 7: Priced service config

**Files:**
- Modify: `web/apps/customer/lib/catalog/service-config.ts`
- Create: `web/apps/customer/lib/catalog/service-config.test.ts`

**Interfaces:**
- Consumes: `PricedDetailField`, `estimatePrice`, `startingPricePaise` (Task 2).
- Produces: `getServiceConfig` returning `detailFields: PricedDetailField[]`; every category default carries a `variant` field.

- [ ] **Step 1: Write the failing test**

```ts
// web/apps/customer/lib/catalog/service-config.test.ts
import { describe, expect, it } from "vitest";
import { getServiceConfig } from "./service-config";
import { estimatePrice, startingPricePaise } from "./pricing";

const CATEGORIES = ["technician", "beauty-wellness", "home-services", "pet-services"];

describe("service config pricing", () => {
  for (const slug of CATEGORIES) {
    it(`${slug} exposes exactly one variant field`, () => {
      const config = getServiceConfig(slug);
      const variants = config.detailFields.filter((f) => f.type === "variant");
      expect(variants).toHaveLength(1);
    });

    it(`${slug} has a positive starting price`, () => {
      expect(startingPricePaise(getServiceConfig(slug).detailFields)).toBeGreaterThan(0);
    });

    it(`${slug} prices an empty selection at its starting price`, () => {
      const fields = getServiceConfig(slug).detailFields;
      expect(estimatePrice(fields, {}).totalPaise).toBe(startingPricePaise(fields));
    });
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test service-config`
Expected: FAIL — no variant fields configured yet.

- [ ] **Step 3: Change the type and add variant fields**

In `service-config.ts`, replace the local `DetailField` union with a re-export so there is
one definition:

```ts
import type { PricedDetailField } from "./pricing";
export type DetailField = PricedDetailField;
export type { PricedDetailField };
```

Then give every category default a `variant` field. Example for `TECHNICIAN`:

```ts
detailFields: [
  {
    key: "scope",
    label: "Select scope",
    type: "variant",
    required: true,
    options: [
      { value: "Inspection & diagnosis", pricePaise: 29900, description: "Fault finding, no parts" },
      { value: "Standard repair", pricePaise: 49900, description: "Diagnosis + common repairs" },
      { value: "Major repair", pricePaise: 89900, description: "Extended labour, complex faults" },
    ],
  },
  {
    key: "extras",
    label: "Select add-ons",
    type: "addons",
    options: [
      { value: "Same-day priority", pricePaise: 14900 },
      { value: "Annual maintenance check", pricePaise: 24900 },
    ],
  },
  ...existing unpriced fields,
],
```

Apply the equivalent for `BEAUTY`, `HOME`, and `PET` category defaults, keeping their
existing unpriced `select`/`counter`/`text` fields intact. Convert any existing `select`
whose `options` were `string[]` into `{ value }[]`.

- [ ] **Step 4: Update `defaultDetailValues` and `toDetailPairs`**

```ts
export function defaultDetailValues(fields: DetailField[]): Selections {
  const out: Selections = {};
  for (const f of fields) {
    if (f.type === "variant") out[f.key] = f.options[0]?.value ?? "";
    else if (f.type === "addons") out[f.key] = [];
    else if (f.type === "counter") out[f.key] = f.defaultValue ?? f.min ?? 0;
    else if (f.type === "select") out[f.key] = f.defaultValue ?? f.options[0]?.value ?? "";
    else out[f.key] = f.defaultValue ?? "";
  }
  return out;
}

export function toDetailPairs(fields: DetailField[], values: Selections) {
  return fields
    .map((f) => {
      const v = values[f.key];
      const text = Array.isArray(v) ? v.join(", ") : String(v ?? "");
      return { label: f.label, value: text };
    })
    .filter((p) => p.value !== "");
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd web && pnpm test && pnpm typecheck`
Expected: all pass. `ServiceBookingFlow.tsx` will need its `select` option rendering updated
from `opt` to `opt.value` — do that here.

- [ ] **Step 6: Commit**

```bash
git add web/apps/customer/lib/catalog web/apps/customer/components/customer/booking/ServiceBookingFlow.tsx
git commit -m "feat: add priced requirement fields to every dispatch category"
```

---

## Task 8: Server-side price recompute

**Files:**
- Create: `web/apps/customer/lib/catalog/price-service.ts`, `web/apps/customer/lib/catalog/price-service.test.ts`
- Modify: `web/apps/customer/app/api/bookings/route.ts`, `web/apps/customer/lib/bookings/queries.ts`, `web/apps/customer/lib/validation/schemas.ts`

**Interfaces:**
- Consumes: `estimatePrice`, `getServiceConfig`.
- Produces: `priceBooking({ categorySlug, subCategorySlug, serviceSlug, selections })` returning `PriceEstimate`.

- [ ] **Step 1: Write the failing test**

```ts
// web/apps/customer/lib/catalog/price-service.test.ts
import { describe, expect, it } from "vitest";
import { priceBooking } from "./price-service";

describe("priceBooking", () => {
  it("prices a technician job from its selections", () => {
    const r = priceBooking({
      categorySlug: "technician",
      selections: { scope: "Standard repair" },
    });
    expect(r.totalPaise).toBe(49900);
  });

  it("ignores a client-supplied price entirely", () => {
    const r = priceBooking({
      categorySlug: "technician",
      selections: { scope: "Standard repair", totalPaise: 1 } as never,
    });
    expect(r.totalPaise).toBe(49900);
  });

  it("falls back to the starting price for unknown selections", () => {
    const r = priceBooking({ categorySlug: "technician", selections: { scope: "bogus" } });
    expect(r.totalPaise).toBe(29900);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test price-service`
Expected: FAIL — cannot resolve `./price-service`.

- [ ] **Step 3: Implement**

```ts
// web/apps/customer/lib/catalog/price-service.ts
// Server-side pricing. The client shows a live estimate, but the number that
// reaches the database is always recomputed here from the customer's selections
// and the current config — a client-supplied total is never read.

import { getServiceConfig } from "./service-config";
import { estimatePrice, type PriceEstimate, type Selections } from "./pricing";

export function priceBooking(input: {
  categorySlug: string;
  subCategorySlug?: string | null;
  serviceSlug?: string | null;
  selections: Selections;
}): PriceEstimate {
  const config = getServiceConfig(
    input.categorySlug,
    input.subCategorySlug ?? undefined,
    input.serviceSlug ?? undefined,
  );
  return estimatePrice(config.detailFields, input.selections ?? {});
}
```

- [ ] **Step 4: Accept selections in the Zod schema**

In `schemas.ts`, add to `bookingSchema`:

```ts
  selections: z
    .record(z.union([z.string(), z.number(), z.array(z.string())]))
    .optional(),
```

and enforce the booking window:

```ts
  slot: z
    .string()
    .datetime({ message: "A valid time slot is required" })
    .refine(
      (v) => new Date(v).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000,
      { message: "Bookings can only be made up to 7 days ahead" },
    ),
```

- [ ] **Step 5: Use it in the booking route**

In `web/apps/customer/app/api/bookings/route.ts`, replace
`const quotedAmount = service.pricePaise;` with:

```ts
  // Never trust a client-sent price — recompute from the selections.
  const estimate = priceBooking({
    categorySlug: service.category.slug,
    serviceSlug: service.slug,
    selections: selections ?? {},
  });
  const quotedAmount = estimate.totalPaise > 0 ? estimate.totalPaise : service.pricePaise;
```

Pass `lineItems: estimate.lineItems` into `createBooking`, and in
`lib/bookings/queries.ts` add `lineItems?: LineItem[]` to the input type with
`lineItems: JSON.stringify(input.lineItems ?? [])` in the `data` block.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd web && pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/apps/customer/lib web/apps/customer/app/api/bookings/route.ts
git commit -m "feat: recompute booking prices server-side and snapshot line items"
```

---

## Task 9: Requirement sheet UI

**Files:**
- Create: `web/apps/customer/components/customer/booking/RequirementSheet.tsx`
- Modify: `web/apps/customer/components/customer/booking/ServiceBookingFlow.tsx`

**Interfaces:**
- Consumes: `estimatePrice`, `PricedDetailField`, `Selections`.
- Produces: `<RequirementSheet service fields value onChange onDone />` — a bottom sheet with
  collapsible groups and a sticky `₹total | Done` footer.

- [ ] **Step 1: Build the sheet**

Mirror the reference UI: header with service name and "Starts at ₹X · N mins", one
collapsible section per field, and a sticky footer showing the live total.

```tsx
"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { estimatePrice, type PricedDetailField, type Selections } from "@/lib/catalog/pricing";

type Props = {
  serviceName: string;
  durationMins: number;
  fields: PricedDetailField[];
  value: Selections;
  onChange: (next: Selections) => void;
  onDone: () => void;
  doneLabel?: string;
};

export function RequirementSheet({
  serviceName, durationMins, fields, value, onChange, onDone, doneLabel = "Done",
}: Props) {
  const estimate = useMemo(() => estimatePrice(fields, value), [fields, value]);
  const [openKey, setOpenKey] = useState(fields[0]?.key ?? "");

  function set(key: string, next: string | number | string[]) {
    onChange({ ...value, [key]: next });
  }

  function toggleAddon(key: string, option: string) {
    const current = Array.isArray(value[key]) ? (value[key] as string[]) : [];
    set(key, current.includes(option) ? current.filter((v) => v !== option) : [...current, option]);
  }

  const requiredMissing = fields.some(
    (f) => f.required && (value[f.key] === undefined || value[f.key] === ""),
  );

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="px-5 pt-5 pb-4 border-b border-gray-100">
        <h2 className="text-2xl font-extrabold text-gray-900">{serviceName}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Starts at <strong className="text-gray-900">{formatPrice(estimate.basePaise)}</strong>
          {durationMins > 0 && <> · {durationMins} mins</>}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <h3 className="text-xl font-extrabold text-gray-900 mb-4">Select requirements</h3>

        {fields.map((field) => {
          if (field.type === "text") return null;
          const open = openKey === field.key;
          return (
            <section key={field.key} className="border-b border-gray-100 py-4">
              <button
                type="button"
                onClick={() => setOpenKey(open ? "" : field.key)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={open}
              >
                <span className="text-base font-bold text-gray-900">
                  {field.label}
                  {field.required && <span className="ml-1 text-danger">*</span>}
                </span>
                <span className="text-gray-400">{open ? "⌃" : "⌄"}</span>
              </button>

              {open && field.type === "variant" && (
                <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                  {field.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(field.key, o.value)}
                      className={`min-w-[160px] shrink-0 rounded-xl border-2 p-3 text-left transition ${
                        value[field.key] === o.value
                          ? "border-brand bg-brand/5"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <span className="block text-sm font-bold text-gray-900">{o.value}</span>
                      {o.description && (
                        <span className="mt-1 block text-xs text-gray-500">{o.description}</span>
                      )}
                      <span className="mt-2 block text-sm font-extrabold text-gray-900">
                        {formatPrice(o.pricePaise)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {open && field.type === "addons" && (
                <div className="mt-3 flex flex-col gap-2">
                  {field.options.map((o) => {
                    const checked = (value[field.key] as string[] | undefined)?.includes(o.value);
                    return (
                      <label
                        key={o.value}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={() => toggleAddon(field.key, o.value)}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        <span className="flex-1 text-sm font-semibold text-gray-900">{o.value}</span>
                        <span className="text-sm font-bold text-gray-900">
                          +{formatPrice(o.pricePaise)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {open && field.type === "counter" && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {field.perUnitPaise ? `${formatPrice(field.perUnitPaise)} each` : ""}
                  </span>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      aria-label={`Decrease ${field.label}`}
                      onClick={() =>
                        set(field.key, Math.max(field.min ?? 0, Number(value[field.key] ?? 0) - 1))
                      }
                      className="h-8 w-8 rounded-full border border-gray-200 font-bold"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-extrabold">
                      {Number(value[field.key] ?? field.min ?? 0)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${field.label}`}
                      onClick={() =>
                        set(field.key, Math.min(field.max ?? 99, Number(value[field.key] ?? 0) + 1))
                      }
                      className="h-8 w-8 rounded-full border border-gray-200 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {open && field.type === "select" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {field.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(field.key, o.value)}
                      className={`rounded-full border px-4 py-2 text-xs font-bold ${
                        value[field.key] === o.value
                          ? "border-brand bg-brand text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      {o.value}
                      {o.priceDeltaPaise ? ` +${formatPrice(o.priceDeltaPaise)}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer className="sticky bottom-0 flex items-center gap-4 border-t border-gray-100 bg-white px-5 py-4">
        <div>
          <p className="text-lg font-extrabold text-gray-900">{formatPrice(estimate.totalPaise)}</p>
          <p className="text-[11px] text-gray-500">Estimated · final on confirmation</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          disabled={requiredMissing}
          className="ml-auto flex-1 rounded-xl bg-brand py-3 text-base font-bold text-white disabled:bg-gray-200 disabled:text-gray-400"
        >
          {doneLabel}
        </button>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Use it in the flow**

In `ServiceBookingFlow.tsx`, replace the ad-hoc field rendering in the `details` step with
`<RequirementSheet …>` and drive `detailValues` through it. Replace every hardcoded
`formatPrice(service.pricePaise)` in the summary aside, the provider banner, and the confirm
button with the live `estimatePrice(config.detailFields, detailValues).totalPaise`. Send
`selections: detailValues` in the `createBooking` payload.

- [ ] **Step 3: Verify in the running app**

Run the dev server, open a technician service, and confirm the footer total changes as
options are tapped and that the confirm button shows the same number.

- [ ] **Step 4: Commit**

```bash
git add web/apps/customer/components/customer/booking
git commit -m "feat: add requirement sheet with live price estimate"
```

---

## Task 10: "Starts at" catalog display

**Files:**
- Modify: `web/apps/customer/components/customer/home/HomeServiceVerticalCard.tsx`, `web/apps/customer/components/customer/home/HomeServiceSquareAddCard.tsx`, `web/apps/customer/app/(customer)/services/[category]/[slug]/page.tsx`

- [ ] **Step 1: Replace fixed price copy with "Starts at"**

Every card and the service detail page currently render `formatPrice(service.pricePaise)` as
a definite price. Change the label to `Starts at {formatPrice(service.pricePaise)}` and, on
the detail page, add the sub-line "Final price depends on your selected requirements."

- [ ] **Step 2: Verify visually**

Run the dev server and confirm home cards, category listings, and the detail page all read
"Starts at ₹X".

- [ ] **Step 3: Commit**

```bash
git add web/apps/customer
git commit -m "feat: present catalog prices as 'starts at'"
```

---

## Task 11: Cart data layer

**Files:**
- Create: `web/apps/customer/lib/cart/queries.ts`, `web/apps/customer/lib/cart/queries.test.ts`
- Create: `web/apps/customer/app/api/cart/route.ts`, `web/apps/customer/app/api/cart/[id]/route.ts`

**Interfaces:**
- Consumes: `priceBooking`, `ACTIVE_BOOKING_WHERE`.
- Produces: `getCart(userId)`, `addToCart(input)`, `updateCartItem(...)`, `removeCartItem(...)`,
  `cartTotalPaise(items)`.

- [ ] **Step 1: Write the failing test for the pure part**

```ts
// web/apps/customer/lib/cart/queries.test.ts
import { describe, expect, it } from "vitest";
import { cartTotalPaise } from "./queries";

describe("cartTotalPaise", () => {
  it("sums quoted amounts", () => {
    expect(cartTotalPaise([{ quotedAmount: 49900 }, { quotedAmount: 99800 }])).toBe(149700);
  });
  it("is zero for an empty cart", () => {
    expect(cartTotalPaise([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test cart`
Expected: FAIL — cannot resolve `./queries`.

- [ ] **Step 3: Implement the data layer**

```ts
// web/apps/customer/lib/cart/queries.ts
// The cart IS draft bookings — there are no cart tables. Everything here reads
// and writes Booking rows whose status is DRAFT.

import { prisma } from "@/lib/db/client";
import { generateBookingRef } from "@/lib/format";
import { priceBooking } from "@/lib/catalog/price-service";
import type { Selections } from "@/lib/catalog/pricing";

const cartInclude = {
  service: { include: { category: true, subCategory: true } },
  address: true,
} as const;

export function cartTotalPaise(items: { quotedAmount: number }[]): number {
  return items.reduce((sum, i) => sum + i.quotedAmount, 0);
}

export async function getCart(userId: string) {
  return prisma.booking.findMany({
    where: { userId, status: "DRAFT" },
    include: cartInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function addToCart(input: {
  userId: string;
  serviceId: string;
  selections: Selections;
}) {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { category: true, subCategory: true },
  });
  if (!service) return { ok: false as const, error: "Service not found" };

  // Server-side price — the client's number is never read.
  const estimate = priceBooking({
    categorySlug: service.category.slug,
    subCategorySlug: service.subCategory?.slug,
    serviceSlug: service.slug,
    selections: input.selections,
  });

  // A draft has no slot or address yet; both are chosen in the checkout sheet.
  // `slot` is non-null in the schema, so seed it with a placeholder the sheet overwrites.
  const booking = await prisma.booking.create({
    data: {
      bookingRef: generateBookingRef(),
      userId: input.userId,
      serviceId: service.id,
      addressId: await defaultAddressId(input.userId),
      slot: new Date().toISOString(),
      status: "DRAFT",
      paymentStatus: "PENDING",
      archetype: service.archetype,
      quotedAmount: estimate.totalPaise,
      baseChargePaise: estimate.basePaise,
      lineItems: JSON.stringify(estimate.lineItems),
      archetypeDetails: JSON.stringify({ fieldValues: input.selections }),
      scheduleType: "scheduled",
    },
    include: cartInclude,
  });

  return { ok: true as const, booking };
}

async function defaultAddressId(userId: string): Promise<string> {
  const address = await prisma.address.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!address) throw new Error("Add a service address before adding to cart");
  return address.id;
}

export async function updateCartItem(
  userId: string,
  bookingId: string,
  patch: { selections?: Selections; slot?: string; addressId?: string },
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId, status: "DRAFT" },
    include: { service: { include: { category: true, subCategory: true } } },
  });
  if (!booking) return { ok: false as const, error: "Cart item not found" };

  const data: Record<string, unknown> = {};
  if (patch.selections) {
    const estimate = priceBooking({
      categorySlug: booking.service.category.slug,
      subCategorySlug: booking.service.subCategory?.slug,
      serviceSlug: booking.service.slug,
      selections: patch.selections,
    });
    data.quotedAmount = estimate.totalPaise;
    data.baseChargePaise = estimate.basePaise;
    data.lineItems = JSON.stringify(estimate.lineItems);
    data.archetypeDetails = JSON.stringify({ fieldValues: patch.selections });
  }
  if (patch.slot) data.slot = patch.slot;
  if (patch.addressId) data.addressId = patch.addressId;

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data,
    include: cartInclude,
  });
  return { ok: true as const, booking: updated };
}

export async function removeCartItem(userId: string, bookingId: string) {
  const result = await prisma.booking.deleteMany({
    where: { id: bookingId, userId, status: "DRAFT" },
  });
  return { ok: result.count > 0 };
}
```

- [ ] **Step 4: Add the API routes**

`app/api/cart/route.ts` — `GET` returns the cart plus its total; `POST` adds an item.
Both require a session (`getServerSession`) and return 401 without one — this is the
login gate. `app/api/cart/[id]/route.ts` — `PATCH` updates, `DELETE` removes.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd web && pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/apps/customer/lib/cart web/apps/customer/app/api/cart
git commit -m "feat: add cart as draft bookings with server-priced items"
```

---

## Task 12: Slot sheet

**Files:**
- Create: `web/apps/customer/components/customer/cart/SlotSheet.tsx`

**Interfaces:**
- Produces: `<SlotSheet items onPick onDone />` where `items` is
  `{ id: string; serviceName: string; categoryName: string; slot: string | null }[]`.

- [ ] **Step 1: Build the sheet**

A service list at the top (each row showing its chosen slot or a "Pick" affordance), a date
strip × time grid for the selected service below, and a footer reading "N of M scheduled"
with Continue disabled until every service has a slot. The date strip offers **7 days only**
— the booking window is a product rule, so the UI must not offer what the API rejects.

- [ ] **Step 2: Verify**

With two services in the cart, confirm each can take a different slot and that Continue
stays disabled until both are set.

- [ ] **Step 3: Commit**

```bash
git add web/apps/customer/components/customer/cart
git commit -m "feat: add per-service slot selection sheet"
```

---

## Task 13: Checkout

**Files:**
- Create: `web/apps/customer/lib/orders/checkout.ts`, `web/apps/customer/lib/orders/checkout.test.ts`
- Create: `web/apps/customer/app/api/orders/route.ts`

**Interfaces:**
- Consumes: `getCart`, `DemoPaymentGateway`, `assertMoneyInvariant`, `rollUpOrderStatus`.
- Produces: `revalidateCart(items)`, `checkout({ userId, method, idempotencyKey })`.

- [ ] **Step 1: Write the failing test for revalidation**

```ts
// web/apps/customer/lib/orders/checkout.test.ts
import { describe, expect, it } from "vitest";
import { revalidateCart } from "./checkout";

const base = {
  id: "b1", serviceName: "AC repair", quotedAmount: 49900,
  recomputedPaise: 49900, slot: new Date(Date.now() + 86_400_000).toISOString(),
  serviceExists: true,
};

describe("revalidateCart", () => {
  it("passes a clean cart", () => {
    expect(revalidateCart([base]).issues).toEqual([]);
  });

  it("flags a price change without dropping the item", () => {
    const r = revalidateCart([{ ...base, recomputedPaise: 59900 }]);
    expect(r.issues[0]).toMatchObject({ id: "b1", kind: "price_changed" });
    expect(r.ok).toBe(false);
  });

  it("flags a slot that has fallen into the past", () => {
    const r = revalidateCart([{ ...base, slot: new Date(Date.now() - 1000).toISOString() }]);
    expect(r.issues[0]).toMatchObject({ kind: "slot_past" });
  });

  it("flags a slot beyond the 7-day window", () => {
    const r = revalidateCart([{ ...base, slot: new Date(Date.now() + 9 * 86_400_000).toISOString() }]);
    expect(r.issues[0]).toMatchObject({ kind: "slot_out_of_window" });
  });

  it("flags a delisted service", () => {
    const r = revalidateCart([{ ...base, serviceExists: false }]);
    expect(r.issues[0]).toMatchObject({ kind: "service_unavailable" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && pnpm test checkout`
Expected: FAIL — cannot resolve `./checkout`.

- [ ] **Step 3: Implement `revalidateCart`**

```ts
// web/apps/customer/lib/orders/checkout.ts
export type CartCheckItem = {
  id: string;
  serviceName: string;
  quotedAmount: number;
  recomputedPaise: number;
  slot: string;
  serviceExists: boolean;
};

export type CartIssueKind =
  | "price_changed" | "slot_past" | "slot_out_of_window" | "service_unavailable";

export type CartIssue = {
  id: string; serviceName: string; kind: CartIssueKind;
  fromPaise?: number; toPaise?: number;
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Re-check every draft booking at checkout. Issues are reported, never silently
 * fixed — the customer must see a price change before we authorize their card.
 */
export function revalidateCart(items: CartCheckItem[]): { ok: boolean; issues: CartIssue[] } {
  const issues: CartIssue[] = [];
  const now = Date.now();

  for (const item of items) {
    const base = { id: item.id, serviceName: item.serviceName };
    if (!item.serviceExists) {
      issues.push({ ...base, kind: "service_unavailable" });
      continue;
    }
    if (item.recomputedPaise !== item.quotedAmount) {
      issues.push({
        ...base, kind: "price_changed",
        fromPaise: item.quotedAmount, toPaise: item.recomputedPaise,
      });
    }
    const slotMs = new Date(item.slot).getTime();
    if (slotMs < now) issues.push({ ...base, kind: "slot_past" });
    else if (slotMs > now + WINDOW_MS) issues.push({ ...base, kind: "slot_out_of_window" });
  }

  return { ok: issues.length === 0, issues };
}
```

- [ ] **Step 4: Implement `checkout`**

In the same file, add the transactional checkout: load the cart, revalidate, reuse-or-create
the `Order` by `idempotencyKey`, call `gateway.authorize(total)`, and on success flip every
draft booking to `AUTHORIZED` with `orderId` set — all inside `prisma.$transaction`. On
decline leave the order `PENDING_PAYMENT` and the bookings `DRAFT`. After the transaction
commits, fan out `dispatchBookingOffers(booking.id)` per booking.

- [ ] **Step 5: Add `POST /api/orders`**

Requires a session; reads `{ method, idempotencyKey }`; returns `{ orderRef, issues }`.
Returns `409` with the issue list when revalidation fails.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd web && pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/apps/customer/lib/orders web/apps/customer/app/api/orders
git commit -m "feat: add checkout with cart revalidation and idempotent authorization"
```

---

## Task 14: Capture on accept

**Files:**
- Modify: `web/packages/db/src/fulfillment.ts`

- [ ] **Step 1: Capture inside the accept transaction**

In `acceptJobOffer`, add to the existing `prisma.$transaction([...])` array a booking update
setting `capturedPaise` and `paymentStatus: "PAID"`, and an `Order` update incrementing
`capturedPaise`. Because it joins the existing first-to-accept transaction, the concurrent-accept
race (edge case 11) is already covered.

- [ ] **Step 2: Void on exhaustion**

In `markNoWorkerFound` (`push-dispatch.ts`), increment the order's `voidedPaise` by the
booking's `quotedAmount` and recompute the order status with `rollUpOrderStatus`.

- [ ] **Step 3: Verify**

Run: `cd web && pnpm test && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add web/packages/db/src/fulfillment.ts web/apps/customer/lib/fulfillment/push-dispatch.ts
git commit -m "feat: capture on accept and void on pool exhaustion"
```

---

## Task 15: Cart and checkout pages

**Files:**
- Create: `web/apps/customer/app/(customer)/cart/page.tsx`, `web/apps/customer/app/(customer)/checkout/page.tsx`

- [ ] **Step 1: Cart page**

Lists cart items (service, chosen requirements from `lineItems`, price), supports edit and
remove, shows the total, and routes to checkout.

- [ ] **Step 2: Checkout page**

Renders `SlotSheet` → review (per-service line items + order total) → pay. Surfaces
revalidation issues inline with an "Update and continue" action.

- [ ] **Step 3: Verify end to end**

Add two services from different categories, give each its own slot, check out, and confirm
two independent dispatches under one order.

- [ ] **Step 4: Commit**

```bash
git add web/apps/customer/app/\(customer\)/cart web/apps/customer/app/\(customer\)/checkout
git commit -m "feat: add cart and checkout pages"
```

---

## Task 16: Live provider location

**Files:**
- Create: `web/apps/customer/app/api/partner/jobs/[id]/location/route.ts`
- Modify: `web/apps/customer/app/api/bookings/[ref]/status/route.ts`

- [ ] **Step 1: Accept location pings**

`POST` with `{ lat, lng, etaMinutes }`, authenticated as the assigned partner, writing
`providerLat`, `providerLng`, `providerLocatedAt`, `etaMinutes`. Reject when the caller is
not the assigned partner or the booking is not in an active state.

- [ ] **Step 2: Return it from the status poll**

Add the four fields to the existing status response so the tracker can render a marker and
ETA without a second request. Treat a `providerLocatedAt` older than 2 minutes as stale and
omit the coordinates.

- [ ] **Step 3: Commit**

```bash
git add web/apps/customer/app/api
git commit -m "feat: accept provider location pings and expose them on the status poll"
```

---

## Task 17: Unified tracker

**Files:**
- Create: `web/apps/customer/components/customer/booking/JobTracker.tsx`, `web/apps/customer/components/customer/booking/OrderTracker.tsx`
- Delete: `BeauticianTracker.tsx`, `ElectricianTracker.tsx`, `ConstructionTracker.tsx`, `CrewBookingTracker.tsx`

- [ ] **Step 1: Build `JobTracker`**

One config-driven tracker: status timeline, provider card, ETA, live coordinates when fresh.
It replaces the four themed trackers, which differ only in copy and icon.

- [ ] **Step 2: Build `OrderTracker`**

Lists every job in an order, each linking to its own `JobTracker`.

- [ ] **Step 3: Delete the themed trackers and fix imports**

Run: `cd web && pnpm typecheck` until clean.

- [ ] **Step 4: Commit**

```bash
git add -A web/apps/customer/components/customer/booking
git commit -m "refactor: replace four themed trackers with a unified job tracker"
```

---

## Task 18: Edge-case hardening and cleanup

**Files:**
- Modify: `web/apps/customer/lib/bookings/queries.ts` (cancel → void)
- Delete: `ConstructionBookingFlow.tsx`, `PaymentSheet.tsx`, `app/api/bookings/[ref]/pay/route.ts`

- [ ] **Step 1: Cancellation voids the right amount**

Before assignment, void the booking's full share. After the provider is en route, capture
`VISIT_FEE_PAISE` and void the remainder. Recompute the order's status afterwards.

- [ ] **Step 2: Delete dead code**

Remove the construction flow, the pay sheet, and the legacy pay route now that money moves
at checkout. Run `pnpm typecheck` until clean.

- [ ] **Step 3: Full verification**

Run: `cd web && pnpm test && pnpm typecheck && pnpm build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A web
git commit -m "feat: harden booking cancellation and remove pay-after-accept flow"
```

---

## Self-Review Notes

**Spec coverage:** §3.1 Order/cart → Tasks 5, 11, 13. §3.2 status enum → Task 5.
§3.3 capture on accept → Task 14. §3.4 gateway strategy → Task 3. §3.5 pricing → Tasks 2, 7, 8, 9.
§4 data model → Task 5. §5 configurator → Tasks 2, 7, 9. §6 migration → Task 5.
§7 DRAFT containment → Task 6. §8 checkout + slot sheet → Tasks 12, 13, 15.
§9 edge cases → Tasks 13 (7, 8, 9), 14 (1, 2, 11), 18 (3, 4, 5). §10 sequencing → task order.
§12 testing → Tasks 1–4, 6–8, 11, 13.

**Known gap accepted:** edge case 6 (revised quote exceeding authorization) reuses the
existing `approveRevisedQuote` path and is not given incremental authorization in this plan;
the delta is collected on completion. Revisit when the real gateway lands.
