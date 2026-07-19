"use server";

import { markPartnerArriving, startJob, completeJob, releasePartnerAssignment } from "@vsolve/db";
import { revalidatePath } from "next/cache";
import { requirePartner } from "@/lib/auth";

export type WorkResult = { ok: boolean; error?: string };

/**
 * "Can't make it": free the slot so the customer's job can be reassigned. We
 * release here (a DB-only op), then ask the customer app to reassign right away
 * — the matcher and payment gateway live there, so all matching and any refund
 * stay in one process. That call is best-effort: if it is not configured or
 * fails, the customer's tracker poll reassigns a few seconds later anyway.
 */
export async function releaseAction(bookingId: string): Promise<WorkResult> {
  const partner = await requirePartner();
  const res = await releasePartnerAssignment(bookingId, partner.id, "Partner could not make it");
  revalidatePath("/dashboard");
  if (!res.ok) return { ok: false, error: res.error };

  await triggerReassignment(bookingId);
  return { ok: true };
}

/** Fire-and-forget nudge to the customer app to reassign now (poll is the backstop). */
async function triggerReassignment(bookingId: string): Promise<void> {
  const secret = process.env.INTERNAL_DISPATCH_SECRET;
  if (!secret) return; // disabled → the customer tracker poll handles it
  const base = (process.env.CUSTOMER_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    await fetch(`${base}/api/internal/dispatch/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ bookingId }),
      // Don't wedge the partner's UI if the customer app is slow/unreachable.
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* poll fallback covers this */
  }
}

/** ASSIGNED → PROVIDER_ARRIVING ("I'm on my way"). */
export async function arriveAction(bookingId: string): Promise<WorkResult> {
  const partner = await requirePartner();
  const res = await markPartnerArriving(bookingId, partner.id);
  revalidatePath("/dashboard");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** PROVIDER_ARRIVING → STARTED (gated by the customer's start OTP). */
export async function startAction(bookingId: string, otp: string): Promise<WorkResult> {
  const partner = await requirePartner();
  const res = await startJob(bookingId, partner.id, otp);
  revalidatePath("/dashboard");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** STARTED → COMPLETED (settles the earning). */
export async function completeAction(bookingId: string): Promise<WorkResult> {
  const partner = await requirePartner();
  const res = await completeJob(bookingId, partner.id);
  revalidatePath("/dashboard");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
