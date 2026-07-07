// Shared partner ↔ service skill-matching — the single implementation used by both
// the push-dispatch engine and the "choose a professional" provider list, so the
// customer only ever sees partners who can actually do the job.

/** Prisma include that loads everything the matcher needs. */
export const partnerMatchInclude = {
  trade: { select: { slug: true } },
  skills: { include: { skill: { select: { slug: true } } } },
} as const;

export type MatchablePartner = {
  trade: { slug: string } | null;
  skills: { skill: { slug: string } }[];
};

export type ServiceIdentity = {
  slug: string;
  subCategory: { slug: string } | null;
};

/**
 * A partner is eligible for a service only if their trade or one of their skills
 * matches it: trade slug === service sub-category slug (e.g. "electrician"), or a
 * PartnerSkill slug === the specific service slug (e.g. "switch-socket-repair").
 * This is what stops an online pet-groomer from being offered an electrician job.
 * If the service has no sub-category identity, fall back to trade-agnostic matching.
 */
export function partnerMatchesService(partner: MatchablePartner, service: ServiceIdentity): boolean {
  const subSlug = service.subCategory?.slug;
  if (!subSlug) return true;
  if (partner.trade?.slug === subSlug) return true;
  return partner.skills.some((s) => s.skill.slug === service.slug || s.skill.slug === subSlug);
}
