import type { MainCategory } from "@/features/catalog/queries";
import type { PartnerSkill } from "../reference-queries";

/** Canonical skill for each main catalog category slug from the backend. */
const PRIMARY_SKILL_BY_CATEGORY_SLUG: Record<string, string> = {
  technician: "carpenter",
  electrician: "electrician",
  plumber: "plumber",
  "ac-services": "ac-technician",
  beautician: "face-care",
  "home-services": "home-cleaning",
  "pet-services": "pet-grooming",
  construction: "construction-helper",
};

/** Map a backend main category to the canonical skill applicants select as a trade. */
export function findSkillForCategory(
  skills: readonly PartnerSkill[],
  category: MainCategory,
): PartnerSkill | undefined {
  const preferredCode = PRIMARY_SKILL_BY_CATEGORY_SLUG[category.slug.toLowerCase()];
  if (preferredCode) {
    const preferred = skills.find((skill) => skill.code === preferredCode);
    if (preferred) return preferred;
  }

  const slug = category.slug.toLowerCase();
  const categoryName = category.name.toLowerCase();

  const byCode = skills.find((skill) => skill.code.toLowerCase() === slug);
  if (byCode) return byCode;

  const byName = skills.find((skill) => skill.name.toLowerCase() === categoryName);
  if (byName) return byName;

  return skills.find((skill) => {
    const code = skill.code.toLowerCase();
    return code.includes(slug) || slug.includes(code);
  });
}

export function variantIdsForCategory(
  categoryName: string,
  services: readonly { categoryName: string; variantId: string }[],
): string[] {
  return services
    .filter((service) => service.categoryName === categoryName)
    .map((service) => service.variantId);
}

export function isCategorySelected(
  category: MainCategory,
  skills: readonly PartnerSkill[],
  services: readonly { categoryName: string; variantId: string }[],
  selectedSkillCodes: readonly string[],
  selectedVariantIds: readonly string[],
): boolean {
  const variantIds = variantIdsForCategory(category.name, services);
  if (variantIds.length > 0) {
    return variantIds.every((id) => selectedVariantIds.includes(id));
  }

  const skill = findSkillForCategory(skills, category);
  return skill !== undefined && selectedSkillCodes.includes(skill.code);
}

export function toggleCategorySelection(
  category: MainCategory,
  skills: readonly PartnerSkill[],
  services: readonly { categoryName: string; variantId: string }[],
  selectedSkillCodes: readonly string[],
  selectedVariantIds: readonly string[],
): { skillCodes: string[]; serviceVariantIds: string[] } {
  const variantIds = variantIdsForCategory(category.name, services);
  const skill = findSkillForCategory(skills, category);
  const selected = isCategorySelected(
    category,
    skills,
    services,
    selectedSkillCodes,
    selectedVariantIds,
  );

  if (selected) {
    return {
      skillCodes: skill
        ? selectedSkillCodes.filter((code) => code !== skill.code)
        : [...selectedSkillCodes],
      serviceVariantIds: selectedVariantIds.filter((id) => !variantIds.includes(id)),
    };
  }

  return {
    skillCodes: skill
      ? Array.from(new Set([...selectedSkillCodes, skill.code]))
      : [...selectedSkillCodes],
    serviceVariantIds: Array.from(new Set([...selectedVariantIds, ...variantIds])),
  };
}
