"use client";

import { Button, Readout, cn } from "@vsolve/ui";

import { AccessRefusal } from "./access-refusal";
import type { VisitArrivalCode } from "../queries";

/**
 * The code the Customer reads out, and the vendor types into their own app.
 *
 * ## Why the direction is written on the screen
 *
 * The code only proves anything because the two people have to be in the same
 * place for it to move between them. A Customer who does not know that reads it
 * down the phone the evening before, and the proof is gone without anybody
 * noticing it went. So the instruction is not help text under the control — it
 * is the sentence next to the digits, and it names who does what.
 *
 * ## Why "not right now" is three different panels
 *
 * A visit that has not been scheduled, a visit already under way, and a live
 * challenge whose digits the server can no longer show are genuinely different
 * situations with different things to do. Collapsing them into one empty state
 * would leave a Customer staring at "no code" with no idea whether to wait, tap,
 * or stop looking.
 *
 * ## Why the digits go through `Readout`
 *
 * `spaced` exists on it for exactly this: a code that is read aloud digit by
 * digit needs the tracking, and its `announce` keeps a screen reader from
 * running six separate numbers together into one six-digit number nobody said.
 */

export interface ArrivalCodePanelProps {
  code: VisitArrivalCode | null;
  isLoading: boolean;
  onIssue: () => void;
  isIssuing: boolean;
  issueError: unknown;
  /** Rendered inside a refusal, so a stuck code has a way out of the screen. */
  supportAction?: React.ReactNode;
  className?: string;
}

export function ArrivalCodePanel({
  code,
  isLoading,
  onIssue,
  isIssuing,
  issueError,
  supportAction,
  className,
}: ArrivalCodePanelProps) {
  if (isLoading) return null;

  // Nothing live and nothing issuable: the visit is not at a point where arrival
  // is the question. Rendering an inert panel here would be a control that does
  // nothing on a screen whose whole job is telling somebody what happens next.
  if (code === null || (code.code === null && !code.can_issue)) return null;

  return (
    <section
      aria-labelledby="arrival-code-heading"
      className={cn(
        "rounded-card border border-action-line bg-action-surface p-4",
        className,
      )}
    >
      <h2 id="arrival-code-heading" className="text-sm font-semibold text-text">
        Arrival code
      </h2>

      {code.code !== null ? (
        <>
          <Readout
            label="Read this out when they arrive"
            value={code.code}
            spaced
            size="lg"
            announce={`Arrival code: ${code.code.split("").join(" ")}`}
            caption={expiryCaption(code)}
            className="mt-2"
          />
          <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
            Give it to them only once they are standing with you.{" "}
            <strong className="font-semibold text-text">
              They type it into their app
            </strong>
            , and that is what starts the visit.
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Your code has expired. Get a new one when the professional arrives —
          there is no rush to do it before then.
        </p>
      )}

      {code.can_issue ? (
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={onIssue}
            loading={isIssuing}
            loadingLabel="Getting a code"
          >
            {code.code === null ? "Get a code" : "Get a new code"}
          </Button>
        </div>
      ) : null}

      <div className="mt-3">
        <AccessRefusal
          error={issueError}
          attempting="get an arrival code"
          supportAction={supportAction}
        />
      </div>
    </section>
  );
}

/**
 * When it stops working, in the reader's own clock.
 *
 * Deliberately not a live countdown. The window is measured in hours, a ticking
 * timer beside a code somebody is about to read aloud is pressure with nothing
 * behind it, and `Readout` documents that a ticking value has to be re-announced
 * on a calmer summary anyway.
 *
 * `server_now` rather than the device clock: a phone whose time is wrong would
 * otherwise be told its perfectly good code had already expired.
 */
function expiryCaption(code: VisitArrivalCode): string | undefined {
  if (code.expires_at === null) return undefined;
  const expires = new Date(code.expires_at);
  if (Number.isNaN(expires.getTime())) return undefined;
  if (expires.getTime() <= new Date(code.server_now).getTime()) {
    return "This code has expired";
  }
  return `Works until ${expires.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
