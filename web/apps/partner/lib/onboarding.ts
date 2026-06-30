import { formStepsFor, type ProviderType, type WizardStepId } from "@vsolve/config";

export function formSteps(type: ProviderType) {
  return formStepsFor(type);
}

export function isValidStep(type: ProviderType, id: string): id is WizardStepId {
  return formSteps(type).some((s) => s.id === id);
}

export function stepIndex(type: ProviderType, id: string): number {
  return formSteps(type).findIndex((s) => s.id === id);
}

/** Where to go after completing `currentId`. The last form step submits the app. */
export function nextPath(type: ProviderType, currentId: string): string {
  const steps = formSteps(type);
  const idx = steps.findIndex((s) => s.id === currentId);
  if (idx < 0) return "/onboarding";
  if (idx === steps.length - 1) return "/onboarding/success";
  return `/onboarding/${steps[idx + 1]!.id}`;
}
