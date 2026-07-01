"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma, type AdminRole } from "@vsolve/db";
import { requireAdmin } from "@/lib/auth";

export type AdminFormState = { error?: string; ok?: boolean };

function isAdminRole(value: string): value is AdminRole {
  return value === "ADMIN" || value === "REVIEWER";
}

export async function addAdmin(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  await requireAdmin({ role: "ADMIN" });
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "REVIEWER");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!isAdminRole(role)) return { error: "Invalid role." };

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return { error: "This email is already an admin." };

  await prisma.adminUser.create({ data: { email, role } });
  revalidatePath("/admins");
  return { ok: true };
}

export async function removeAdmin(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const me = await requireAdmin({ role: "ADMIN" });
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Invalid request." };
  if (id === me.id) return { error: "You can't remove your own account." };

  try {
    await prisma.adminUser.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { error: "Can't remove — this admin has audit-log history that must be kept for the record." };
    }
    return { error: "Something went wrong." };
  }
  revalidatePath("/admins");
  return { ok: true };
}
