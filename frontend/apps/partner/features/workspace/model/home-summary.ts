import { activeWorkspace, type ResolvedWorkspace } from "../registry";

/**
 * What the global home may say about each workspace.
 *
 * Closes the aggregation half of `M2-FE-112`.
 *
 * ## The rule: summarise, never merge
 *
 * A Partner holding both capabilities has shifts and stages. Those are different
 * things with different clocks, different money and different obligations, and
 * the tempting home screen — one "work" list with everything in it — is the
 * erasure `M2-FE-111` forbids. `08-frontend-…` §4 allows "clearly labelled
 * summaries" and nothing more, which is exactly what this produces: a count per
 * workspace, in that workspace's own noun, linking into that workspace's own
 * view.
 *
 * So there is no combined list type here and no `allRecords()`. The shape makes
 * merging awkward on purpose — a home that wanted one list would have to build
 * it somewhere a reviewer can see.
 *
 * ## Counts are supplied, not fetched
 *
 * This module takes numbers. It does not know which endpoint produced them, and
 * it must not: a summary that fetched would put a second read of the shift list
 * on the home screen, and the two would disagree the moment one was stale.
 *
 * ## Why the nouns come from the caller
 *
 * A count needs a word — "3 shifts", "2 stages" — and the word belongs to the
 * lifecycle. Hardcoding a mapping from workspace key to noun here would be a
 * second registry, and the point of one registry is that a key means the same
 * thing everywhere.
 */

export interface WorkspaceCount {
  /** The lifecycle's own noun, already pluralised by the caller: "shifts", "stages". */
  readonly label: string;
  readonly count: number;
  /** Where this count lives, inside its own workspace. Never a merged view. */
  readonly href: string;
  /** True when this count is something the Partner must act on today. */
  readonly needsAttention?: boolean;
}

export interface WorkspaceSummary {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly home: string;
  readonly counts: readonly WorkspaceCount[];
  /** True when every count is zero — a real state with its own copy. */
  readonly isQuiet: boolean;
  readonly needsAttention: boolean;
}

/**
 * One summary per workspace the Partner holds and this build can render.
 *
 * Registry order, matching the switcher, so the home and the switcher list the
 * same workspaces in the same places. Two orderings for one set is how muscle
 * memory stops working between screens.
 *
 * A workspace with no counts supplied still appears. Its presence is the honest
 * statement "you hold this"; omitting it because nothing has arrived yet would
 * make a quiet week look like a lost capability.
 */
export function summarizeWorkspaces(
  workspaces: readonly ResolvedWorkspace[],
  countsByKey: Readonly<Record<string, readonly WorkspaceCount[]>>,
): WorkspaceSummary[] {
  return workspaces.map((workspace) => {
    const counts = countsByKey[workspace.key] ?? [];

    return {
      key: workspace.key,
      label: workspace.label,
      description: workspace.description,
      home: workspace.home,
      counts,
      isQuiet: counts.every((entry) => entry.count === 0),
      needsAttention: counts.some((entry) => entry.needsAttention === true && entry.count > 0),
    };
  });
}

/**
 * Whether the home should show workspace summaries at all.
 *
 * False for an A1 Partner, who holds none — their home is the M1 home,
 * unchanged, and that is `M2-FE-111`'s backward-compatibility requirement rather
 * than a styling choice. An empty summaries section on every existing Partner's
 * home would be a visible M2 regression for people M2 does not touch.
 */
export function hasWorkspaceSummaries(workspaces: readonly ResolvedWorkspace[]): boolean {
  return workspaces.length > 0;
}

/**
 * Whether the home is the right place to show these.
 *
 * Only on the base app. Inside a workspace the Partner has already chosen a
 * context, and repeating the other workspace's counts there is how a shift list
 * ends up with a stage count on it — the merge this module exists to prevent,
 * arriving by layout instead of by data.
 */
export function shouldSummarize(
  workspaces: readonly ResolvedWorkspace[],
  pathname: string,
): boolean {
  return hasWorkspaceSummaries(workspaces) && activeWorkspace(workspaces, pathname) === null;
}
