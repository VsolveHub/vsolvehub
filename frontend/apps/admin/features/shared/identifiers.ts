/**
 * Shape checks for the identifiers Operations types by hand.
 *
 * Several surfaces here take ids rather than offering a picker, because the
 * published contract has no Operations read that lists Customers, quotes,
 * Partners, checkouts or fulfilment units. Where that is true the console says
 * so and takes the id from the case the operator is working — it does not invent
 * a search backed by nothing.
 *
 * These checks are about *shape only*. Whether an id exists, and whether this
 * operator may act on it, are server questions; answering them here would be a
 * guess that either blocks valid work or implies knowledge the client does not
 * have. Catching a mistyped id before it becomes a request is the whole benefit.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/** Django's `SlugField`: the character set `consent_purpose` is validated against. */
const SLUG_PATTERN = /^[-a-zA-Z0-9_]+$/;

export function isConsentPurpose(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 100 && SLUG_PATTERN.test(trimmed);
}

/**
 * Masks an identifier for display.
 *
 * Operations screens quote ids back so an operator can confirm they are working
 * the right record, but a full id on screen is a full id in a screenshot, a
 * support chat or a shoulder-surf. The last segment is enough to recognise a
 * record you just typed and not enough to address one you did not.
 */
export function maskId(value: string): string {
  const trimmed = value.trim();
  if (!isUuid(trimmed)) return "—";
  return `…${trimmed.slice(-12)}`;
}
