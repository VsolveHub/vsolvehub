"use client";

import { Button, Card, ErrorState, Field, Input, Select } from "@vsolve/ui";
import { useState } from "react";
import { ApiRequestError } from "@vsolve/api-client";

import { maskId } from "@/features/shared/identifiers";
import {
  WEEKDAYS,
  clearsTheSchedule,
  describeWeek,
  hasProblems,
  validateSchedule,
  weekdayLabel,
  type ExceptionDraft,
  type RuleDraft,
  type ScheduleDraft,
} from "../model/schedule";
import {
  isScheduleRefused,
  isUnknownPartner,
  useReplacePartnerSchedule,
  type ScheduleResult,
} from "../queries";

/**
 * Rewriting a Partner's working week from Operations.
 *
 * ## The console says what it cannot see
 *
 * There is no Operations read of a Partner's schedule, so this editor opens
 * empty and cannot show what the Partner has now. That limitation is stated on
 * the screen rather than hidden behind a blank form, because an empty form looks
 * exactly like a Partner with no hours — and the difference between those two
 * readings is somebody's entire week.
 *
 * ## Saving replaces, and the summary says so
 *
 * Before the command is sent the operator reads back the week the Partner will
 * be left with, in words. Clearing the schedule entirely gets its own
 * confirmation with its own wording, because it is the outcome an untouched form
 * would otherwise produce by accident.
 */

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

const EMPTY: ScheduleDraft = {
  partnerId: "",
  consentPurpose: "",
  consentVersion: "",
  rules: [],
  exceptions: [],
};

function newRule(): RuleDraft {
  return {
    key: nextKey(),
    serviceAreaId: "",
    weekday: 0,
    startsAt: "09:00",
    endsAt: "17:00",
    endsNextDay: false,
  };
}

function newException(): ExceptionDraft {
  return {
    key: nextKey(),
    serviceAreaId: "",
    date: "",
    isAvailable: false,
    startsAt: "09:00",
    endsAt: "17:00",
    endsNextDay: false,
    reason: "",
  };
}

