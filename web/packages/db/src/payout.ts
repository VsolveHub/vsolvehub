// ─────────────────────────────────────────────────────────────────────────────
// Partner payout — wallet balances derived from JobEarning, and withdrawals
// settled through a pluggable PayoutGateway. The stub is used in dev/MVP; a
// real provider (RazorpayX Payouts) is dropped in via setPayoutGateway().
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "./client";
import type { EngineResult } from "./fulfillment";

// ─── Payout gateway interface (swap the impl, not the callers) ───────────────

export interface PayoutRequest {
  partnerId: string;
  amountPaise: number;
  destination: { upiId?: string | null; accountLast4?: string | null };
}

export interface PayoutResult {
  ok: boolean;
  reference?: string;
  error?: string;
}

export interface PayoutGateway {
  initiatePayout(req: PayoutRequest): Promise<PayoutResult>;
}

/** Dev/MVP gateway — instantly "succeeds" with a synthetic reference. */
export const stubPayoutGateway: PayoutGateway = {
  async initiatePayout(req) {
    // TODO(prod): integrate RazorpayX Payouts here (fund account → payout).
    if (req.amountPaise <= 0) return { ok: false, error: "Nothing to pay out" };
    const reference = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    return { ok: true, reference };
  },
};

let gateway: PayoutGateway = stubPayoutGateway;

/** Swap in a real gateway (e.g. RazorpayX) at app bootstrap. */
export function setPayoutGateway(g: PayoutGateway): void {
  gateway = g;
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export type PartnerWallet = {
  availablePaise: number;
  withdrawnPaise: number;
  lifetimePaise: number;
  lifetimeCommissionPaise: number;
  earnings: {
    id: string;
    bookingId: string | null;
    amountPaise: number;
    commissionPaise: number;
    payoutStatus: string;
    earnedAt: Date;
  }[];
};

const sumBy = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);

/** Wallet view for a partner, derived entirely from real JobEarning rows. */
export async function getPartnerWallet(partnerId: string): Promise<PartnerWallet> {
  const earnings = await prisma.jobEarning.findMany({
    where: { partnerId },
    orderBy: { earnedAt: "desc" },
  });
  const pending = earnings.filter((e) => e.payoutStatus === "PENDING");
  const paid = earnings.filter((e) => e.payoutStatus === "PAID");

  return {
    availablePaise: sumBy(pending, (e) => e.amountPaise),
    withdrawnPaise: sumBy(paid, (e) => e.amountPaise),
    lifetimePaise: sumBy(earnings, (e) => e.amountPaise),
    lifetimeCommissionPaise: sumBy(earnings, (e) => e.commissionPaise),
    earnings: earnings.map((e) => ({
      id: e.id,
      bookingId: e.bookingId,
      amountPaise: e.amountPaise,
      commissionPaise: e.commissionPaise,
      payoutStatus: e.payoutStatus,
      earnedAt: e.earnedAt,
    })),
  };
}

// ─── Withdrawal ──────────────────────────────────────────────────────────────

/**
 * Withdraw the partner's full available balance to their saved payout method.
 * Settles through the gateway, then marks the included earnings as PAID. The
 * earning rows are the ledger — no separate balance field can drift.
 */
export async function requestWithdrawal(
  partnerId: string,
): Promise<EngineResult<{ amountPaise: number; reference: string }>> {
  const payout = await prisma.payoutDetail.findUnique({ where: { partnerId } });
  if (!payout || (!payout.accountLast4 && !payout.upiId)) {
    return { ok: false, error: "Add a bank account or UPI ID before withdrawing." };
  }

  const pending = await prisma.jobEarning.findMany({
    where: { partnerId, payoutStatus: "PENDING" },
    select: { id: true, amountPaise: true },
  });
  const amountPaise = sumBy(pending, (e) => e.amountPaise);
  if (amountPaise <= 0) {
    return { ok: false, error: "No balance available to withdraw." };
  }

  const result = await gateway.initiatePayout({
    partnerId,
    amountPaise,
    destination: { upiId: payout.upiId, accountLast4: payout.accountLast4 },
  });
  if (!result.ok || !result.reference) {
    return { ok: false, error: result.error ?? "Payout failed. Please try again." };
  }

  await prisma.$transaction([
    prisma.jobEarning.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { payoutStatus: "PAID" },
    }),
    prisma.payout.create({
      data: { partnerId, amountPaise, reference: result.reference, status: "PAID" },
    }),
  ]);

  return { ok: true, amountPaise, reference: result.reference };
}

/** A partner's withdrawal history, newest first. */
export async function getPartnerPayouts(partnerId: string, take = 20) {
  return prisma.payout.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
