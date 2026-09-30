import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@/lib/api/browser";

// ---------------------------------------------------------------------------
// Typed shapes
// ---------------------------------------------------------------------------

export interface ReportEntry {
  id: string;
  name: string;
  /** Filter keys the backend accepts for this report, e.g. ["date_start","date_end","status"] */
  filters: string[];
  description?: string;
}

export interface ReportPreview {
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows_count: number;
  totals?: Record<string, number>;
}

export interface ReportPreset {
  id: string | number;
  name: string;
  report_id: string;
  filters_json: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Loose api helper (until generated client gains typed ops endpoints)
// ---------------------------------------------------------------------------

function looseApi(): {
  GET: (path: string) => Promise<unknown>;
  POST: (path: string, init?: { body?: unknown }) => Promise<unknown>;
} {
  return getApiClient() as unknown as {
    GET: (path: string) => Promise<unknown>;
    POST: (path: string, init?: { body?: unknown }) => Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const reportKeys = {
  catalog: ["ops-reports-catalog"] as const,
  presets: ["ops-reports-presets"] as const,
  preview: (reportId: string, filters: Record<string, string>) =>
    ["ops-report-preview", reportId, filters] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useReportsCatalog() {
  return useQuery<ReportEntry[]>({
    queryKey: reportKeys.catalog,
    queryFn: () =>
      request(() => looseApi().GET("/api/v1/ops/reports/") as never) as Promise<ReportEntry[]>,
  });
}

export function useReportPreview(reportId: string, filters: Record<string, string>) {
  return useQuery<ReportPreview>({
    queryKey: reportKeys.preview(reportId, filters),
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      return request(
        () =>
          looseApi().GET(`/api/v1/ops/reports/${reportId}/?${params.toString()}`) as never,
      ) as Promise<ReportPreview>;
    },
    enabled: !!reportId,
  });
}

export function useReportsPresets() {
  return useQuery<ReportPreset[]>({
    queryKey: reportKeys.presets,
    queryFn: () =>
      request(() => looseApi().GET("/api/v1/ops/reports/presets/") as never) as Promise<
        ReportPreset[]
      >,
  });
}

export function useSavePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      report_id: string;
      filters_json: Record<string, string>;
    }) =>
      request(
        () => looseApi().POST("/api/v1/ops/reports/presets/", { body }) as never,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.presets });
    },
  });
}
