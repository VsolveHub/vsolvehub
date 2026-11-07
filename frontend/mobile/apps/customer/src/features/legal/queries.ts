// Ported from frontend/apps/customer/features/legal/queries.ts
import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useQuery } from "@tanstack/react-query";

export type PublishedCancellationPolicy = Schemas["PublishedCancellationPolicy"];

export function useCancellationPolicy() {
  return useQuery({
    queryKey: ["legal", "cancellation-policy"] as const,
    queryFn: () =>
      request(() => getApiClient().GET("/api/v1/legal/cancellation-policy/")),
    staleTime: 300_000,
  });
}

