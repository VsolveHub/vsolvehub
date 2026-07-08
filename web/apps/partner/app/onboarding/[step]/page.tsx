import { redirect } from "next/navigation";
import { prisma } from "@vsolve/db";
import { Card, Stepper } from "@vsolve/ui";
import { skillsForService } from "@vsolve/config";
import { requirePartner } from "@/lib/auth";
import { formSteps, isValidStep, stepIndex } from "@/lib/onboarding";
import { IdentityStep } from "../steps/identity-step";
import { SkillsStep } from "../steps/skills-step";
import { VehicleStep } from "../steps/vehicle-step";
import { DocumentsStep } from "../steps/documents-step";

// Files now upload directly to storage from the browser, so the server actions
// here only mint signed URLs and record small rows — fast. A modest ceiling
// keeps a stuck DB call from hanging to the platform's hard limit.
export const maxDuration = 30;

export default async function WizardStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const partner = await requirePartner();
  if (partner.status !== "DRAFT") redirect("/dashboard");
  if (!partner.tradeId) redirect("/onboarding");

  const { step } = await params;
  const type = partner.providerType;
  if (!isValidStep(type, step)) redirect("/onboarding");

  const steps = formSteps(type);
  const current = stepIndex(type, step);
  const meta = steps[current]!;

  // Per-step data loading.
  let body: React.ReactNode = null;
  if (step === "identity") {
    body = (
      <IdentityStep fullName={partner.fullName} gender={partner.gender} />
    );
  } else if (step === "skills") {
    const tradeSkills = skillsForService(partner.trade?.slug ?? "");
    let selectedSkills: string[] = [];
    try {
      const parsed = JSON.parse(partner.servicesOffered);
      if (Array.isArray(parsed)) selectedSkills = parsed.map(String);
    } catch {
      /* default to none */
    }
    body = (
      <SkillsStep
        tradeName={partner.trade?.name ?? "Partner"}
        skills={tradeSkills}
        selectedSkills={selectedSkills}
        experience={partner.experience}
        area={partner.area}
        cityName={partner.cityName}
        pincode={partner.pincode}
        lat={partner.lat}
        lng={partner.lng}
      />
    );
  } else if (step === "vehicle") {
    const vehicle = await prisma.vehicle.findUnique({ where: { partnerId: partner.id } });
    body = <VehicleStep vehicle={vehicle} />;
  } else if (step === "documents") {
    body = <DocumentsStep />;
  }

  return (
    <Card className="p-5 sm:p-8">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Welcome to the Team</h1>
        <p className="text-sm text-gray-500">Let&apos;s set up your partner profile.</p>
      </div>
      <div className="my-6 sm:my-7">
        <Stepper steps={steps.map((s) => ({ id: s.id, title: s.title }))} current={current} />
      </div>
      <h2 className="mb-1 text-lg font-semibold text-ink-900">{meta.title}</h2>
      {meta.subtitle ? <p className="mb-5 text-sm text-gray-500">{meta.subtitle}</p> : null}
      {body}
    </Card>
  );
}
