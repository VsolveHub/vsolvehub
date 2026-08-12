"use client";

import { AddressSummary, Button, ErrorState, ScheduleSummary } from "@vsolve/ui";
import { useState } from "react";

import { OPTIONAL_DETAILS, OPTIONAL_DETAIL_LABELS, type Screen } from "../model/screens";
import type { DraftAttachment } from "../model/state";
import { BLOCK_COPY } from "./block-copy";
import { OptionalDetailPanel, summariseOptionalDetail } from "./optional-detail-panels";
import { useRequirement } from "./requirement-context";

/**
 * Screen 4 — Review. **This is the confirmation.**
 *
 * `M2-FE-206` and `FLOW-03`: submitting happens here, and no separate
 * "confirm your immutable version" step may be added after it. The earlier design
 * had one, and it was the same act twice — a second screen asking "are you sure?"
 * about a page whose only job was to let the Customer be sure.
 *
 * ## Every row is editable, and editing goes back to the screen that owns it
 *
 * Not a modal. One place per answer, so a Customer changing the date does it
 * where the date's consequences are written down.
 *
 * ## The extras live here, and are not steps
 *
 * `FLOW-02`. Callback preference, site visit, access constraints and preferred
 * communication were each a screen in the pre-audit design. They are real options
 * that a minority want; none is worth a step every Customer walks through. They
 * are reachable from here and sequenced nowhere.
 *
 * ## Saying it is free is not reassurance, it is the contract
 *
 * `M2-FE-212`. `isFree` comes from the server that enforces it rather than from a
 * literal here, because a hardcoded promise outlives the policy it describes.
 * Until the server can answer, the screen says nothing about price at all — which
 * is the honest state, not a silent `true`.
 */

interface ReviewRow {
  label: string;
  value: string;
  screen: Screen;
}

/**
 * What the attachments row says, and why it is not a count of the rows.
 *
 * A row exists for every file the Customer chose, including the ones that were
 * refused and the ones still clearing their scan. "4 attached" over three
 * verified files and one rejected one is the review screen telling somebody a
 * photograph went with their request when it did not — which is the exact harm
 * the scan states exist to prevent, restated as a summary.
 *
 * So each group is named separately, and the ones that are not attached are
 * described as not attached.
 */
function attachmentSummary(attachments: readonly DraftAttachment[]): string {
  if (attachments.length === 0) return "None";

  const attached = attachments.filter((item) => item.state === "attached").length;
  const checking = attachments.filter((item) => item.state === "scanning").length;
  const notAttached = attachments.filter(
    (item) => item.state === "failed" || item.state === "queued" || item.state === "uploading",
  ).length;

  const parts: string[] = [];
  parts.push(attached === 1 ? "1 attached" : `${attached} attached`);
  if (checking > 0) parts.push(`${checking} still being checked`);
  if (notAttached > 0) parts.push(`${notAttached} not attached`);
  return parts.join(", ");
}

export interface ReviewScreenProps {
  categoryName: string;
  addressLines: readonly string[] | null;
  /** The server's own statement that nothing is charged. Null until it can answer. */
  isFree: boolean | null;
  onSubmit: () => void;
  isSubmitting: boolean;
  /** A refusal from the submit command, already turned into a sentence. */
  submitError: string | null;
}

