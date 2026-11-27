/**
 * The rules of partner onboarding's "Your work" step, shared by the website and the phone apps.
 *
 * They were two copies, ported by hand, and had already drifted: the website added the required
 * trades a ticked service needs, the phone did not. Platform-neutral on purpose (no React, no
 * browser or native APIs), so both apps import the same functions and cannot disagree.
 *
 * ## The shape of the catalogue
 *
 * A trade category ("Technician") has services ("Gas Stove Repair"), and a service has variants
 * ("2 burner", "3 burner", "4 burner and above"). The application stores variant ids. A partner
 * chooses the work they do, not the size of the stove, so the step shows services and ticking one
 * takes all of its variants.
 */

import { request, type ApiClient, type Schemas } from "@vsolve/api-client";

type PartnerSkill = Schemas["PartnerSkillOption"];

/* -------------------------------------------------------------------------
   Tracks
   ------------------------------------------------------------------------- */

/**
 * What the partner signed up to do, as the server records it on the application.
 *
 * `STAY_HOST` lists a property, `RENTAL_OWNER` lists items for rent, `EMPLOYER` hires staff and
 * `RIDE_CAPTAIN` drives for Rides. Trades, service areas and working hours describe travelling to a
 * customer, so none of the four sees those steps.
 */
export type ApplicationTrack =
  | "SERVICES"
  | "STAY_HOST"
  | "RENTAL_OWNER"
  | "EMPLOYER"
  | "RIDE_CAPTAIN";

/**
 * Stays, rentals, hiring and ride captains share the short application, as the server does.
 * Services walk the full list.
 */
export function isListingTrack(track?: string | null): boolean {
  return (
    track === "STAY_HOST" ||
    track === "RENTAL_OWNER" ||
    track === "EMPLOYER" ||
    track === "RIDE_CAPTAIN"
  );
}

/* -------------------------------------------------------------------------
   The catalogue, in one read
   ------------------------------------------------------------------------- */

export interface MainCategory {
  id: string;
  slug: string;
  name: string;
  iconKey: string;
  imageUrl: string;
}

/** One variant of a service, flattened with the names the screen needs. */
export interface OfferableService {
  /** The service these variants belong to ("Gas Stove Repair"). */
  serviceId: string;
  variantId: string;
  variantCode: string;
  variantName: string;
  serviceName: string;
  categoryName: string;
  requiredSkillCode: string;
}

export interface WorkCatalog {
  mainCategories: MainCategory[];
  services: OfferableService[];
}

type WorkCategoryPayload = Schemas["PartnerWorkCategory"];

/**
 * The server's trades, each with its services and variants, as the rows the screen works with.
 *
 * Django already leaves out the categories that are their own way to join (stays, rentals,
 * hiring, crew work), so nothing is filtered here.
 */
export function workCatalogFrom(categories: readonly WorkCategoryPayload[]): WorkCatalog {
  return {
    mainCategories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      iconKey: category.icon_key,
      imageUrl: category.image_url,
    })),
    services: categories.flatMap((category) =>
      category.services.flatMap((service) =>
        service.variants.map((variant) => ({
          serviceId: service.id,
          variantId: variant.id,
          variantCode: variant.code,
          variantName: variant.name,
          serviceName: service.name,
          categoryName: category.name,
          requiredSkillCode: variant.required_skill_code,
        })),
      ),
    ),
  };
}

/** One request, however many services there are. It used to be one per category and per service. */
export async function fetchWorkCatalog(api: ApiClient): Promise<WorkCatalog> {
  const categories = await request(() => api.GET("/api/v1/partner/work-catalog/"));
  return workCatalogFrom(categories);
}

/* -------------------------------------------------------------------------
   Trade categories (ticked through their skill)
   ------------------------------------------------------------------------- */

/** The minimum the skill mapping needs, so a screen's richer category type fits too. */
export interface CategoryRef {
  slug: string;
  name: string;
}

/**
 * The skill a main category is ticked through. Slug to skill code where the catalog and the skill
 * list do not share a name.
 */
const PRIMARY_SKILL_BY_CATEGORY_SLUG: Record<string, string> = {
  technician: "carpenter",
  electrician: "electrician",
  plumber: "plumber",
  "ac-services": "ac-technician",
  beautician: "face-care",
  "home-services": "home-cleaning",
  "pet-services": "pet-grooming",
  construction: "construction-helper",
  events: "event-staff",
};

