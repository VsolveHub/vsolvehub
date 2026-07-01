import { requirePartner } from "@/lib/auth";

export const metadata = { robots: { index: false } };

// Bare gate — the partner app (page.tsx) renders full-screen. The chromed
// deep-pages live under the (secondary) route group with their own layout.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePartner();
  return <>{children}</>;
}
