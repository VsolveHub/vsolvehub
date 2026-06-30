export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const data = payload as Record<string, unknown>;
  if (typeof data.message === "string" && data.message) return data.message;

  const error = data.error;
  if (typeof error === "string" && error) return error;

  if (error && typeof error === "object") {
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    const phoneErr = fieldErrors?.phone?.[0];
    if (phoneErr) return phoneErr;
    const formErrors = (error as { formErrors?: string[] }).formErrors;
    if (formErrors?.[0]) return formErrors[0];
  }

  return fallback;
}
