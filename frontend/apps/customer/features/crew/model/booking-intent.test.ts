import { describe, expect, it } from "vitest";

import {
  clearCrewBookingIntent,
  readCrewBookingIntent,
  writeCrewBookingIntent,
  type CrewBookingIntent,
} from "./booking-intent";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const intent: CrewBookingIntent = {
  serviceSlug: "construction-helpers",
  variantId: "variant-1",
  requirementId: null,
  answers: { work_type: "site-clearing", worker_count: 4, duration_days: 2 },
  addressId: "address-1",
  requestedStart: "2026-09-07",
  reportingTime: null,
  step: "details",
};

describe("crew booking session intent", () => {
  it("restores work, size, date and address id without storing address text or a rate", () => {
    const storage = memoryStorage();
    writeCrewBookingIntent(storage, intent);

    const restored = readCrewBookingIntent(storage, intent.serviceSlug, intent.variantId);
    expect(restored).toEqual(intent);
    expect(JSON.stringify(restored)).not.toContain("Plot 42");
    expect(JSON.stringify(restored)).not.toContain("rate");
  });

  it("ignores an entry after the catalogue variant changes", () => {
    const storage = memoryStorage();
    writeCrewBookingIntent(storage, intent);
    expect(readCrewBookingIntent(storage, intent.serviceSlug, "variant-2")).toBeNull();
  });

  it("fails safely on corrupt storage and can be cleared after booking", () => {
    const storage = memoryStorage();
    storage.setItem("vsolve.crew-booking.v1.construction-helpers", "{broken");
    expect(readCrewBookingIntent(storage, intent.serviceSlug, intent.variantId)).toBeNull();

    writeCrewBookingIntent(storage, intent);
    clearCrewBookingIntent(storage, intent.serviceSlug);
    expect(readCrewBookingIntent(storage, intent.serviceSlug, intent.variantId)).toBeNull();
  });
});
