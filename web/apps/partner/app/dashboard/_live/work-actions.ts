"use server";

import { markPartnerArriving, startJob, completeJob } from "@vsolve/db";
import { revalidatePath } from "next/cache";
import { requirePartner } from "@/lib/auth";

export type WorkResult = { ok: boolean; error?: string };

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
