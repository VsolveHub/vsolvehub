import type { MainCategory } from "@/features/catalog/queries";
import type { PartnerSkill } from "../reference-queries";

/** Canonical skill for each main catalog category slug from the backend. */
const PRIMARY_SKILL_BY_CATEGORY_SLUG: Record<string, string> = {
  // A10 hiring partners — seeded by `seed_listing_catalog` (not a field trade).
  "career-jobs": "career-jobs",
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

export function isTradeCategorySelected(
  category: MainCategory,
  skills: readonly PartnerSkill[],
  selectedSkillCodes: readonly string[],
): boolean {
  const skill = findSkillForCategory(skills, category);
  return skill !== undefined && selectedSkillCodes.includes(skill.code);
}

export function toggleTradeCategorySelection(
  category: MainCategory,
  skills: readonly PartnerSkill[],
  services: readonly { categoryName: string; variantId: string }[],
  selectedSkillCodes: readonly string[],
  selectedVariantIds: readonly string[],
): { skillCodes: string[]; serviceVariantIds: string[] } {
  const variantIds = variantIdsForCategory(category.name, services);
  const skill = findSkillForCategory(skills, category);
  const selected = isTradeCategorySelected(category, skills, selectedSkillCodes);

  if (selected) {
    return {
      skillCodes: skill
        ? selectedSkillCodes.filter((code) => code !== skill.code)
        : [...selectedSkillCodes],
      serviceVariantIds: selectedVariantIds.filter((id) => !variantIds.includes(id)),
    };
  }

  // Career/Jobs has a single apply-facing hiring variant — select it with the
  // category so Save and Continue is not blocked waiting for a nested tick.
  const attachVariants =
    category.slug.toLowerCase() === "career-jobs" && variantIds.length > 0;

  return {
    skillCodes: skill
      ? Array.from(new Set([...selectedSkillCodes, skill.code]))
      : [...selectedSkillCodes],
    serviceVariantIds: attachVariants
      ? Array.from(new Set([...selectedVariantIds, ...variantIds]))
      : [...selectedVariantIds],
  };
}

export function selectedTradeCategories(
  mainCategories: readonly MainCategory[],
  skills: readonly PartnerSkill[],
  selectedSkillCodes: readonly string[],
): MainCategory[] {
  return mainCategories.filter((category) =>
    isTradeCategorySelected(category, skills, selectedSkillCodes),
  );
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

/**
 * Keeps the skills a selected job type needs on the application.
 *
 * A main category maps to one skill (Technician to `carpenter`), but the job
 * types under it each name their own — CCTV installation needs
 * `cctv-technician`. Ticking a job type used to leave that skill off, and Django
 * refused the save with "Select the required skills for: cctv-technician",
 * which the applicant had no control on this screen to fix.
 *
 * A job type's skill is added when it is selected and removed again when the
 * last job type needing it goes, unless it is some category's own skill — that
 * one belongs to the category checkbox. Codes Django does not offer are never
 * added; the screen flags those instead.
 */
export function syncRequiredSkills({
  skillCodes,
  previousVariantIds,
  nextVariantIds,
  services,
  skills,
  categorySkillCodes,
}: {
  skillCodes: readonly string[];
  previousVariantIds: readonly string[];
  nextVariantIds: readonly string[];
  services: readonly { variantId: string; requiredSkillCode: string }[];
  skills: readonly PartnerSkill[];
  categorySkillCodes: readonly string[];
}): string[] {
  const offered = new Set(skills.map((skill) => skill.code));
  const requiredBy = (ids: readonly string[]) =>
    new Set(
      services
        .filter((service) => ids.includes(service.variantId))
        .map((service) => service.requiredSkillCode)
        .filter((code) => code.length > 0 && offered.has(code)),
    );

  const before = requiredBy(previousVariantIds);
  const after = requiredBy(nextVariantIds);
  const kept = skillCodes.filter(
    (code) => !before.has(code) || after.has(code) || categorySkillCodes.includes(code),
  );
  return Array.from(new Set([...kept, ...after]));
}
