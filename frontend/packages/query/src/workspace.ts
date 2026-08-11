/**
 * Server-authorized workspaces: reading `{workspace_key, actions[]}` safely.
 *
 * Closes the server half of `M2-FE-007`. The frontend half — which route, label
 * and icon a key maps to — lives in the consuming app, because those are
 * presentation decisions Django has no opinion about.
 *
 * ## The rule this module exists to enforce
 *
 * A skill is not a capability, a profession is not a lifecycle, and a category
 * name is not a route. `M2-BE-114` publishes an approved *lifecycle capability*
 * as an opaque key plus the actions it authorizes, and the client's only job is
 * to render the keys it recognises.
 *
 * That opacity is the safety property. The moment a client infers "this Partner
 * does plumbing, so show them Workforce", navigation stops reflecting what
 * Operations approved and starts reflecting what a string looked like. The
 * failure is silent and it is an authorization failure.
 *
 * ## Why unknown keys are dropped rather than rendered generically
 *
 * A deployment can publish a workspace this build has never heard of. Rendering
 * it as a generic "Work" tab would put a Partner in front of a lifecycle whose
 * screens do not exist in the bundle they are running, and the honest outcome —
 * a route that 404s — is worse than the key simply not appearing. Django refuses
 * the actions either way; this only decides what is offered.
 *
 * ## Why there is no `useWorkspaceGrants` here
 *
 * `M2-BE-114`'s endpoint is not published (`M2-BE-013` is unstarted). A hook
 * would have to name a URL that does not exist, and the first thing written
 * against it would be a fixture. The parser is the durable half and it is
 * testable on its own; the hook lands with the contract.
 */

/**
 * One approved lifecycle capability, as the client models it.
 *
 * `actions` is the authorization surface: the client shows a control only when
 * its action is present, and Django re-checks it regardless. A missing action is
 * a hidden button, never a disabled one that lies about being available later.
 */
export interface WorkspaceGrant {
  /** Opaque server identifier. Never parsed, split or matched on substrings. */
  readonly workspaceKey: string;
  /**
   * Who the Partner is paid by, as the server states it.
   *
   * Read rather than derived. ADR-0007 fixes one mode per archetype — A3 is
   * `LEAD_ONLY`, A5 is `MANAGED_PAYMENT_REQUIRED` — and it is tempting to infer
   * it from the key for that reason. But this is the field that decides whether
   * the UI promises Vsolve protection or tells a Partner to collect directly,
   * and a client that computes it would keep promising protection through a
   * server-side policy change. `null` when the payload omitted it, which no
   * screen may read as either mode.
   */
  readonly commercialMode: string | null;
  /** Actions authorized inside this workspace. Order is not significant. */
  readonly actions: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keeps only the string entries, so one malformed action cannot poison a grant. */
function readActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Narrows an untyped grants payload into the shape the registry can trust.
 *
 * Deliberately total: any payload produces an array, and anything unreadable
 * produces an empty one. An empty grant list is a Partner with no M2 workspaces,
 * which is the correct and safe rendering for both "not approved yet" and "the
 * response was garbled" — the difference matters for an error banner, not for
 * what the navigation is allowed to offer.
 *
 * Duplicate keys are merged rather than repeated. Two grants for one workspace
 * would otherwise render the tab twice, and the union of their actions is what
 * the Partner is actually authorized to do.
 */
export function parseWorkspaceGrants(payload: unknown): WorkspaceGrant[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.workspaces)
      ? payload.workspaces
      : [];

  const byKey = new Map<string, { actions: Set<string>; commercialMode: string | null }>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const key = row.workspace_key;
    if (typeof key !== "string" || key.length === 0) continue;

    const existing = byKey.get(key) ?? { actions: new Set<string>(), commercialMode: null };
    for (const action of readActions(row.actions)) existing.actions.add(action);
    // First non-empty wins. Two grants for one workspace disagreeing about the
    // mode is a server-side contradiction, and picking the later one silently
    // would make which of the two the UI trusts depend on payload order.
    if (existing.commercialMode === null && typeof row.commercial_mode === "string") {
      existing.commercialMode = row.commercial_mode;
    }
    byKey.set(key, existing);
  }

  return [...byKey].map(([workspaceKey, { actions, commercialMode }]) => ({
    workspaceKey,
    commercialMode,
    actions: [...actions],
  }));
}

/** The grant for one workspace, or null when it was not authorized. */
export function findWorkspaceGrant(
  grants: readonly WorkspaceGrant[],
  workspaceKey: string,
): WorkspaceGrant | null {
  return grants.find((grant) => grant.workspaceKey === workspaceKey) ?? null;
}

/**
 * Whether one action is authorized inside one workspace.
 *
 * The guard every M2 control checks before rendering. Exact match on both
 * halves — an action authorized in the workforce workspace says nothing about
 * the same verb in projects.
 */
export function hasWorkspaceAction(
  grants: readonly WorkspaceGrant[],
  workspaceKey: string,
  action: string,
): boolean {
  return findWorkspaceGrant(grants, workspaceKey)?.actions.includes(action) ?? false;
}
