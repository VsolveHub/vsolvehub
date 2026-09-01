"use client";

import { Button, Readout, cn } from "@vsolve/ui";
import { useState } from "react";

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
 *
 * ## Why the code is covered until it is asked for
 *
 * The instruction beside it — give it to them only once they are standing with
 * you — is the whole security property, and an instruction is a weaker
 * protection than a shape. A code printed the moment the page opens is a code
 * that can be read down the phone the evening before, screenshotted into a
 * chat, or shoulder-read on a bus, and none of those leave a trace: the proof
 * is gone and the visit still starts.
 *
 * One tap is not a meaningful obstacle to the person who owns the code — they
 * are standing at their own door — but it moves revealing it from something
 * that happens *to* them to something they *do*, which is the same reason the
 * no-show report sits behind a confirmation. Nothing is hidden that they cannot
 * see instantly, so this is not a paywall pattern; it is a lid.
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
  // Reset is deliberately not wired to the code value: a Customer who reveals,
  // reads it out, and watches the visit start should not see the digits blink
  // away under them on the next refetch. It resets when the page does, which is
  // the same lifetime as standing at the door.
  const [revealed, setRevealed] = useState(false);

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
          {revealed ? (
            <Readout
              label="Read this out when they arrive"
              value={code.code}
              spaced
              size="lg"
              announce={`Arrival code: ${code.code.split("").join(" ")}`}
              caption={expiryCaption(code)}
              className="mt-2"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className={cn(
                "mt-2 flex w-full items-center gap-3 rounded-plate border border-action-line bg-surface p-4 pl-5 text-left",
                "relative overflow-hidden",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              )}
            >
              {/* The same orange rule the revealed plate carries, so the covered
                  and uncovered states read as one object rather than two. */}
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-action" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-text-secondary">
                  Show only when they are with you
                </span>
                <span
                  aria-hidden
                  className="text-3xl font-bold leading-none tracking-[0.2em] text-warm-300"
                >
                  ••••••
                </span>
              </span>
              <span className="shrink-0 rounded-control bg-action px-4 py-2.5 text-sm font-extrabold text-action-text">
                Show code
              </span>
            </button>
          )}
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
