"use client";

import { describeError } from "@vsolve/query";
import { ErrorState, cn, formatMoney } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { CompletionRating } from "@/features/ratings/view/completion-rating";
import { STATUS_COPY, type StatusTone } from "@/features/work/model/status";
import {
  canAbort,
  canArrive,
  canGoEnRoute,
  canRelease,
  canReportCompletion,
  canStartWork,
  useAbortWork,
  useMarkArrived,
  useMarkCustomerUnavailable,
  useMarkEnRoute,
  useReleaseBooking,
  useSubmitCompletion,
  useVerifyStartOtp,
  type OutcomeInput,
  type PartnerVisit,
  type VisitStatus,
} from "@/features/work/queries";

/**
 * The A1 single-visit job screen — the design canvas artboards
 * "5 · Doing it today" (`Today.dc.html`) and "6 · Proof you were there"
 * (`Arrive.dc.html`).
 *
 * One screen, one route, several render branches, because a real visit moves
 * through all of them in place: booked → on the way → arrived → the customer's
 * start code → the completion report → settled.
 *
 * ## The branch is the state machine, not a layout choice
 *
 * `ALLOWED_TRANSITIONS` permits exactly one forward move from each status, so
 * the `can*` predicates in `features/work/queries.ts` pick a single primary
 * control and there is never a second one to choose between. Django still
 * refuses anything they get wrong; nothing here is the authority.
 *
 * ## What the canvas draws that is not here
 *
 * 1. **The call-customer button.** `Today.dc.html` ends in a large green call
 *    button and the approved spec lists it as a feature. No phone number is
 *    published to reach it: `Schemas["PartnerBooking"]`
 *    (`schema.d.ts:7926-7948`) carries no contact object at all, and the only
 *    `phone_number` fields in the whole generated schema belong to
 *    `PartnerProfile` and `User` — this Partner's own number, not the
 *    customer's. `VisitVendor`'s docblock (`schema.d.ts:11111`) states the rule
 *    outright: "No phone number and no address. Contact is released by the
 *    engagement, not by a visit." `POST /partner/bookings/{id}/contact-attempts/`
 *    exists but only *records* an attempt; it hands back no number. A `tel:`
 *    link against a field that does not exist would be a dead button, so there
 *    is none. **"Customer is not here"** below is the real, published control
 *    for the situation that button was for.
 * 2. **The camera-first evidence capture.** `POST
 *    /partner/bookings/{id}/evidence/uploads/` is published, but no hook in
 *    `features/work/queries.ts` mounts it and wiring the presign/PUT/finalize
 *    pipeline is a change to that module rather than to this view. What the
 *    completion report actually settles money from is the per-task outcome list
 *    (`SubmitCompletionRequestRequest`, `schema.d.ts:10631`), and that is what
 *    this screen collects.
 * 3. **Abort and release now carry a free-text reason on this screen.** Both
 *    commands take a non-empty `reason` string — a paragraph of typing on a
 *    screen built for somebody who may not read comfortably. Task 7's
 *    `CrewOfferOutcome` "do not travel yet" ruling already established the
 *    precedent that safety or consequence can justify prose on this redesign;
 *    handing back a job someone cannot get to is exactly that case, so
 *    `ReleaseAction` below carries the one textarea on this screen.
 */
