"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type OperationsCoverageLite = Schemas["OperationsCoverageLite"];
export type OperationsCoverageLiteArea = Schemas["OperationsCoverageLiteArea"];
export type OperationsCoverageLiteSummary = Schemas["OperationsCoverageLiteSummary"];

export interface CoverageFilters {
  zone?: string;
  trade?: string;
}

export function useCoverageLite(filters: CoverageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.operations.coverageLite(filters),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/coverage-lite/", {
          params: {
            query: {
              ...(filters.zone && filters.zone !== "ALL" ? { zone: filters.zone } : {}),
              ...(filters.trade && filters.trade !== "ALL" ? { trade: filters.trade } : {}),
            },
          },
        }),
      ),
    ...SESSION_STATE,
  });
}
