export type BookingParty = {
  id: string;
  name: string;
  phone: string;
  rating: number;
  etaMinutes?: number;
};

export type Booking = {
  bookingRef: string;
  status: string;
  message: string;
  marketplace?: boolean;
  isCrew?: boolean;
  service: { id: string; name: string; slug: string; categorySlug: string };
  issueDescription: string;
  mediaUrls: string[];
  slot: string;
  scheduleType: string;
  address: string;
  vendor: BookingParty | null;
  provider: BookingParty | null;
  quotedAmount: number;
  finalAmountPaise: number;
  paymentStatus: string;
  paymentMethod: string | null;
  rating: number | null;
  archetypeDetails: string;
  cancelFeePaise?: number;
  createdAt?: string;
};
