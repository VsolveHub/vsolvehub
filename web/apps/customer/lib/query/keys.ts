// Single source of truth for every TanStack Query key in the customer app.
// Importing these everywhere (hooks + server prefetch) keeps keys consistent so
// invalidation actually hits the right cache entry.
export const qk = {
  session: () => ["session"] as const,
  catalog: () => ["catalog"] as const,
  notifications: (audience: "customer" | "provider" = "customer") =>
    ["notifications", audience] as const,
  addresses: () => ["addresses"] as const,
  savedServices: () => ["saved-services"] as const,
  booking: (ref: string) => ["booking", ref] as const,
  bookings: () => ["bookings"] as const,
  availability: (serviceId: string, addressId: string, slot: string, scheduleType: string) =>
    ["availability", serviceId, addressId, slot, scheduleType] as const,
  vehicleBooking: (ref: string) => ["vehicle-booking", ref] as const,
  accommodationBooking: (ref: string) => ["accommodation-booking", ref] as const,
  properties: (query: string) => ["properties", query] as const,
} as const;
