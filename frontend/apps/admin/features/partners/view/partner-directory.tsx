"use client";

import { Badge, Button, ErrorState, Field, Select, Spinner } from "@vsolve/ui";

import {
  usePartnerDirectory,
  usePartnerSkills,
  type PartnerDirectoryFilters,
} from "@/features/partners/queries";

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

  function toggleSkill(code: string) {
    const next = selectedSkills.includes(code)
      ? selectedSkills.filter((entry) => entry !== code)
      : [...selectedSkills, code];
    onFiltersChange({ ...filters, skills: next });
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

        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Skills
          </span>
          {skills.isError ? (
            <p className="mt-2 text-sm text-text-secondary">
              The skill list could not be loaded, so no skill filter is offered rather than a
              partial one.
            </p>
          ) : skills.isPending ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading skills…
            </div>
          ) : (skills.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-text-secondary">No skills are configured yet.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {(skills.data ?? []).map((skill) => {
                const active = selectedSkills.includes(skill.code);
                return (
                  <button
                    key={skill.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleSkill(skill.code)}
                    className={
                      active
                        ? "px-3 py-1 rounded-full text-xs font-semibold bg-signal-50 text-signal-700 ring-1 ring-signal-200"
                        : "px-3 py-1 rounded-full text-xs font-medium bg-surface-sunken text-text-secondary ring-1 ring-line hover:bg-surface-hover"
                    }
                  >
                    {skill.name}
                  </button>
                );
              })}
            </div>
          )}
          {selectedSkills.length > 0 ? (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, skills: [] })}
              className="mt-3 text-xs font-semibold text-text underline"
            >
              Clear {selectedSkills.length} skill filter
              {selectedSkills.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
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
                      {row.skills.map((skill) => (
                        <span
                          key={skill.code}
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-sunken text-text-secondary ring-1 ring-line"
                        >
                          {skill.name}
                        </span>
                      ))}
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
