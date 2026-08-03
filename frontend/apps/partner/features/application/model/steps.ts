/**
 * The onboarding step sequence.
 *
 * One list, imported by both the shell's navigation and the editor's
 * "Save and continue". They were previously separate concerns — the nav had the
 * order and the editor had none — which is exactly how a button labelled
 * "continue" ended up not continuing: nothing in the editor knew what came next,
 * so it silently did half of what it said.
 *
 * Keeping the order here also means adding or reordering a step is one edit
 * rather than two that can disagree.
 */

export interface ApplicationStep {
  href: string;
  label: string;
}

export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply", label: "Overview" },
  { href: "/apply/about", label: "About you" },
  { href: "/apply/work", label: "Your work" },
  { href: "/apply/areas", label: "Where you work" },
  { href: "/apply/consent", label: "Agreements" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/schedule", label: "Your hours" },
  { href: "/apply/review", label: "Review and send" },
] as const;

/**
 * Which step a path is on, or -1.
 *
 * Compared exactly rather than by prefix: `/apply` is a prefix of every other
 * step, so a `startsWith` check would report the overview for all of them. A
 * trailing slash is tolerated because Next can produce either form.
 */
export function stepIndexOf(pathname: string): number {
  const normalised =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return APPLICATION_STEPS.findIndex((step) => step.href === normalised);
}

/** The step after `pathname`, or null at the end of the sequence or off it. */
export function nextStep(pathname: string): ApplicationStep | null {
  const index = stepIndexOf(pathname);
  if (index === -1) return null;
  return APPLICATION_STEPS[index + 1] ?? null;
}

export function isLastStep(pathname: string): boolean {
  return stepIndexOf(pathname) === APPLICATION_STEPS.length - 1;
}
