/**
 * Opaque cursor extraction for DRF cursor-paginated list envelopes.
 *
 * Django hands clients an absolute `next` URL. Generated clients must not
 * raw-fetch that URL; they parse out the `cursor` query value and resend it as
 * the typed query parameter. The cursor itself is opaque — never decode,
 * interpret or reconstruct it.
 */

export class CursorContractError extends Error {
  readonly code = "cursor_contract" as const;

  constructor(message: string) {
    super(message);
    this.name = "CursorContractError";
  }
}

/**
 * Extract the opaque `cursor` value from a server-provided `next` link.
 *
 * - `null` means there is no further page → `undefined`.
 * - Absolute and relative URLs are accepted; only the query string matters.
 * - A non-null `next` without a usable nonblank `cursor` is a contract-shape
 *   failure. Returning `undefined` would make an incomplete page look final.
 */
export function cursorFromNextUrl(next: string | null): string | undefined {
  if (next === null) {
    return undefined;
  }

  let parsed: URL;
  try {
    // Relative links need a base. The host is unused; only searchParams matter.
    parsed = new URL(next, "https://contract.invalid");
  } catch {
    throw new CursorContractError(
      "The list response included a next link that is not a usable URL.",
    );
  }

  const cursor = parsed.searchParams.get("cursor");
  if (cursor === null || cursor.trim() === "") {
    throw new CursorContractError(
      "The list response included a next link without a usable cursor parameter.",
    );
  }

  return cursor;
}
