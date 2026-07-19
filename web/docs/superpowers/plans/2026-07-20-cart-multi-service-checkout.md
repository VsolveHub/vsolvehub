# Cart + Multi-Service Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer add several archetype-A services (Technician/Beauty/Home/Pet) to a cart, each with its own slot and address, and check out with one payment that auto-assigns a provider to each independently.

**Architecture:** A cart item is a `DRAFT` booking (the existing "cart" state). Add-to-cart creates a priced DRAFT; checkout authorizes one `Order` across all DRAFT ids (existing `authorizeOrder`) then runs `assignBestPartner` per item, voiding any item with no provider via `failBookingNoProviders`. No money-model changes — only the cart UI/API around it.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Prisma/Postgres, Zod, Vitest. Shared engine in `@vsolve/db`.

## Global Constraints

- Money is never trusted from the client: prices are recomputed server-side via `priceBooking` (copied from `POST /api/bookings`). — verbatim rule from the codebase.
- Every cart API route requires `getServerSession()` and scopes every Prisma query by `session.id`.
- Only archetype-A services (`usesPushDispatch(service.archetype)`) may be carted. Crew/vehicle/accommodation are excluded.
- Cart items are `status: "DRAFT"`, `paymentStatus: "PENDING"`, no `orderId`, no assignment until checkout.
- Follow existing patterns: query keys in `lib/query/keys.ts`, api wrappers in `lib/query/api.ts`, routes return `NextResponse.json`, pure logic is unit-tested with dependency injection (see `lib/fulfillment/assign.ts` / `assign.test.ts`).
- Test commands: `pnpm test` (vitest), `pnpm --filter @vsolve/db exec tsc --noEmit` and `pnpm typecheck`.

---

### Task 1: Cart types + pure summary helpers

**Files:**
- Create: `apps/customer/lib/cart/types.ts`
- Create: `apps/customer/lib/cart/summary.ts`
- Test: `apps/customer/lib/cart/summary.test.ts`

**Interfaces:**
- Produces:
  - `type CartItem` (fields below)
  - `type CheckoutItemOutcome = { bookingRef: string; serviceName: string; outcome: "assigned" | "no_provider"; partnerName?: string; refunded?: boolean }`
  - `type CheckoutResult = { ok: true; orderRef: string; items: CheckoutItemOutcome[] } | { ok: false; error: string }`
  - `type AssignItemResult = { bookingRef: string; serviceName: string; assigned: boolean; partnerName?: string; refunded?: boolean }`
  - `cartTotalPaise(items: { quotedAmount: number }[]): number`
  - `summarizeCheckout(results: AssignItemResult[]): CheckoutItemOutcome[]`

- [ ] **Step 1: Write the failing test**

`apps/customer/lib/cart/summary.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cartTotalPaise, summarizeCheckout } from "./summary";

describe("cartTotalPaise", () => {
  it("sums quoted amounts", () => {
    expect(cartTotalPaise([{ quotedAmount: 49900 }, { quotedAmount: 12000 }])).toBe(61900);
  });
  it("is zero for an empty cart", () => {
    expect(cartTotalPaise([])).toBe(0);
  });
});

describe("summarizeCheckout", () => {
  it("maps an assigned item to an assigned outcome with the partner name", () => {
    expect(
      summarizeCheckout([{ bookingRef: "VSH-1", serviceName: "Deep Clean", assigned: true, partnerName: "Asha" }]),
    ).toEqual([{ bookingRef: "VSH-1", serviceName: "Deep Clean", outcome: "assigned", partnerName: "Asha" }]);
  });
  it("maps a failed item to a no_provider outcome carrying the refunded flag", () => {
    expect(
      summarizeCheckout([{ bookingRef: "VSH-2", serviceName: "Wiring", assigned: false, refunded: true }]),
    ).toEqual([{ bookingRef: "VSH-2", serviceName: "Wiring", outcome: "no_provider", refunded: true }]);
  });
  it("defaults refunded to false when a failed item did not refund", () => {
    expect(summarizeCheckout([{ bookingRef: "VSH-3", serviceName: "X", assigned: false }])[0]).toEqual({
      bookingRef: "VSH-3",
      serviceName: "X",
      outcome: "no_provider",
      refunded: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- summary`
Expected: FAIL — cannot resolve `./summary`.

- [ ] **Step 3: Write the types file**

`apps/customer/lib/cart/types.ts`:
```ts
export type CartLineItem = {
  key: string;
  label: string;
  value: string;
  qty: number;
  totalPaise: number;
};

export type CartItem = {
  id: string;
  bookingRef: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  categorySlug: string;
  slot: string;
  scheduleType: string;
  addressId: string;
  addressLabel: string;
  addressFull: string;
  quotedAmount: number;
  lineItems: CartLineItem[];
};

export type CheckoutItemOutcome = {
  bookingRef: string;
  serviceName: string;
  outcome: "assigned" | "no_provider";
  partnerName?: string;
  refunded?: boolean;
};

export type CheckoutResult =
  | { ok: true; orderRef: string; items: CheckoutItemOutcome[] }
  | { ok: false; error: string };
```

