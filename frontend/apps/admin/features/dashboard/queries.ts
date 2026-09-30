import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@/lib/api/browser";

type LooseClient = {
  GET: (url: string) => Promise<{ data?: unknown; response: Response }>;
  PATCH: (url: string, opts?: { body?: unknown }) => Promise<{ data?: unknown; response: Response }>;
};

function looseApi(): LooseClient {
  return getApiClient() as unknown as LooseClient;
}

export interface DashboardPreference {
  pinned_tiles?: string[];
}

export const useDashboardPreference = () => {
  return useQuery({
    queryKey: ["ops-dashboard-preference"],
    queryFn: () => request(() => looseApi().GET("/api/v1/ops/dashboard-preferences/")) as Promise<DashboardPreference>,
  });
};

export const useUpdateDashboardPreference = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pinnedTiles: string[]) => 
      request(() => looseApi().PATCH("/api/v1/ops/dashboard-preferences/", {
        body: { pinned_tiles: pinnedTiles },
      })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-dashboard-preference"] });
    },
  });
};

export const useDashboardAggregates = (kind: string, dateStart?: string, dateEnd?: string) => {
  return useQuery({
    queryKey: ["ops-dashboard", kind, dateStart, dateEnd],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateStart) params.append("date_start", dateStart);
      if (dateEnd) params.append("date_end", dateEnd);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request(() => looseApi().GET(`/api/v1/ops/dashboards/${kind}/${suffix}`)) as Promise<Record<string, unknown>>;
    },
  });
};
