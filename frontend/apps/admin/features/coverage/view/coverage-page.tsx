"use client";

import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Spinner } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { Download, Globe, Megaphone } from "lucide-react";
import {
  type OperationsCoverageLiteArea,
  useCoverageLite,
} from "../queries";

const FLAG_TONE = {
  RED: "danger",
  AMBER: "warning",
  GREEN: "success",
  NONE: "neutral",
} as const;

const FLAG_LABEL: Record<string, string> = {
  RED: "Short",
  AMBER: "Thin",
  GREEN: "Healthy",
  NONE: "No target",
};

const FLAG_BAR: Record<string, string> = {
  RED: "bg-danger-text",
  AMBER: "bg-warning-text",
  GREEN: "bg-success-text",
  NONE: "bg-text-muted",
};

function flagTone(flag: string) {
  return FLAG_TONE[flag as keyof typeof FLAG_TONE] ?? "neutral";
}

/** Approved partners against a target, as the design's bar. Without a target it is just a count. */
function SupplyBar({
  approved,
  target,
  flag,
}: {
  approved: number;
  target: number | null;
  flag: string;
}) {
  if (!target) {
    return <span className="font-mono text-text-secondary">{approved}</span>;
  }
  const pct = Math.min(100, Math.round((approved / target) * 100));
  return (
    <div className="flex items-center gap-2" title={`${approved} of ${target} approved partners`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken">
        <div className={`h-full ${FLAG_BAR[flag] ?? FLAG_BAR.NONE}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono font-semibold text-text">
        {approved}/{target}
      </span>
    </div>
  );
}

/** Twelve weekly points, oldest first. A week without a snapshot is a gap, never a zero. */
function Sparkline({ points }: { points: ReadonlyArray<number | null> }) {
  const known = points.filter((p): p is number => p !== null);
  if (known.length < 2) {
    return <span className="text-[11px] text-text-muted">Building history</span>;
  }
  const max = Math.max(...known, 1);
  const coords = points
    .map((p, i) => (p === null ? null : `${(i * 10 + 2).toFixed(0)},${(26 - (p / max) * 22).toFixed(1)}`))
    .filter((c): c is string => c !== null);
  return (
    <svg
      viewBox="0 0 114 28"
      className="h-7 w-28 text-action"
      role="img"
      aria-label={`Approved partners over 12 weeks: ${known.join(", ")}`}
    >
      <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function CoveragePage() {
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [selectedTrade, setSelectedTrade] = useState<string>("ALL");

  const {
    data: coverage,
    isLoading,
    error,
    refetch,
  } = useCoverageLite({
    zone: selectedZone !== "ALL" ? selectedZone : undefined,
    trade: selectedTrade !== "ALL" ? selectedTrade : undefined,
  });

  const areas: OperationsCoverageLiteArea[] = coverage?.areas ?? [];
  const summary = coverage?.summary;

  // Extract unique zones from areas
  const zones = useMemo(() => {
    const set = new Set<string>();
    areas.forEach((r: OperationsCoverageLiteArea) => {
      if (r.zone?.trim()) set.add(r.zone.trim());
    });
    return Array.from(set).sort();
  }, [areas]);

  // Extract trades from areas
  const trades = useMemo(() => {
    const set = new Set<string>();
    areas.forEach((r: OperationsCoverageLiteArea) => {
      Object.keys(r.partner_trades).forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [areas]);

  const handleExportCsv = () => {
    const url = new URL("/api/v1/operations/coverage-lite/", window.location.origin);
    url.searchParams.set("format", "csv");
    if (selectedZone !== "ALL") {
      url.searchParams.set("zone", selectedZone);
    }
    if (selectedTrade !== "ALL") {
      url.searchParams.set("trade", selectedTrade);
    }
    window.open(url.toString(), "_blank");
  };

  const handleRecruitmentCsv = () => {
    const url = new URL("/api/v1/operations/recruitment-push/", window.location.origin);
    url.searchParams.set("format", "csv");
    if (selectedZone !== "ALL") {
      url.searchParams.set("zone", selectedZone);
    }
    window.open(url.toString(), "_blank");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coverage Overview"
        description="Cross-zone service areas, PIN coverage, partner capacity, and unmet demand."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleRecruitmentCsv} className="text-xs">
              <Megaphone className="w-3.5 h-3.5 mr-1.5" />
              Recruitment list
            </Button>
            <Button variant="secondary" onClick={handleExportCsv} className="text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Service Areas
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-navy-900">
                {summary.total_areas}
              </span>
              <span className="text-xs text-text-muted">areas</span>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Operational Zones
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-navy-900">
                {summary.total_zones}
              </span>
              <span className="text-xs text-text-muted">zones</span>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Covered PIN Codes
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-text">
                {summary.total_pins}
              </span>
              <span className="text-xs text-text-muted">PINs</span>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Approved Partners
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-success-text">
                {summary.total_partners}
              </span>
              <span className="text-xs text-text-muted">live</span>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Unmet Demand
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-warning-text">
                {summary.total_open_asked_pins}
              </span>
              <span className="text-xs text-text-muted">asked PINs</span>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Turned Away (28d)
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-danger-text">
                {summary.total_turned_away_28d}
              </span>
              <span className="text-xs text-text-muted">customers</span>
            </div>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Supply vs Target
            </span>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-extrabold">
              <span className="text-danger-text" title="Short">{summary.red_areas}</span>
              <span className="text-text-muted">/</span>
              <span className="text-warning-text" title="Thin">{summary.amber_areas}</span>
              <span className="text-text-muted">/</span>
              <span className="text-success-text" title="Healthy">{summary.green_areas}</span>
            </div>
            <span className="text-[11px] text-text-muted">short / thin / healthy</span>
          </div>

          <div className="rounded-control border border-line bg-surface p-3.5 col-span-2 md:col-span-1">
            <span className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              12-week Trend
            </span>
            <div className="mt-1">
              <Sparkline points={summary.trend} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="font-medium">Zone:</span>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="rounded border border-line bg-surface p-1.5 text-xs text-text"
            >
              <option value="ALL">All Zones ({zones.length})</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {trades.length > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="font-medium">Trade:</span>
              <select
                value={selectedTrade}
                onChange={(e) => setSelectedTrade(e.target.value)}
                className="rounded border border-line bg-surface p-1.5 text-xs text-text"
              >
                <option value="ALL">All Trades ({trades.length})</option>
                {trades.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="text-xs text-text-muted font-medium">
          Showing {areas.length} area(s)
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load coverage data"
          message={describeError(error).message}
          actionLabel="Try Again"
          onAction={() => refetch()}
        />
      ) : areas.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-8 w-8 text-text-muted" />}
          title="No coverage data found"
          description="There are no service areas matching your selected filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-control border border-line bg-surface">
          <table className="w-full text-left text-xs divide-y divide-line">
            <thead className="bg-surface-sunken text-text-secondary font-semibold">
              <tr>
                <th className="p-3">Zone</th>
                <th className="p-3">Service Area</th>
                <th className="p-3 text-right">PINs</th>
                <th className="p-3">Trades (Partners)</th>
                <th className="p-3">Supply vs target</th>
                <th className="p-3 text-right">Pipeline</th>
                <th className="p-3 text-right">Open Asked PINs</th>
                <th className="p-3 text-right">Turned away 28d</th>
                <th className="p-3 text-right">Bookings / expired offers 28d</th>
                <th className="p-3">12-week trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {areas.map((row: OperationsCoverageLiteArea) => {
                const approvedCount = row.partner_counts["APPROVED"] ?? 0;
                const underReview = row.partner_counts["UNDER_REVIEW"] ?? 0;
                const changesRequired = row.partner_counts["CHANGES_REQUIRED"] ?? 0;
                const submitted = row.partner_counts["SUBMITTED"] ?? 0;

                return (
                  <tr key={row.id} className="hover:bg-surface-hover/50">
                    <td className="p-3 font-semibold text-text-secondary">
                      {row.zone ? <Badge tone="neutral">{row.zone}</Badge> : "—"}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-text block text-sm">{row.name}</span>
                      <span className="font-mono text-text-muted text-[11px]">{row.slug}</span>
                      <div className="mt-1">
                        <Badge tone={flagTone(row.flag)}>{FLAG_LABEL[row.flag] ?? row.flag}</Badge>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-text">
                      {row.postal_codes.length}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(row.partner_trades).length === 0 ? (
                          <span className="text-text-muted italic">None</span>
                        ) : (
                          Object.entries(row.partner_trades).map(([tradeName, count]) => (
                            <span
                              key={tradeName}
                              className="inline-flex rounded bg-surface-sunken px-2 py-0.5 text-[11px] font-medium border border-line"
                            >
                              {tradeName} <span className="ml-1 font-bold text-text-secondary">({count})</span>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <SupplyBar
                        approved={approvedCount}
                        target={row.target_partners}
                        flag={row.flag}
                      />
                      {row.trade_targets.length > 0 ? (
                        <div className="mt-1.5 space-y-1">
                          {row.trade_targets.map((trade) => (
                            <div key={trade.skill_code} className="flex items-center gap-2 text-[11px]">
                              <span className="w-20 truncate text-text-secondary">{trade.skill_name}</span>
                              <SupplyBar
                                approved={trade.approved_partners}
                                target={trade.target_partners}
                                flag={trade.flag}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-right text-text-secondary">
                      <span title="Under review">{underReview}</span>
                      <span className="text-text-muted"> / </span>
                      <span title="Changes required" className="text-warning-text">
                        {changesRequired}
                      </span>
                      <span className="text-text-muted"> / </span>
                      <span title="Submitted" className="text-text-muted">
                        {submitted}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-warning-text">
                      {row.open_asked_pins_count}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-danger-text">
                      {row.turned_away_28d_count}
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary">
                      {row.bookings_28d_count}
                      <span className="text-text-muted"> / </span>
                      <span className={row.offer_expiries_28d_count > 0 ? "text-warning-text" : ""}>
                        {row.offer_expiries_28d_count}
                      </span>
                    </td>
                    <td className="p-3">
                      <Sparkline points={row.trend} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
