import { serviceBySlug, partnerCategoryById } from "@vsolve/config";
import { PhoneForm } from "./phone-form";

export const metadata = { title: "Partner Login", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; category?: string }>;
}) {
  const { service, category } = await searchParams;
  const svc = service ? serviceBySlug(service) : undefined;
  const cat = category ? partnerCategoryById(category) : undefined;

  const joiningAs = svc?.name ?? (cat?.status === "live" ? cat.name : undefined);

  return (
    <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-ink-900">Partner sign in</h1>
      <p className="mt-1 text-sm text-gray-500">
        {joiningAs
          ? `You're joining as a ${joiningAs}. Enter your mobile number to continue.`
          : "Enter your mobile number and we'll send you a one-time code."}
      </p>
      <PhoneForm service={service} category={cat?.status === "live" ? category : undefined} />
    </div>
  );
}
