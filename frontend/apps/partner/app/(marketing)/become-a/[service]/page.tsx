import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Wallet, MapPin, ArrowRight } from "lucide-react";
import { SERVICE_CATALOG } from "@vsolve/config";
import { Button } from "@vsolve/ui";
import { Medallion, type Tone } from "@/components/graphics";
import { serviceVisual } from "@/components/service-visuals";

// Pre-render one SEO page per service: /become-a/electrician, /plumber, ...
export const dynamic = "force-static";

export function generateStaticParams() {
  return SERVICE_CATALOG.map((s) => ({ service: s.slug }));
}

function getService(slug: string) {
  return SERVICE_CATALOG.find((s) => s.slug === slug);
}

export async function generateMetadata(
  { params }: { params: Promise<{ service: string }> },
): Promise<Metadata> {
  const { service } = await params;
  const svc = getService(service);
  if (!svc) return {};
  const title = `Become a ${svc.name} Partner`;
  return {
    title,
    description: `Sign up as a verified ${svc.name.toLowerCase()} on V Solve Hub. ${svc.tagline} Earn daily across Telangana.`,
    alternates: { canonical: `/become-a/${svc.slug}` },
    openGraph: { title, type: "website" },
  };
}

export default async function BecomeAServicePage(
  { params }: { params: Promise<{ service: string }> },
) {
  const { service } = await params;
  const svc = getService(service);
  if (!svc) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: `${svc.name} Partner`,
    description: svc.tagline,
    hiringOrganization: { "@type": "Organization", name: "V Solve Hub" },
    jobLocationType: "TELECOMMUTE",
    employmentType: "CONTRACTOR",
    applicantLocationRequirements: { "@type": "Country", name: "India" },
  };

  const v = serviceVisual(svc.slug);
  const perks: { icon: typeof Clock; tone: Tone; title: string; body: string }[] = [
    { icon: Clock, tone: "brand", title: "Flexible hours", body: "Work when you want — full-time or on the side." },
    { icon: Wallet, tone: "green", title: "Daily payouts", body: "Earnings settled straight to your bank account." },
    { icon: MapPin, tone: "amber", title: "Jobs near you", body: "Get matched to verified customers in your area." },
  ];

  return (
    <main className="px-5 py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto w-fit">
          <Medallion icon={v.icon} tone={v.tone} size={88} />
        </div>
        <h1 className="mt-6 text-4xl font-bold text-ink-900">Become a {svc.name} Partner</h1>
        <p className="mt-4 text-lg text-gray-500">{svc.tagline}</p>
        <Link href={`/login?service=${svc.slug}`} className="mt-8 inline-block">
          <Button size="lg">
            Start your application <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="mx-auto mt-16 grid max-w-4xl gap-6 sm:grid-cols-3">
        {perks.map((p) => (
          <div key={p.title} className="rounded-2xl border border-border bg-white p-6 text-center shadow-sm">
            <div className="mx-auto w-fit">
              <Medallion icon={p.icon} tone={p.tone} size={56} />
            </div>
            <p className="mt-4 font-semibold text-ink-900">{p.title}</p>
            <p className="mt-1 text-sm text-gray-500">{p.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
