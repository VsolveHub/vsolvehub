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
  "rental-services": "tools-machinery",
  "rooms-pg-hostel": "property-host",
  stays: "property-host",
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

  if (slug.includes("rental")) {
    const rentalSkill = skills.find(
      (s) =>
        s.code === "tools-machinery" ||
        s.code.includes("rental") ||
        s.name.toLowerCase().includes("rental"),
    );
    if (rentalSkill) return rentalSkill;
  }

  if (
    slug.includes("stay") ||
    slug.includes("room") ||
    slug.includes("hostel") ||
    slug.includes("pg") ||
    categoryName.includes("stay") ||
    categoryName.includes("room") ||
    categoryName.includes("hostel")
  ) {
    const staySkill = skills.find(
      (s) =>
        s.code === "property-host" ||
        s.code.includes("stay") ||
        s.code.includes("property") ||
        s.name.toLowerCase().includes("host") ||
        s.name.toLowerCase().includes("accommodation"),
    );
    if (staySkill) return staySkill;
  }

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
  services: readonly { categoryName: string; variantId: string; requiredSkillCode?: string }[],
  selectedSkillCodes: readonly string[],
  selectedVariantIds: readonly string[],
): { skillCodes: string[]; serviceVariantIds: string[] } {
  const categoryServices = services.filter((service) => service.categoryName === category.name);
  const variantIds = categoryServices.map((s) => s.variantId);
  const categorySkills = categoryServices
    .map((s) => s.requiredSkillCode)
    .filter((code): code is string => Boolean(code && code.length > 0));
  const skill = findSkillForCategory(skills, category);
  const selected = isTradeCategorySelected(category, skills, selectedSkillCodes);

  if (selected) {
    return {
      skillCodes: selectedSkillCodes.filter(
        (code) => code !== skill?.code && !categorySkills.includes(code),
      ),
      serviceVariantIds: selectedVariantIds.filter((id) => !variantIds.includes(id)),
    };
  }

  const newSkillCodes = new Set(selectedSkillCodes);
  if (skill) newSkillCodes.add(skill.code);
  for (const code of categorySkills) {
    newSkillCodes.add(code);
  }

  return {
    skillCodes: Array.from(newSkillCodes),
    serviceVariantIds: [...selectedVariantIds],
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
