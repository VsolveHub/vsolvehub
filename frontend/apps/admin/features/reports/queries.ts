import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiRequestError, request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

/**
 * Reports, through the generated client. The server describes each report's filters and
 * columns, so this page never needs to know a report's fields in advance.
 */

export type ReportEntry = Schemas["OpsReportCatalogItem"];
export type ReportFilter = Schemas["OpsReportFilter"];
export type ReportOption = Schemas["OpsReportOption"];
export type ReportColumn = Schemas["OpsReportColumn"];
export type ReportTotal = Schemas["OpsReportTotal"];
export type ReportPreview = Schemas["OpsReportPreviewResponse"];
export type ReportPreset = Schemas["OpsReportPreset"];
export type ReportRow = Record<string, unknown>;

/** Filters, search and sort: the report's whole query, as it sits in the address bar. */
export type ReportQuery = Record<string, string>;

export const PAGE_SIZE = 50;

const reportKeys = {
  catalog: ["ops-reports-catalog"] as const,
  presets: ["ops-reports-presets"] as const,
  preview: (reportId: string, query: ReportQuery) => ["ops-report-preview", reportId, query] as const,
  partners: (term: string, ids: string[]) => ["ops-report-partners", term, ids] as const,
};

function clean(query: ReportQuery): ReportQuery {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value));
}

export function useReportsCatalog() {
  return useQuery({
    queryKey: reportKeys.catalog,
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/reports/")),
    staleTime: 5 * 60_000,
  });
}

/** One report, a page at a time; "Show more" asks for the next page. */
export function useReportPreview(reportId: string, query: ReportQuery) {
  const params = clean(query);
  return useInfiniteQuery({
    queryKey: reportKeys.preview(reportId, params),
    queryFn: ({ pageParam }) =>
      request(() =>
        getApiClient().GET("/api/v1/ops/reports/{report_id}/", {
          params: {
            path: { report_id: reportId },
            query: { ...params, limit: PAGE_SIZE, offset: pageParam } as never,
          },
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last: ReportPreview) => {
      const next = last.offset + last.rows.length;
      return next < last.total_rows_count ? next : undefined;
    },
    enabled: Boolean(reportId),
    // Keep the last result on screen while a new filter loads, instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

/** Partners by name or phone, or by id to name one already chosen. */
export function usePartnerOptions(term: string, ids: string[] = []) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: reportKeys.partners(trimmed, ids),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/ops/reports/partner-options/", {
          params: { query: (ids.length ? { id: ids[0] } : { q: trimmed }) as never },
        }),
      ),
    enabled: trimmed.length >= 2 || ids.length > 0,
    staleTime: 60_000,
  });
}

export function useReportsPresets() {
  return useQuery({
    queryKey: reportKeys.presets,
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/reports/presets/")),
  });
}

export function useSavePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; report_id: string; filters_json: ReportQuery }) =>
      request(() => getApiClient().POST("/api/v1/ops/reports/presets/", { body: body as never })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: reportKeys.presets }),
  });
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

/**
 * Downloads a report file. Fetched rather than opened in a tab, so a refusal (too many rows,
 * a bad filter) comes back as a message the page can show instead of raw JSON in a new tab.
 */
export async function downloadReport(
  reportId: string,
  format: ExportFormat,
  query: ReportQuery,
): Promise<void> {
  const params = new URLSearchParams(clean(query));
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/reports/${reportId}.${format}?${params}`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(await exportRefusal(response));
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${reportId}.${format}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function exportRefusal(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; details?: unknown };
    };
    const details = body.error?.details;
    const first = Array.isArray(details)
      ? (details[0] as { message?: string } | undefined)?.message
      : details && typeof details === "object"
        ? (Object.values(details)[0] as { message?: string }[] | undefined)?.[0]?.message
        : undefined;
    return first ?? body.error?.message ?? "The file could not be made. Try again.";
  } catch {
    return response.status === 401 || response.status === 403
      ? "Your session ended. Sign in again."
      : "The file could not be made. Try again.";
  }
}

/** A field-level refusal from the preview (a filter value the server does not accept). */
export function filterProblem(error: unknown): string | null {
  if (!isApiRequestError(error)) return null;
  return error.message || null;
}
