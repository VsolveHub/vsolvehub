// ─────────────────────────────────────────────────────────────────────────────
// Single-provider fulfillment engine — the ONE source of truth shared by the
// customer app (dispatch + tracking) and the partner app (accept + work loop).
//
// Lifecycle (archetype A, on-demand fixed-price):
//   REQUESTED/PENDING → SEARCHING_PROVIDER → ASSIGNED → PROVIDER_ARRIVING
//     → STARTED (customer OTP) → COMPLETED
//   ( + CANCELLED, NO_WORKER_FOUND as terminal/branch states )
//
// Status is driven by real actor actions and persisted to BookingStatusLog —
// never by a time-based simulation.
// ─────────────────────────────────────────────────────────────────────────────

import type { JobStatus } from "@prisma/client";
import { prisma } from "./client";
import { isDispatchable } from "./booking-scope";
import { recomputeOrderStatus } from "./orders";

/** Ordered happy-path timeline a single-provider booking moves through. */
export const SINGLE_PROVIDER_TIMELINE = [
  "PENDING",
  "SEARCHING_PROVIDER",
  "ASSIGNED",
  "PROVIDER_ARRIVING",
  "STARTED",
  "COMPLETED",
] as const;

// JobStatus itself now comes from the Prisma enum (see schema.prisma) so the
// database and the engine cannot drift apart. Re-exported from the package root
// via `export * from "@prisma/client"`.


/** Transitions a PARTNER is allowed to drive once they hold the job. */
const PARTNER_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ["PROVIDER_ARRIVING"],
  PROVIDER_ARRIVING: ["STARTED"],
  STARTED: ["COMPLETED"],
};

/** Platform commission on a completed single-provider job (partner keeps the rest). */
export const PLATFORM_COMMISSION_RATE = 0.15;

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export type EngineResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * True for a Prisma unique-constraint violation (P2002). Duck-typed rather than
 * `instanceof PrismaClientKnownRequestError` so it stays pure and unit-testable
 * without constructing a real Prisma error — the `code` field is the contract.
 */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e &&
    (e as { code?: unknown }).code === "P2002";
}

// ─── Direct assignment (Urban-Company-style) ─────────────────────────────────
// The system picks the best available professional and puts the job on their
// schedule — no offer, no accept prompt. Concurrency is refereed by the partial
// unique index `Booking_partner_slot_active`: two checkouts racing for the same
// partner+slot collide, and the loser sees SLOT_TAKEN so the caller can try the
// next ranked candidate.

/**
 * Bind a specific partner to a booking, capture this job's prepaid share, and
 * generate the customer's start OTP — all in one transaction. Returns
 * `SLOT_TAKEN` (not a throw) when the unique index rejects the write, so
 * `assignBestPartner` can fall through to the next candidate.
 */
export async function assignPartnerDirect(
  bookingId: string,
  partnerId: string,
): Promise<EngineResult<{ startOtp: string }>> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };
  if (booking.assignedPartnerId) return { ok: false, error: "Already assigned" };
  if (!isDispatchable(booking.status)) return { ok: false, error: "Not assignable" };

  const startOtp = genOtp();
  // Capture only a card hold awaiting capture. A card authorizes to "PENDING"
  // and is captured here on assignment; immediate methods (UPI/wallet) are
  // already captured at authorize ("PAID") and COD captures nothing — so
  // "PENDING" is the one state that still owes a capture. Guarding on status
  // (not capturedPaise) avoids double-counting the order ledger for immediate
  // methods, which would otherwise trip assertMoneyInvariant on the default path.
  const capturePaise = booking.paymentStatus === "PENDING" ? booking.quotedAmount : 0;
  const now = new Date();

  try {
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          assignedPartnerId: partnerId,
          status: "ASSIGNED",
          startOtp,
          ...(capturePaise > 0 ? { capturedPaise: capturePaise, paymentStatus: "PAID" } : {}),
        },
      }),
      prisma.bookingStatusLog.create({ data: { bookingId, status: "ASSIGNED" } }),
      // Audit trail: a pre-accepted assignment row, so partner history/earnings
      // queries and admin views keep one consistent shape across both models.
      prisma.jobAssignment.create({
        data: { bookingId, partnerId, status: "ACCEPTED", offeredAt: now, respondedAt: now, expiresAt: now },
      }),
      ...(booking.orderId && capturePaise > 0
        ? [
            prisma.order.update({
              where: { id: booking.orderId },
              data: { capturedPaise: { increment: capturePaise } },
            }),
          ]
        : []),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "SLOT_TAKEN" };
    throw e;
  }

  if (booking.orderId) await recomputeOrderStatus(booking.orderId);
  return { ok: true, startOtp };
}

