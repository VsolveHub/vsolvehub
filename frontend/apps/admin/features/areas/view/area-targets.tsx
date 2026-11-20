"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Input, Spinner, cn } from "@vsolve/ui";
import { describeError } from "@vsolve/query";

import { useAreaTargets, useUpdateAreaTargets, type AreaTargets } from "../queries";

const FLAG_TONE = { RED: "danger", AMBER: "warning", GREEN: "success", NONE: "neutral" } as const;
const FLAG_LABEL: Record<string, string> = {
  RED: "Short",
  AMBER: "Thin",
  GREEN: "Healthy",
  NONE: "No target",
};

interface Draft {
  target: string;
  alert: string;
}

type Drafts = { overall: Draft; trades: Record<string, Draft> };

function toText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function toNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
}

function draftsFrom(data: AreaTargets): Drafts {
  return {
    overall: { target: toText(data.overall.target_partners), alert: toText(data.overall.alert_below) },
    trades: Object.fromEntries(
      data.trades.map((trade) => [
        trade.skill_code,
        { target: toText(trade.target_partners), alert: toText(trade.alert_below) },
      ]),
    ),
  };
}

/** How many approved partners Operations wants here, overall and per trade (FLOW.md 3d / Phase 2). */
export function AreaTargets({ areaId }: { areaId: string }) {
  const { data, isLoading, error } = useAreaTargets(areaId);
  const update = useUpdateAreaTargets();
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (data) setDrafts(draftsFrom(data));
  }, [data]);

  if (isLoading || (data && !drafts)) {
    return <Spinner />;
  }
  if (error || !data || !drafts) {
    return (
      <p className="text-xs text-danger-text">
        {error ? describeError(error).message : "Could not load targets."}
      </p>
    );
  }

  const setOverall = (patch: Partial<Draft>) =>
    setDrafts({ ...drafts, overall: { ...drafts.overall, ...patch } });
  const setTrade = (code: string, patch: Partial<Draft>) =>
    setDrafts({
      ...drafts,
      trades: { ...drafts.trades, [code]: { ...(drafts.trades[code] ?? { target: "", alert: "" }), ...patch } },
    });

  const save = () => {
    setMessage(null);
    const all = [drafts.overall, ...Object.values(drafts.trades)];
    if (all.some((d) => Number.isNaN(toNumber(d.target)) || Number.isNaN(toNumber(d.alert)))) {
      setMessage({ tone: "error", text: "Targets must be whole numbers, 0 or more." });
      return;
    }
    update.mutate(
      {
        areaId,
        overall: {
          target_partners: toNumber(drafts.overall.target),
          alert_below: toNumber(drafts.overall.alert),
        },
        trades: data.trades.map((trade) => ({
          skill_code: trade.skill_code,
          target_partners: toNumber(drafts.trades[trade.skill_code]?.target ?? ""),
          alert_below: toNumber(drafts.trades[trade.skill_code]?.alert ?? ""),
        })),
      },
      {
        onSuccess: () => setMessage({ tone: "ok", text: "Targets saved." }),
        onError: (err) => setMessage({ tone: "error", text: describeError(err).message }),
      },
    );
  };

  const renderRow = (
    key: string,
    label: string,
    approved: number,
    flag: string,
    draft: Draft,
    onChange: (patch: Partial<Draft>) => void,
    isOverall = false,
  ) => (
    <div
      key={key}
      className={cn(
        "grid grid-cols-[1fr_84px_84px_88px] items-center gap-2 px-3 py-2 text-xs transition-colors",
        isOverall ? "bg-surface-sunken/50" : "hover:bg-surface-hover/40",
      )}
    >
      <div className="min-w-0 pr-1">
        <span className={cn("block truncate text-text", isOverall ? "font-bold text-xs" : "font-medium")}>
          {label}
        </span>
        <span className="text-[11px] text-text-muted">({approved} approved)</span>
      </div>
      <div>
        <Input
          aria-label={`${label} target`}
          value={draft.target}
          onChange={(e) => onChange({ target: e.target.value })}
          placeholder="—"
          inputMode="numeric"
          className="text-xs text-center h-8 font-mono"
        />
      </div>
      <div>
        <Input
          aria-label={`${label} alert below`}
          value={draft.alert}
          onChange={(e) => onChange({ alert: e.target.value })}
          placeholder="—"
          inputMode="numeric"
          className="text-xs text-center h-8 font-mono"
        />
      </div>
      <div className="flex justify-end">
        <Badge
          tone={FLAG_TONE[flag as keyof typeof FLAG_TONE] ?? "neutral"}
          className="text-[10px] px-2 py-0.5 font-semibold shrink-0"
        >
          {FLAG_LABEL[flag] ?? flag}
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pt-2 border-t border-line">
      <div>
        <h4 className="font-bold text-text">Supply Targets</h4>
        <p className="text-xs text-text-secondary">
          Target number of approved partners needed here. Leave blank for no target.
        </p>
      </div>

      <div className="rounded-control border border-line bg-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_84px_84px_88px] items-center gap-2 bg-surface-sunken px-3 py-2 text-[11px] font-semibold text-text-secondary border-b border-line">
          <span>Trade / Scope</span>
          <span className="text-center">Target</span>
          <span className="text-center">Alert Below</span>
          <span className="text-right">Health</span>
        </div>
        <div className="divide-y divide-line">
          {renderRow(
            "overall",
            "Whole area",
            data.overall.approved_partners,
            data.overall.flag,
            drafts.overall,
            setOverall,
            true,
          )}
          {data.trades.map((trade) =>
            renderRow(
              trade.skill_code,
              trade.skill_name,
              trade.approved_partners,
              trade.flag,
              drafts.trades[trade.skill_code] ?? { target: "", alert: "" },
              (patch) => setTrade(trade.skill_code, patch),
            ),
          )}
        </div>
      </div>

      <p className="text-[11px] text-text-muted leading-relaxed">
        Below 30% of target is short, below 70% is thin. “Alert below” turns the area short whatever the ratio. Leave a target empty for no target.
      </p>

      {message ? (
        <p className={message.tone === "ok" ? "text-xs text-success-text font-semibold" : "text-xs text-danger-text font-semibold"}>
          {message.text}
        </p>
      ) : null}

      <Button variant="primary" onClick={save} disabled={update.isPending} className="text-xs">
        {update.isPending ? "Saving..." : "Save targets"}
      </Button>
    </div>
  );
}
