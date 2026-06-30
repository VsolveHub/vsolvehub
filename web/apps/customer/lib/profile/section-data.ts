import type { SessionUser } from "@/lib/auth/session";

export type WalletTransaction = {
  id: string;
  label: string;
  date: string;
  amountPaise: number;
  type: "credit" | "debit";
};

export type PaymentMethod = {
  id: string;
  type: "upi" | "card" | "wallet";
  label: string;
  detail: string;
  isDefault: boolean;
};

export type ServicePlan = {
  id: string;
  name: string;
  frequency: string;
  nextVisit: string;
  pricePaise: number;
  status: "active" | "paused";
};

export const WALLET_BALANCE_PAISE = 125000;

export const WALLET_TRANSACTIONS: WalletTransaction[] = [
  { id: "1", label: "Referral bonus", date: "Jun 10, 2026", amountPaise: 10000, type: "credit" },
  { id: "2", label: "Booking — Electrical Services", date: "Jun 5, 2026", amountPaise: -49900, type: "debit" },
  { id: "3", label: "Cashback reward", date: "May 28, 2026", amountPaise: 5000, type: "credit" },
  { id: "4", label: "Top-up via UPI", date: "May 20, 2026", amountPaise: 50000, type: "credit" },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "1", type: "upi", label: "Google Pay", detail: "likhithagandham@okaxis", isDefault: true },
  { id: "2", type: "card", label: "HDFC Debit", detail: "•••• 4821", isDefault: false },
];

export const SERVICE_PLANS: ServicePlan[] = [
  {
    id: "1",
    name: "Home Cleaning",
    frequency: "Every 2 weeks",
    nextVisit: "Jun 25, 2026",
    pricePaise: 99900,
    status: "active",
  },
  {
    id: "2",
    name: "AC Service",
    frequency: "Quarterly",
    nextVisit: "Jul 12, 2026",
    pricePaise: 149900,
    status: "active",
  },
];

export const MEMBERSHIP_BENEFITS = [
  "10% off on all home services",
  "Priority booking & faster dispatch",
  "Free rescheduling up to 2 hrs before slot",
  "Dedicated support line",
  "₹100 referral bonus (double for Plus members)",
];

export const HELP_FAQ = [
  {
    q: "How do I reschedule a booking?",
    a: "Open My bookings, select your booking, and tap Reschedule. Free rescheduling is available up to 2 hours before the slot.",
  },
  {
    q: "When will a professional be assigned?",
    a: "We start matching as soon as you confirm. Most bookings get a professional within 30–60 minutes.",
  },
  {
    q: "What payment methods are accepted?",
    a: "UPI, debit/credit cards, V Solve Hub wallet, and cash on completion for select services.",
  },
  {
    q: "How do refunds work?",
    a: "Cancelled bookings are refunded to your wallet within 24 hours. Bank refunds may take 3–5 business days.",
  },
];

export const HELP_CONTACT = [
  { label: "Call support", value: "1800-123-4567", href: "tel:18001234567" },
  { label: "Email", value: "support@vsolvehub.com", href: "mailto:support@vsolvehub.com" },
];

export const ABOUT_INFO = {
  tagline: "One app, all solutions",
  description:
    "V Solve Hub connects you with verified professionals for home services, construction labour, beauty, events, rentals, vehicles, accommodation, jobs, and more — all in Hyderabad and expanding across Telangana.",
  version: "1.0.0",
  links: [
    { label: "Terms of service", href: "#" },
    { label: "Privacy policy", href: "#" },
    { label: "Cancellation policy", href: "#" },
  ],
};

export function getCustomerRating(bookingCount: number) {
  return {
    score: bookingCount > 0 ? 4.82 : 5.0,
    reviewsGiven: Math.max(bookingCount, 0),
    compliments: ["Polite", "On time", "Clear instructions"],
  };
}

export function getProfileStats(session: SessionUser, bookingCount: number, savedCount: number, addressCount: number) {
  return {
    bookings: bookingCount,
    saved: savedCount,
    addresses: addressCount,
    memberSince: "2026",
    name: session.name ?? "VSolveHub customer",
  };
}
