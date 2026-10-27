"use client";

import { Button, ChoiceChips, Disclosure, ErrorState, QuantityStepper, cn, formatMoney, useT } from "@vsolve/ui";
import {
  attendanceCeiling,
  describeError,
  isAmendmentRequired,
  isPolicyUnavailable,
  isStageTransitionNotAllowed,
  shiftAddOns,
  shiftOvertime,
} from "@vsolve/query";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";

import {
  useProposeShiftExtra,
  useRecordShiftAttendance,
  type ShiftCommandScope,
  type ShiftDay,
} from "../queries";

/**
 * Evening close — who came, extra hours, today's amount, one send.
 *
 * The server takes only a **count** (`SIM-02` refuses a per-worker roll call:
 * the workers mostly do not carry smartphones and the supervisor does), so the
 * tap grid is a way of counting, not a check-in — `present_count` is the number
 * of ticked names and nothing per person leaves the phone. With no crew named
 * the grid gives way to a stepper against the booked ceiling.
 *
 * Money is per-worker paise the server published on the day; the lines here
 * multiply it by the count in front of the supervisor, and the settled figure
 * is still the server's `amount_paise` once the customer answers. Overtime is
 * a proposal at the published hourly rate — unapproved overtime is not paid,
 * which is why its line says "pending" and the collect line is a range.
 *
 * `shift_ended_at` is never captured here: the server settles at the standard
 * shift and flags the day for review, which is a note and not a dispute.
 */

export const WHO_CAME_ID = "who-came";

export interface EveningCloseProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  readonly canConfirm: boolean;
  readonly canPropose: boolean;
  readonly customerFirstName: string;
  /** True while the two-step send is in flight or the overtime step needs a retry. */
  readonly onBusy: (busy: boolean) => void;
}

function overtimeOptions(t: ReturnType<typeof useT>) {
  return [
    { value: "0", label: t("work.eveningClose.overtime.none") },
    { value: "1", label: t("work.eveningClose.overtime.hours", { hours: 1 }) },
    { value: "2", label: t("work.eveningClose.overtime.hours", { hours: 2 }) },
    { value: "3", label: t("work.eveningClose.overtime.hours", { hours: 3 }) },
  ] as const;
}

/** The amendment reason the customer reads: "2 extra hours on Day 3". */
function overtimeReason(t: ReturnType<typeof useT>, hours: number, dayName: string): string {
  return t("work.eveningClose.overtimeReason", { count: hours, day: dayName });
}

const CHIP =
  "flex min-h-11 items-center gap-2 rounded-control border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

function crewKey(member: ShiftDay["crew"][number], index: number): string {
  return member.membership_id ?? `${member.display_name}#${index}`;
}

