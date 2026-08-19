"use client";

import { Button, RailLayout, cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import type { BlockReason } from "../model/state";
import { BLOCK_COPY } from "./block-copy";

/**
 * The project brief on one page — the A5 capture flow, unwound.
 *
 * ## Why the wizard became a page, and then the page became a rail
 *
 * The four screens are right on a phone and wrong on a 1440 display, so this
 * stopped being a stepper. But stacking all three sections in one column was the
 * other extreme: on a wide screen it produced a single scroll long enough that
 * the rail's checklist was describing sections nobody could see, and the address
 * dialog, the date fields and the attachment grid all competed for the same
 * vertical run.
 *
 * So the rail became the navigation rather than a read-out beside it. One
 * section is on screen at a time and the rail says which, what is done and what
 * is missing — the orientation a stepper gave, without a stepper's rule that you
 * may only move forwards.
 *
 * ## Why every section stays reachable
 *
 * The rail rows are buttons and none of them is ever disabled. All three write to
 * one draft, in any order, and gating section 3 behind section 1 would rebuild
 * the property that made the wizard wrong on desktop: somebody who knows the
 * dates but not the finish would be unable to enter the thing they came to
 * enter. The guards still hold at the *send*, where they belong, and the rail
 * says which section is holding it up.
 *
 * ## The four screens are not gone
 *
 * `SCREENS` is unchanged and so is the reducer. This renders the same three
 * capture screens simultaneously and **`review` is still a step** — it is the
 * act of sending rather than a part of the brief, and collapsing it into this
 * page would remove the one screen whose whole job is letting somebody check
 * what they are about to send.
 *
 * So the writes are unchanged too: pressing the CTA runs the same three saves
 * the wizard ran, in the same order, and only then moves to review. Nothing here
 * autosaves on a keystroke — the flow's own note explains why that would make
 * the lifecycle verdict rewrite itself while somebody types.
 */

export interface BriefSectionSpec {
  /** The section heading, shown beside its number. */
  title: string;
  /** Right-aligned note — "Optional · sharper estimates". */
  hint?: string;
  /** What is still missing, or null when the section is done. */
  blocked: BlockReason | null;
  /** True for a section that never blocks sending. */
  optional?: boolean;
  children: ReactNode;
}

export interface ProjectBriefScreenProps {
  heading: string;
  /** The one sentence of prose this screen is allowed. */
  intro: string;
  sections: readonly BriefSectionSpec[];
  /**
   * Which section is on screen, as an index into `sections`.
   *
   * Owned by the flow's reducer rather than by this component, because it is the
   * same `state.screen` the phone wizard runs on and the same value mirrored into
   * `?step=`. Holding a second copy here would let the URL and the page disagree
   * about where somebody is.
   */
  activeIndex: number;
  onSelectSection: (index: number) => void;
  /** Moves to review. Runs the section saves first — see the flow container. */
  onReviewAndSend: () => void;
  isSaving: boolean;
  /** What is stopping the send, from the reducer's own guard. */
  blocked: BlockReason | null;
  /** Errors and duplicate notices, owned by whoever knows the server state. */
  notice?: ReactNode;
}

export function ProjectBriefScreen({
  heading,
  intro,
  sections,
  activeIndex,
  onSelectSection,
  onReviewAndSend,
  isSaving,
  blocked,
  notice,
}: ProjectBriefScreenProps) {
  // Clamped rather than trusted. `activeIndex` comes from a reducer screen that
  // also has a `review` value this component never renders, and an out-of-range
  // index would render nothing at all — a blank column with a working rail,
  // which is the hardest kind of empty page to diagnose.
  const current = Math.min(Math.max(activeIndex, 0), sections.length - 1);
  const section = sections[current];
  const isLast = current === sections.length - 1;
  // Which section is holding the send up, so the rail can point at it by name
  // rather than reprinting a sentence the row beside it already carries. `-1`
  // is a real answer: a guard that belongs to the whole brief rather than to any
  // one section — an unresolved duplicate — has no row to send anybody to.
  const blockingIndex = sections.findIndex((item) => item.blocked !== null);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">{heading}</h1>
        <p className="mt-1.5 max-w-prose text-[0.9375rem] leading-6 text-text-secondary">
          {intro}
        </p>
      </header>

      {notice ? <div className="mb-6">{notice}</div> : null}

      <RailLayout
        railLabel="Your brief"
        railWidth="20rem"
        rail={
          <div className="flex flex-col gap-3">
            <section className="rounded-card border border-line bg-surface p-4">
              <h2 className="text-sm font-bold text-text">Your brief</h2>
              <ol className="mt-3 flex list-none flex-col gap-1 p-0">
                {sections.map((item, index) => (
                  <ChecklistRow
                    key={item.title}
                    section={item}
                    number={index + 1}
                    isCurrent={index === current}
                    onSelect={() => onSelectSection(index)}
                  />
                ))}
              </ol>
            </section>

            <Button
              block
              size="lg"
              onClick={onReviewAndSend}
              disabled={blocked !== null}
              loading={isSaving}
              loadingLabel="Saving your brief"
            >
              Review and send
            </Button>

            {/* A disabled button with no explanation is the most common way a
                form dead-ends somebody — but the rows above now carry the reason
                each section is short, so repeating the sentence here would print
                it twice. This names the section instead, and opens it. */}
            {blocked !== null && blockingIndex !== -1 ? (
              <p className="text-sm leading-5 text-text-secondary">
                <button
                  type="button"
                  onClick={() => onSelectSection(blockingIndex)}
                  className="font-semibold text-text-link underline underline-offset-4"
                >
                  {sections[blockingIndex]?.title}
                </button>{" "}
                still needs something before you can send.
              </p>
            ) : blocked !== null ? (
              // No section owns it — a whole-brief guard such as an unresolved
              // duplicate. The reason is all there is to say, so it is said.
              <p className="text-sm leading-5 text-text-secondary">{BLOCK_COPY[blocked]}</p>
            ) : (
              <p className="text-sm leading-5 text-text-secondary">
                Free to send. Nothing is booked yet.
              </p>
            )}

            <WhatHappensNext />
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {section ? <BriefSection section={section} number={current + 1} /> : null}

          {/* Moving between sections belongs under the section, where somebody
              finishing one is already looking. The rail's own CTA stays as the
              always-visible way out for a Customer who has filled everything and
              does not want to walk back through it. */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => onSelectSection(current - 1)}
              disabled={current === 0}
            >
              Back
            </Button>

            {isLast ? (
              <Button
                onClick={onReviewAndSend}
                disabled={blocked !== null}
                loading={isSaving}
                loadingLabel="Saving your brief"
              >
                Review and send
              </Button>
            ) : (
              // Never disabled by the section's own guard. Section 2 is not the
              // place to refuse somebody because section 1 is thin — the send is,
              // and it says so. A "Next" that dead-ends is how a form traps
              // people who intended to come back.
              <Button variant="outline" onClick={() => onSelectSection(current + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </RailLayout>
    </div>
  );
}

/**
 * One numbered section.
 *
 * The number is `aria-hidden` and the heading carries the position in words
 * instead: "1" announced before a heading is a bare digit, and the ordinal is
 * only useful if it is attached to what it numbers.
 */
function BriefSection({ section, number }: { section: BriefSectionSpec; number: number }) {
  return (
    <section
      aria-labelledby={sectionId(section.title)}
      className="rounded-card border border-line bg-surface p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline gap-3 border-b border-line pb-3">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action-secondary text-sm font-bold text-action-secondary-text"
        >
          {number}
        </span>
        <h2 id={sectionId(section.title)} className="flex-1 text-base font-bold text-text">
          <span className="sr-only">{`Step ${number}: `}</span>
          {section.title}
        </h2>
        {section.hint ? (
          <span className="text-xs text-text-muted">{section.hint}</span>
        ) : null}
      </div>

      {section.children}
    </section>
  );
}

/**
 * One rail row: where a section stands, and the control that opens it.
 *
 * A real `<button>` rather than a styled div, so it is tabbable and announced as
 * a control. `aria-current="step"` rather than `aria-selected`, because these are
 * positions in a brief and not tabs in a tablist — claiming the tab pattern would
 * promise arrow-key semantics this does not implement.
 *
 * The tick is never the only signal. Colour and a glyph both fail for somebody
 * who cannot see them, so the state is also in the accessible name.
 */
function ChecklistRow({
  section,
  number,
  isCurrent,
  onSelect,
}: {
  section: BriefSectionSpec;
  number: number;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const isDone = section.blocked === null;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          isCurrent
            ? "bg-selected-surface"
            : "hover:bg-surface-hover",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            isDone
              ? "bg-success-text text-text-inverse"
              : isCurrent
                ? "bg-action-secondary text-action-secondary-text"
                : "border border-line-strong text-text-muted",
          )}
        >
          {isDone ? "✓" : number}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm",
              isCurrent ? "font-semibold text-text" : isDone ? "text-text" : "text-text-secondary",
            )}
          >
            {section.title}
          </span>
          {/* State in words, never by tick alone. */}
          <span className="sr-only">
            {isDone
              ? ", done"
              : section.optional === true
                ? ", optional, not filled in"
                : ", still needed"}
          </span>
          {/* What is missing, on the row that is missing it — the rail used to
              carry only a tick, so a Customer with a blocked send had to guess
              which of three sections was holding it. */}
          {!isDone && section.blocked !== null ? (
            <span className="mt-0.5 block text-xs leading-4 text-text-muted">
              {BLOCK_COPY[section.blocked]}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * The three things that happen after sending.
 *
 * It was a paragraph the mobile design had to cut for space. It earns its place
 * because A5 asks somebody to describe a project and then wait, and "what
 * happens now" is the question that produces a support message on day two.
 */
function WhatHappensNext() {
  return (
    <section
      aria-labelledby="what-happens-next"
      className="rounded-card border border-line bg-surface-sunken p-4"
    >
      <h2 id="what-happens-next" className="text-sm font-bold text-text">
        What happens next
      </h2>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-sm leading-5 text-text-secondary">
        <li>Pros near you read the brief.</li>
        <li>You pick how many should visit, and pay once.</li>
        <li>They measure, then price it in writing.</li>
      </ol>
    </section>
  );
}

function sectionId(title: string): string {
  return `brief-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
