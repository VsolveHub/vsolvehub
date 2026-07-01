"use server";

import { revalidatePath } from "next/cache";
import { prisma, DocStatus } from "@vsolve/db";
import { requireAdmin } from "@/lib/auth";
import { ALLOWED_FROM, RESULT_STATUS, type PartnerDecision } from "@/lib/partner-status";

export type ActionState = { error?: string; ok?: boolean };

const REASON_REQUIRED: PartnerDecision[] = ["REQUESTED_CHANGES", "REJECTED"];

/** Approve / request changes / reject / suspend / reactivate a partner.
 *  Status update + audit row happen in one transaction. */
export async function decidePartner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const partnerId = String(formData.get("partnerId") ?? "");
  const decision = String(formData.get("decision") ?? "") as PartnerDecision;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!partnerId || !(decision in ALLOWED_FROM)) return { error: "Invalid request." };
  if (REASON_REQUIRED.includes(decision) && !reason) {
    return { error: "A reason is required for this action." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUniqueOrThrow({ where: { id: partnerId } });
      if (!ALLOWED_FROM[decision].includes(partner.status)) {
        throw new Error(`This partner is now ${partner.status} — refresh the page and try again.`);
      }
      await tx.partner.update({
        where: { id: partnerId },
        data: { status: RESULT_STATUS[decision] },
      });
      await tx.adminAction.create({
        data: { adminId: admin.id, partnerId, action: decision, reason: reason || null },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  return { ok: true };
}

/** Approve or reject a single KYC document. Rejecting requires a reason, which
 *  is what the partner app's own dashboard reads to explain "action required". */
export async function decideDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const docId = String(formData.get("docId") ?? "");
  const approve = String(formData.get("approve") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();

  if (!docId) return { error: "Invalid request." };
  if (!approve && !reason) return { error: "A reason is required to reject a document." };

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return { error: "Document not found." };

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: docId },
      data: {
        status: approve ? DocStatus.APPROVED : DocStatus.REJECTED,
        reason: approve ? null : reason,
      },
    });
    await tx.adminAction.create({
      data: {
        adminId: admin.id,
        partnerId: doc.partnerId,
        action: approve ? "DOC_APPROVED" : "DOC_REJECTED",
        reason: approve ? null : reason,
      },
    });
  });

  revalidatePath(`/partners/${doc.partnerId}`);
  return { ok: true };
}
