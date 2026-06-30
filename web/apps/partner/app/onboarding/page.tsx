import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, IdCard, Camera, Landmark, Car, ArrowRight } from "lucide-react";
import { Button, Card } from "@vsolve/ui";
import { ONBOARDING_REQUIREMENTS, SERVICE_CATALOG } from "@vsolve/config";
import { requirePartner } from "@/lib/auth";
import { formSteps } from "@/lib/onboarding";
import { Medallion, type Tone } from "@/components/graphics";
import { serviceVisual } from "@/components/service-visuals";
import { chooseService } from "./actions";

const REQ_ICONS = [IdCard, Camera, Landmark];
const REQ_ICONS_DRIVER = [IdCard, Car, Landmark];

export default async function OnboardingIntro() {
  const partner = await requirePartner();
  if (partner.status !== "DRAFT") redirect("/live");

  // No service chosen yet → pick a role.
  if (!partner.tradeId) {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold text-ink-900">How do you want to earn?</h1>
        <p className="mt-2 text-gray-500">Choose the kind of work you want to take on.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {SERVICE_CATALOG.map((svc) => {
            const v = serviceVisual(svc.slug);
            return (
              <form key={svc.slug} action={chooseService}>
                <input type="hidden" name="service" value={svc.slug} />
                <button type="submit" className="w-full text-left">
                  <Card className="flex items-center gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <Medallion icon={v.icon} tone={v.tone} size={52} />
                    <div>
                      <h3 className="font-semibold text-ink-900">{svc.name}</h3>
                      <p className="mt-0.5 text-sm text-gray-500">{svc.tagline}</p>
                    </div>
                  </Card>
                </button>
              </form>
            );
          })}
        </div>
      </div>
    );
  }

  const serviceName = partner.trade?.name ?? "Partner";
  const requirements = ONBOARDING_REQUIREMENTS[partner.providerType];
  const first = formSteps(partner.providerType)[0]!;
  const v = serviceVisual(partner.trade?.slug ?? "");
  const reqIcons = partner.providerType === "DRIVER" ? REQ_ICONS_DRIVER : REQ_ICONS;
  const reqTones: Tone[] = ["brand", "sky", "green"];

  return (
    <div className="text-center">
      <div className="mx-auto w-fit">
        <Medallion icon={v.icon} tone={v.tone} size={84} />
      </div>
      <h1 className="mt-6 text-3xl font-bold text-ink-900">
        Become a verified {serviceName} on V Solve Hub
      </h1>
      <p className="mt-2 text-gray-500">
        Join our network of trusted professionals and start growing your business today.
      </p>

      <Card className="mt-8 text-left">
        <h2 className="font-semibold text-ink-900">What you&apos;ll need</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {requirements.map((r, i) => (
            <li key={r.title} className="rounded-xl border border-border bg-surface-muted/50 p-4 text-center">
              <div className="mx-auto w-fit">
                <Medallion icon={reqIcons[i] ?? IdCard} tone={reqTones[i] ?? "brand"} size={48} />
              </div>
              <p className="mt-3 text-sm font-semibold text-ink-900">{r.title}</p>
              <p className="mt-0.5 text-xs text-gray-500">{r.body}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
        <Clock className="h-4 w-4" /> Estimated time: ~5 minutes
      </div>

      <div className="mt-6">
        <Link href={`/onboarding/${first.id}`}>
          <Button size="lg">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <p className="mt-3 text-xs text-gray-400">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
