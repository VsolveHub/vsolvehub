import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Wrench,
  ShieldCheck,
  Wallet,
  Clock,
  ArrowRight,
  BellRing,
} from "lucide-react";
import { PARTNER_ROLES, roleBySlug, servicesForRole } from "@vsolve/config";
import { Button } from "@vsolve/ui";
import { Medallion, StepFlow, type Tone } from "@/components/graphics";
import { roleVisual } from "@/components/role-visuals";
import { serviceVisual } from "@/components/service-visuals";

// One static page per role: /become/captain, /become/professional, ...
export const dynamic = "force-static";

export function generateStaticParams() {
  return PARTNER_ROLES.map((r) => ({ role: r.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ role: string }> },
): Promise<Metadata> {
  const { role } = await params;
  const r = roleBySlug(role);
  if (!r) return {};
  const title = `Become a ${r.name} Partner`;
  return {
    title,
    description: `Join V Solve Hub as a ${r.name}. ${r.description} Earn daily across Telangana.`,
    alternates: { canonical: `/become/${r.slug}` },
    openGraph: { title, type: "website" },
  };
}

const STEPS = [
  { icon: Wrench, tone: "brand" as Tone, title: "Pick your service", body: "Choose the skills you want to offer from our wide range of services." },
  { icon: ShieldCheck, tone: "sky" as Tone, title: "Get verified", body: "Complete a quick, secure verification to build trust with customers." },
  { icon: Wallet, tone: "green" as Tone, title: "Start earning", body: "Accept jobs, complete them, and get paid directly to your account." },
];

export default async function BecomeRolePage(
  { params }: { params: Promise<{ role: string }> },
) {
  const { role } = await params;
  const r = roleBySlug(role);
  if (!r) notFound();

  const v = roleVisual(r.slug);

  // Coming-soon roles: marketing + waitlist, no flow yet.
  if (r.status === "coming-soon") {
    return (
      <main className="px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto w-fit">
            <Medallion icon={v.icon} tone={v.tone} size={88} />
          </div>
          <span className="mt-6 inline-block rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Coming soon
          </span>
          <h1 className="mt-4 text-4xl font-bold text-ink-900">{r.name} partnerships</h1>
          <p className="mt-4 text-lg text-gray-500">{r.description}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            We&rsquo;re building the onboarding flow for {r.name.toLowerCase()} partners.
            {" "}{r.requirement}.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/contact">
              <Button size="lg">
                <BellRing className="h-4 w-4" /> Notify me
              </Button>
            </Link>
            <Link href="/solutions">
              <Button variant="outline" size="lg">
                View other roles
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const services = servicesForRole(r.slug);

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-700 to-brand-900 text-white">
        <div className="pointer-events-none absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <div className="mx-auto w-fit">
            <Medallion icon={v.icon} tone={v.tone} size={88} />
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
            Become a {r.name} Partner
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg text-white/80">{r.description}</p>
          <Link href="/login" className="mt-8 inline-block">
            <Button variant="accent" size="lg">
              Start your application <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-ink-900">How it works</h2>
            <p className="mt-2 text-gray-500">Three simple steps to start earning.</p>
          </div>
          <div className="mt-14">
            <StepFlow steps={STEPS} />
          </div>
        </div>
      </section>

      {/* Services under this role */}
      <section className="bg-surface-muted px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-ink-900">Choose your service</h2>
            <p className="mt-2 text-gray-500">Join as a partner in these high-demand categories.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((svc) => {
              const sv = serviceVisual(svc.slug);
              return (
                <Link
                  key={svc.slug}
                  href={`/become-a/${svc.slug}`}
                  className="group relative flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <Medallion icon={sv.icon} tone={sv.tone} size={60} />
                  <h3 className="mt-4 font-semibold text-ink-900">{svc.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-gray-500">{svc.tagline}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    Become a {svc.name}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="px-5 py-16">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-r from-brand-600 to-brand-800 px-8 py-12 text-center text-white">
          <div className="mx-auto mb-4 w-fit">
            <Medallion icon={Clock} tone="amber" size={56} />
          </div>
          <h2 className="text-2xl font-bold">Sign up in ~5 minutes</h2>
          <p className="mx-auto mt-2 max-w-md text-white/80">
            Get verified and start receiving jobs in your area this week.
          </p>
          <Link href="/login" className="mt-6 inline-block">
            <Button variant="accent" size="lg">
              Become a {r.name} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
