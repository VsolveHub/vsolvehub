// Ported from frontend/apps/partner/features/proposal/model/recent-presets.ts
/**
 * The presets this vendor reaches for, so they are not hunting every time.
 *
 * ## Why this exists rather than per-trade preset lists
 *
 * The obvious fix for a long preset sheet is to show only the presets that suit
 * the trade. That is not available: `archetype` is published as an unenumerated
 * `type: string` (`contracts/openapi/v1.yaml`), this route is A5-only, and
 * `estimate-presets.ts` says plainly that the catalogue is the right home for a
 * per-trade list and that shipping one is a backend slice plus a contract
 * version. Inventing a client-side trade taxonomy to sort a sheet would be this
 * app deciding something the server owns.
 *
 * Ordering by what this vendor last used needs none of that. A vendor who
 * quotes wiring, plaster and paint every week finds those three at the top by
 * the second estimate, and the list underneath is unchanged for everyone else.
 *
 * ## Why localStorage rather than server state
 *
 * It is a convenience, not a fact about the business. Losing it costs one extra
 * scroll; storing it server-side would mean a new endpoint and a contract
 * change for something that never has to agree across devices.
 *
 * Every function here tolerates a missing, unreadable or corrupt store —
 * localStorage throws in private modes and on quota, and an estimate must never
 * fail to open because a preference could not be read.
 */

const STORAGE_KEY = "vsh-partner-recent-presets";

/** Enough to cover a vendor's usual repertoire without becoming the whole list. */
const LIMIT = 6;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

/** Records a preset as just-used. Most recent first, de-duplicated, capped. */
export function rememberPreset(code: string): void {
  if (typeof window === "undefined") return;
  const next = [code, ...read().filter((entry) => entry !== code)].slice(0, LIMIT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A vendor who cannot write a preference can still write an estimate.
  }
}

/**
 * The given presets, recently-used ones first, everything else in its original
 * order.
 *
 * Stable rather than merely sorted: two presets the vendor has never used keep
 * the order `estimate-presets` declares them in, which is the order the trade
 * actually runs in (strip out, then walls, then wiring…). Shuffling that for
 * a first-time vendor would trade one kind of hunting for another.
 */
export function byRecentFirst<T extends { readonly code: string }>(
  presets: readonly T[],
): readonly T[] {
  const recent = read();
  if (recent.length === 0) return presets;

  const rank = (preset: T): number => {
    const at = recent.indexOf(preset.code);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  return [...presets]
    .map((preset, index) => ({ preset, index, rank: rank(preset) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map((entry) => entry.preset);
}
