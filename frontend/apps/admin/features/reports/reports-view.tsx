"use client";

import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Spinner,
  StatCard,
  useToast,
  cn,
  formatMoney,
} from "@vsolve/ui";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import {
  useReportsCatalog,
  useReportPreview,
  useReportsPresets,
  useSavePreset,
  type ReportEntry,
  type ReportPreset,
} from "./queries";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts `created_at` → "Created", `total_amount_paise` → "Total amount" */
function humanize(key: string): string {
  return key
    .replace(/_paise$/i, "")
    .replace(/_/g, " ")
    .replace(/\bat\b/, "")
    .replace(/\bId\b/, "ID")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Detect whether a string value looks like a known status enum. */
const STATUS_WORDS = new Set([
  "active", "inactive", "pending", "completed", "cancelled", "open",
  "closed", "approved", "rejected", "submitted", "resolved", "escalated",
  "scheduled", "in_progress", "en_route", "failed", "paid", "processing",
  "verified", "uploaded", "missing", "published", "draft",
]);

function looksLikeStatus(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return STATUS_WORDS.has(value.toLowerCase());
}

// ---------------------------------------------------------------------------
// Small inner components
// ---------------------------------------------------------------------------

/** Horizontal pill switcher for the report catalog. */
function ReportSwitcher({
  reports,
  selectedId,
  onSelect,
}: {
  reports: ReportEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Report type"
      className="flex flex-wrap gap-2"
    >
      {reports.map((r) => (
        <button
          key={r.id}
          role="tab"
          aria-selected={selectedId === r.id}
          onClick={() => onSelect(r.id)}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            selectedId === r.id
              ? "bg-action text-action-text shadow-sm"
              : "border border-line bg-surface text-text-secondary hover:border-navy-700 hover:bg-surface-hover hover:text-text",
          )}
        >
          {r.name}
        </button>
      ))}
    </div>
  );
}

/** Single preset chip. */
function PresetChip({
  preset,
  onLoad,
}: {
  preset: ReportPreset;
  onLoad: (p: ReportPreset) => void;
}) {
  return (
    <button
      onClick={() => onLoad(preset)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        "border border-line bg-surface-hover text-text-secondary",
        "hover:border-navy-700 hover:bg-selected-surface hover:text-text",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      {preset.name}
    </button>
  );
}

/** Inline save-preset dialog (replaces prompt/alert). */
function SavePresetDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (name: string) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save filter preset"
      description="Give this combination of report and filters a name so you can reload it quickly."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={isSaving}
            loadingLabel="Saving preset"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
          >
            Save preset
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="py-2">
        <Field label="Preset name" showOptional={false}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Last week orders"
          />
        </Field>
      </form>
    </Dialog>
  );
}

/** Export button group. */
function ExportActions({
  disabled,
  onDownload,
}: {
  disabled: boolean;
  onDownload: (fmt: "csv" | "xlsx" | "pdf") => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onDownload("csv")}
        icon={
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M2 2a1 1 0 011-1h7.586a1 1 0 01.707.293l2.414 2.414A1 1 0 0114 4.414V14a1 1 0 01-1 1H3a1 1 0 01-1-1V2zm9.5 3h-2a.5.5 0 01-.5-.5v-2L11.5 5zM8 7.5a.5.5 0 00-1 0V10L6.354 9.354a.5.5 0 10-.708.707l1.5 1.5a.5.5 0 00.708 0l1.5-1.5a.5.5 0 00-.708-.707L8 10V7.5z" />
          </svg>
        }
      >
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onDownload("xlsx")}
      >
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onDownload("pdf")}
      >
        PDF
      </Button>
    </div>
  );
}