export function EveningClose({ day, scope, canConfirm, canPropose, customerFirstName, onBusy }: EveningCloseProps) {
  const t = useT();
  const record = useRecordShiftAttendance(scope);
  const propose = useProposeShiftExtra(scope);
  const overtime = shiftOvertime(day);
  const ceiling = attendanceCeiling(day);
  const crew = day.crew;

  const [absent, setAbsent] = useState<readonly string[]>([]);
  const [counted, setCounted] = useState<number>(ceiling ?? crew.length);
  const [hours, setHours] = useState(0);
  const [overtimeFailed, setOvertimeFailed] = useState(false);

  const present = crew.length > 0 ? crew.length - absent.length : counted;
  const expected = ceiling ?? (crew.length > 0 ? crew.length : null);
  const basePaise = present * day.per_worker_paise;
  const overtimeHours = overtime.hourlyPaise === null ? 0 : hours;
  const overtimePaise = overtime.hourlyPaise === null ? 0 : overtimeHours * present * overtime.hourlyPaise;
  const dayName =
    day.day_label.trim() === ""
      ? t("work.shiftDay.dayPosition", { position: day.position })
      : day.day_label;

  const send = async () => {
    onBusy(true);
    setOvertimeFailed(false);
    try {
      await record.mutateAsync({ presentCount: present, shiftEndedAt: null });
    } catch {
      onBusy(false);
      return;
    }
    if (overtimeHours > 0) {
      try {
        await propose.mutateAsync({
          kind: "OVERTIME",
          hours: overtimeHours,
          addOnCode: "",
          workerDays: 0,
          reason: overtimeReason(t, overtimeHours, dayName),
        });
      } catch {
        setOvertimeFailed(true);
        return;
      }
    }
    onBusy(false);
  };

  // The count went through but the overtime did not: say so, offer the retry,
  // and let the supervisor move on without it.
  if (overtimeFailed) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text">
          {t("work.eveningClose.sentTo", {
            present,
            expected: expected ?? present,
            name: customerFirstName,
          })}
        </p>
        <ExtraFailure error={propose.error} />
        <Button
          type="button"
          block
          onClick={() => {
            setOvertimeFailed(false);
            void propose
              .mutateAsync({
                kind: "OVERTIME",
                hours: overtimeHours,
                addOnCode: "",
                workerDays: 0,
                reason: overtimeReason(t, overtimeHours, dayName),
              })
              .then(() => onBusy(false))
              .catch(() => setOvertimeFailed(true));
          }}
          loading={propose.isPending}
          loadingLabel={t("work.eveningClose.sending")}
        >
          {t("work.eveningClose.retryOvertime", { hours: overtimeHours })}
        </Button>
        <Button type="button" variant="ghost" block onClick={() => onBusy(false)}>
          {t("work.eveningClose.skipOvertime")}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="close-heading">
      <h2 id="close-heading" className="text-lg font-semibold text-text">
        {t("work.eveningClose.heading", { day: dayName })}
      </h2>

      <div id={WHO_CAME_ID} className="flex flex-col gap-2 scroll-mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("work.eveningClose.whoCame")}</p>
          <p className="text-sm font-semibold tabular-nums text-text">
            {expected === null
              ? present
              : t("work.eveningClose.presentOfExpected", { present, expected })}
          </p>
        </div>
        {crew.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {crew.map((member, index) => {
              const key = crewKey(member, index);
              const came = !absent.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={came}
                  disabled={record.isPending || !canConfirm}
                  onClick={() => setAbsent(came ? [...absent, key] : absent.filter((id) => id !== key))}
                  className={cn(
                    CHIP,
                    came
                      ? "border-selected bg-selected-surface font-semibold text-text"
                      : "border-line-strong bg-surface text-text-secondary line-through",
                  )}
                >
                  {member.display_name}
                  <Pictogram name={came ? "yes" : "no"} size="xs" className={came ? "text-action" : "text-text-muted"} />
                </button>
              );
            })}
          </div>
        ) : (
          <QuantityStepper
            label={t("work.eveningClose.peopleHere")}
            value={counted}
            onChange={setCounted}
            min={0}
            {...(ceiling === null ? {} : { max: ceiling })}
            decrementLabel={t("work.eveningClose.oneFewer")}
            incrementLabel={t("work.eveningClose.oneMore")}
            disabled={record.isPending || !canConfirm}
          />
        )}
      </div>

      {overtime.hourlyPaise === null ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("work.eveningClose.extraHoursQ")}</p>
          <ChoiceChips
            label={t("work.eveningClose.extraHoursLabel")}
            name="overtime-hours"
            layout="bar"
            options={overtimeOptions(t)}
            value={String(hours)}
            onChange={(value) => setHours(Number.parseInt(value, 10))}
            disabled={record.isPending || propose.isPending || !canPropose}
          />
          {overtimeHours > 0 ? (
            <p className="text-sm text-text-secondary">
              {t("work.eveningClose.overtimeMaths", {
                hours: overtimeHours,
                present,
                amount: formatMoney(overtimePaise),
              })}
            </p>
          ) : null}
        </div>
      )}

      <dl className="flex flex-col gap-1 rounded-control border border-line bg-surface-sunken px-3 py-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("work.eveningClose.todaysAmount")}</p>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">
            {present} × {formatMoney(day.per_worker_paise)}
          </dt>
          <dd className="font-semibold tabular-nums text-text">{formatMoney(basePaise)}</dd>
        </div>
        {overtimeHours > 0 ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-secondary">{t("work.eveningClose.overtimeLine", { hours: overtimeHours })}</dt>
            <dd className="tabular-nums text-text-secondary">
              {formatMoney(overtimePaise)} <span className="text-xs">{t("work.eveningClose.pending")}</span>
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 border-t border-line pt-1">
          <dt className="font-semibold text-text">{t("work.eveningClose.collectFrom", { name: customerFirstName })}</dt>
          <dd className="font-semibold tabular-nums text-text">
            {overtimePaise > 0
              ? `${formatMoney(basePaise)}–${formatMoney(basePaise + overtimePaise)}`
              : formatMoney(basePaise)}
          </dd>
        </div>
      </dl>

      {canConfirm ? (
        <Button
          type="button"
          block
          size="lg"
          onClick={() => void send()}
          loading={record.isPending || propose.isPending}
          loadingLabel={t("work.eveningClose.sending")}
          disabled={record.isPending || propose.isPending}
        >
          {t("work.eveningClose.sendTo", { name: customerFirstName })}
        </Button>
      ) : (
        <p className="text-sm text-text-secondary">{t("work.eveningClose.cannotConfirm")}</p>
      )}

      {record.isError ? <AttendanceFailure error={record.error} /> : null}

      <ExtrasDisclosure day={day} scope={scope} canPropose={canPropose} customerFirstName={customerFirstName} addOnsOnly />
    </section>
  );
}

/**
 * Add-ons from the frozen card, and — after the day is recorded — overtime.
 *
 * No amount box: the server prices every extra from the card frozen at booking.
 */
