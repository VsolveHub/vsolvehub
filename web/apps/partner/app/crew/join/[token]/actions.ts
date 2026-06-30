"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vsolve/db";

export type JoinResult = { ok?: boolean; error?: string };

const schema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2, "Enter your name").max(60),
});

/** A worker confirms their crew invite. Activates the roster member. */
export async function confirmJoin(_prev: JoinResult, formData: FormData): Promise<JoinResult> {
  const parsed = schema.safeParse({ token: formData.get("token"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid details" };

  const member = await prisma.crewMember.findUnique({ where: { inviteToken: parsed.data.token } });
  if (!member || member.status === "REMOVED") {
    return { error: "This invite is no longer valid. Ask your crew lead for a new link." };
  }

  await prisma.crewMember.update({
    where: { id: member.id },
    data: { name: parsed.data.name, status: "ACTIVE", joinedAt: new Date() },
  });
  revalidatePath(`/crew/join/${parsed.data.token}`);
  return { ok: true };
}
