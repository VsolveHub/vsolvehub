export type CartLineItem = {
  key: string;
  label: string;
  value: string;
  qty: number;
  totalPaise: number;
};

export type CartItem = {
  id: string;
  bookingRef: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  categorySlug: string;
  slot: string;
  scheduleType: string;
  addressId: string;
  addressLabel: string;
  addressFull: string;
  quotedAmount: number;
  lineItems: CartLineItem[];
  archetypeDetails?: any;
};

export type CheckoutItemOutcome = {
  bookingRef: string;
  serviceName: string;
  outcome: "assigned" | "no_provider";
  partnerName?: string;
  refunded?: boolean;
};

export type CheckoutResult =
  | { ok: true; orderRef: string; items: CheckoutItemOutcome[] }
  | { ok: false; error: string };
