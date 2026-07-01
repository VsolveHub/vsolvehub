import "server-only";
import { redirect } from "next/navigation";
import { prisma, type AdminRole } from "@vsolve/db";
import { createClient } from "@/utils/supabase/server";

export type CurrentAdmin = { id: string; email: string; role: AdminRole };

/** Returns the logged-in + allowlisted admin, or null (never redirects). */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = await prisma.adminUser.findUnique({ where: { email: user.email } });
  if (!admin) return null;
  return { id: admin.id, email: admin.email, role: admin.role };
}

/**
 * Auth + authorization gate — call at the top of every page and every server
 * action. No Supabase session → /login. Session but not in the AdminUser
 * allowlist (or wrong role) → /access-denied. Never trust the client.
 */
export async function requireAdmin(opts?: { role?: AdminRole }): Promise<CurrentAdmin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const admin = await prisma.adminUser.findUnique({ where: { email: user.email } });
  if (!admin) redirect("/access-denied");
  if (opts?.role && admin.role !== opts.role) redirect("/access-denied");

  return { id: admin.id, email: admin.email, role: admin.role };
}
