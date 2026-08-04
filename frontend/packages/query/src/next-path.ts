/**
 * Validation for a `?next=` return path.
 *
 * Shared rather than copied. This is the open-redirect guard on every login
 * route in the product, and a second implementation is a second thing to get
 * wrong — the copy that missed `/\host` would be the one nobody re-read. It
 * lives here so all three apps enforce one rule, proven by one test suite.
 *
 * An open redirect on a login route is a real vulnerability rather than a
 * nicety: the victim authenticates against the genuine site and is then handed
 * to an attacker's page carrying the credibility of having just signed in.
 */

/**
 * True when the value carries a character that has no place in a path.
 *
 * A code-point scan rather than a regular expression: the class needed here is
 * written with escapes that are easy to mangle in review, and a silently broken
 * character class would pass every test that does not use a control character.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns the path only when it is unambiguously same-origin and rooted.
 *
 * Allow-list, never a block-list. Every rejected form below is a way of writing
 * "another origin" that still passes a naive `startsWith("/")`, and the next
 * such trick is one nobody has enumerated yet — so anything that is not plainly
 * a single-slash path is refused rather than repaired.
 *
 * @param loginPath The app's own login route, refused as a destination so that
 *   signing in cannot return to the login screen. Defaults to `/login`.
 */
export function safeNextPath(
  raw: string | null | undefined,
  loginPath = "/login",
): string | null {
  if (!raw) return null;

  const candidate = raw.trim();

  // Whitespace around the value is forgiven; a control character inside it is
  // not. It has no legitimate place in a path and is how a second value gets
  // smuggled past something that reads only the first line.
  if (hasControlCharacter(candidate)) return null;

  if (!candidate.startsWith("/")) return null;
  // `//host` is absolute, and browsers resolve a backslash here as a slash, so
  // `/\host` reaches another origin too.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;

  // Returning to login after logging in is a loop, not a destination.
  if (candidate === loginPath || candidate.startsWith(`${loginPath}?`)) return null;

  return candidate;
}
