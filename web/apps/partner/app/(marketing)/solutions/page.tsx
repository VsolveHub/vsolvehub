import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Zap, LineChart, ArrowRight, Check } from "lucide-react";
import { PARTNER_ROLES } from "@vsolve/config";
import { Button } from "@vsolve/ui";
import { Medallion } from "@/components/graphics";
import { roleVisual } from "@/components/role-visuals";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Choose Your Partnership Role",
  description:
    "Become a V Solve Hub partner. Join as a Captain, Professional, Rental Vendor, Property Host, Event Vendor, or Employer.",
  alternates: { canonical: "/solutions" },
};

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Secure Verification" },
  { icon: Zap, label: "Instant Payments" },
  { icon: LineChart, label: "Growth Analytics" },
];

export default function SolutionsPage() {
  return (
    <main className="bg-surface-muted">
      <section className="px-5 pt-16 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">
              Choose Your Partnership Role
            </h1>
            <p className="mt-3 text-gray-500">
              Select the role that best fits your business or skills.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PARTNER_ROLES.map((role) => {
              const v = roleVisual(role.slug);
              const soon = role.status === "coming-soon";
              return (
                <div
                  key={role.slug}
                  className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Medallion icon={v.icon} tone={v.tone} size={48} />
                    <h2 className="text-lg font-bold text-ink-900">{role.name}</h2>
                    {soon && (
                      <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-4 flex-1 text-sm text-gray-500">{role.description}</p>
                  <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <ShieldCheck className="h-3.5 w-3.5" /> {role.requirement}
                  </p>
                  <Link href={`/become/${role.slug}`} className="mt-5">
                    <Button className="w-full" variant={soon ? "outline" : "primary"}>
                      {soon ? "Learn more" : "Get Started"}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Empowering band */}
      <section className="bg-white px-5 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">
              Empowering the Next Generation of Service Partners
            </h2>
            <p className="mt-4 text-gray-500">
              Whether you&rsquo;re an individual artisan or a growing enterprise, V Solve Hub
              provides the digital infrastructure to manage your workforce, rentals, and operations
              seamlessly.
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
              {HIGHLIGHTS.map((h) => (
                <li key={h.label} className="inline-flex items-center gap-2 text-sm font-medium text-ink-900">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {h.label}
                </li>
              ))}
            </ul>
            <Link href="/become/captain" className="mt-8 inline-block">
              <Button size="lg">
                Start your application <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="relative mx-auto grid h-64 w-full max-w-sm place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-900">
            <div className="pointer-events-none absolute -left-8 -top-8 h-40 w-40 rounded-full bg-accent-500/20 blur-2xl" />
            <div className="grid grid-cols-3 gap-4 p-6">
              {HIGHLIGHTS.map((h) => (
                <Medallion key={h.label} icon={h.icon} tone="amber" size={60} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
