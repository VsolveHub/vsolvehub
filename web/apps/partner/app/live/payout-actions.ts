"use server";

import { prisma } from "@vsolve/db";
import { encrypt, last4 } from "@vsolve/crypto";
import { requirePartner } from "@/lib/auth";

export type PayoutState = { ok?: boolean; error?: string };

/**
 * Collect payout details at the moment the captain withdraws — not during
 * onboarding. Bank account number is encrypted at rest; only last4 is shown.
 */
export async function savePayoutDetails(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const partner = await requirePartner();
  const account = String(formData.get("account") ?? "").replace(/\s/g, "");
  const ifsc = String(formData.get("ifsc") ?? "").trim().toUpperCase();
  const upiId = String(formData.get("upiId") ?? "").trim() || null;

  if (!account && !upiId) return { error: "Add a bank account or a UPI ID to get paid." };
  if (account && !/^\d{9,18}$/.test(account)) return { error: "Enter a valid bank account number." };

  await prisma.payoutDetail.upsert({
    where: { partnerId: partner.id },
    update: {
      ...(account ? { accountEnc: encrypt(account), accountLast4: last4(account), ifsc: ifsc || null } : {}),
      ...(upiId ? { upiId } : {}),
    },
    create: {
      partnerId: partner.id,
      accountEnc: account ? encrypt(account) : null,
      accountLast4: account ? last4(account) : null,
      ifsc: ifsc || null,
      upiId,
    },
  });

  return { ok: true };
}

export async function recordCompletedJob(data: { amount: number; fromArea: string; toArea: string }) {
  const partner = await requirePartner();
  const ref = `JOB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  if (partner.providerType === "DRIVER") {
    await prisma.trip.create({
      data: {
        partnerId: partner.id,
        fare: data.amount,
        ref,
        fromArea: data.fromArea,
        toArea: data.toArea,
      },
    });
  } else {
    await prisma.earningRecord.create({
      data: {
        partnerId: partner.id,
        amount: data.amount,
        ref,
      },
    });
  }
}

export async function withdrawBalance(amount: number) {
  const partner = await requirePartner();
  if (amount <= 0) return { error: "Invalid amount" };

  const ref = `WD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  if (partner.providerType === "DRIVER") {
    await prisma.trip.create({
      data: {
        partnerId: partner.id,
        fare: -amount,
        ref,
        fromArea: "Wallet",
        toArea: "Bank Account",
      },
    });
  } else {
    await prisma.earningRecord.create({
      data: {
        partnerId: partner.id,
        amount: -amount,
        ref,
      },
    });
  }

  return { ok: true };
}