export function findSkillForCategory(
  skills: readonly PartnerSkill[],
  category: CategoryRef,
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

/**
 * Categories that can actually be ticked. A category is ticked through its skill, so one with no
 * skill behind it could never be ticked: leave it out rather than show a checkbox that does
 * nothing.
 */
export function tickableCategories<Category extends CategoryRef>(
  categories: readonly Category[],
  skills: readonly PartnerSkill[],
): Category[] {
  return categories.filter((category) => findSkillForCategory(skills, category) !== undefined);
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
  category: CategoryRef,
  skills: readonly PartnerSkill[],
  selectedSkillCodes: readonly string[],
): boolean {
  const skill = findSkillForCategory(skills, category);
  return skill !== undefined && selectedSkillCodes.includes(skill.code);
}

/** Ticking a trade adds its skill; unticking removes the skill and every service under it. */
export function toggleTradeCategorySelection(
  category: CategoryRef,
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

  return {
    skillCodes: skill
      ? Array.from(new Set([...selectedSkillCodes, skill.code]))
      : [...selectedSkillCodes],
    serviceVariantIds: [...selectedVariantIds],
  };
}

export function selectedTradeCategories<Category extends CategoryRef>(
  mainCategories: readonly Category[],
  skills: readonly PartnerSkill[],
  selectedSkillCodes: readonly string[],
): Category[] {
  return mainCategories.filter((category) =>
    isTradeCategorySelected(category, skills, selectedSkillCodes),
  );
}

/* -------------------------------------------------------------------------
   Services: what the screen shows and ticks
   ------------------------------------------------------------------------- */

/**
 * One service ("Gas Stove Repair") with every variant under it ("2 burner", "3 burner", "4 burner
 * and above"). The screen lists these, not the variants: many variants are just called "Standard
 * service", and ticking each size listed hundreds of rows.
 */
export interface ServiceGroup {
  serviceId: string;
  serviceName: string;
  categoryName: string;
  variantIds: string[];
  /** Skills the variants need, without blanks or repeats. */
  requiredSkillCodes: string[];
}

/** Groups variants by their service, keeping the order the catalogue gave them. */
export function groupByService(
  services: readonly {
    serviceId: string;
    serviceName: string;
    categoryName: string;
    variantId: string;
    requiredSkillCode: string;
  }[],
): ServiceGroup[] {
  const groups = new Map<string, ServiceGroup>();
  for (const service of services) {
    const key = `${service.categoryName}::${service.serviceId}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        categoryName: service.categoryName,
        variantIds: [],
        requiredSkillCodes: [],
      };
      groups.set(key, group);
    }
    group.variantIds.push(service.variantId);
    if (
      service.requiredSkillCode.length > 0 &&
      !group.requiredSkillCodes.includes(service.requiredSkillCode)
    ) {
      group.requiredSkillCodes.push(service.requiredSkillCode);
    }
  }
  return [...groups.values()];
}

/**
 * A service counts as chosen when any of its variants is. An application saved before services
 * were shown, with only "2 burner" ticked, still reads as doing Gas Stove Repair.
 */
export function isServiceGroupSelected(
  group: Pick<ServiceGroup, "variantIds">,
  selectedVariantIds: readonly string[],
): boolean {
  return group.variantIds.some((id) => selectedVariantIds.includes(id));
}

/** Ticking takes every variant of the service; unticking drops them all. */
export function toggleServiceGroup(
  group: Pick<ServiceGroup, "variantIds">,
  selectedVariantIds: readonly string[],
): string[] {
  if (isServiceGroupSelected(group, selectedVariantIds)) {
    return selectedVariantIds.filter((id) => !group.variantIds.includes(id));
  }
  return Array.from(new Set([...selectedVariantIds, ...group.variantIds]));
}

/**
 * Keeps the skills a selected service needs on the application.
 *
 * A main category maps to one skill (Technician to `carpenter`), but the services under it each
 * name their own: CCTV installation needs `cctv-technician`. Ticking one used to leave that skill
 * off, and Django refused the save with "Select the required skills for: cctv-technician", which
 * the applicant had no control on this screen to fix.
 *
 * A skill is added when a variant needing it is selected and removed again when the last such
 * variant goes, unless it is some category's own skill, which belongs to the category checkbox.
 * Codes Django does not offer are never added; the screen flags those instead.
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