export function ReviewScreen({
  categoryName,
  addressLines,
  isFree,
  onSubmit,
  isSubmitting,
  submitError,
}: ReviewScreenProps) {
  const { state, goTo, blocked } = useRequirement();
  const [openExtra, setOpenExtra] = useState<string | null>(null);

  // The schedule gets the shared `ScheduleSummary` rather than a row of its own,
  // so "needed by" reads the same here as it will on the request timeline and in
  // the Partner's enquiry. Attachments stay a plain row — a count is a count.
  const rows: ReviewRow[] = [
    {
      label: "Attachments",
      value: attachmentSummary(state.attachments),
      screen: "details",
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Check this over</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        This is what professionals will see. You can change anything before you
        send it.
      </p>

      {state.verdict !== null ? (
        <p className="mt-4 rounded-card border border-info-line bg-info-surface p-4 text-sm text-text">
          {state.verdict.explanation}
        </p>
      ) : null}

      <div className="mt-4 rounded-card border border-line bg-surface">
        <div className="border-b border-line p-4">
          <p className="font-semibold text-text">{categoryName}</p>
          <button
            type="button"
            onClick={() => goTo("what")}
            className="mt-2 min-h-11 rounded-control font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Change
            <span className="sr-only"> what you need</span>
          </button>
        </div>

        {addressLines !== null ? (
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <AddressSummary lines={addressLines} />
            <button
              type="button"
              onClick={() => goTo("where_when")}
              className="min-h-11 shrink-0 rounded-control px-3 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Change
              <span className="sr-only"> the address</span>
            </button>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <ScheduleSummary
            // Both dates, because they mean different things and the review is
            // where a Customer catches having reversed them. `dates` is when the
            // work starts; the warning line under it is the point after which
            // there is no reason to do it at all.
            dates={
              state.requestedStart === null
                ? "No start date chosen"
                : `From ${state.requestedStart}`
            }
            serviceBy={state.serviceBy ?? undefined}
            flexible={state.isDateFlexible}
          />
          <button
            type="button"
            onClick={() => goTo("where_when")}
            className="min-h-11 shrink-0 rounded-control px-3 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Change
            <span className="sr-only"> the dates</span>
          </button>
        </div>

        <dl className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0"
            >
              <div className="min-w-0">
                <dt className="text-sm text-text-secondary">{row.label}</dt>
                <dd className="mt-0.5 text-text">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => goTo(row.screen)}
                className="min-h-11 shrink-0 rounded-control px-3 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Change
                <span className="sr-only"> {row.label.toLowerCase()}</span>
              </button>
            </div>
          ))}
        </dl>
      </div>

      {state.additionalDetails ? (
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-text-secondary">What you added</p>
          <p className="mt-1 whitespace-pre-line text-text">{state.additionalDetails}</p>
        </div>
      ) : null}

      <section className="mt-6" aria-labelledby="extras-heading">
        <h3 id="extras-heading" className="text-sm font-semibold text-text">
          Optional — only if you need them
        </h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          None of these are needed to send your request. Open one only if it
          applies to you.
        </p>
        <ul className="mt-2 flex list-none flex-col gap-2 p-0">
          {OPTIONAL_DETAILS.map((key) => {
            const summary = summariseOptionalDetail(state.optionalDetails, key);
            const buttonId = `extra-${key}`;

            return (
              <li key={key}>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={openExtra === key}
                  aria-controls={openExtra === key ? `${buttonId}-panel` : undefined}
                  onClick={() => setOpenExtra(openExtra === key ? null : key)}
                  className="min-h-11 w-full rounded-control border border-line bg-surface px-4 py-2.5 text-left font-medium text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  {OPTIONAL_DETAIL_LABELS[key]}
                  {/* The summary is what turns a row of four identical buttons
                      into a record of what was said. Without it the Customer
                      has to open each one to find out whether they answered
                      it — which is the flow-weight cost the panels were
                      supposed to remove. */}
                  {summary !== null ? (
                    <span className="mt-0.5 block text-sm font-normal text-text-secondary">
                      {summary}
                    </span>
                  ) : null}
                </button>

                {openExtra === key ? (
                  <div id={`${buttonId}-panel`}>
                    <OptionalDetailPanel detail={key} labelledBy={buttonId} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {submitError !== null ? (
        <div className="mt-6">
          <ErrorState title="We could not send this" message={submitError} inline />
        </div>
      ) : null}

      <div className="mt-6">
        <Button onClick={onSubmit} loading={isSubmitting} loadingLabel="Sending your request" disabled={blocked !== null}>
          Send this request
        </Button>
        {/* Review has no "Next", so the workspace never states the block reason
            here. Repeating the pairing — disabled control *and* stated reason —
            is what stops the final screen being the one place a Customer can
            dead-end with nothing to read. */}
        {blocked !== null ? (
          <p role="status" className="mt-2 max-w-prose text-sm text-text-secondary">
            {BLOCK_COPY[blocked]}
          </p>
        ) : null}
        {isFree === true ? (
          <p className="mt-2 max-w-prose text-sm text-text-secondary">
            Sending this is free. Nothing is charged now, and nothing is charged
            until professionals have sent you quotes to look at.
          </p>
        ) : null}
      </div>
    </div>
  );
}