/** Horizontal filter bar — date filters first, then text filters. */
function FilterBar({
  selectedReport,
  filters,
  onChange,
  onClear,
}: {
  selectedReport: ReportEntry;
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const hasAny = Object.values(filters).some(Boolean);
  // sort: date fields first
  const sorted = [...selectedReport.filters].sort((a, b) => {
    const aDate = a.includes("date") ? 0 : 1;
    const bDate = b.includes("date") ? 0 : 1;
    return aDate - bDate;
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      {sorted.map((key) => (
        <div key={key} className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-semibold text-text-secondary">
            {humanize(key)}
          </label>
          <input
            type={key.includes("date") ? "date" : "text"}
            value={filters[key] ?? ""}
            onChange={(e) => onChange(key, e.target.value)}
            placeholder={`Any ${humanize(key).toLowerCase()}`}
            className={cn(
              "h-9 rounded-control border border-line-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted",
              "transition-colors hover:border-navy-700",
              "focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus-ring",
            )}
          />
        </div>
      ))}
      {hasAny && (
        <button
          onClick={onClear}
          className="mb-0 h-9 inline-flex items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M12.854 3.146a.5.5 0 010 .708L8.707 8l4.147 4.146a.5.5 0 01-.708.708L8 8.707l-4.146 4.147a.5.5 0 01-.708-.708L7.293 8 3.146 3.854a.5.5 0 01.708-.708L8 7.293l4.146-4.147a.5.5 0 01.708 0z" />
          </svg>
          Clear filters
        </button>
      )}
    </div>
  );
}

/** KPI totals strip. */
function TotalsStrip({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map(([k, v]) => {
        const isPaise = k.toLowerCase().includes("paise");
        const label = humanize(k);
        const formatted = isPaise
          ? formatMoney(v as number, { showPaise: false })
          : v.toLocaleString();
        return (
          <StatCard key={k} label={label} value={formatted} />
        );
      })}
    </div>
  );
}

/** Data table. */
function PreviewTable({
  columns,
  rows,
  totalRowsCount,
  reportName,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRowsCount: number;
  reportName: string;
}) {
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
        <span className="text-sm font-semibold text-text">{reportName}</span>
        <span className="text-xs text-text-muted">
          Showing top {rows.length.toLocaleString()} of {totalRowsCount.toLocaleString()} rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {columns.map((col) => (
                <th
                  key={col}
                  className="py-2 px-3 text-xs font-bold text-text-muted uppercase tracking-wider whitespace-nowrap border-b border-line"
                >
                  {humanize(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="hover:bg-surface-hover transition-colors border-b border-line last:border-0"
              >
                {columns.map((col) => {
                  const raw = row[col];
                  const isPaise = col.toLowerCase().includes("paise");
                  let display: React.ReactNode;
                  if (isPaise && typeof raw === "number") {
                    display = formatMoney(raw, { showPaise: false });
                  } else if (looksLikeStatus(raw)) {
                    const s = String(raw);
                    // Pick tone by rough category
                    const tone: "success" | "warning" | "danger" | "neutral" | "info" =
                      ["completed", "active", "verified", "paid", "approved", "published", "resolved"].includes(s.toLowerCase())
                        ? "success"
                        : ["cancelled", "rejected", "failed", "removed"].includes(s.toLowerCase())
                        ? "danger"
                        : ["pending", "in_progress", "processing", "escalated", "en_route", "scheduled"].includes(s.toLowerCase())
                        ? "warning"
                        : "neutral";
                    display = (
                      <Badge tone={tone} dot>
                        {s.replace(/_/g, " ")}
                      </Badge>
                    );
                  } else {
                    display = raw === null || raw === undefined ? "—" : String(raw);
                  }
                  return (
                    <td
                      key={col}
                      className="py-2 px-3 text-sm text-text whitespace-nowrap tabular-nums"
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ReportsView() {
  const { data: catalog, isLoading: catalogLoading } = useReportsCatalog();
  const { data: presets } = useReportsPresets();
  const savePreset = useSavePreset();
  const { notify } = useToast();

  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Derive the effective report ID: use whatever the user picked, falling back
  // to the first report in the catalog. This avoids a useEffect+setState pattern
  // that triggers a cascading second render.
  const effectiveReportId = selectedReportId || catalog?.[0]?.id || "";

  const { data: preview, isLoading: previewLoading } = useReportPreview(
    effectiveReportId,
    filters,
  );

  const selectedReport = catalog?.find((r) => r.id === effectiveReportId);

  const handleSelectReport = (id: string) => {
    setSelectedReportId(id);
    setFilters({});
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => setFilters({});

  const loadPreset = (preset: ReportPreset) => {
    setSelectedReportId(preset.report_id);
    setFilters(preset.filters_json ?? {});
  };

  const handleDownload = (format: "csv" | "xlsx" | "pdf") => {
    if (!effectiveReportId) return;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/reports/${effectiveReportId}.${format}?${params.toString()}`;
    window.open(url, "_blank");
  };

  const handleSavePreset = async (name: string) => {
    try {
      await savePreset.mutateAsync({
        name,
        report_id: effectiveReportId,
        filters_json: filters,
      });
      setSaveDialogOpen(false);
      notify("Preset saved", "success");
    } catch {
      notify("Failed to save preset — please try again.", "danger");
    }
  };

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------
  if (catalogLoading) {
    return (
      <div className="flex flex-col h-full bg-surface">
        {/* Page header skeleton */}
        <header className="flex-none flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h1 className="text-xl font-bold text-text">Reports</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Preview and export operational datasets
            </p>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center gap-3 text-text-muted">
          <Spinner size="md" />
          <span className="text-sm">Loading report catalog…</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty catalog
  // ---------------------------------------------------------------------------
  if (!catalog || catalog.length === 0) {
    return (
      <div className="flex flex-col h-full bg-surface">
        <header className="flex-none px-6 py-4 border-b border-line">
          <h1 className="text-xl font-bold text-text">Reports</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            title="No reports available"
            description="The operations report catalog is empty. Contact your administrator to configure report definitions."
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Full layout
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-surface" aria-label="Reports workspace">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className="flex-none flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line bg-surface">
        <div>
          <h1 className="text-xl font-bold text-text">Reports</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Preview and export operational datasets
          </p>
        </div>
        <ExportActions disabled={!effectiveReportId} onDownload={handleDownload} />
      </header>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

        {/* ── Report switcher ───────────────────────────────────────────── */}
        <section aria-label="Select report">
          <ReportSwitcher
            reports={catalog}
            selectedId={effectiveReportId}
            onSelect={handleSelectReport}
          />
        </section>

        {/* ── Saved presets ─────────────────────────────────────────────── */}
        {(presets && presets.length > 0) && (
          <section aria-label="Quick loads" className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Quick loads:
            </span>
            {presets.map((p) => (
              <PresetChip key={p.id} preset={p} onLoad={loadPreset} />
            ))}
            <button
              onClick={() => setSaveDialogOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                "border border-dashed border-line text-text-muted",
                "hover:border-navy-700 hover:bg-surface-hover hover:text-text",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              )}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
              Save current filters…
            </button>
          </section>
        )}

        {/* Save current filters button when no presets exist yet */}
        {(!presets || presets.length === 0) && (
          <div className="flex">
            <button
              onClick={() => setSaveDialogOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                "border border-dashed border-line text-text-muted",
                "hover:border-navy-700 hover:bg-surface-hover hover:text-text",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              )}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
              Save current filters…
            </button>
          </div>
        )}

        {/* ── Filter bar ────────────────────────────────────────────────── */}
        {selectedReport && selectedReport.filters.length > 0 && (
          <section
            aria-label="Filters"
            className="rounded-card border border-line bg-surface px-4 py-3"
          >
            <FilterBar
              selectedReport={selectedReport}
              filters={filters}
              onChange={handleFilterChange}
              onClear={handleClearFilters}
            />
          </section>
        )}

        {/* ── Preview loading ───────────────────────────────────────────── */}
        {effectiveReportId && previewLoading && (
          <div className="flex items-center justify-center gap-3 py-12 text-text-muted">
            <Spinner size="md" />
            <span className="text-sm">Loading preview…</span>
          </div>
        )}

        {/* ── Preview data ──────────────────────────────────────────────── */}
        {effectiveReportId && !previewLoading && preview && (
          <>
            {/* KPI totals */}
            {preview.totals && Object.keys(preview.totals).length > 0 && (
              <section aria-label="Summary totals">
                <TotalsStrip totals={preview.totals} />
              </section>
            )}

            {/* Table or empty */}
            {preview.rows.length > 0 ? (
              <section aria-label="Data table">
                <PreviewTable
                  columns={preview.columns}
                  rows={preview.rows}
                  totalRowsCount={preview.total_rows_count}
                  reportName={selectedReport?.name ?? ""}
                />
              </section>
            ) : (
              <EmptyState
                compact
                title="No rows match these filters"
                description="Adjust or clear the filters above to see results."
                action={
                  Object.values(filters).some(Boolean) ? (
                    <Button variant="outline" size="sm" onClick={handleClearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}
          </>
        )}

        {/* ── Error / empty after load ──────────────────────────────────── */}
        {effectiveReportId && !previewLoading && !preview && (
          <EmptyState
            compact
            title="Could not load preview"
            description="The server did not return data for this report. Try again or contact support."
          />
        )}
      </div>

      {/* ── Save preset dialog — key resets internal name state on each open ── */}
      <SavePresetDialog
        key={String(saveDialogOpen)}
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSavePreset}
        isSaving={savePreset.isPending}
      />
    </div>
  );
}