- [ ] **Step 4: Write the summary helpers**

`apps/customer/lib/cart/summary.ts`:
```ts
import type { CheckoutItemOutcome } from "./types";

export type AssignItemResult = {
  bookingRef: string;
  serviceName: string;
  assigned: boolean;
  partnerName?: string;
  refunded?: boolean;
};

export function cartTotalPaise(items: { quotedAmount: number }[]): number {
  return items.reduce((sum, i) => sum + i.quotedAmount, 0);
}

export function summarizeCheckout(results: AssignItemResult[]): CheckoutItemOutcome[] {
  return results.map((r) =>
    r.assigned
      ? { bookingRef: r.bookingRef, serviceName: r.serviceName, outcome: "assigned", partnerName: r.partnerName }
      : { bookingRef: r.bookingRef, serviceName: r.serviceName, outcome: "no_provider", refunded: r.refunded ?? false },
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- summary`
Expected: PASS (6 assertions).

- [ ] **Step 6: Commit**

```bash
git add apps/customer/lib/cart/
git commit -m "feat(cart): types and pure summary helpers"
```

---

### Task 2: Checkout orchestrator

**Files:**
- Create: `apps/customer/lib/cart/checkout.ts`
- Test: `apps/customer/lib/cart/checkout.test.ts`

**Interfaces:**
- Consumes: `cartTotalPaise`, `summarizeCheckout`, `AssignItemResult` (Task 1); `authorizeOrder` (`@/lib/orders/authorize`), `assignBestPartner` + `failBookingNoProviders` (`@/lib/fulfillment/assign`), `PaymentMethod` (`@vsolve/db`).
- Produces:
  - `type CheckoutDeps` (injected dependencies)
  - `checkoutCart(userId: string, method: PaymentMethod, deps?: CheckoutDeps): Promise<CheckoutResult>`

- [ ] **Step 1: Write the failing test**

`apps/customer/lib/cart/checkout.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { checkoutCart, type CheckoutDeps } from "./checkout";

const draft = (id: string, ref: string, amount: number, name: string) => ({
  id,
  bookingRef: ref,
  quotedAmount: amount,
  serviceName: name,
});

function deps(over: Partial<CheckoutDeps>): CheckoutDeps {
  return {
    loadDrafts: async () => [draft("b1", "VSH-1", 50000, "Deep Clean")],
    authorize: async () => ({ ok: true, orderRef: "VSO-1", orderId: "o1", codPending: false }),
    assign: async () => ({ ok: true, partner: { name: "Asha" } }),
    fail: async () => ({ refunded: true }),
    ...over,
  };
}

describe("checkoutCart", () => {
  it("rejects an empty cart without authorizing", async () => {
    const authorize = vi.fn();
    const res = await checkoutCart("u1", "upi", deps({ loadDrafts: async () => [], authorize }));
    expect(res).toEqual({ ok: false, error: "Your cart is empty" });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("authorizes the summed total once and assigns every item", async () => {
    const authorize = vi.fn(async () => ({ ok: true as const, orderRef: "VSO-9", orderId: "o", codPending: false }));
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({
        loadDrafts: async () => [draft("b1", "VSH-1", 50000, "Deep Clean"), draft("b2", "VSH-2", 12000, "Wiring")],
        authorize,
      }),
    );
    expect(authorize).toHaveBeenCalledOnce();
    expect(authorize.mock.calls[0][0]).toMatchObject({ amountPaise: 62000, bookingIds: ["b1", "b2"] });
    expect(res).toEqual({
      ok: true,
      orderRef: "VSO-9",
      items: [
        { bookingRef: "VSH-1", serviceName: "Deep Clean", outcome: "assigned", partnerName: "Asha" },
        { bookingRef: "VSH-2", serviceName: "Wiring", outcome: "assigned", partnerName: "Asha" },
      ],
    });
  });

  it("voids an item with no provider and still books the rest", async () => {
    const fail = vi.fn(async () => ({ refunded: true }));
    const assign = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, partner: { name: "Asha" } })
      .mockResolvedValueOnce({ ok: false });
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({
        loadDrafts: async () => [draft("b1", "VSH-1", 50000, "Deep Clean"), draft("b2", "VSH-2", 12000, "Wiring")],
        assign,
        fail,
      }),
    );
    expect(fail).toHaveBeenCalledWith("b2");
    if (!res.ok) throw new Error("expected ok");
    expect(res.items[1]).toEqual({ bookingRef: "VSH-2", serviceName: "Wiring", outcome: "no_provider", refunded: true });
  });

  it("returns the auth error and assigns nothing when authorization fails", async () => {
    const assign = vi.fn();
    const res = await checkoutCart(
      "u1",
      "upi",
      deps({ authorize: async () => ({ ok: false, error: "Card declined" }), assign }),
    );
    expect(res).toEqual({ ok: false, error: "Card declined" });
    expect(assign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- checkout`
