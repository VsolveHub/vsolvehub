import { redirect } from "next/navigation";

/**
 * Referral share links are `/signup?ref=CODE`. Signing up and logging in are the same OTP step,
 * so this forwards to `/login` with the code; the login screen pre-fills and validates it, and
 * Django applies it only if that verification creates a new account.
 */
export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const ref = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  redirect(ref ? `/login?ref=${encodeURIComponent(ref)}` : "/login");
}
