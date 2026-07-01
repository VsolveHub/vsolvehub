"use server";

import { revalidatePath } from "next/cache";
import { requirePartner } from "@/lib/auth";
import { acceptOffer, declineOffer } from "@/lib/crew-offers";

export async function acceptCrewOffer(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  await acceptOffer(partner.id, String(formData.get("offerId") ?? ""));
  revalidatePath("/dashboard/crew/requests");
  revalidatePath("/dashboard/crew/jobs");
}

export async function declineCrewOffer(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  await declineOffer(partner.id, String(formData.get("offerId") ?? ""));
  revalidatePath("/dashboard/crew/requests");
}
