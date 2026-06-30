import { prisma } from "@vsolve/db";
import { Card } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { SkillsForm } from "./skills-form";

export default async function SkillsPage() {
  const partner = await requirePartner();
  const [skills, cities, mine] = await Promise.all([
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.partnerSkill.findMany({ where: { partnerId: partner.id } }),
  ]);

  return (
    <div>
      <PageHeader title="Skills & Service Area" subtitle="Update what you do and where you work." />
      <Card>
        <SkillsForm
          skills={skills}
          cities={cities}
          selectedSkillIds={mine.map((m) => m.skillId)}
          cityId={partner.cityId}
        />
      </Card>
    </div>
  );
}
