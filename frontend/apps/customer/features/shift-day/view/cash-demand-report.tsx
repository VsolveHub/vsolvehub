"use client";

import { Badge, Button, ConfirmAction, Field, Input, Textarea } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { isUsableRupeeInput, rupeesToPaise } from "../adapters";
import { useReportCashDemand } from "../queries";

/**
 * "They asked for extra in cash" — `M2-FE-515`. One tap.
 *
 * ## Why this is a tap and not a form
 *
 * `amount_claimed_paise` is optional on the wire and the server's own reasoning
 * is the reason this component looks the way it does: a required amount turns
 * "they demanded extra" into a form, and the form is what stops it being
 * reported. Somebody standing in their doorway being asked for two thousand
 * rupees in cash is not going to fill in three fields.
 *
 * So the whole thing is one button, one confirmation, and a send that works with
 * everything blank. The amount and the note are inside the confirmation, clearly
 * optional, and the confirm button never waits for them.
 *
 * ## It promises nothing the server does not commit to
 *
 * The report is recorded immutably and a standing event is written against the
 * professional — **a fact with a date, not a penalty and not a score**. If the
 * owner has configured a removal threshold and this vendor has crossed it, their
 * A3 capability is suspended by the same command Operations uses. While that
 * threshold is unset **nothing at all happens to the vendor** and the reports
 * still accumulate.
 *
 * This screen therefore says the report is recorded and that a pattern is what
 * matters. It does not say anybody will be removed, warned, fined or contacted,
 * because none of those is something this client can know happened.
 *
 * ## Genuine extras have their own door, and it is named here
 *
 * Overtime and add-ons are real and are priced by the server at the card's
 * published rates through the amendment engine. Reporting one of those as a cash
 * demand would be the Customer punishing a professional for asking properly, so
 * the panel points at the change-request panel by name before it offers the
 * report.
 */

export interface CashDemandReportProps {
  engagementId: string;
  /** The day it happened on, when the Customer is looking at one. */
  stageId: string | null;
  /** Where the honest, priced version of "extra work" lives. */
  amendmentHref: string;
  className?: string;
}

export function CashDemandReport({
  engagementId,
  stageId,
  amendmentHref,
  className,
}: CashDemandReportProps) {
  const report = useReportCashDemand();
  const [confirming, setConfirming] = useState(false);
  const [typedAmount, setTypedAmount] = useState("");
  const [note, setNote] = useState("");

  const amountIsUsable = isUsableRupeeInput(typedAmount);

  if (report.isSuccess) {
    return (
      <section className={className}>
        <div className="rounded-card border border-line bg-surface-sunken p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-semibold text-text">Thank you — that is recorded</h2>
            <Badge tone="neutral">Reported</Badge>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text">
            We have written it against this professional&apos;s record, with
            today&apos;s date. One report on its own does not decide anything about
            them, and we are not going to tell you it does — what we look at is a
            pattern. Nothing about your booking has changed and no money has moved.
          </p>
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            You still owe them the published rate for the work they actually did.
            If they refuse to carry on without the extra, tell us and stop — do
            not pay it to keep the peace.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="cash-demand-heading" className={className}>
      <h2 id="cash-demand-heading" className="text-lg font-semibold text-text">
        Did they ask for extra in cash?
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        You booked this at a published rate and that is the whole price. If
        somebody asked you for more on site — cash, a tip they insisted on, a
        price they said had gone up — tell us in one tap. You do not have to prove
        anything and you do not have to name a figure.
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Extra <em>work</em> is different and is allowed: overtime and add-ons are
        priced by us at the published rates and come to you as a change to agree
        or refuse.{" "}
        <Link href={amendmentHref} className="font-medium text-action underline">
          Those appear as change requests
        </Link>
        , never as cash on the day.
      </p>

      <div className="mt-3">
        <Button variant="outline" onClick={() => setConfirming(true)}>
          They asked me for extra in cash
        </Button>
      </div>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Report a cash demand?"
        consequence={
          <>
            We record this against the professional, with today&apos;s date. It is{" "}
            <strong className="font-semibold">not proof on its own</strong> and one
            report changes nothing about them — we look for a pattern. Nothing
            happens to your booking and no money moves either way. It cannot be
            withdrawn once sent.
          </>
        }
        confirmLabel="Send the report"
        pending={report.isPending}
        onConfirm={() =>
          report.mutate({
            engagementId,
            stageId,
            amountClaimedPaise: rupeesToPaise(typedAmount),
            note: note.trim(),
          })
        }
      >
        {/* Both optional, and the confirm button is live whether or not they are
            filled in. That is the whole point — see the header. */}
        <Field
          label="How much did they ask for?"
          description="Optional. Whole rupees, if you remember."
        >
          <Input
            inputMode="numeric"
            value={typedAmount}
            onChange={(event) => setTypedAmount(event.target.value)}
            placeholder="2000"
          />
        </Field>
        {!amountIsUsable ? (
          <p className="mt-1 text-sm text-text-secondary">
            We will send the report without an amount unless that is a plain
            number of rupees.
          </p>
        ) : null}
        <Field label="Anything you want to add" description="Optional." className="mt-3">
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Said the job needed an extra person and wanted the money in hand."
          />
        </Field>
      </ConfirmAction>

      <div className="mt-3">
        <AccessRefusal error={report.error} attempting="send this report" />
      </div>
    </section>
  );
}
