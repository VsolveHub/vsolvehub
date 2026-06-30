import { redirect } from "next/navigation";
import { prisma } from "@vsolve/db";
import { Card, Stepper } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { formSteps, isValidStep, stepIndex } from "@/lib/onboarding";
import { IdentityStep } from "../steps/identity-step";
import { SkillsStep } from "../steps/skills-step";
import { VehicleStep } from "../steps/vehicle-step";
import { DocumentsStep } from "../steps/documents-step";

export default async function WizardStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const partner = await requirePartner();
  if (partner.status !== "DRAFT") redirect("/live");
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
      <IdentityStep
        fullName={partner.fullName}
        gender={partner.gender}
        showGender={type === "CLEANER"}
      />
    );
  } else if (step === "skills") {
    const [skills, cities, mine] = await Promise.all([
      prisma.skill.findMany({ orderBy: { name: "asc" } }),
      prisma.city.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.partnerSkill.findMany({ where: { partnerId: partner.id } }),
    ]);
    body = (
      <SkillsStep
        skills={skills}
        cities={cities}
        selectedSkillIds={mine.map((m) => m.skillId)}
        cityId={partner.cityId}
      />
    );
  } else if (step === "vehicle") {
    const vehicle = await prisma.vehicle.findUnique({ where: { partnerId: partner.id } });
    body = <VehicleStep vehicle={vehicle} />;
  } else if (step === "documents") {
    body = <DocumentsStep />;
  }

  return (
    <Card className="p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink-900">Welcome to the Team</h1>
        <p className="text-sm text-gray-500">Let&apos;s set up your partner profile.</p>
      </div>
      <div className="my-7">
        <Stepper steps={steps.map((s) => ({ id: s.id, title: s.title }))} current={current} />
      </div>
      <h2 className="mb-1 text-lg font-semibold text-ink-900">{meta.title}</h2>
      {meta.subtitle ? <p className="mb-5 text-sm text-gray-500">{meta.subtitle}</p> : null}
      {body}
    </Card>
  );
}
