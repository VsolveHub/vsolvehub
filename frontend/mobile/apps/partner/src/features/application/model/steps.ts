// Ported from frontend/apps/partner/features/application/model/steps.ts
/**
 * The 4-step mobile onboarding sequence matching the VSolve Hub partner mobile app design.
 *
 * Step 1: About you (/apply/about)
 * Step 2: Agreements (/apply/consent)
 * Step 3: Documents (/apply/documents)
 * Step 4: Review and send (/apply/review)
 */

export interface ApplicationStep {
  href: string;
  label: string;
}

export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/about", label: "About you" },
  { href: "/apply/consent", label: "Agreements" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/review", label: "Review and send" },
] as const;

/**
 * The specialist-work routes.
 */
export const CAPABILITY_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/capabilities", label: "Specialist work" },
  { href: "/apply/business", label: "How you work" },
  { href: "/apply/insurance", label: "Worker insurance" },
  { href: "/apply/demand", label: "Work near you" },
] as const;

/**
 * Which step a path is on, or -1.
 */
export function stepIndexOf(pathname: string): number {
  return APPLICATION_STEPS.findIndex((step) => step.href === normalise(pathname));
}

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** Which specialist step a path is on, or -1. */
export function capabilityStepIndexOf(pathname: string): number {
  return CAPABILITY_STEPS.findIndex((step) => step.href === normalise(pathname));
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
