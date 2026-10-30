"use client";

import { X } from "lucide-react";
import { Badge, Button, ErrorState, Field, Select, Spinner } from "@vsolve/ui";

import {
  usePartnerDirectory,
  usePartnerSkills,
  type PartnerDirectoryFilters,
} from "@/features/partners/queries";
import { PartnerSkillFilter } from "@/features/partners/view/partner-skill-filter";

/**
 * The Partner list, with the two filters a manager actually reaches for.
 *
 * Selection lives in the parent's state rather than the URL, matching the review screen: a
 * partner id in a shareable link is a small invitation to pass one around outside the audited
 * read.
 */

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUIRED",
  "APPROVED",
  "SUSPENDED",
  "OFFBOARDED",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUIRED: "Changes required",
  APPROVED: "Approved",
  SUSPENDED: "Suspended",
  OFFBOARDED: "Offboarded",
};

export const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  CHANGES_REQUIRED: "warning",
  APPROVED: "success",
  SUSPENDED: "warning",
  OFFBOARDED: "danger",
};

/** A row shows a few skills; the full list is in the partner record. */
const ROW_SKILL_LIMIT = 4;

interface PartnerDirectoryProps {
  filters: PartnerDirectoryFilters;
  onFiltersChange: (filters: PartnerDirectoryFilters) => void;
  selectedId: string | null;
  onSelect: (partnerId: string) => void;
}

export function PartnerDirectory({
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
}: PartnerDirectoryProps) {
  const directory = usePartnerDirectory(filters);
  const skills = usePartnerSkills();

  const rows = directory.data?.pages.flatMap((page) => page.results) ?? [];
  const selectedSkills = filters.skills ?? [];

  const skillNames = new Map((skills.data ?? []).map((skill) => [skill.code, skill.name]));

  function removeSkill(code: string) {
    onFiltersChange({ ...filters, skills: selectedSkills.filter((entry) => entry !== code) });
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-card p-4 shadow-card space-y-4">
        <Field label="Application status">
          <Select
            value={filters.status ?? ""}
            onChange={(event) =>
              onFiltersChange({ ...filters, status: event.target.value || undefined })
            }
          >
            <option value="">Any status</option>
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-text">
            Skills <span className="font-normal text-text-secondary">(optional)</span>
          </span>
          <PartnerSkillFilter
            skills={skills.data ?? []}
            selected={selectedSkills}
            onChange={(codes) => onFiltersChange({ ...filters, skills: codes })}
            isPending={skills.isPending}
            isError={skills.isError}
          />
        </div>

        {selectedSkills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {selectedSkills.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => removeSkill(code)}
                aria-label={`Remove ${skillNames.get(code) ?? code}`}
                className="inline-flex items-center gap-1 rounded-full bg-signal-50 px-3 py-1 text-xs font-semibold text-signal-700 ring-1 ring-signal-200 hover:bg-signal-100"
              >
                {skillNames.get(code) ?? code}
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, skills: [] })}
              className="text-xs font-semibold text-text underline"
            >
              Clear {selectedSkills.length} skill filter
              {selectedSkills.length === 1 ? "" : "s"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
        {directory.isError ? (
          <div className="p-4">
            <ErrorState
              severity="warning"
              title="Partners could not be loaded"
              message="Nothing is listed rather than a partial directory."
              actionLabel="Try again"
              onAction={() => void directory.refetch()}
            />
          </div>
        ) : directory.isPending ? (
          <div className="flex items-center gap-2 p-6 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading partners…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-text-secondary">
            No partner matches these filters.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  aria-current={selectedId === row.id}
                  className={
                    selectedId === row.id
                      ? "w-full text-left p-4 bg-surface-sunken"
                      : "w-full text-left p-4 hover:bg-surface-hover/50 transition-colors"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-text">{row.display_name}</span>
                    <Badge tone={STATUS_TONE[row.application_status] ?? "neutral"}>
                      {STATUS_LABELS[row.application_status] ?? row.application_status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {row.experience_years} yr experience · {row.service_count} service
                    {row.service_count === 1 ? "" : "s"} · {row.service_area_count} area
                    {row.service_area_count === 1 ? "" : "s"}
                  </p>
                  {row.skills.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.skills.slice(0, ROW_SKILL_LIMIT).map((skill) => (
                        <span
                          key={skill.code}
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-sunken text-text-secondary ring-1 ring-line"
                        >
                          {skill.name}
                        </span>
                      ))}
                      {row.skills.length > ROW_SKILL_LIMIT ? (
                        <span
                          title={row.skills
                            .slice(ROW_SKILL_LIMIT)
                            .map((skill) => skill.name)
                            .join(", ")}
                          className="px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                        >
                          +{row.skills.length - ROW_SKILL_LIMIT} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        {directory.hasNextPage ? (
          <div className="border-t border-line p-3">
            <Button
              variant="secondary"
              onClick={() => void directory.fetchNextPage()}
              loading={directory.isFetchingNextPage}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
