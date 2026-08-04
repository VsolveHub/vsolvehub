import type { Schemas } from "@vsolve/api-client";

/**
 * Where login sends someone next.
 *
 * Two separate questions, kept apart because only one of them is a security
 * boundary: which path the visitor asked to return to, and — when they asked for
 * nothing — where a Partner in their situation belongs.
 */

type Status = Schemas["PartnerApplicationStatusEnum"];

/** Statuses whose remaining work lives in the onboarding tree. */
const UNFINISHED: readonly Status[] = ["DRAFT", "CHANGES_REQUIRED"];

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
 * The signed-in landing page for an application in this state.
 *
 * An absent application counts as unfinished: the person has not started, and
 * `/apply` is where starting happens. Everything else — including the waiting
 * states and the closed ones — belongs on the home, which states plainly that
 * nothing is owed and links onward. Sending a `SUBMITTED` applicant back into
 * the form would invite them to edit a record a reviewer is holding.
 */
export function homeForApplication(status: Status | null): "/apply" | "/dashboard" {
  if (status === null || UNFINISHED.includes(status)) return "/apply";
  return "/dashboard";
}

/**
 * Validates a `?next=` return path.
 *
 * Only a same-origin, rooted path survives. An open redirect on a login route is
 * a real vulnerability rather than a nicety: the victim authenticates against
 * the genuine site and is then handed to an attacker's page carrying the
 * credibility of having just logged in.
 *
 * Allow-list, never a block-list. Every rejected form below is a way of writing
 * "another origin" that still passes a naive `startsWith("/")`, and the next
 * such trick is one nobody has enumerated yet — so anything that is not plainly
 * a single-slash path is refused rather than repaired.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
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
  if (candidate === "/login" || candidate.startsWith("/login?")) return null;

  return candidate;
}
