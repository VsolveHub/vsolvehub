"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Download, Search, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadMore,
  Spinner,
  StatCard,
  cn,
  formatDate,
  formatMoney,
  segmentStyles,
  useToast,
} from "@vsolve/ui";

import { useDebounced } from "@/features/shared/use-debounced";

import { DEFAULT_RANGE, QUICK_RANGES, matchingRange, rangeDates, type QuickRange } from "./date-ranges";
import { ChoicePicker, PartnerPicker } from "./pickers";
import {
  downloadReport,
  filterProblem,
  useReportPreview,
  useReportsCatalog,
  useReportsPresets,
  useSavePreset,
  type ExportFormat,
  type ReportColumn,
  type ReportEntry,
  type ReportQuery,
  type ReportRow,
} from "./queries";

/**
 * Operations reports.
 *
 * The server describes every report (its filters as dropdowns, its columns, its totals), so
 * this page draws whatever the catalog holds. The report, its filters, search and sort all
 * live in the address bar: a refresh or a link to a colleague opens the same view.
 */

const GROUP_ORDER = ["Money", "Services", "Marketplace"];
/** `?period=all` means no dates; with no dates in the address the report opens on this month. */
const ALL_TIME = "all";

export function ReportsView() {
  return (
    <Suspense fallback={null}>
      <ReportsWorkspace />
    </Suspense>
  );
}

function useReportAddress(catalog: ReportEntry[] | undefined) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reportId = params.get("report") || catalog?.[0]?.id || "";
  const report = catalog?.find((r) => r.id === reportId);

  const query = useMemo<ReportQuery>(() => {
    const next: ReportQuery = {};
    for (const key of [...(report?.filters.map((f) => f.key) ?? []), "q", "sort"]) {
      const value = params.get(key);
      if (value) next[key] = value;
    }
    const hasDates = report?.filters.some((f) => f.kind === "date");
    if (hasDates && !next.date_start && !next.date_end && params.get("period") !== ALL_TIME) {
      Object.assign(next, rangeDates(DEFAULT_RANGE));
    }
    return next;
  }, [params, report]);

  const write = (nextReport: string, nextQuery: ReportQuery, allTime = false) => {
    const search = new URLSearchParams();
    search.set("report", nextReport);
    for (const [key, value] of Object.entries(nextQuery)) if (value) search.set(key, value);
    if (allTime) search.set("period", ALL_TIME);
    router.replace(`${pathname}?${search}`, { scroll: false });
  };

  return {
    reportId,
    report,
    query,
    /** Change some of the query; dates cleared together mean "all time". */
    update: (patch: ReportQuery) => {
      const next = { ...query, ...patch };
      const allTime = !next.date_start && !next.date_end;
      write(reportId, next, allTime);
    },
    selectReport: (id: string) => write(id, {}),
    replaceQuery: (id: string, next: ReportQuery) => write(id, next, !next.date_start && !next.date_end),
  };
}

function ReportsWorkspace() {
  const catalog = useReportsCatalog();
  const address = useReportAddress(catalog.data);
  const { report, reportId, query } = address;

  if (catalog.isLoading) {
    return (
      <PageFrame>
        <div className="flex items-center justify-center gap-3 py-16 text-text-muted">
          <Spinner size="md" />
          <span className="text-sm">Loading reports…</span>
        </div>
      </PageFrame>
    );
  }
  if (!catalog.data?.length || !report) {
    return (
      <PageFrame>
        <EmptyState title="No reports available" description="Try again in a moment." />
      </PageFrame>
    );
  }

  return (
    <PageFrame actions={<ExportActions reportId={reportId} query={query} />}>
      <ReportPicker reports={catalog.data} selectedId={reportId} onSelect={address.selectReport} />
      <p className="text-sm text-text-secondary">{report.description}</p>
      <Presets
        reportId={reportId}
        query={query}
        onLoad={(id, filters) => address.replaceQuery(id, filters)}
      />
      <FilterCard key={reportId} report={report} query={query} onChange={address.update} />
      <ReportResults report={report} query={query} onChange={address.update} />
    </PageFrame>
  );
}

function PageFrame({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-surface" aria-label="Reports workspace">
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-text">Reports</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Pick a report, filter it, and download it.</p>
        </div>
        {actions}
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>
    </div>
  );
}

// --- report picker ---------------------------------------------------------------------------

