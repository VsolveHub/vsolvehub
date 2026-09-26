"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Partner management.
 *
 * ## Why this is not the review queue
 *
 * `operations/partner-applications/` is a worklist: it defaults to the three in-review statuses
 * and orders by how long somebody has waited. It cannot answer "who works for us", because an
 * approved Partner is invisible in it by design. This directory lists everyone — approved,
 * suspended and offboarded included — ordered by name.
 *
 * Deciding on an application still belongs to the review surface, behind its own audit. This
 * one finds people and shows their record.
 *
 * ## Skills filter as a union
 *
 * Picking Electrical and Plumbing here means "show me either", which is how a person reads a
 * multi-select. The intersection reading — a visit needing every skill at once — belongs to
 * dispatch, and the server keeps the two apart deliberately.
 */

export type PartnerDirectoryRow = Schemas["OperationsPartnerDirectoryItem"];
export type PartnerRecord = Schemas["OperationsPartnerDetail"];
export type PartnerApplicationStatus = PartnerDirectoryRow["application_status"];

export interface PartnerDirectoryFilters {
  status?: string;
  skills?: string[];
}

export function usePartnerDirectory(filters: PartnerDirectoryFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.operations.partnerDirectory(filters),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/operations/partners/", {
          params: {
            query: {
              ...(filters.status ? { status: filters.status } : {}),
              // Repeated rather than comma-joined: the server reads `getlist`, so
              // `?skill=a&skill=b` is the shape it filters on.
              ...(filters.skills?.length ? { skill: filters.skills } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      );
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    ...EXPIRING_STATE,
  });
}

export function usePartnerRecord(partnerId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.partnerRecord(partnerId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/partners/{partner_id}/", {
          params: { path: { partner_id: partnerId! } },
        }),
      ),
    enabled: partnerId !== null,
    ...EXPIRING_STATE,
  });
}

/**
 * The skill vocabulary the filter offers.
 *
 * Read from the server rather than hardcoded. A fixed list here would drift the first time a
 * skill was added, and the filter would silently stop offering it — the same reason case
 * resolutions are published per case rather than mapped in the console.
 */
export function usePartnerSkills() {
  return useQuery({
    queryKey: [...queryKeys.operations.all, "partner-skills"] as const,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/skills/", {})),
    staleTime: 5 * 60_000,
  });
}