Expected: FAIL — cannot resolve `./checkout`.

- [ ] **Step 3: Write the orchestrator**

`apps/customer/lib/cart/checkout.ts`:
```ts
import { prisma } from "@/lib/db/client";
import { authorizeOrder } from "@/lib/orders/authorize";
import { assignBestPartner, failBookingNoProviders } from "@/lib/fulfillment/assign";
import type { PaymentMethod } from "@vsolve/db";
import { cartTotalPaise, summarizeCheckout, type AssignItemResult } from "./summary";
import type { CheckoutResult } from "./types";

type DraftItem = { id: string; bookingRef: string; quotedAmount: number; serviceName: string };

export type CheckoutDeps = {
  loadDrafts: (userId: string) => Promise<DraftItem[]>;
  authorize: typeof authorizeOrder;
  assign: (bookingId: string) => Promise<{ ok: boolean; partner?: { name: string } }>;
  fail: (bookingId: string) => Promise<{ refunded: boolean }>;
};

const defaultDeps: CheckoutDeps = {
  loadDrafts: async (userId) => {
    const rows = await prisma.booking.findMany({
      where: { userId, status: "DRAFT" },
      orderBy: { createdAt: "asc" },
      select: { id: true, bookingRef: true, quotedAmount: true, service: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      bookingRef: r.bookingRef,
      quotedAmount: r.quotedAmount,
      serviceName: r.service.name,
    }));
  },
  authorize: authorizeOrder,
  assign: async (bookingId) => {
    const res = await assignBestPartner(bookingId);
    return res.ok ? { ok: true, partner: res.partner } : { ok: false };
  },
  fail: failBookingNoProviders,
};

/**
 * Turn the user's DRAFT cart into booked jobs: authorize ONE order across all
 * items, then auto-assign each independently. An item with no available provider
 * is voided/refunded (its share) while the rest still book. Money moves through
 * the existing Order ledger — this only orchestrates it.
 */
export async function checkoutCart(
  userId: string,
  method: PaymentMethod,
  deps: CheckoutDeps = defaultDeps,
): Promise<CheckoutResult> {
  const drafts = await deps.loadDrafts(userId);
  if (drafts.length === 0) return { ok: false, error: "Your cart is empty" };

  const ids = drafts.map((d) => d.id);
  const authorized = await deps.authorize({
    userId,
    bookingIds: ids,
    amountPaise: cartTotalPaise(drafts),
    method,
    // Stable across a retried checkout of the same cart, so a double-submit reuses
    // the same order instead of authorizing twice.
    idempotencyKey: `cart:${userId}:${[...ids].sort().join(",")}`,
  });
  if (!authorized.ok) return { ok: false, error: authorized.error };

  const results: AssignItemResult[] = [];
  for (const d of drafts) {
    const a = await deps.assign(d.id);
    if (a.ok) {
      results.push({ bookingRef: d.bookingRef, serviceName: d.serviceName, assigned: true, partnerName: a.partner?.name });
    } else {
      const { refunded } = await deps.fail(d.id);
      results.push({ bookingRef: d.bookingRef, serviceName: d.serviceName, assigned: false, refunded });
    }
  }

  return { ok: true, orderRef: authorized.orderRef, items: summarizeCheckout(results) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- checkout`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/customer/lib/cart/checkout.ts apps/customer/lib/cart/checkout.test.ts
git commit -m "feat(cart): checkout orchestrator over the Order ledger"
```

---

### Task 3: Add-to-cart + list API

**Files:**
- Modify: `apps/customer/lib/validation/schemas.ts` (add `cartAddSchema`)
- Create: `apps/customer/app/api/cart/route.ts`

**Interfaces:**
- Consumes: `getServerSession`, `prisma`, `resolveServiceArchetype` + `usesPushDispatch` (`@/lib/bookings/archetype`), `coerceSelections` + `priceBooking` (`@/lib/catalog/price-service`), `createBooking` (`@/lib/bookings/queries`), `parseMediaUrls` (`@/lib/bookings/queries`).
- Produces: `POST /api/cart` (add) and `GET /api/cart` (list) — response `{ items: CartItem[]; totalPaise: number }` for GET; `{ item: CartItem }` for POST.

- [ ] **Step 1: Add the validation schema**

In `apps/customer/lib/validation/schemas.ts`, after `bookingSchema`, add:
```ts
export const cartAddSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  addressId: z.string().min(1, "Address is required"),
  slot: z.string().datetime({ message: "A valid time slot is required" }),
  scheduleType: z.enum(["instant", "scheduled"]).default("scheduled"),
  selections: z.record(z.any()).optional(),
  archetypeDetails: z.record(z.any()).optional(),
  note: z.string().max(250).optional(),
  mediaUrls: z.array(z.string()).max(5).optional(),
});
```

- [ ] **Step 2: Write the route**

`apps/customer/app/api/cart/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { cartAddSchema } from "@/lib/validation/schemas";
import { resolveServiceArchetype, usesPushDispatch } from "@/lib/bookings/archetype";
import { coerceSelections, priceBooking } from "@/lib/catalog/price-service";
import { createBooking, parseMediaUrls } from "@/lib/bookings/queries";
import type { CartItem } from "@/lib/cart/types";

