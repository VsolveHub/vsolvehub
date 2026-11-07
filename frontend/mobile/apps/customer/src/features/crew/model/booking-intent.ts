// Ported from frontend/apps/customer/features/crew/model/booking-intent.ts
import type { CrewBookingStep } from "./booking-flow";

/** The browser-storage surface used here and by the test's in-memory stand-in. */
interface IntentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CrewBookingIntent {
  serviceSlug: string;
  variantId: string;
  requirementId: string | null;
  answers: Record<string, unknown>;
  /** Opaque id only. Exact address text never enters browser storage. */
  addressId: string | null;
  requestedStart: string;
  /** `HH:MM` local, or null for a crew booked by the day. */
  reportingTime: string | null;
  /** A rate is never persisted; this only remembers which screen was open. */
  step: CrewBookingStep;
}

const STORAGE_PREFIX = "vsolve.crew-booking.v1.";

function storageKey(serviceSlug: string): string {
  return `${STORAGE_PREFIX}${serviceSlug}`;
}

/** The AsyncStorage key for one service's crew booking intent. */
export function crewBookingStorageKey(serviceSlug: string): string {
  return storageKey(serviceSlug);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStep(value: unknown): value is CrewBookingStep {
  return (
    value === "occasion" ||
    value === "work" ||
    value === "crew" ||
    value === "details" ||
    value === "rate"
  );
}

/**
 * Reads customer intent only. Corrupt, stale or cross-variant entries fail
 * closed so a catalogue change cannot replay answers into a different form.
 */
export function readCrewBookingIntent(
  storage: IntentStorage | null,
  serviceSlug: string,
  variantId: string,
): CrewBookingIntent | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(storageKey(serviceSlug));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    if (value.serviceSlug !== serviceSlug || value.variantId !== variantId) return null;
    if (!isRecord(value.answers) || !isStep(value.step)) return null;
    if (value.requirementId !== null && typeof value.requirementId !== "string") return null;
    if (value.addressId !== null && typeof value.addressId !== "string") return null;
    if (typeof value.requestedStart !== "string") return null;
    // Absent on entries written before the reporting time existed. Those were
    // day bookings, and null is exactly what a day booking carries.
    const reportingTime =
      typeof value.reportingTime === "string" && /^\d{2}:\d{2}$/.test(value.reportingTime)
        ? value.reportingTime
        : null;
    return {
      serviceSlug,
      variantId,
      requirementId: value.requirementId,
      answers: value.answers,
      addressId: value.addressId,
      requestedStart: value.requestedStart,
      reportingTime,
      step: value.step,
    };
  } catch {
    return null;
  }
}

export function writeCrewBookingIntent(
  storage: IntentStorage | null,
  intent: CrewBookingIntent,
): void {
  if (storage === null) return;
  try {
    storage.setItem(storageKey(intent.serviceSlug), JSON.stringify(intent));
  } catch {
    // Private browsing and full quotas may refuse storage. The live form keeps working.
  }
}

export function clearCrewBookingIntent(
  storage: IntentStorage | null,
  serviceSlug: string,
): void {
  if (storage === null) return;
  try {
    storage.removeItem(storageKey(serviceSlug));
  } catch {
    /* There is nothing else to recover. */
  }
}
