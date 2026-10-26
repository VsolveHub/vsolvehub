import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Zap, LineChart, ArrowRight, Check } from "lucide-react";
import { PARTNER_CATEGORIES } from "@vsolve/config";
import { Button } from "@vsolve/ui";
import { Medallion } from "@/components/graphics";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Start Earning as a Service Partner",
  description:
    "Join V Solve Hub as a Technician, Beauty & Wellness, Home Services or Pet Services professional. More categories coming soon.",
  alternates: { canonical: "/solutions" },
};

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Verified & trusted" },
  { icon: Zap, label: "Fast payouts" },
  { icon: LineChart, label: "Grow your income" },
];

export default function SolutionsPage() {
  return (
    <main className="bg-surface-muted">
      <section className="px-5 pt-16 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">What service do you offer?</h1>
            <p className="mt-3 text-gray-500">
              Pick your line of work and start getting job requests near you. It only takes ~5 minutes to apply.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PARTNER_CATEGORIES.map((cat) => {
              const soon = cat.status === "coming-soon";
              return (
                <div
                  key={cat.id}
                  className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-muted text-2xl">
                      {cat.icon}
                    </span>
                    <h2 className="text-lg font-bold text-ink-900">{cat.name}</h2>
                    {soon && (
                      <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-4 flex-1 text-sm text-gray-500">{cat.description}</p>
                  {soon ? (
                    <Button className="mt-5 w-full" variant="outline" disabled>
                      Coming soon
                    </Button>
                  ) : (
                    <Link href={`/login?category=${cat.id}`} className="mt-5">
                      <Button className="w-full">Get started</Button>
                    </Link>
                  )}
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
              Grow your business with V Solve Hub
            </h2>
            <p className="mt-4 text-gray-500">
              Whether you work solo or run a team, V Solve Hub brings you customers, handles payments,
              and lets you manage your jobs from one simple app.
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
            <Link href="/login" className="mt-8 inline-block">
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