export function VisitJobView({ visit }: { readonly visit: PartnerVisit }) {
  const router = useRouter();

  // Every command is declared unconditionally: the branches below return early,
  // and a hook inside one of them would be a conditional hook.
  const enRoute = useMarkEnRoute();
  const arrived = useMarkArrived();
  const unavailable = useMarkCustomerUnavailable();

  const status = STATUS_COPY[visit.status];
  const versioned = { bookingId: visit.id, expectedVersion: visit.version };
  const busy = enRoute.isPending || arrived.isPending || unavailable.isPending;
  const commandError = enRoute.error ?? arrived.error ?? unavailable.error;
  const money = visit.earning ?? visit.estimated_earning;

  return (
    <>
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
      <header className="bg-[linear-gradient(150deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-4 pb-6">
        <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface/13 transition-colors duration-200 hover:bg-surface/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse"
        >
          <Pictogram name="back" size="md" className="text-surface" />
          <span className="sr-only">Back</span>
        </button>
          <span className="rounded-full border border-surface/25 bg-surface/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.05em] text-surface">
            {status.label}
          </span>
        </div>

        <p className="mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-navy-200">
          Service visit
        </p>
        <JobTitle visit={visit} />

        <div className={cn("mt-5 grid gap-2", money ? "grid-cols-2" : "grid-cols-1")}>
          <HeroFact
            icon="time"
            label="Starts"
            value={clockTime(visit.scheduled_start) ?? "Time pending"}
          />
          {money ? (
            <HeroFact
              icon="money"
              label={visit.earning ? "Final earning" : "Estimated earning"}
              value={formatMoney(money.net_paise)}
            />
          ) : null}
        </div>
      </header>

      {commandError ? (
        <div className="px-4 pt-4">
          <CommandFailure error={commandError} />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-5">
        <ServiceDetails visit={visit} />
        <VisitDetails visit={visit} />

        <section
          aria-labelledby="next-step-heading"
          className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-selected-surface text-action-secondary">
              <Pictogram name={STATUS_PICTOGRAM[visit.status]} size="md" />
            </span>
            <span className="min-w-0">
              <h2 id="next-step-heading" className="text-base font-extrabold text-text">
                Next step
              </h2>
              <p className="mt-0.5 text-sm leading-5 text-text-secondary">
                {STATUS_GUIDANCE[visit.status]}
              </p>
            </span>
          </div>

          <div className="flex flex-col gap-3">
        {canGoEnRoute(visit) ? (
          <BigAction
            tone="secondary"
            icon="go"
            label="I am on my way"
            disabled={busy}
            onClick={() => enRoute.mutate(versioned)}
          />
        ) : null}

        {canArrive(visit) ? (
          <BigAction
            tone="success"
            icon="yes"
            label="I have arrived"
            disabled={busy}
            onClick={() => arrived.mutate(versioned)}
          />
        ) : null}

        {canStartWork(visit) ? <StartCodePad visit={visit} /> : null}

        {/* Published for `ARRIVED` only, and only once — a second attempt would
            restart a wait the server is already timing. */}
        {visit.status === "ARRIVED" && visit.customer_unavailable_wait_started_at === null ? (
          <SecondaryAction
            icon="later"
            label="Nobody is here"
            consequence="Starts a paid wait. You keep the job."
            disabled={busy}
            onClick={() => unavailable.mutate(versioned)}
          />
        ) : null}

        {/*
          Handing the job back is the last thing on the screen, under a rule and
          a gap. It is the only control here that loses the Partner the job, and
          at `ARRIVED` it renders directly beneath "Nobody is here" — the pair
          this separation exists to keep apart.
        */}
        {canAbort(visit) || canRelease(visit) ? (
          <div className="mt-2 border-t border-line pt-4">
            <ReleaseAction visit={visit} />
          </div>
        ) : null}

        {canReport(visit) ? <CompletionReport visit={visit} /> : null}

            {isWaiting(visit) ? <StatusMedallion status={visit.status} /> : null}
          </div>
        </section>
      </div>
    </main>
    <div className="bg-canvas px-4 pb-5">
      <CompletionRating
        subject="booking"
        id={visit.id}
        isComplete={visit.status === "COMPLETED" || visit.status === "PARTIALLY_COMPLETED"}
      />
    </div>
    </>
  );
}

/**
 * What this job is, from the durable booked scope.
 *
 * `display_title` is derived from immutable fulfilment-unit lines, so it exists
 * while a confirmed booking still has no operational `work_tasks`. Task labels
 * remain a compatibility fallback for older projections; only a record with
 * neither renders "Your job".
 */
function JobTitle({ visit }: { readonly visit: PartnerVisit }) {
  const durableTitle = visit.display_title?.trim() || null;
  const [first, ...rest] = visit.work_tasks;

  return (
    <h1 className="mt-1 max-w-[28ch] text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-surface">
      {durableTitle ?? (first === undefined ? "Your job" : first.label)}
      {durableTitle === null && rest.length > 0 ? (
        <span className="font-semibold text-navy-200"> +{rest.length} more</span>
      ) : null}
    </h1>
  );
}

function HeroFact({
  icon,
  label,
  value,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-card border border-surface/15 bg-surface/10 px-3 py-2.5">
      <Pictogram name={icon} size="md" className="shrink-0 text-action-hover" />
      <span className="min-w-0">
        <span className="block text-[0.625rem] font-bold uppercase tracking-[0.06em] text-navy-200">
          {label}
        </span>
        <span className="block truncate text-base font-extrabold tabular-nums text-surface">
          {value}
        </span>
      </span>
    </div>
  );
}

/** The immutable booked scope, available before start-OTP creates work tasks. */
function ServiceDetails({ visit }: { readonly visit: PartnerVisit }) {
  return (
    <section
      aria-labelledby="service-details-heading"
      className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-selected-surface text-action-secondary">
          <Pictogram name="all-work" size="md" />
        </span>
        <span>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
            Booked scope
          </p>
          <h2 id="service-details-heading" className="text-base font-extrabold text-text">
            Service details
          </h2>
        </span>
      </div>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-sunken">
        {visit.service_lines.length > 0 ? (
          visit.service_lines.map((line) => (
            <li key={line.line_id} className="flex items-center gap-3 px-3.5 py-3">
              <Pictogram name="yes" size="sm" className="shrink-0 text-success-text" />
              <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text">
                {line.service_label}
              </span>
              {line.quantity > 1 ? (
                <span className="shrink-0 rounded-full border border-line bg-surface px-2 py-1 text-xs font-bold text-text-secondary">
                  Qty {line.quantity}
                </span>
              ) : null}
            </li>
          ))
        ) : (
          <li className="flex items-center gap-3 px-3.5 py-3">
            <Pictogram name="yes" size="sm" className="shrink-0 text-success-text" />
            <span className="text-sm font-semibold leading-5 text-text">
              {visit.display_title?.trim() || "Your booked service"}
            </span>
          </li>
        )}
      </ul>

      {visit.requirements.length > 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center gap-2 text-sm font-bold text-text">
            <Pictogram name="doing" size="sm" className="text-action-secondary" />
            Bring with you
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {visit.requirements.map((requirement) => (
              <li
                key={requirement}
                className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-xs font-semibold capitalize text-text-secondary"
              >
                {requirement}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function VisitDetails({ visit }: { readonly visit: PartnerVisit }) {
  return (
    <section aria-labelledby="visit-details-heading">
      <h2 id="visit-details-heading" className="mb-2 text-sm font-extrabold text-text">
        Visit details
      </h2>
      <dl className="grid grid-cols-2 gap-2">
        <DetailFact icon="date" label="Date" value={calendarDate(visit.scheduled_start)} />
        <DetailFact
          icon="time"
          label="Start time"
          value={clockTime(visit.scheduled_start) ?? "Time pending"}
        />
        <DetailFact
          icon="days"
          label="Expected work"
          value={durationLabel(visit.estimated_duration_minutes)}
        />
        {visit.approximate_area ? (
          <DetailFact icon="distance" label="Service area" value={visit.approximate_area} />
        ) : null}
      </dl>
    </section>
  );
}

function DetailFact({
  icon,
  label,
  value,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-3 py-3">
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-text-muted">
        <Pictogram name={icon} size="sm" className="shrink-0" />
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold leading-5 text-text">{value}</dd>
    </div>
  );
}

const STATUS_GUIDANCE: Record<VisitStatus, string> = {
  CONFIRMED: "Review the scope and tools, then start travelling when you are ready.",
  EN_ROUTE: "Mark arrival only after you have reached the customer’s site.",
  ARRIVED: "Ask the customer for the start code before beginning the work.",
  IN_PROGRESS: "Complete the booked scope, then report the outcome of every task.",
  ABORTED: "Report what was completed so the job can be settled correctly.",
  COMPLETION_SUBMITTED: "Your report is with the customer. No action is needed right now.",
  COMPLETED: "This job is complete and its final earning is shown above.",
  PARTIALLY_COMPLETED: "The completed portion has been recorded and settled.",
  DISPUTED: "The customer raised a problem. Vsolve will guide the next action.",
  RECOVERY_REQUIRED: "Vsolve support needs to resolve this job before it can continue.",
  CANCELLED: "This visit was cancelled. No travel or work is needed.",
};

/**
 * The statuses that carry no action of their own.
 *
 * Written as an exhaustive table rather than as `!canX && !canY && …` so that a
 * status added to `BookingStatusEnum` is a typecheck failure here instead of a
 * screen that silently renders an empty column. `IN_PROGRESS` and `ABORTED` are
 * `false` and are never read: `isWaiting` answers both from `canReport` before
 * it reaches this table, because whether they have anything to do depends on the
 * task list rather than on the status. They stay listed because the record is
 * total.
 */
const WAITING_STATUS: Record<VisitStatus, boolean> = {
  CONFIRMED: false,
  EN_ROUTE: false,
  ARRIVED: false,
  IN_PROGRESS: false,
  ABORTED: false,
  COMPLETION_SUBMITTED: true,
  COMPLETED: true,
  PARTIALLY_COMPLETED: true,
  DISPUTED: true,
  RECOVERY_REQUIRED: true,
  CANCELLED: true,
};

/**
 * There is a completion report to file, and it is one this Partner can actually
 * send.
 *
 * `canReportCompletion` alone is not enough. The report names an outcome for
 * **every** work task and the request serializer rejects an empty `outcomes`
 * list — `features/work/queries.ts:262-269` says why: Django settles money from
 * these rows, so "nothing to say" is not an answer it can accept. A visit whose
 * `work_tasks` is empty therefore has a form that can never be sent, and
 * rendering it stranded the Partner on a permanently-disabled button with no way
 * off the screen. They are shown where the job got to instead.
 */
function canReport(visit: PartnerVisit): boolean {
  return canReportCompletion(visit) && visit.work_tasks.length > 0;
}

/**
 * Nothing for this Partner to do right now — including the taskless visit above,
 * which has an action in the state machine and no report to hang it on.
 */
function isWaiting(visit: PartnerVisit): boolean {
  if (canReportCompletion(visit)) return !canReport(visit);
  return WAITING_STATUS[visit.status];
}

/* --------------------------------------------------------------------------
   The start code
   -------------------------------------------------------------------------- */

/**
 * The digits the customer reads out, typed in by the Partner.
 *
 * The one place on this screen that cannot be a picture: the code exists
 * precisely so that arriving is proved by the person who booked, and there is
 * nothing to tap it from. Drawn as large as the buttons around it, numeric
 * keypad, and labelled for a screen reader rather than by visible prose.
 */
function StartCodePad({ visit }: { readonly visit: PartnerVisit }) {
  const verify = useVerifyStartOtp();
  const [code, setCode] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {verify.error ? <CommandFailure error={verify.error} /> : null}

      {/*
        Named on screen, not just to a screen reader.

        An unlabelled empty box is not a question anybody can answer: nothing
        told the Partner that a code exists, that the customer holds it, or that
        typing it is what starts the job. The `<label>` and the line beneath it
        are the two shortest sentences that make the control usable, and the
        `aria-label` is dropped because the `<label>` is now the accessible name.
      */}
      <label
        htmlFor="visit-start-code"
        className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted"
      >
        Start code
      </label>

      <input
        id="visit-start-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        className="h-16 rounded-[16px] border-2 border-line-strong bg-surface text-center text-[2.125rem] font-extrabold tracking-[0.28em] tabular-nums text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      />

      <p className="text-[0.8125rem] leading-snug text-text-secondary">
        Ask the customer to read out their code.
      </p>

      <BigAction
        tone="success"
        icon="power"
        label="Start work"
        disabled={code.length === 0 || verify.isPending}
        onClick={() =>
          verify.mutate({ bookingId: visit.id, expectedVersion: visit.version, code })
        }
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   The completion report
   -------------------------------------------------------------------------- */

/**
 * What was done, task by task — the artboard's "proof you were there".
 *
 * Django settles money from these outcomes and an unperformed line is refunded,
 * so a report that let a task go unanswered would either refund work that
 * happened or pay for work that did not. Every task starts unset and the send
 * button stays disabled until all of them are answered — the same rule
 * `work-panel.tsx`'s form enforced, carried over unchanged because it is a money
 * rule rather than a styling one.
 *
 * `notes` is sent empty. `SubmitCompletionRequestRequest` declares it
 * `@default ""` (`schema.d.ts:10631-10637`), so it is genuinely optional, and a
 * free-text box for the customer is the one thing this redesign is built to
 * avoid asking for. `safety_damage_declared` is **not** dropped the same way: it
 * is a declaration with consequences, and it is a single tap. Per-task `reason`
 * (`OutcomeInputRequest.reason`) is different from `notes` — it is not
 * customer-facing — and now carries whatever the Partner types for any outcome
 * that is not `COMPLETED`, so a `PARTIAL`/`BLOCKED`/`NOT_APPLICABLE` report is
 * not silent the way it briefly was on this screen.
 */
function CompletionReport({ visit }: { readonly visit: PartnerVisit }) {
  const submit = useSubmitCompletion();
  const [outcomes, setOutcomes] = useState<Record<string, OutcomeInput["outcome"]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [damage, setDamage] = useState(false);

  const answered = visit.work_tasks.filter((task) => outcomes[task.id] !== undefined).length;
  // `canReport` guarantees a non-empty task list before this mounts.
  const ready = answered === visit.work_tasks.length;

  return (
    <div className="flex flex-col gap-3">
      {submit.error ? <CommandFailure error={submit.error} /> : null}

      {visit.work_tasks.map((task) => (
        <fieldset key={task.id} className="rounded-card border border-line bg-surface p-3">
          <legend className="px-1 text-lg font-extrabold text-text">
            {task.label}
            {task.quantity > 1 ? ` × ${task.quantity}` : ""}
          </legend>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {OUTCOME_CHOICES.map((choice) => {
              const picked = outcomes[task.id] === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={picked}
                  disabled={submit.isPending}
                  onClick={() =>
                    setOutcomes((current) => ({ ...current, [task.id]: choice.value }))
                  }
                  className={cn(
                    "flex min-h-18 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 disabled:opacity-60",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    picked
                      ? "border-selected-line bg-selected-surface text-action-secondary"
                      : "border-line bg-surface-sunken text-text-muted",
                  )}
                >
                  <Pictogram name={choice.icon} size="md" />
                  <span className="text-center text-xs font-bold leading-tight">
                    {choice.caption}
                  </span>
                </button>
              );
            })}
          </div>

          {outcomes[task.id] !== undefined && outcomes[task.id] !== "COMPLETED" ? (
            <textarea
              aria-label={`What happened — ${task.label}`}
              className="mt-2 min-h-16 w-full rounded-control border border-line bg-surface-sunken p-2 text-sm text-text"
              value={reasons[task.id] ?? ""}
              onChange={(event) =>
                setReasons((current) => ({ ...current, [task.id]: event.target.value }))
              }
              maxLength={240}
            />
          ) : null}
        </fieldset>
      ))}

      <button
        type="button"
        aria-pressed={damage}
        disabled={submit.isPending}
        onClick={() => setDamage((current) => !current)}
        className={cn(
          "flex h-16 items-center justify-center gap-3 rounded-[18px] border disabled:opacity-60",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          damage
            ? "border-danger-line bg-danger-surface text-danger-text"
            : "border-line bg-surface-sunken text-text-muted",
        )}
      >
        <Pictogram name="later" size="lg" />
        <span className="text-base font-bold">Damage</span>
        <span className="sr-only">
          There was a safety issue or damage at this site
        </span>
      </button>

      {/* Why the send button is dim. The count carries it and the word says
          what is being counted — a bare "2/5" beside a tick could as easily be
          a rating. It disappears the moment every task has an answer. */}
      {ready ? null : (
        <p className="flex items-center justify-center gap-2 text-text-muted">
          <Pictogram name="done" size="md" className="shrink-0" />
          <span aria-hidden className="text-xl font-extrabold tabular-nums">
            {answered}/{visit.work_tasks.length}
          </span>
          <span aria-hidden className="text-sm font-semibold">
            answered
          </span>
          <span className="sr-only">
            {answered} of {visit.work_tasks.length} tasks answered
          </span>
        </p>
      )}

      <BigAction
        tone="success"
        icon="yes"
        label="Send this report"
        disabled={!ready || submit.isPending}
        onClick={() =>
          submit.mutate({
            bookingId: visit.id,
            expectedVersion: visit.version,
            notes: "",
            safetyDamageDeclared: damage,
            outcomes: visit.work_tasks.map((task) => ({
              work_task_id: task.id,
              // Guarded by `ready`: every task has an answer by here.
              outcome: outcomes[task.id]!,
              quantity: task.quantity,
              reason: reasons[task.id]?.trim() ?? "",
            })),
          })
        }
      />
    </div>
  );
}

/**
 * The five published outcomes, each as a picture and a caption of two words or
 * fewer.
 *
 * Every member of `WorkOutcomeEnum` (`schema.d.ts:11180`) is here and nothing
 * else is — the shape is `readonly` and typed against `OutcomeInput["outcome"]`,
 * so an outcome added to the contract is a typecheck failure rather than a
 * choice the Partner is never offered.
 *
 * The glyphs are the canvas's own "State" set used for what it already means:
 * `done` is a tick, `doing` is the in-progress toolbox, `time` is "not begun
 * yet", `stopped` is the barred circle, `no` is a cross. None of them is
 * repurposed against its name elsewhere in the app.
 */
const OUTCOME_CHOICES: readonly {
  readonly value: OutcomeInput["outcome"];
  readonly icon: PictogramName;
  readonly caption: string;
}[] = [
  { value: "COMPLETED", icon: "done", caption: "Done" },
  { value: "PARTIAL", icon: "doing", caption: "Part done" },
  { value: "NOT_STARTED", icon: "time", caption: "Not started" },
  { value: "BLOCKED", icon: "stopped", caption: "Blocked" },
  { value: "NOT_APPLICABLE", icon: "no", caption: "Not needed" },
];

/* --------------------------------------------------------------------------
   Pieces
   -------------------------------------------------------------------------- */

/**
 * The one thing this screen is asking the Partner to do. 80px, filled, centred.
 *
 * The label renders. It used to be `sr-only`, which meant the same green
 * rectangle carrying the same tick glyph was "I have arrived" at one step of
 * the visit and "Send this report" three steps later — the second of which
 * settles money from the per-task outcomes. Colour and glyph were the only
 * signal, and this screen reuses both.
 */
function BigAction({
  tone,
  icon,
  label,
  disabled,
  onClick,
}: {
  readonly tone: "success" | "secondary";
  readonly icon: PictogramName;
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-20 items-center justify-center gap-3 rounded-[20px] disabled:opacity-60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        tone === "success"
          ? "bg-success-text shadow-[0_3px_0_var(--color-success-active)]"
          : "bg-action-secondary shadow-[0_3px_0_var(--color-navy-900)]",
      )}
    >
      <Pictogram name={icon} size="lg" className="text-surface" />
      <span className="text-xl font-bold text-surface">{label}</span>
    </button>
  );
}

/**
 * A real command, but never the one the Partner came here to press.
 *
 * ## Why this is left-aligned and carries a consequence
 *
 * At `ARRIVED` **two of these render at once** — "The customer is not here"
 * (which starts a paid wait and keeps the job) and, from `ReleaseAction`, "Hand
 * this job back" (which gives the job away). Before this pass they were two
 * identical 64px grey rectangles holding the same `no` glyph, stacked, with
 * their only distinguishing text in `sr-only`. A vendor picked between two
 * opposite outcomes by position alone.
 *
 * So: the verb is on the control, a second line states what happens, and the
 * layout is left-aligned so neither can be mistaken for the filled, centred
 * primary above them. `tone` separates the two further — the one that costs you
 * the job is the only red thing on the screen.
 */
function SecondaryAction({
  icon,
  label,
  consequence,
  tone = "neutral",
  disabled,
  onClick,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly consequence: string;
  readonly tone?: "neutral" | "danger";
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-15 items-center gap-3 rounded-[18px] border px-3.5 py-2.5 text-left disabled:opacity-60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        tone === "danger"
          ? "border-danger-line bg-danger-surface"
          : "border-line-strong bg-surface",
      )}
    >
      <Pictogram
        name={icon}
        size="md"
        className={cn("shrink-0", tone === "danger" ? "text-danger-text" : "text-warning-text")}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-base font-bold",
            tone === "danger" ? "text-danger-text" : "text-text",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-xs font-medium leading-snug",
            tone === "danger" ? "text-danger-text opacity-85" : "text-text-muted",
          )}
        >
          {consequence}
        </span>
      </span>
    </button>
  );
}

/**
 * Stop or hand back — the one place on this screen prose is unavoidable.
 *
 * `canAbort` and `canRelease` are mutually exclusive (`IN_PROGRESS` vs.
 * `CONFIRMED`/`EN_ROUTE`/`ARRIVED`), so exactly one of the two commands is ever
 * live when this mounts, and the caption/prompt below follow whichever one is.
 */
function ReleaseAction({ visit }: { readonly visit: PartnerVisit }) {
  const abort = useAbortWork();
  const release = useReleaseBooking();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const aborting = canAbort(visit);
  const mutation = aborting ? abort : release;
  const label = aborting ? "Stop this job" : "Hand this job back";
  const prompt = aborting
    ? "Tell us what happened. Completed work is still settled — you will report it next."
    : "Tell us why so we can find a replacement quickly. There is no penalty for handing a job back.";
  const versioned = { bookingId: visit.id, expectedVersion: visit.version };

  if (!open) {
    return (
      <SecondaryAction
        icon="no"
        tone="danger"
        label={label}
        consequence={
          aborting
            ? "Work stops here. You still report what was done."
            : "You give up the job. No penalty."
        }
        disabled={mutation.isPending}
        onClick={() => setOpen(true)}
      />
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      {mutation.error ? <CommandFailure error={mutation.error} /> : null}
      <h4 className="text-sm font-bold text-text">{label}</h4>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{prompt}</p>
      <textarea
        aria-label={label}
        className="mt-2 min-h-20 w-full rounded-control border border-line bg-surface-sunken p-2 text-sm text-text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={240}
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={reason.trim().length === 0 || mutation.isPending}
          onClick={() => mutation.mutate({ ...versioned, reason: reason.trim() })}
          className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-danger-text px-4 text-sm font-bold text-surface disabled:opacity-60"
        >
          {label}
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
          className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface-sunken px-4 text-sm font-bold text-text-muted disabled:opacity-60"
        >
          Back
        </button>
      </div>
    </div>
  );
}

/**
 * Where the job got to, when there is nothing to press.
 *
 * A picture and its own name. The name is `STATUS_COPY`'s — the same table the
 * WORK stack card that linked here reads — never restated, and never the raw
 * `BookingStatusEnum` member.
 */
function StatusMedallion({ status }: { readonly status: VisitStatus }) {
  const copy = STATUS_COPY[status];

  return (
    <div
      role="status"
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-card border px-3.5 py-3",
        MEDALLION_TONE[copy.tone],
      )}
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-current/20"
      >
        <Pictogram name={STATUS_PICTOGRAM[status]} size="md" />
      </div>
      <span className="text-sm font-bold">Current status: {copy.label}</span>
    </div>
  );
}

/**
 * One glyph per booking status, as a total record so that a status added to the
 * contract is a typecheck failure rather than a blank medallion.
 *
 * The six statuses that carry an action never reach `StatusMedallion` — they are
 * listed anyway because the record is total, and each is given the glyph its own
 * action button already uses.
 */
const STATUS_PICTOGRAM: Record<VisitStatus, PictogramName> = {
  CONFIRMED: "time",
  EN_ROUTE: "go",
  ARRIVED: "site",
  IN_PROGRESS: "doing",
  ABORTED: "stopped",
  COMPLETION_SUBMITTED: "held",
  COMPLETED: "done",
  PARTIALLY_COMPLETED: "done",
  DISPUTED: "later",
  RECOVERY_REQUIRED: "later",
  CANCELLED: "no",
};

/** `STATUS_COPY`'s four tones, in this redesign's closed token set. */
const MEDALLION_TONE: Record<StatusTone, string> = {
  go: "border-selected-line bg-selected-surface text-action-secondary",
  wait: "border-warning-line bg-warning-surface text-warning-text",
  done: "border-success-line bg-success-surface text-success-text",
  stop: "border-danger-line bg-danger-surface text-danger-text",
};

/**
 * A refused command.
 *
 * Recovery is always a re-read rather than a resend: every one of these commands
 * carries a stable `Idempotency-Key` scoped to the record *and its version*, and
 * `features/work/queries.ts` already invalidates the visit on error — so the
 * screen repaints with whatever actually happened and the Partner presses the
 * button that is then offered.
 */
function CommandFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  return (
    <ErrorState
      inline
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}

/** "9:00 am" in the device's own zone. Null-safe, the same helper `work-home.tsx` carries. */
function clockTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(at);
}

/** "Tuesday, 25 Aug" in the device's own zone. */
function calendarDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Date pending";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining} min`;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}
