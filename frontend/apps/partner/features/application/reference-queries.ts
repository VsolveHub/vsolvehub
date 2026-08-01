"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { STATIC_CONTENT, queryKeys } from "@vsolve/query";
import { useQueries } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The reference data an applicant chooses from.
 *
 * ## Why these replaced a catalog walk
 *
 * Before contract 1.4.0 nothing published Partner skills, so the trade list was
 * derived by walking the public catalog — one request per category, then one per
 * service, then collecting the distinct `required_skill_code` values. That was a
 * waterfall whose cost grew with the catalog, and it could only ever produce a
 * label guessed from the slug: `electrical` became "Electrical", and anything
 * hyphenated or abbreviated read badly.
 *
 * `GET /api/v1/partner/skills/` publishes the canonical set with real names and
 * descriptions. The catalog walk is gone.
 *
 * ## Freshness and keys
 *
 * All three are the same for every applicant, so they sit under `reference.*`
 * rather than `partner.*` — saving an application must not invalidate them, and
 * they carry `STATIC_CONTENT` because Operations publishing a new area or a new
 * consent version is not something a form needs within seconds.
 *
 * They are fetched with `useQueries` so the three run together. Requesting them
 * in sequence would rebuild, at the hook layer, exactly the waterfall the new
 * endpoints removed.
 */

export type ServiceArea = Schemas["ServiceArea"];
export type PartnerSkill = Schemas["PartnerSkillOption"];
export type RequiredConsent = Schemas["PartnerConsentDocument"];

export interface ApplicationReference {
  serviceAreas: ServiceArea[];
  skills: PartnerSkill[];
  requiredConsents: RequiredConsent[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useApplicationReference(): ApplicationReference {
  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.reference.serviceAreas(),
        queryFn: () => request(() => getApiClient().GET("/api/v1/service-areas/")),
        ...STATIC_CONTENT,
      },
      {
        queryKey: queryKeys.reference.partnerSkills(),
        queryFn: () => request(() => getApiClient().GET("/api/v1/partner/skills/")),
        ...STATIC_CONTENT,
      },
      {
        queryKey: queryKeys.reference.requiredConsents(),
        queryFn: () => request(() => getApiClient().GET("/api/v1/partner/required-consents/")),
        ...STATIC_CONTENT,
      },
    ],
  });

  const [areas, skills, consents] = results;

  return {
    serviceAreas: areas?.data ?? [],
    skills: skills?.data ?? [],
    requiredConsents: consents?.data ?? [],
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    refetch: () => {
      for (const result of results) void result.refetch();
    },
  };
}
