"use client";

import { describeError } from "@vsolve/query";
import { Button, ConfirmAction, ErrorState, Field, Input, Select, Skeleton } from "@vsolve/ui";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  WEEKDAYS,
  clearsTheSchedule,
  describeWeek,
  draftFromSchedule,
  hasProblems,
  nextRowKey,
  validateSchedule,
  type RuleDraft,
  type ScheduleDraft,
} from "../model/schedule";
import { usePartnerSchedule, useReplacePartnerSchedule, type PartnerScheduleRead } from "../queries";

function hours(rule: { starts_at?: string; ends_at?: string; startsAt?: string; endsAt?: string; ends_next_day?: boolean; endsNextDay?: boolean }): string {
  const start = (rule.starts_at ?? rule.startsAt ?? "").slice(0, 5);
  const end = (rule.ends_at ?? rule.endsAt ?? "").slice(0, 5);
  const overnight = rule.ends_next_day ?? rule.endsNextDay;
  return `${start}–${end}${overnight ? " (next day)" : ""}`;
}

/** The week as it stands, one line per day, per area. */
function WeekView({ schedule }: { schedule: PartnerScheduleRead }) {
  const areaName = new Map(schedule.service_areas.map((area) => [area.id, area.name]));
  const areaIds = [...new Set(schedule.rules.map((rule) => rule.service_area_id))];

  if (schedule.rules.length === 0) {
    return (
      <p className="rounded-control bg-warning-surface p-3 text-sm text-warning-text">
        No working hours set. This partner gets no scheduled jobs until hours are added.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {areaIds.map((areaId) => (
        <div key={areaId}>
          {areaIds.length > 1 || schedule.service_areas.length > 1 ? (
            <p className="mb-1 text-xs font-semibold uppercase text-text-muted">
              {areaName.get(areaId) ?? "Service area"}
            </p>
          ) : null}
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
            {WEEKDAYS.map((day, weekday) => {
              const ranges = schedule.rules.filter(
                (rule) => rule.service_area_id === areaId && rule.weekday === weekday,
              );
              return (
                <div key={day} className="contents">
                  <dt className="text-text-secondary">{day}</dt>
                  <dd className={ranges.length ? "text-text" : "text-text-muted"}>
                    {ranges.length ? ranges.map(hours).join(", ") : "Off"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
      {schedule.exceptions.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-text-muted">One-off changes</p>
          <ul className="space-y-0.5 text-sm">
            {schedule.exceptions.map((exception) => (
              <li key={`${exception.service_area_id}-${exception.date}`}>
                {exception.date}:{" "}
                {exception.is_available ? `working ${hours(exception as never)}` : "not working"}
                {exception.reason ? <span className="text-text-secondary"> · {exception.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The week being saved, one line per day and area, so two areas with the same hours read clearly. */
function weekSummary(draft: ScheduleDraft, areaNames: Map<string, string>): string[] {
  const areas = new Set(draft.rules.map((rule) => rule.serviceAreaId));
  if (areas.size <= 1) return describeWeek(draft);
  return [...areas].flatMap((areaId) =>
    describeWeek({ ...draft, rules: draft.rules.filter((rule) => rule.serviceAreaId === areaId), exceptions: [] }).map(
      (line) => `${areaNames.get(areaId) ?? "Area"}: ${line}`,
    ),
  ).concat(describeWeek({ ...draft, rules: [] }).filter(() => draft.exceptions.length > 0));
}

function RangeRow({
  rule,
  error,
  onChange,
  onRemove,
}: {
  rule: RuleDraft;
  error: string | undefined;
  onChange: (patch: Partial<RuleDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="time"
          aria-label="Starts"
          className="w-28"
          value={rule.startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value })}
        />
        <span className="text-text-secondary">to</span>
        <Input
          type="time"
          aria-label="Ends"
          className="w-28"
          value={rule.endsAt}
          onChange={(event) => onChange({ endsAt: event.target.value })}
        />
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={rule.endsNextDay}
            onChange={(event) => onChange({ endsNextDay: event.target.checked })}
          />
          Ends next day
        </label>
        <Button size="sm" variant="ghost" aria-label="Remove these hours" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}

function HoursEditor({
  schedule,
  partnerId,
  onDone,
}: {
  schedule: PartnerScheduleRead;
  partnerId: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(() => draftFromSchedule(partnerId, schedule));
  const [areaId, setAreaId] = useState(schedule.service_areas[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const save = useReplacePartnerSchedule();
  const problems = useMemo(() => validateSchedule(draft), [draft]);
  const noConsent = schedule.consents.length === 0;
  const areaNames = new Map(schedule.service_areas.map((area) => [area.id, area.name]));
  const noAreas = schedule.service_areas.length === 0;

  const update = (key: string, patch: Partial<RuleDraft>) =>
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)),
    }));
  const remove = (key: string) =>
    setDraft((current) => ({ ...current, rules: current.rules.filter((rule) => rule.key !== key) }));
  const add = (weekday: number) =>
    setDraft((current) => ({
      ...current,
      rules: [
        ...current.rules,
        { key: nextRowKey(), serviceAreaId: areaId, weekday, startsAt: "09:00", endsAt: "18:00", endsNextDay: false },
      ],
    }));
  const copyMondayToWeekdays = () =>
    setDraft((current) => {
      const monday = current.rules.filter((rule) => rule.serviceAreaId === areaId && rule.weekday === 0);
      const others = current.rules.filter(
        (rule) => !(rule.serviceAreaId === areaId && rule.weekday >= 1 && rule.weekday <= 5),
      );
      const copies = [1, 2, 3, 4, 5].flatMap((weekday) =>
        monday.map((rule) => ({ ...rule, key: nextRowKey(), weekday })),
      );
      return { ...current, rules: [...others, ...copies] };
    });

  if (noAreas) {
    return (
      <p className="rounded-control bg-warning-surface p-3 text-sm text-warning-text">
        This partner serves no area yet, so there is nowhere to set hours for.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {noConsent ? (
        <p className="rounded-control bg-warning-surface p-3 text-sm text-warning-text">
          This partner has no consent on file that lets Operations change their hours. Ask them to set
          hours in the Partner app.
        </p>
      ) : null}

      <div className="grid gap-3">
        {schedule.service_areas.length > 1 ? (
          <Field label="Area">
            <Select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
              {schedule.service_areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {schedule.consents.length > 1 ? (
          <Field label="Recorded under the partner's consent">
            <Select
              value={`${draft.consentPurpose}|${draft.consentVersion}`}
              onChange={(event) => {
                const [consentPurpose = "", consentVersion = ""] = event.target.value.split("|");
                setDraft((current) => ({ ...current, consentPurpose, consentVersion }));
              }}
            >
              {schedule.consents.map((consent) => (
                <option key={`${consent.purpose}|${consent.document_version}`} value={`${consent.purpose}|${consent.document_version}`}>
                  {consent.purpose.replace(/[-_]/g, " ")} ({consent.document_version})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <div className="divide-y divide-line rounded-control border border-line">
        {WEEKDAYS.map((day, weekday) => {
          const ranges = draft.rules.filter((rule) => rule.serviceAreaId === areaId && rule.weekday === weekday);
          return (
            <div key={day} className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">{day}</span>
                <Button size="sm" variant="ghost" onClick={() => add(weekday)}>
                  <Plus className="size-4" aria-hidden /> Add hours
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {ranges.length === 0 ? <span className="text-sm text-text-muted">Off</span> : null}
                {ranges.map((rule) => (
                  <RangeRow
                    key={rule.key}
                    rule={rule}
                    error={problems.rules[rule.key]}
                    onChange={(patch) => update(rule.key, patch)}
                    onRemove={() => remove(rule.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={noConsent || hasProblems(problems)}
          onClick={() => {
            save.reset();
            setConfirming(true);
          }}
        >
          Save hours
        </Button>
        <Button variant="outline" onClick={copyMondayToWeekdays}>
          Copy Monday to Tue–Fri
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {save.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {describeError(save.error, "mutation").message}
        </p>
      ) : null}

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={clearsTheSchedule(draft) ? "Remove all working hours?" : "Save these working hours?"}
        confirmLabel={clearsTheSchedule(draft) ? "Remove all hours" : "Save hours"}
        destructive={clearsTheSchedule(draft)}
        pending={save.isPending}
        consequence={
          <>
            <p>This replaces the partner&apos;s whole week. They&apos;ll see the change in the Partner app.</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {weekSummary(draft, areaNames).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </>
        }
        onConfirm={() =>
          save.mutate(draft, {
            onSuccess: () => {
              setConfirming(false);
              onDone();
            },
            onError: () => setConfirming(false),
          })
        }
      />
    </div>
  );
}

/**
 * A partner's working hours on their record: read first, then edit what is there. Changing them
 * is for when the partner can't (a lost phone, a support call); normally they set their own.
 */
export function PartnerHours({ partnerId }: { partnerId: string }) {
  const schedule = usePartnerSchedule(partnerId);
  const [editing, setEditing] = useState(false);

  return (
    <section aria-labelledby="partner-hours" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="partner-hours" className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Working hours
        </h3>
        {!editing && schedule.data ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit working hours
          </Button>
        ) : null}
      </div>
      {schedule.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : schedule.isError || !schedule.data ? (
        <ErrorState
          severity="warning"
          title="Working hours could not be loaded"
          message="Nothing is shown rather than a wrong week."
          actionLabel="Try again"
          onAction={() => void schedule.refetch()}
        />
      ) : editing ? (
        <HoursEditor schedule={schedule.data} partnerId={partnerId} onDone={() => setEditing(false)} />
      ) : (
        <WeekView schedule={schedule.data} />
      )}
    </section>
  );
}
