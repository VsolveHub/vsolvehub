import "server-only";
import { prisma } from "@vsolve/db";

export type SkillOption = { id: string; name: string };

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getSkillOptionsForTrade(
  tradeSlug: string | null | undefined,
  tradeName?: string | null,
): Promise<SkillOption[]> {
  if (!tradeSlug) {
    return prisma.skill.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  }

  const services = await prisma.service.findMany({
    where: { subCategory: { slug: tradeSlug } },
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });

  const source = services.length > 0 ? services : [{ slug: tradeSlug, name: tradeName ?? titleFromSlug(tradeSlug) }];
  const rows = await Promise.all(
    source.map((service) =>
      prisma.skill.upsert({
        where: { slug: service.slug },
        update: { name: service.name },
        create: { slug: service.slug, name: service.name },
        select: { id: true, name: true },
      }),
    ),
  );

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function filterSkillIdsForTrade(
  skillIds: string[],
  tradeSlug: string | null | undefined,
): Promise<string[]> {
  if (!tradeSlug) return skillIds;
  const allowed = await getSkillOptionsForTrade(tradeSlug);
  const allowedIds = new Set(allowed.map((skill) => skill.id));
  return skillIds.filter((skillId) => allowedIds.has(skillId));
}