function ReportPicker({
  reports,
  selectedId,
  onSelect,
}: {
  reports: ReportEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const groups = [...new Set(reports.map((r) => r.group))].sort(
    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
  );
  return (
    <section aria-label="Choose a report" className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group} className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-text-muted">
            {group}
          </span>
          <div role="tablist" aria-label={`${group} reports`} className="flex flex-wrap gap-1">
            {reports
              .filter((r) => r.group === group)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedId === r.id}
                  onClick={() => onSelect(r.id)}
                  className={segmentStyles({ selected: selectedId === r.id })}
                >
                  {r.name}
                </button>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// --- filters ---------------------------------------------------------------------------------

function FilterCard({
  report,
  query,
  onChange,
}: {
  report: ReportEntry;
  query: ReportQuery;
  onChange: (patch: ReportQuery) => void;
}) {
  const [search, setSearch] = useState(query.q ?? "");
  const debounced = useDebounced(search.trim());
  useEffect(() => {
    if ((query.q ?? "") !== debounced) onChange({ q: debounced });
    // Only the typed text drives this; `query` changes come from it or from elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const hasDates = report.filters.some((f) => f.kind === "date");
  const range = matchingRange(query.date_start ?? "", query.date_end ?? "");
  const others = report.filters.filter((f) => f.kind !== "date");
  const filtered = others.some((f) => query[f.key]) || Boolean(query.q);

  const pickRange = (key: QuickRange) => onChange(rangeDates(key));

  return (
    <section aria-label="Filters" className="flex flex-col gap-4 rounded-card border border-line bg-surface px-4 py-4">
      {hasDates ? (
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Date range" className="flex flex-wrap gap-1">
            {QUICK_RANGES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => pickRange(key)}
                className={segmentStyles({ selected: range === key })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
            From
            <input
              type="date"
              value={query.date_start ?? ""}
              max={query.date_end || undefined}
              onChange={(e) => onChange({ date_start: e.target.value })}
              className="h-9 rounded-control border border-line-strong bg-surface px-3 text-sm text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
            To
            <input
              type="date"
              value={query.date_end ?? ""}
              min={query.date_start || undefined}
              onChange={(e) => onChange({ date_end: e.target.value })}
              className="h-9 rounded-control border border-line-strong bg-surface px-3 text-sm text-text"
            />
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {others.map((spec) => {
          const id = `report-filter-${spec.key}`;
          return (
            <div key={spec.key} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-xs font-semibold text-text-secondary">
                {spec.label}
              </label>
              {spec.kind === "partner" ? (
                <PartnerPicker
                  id={id}
                  label={spec.label}
                  value={query[spec.key] ?? ""}
                  onChange={(value) => onChange({ [spec.key]: value })}
                />
              ) : (
                <ChoicePicker
                  id={id}
                  label={spec.label}
                  options={spec.options}
                  value={query[spec.key] ?? ""}
                  onChange={(value) => onChange({ [spec.key]: value })}
                />
              )}
            </div>
          );
        })}
        <div className="flex flex-col gap-1">
          <label htmlFor="report-search" className="text-xs font-semibold text-text-secondary">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              id="report-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone or reference"
              className="h-9 w-full rounded-control border border-line-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
        </div>
      </div>

      {filtered ? (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            onChange({ ...Object.fromEntries(others.map((f) => [f.key, ""])), q: "" });
          }}
          className="inline-flex items-center gap-1.5 self-start rounded-control px-2 py-1 text-sm font-semibold text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          <X className="size-3.5" aria-hidden /> Clear filters
        </button>
      ) : null}
    </section>
  );
}

// --- results ---------------------------------------------------------------------------------

function ReportResults({
  report,
  query,
  onChange,
}: {
  report: ReportEntry;
  query: ReportQuery;
  onChange: (patch: ReportQuery) => void;
}) {
  const preview = useReportPreview(report.id, query);
  const pages = preview.data?.pages ?? [];
  const first = pages[0];
  const rows = pages.flatMap((page) => page.rows as ReportRow[]);

  if (preview.isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-text-muted">
        <Spinner size="md" />
        <span className="text-sm">Loading the report…</span>
      </div>
    );
  }
  if (preview.error) {
    return (
      <EmptyState
        compact
        title="This report could not load"
        description={filterProblem(preview.error) ?? "Try again in a moment."}
        action={
          <Button variant="outline" size="sm" onClick={() => void preview.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!first) return null;

  return (
    <>
      {first.totals.length > 0 ? (
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {first.totals.map((total) => (
            <StatCard
              key={total.key}
              label={total.label}
              value={total.kind === "money" ? formatMoney(total.value) : total.value.toLocaleString("en-IN")}
            />
          ))}
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState compact title="Nothing in this report" description="Try a longer date range or fewer filters." />
      ) : (
        <Card padding="none" className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-text">{report.name}</span>
            <span className="text-xs text-text-muted">
              Showing {rows.length.toLocaleString("en-IN")} of {first.total_rows_count.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface-sunken">
                  {first.columns.map((column) => (
                    <HeaderCell
                      key={column.key}
                      column={column}
                      sort={query.sort ?? ""}
                      onSort={(sort) => onChange({ sort })}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.id ?? index)} className="border-b border-line last:border-0 hover:bg-surface-hover">
                    {first.columns.map((column) => (
                      <td key={column.key} className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-text">
                        <CellValue column={column} value={row[column.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3">
            <LoadMore
              hasMore={Boolean(preview.hasNextPage)}
              loading={preview.isFetchingNextPage}
              onLoadMore={() => void preview.fetchNextPage()}
              label="Show more rows"
            />
          </div>
        </Card>
      )}
    </>
  );
}

function HeaderCell({
  column,
  sort,
  onSort,
}: {
  column: ReportColumn;
  sort: string;
  onSort: (sort: string) => void;
}) {
  const className =
    "whitespace-nowrap border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-muted";
  if (!column.sortable) return <th className={className}>{column.label}</th>;
  const active = sort.replace(/^-/, "") === column.key;
  const descending = active && sort.startsWith("-");
  return (
    <th className={className} aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(active && !descending ? `-${column.key}` : column.key)}
        className="inline-flex items-center gap-1 uppercase hover:text-text"
      >
        {column.label}
        {active ? (
          descending ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />
        ) : null}
      </button>
    </th>
  );
}

const SUCCESS = /complet|confirm|captur|paid|active|approved|deliver|returned|checked out|available|held|responded/i;
const DANGER = /cancel|fail|reject|declin|disput|expired|abort|removed|no show|refunded/i;
const WARNING = /pending|progress|route|arrived|requested|submitted|reserved|grace|awaiting|handed/i;

export function statusTone(label: string): "success" | "danger" | "warning" | "neutral" {
  if (DANGER.test(label)) return "danger";
  if (SUCCESS.test(label)) return "success";
  if (WARNING.test(label)) return "warning";
  return "neutral";
}

function CellValue({ column, value }: { column: ReportColumn; value: unknown }) {
  const { notify } = useToast();
  if (value === null || value === undefined || value === "") return <span className="text-text-muted">—</span>;
  switch (column.kind) {
    case "money":
      return <>{formatMoney(Number(value))}</>;
    case "date":
      return <>{formatDate(String(value))}</>;
    case "number":
      return <>{Number(value).toLocaleString("en-IN")}</>;
    case "status":
      return (
        <Badge tone={statusTone(String(value))} dot>
          {String(value)}
        </Badge>
      );
    case "ref":
      return (
        <button
          type="button"
          title="Copy reference"
          onClick={() => {
            void navigator.clipboard?.writeText(String(value));
            notify(`Copied ${String(value)}`, "success");
          }}
          className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-text-secondary hover:text-text"
        >
          {String(value)}
          <Copy className="size-3" aria-hidden />
        </button>
      );
    default:
      return <>{String(value)}</>;
  }
}

// --- export ----------------------------------------------------------------------------------

function ExportActions({ reportId, query }: { reportId: string; query: ReportQuery }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const download = async (format: ExportFormat) => {
    setBusy(format);
    try {
      await downloadReport(reportId, format, query);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The file could not be made.", "danger");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {(["csv", "xlsx", "pdf"] as const).map((format) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            disabled={busy !== null}
            loading={busy === format}
            loadingLabel="Preparing"
            onClick={() => void download(format)}
            icon={<Download className="size-3.5" aria-hidden />}
          >
            {format === "xlsx" ? "Excel" : format.toUpperCase()}
          </Button>
        ))}
      </div>
      <span className="text-[11px] text-text-muted">Files use the filters below, up to 5,000 rows.</span>
    </div>
  );
}

// --- saved filters ---------------------------------------------------------------------------

function Presets({
  reportId,
  query,
  onLoad,
}: {
  reportId: string;
  query: ReportQuery;
  onLoad: (reportId: string, filters: ReportQuery) => void;
}) {
  const presets = useReportsPresets();
  const save = useSavePreset();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await save.mutateAsync({ name: name.trim(), report_id: reportId, filters_json: query });
      setOpen(false);
      setName("");
      notify("Filters saved", "success");
    } catch {
      notify("Could not save these filters. Try again.", "danger");
    }
  };

  return (
    <section aria-label="Saved filters" className="flex flex-wrap items-center gap-2">
      {(presets.data ?? []).map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onLoad(preset.report_id, (preset.filters_json ?? {}) as ReportQuery)}
          className={cn(
            "inline-flex items-center rounded-full border border-line bg-surface-hover px-3 py-1 text-xs font-semibold text-text-secondary",
            "hover:border-navy-700 hover:text-text",
          )}
        >
          {preset.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full border border-dashed border-line px-3 py-1 text-xs font-semibold text-text-muted hover:border-navy-700 hover:text-text"
      >
        + Save these filters
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Save these filters"
        description="Name this report and its filters to open them again in one click."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={save.isPending} loadingLabel="Saving" onClick={() => void submit()}>
              Save
            </Button>
          </>
        }
      >
        <form
          className="py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" showOptional={false}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cancelled bookings this week" />
          </Field>
        </form>
      </Dialog>
    </section>
  );
}