/**
 * Partner's "Can't make it": free the slot so the job can be reassigned. Clears
 * the assignment and start OTP, reverts the booking to SEARCHING_PROVIDER, and
 * marks the audit row DECLINED. Reassignment (which needs the matcher) is the
 * caller's job. Money is untouched: the captured amount rides along to the next
 * professional and is refunded only if reassignment exhausts (Task 5 path).
 */
export async function releasePartnerAssignment(
  bookingId: string,
  partnerId: string,
  reason?: string,
): Promise<EngineResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, assignedPartnerId: partnerId },
  });
  if (!booking) return { ok: false, error: "Job not found" };
  if (!(ACTIVE_JOB_STATUSES as readonly string[]).includes(booking.status)) {
    return { ok: false, error: `Cannot release from ${booking.status}` };
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignedPartnerId: null,
        startOtp: null,
        status: "SEARCHING_PROVIDER",
        cancelReason: reason ?? booking.cancelReason,
      },
    }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: "SEARCHING_PROVIDER" } }),
    prisma.jobAssignment.updateMany({
      where: { bookingId, partnerId, status: "ACCEPTED" },
      data: { status: "DECLINED", respondedAt: new Date() },
    }),
  ]);

  return { ok: true };
}

// ─── Offer accept / decline ──────────────────────────────────────────────────

/**
 * Partner accepts a pending job offer. First-to-accept wins; all sibling offers
 * are expired, the booking is bound to the partner, and a customer-facing start
 * OTP is generated. Idempotent against double-accept / already-taken races.
 */
export async function acceptJobOffer(
  assignmentId: string,
  partnerId: string,
): Promise<EngineResult<{ bookingId: string; bookingRef: string; startOtp: string }>> {
  const assignment = await prisma.jobAssignment.findFirst({
    where: { id: assignmentId, partnerId, status: "PENDING" },
    include: { booking: true },
  });
  if (!assignment) return { ok: false, error: "Offer not found or already handled" };

  if (assignment.expiresAt < new Date()) {
    await prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    return { ok: false, error: "Offer expired" };
  }

  if (assignment.booking.assignedPartnerId) {
    await prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    return { ok: false, error: "Job already taken" };
  }

  // Defensive: a draft (unpaid, still in someone's cart) or already-terminal
  // booking must never be acceptable. Reaching here means an offer outlived its
  // booking, so refuse rather than bind a partner to unfunded work.
  if (!isDispatchable(assignment.booking.status)) {
    await prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    return { ok: false, error: "This job is no longer available" };
  }

  const now = new Date();
  const startOtp = genOtp();
  const booking = assignment.booking;

  // Capture this job's share of the order's authorization. Joining the existing
  // first-to-accept transaction means the concurrent-accept race is already
  // handled: only the winning accept can capture.
  const alreadyCaptured = booking.capturedPaise > 0;
  const capturePaise = alreadyCaptured ? 0 : booking.quotedAmount;
  const isPrepaid = booking.paymentStatus !== "COD";

  await prisma.$transaction([
    prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "ACCEPTED", respondedAt: now },
    }),
    prisma.jobAssignment.updateMany({
      where: { bookingId: assignment.bookingId, id: { not: assignmentId }, status: "PENDING" },
      data: { status: "EXPIRED", respondedAt: now },
    }),
    prisma.booking.update({
      where: { id: assignment.bookingId },
      data: {
        assignedPartnerId: partnerId,
        status: "ASSIGNED",
        startOtp,
        ...(isPrepaid && capturePaise > 0
          ? { capturedPaise: capturePaise, paymentStatus: "PAID" }
          : {}),
      },
    }),
    prisma.bookingStatusLog.create({
      data: { bookingId: assignment.bookingId, status: "ASSIGNED" },
    }),
    // Roll the capture up to the order's ledger.
    ...(booking.orderId && isPrepaid && capturePaise > 0
      ? [
          prisma.order.update({
            where: { id: booking.orderId },
            data: { capturedPaise: { increment: capturePaise } },
          }),
        ]
      : []),
  ]);

  if (booking.orderId) await recomputeOrderStatus(booking.orderId);

  return {
    ok: true,
    bookingId: assignment.bookingId,
    bookingRef: assignment.booking.bookingRef,
    startOtp,
  };
}

