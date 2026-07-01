"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/session";

/** Log out — used by the live app shell (client) and the dashboard chrome. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
