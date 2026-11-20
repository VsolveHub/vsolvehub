"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, VOLATILE_STATE, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type OperationsServiceArea = Schemas["OperationsServiceAreaList"];
export type OperationsServiceAreaDetail = Schemas["OperationsServiceAreaDetail"];
export type OperationsBulkPinPreviewResult = Schemas["OperationsBulkPinPreviewResult"];
export type AreaTargets = Schemas["OperationsAreaTargets"];
export type BulkPinRow = Schemas["OperationsBulkPinRowRequest"];
export type OperationsBulkPinConflict = Schemas["OperationsBulkPinConflict"];

export function useServiceAreas() {
  return useQuery({
    queryKey: queryKeys.operations.serviceAreas(),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/service-areas/"),
      ),
    ...SESSION_STATE,
  });
}

export function useServiceAreaDetail(areaId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.serviceArea(areaId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/service-areas/{area_id}/", {
          params: { path: { area_id: areaId as string } },
        }),
      ),
    enabled: Boolean(areaId),
    ...VOLATILE_STATE,
  });
}

export function useCreateServiceArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      slug: string;
      name: string;
      zone?: string;
      state_code?: string;
      timezone?: string;
      is_accepting_partners?: boolean;
      is_active?: boolean;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/service-areas/", {
          body: {
            slug: body.slug,
            name: body.name,
            zone: body.zone ?? "",
            state_code: body.state_code ?? "TG",
            timezone: body.timezone ?? "Asia/Kolkata",
            is_accepting_partners: body.is_accepting_partners ?? true,
            is_active: body.is_active ?? true,
          },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.reference.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useUpdateServiceArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      areaId,
      body,
    }: {
      areaId: string;
      body: {
        name?: string;
        zone?: string;
        state_code?: string;
        is_accepting_partners?: boolean;
        is_active?: boolean;
      };
    }) =>
      request(() =>
        getApiClient().PATCH("/api/v1/operations/service-areas/{area_id}/", {
          params: { path: { area_id: areaId } },
          body,
        }),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operations.serviceArea(variables.areaId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.reference.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useAddPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      areaId,
      postalCode,
      city,
      state,
    }: {
      areaId: string;
      postalCode: string;
      /** Needed only for a PIN we have never loaded. */
      city?: string;
      state?: string;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/service-areas/{area_id}/pins/", {
          params: { path: { area_id: areaId } },
          body: {
            postal_code: postalCode,
            ...(city ? { city } : {}),
            ...(state ? { state } : {}),
          },
        }),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operations.serviceArea(variables.areaId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useRemovePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      areaId,
      postalCode,
    }: {
      areaId: string;
      postalCode: string;
    }) =>
      request(() =>
        getApiClient().DELETE(
          "/api/v1/operations/service-areas/{area_id}/pins/{postal_code}/",
          {
            params: {
              path: {
                area_id: areaId,
                postal_code: postalCode,
              },
            },
          },
        ),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operations.serviceArea(variables.areaId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useToggleService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      areaId,
      variantId,
      variantIds,
      isActive,
    }: {
      areaId: string;
      variantId?: string;
      variantIds?: string[];
      isActive: boolean;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/service-areas/{area_id}/services/", {
          params: { path: { area_id: areaId } },
          body: {
            ...(variantId ? { variant_id: variantId } : {}),
            ...(variantIds ? { variant_ids: variantIds } : {}),
            is_active: isActive,
          },
        }),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operations.serviceArea(variables.areaId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.serviceAreas() });
    },
  });
}

export function useBulkPinPreview() {
  return useMutation({
    mutationFn: (body: { csv_content?: string; rows?: BulkPinRow[] }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/service-areas/bulk-pins/preview/", {
          body: {
            csv_content: body.csv_content ?? "",
            ...(body.rows ? { rows: body.rows } : {}),
          },
        }),
      ),
  });
}

export function useBulkPinApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      csv_content?: string;
      rows?: BulkPinRow[];
      conflict_resolutions?: Record<string, "MOVE" | "SKIP">;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/service-areas/bulk-pins/apply/", {
          body: {
            csv_content: body.csv_content ?? "",
            ...(body.rows ? { rows: body.rows } : {}),
            conflict_resolutions: body.conflict_resolutions,
          },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.serviceAreas() });
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useAreaTargets(areaId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.areaTargets(areaId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/service-areas/{area_id}/targets/", {
          params: { path: { area_id: areaId as string } },
        }),
      ),
    enabled: Boolean(areaId),
    ...VOLATILE_STATE,
  });
}

export function useUpdateAreaTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      areaId,
      overall,
      trades,
    }: {
      areaId: string;
      overall: { target_partners: number | null; alert_below: number | null };
      trades: { skill_code: string; target_partners: number | null; alert_below: number | null }[];
    }) =>
      request(() =>
        getApiClient().PUT("/api/v1/operations/service-areas/{area_id}/targets/", {
          params: { path: { area_id: areaId } },
          body: { overall, trades },
        }),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.areaTargets(variables.areaId) });
      // Coverage flags and the recruitment list depend on targets.
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}
