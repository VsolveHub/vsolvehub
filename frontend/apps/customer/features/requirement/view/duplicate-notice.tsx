"use client";

import { Button, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import type { DuplicateView } from "../adapters";
import { useRequirement } from "./requirement-context";

/**
 * "You already have a similar request open."
 *
 * `GAP-004`. Two requests for the same job at the same address split the vendor
 * attention meant for one, and the Customer ends up comparing two half-filled
 * sets of quotes and paying two unlocks to do it.
 *
 * ## It offers, it does not block
 *
 * Using the request that already exists is the suggestion; continuing
 * separately is a legitimate answer, and the Customer may genuinely need two
 * crews at one address. So this is a warning with two real choices, and the
 * override is explicit — `duplicateOverridden` records that they were asked and
 * said no, which is also what `allow_duplicate` sends to the submit command.
 *
 * ## Why this links rather than merges
 *
 * `GAP-004` asks for a merge and **contract 1.21.0 publishes no merge
 * endpoint.** `merge_duplicate_requirement` is a named command in the M2
 * invalidation map and there is no route behind it. So the row offers the
 * honest thing the platform can do — open the request the Customer already has,
 * which is where they would go to decide anyway — and does not put a button
 * labelled "Add to this one" over an action nothing performs. Logged as a
 * contract gap in the execution plan §7.
 *
 * `mergeable` still decides whether the link appears: the server sets it from
 * `LIVE_STATUSES`, and a closed request is not somewhere to send this work.
 *
 * ## Why the summary is the server's words
 *
 * The Customer has to recognise their own earlier request to decide. Rebuilding
 * a description from raw answers here would produce a sentence that reads
 * differently from the one on `My requests`, and the two would drift.
 */

export interface DuplicateNoticeProps {
  duplicates: readonly DuplicateView[];
  /** Where an existing request lives. Injected — this feature owns no route. */
  hrefFor: (requirementId: string) => string;
}

export function DuplicateNotice({ duplicates, hrefFor }: DuplicateNoticeProps) {
  const { state, dispatch } = useRequirement();

  if (duplicates.length === 0 || state.duplicateOverridden) return null;

  return (
    <div role="alert" className="rounded-card border border-warning-line bg-warning-surface p-4">
      <p className="font-semibold text-text">
        {duplicates.length === 1
          ? "You already have a similar request open"
          : "You already have similar requests open"}
      </p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Sending another one splits the professionals between them, so you get
        fewer quotes on each.
      </p>

      <ul className="mt-3 flex list-none flex-col gap-2 p-0">
        {duplicates.map((duplicate) => (
          <li
            key={duplicate.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-3"
          >
            <div className="min-w-0">
              <p className="text-text">{duplicate.summary}</p>
              <p className="text-sm text-text-secondary">{duplicate.createdLabel}</p>
            </div>
            {duplicate.mergeable ? (
              <Link href={hrefFor(duplicate.id)} className={buttonStyles({ variant: "secondary" })}>Open that request</Link>
            ) : null}
          </li>
        ))}
      </ul>

      <Button
        className="mt-3"
        variant="secondary"
        onClick={() => dispatch({ type: "OVERRIDE_DUPLICATE" })}
      >
        These are different jobs — continue
      </Button>
    </div>
  );
}
