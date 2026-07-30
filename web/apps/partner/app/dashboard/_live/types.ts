import {
  Navigation,
  Sparkles,
  Zap,
  Banknote,
  FileText,
  Award,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "@/components/graphics";

export type Offer = {
  kind: "RIDE" | "CLEAN" | "REPAIR";
  title: string;
  fare: number;
  surge: number;
  travelKm: number;
  etaMin: number;
  durationMin: number;
  area: string;
  pickup: string;
  drop: string;
  customer: { name: string; rating: number; since: string };
  tasks: string[];
  materials: string[];
};

export type LedgerEntry = { id: string; title: string; ref: string; amount: number; when: string };
export type AlertKind = "offer" | "payout" | "doc" | "milestone" | "job";
export type AlertItem = { kind: AlertKind; title: string; body: string; when: string };

export type Props = {
  name: string;
  providerType: string;
  service: string;
  city: string;
  status: string;
  rating: number;
  /** Number of customer reviews backing the rating (0 = not yet rated). */
  reviewCount: number;
  /** Recent customer reviews to surface on the profile. */
  reviews: PartnerReview[];
  jobsCompleted: number;
  onlineHours: number;
  todayEarnings: number;
  weekTotal: number;
  allTotal: number;
  avgJob: number;
  /** Lifetime net earnings (real). */
  lifetimeEarnings: number;
  /** Average earnings per active day = lifetime / distinct days worked. */
  avgPerDay: number;
  week: { label: string; value: number }[];
  ledger: LedgerEntry[];
  alerts: AlertItem[];
  tier: string;
  bankLast4: string | null;
  offer: Offer;
  // gate data (non-active states)
  refId: string;
  reason: string;
  checklist: { label: string; ok: boolean }[];
  // crew (team lead) data — surfaced in the Jobs tab + Home banner
  crew?: CrewSummary | null;
  withdrawals: WithdrawalEntry[];
  /** The partner's current real job (accepted via the offer poller), if any. */
  activeJob: ActiveJob | null;
  /** Persisted online state from the DB so a reload keeps the captain online. */
  initialOnline: boolean;
};

export type ActiveJob = {
  bookingId: string;
  bookingRef: string;
  status: string;
  service: string;
  area: string;
  customerName: string;
  customerPhone: string;
  amountPaise: number;
  durationMinutes: number;
  extensionMinutes: number;
  startConfirmedAt: string | null;
  /** Structured intake the customer submitted (e.g. Switch type: Modular). */
  details: { label: string; value: string }[];
  /** Optional free-text note from the customer. */
  note: string;
};

export type PartnerReview = {
  bookingRef: string;
  rating: number;
  review: string;
  date: string;
  service: string;
  customerName: string;
};

/** Map a real booking status to the captain-live work-loop stage. */
export function workStage(status: string): "enroute" | "arrived" | "working" {
  if (status === "PROVIDER_ARRIVING") return "arrived";
  if (status === "STARTED") return "working";
  return "enroute"; // ASSIGNED
}

export type WithdrawalEntry = { id: string; amount: number; ref: string; when: string };

export type CrewJobLite = {
  bookingRef: string;
  service: string;
  location: string;
  status: string;
  durationDays: number;
  amountRupees: number;
};

export type CrewSummary = {
  name: string;
  pendingRequests: number;
  jobs: CrewJobLite[];
};

export const CREW_JOB_STATUS_LABEL: Record<string, string> = {
  CREW_ASSIGNED: "Assigned",
  CREW_EN_ROUTE: "On the way",
  CREW_WORKING: "Working",
  AWAITING_PAYMENT: "Awaiting payment",
};

export type Stage = "offline" | "searching" | "offer" | "enroute" | "arrived" | "working" | "complete";
export type Tab = "home" | "jobs" | "earnings" | "alerts" | "profile";

export const KIND_ICON: Record<Offer["kind"], LucideIcon> = {
  RIDE: Navigation,
  CLEAN: Sparkles,
  REPAIR: Zap,
};

export const ALERT_META: Record<AlertKind, { icon: LucideIcon; tone: Tone }> = {
  offer: { icon: Zap, tone: "brand" },
  payout: { icon: Banknote, tone: "green" },
  doc: { icon: FileText, tone: "amber" },
  milestone: { icon: Award, tone: "violet" },
  job: { icon: CheckCircle2, tone: "green" },
};

export function clock(d: Date) {
  return d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: false })
    .padStart(5, "0");
}
export function mmss(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}