function SavedSchedule({ result }: { result: ScheduleResult }) {
  return (
    <Card className="mt-5 p-5">
      <h3 className="text-base font-bold text-text">Schedule saved</h3>
      <p className="mt-1 text-sm text-text-secondary">
        This is the Partner&apos;s week as it now stands.
      </p>

      {result.rules.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-danger-text">
          No working hours. This Partner will receive no offers until hours are
          added back.
        </p>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
          {result.rules.map((rule) => (
            <li key={rule.id}>
              {weekdayLabel(rule.weekday)}{" "}
              <span data-numeric>
                {rule.starts_at}–{rule.ends_at}
              </span>
              {rule.ends_next_day ? " (ends the next day)" : ""}
            </li>
          ))}
        </ul>
      )}

      {result.exceptions.length > 0 ? (
        <ul className="mt-3 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
          {result.exceptions.map((exception) => (
            <li key={exception.id}>
              <span data-numeric>{exception.date}</span>:{" "}
              {exception.is_available ? "working" : "not working"}
              {exception.reason ? ` — ${exception.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function AvailabilityEditor() {
  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const save = useReplacePartnerSchedule();

  const problems = validateSchedule(draft);
  const blocked = hasProblems(problems);
  const clearing = clearsTheSchedule(draft);

  function update(next: Partial<ScheduleDraft>) {
    setDraft((current) => ({ ...current, ...next }));
    setConfirming(false);
    if (save.isError || save.isSuccess) save.reset();
  }

  function updateRule(key: string, next: Partial<RuleDraft>) {
    update({
      rules: draft.rules.map((rule) => (rule.key === key ? { ...rule, ...next } : rule)),
    });
  }

  function updateException(key: string, next: Partial<ExceptionDraft>) {
    update({
      exceptions: draft.exceptions.map((entry) =>
        entry.key === key ? { ...entry, ...next } : entry,
      ),
    });
  }

  return (
    <div>
      <Card className="border-warning-line bg-warning-surface p-5">
        <h2 className="text-base font-bold text-warning-text">
          Saving replaces the Partner&apos;s whole week
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-warning-text">
          Every working hour and dated exception they have is deleted and
          replaced by what you enter here. This console cannot read their current
          schedule — no such read is published — so ask the Partner what they
          work now, or have them change it themselves from their own app.
        </p>
      </Card>

      <Card className="mt-5 p-5">
        <h3 className="text-base font-bold text-text">Who, and under what consent</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="Partner id"
            required
            error={submitted ? problems.form.partnerId : undefined}
          >
            <Input
              value={draft.partnerId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update({ partnerId: event.target.value })}
            />
          </Field>
          <Field
            label="Consent purpose"
            description="The consent they gave for you to change this."
            required
            error={submitted ? problems.form.consentPurpose : undefined}
          >
            <Input
              value={draft.consentPurpose}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update({ consentPurpose: event.target.value })}
            />
          </Field>
          <Field
            label="Consent version"
            required
            error={submitted ? problems.form.consentVersion : undefined}
          >
            <Input
              value={draft.consentVersion}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update({ consentVersion: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-text">Weekly hours</h3>
          <Button variant="outline" size="sm" onClick={() => update({ rules: [...draft.rules, newRule()] })}>
            Add a window
          </Button>
        </div>

        {draft.rules.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            No windows yet. A Partner with no weekly hours receives no offers.
          </p>
        ) : (
          <ul className="mt-4 flex list-none flex-col gap-4 p-0">
            {draft.rules.map((rule) => (
              <li key={rule.key} className="rounded-card border border-line p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Service area id" required>
                    <Input
                      value={rule.serviceAreaId}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) =>
                        updateRule(rule.key, { serviceAreaId: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Day" required>
                    <Select
                      value={String(rule.weekday)}
                      onChange={(event) =>
                        updateRule(rule.key, { weekday: Number(event.target.value) })
                      }
                    >
                      {WEEKDAYS.map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Starts" required>
                    <Input
                      type="time"
                      value={rule.startsAt}
                      onChange={(event) => updateRule(rule.key, { startsAt: event.target.value })}
                    />
                  </Field>
                  <Field label="Ends" required>
                    <Input
                      type="time"
                      value={rule.endsAt}
                      onChange={(event) => updateRule(rule.key, { endsAt: event.target.value })}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={rule.endsNextDay}
                      onChange={(event) =>
                        updateRule(rule.key, { endsNextDay: event.target.checked })
                      }
                    />
                    Ends the next day
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update({ rules: draft.rules.filter((entry) => entry.key !== rule.key) })
                    }
                  >
                    Remove this window
                  </Button>
                </div>

                {submitted && problems.rules[rule.key] ? (
                  <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
                    {problems.rules[rule.key]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-text">Dated exceptions</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ exceptions: [...draft.exceptions, newException()] })}
          >
            Add an exception
          </Button>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          One-off days that override the weekly hours — a day off, or a day
          worked outside the usual pattern.
        </p>

        {draft.exceptions.length > 0 ? (
          <ul className="mt-4 flex list-none flex-col gap-4 p-0">
            {draft.exceptions.map((exception) => (
              <li key={exception.key} className="rounded-card border border-line p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Service area id" required>
                    <Input
                      value={exception.serviceAreaId}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) =>
                        updateException(exception.key, { serviceAreaId: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Date" required>
                    <Input
                      type="date"
                      value={exception.date}
                      onChange={(event) =>
                        updateException(exception.key, { date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="That day" required>
                    <Select
                      value={exception.isAvailable ? "working" : "off"}
                      onChange={(event) =>
                        updateException(exception.key, {
                          isAvailable: event.target.value === "working",
                        })
                      }
                    >
                      <option value="off">Not working</option>
                      <option value="working">Working</option>
                    </Select>
                  </Field>
                  <Field label="Reason" description="Shown in the audit record.">
                    <Input
                      value={exception.reason}
                      maxLength={200}
                      onChange={(event) =>
                        updateException(exception.key, { reason: event.target.value })
                      }
                    />
                  </Field>
                </div>

                {exception.isAvailable ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Starts" required>
                      <Input
                        type="time"
                        value={exception.startsAt}
                        onChange={(event) =>
                          updateException(exception.key, { startsAt: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Ends" required>
                      <Input
                        type="time"
                        value={exception.endsAt}
                        onChange={(event) =>
                          updateException(exception.key, { endsAt: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {exception.isAvailable ? (
                    <label className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={exception.endsNextDay}
                        onChange={(event) =>
                          updateException(exception.key, { endsNextDay: event.target.checked })
                        }
                      />
                      Ends the next day
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update({
                        exceptions: draft.exceptions.filter(
                          (entry) => entry.key !== exception.key,
                        ),
                      })
                    }
                  >
                    Remove this exception
                  </Button>
                </div>

                {submitted && problems.exceptions[exception.key] ? (
                  <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
                    {problems.exceptions[exception.key]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {!confirming ? (
        <Button
          className="mt-5"
          variant="outline"
          onClick={() => {
            setSubmitted(true);
            if (!blocked) setConfirming(true);
          }}
        >
          Review this schedule
        </Button>
      ) : (
        <Card
          className={[
            "mt-5 p-5",
            clearing ? "border-danger-line bg-danger-surface" : "",
          ].join(" ")}
        >
          <h3 className={`text-base font-bold ${clearing ? "text-danger-text" : "text-text"}`}>
            {clearing
              ? "This clears the Partner's schedule"
              : "Confirm the week you are writing"}
          </h3>

          <p className="mt-1 text-sm text-text-secondary">
            Partner <span data-numeric>{maskId(draft.partnerId)}</span>, under{" "}
            {draft.consentPurpose.trim()} version {draft.consentVersion.trim()}.
            Everything they have now is replaced by this.
          </p>

          <ul className="mt-3 flex list-none flex-col gap-1 p-0 text-sm text-text">
            {describeWeek(draft).map((line) => (
              <li key={line} data-numeric>
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant={clearing ? "danger" : "primary"}
              loading={save.isPending}
              loadingLabel="Saving the schedule"
              onClick={() => save.mutate(draft)}
            >
              {clearing ? "Clear this Partner's schedule" : "Replace the schedule"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </div>
        </Card>
      )}

      {save.isError ? (
        <ErrorState
          className="mt-5"
          title={
            isUnknownPartner(save.error)
              ? "We could not find that Partner"
              : isScheduleRefused(save.error)
                ? "This schedule was not accepted"
                : "We could not save the schedule"
          }
          message={
            isUnknownPartner(save.error)
              ? "Check the Partner id. Their schedule is unchanged."
              : isScheduleRefused(save.error) && save.error instanceof ApiRequestError
                ? `${save.error.message} Their schedule is unchanged.`
                : "Their schedule is unchanged. Check your connection and try again."
          }
        />
      ) : null}

      {save.isSuccess ? <SavedSchedule result={save.data} /> : null}
    </div>
  );
}