export function ExtrasDisclosure({
  day,
  scope,
  canPropose,
  customerFirstName,
  addOnsOnly = false,
}: {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  readonly canPropose: boolean;
  readonly customerFirstName: string;
  /** The evening screen asks for overtime itself; only add-ons go behind the chevron. */
  readonly addOnsOnly?: boolean;
}) {
  const t = useT();
  const propose = useProposeShiftExtra(scope);
  const addOns = shiftAddOns(day);
  const overtime = shiftOvertime(day);
  const offersOvertime = !addOnsOnly && overtime.hourlyPaise !== null;

  const [code, setCode] = useState<string | null>(null);
  const [workerDays, setWorkerDays] = useState(1);
  const [hours, setHours] = useState(0);

  if (!canPropose || (addOns.length === 0 && !offersOvertime)) return null;

  const dayName =
    day.day_label.trim() === ""
      ? t("work.shiftDay.dayPosition", { position: day.position })
      : day.day_label;
  const chosen = addOns.find((addOn) => addOn.code === code) ?? null;

  return (
    <Disclosure summary={
        offersOvertime
          ? t("work.eveningClose.extras.summaryWithOvertime")
          : t("work.eveningClose.extras.summary")
      }>
      <div className="flex flex-col gap-4 py-2">
        {offersOvertime ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("work.eveningClose.extras.extraHours")}</p>
            <ChoiceChips
              label={t("work.eveningClose.extraHoursLabel")}
              name="late-overtime-hours"
              layout="bar"
              options={overtimeOptions(t)}
              value={String(hours)}
              onChange={(value) => setHours(Number.parseInt(value, 10))}
              disabled={propose.isPending}
            />
            {hours > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  propose.mutate(
                    {
                      kind: "OVERTIME",
                      hours,
                      addOnCode: "",
                      workerDays: 0,
                      reason: overtimeReason(t, hours, dayName),
                    },
                    { onSuccess: () => setHours(0) },
                  )
                }
                loading={propose.isPending}
                loadingLabel={t("work.eveningClose.sending")}
              >
                {t("work.eveningClose.extras.askHours", { name: customerFirstName, hours })}
              </Button>
            ) : null}
          </div>
        ) : null}

        {addOns.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("work.eveningClose.extras.addOn")}</p>
            <ChoiceChips
              label={t("work.eveningClose.extras.whichAddOn")}
              name="add-on-code"
              options={addOns.map((addOn) => ({
                value: addOn.code,
                label: addOn.code.replace(/[_-]+/g, " "),
                description: t("work.eveningClose.extras.perWorkerDay", {
                  amount: formatMoney(addOn.ratePaise),
                }),
              }))}
              value={code}
              onChange={setCode}
              disabled={propose.isPending}
            />
            {chosen === null ? null : (
              <>
                <QuantityStepper
                  label={t("work.eveningClose.extras.workerDays")}
                  value={workerDays}
                  onChange={setWorkerDays}
                  min={1}
                  decrementLabel={t("work.eveningClose.oneFewer")}
                  incrementLabel={t("work.eveningClose.oneMore")}
                  disabled={propose.isPending}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    propose.mutate(
                      {
                        kind: "ADD_ON",
                        hours: 0,
                        addOnCode: chosen.code,
                        workerDays,
                        reason: t("work.eveningClose.extras.addOnReason", {
                          addOn: chosen.code.replace(/[_-]+/g, " "),
                          workerDays,
                          day: dayName,
                        }),
                      },
                      { onSuccess: () => setCode(null) },
                    )
                  }
                  loading={propose.isPending}
                  loadingLabel={t("work.eveningClose.sending")}
                >
                  {t("work.eveningClose.extras.askAmount", {
                    name: customerFirstName,
                    amount: formatMoney(chosen.ratePaise * workerDays),
                  })}
                </Button>
              </>
            )}
          </div>
        )}

        {propose.isSuccess ? <p className="text-sm text-text-secondary">{t("work.eveningClose.extras.sent", { name: customerFirstName })}</p> : null}
        {propose.isError ? <ExtraFailure error={propose.error} /> : null}
      </div>
    </Disclosure>
  );
}

function AttendanceFailure({ error }: { readonly error: unknown }) {
  const t = useT();
  const presentation = describeError(error, "mutation");
  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title={t("work.eveningClose.moved.title")}
        message={t("work.eveningClose.moved.message")}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}

/** `m2_policy_unavailable` is Vsolve's gap: the after-shift window is not set. */
function ExtraFailure({ error }: { readonly error: unknown }) {
  const t = useT();
  const presentation = describeError(error, "mutation");
  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        title={t("work.eveningClose.policy.title")}
        message={t("work.eveningClose.policy.message")}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  if (isAmendmentRequired(error) || isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title={t("work.eveningClose.noPrice")}
        message={presentation.message}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
