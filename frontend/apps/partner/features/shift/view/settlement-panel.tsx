"use client";

import { Badge, Button, Card, ErrorState, formatMoney, useToast } from "@vsolve/ui";
import {
  describeError,
  isStageTransitionNotAllowed,
  settlementAmountPaise,
  settlementPaymentLink,
  shiftSettlementClaim,
} from "@vsolve/query";
import { Copy, HandCoins } from "lucide-react";

import { timeAgo } from "@/lib/format";

import { useConfirmDaySettled, type ShiftCommandScope, type ShiftDay } from "../queries";
import { SETTLEMENT_WORDING, WAGES_ARE_DIRECT } from "../model/shift-copy";

/**
 * The supervisor's evening "Day settled?" tap — `M2-FE-513`.
 *
 * The vendor's half of a **dual** tap; the Customer's half is `M2-FE-514` and
 * lives in their app. Both taps make `SETTLED`; one tap on its own is left
 * standing as a claim.
 *
 * ## This is not a payment rail and no line on this screen may suggest it is
 *
 * A3 wages are direct, daily and peer-to-peer at day end. **The platform never
 * holds them**, no endpoint in this milestone can move them, and this command
 * records who tapped and nothing else. That is why `WAGES_ARE_DIRECT` sits with
 * the figure rather than in a footnote: this screen carries the only large number
 * a lead sees at the end of a day, and a number on a platform screen reads as a
 * number the platform is holding unless it says otherwise.
 *
 * ## The figure is read, never computed
 *
 * `amount_paise` is the exact published figure — present workers at the day rate,
 * plus every extra both sides accepted through the amendment engine — and the
 * server freezes it at `SETTLED`. The breakdown beneath it is four separate
 * server-sent numbers rendered side by side; nothing here multiplies
 * `per_worker_paise` by `workers_present`, because that gives the identical
 * answer right up until an approved overtime amendment lands, at which point a
 * client-computed total would be quietly short by the overtime.
 *
 * Settlement is **per worker-day present, never per job**: a three-of-four day
 * settles at three workers' rate, and the panel says so beside the count from
 * `M2-FE-505` rather than leaving a lead to work out why the number moved.
 *
 * ## A one-sided tap is unproven, not paid
 *
 * `SUPERVISOR_CLAIMED` is what Operations reads as *unproven* — one person says
 * they settled and the other has not answered, which is a different sentence
 * from either "they were paid" or "they were not". The copy for that state says
 * exactly that. Treating the first tap as the fact would make the whole trail
 * worthless in the one argument it exists for.
 *
 * ## The UPI link is a convenience, and it belongs to the customer's phone
 *
 * `upi_payment_link` opens a UPI app at the lead's own VPA for the exact amount.
 * It is offered here as something to **send to the customer** rather than as a
 * button on this screen: the vendor is the payee, and a "pay now" control in the
 * payee's app is a control that does the wrong thing. `null` — no VPA published —
 * is an ordinary state and not an error: the amount is still shown and the crew
 * is paid the way they were paid before this app existed.
 */

const TONE = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  success: "success",
} as const;

export interface SettlementPanelProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  /** False when the grant no longer carries `attendance.confirm`. */
  readonly canConfirm: boolean;
}

export function SettlementPanel({ day, scope, canConfirm }: SettlementPanelProps) {
  const confirm = useConfirmDaySettled(scope);
  const toast = useToast();

  const claim = shiftSettlementClaim(day);
  const wording = SETTLEMENT_WORDING[claim];
  const amountPaise = settlementAmountPaise(day);
  const link = settlementPaymentLink(day);
  const settlement = day.settlement;

  const alreadyTapped = settlement?.supervisor_confirmed_at != null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <HandCoins size={18} aria-hidden />
          Was today settled?
        </h2>
        <Badge tone={TONE[wording.tone]} dot>
          {wording.label}
        </Badge>
      </header>

      {amountPaise === null ? null : (
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tabular-nums text-text">
            {formatMoney(amountPaise)}
          </p>
          {settlement === null ? null : (
            <p className="text-sm text-text-secondary">
              {settlement.workers_present} of {settlement.workers_expected} present ·{" "}
              {formatMoney(settlement.per_worker_paise)} per worker for the day
              {settlement.extras_paise === 0
                ? ""
                : ` · ${formatMoney(settlement.extras_paise)} in agreed extras`}
            </p>
          )}
          <p className="text-xs leading-5 text-text-muted">
            The day is settled for the people who were here, not for the job. Anybody who did not
            come is not in this figure.
          </p>
        </div>
      )}

      <p className="text-sm leading-6 text-text-secondary">{wording.sentence}</p>

      <p className="rounded-control border border-line bg-surface-sunken px-3 py-2 text-xs leading-5 text-text-secondary">
        {WAGES_ARE_DIRECT}
      </p>

      {amountPaise === null ? null : link === null ? (
        <p className="text-xs leading-5 text-text-muted">
          You have not published a UPI ID, so there is no payment link to send. Add one to your
          business profile and Vsolve will make one for every day — it changes nothing about how you
          are paid, it just saves the customer typing the amount.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="secondary"
            icon={<Copy size={16} aria-hidden />}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(link)
                .then(() => toast.notify("Payment link copied. Send it to the customer."))
                .catch(() =>
                  toast.notify("Your browser would not let us copy it. Select the link by hand."),
                );
            }}
          >
            Copy the payment link
          </Button>
          <p className="break-all text-xs leading-5 text-text-muted">{link}</p>
          <p className="text-xs leading-5 text-text-muted">
            Opens the customer&rsquo;s own UPI app at your UPI ID for exactly this amount. The money
            goes straight from them to you; it does not pass through Vsolve.
          </p>
        </div>
      )}

      <SettlementTrail day={day} />

      {claim === "no_amount" ? null : alreadyTapped ? (
        <p className="text-sm leading-6 text-text-secondary">
          You confirmed this {settlement?.supervisor_confirmed_at
            ? timeAgo(settlement.supervisor_confirmed_at).toLowerCase()
            : "already"}
          . You cannot take it back — contact support if it was a mistake.
        </p>
      ) : !canConfirm ? (
        <p className="text-sm leading-6 text-text-secondary">
          Your account is not approved to confirm a settlement at the moment. Contact support.
        </p>
      ) : (
        <Button
          type="button"
          onClick={() => confirm.mutate()}
          loading={confirm.isPending}
          loadingLabel="Recording"
          disabled={confirm.isPending}
        >
          Yes — we were paid for today
        </Button>
      )}

      {confirm.isError ? <SettlementFailure error={confirm.error} /> : null}
    </Card>
  );
}

/** Who said what, and when. The whole of what the command records. */
function SettlementTrail({ day }: { readonly day: ShiftDay }) {
  const settlement = day.settlement;
  if (settlement === null) return null;

  return (
    <dl className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between gap-2">
        <dt className="text-text-muted">You</dt>
        <dd className="text-text-secondary">
          {settlement.supervisor_confirmed_at === null
            ? "Not confirmed"
            : timeAgo(settlement.supervisor_confirmed_at)}
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-text-muted">The customer</dt>
        <dd className="text-text-secondary">
          {settlement.customer_confirmed_at === null
            ? "Not confirmed"
            : timeAgo(settlement.customer_confirmed_at)}
        </dd>
      </div>
    </dl>
  );
}

function SettlementFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title="There is nothing to settle yet"
        message="The day has not been recorded, so there is no amount for either of you to agree to. Record how many of your crew were here first."
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