function toCartItem(b: Awaited<ReturnType<typeof createBooking>>): CartItem {
  return {
    id: b.id,
    bookingRef: b.bookingRef,
    serviceId: b.serviceId,
    serviceName: b.service.name,
    serviceSlug: b.service.slug,
    categorySlug: b.service.category.slug,
    slot: b.slot,
    scheduleType: b.scheduleType,
    addressId: b.addressId,
    addressLabel: b.address.label,
    addressFull: b.address.fullAddress,
    quotedAmount: b.quotedAmount,
    lineItems: JSON.parse(b.lineItems || "[]"),
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = cartAddSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const [service, address] = await Promise.all([
    prisma.service.findUnique({ where: { id: data.serviceId }, include: { category: true, subCategory: true } }),
    prisma.address.findFirst({ where: { id: data.addressId, userId: session.id } }),
  ]);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  if (!address) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  const archetype = resolveServiceArchetype(service.archetype);
  if (!usesPushDispatch(archetype)) {
    return NextResponse.json({ error: "This service can't be added to the cart" }, { status: 400 });
  }
  if (data.scheduleType === "scheduled" && new Date(data.slot).getTime() < Date.now() - 15 * 60 * 1000) {
    return NextResponse.json({ error: "Please choose a future time slot" }, { status: 400 });
  }

  const estimate = priceBooking({
    categorySlug: service.category.slug,
    subCategorySlug: service.subCategory?.slug,
    serviceSlug: service.slug,
    selections: coerceSelections(data.selections ?? (data.archetypeDetails as { fieldValues?: unknown })?.fieldValues),
  });
  const quotedAmount = estimate.totalPaise > 0 ? estimate.totalPaise : service.pricePaise;

  const booking = await createBooking({
    userId: session.id,
    serviceId: data.serviceId,
    addressId: data.addressId,
    slot: data.slot,
    quotedAmount,
    baseChargePaise: estimate.basePaise > 0 ? estimate.basePaise : service.pricePaise,
    lineItems: estimate.lineItems,
    archetype,
    issueDescription: data.note,
    mediaUrls: data.mediaUrls,
    status: "DRAFT",
    paymentStatus: "PENDING",
    paymentMethod: null,
    scheduleType: data.scheduleType,
    vendorAssignmentMode: "auto",
    archetypeDetails: data.archetypeDetails ?? {},
  });

  return NextResponse.json({ item: toCartItem(booking) });
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const rows = await prisma.booking.findMany({
    where: { userId: session.id, status: "DRAFT" },
    orderBy: { createdAt: "asc" },
    include: { service: { include: { category: true } }, address: true },
  });

  const items: CartItem[] = rows.map((b) => ({
    id: b.id,
    bookingRef: b.bookingRef,
    serviceId: b.serviceId,
    serviceName: b.service.name,
    serviceSlug: b.service.slug,
    categorySlug: b.service.category.slug,
    slot: b.slot,
    scheduleType: b.scheduleType,
    addressId: b.addressId,
    addressLabel: b.address.label,
    addressFull: b.address.fullAddress,
    quotedAmount: b.quotedAmount,
    lineItems: parseMediaUrls(b.lineItems) as unknown as CartItem["lineItems"],
  }));

  return NextResponse.json({ items, totalPaise: items.reduce((s, i) => s + i.quotedAmount, 0) });
}
```

Note: `createBooking` already returns `service` (with `category`, `subCategory`) and `address` in its include (see `lib/bookings/queries.ts:createBooking`). `parseMediaUrls` is a safe JSON.parse used here for `lineItems` too (both are JSON string columns).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter customer exec tsc --noEmit`
Expected: no errors. (If `parseMediaUrls` typing on lineItems is awkward, replace with a local `JSON.parse(b.lineItems || "[]")` guarded in try/catch.)

- [ ] **Step 4: Manual verification (dev server running)**

With a logged-in session cookie, `POST /api/cart` with a valid archetype-A `serviceId`, an owned `addressId`, and a future ISO `slot` returns `{ item }` with a `bookingRef`; `GET /api/cart` lists it with a correct `totalPaise`. A non-archetype-A service returns 400. (Route integration tests need a seeded test DB — out of scope; verify via the running dev DB.)

- [ ] **Step 5: Commit**

```bash
git add apps/customer/lib/validation/schemas.ts apps/customer/app/api/cart/route.ts
git commit -m "feat(cart): add-to-cart and list API"
```

---

### Task 4: Cart item update + remove API

**Files:**
- Create: `apps/customer/app/api/cart/[id]/route.ts`

**Interfaces:**
- Consumes: `getServerSession`, `prisma`, `priceBooking` + `coerceSelections`.
- Produces: `PATCH /api/cart/[id]` (update slot/scheduleType/addressId/selections → re-price) and `DELETE /api/cart/[id]`.

- [ ] **Step 1: Write the route**

`apps/customer/app/api/cart/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { coerceSelections, priceBooking } from "@/lib/catalog/price-service";

const patchSchema = z.object({
  slot: z.string().datetime().optional(),
  scheduleType: z.enum(["instant", "scheduled"]).optional(),
  addressId: z.string().min(1).optional(),
  selections: z.record(z.any()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id, userId: session.id, status: "DRAFT" },
    include: { service: { include: { category: true, subCategory: true } } },
  });
  if (!booking) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });

  if (data.addressId) {
    const owns = await prisma.address.findFirst({ where: { id: data.addressId, userId: session.id } });
    if (!owns) return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (data.slot) update.slot = data.slot;
  if (data.scheduleType) update.scheduleType = data.scheduleType;
  if (data.addressId) update.addressId = data.addressId;

  if (data.selections) {
    const estimate = priceBooking({
      categorySlug: booking.service.category.slug,
      subCategorySlug: booking.service.subCategory?.slug,
      serviceSlug: booking.service.slug,
      selections: coerceSelections(data.selections),
    });
    update.quotedAmount = estimate.totalPaise > 0 ? estimate.totalPaise : booking.service.pricePaise;
    update.baseChargePaise = estimate.basePaise > 0 ? estimate.basePaise : booking.service.pricePaise;
    update.finalAmountPaise = update.quotedAmount;
    update.lineItems = JSON.stringify(estimate.lineItems);
  }

  const saved = await prisma.booking.update({ where: { id: booking.id }, data: update });
  return NextResponse.json({ ok: true, quotedAmount: saved.quotedAmount });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  // Scoped to DRAFT + owner, so only a cart entry can ever be deleted here.
  await prisma.booking.deleteMany({ where: { id, userId: session.id, status: "DRAFT" } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter customer exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`PATCH /api/cart/<draftId>` with a new `slot` returns `{ ok: true }`; with `selections` it re-prices `quotedAmount`. `DELETE` removes it (a non-DRAFT booking id is a no-op — not deletable). Confirm `GET /api/cart` reflects both.

- [ ] **Step 4: Commit**

```bash
git add apps/customer/app/api/cart/\[id\]/route.ts
git commit -m "feat(cart): update and remove cart item API"
```

---

### Task 5: Checkout API route

**Files:**
- Create: `apps/customer/app/api/cart/checkout/route.ts`

**Interfaces:**
- Consumes: `getServerSession`, `checkoutCart` (Task 2).
- Produces: `POST /api/cart/checkout` → `CheckoutResult` JSON.

- [ ] **Step 1: Write the route**

`apps/customer/app/api/cart/checkout/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { checkoutCart } from "@/lib/cart/checkout";

const schema = z.object({ paymentMethod: z.enum(["upi", "card", "wallet", "cod"]) });

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });

  const result = await checkoutCart(session.id, parsed.data.paymentMethod);
  if (!result.ok) {
    const status = result.error === "Your cart is empty" ? 409 : 402;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter customer exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With 2 DRAFT items, `POST /api/cart/checkout {paymentMethod:"upi"}` returns `{ ok: true, orderRef, items: [...] }`, each item `outcome: "assigned"` (given seeded active partners) and the DRAFTs are now `ASSIGNED` (gone from `GET /api/cart`). Empty cart → 409.

- [ ] **Step 4: Commit**

```bash
git add apps/customer/app/api/cart/checkout/route.ts
git commit -m "feat(cart): checkout API route"
```

---

### Task 6: Query keys + api wrappers

**Files:**
- Modify: `apps/customer/lib/query/keys.ts`
- Modify: `apps/customer/lib/query/api.ts`

**Interfaces:**
- Produces on `qk`: `cart: () => ["cart"]`.
- Produces on `api`: `cart()`, `addToCart(input)`, `updateCartItem(id, input)`, `removeCartItem(id)`, `checkoutCart(paymentMethod)`.

- [ ] **Step 1: Add the query key**

In `apps/customer/lib/query/keys.ts`, inside the `qk` object after `bookings: () => ["bookings"] as const,` add:
```ts
  cart: () => ["cart"] as const,
```

- [ ] **Step 2: Add the api wrappers**

In `apps/customer/lib/query/api.ts`, first add the import near the top type imports:
```ts
import type { CartItem, CheckoutResult } from "@/lib/cart/types";
```
Then inside the `api` object (next to `createBooking`), add:
```ts
  cart: () => jsonFetch<{ items: CartItem[]; totalPaise: number }>("/api/cart"),
  addToCart: (input: Record<string, unknown>) => jsonPost<{ item: CartItem }>("/api/cart", input),
  updateCartItem: (id: string, input: Record<string, unknown>) =>
    jsonFetch<{ ok: boolean; quotedAmount: number }>(`/api/cart/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  removeCartItem: (id: string) => jsonFetch<{ ok: boolean }>(`/api/cart/${id}`, { method: "DELETE" }),
  checkoutCart: (paymentMethod: PaymentMethod) =>
    jsonPost<CheckoutResult>("/api/cart/checkout", { paymentMethod }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter customer exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/customer/lib/query/keys.ts apps/customer/lib/query/api.ts
git commit -m "feat(cart): query keys and api wrappers"
```

---

### Task 7: ServiceBookingFlow → Add to cart

**Files:**
- Modify: `apps/customer/components/customer/booking/ServiceBookingFlow.tsx`

**Interfaces:**
- Consumes: `api.addToCart`, `qk.cart` (Task 6); `useRouter`.

This task changes the flow's terminal action from paying to adding to cart, and removes the `choose` and `payment` steps (items are auto-assigned; payment happens at the cart).

- [ ] **Step 1: Remove the choose/payment steps from the step type and stepper**

- Change `type Step` (line ~66) to: `type Step = "service" | "guidelines" | "when" | "details";`
- In `back()` (line ~439) change the order array to: `const order: Step[] = ["service", "guidelines", "when", "details"];`
- In `customHeader`, delete the two progress-step blocks for "Pro" (step 5) and "Pay" (step 6) and their preceding dividers (lines ~533-541), and drop `'choose', 'payment'` from the earlier `done` conditionals so only steps 1–4 remain.

- [ ] **Step 2: Replace the details-step footer action with Add to cart**

Add the mutation near `createBooking` (line ~370):
```ts
  const addToCart = useMutation({
    mutationFn: () =>
      api.addToCart({
        serviceId: service!.id,
        addressId,
        slot: buildSlotIso(),
        scheduleType,
        selections: detailValues,
        note: note || undefined,
        mediaUrls: photos,
        archetypeDetails: {
          bookingType: "individual",
          scheduleType,
          fieldValues: detailValues,
          details: toDetailPairs(config.detailFields, detailValues),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.cart() });
      router.push("/cart");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not add to cart"),
  });

  function addCurrentToCart() {
    if (!service) return;
    if (!validateDetails()) return;
    requireLoginThen(() => addToCart.mutate(), buildResumeState({ step: "details", autoSubmit: true }));
  }
```
Change the details-step primary button (line ~927, "Choose your professional ›") to:
```tsx
              <button
                className="w-full p-4 rounded-lg text-base font-bold cursor-pointer transition-opacity bg-brand text-white hover:opacity-90 disabled:opacity-60"
                onClick={addCurrentToCart}
                disabled={addToCart.isPending}
              >
                {addToCart.isPending ? "Adding…" : "Add to cart ›"}
              </button>
```

- [ ] **Step 3: Delete the `choose` and `payment` step JSX blocks**

Remove the entire `{step === "choose" && ...}` block (lines ~938-1011) and the entire `{step === "payment" && ...}` block (lines ~1013-1120). Also remove the now-unused `availabilityQuery`, `professionals`, `createBooking`, `continueToChoose`, `preferredPartnerId`, `fallbackNote` state and their JSX (the fallback screen at lines ~546-570), and the `PAYMENT_METHODS`/`paymentMethod` state — anything the compiler flags as unused after deletion. Keep `noProviders` handling only if still referenced; otherwise remove it too.

- [ ] **Step 4: Repoint the resume/auto-submit path**

Change the `pendingSubmit` effect (line ~427) to add to cart instead of submit:
```ts
  useEffect(() => {
    if (!pendingSubmit || !service || !addressId) return;
    setPendingSubmit(false);
    addToCart.mutate();
  }, [pendingSubmit, service, addressId]);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter customer exec tsc --noEmit`
Expected: no errors (fix any unused-symbol errors by deleting the dead code they point to).

- [ ] **Step 6: Manual verification**

`/booking?serviceId=<archetypeA>` → configure through details → "Add to cart" navigates to `/cart` with the item present. Logged-out users hit OTP then resume and the add completes.

- [ ] **Step 7: Commit**

```bash
git add apps/customer/components/customer/booking/ServiceBookingFlow.tsx
git commit -m "feat(cart): ServiceBookingFlow adds to cart instead of paying"
```

---

### Task 8: Cart page (list, edit, checkout, inline confirmation)

**Files:**
- Create: `apps/customer/app/(customer)/cart/page.tsx`
- Create: `apps/customer/components/customer/cart/CartClient.tsx`
- Create: `apps/customer/components/customer/cart/CartLineItem.tsx`
- Create: `apps/customer/components/customer/cart/CheckoutResultView.tsx`

**Interfaces:**
- Consumes: `api.cart`, `api.removeCartItem`, `api.checkoutCart`, `qk.cart`, `qk.bookings`; `formatPrice`; `CartItem`, `CheckoutItemOutcome` types.

- [ ] **Step 1: Page shell (server component)**

`apps/customer/app/(customer)/cart/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CartClient } from "@/components/customer/cart/CartClient";

export default async function CartPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/cart");
  return <CartClient />;
}
```

- [ ] **Step 2: Line item component**

`apps/customer/components/customer/cart/CartLineItem.tsx`:
```tsx
"use client";

import { formatPrice } from "@/lib/format";
import type { CartItem } from "@/lib/cart/types";

export function CartLineItem({ item, onRemove, removing }: { item: CartItem; onRemove: () => void; removing: boolean }) {
  const when =
    item.scheduleType === "instant"
      ? "Within the next hour"
      : new Date(item.slot).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900">{item.serviceName}</p>
        <p className="mt-0.5 text-xs text-gray-500">{when}</p>
        <p className="truncate text-xs text-gray-500">{item.addressLabel} · {item.addressFull}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="text-sm font-extrabold text-gray-900">{formatPrice(item.quotedAmount)}</span>
        <button type="button" onClick={onRemove} disabled={removing} className="text-xs font-semibold text-red-600 disabled:opacity-50">
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Checkout result view**

`apps/customer/components/customer/cart/CheckoutResultView.tsx`:
```tsx
"use client";

import Link from "next/link";
import type { CheckoutItemOutcome } from "@/lib/cart/types";

export function CheckoutResultView({ orderRef, items }: { orderRef: string; items: CheckoutItemOutcome[] }) {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-xl font-black text-gray-900">Order placed</h1>
      <p className="mt-1 text-sm text-gray-500">Order {orderRef}</p>
      <div className="mt-6 flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.bookingRef} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-bold text-gray-900">{it.serviceName}</p>
            {it.outcome === "assigned" ? (
              <p className="mt-0.5 text-xs font-semibold text-green-700">Assigned to {it.partnerName ?? "a professional"}</p>
            ) : (
              <p className="mt-0.5 text-xs font-semibold text-amber-700">
                No provider available{it.refunded ? " — refunded" : ""}
              </p>
            )}
            {it.outcome === "assigned" && (
              <Link href={`/booking/track/${it.bookingRef}`} className="mt-2 inline-block text-xs font-bold text-brand">
                Track booking ›
              </Link>
            )}
          </div>
        ))}
      </div>
      <Link href="/services" className="mt-8 block w-full rounded-xl bg-brand py-3.5 text-center text-sm font-bold text-white">
        Back to services
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Cart client (list + payment + checkout)**

`apps/customer/components/customer/cart/CartClient.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { LoadingState } from "@/components/ui/LoadingState";
import { CartLineItem } from "./CartLineItem";
import { CheckoutResultView } from "./CheckoutResultView";
import type { CheckoutResult, CheckoutItemOutcome } from "@/lib/cart/types";

const METHODS = [
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "cod", label: "Pay after service" },
] as const;
type MethodId = (typeof METHODS)[number]["id"];

export function CartClient() {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<MethodId>("upi");
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<{ orderRef: string; items: CheckoutItemOutcome[] } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: qk.cart(), queryFn: api.cart });
  const items = data?.items ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => api.removeCartItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.cart() }),
  });

  const checkout = useMutation({
    mutationFn: () => api.checkoutCart(method),
    onSuccess: (res: CheckoutResult) => {
      if (res.ok) {
        setPlaced({ orderRef: res.orderRef, items: res.items });
        queryClient.invalidateQueries({ queryKey: qk.cart() });
        queryClient.invalidateQueries({ queryKey: qk.bookings() });
      } else {
        setError(res.error);
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Checkout failed"),
  });

  if (placed) return <CheckoutResultView orderRef={placed.orderRef} items={placed.items} />;
  if (isLoading) return <LoadingState label="Loading your cart…" variant="inline" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 text-center">
        <h1 className="text-lg font-black text-gray-900">Your cart is empty</h1>
        <p className="mt-1 text-sm text-gray-500">Add a service to get started.</p>
        <Link href="/services" className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white">
          Browse services
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6">
      <h1 className="mb-4 text-xl font-black text-gray-900">Your cart</h1>
      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}

      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <CartLineItem key={it.id} item={it} onRemove={() => remove.mutate(it.id)} removing={remove.isPending && remove.variables === it.id} />
        ))}
      </div>

      <p className="mt-6 mb-2 text-[0.8rem] font-bold uppercase tracking-wide text-gray-600">Payment method</p>
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMethod(m.id)}
            className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${method === m.id ? "border-brand bg-blue-50 text-brand" : "border-gray-200 text-gray-600"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-sm font-bold text-gray-900">Total</span>
        <span className="text-lg font-extrabold text-gray-900">{formatPrice(data?.totalPaise ?? 0)}</span>
      </div>

      <button
        type="button"
        onClick={() => { setError(""); checkout.mutate(); }}
        disabled={checkout.isPending}
        className="mt-4 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {checkout.isPending ? "Placing order…" : `${method === "cod" ? "Confirm booking" : "Pay"} • ${formatPrice(data?.totalPaise ?? 0)}`}
      </button>
    </div>
  );
}
```

Note: verify `LoadingState` import path matches its use in `ServiceBookingFlow`/`BookingTracker` (`@/components/ui/LoadingState`). `remove.variables` is TanStack Query v5's in-flight variable — used to show the spinner only on the row being removed.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter customer exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

`/cart` lists items with total; Remove drops a row and updates the total; selecting a method and pressing Pay shows the inline confirmation with per-item outcomes and track links; empty cart shows the empty state.

- [ ] **Step 7: Commit**

```bash
git add apps/customer/app/\(customer\)/cart/ apps/customer/components/customer/cart/
git commit -m "feat(cart): cart page with checkout and inline confirmation"
```

---

### Task 9: Cart badge in the header

**Files:**
- Create: `apps/customer/components/shared/CartBadge.tsx`
- Modify: `apps/customer/components/shared/Header.tsx`

**Interfaces:**
- Consumes: `api.cart`, `qk.cart`.

- [ ] **Step 1: Write the badge (client component)**

`apps/customer/components/shared/CartBadge.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";