/** Partner declines a pending offer (it is freed for the next dispatch wave). */
export async function declineJobOffer(assignmentId: string, partnerId: string): Promise<boolean> {
  const assignment = await prisma.jobAssignment.findFirst({
    where: { id: assignmentId, partnerId, status: "PENDING" },
  });
  if (!assignment) return false;

  await prisma.jobAssignment.update({
    where: { id: assignmentId },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  return true;
}

// ─── Partner-driven status transitions ───────────────────────────────────────

async function loadAssignedBooking(bookingId: string, partnerId: string) {
  return prisma.booking.findFirst({ where: { id: bookingId, assignedPartnerId: partnerId } });
}

function canTransition(from: string, to: string): boolean {
  return (PARTNER_TRANSITIONS[from] ?? []).includes(to);
}

/** Partner marks themselves en route to the customer. */
export async function markPartnerArriving(
  bookingId: string,
  partnerId: string,
): Promise<EngineResult> {
  const booking = await loadAssignedBooking(bookingId, partnerId);
  if (!booking) return { ok: false, error: "Job not found" };
  if (!["PAID", "COD"].includes(booking.paymentStatus)) {
    return { ok: false, error: "Waiting for customer payment" };
  }
  if (!canTransition(booking.status, "PROVIDER_ARRIVING")) {
    return { ok: false, error: `Cannot go en route from ${booking.status}` };
  }
  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "PROVIDER_ARRIVING" } }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: "PROVIDER_ARRIVING" } }),
  ]);
  return { ok: true };
}

/**
 * Partner starts the job. Gated by the customer's start OTP — the partner must
 * read it from the customer, proving they are on site.
 */
export async function startJob(
  bookingId: string,
  partnerId: string,
  otp: string,
): Promise<EngineResult> {
  const booking = await loadAssignedBooking(bookingId, partnerId);
  if (!booking) return { ok: false, error: "Job not found" };
  if (!["PAID", "COD"].includes(booking.paymentStatus)) {
    return { ok: false, error: "Waiting for customer payment" };
  }
  if (!canTransition(booking.status, "STARTED")) {
    return { ok: false, error: `Cannot start from ${booking.status}` };
  }
  if (!booking.startOtp || booking.startOtp !== otp.trim()) {
    return { ok: false, error: "Incorrect start code" };
  }
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "STARTED", startConfirmedAt: new Date() },
    }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: "STARTED" } }),
  ]);
  return { ok: true };
}

/**
 * Partner completes the job. Settles the final amount, records the partner's
 * earning (net of platform commission), and bumps the partner's completed count.
 */
export async function completeJob(
  bookingId: string,
  partnerId: string,
): Promise<EngineResult<{ amountPaise: number; commissionPaise: number; netPaise: number }>> {
  const booking = await loadAssignedBooking(bookingId, partnerId);
  if (!booking) return { ok: false, error: "Job not found" };
  if (!canTransition(booking.status, "COMPLETED")) {
    return { ok: false, error: `Cannot complete from ${booking.status}` };
  }

  const amountPaise = booking.finalAmountPaise ?? booking.quotedAmount;
  const commissionPaise = Math.round(amountPaise * PLATFORM_COMMISSION_RATE);
  const netPaise = amountPaise - commissionPaise;

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED", finalAmountPaise: amountPaise },
    }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: "COMPLETED" } }),
    prisma.jobEarning.create({
      data: { partnerId, bookingId, amountPaise: netPaise, commissionPaise, payoutStatus: "PENDING" },
    }),
    prisma.partner.update({
      where: { id: partnerId },
      data: { jobsCompleted: { increment: 1 } },
    }),
  ]);

  return { ok: true, amountPaise, commissionPaise, netPaise };
}

// ─── Partner read models ─────────────────────────────────────────────────────

const ACTIVE_JOB_STATUSES = ["ASSIGNED", "PROVIDER_ARRIVING", "STARTED"] satisfies JobStatus[];

const bookingDetailInclude = {
  service: { include: { category: true } },
  address: true,
  user: { select: { name: true, phone: true } },
} as const;

/** Live, unexpired offers waiting for this partner to accept/decline. */
export async function getPartnerPendingOffers(partnerId: string) {
  const now = new Date();
  // Lazily expire stale offers so the feed is always accurate.
  await prisma.jobAssignment.updateMany({
    where: { partnerId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });
  return prisma.jobAssignment.findMany({
    where: { partnerId, status: "PENDING", expiresAt: { gt: now } },
    include: { booking: { include: bookingDetailInclude } },
    orderBy: { offeredAt: "desc" },
  });
}

/** Jobs this partner has accepted and is currently working. */
export async function getPartnerActiveJobs(partnerId: string) {
  return prisma.booking.findMany({
    where: { assignedPartnerId: partnerId, status: { in: ACTIVE_JOB_STATUSES } },
    include: bookingDetailInclude,
    orderBy: { createdAt: "desc" },
  });
}

/** Completed/cancelled history for this partner. */
export async function getPartnerJobHistory(partnerId: string, take = 50) {
  return prisma.booking.findMany({
    where: { assignedPartnerId: partnerId, status: { in: ["COMPLETED", "CANCELLED"] } },
    include: bookingDetailInclude,
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getPartnerJobByRef(partnerId: string, bookingRef: string) {
  return prisma.booking.findFirst({
    where: { bookingRef, assignedPartnerId: partnerId },
    include: { ...bookingDetailInclude, statusLogs: { orderBy: { createdAt: "asc" } } },
  });
}