export function CartBadge() {
  const { data } = useQuery({ queryKey: qk.cart(), queryFn: api.cart, staleTime: 30_000 });
  const count = data?.items.length ?? 0;
  return (
    <Link href="/cart" className="nav-link" aria-label={`Cart (${count})`}>
      Cart{count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
```

- [ ] **Step 2: Mount it in the header**

In `apps/customer/components/shared/Header.tsx`, add the import and place `<CartBadge />` in the `nav-links` between Services and Profile:
```tsx
import Link from "next/link";
import { CartBadge } from "./CartBadge";

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="logo">
          VSolveHub
        </Link>
        <nav className="nav-links">
          <Link href="/services" className="nav-link">
            Services
          </Link>
          <CartBadge />
          <Link href="/profile" className="nav-link">
            Profile
          </Link>
        </nav>
      </div>
    </header>
  );
}
```
Note: `Header` is a server component; embedding the `CartBadge` client component is allowed. Confirm a `QueryClientProvider` wraps the tree that renders `Header` (it must, since other pages use `useQuery`). If `Header` renders outside the provider, instead render `CartBadge` only where the provider exists, or leave the badge static.

- [ ] **Step 3: Typecheck + tests + lint**

Run: `pnpm --filter customer exec tsc --noEmit && pnpm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 4: Manual verification**

Header shows "Cart (N)" reflecting DRAFT count; adding/removing updates it; clicking navigates to `/cart`.

- [ ] **Step 5: Commit**

```bash
git add apps/customer/components/shared/CartBadge.tsx apps/customer/components/shared/Header.tsx
git commit -m "feat(cart): cart count badge in header"
```

---

## Self-Review Notes

- **Spec coverage:** add (`Task 3`), list (`Task 3`), update/remove (`Task 4`), checkout orchestration + per-item void (`Task 2` + `Task 5`), flow → add-to-cart (`Task 7`), cart page + inline confirmation (`Task 8`), badge (`Task 9`), types/helpers/tests (`Task 1`/`Task 2`). Server-priced, auth-scoped, archetype-A-only constraints enforced in `Task 3`/`Task 4`.
- **Deferred from spec (correctly out of scope):** maps, live tracking, rapido, guest cart, per-item pro picking.
- **Type consistency:** `CartItem`, `CheckoutResult`, `CheckoutItemOutcome`, `AssignItemResult` defined in Task 1 and consumed unchanged in Tasks 2/3/6/8. `checkoutCart(userId, method, deps?)` signature consistent across Tasks 2 and 5. `api.addToCart/cart/updateCartItem/removeCartItem/checkoutCart` defined in Task 6 and used in Tasks 7/8/9.
- **Known integration caveat:** route-level integration tests need a seeded test DB, which this repo does not have; API tasks use typecheck + manual verification against the dev DB. The money-critical logic (`checkoutCart`) and pure helpers are fully unit-tested via dependency injection.
