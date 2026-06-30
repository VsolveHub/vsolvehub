import { STATUS_LABELS, STATUS_MESSAGES, normalizeBookingStatus } from "@/lib/constants";
import {
  ACCOMMODATION_STATUS_LABELS,
  ACCOMMODATION_STATUS_MESSAGES,
  type AccommodationStatus,
} from "@/lib/accommodation/constants";
import { VEHICLE_STATUS_MESSAGES } from "@/lib/vehicle/constants";
import type { NotificationTone } from "./types";

function getStatusMessage(status: string) {
  const normalized = normalizeBookingStatus(status);
  return STATUS_MESSAGES[normalized] ?? "Tracking your booking.";
}

function getVehicleStatusMessage(status: string) {
  return VEHICLE_STATUS_MESSAGES[status] ?? "Tracking your vehicle booking.";
}

function getAccommodationStatusMessage(status: string) {
  return (
    ACCOMMODATION_STATUS_MESSAGES[status as AccommodationStatus] ??
    "Tracking your accommodation booking."
  );
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function statusTone(status: string): NotificationTone {
  const s = normalizeBookingStatus(status);
  if (s === "CANCELLED" || s === "NO_WORKER_FOUND") return "warning";
  if (s === "COMPLETED") return "success";
  if (s === "SEARCHING_PROVIDER" || s === "PENDING" || s === "REQUESTED") return "info";
  if (s === "ASSIGNED" || s === "ACCEPTED" || s === "PROVIDER_ARRIVING" || s === "ON_THE_WAY") {
    return "alert";
  }
  return "info";
}

export function statusIcon(status: string, kind: "service" | "vehicle" | "stay" = "service"): string {
  const s = normalizeBookingStatus(status);
  if (s === "COMPLETED") return "check-circle";
  if (s === "CANCELLED" || s === "NO_WORKER_FOUND") return "cross-circle";
  if (s === "SEARCHING_PROVIDER" || s === "REQUESTED" || s === "PENDING") return "search-alt";
  if (kind === "vehicle") return "car-side";
  if (kind === "stay") return "bed";
  if (s === "ASSIGNED" || s === "ACCEPTED") return "clipboard-check";
  if (s === "PROVIDER_ARRIVING" || s === "ON_THE_WAY") return "motorcycle";
  return "bell";
}

export function serviceStatusTitle(status: string): string {
  const normalized = normalizeBookingStatus(status);
  return STATUS_LABELS[normalized] ?? normalized.replace(/_/g, " ");
}

export function serviceStatusBody(serviceName: string, bookingRef: string, status: string): string {
  return `${serviceName} · ${getStatusMessage(status)} · ${bookingRef}`;
}

export function vehicleStatusTitle(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function vehicleStatusBody(title: string, bookingRef: string, status: string): string {
  return `${title} · ${getVehicleStatusMessage(status)} · ${bookingRef}`;
}

export function stayStatusTitle(status: string): string {
  const key = status as keyof typeof ACCOMMODATION_STATUS_LABELS;
  return ACCOMMODATION_STATUS_LABELS[key] ?? status.replace(/_/g, " ");
}

export function stayStatusBody(propertyTitle: string, bookingRef: string, status: string): string {
  return `${propertyTitle} · ${getAccommodationStatusMessage(status)} · ${bookingRef}`;
}

const PROVIDER_STATUS_TITLES: Record<string, string> = {
  ASSIGNED: "Job assigned to you",
  PROVIDER_ARRIVING: "En route to customer",
  STARTED: "Job in progress",
  COMPLETED: "Job completed",
  CANCELLED: "Booking cancelled",
  NO_WORKER_FOUND: "Job reopened",
};

const PROVIDER_STATUS_BODIES: Record<string, string> = {
  ASSIGNED: "Head to the customer location to begin.",
  PROVIDER_ARRIVING: "Customer has been notified you are on the way.",
  STARTED: "Service is in progress at the customer location.",
  COMPLETED: "Great work! Earnings will appear in your wallet.",
  CANCELLED: "This booking was cancelled by the customer.",
  NO_WORKER_FOUND: "This job is back in the dispatch queue.",
};

export function providerStatusTitle(status: string): string {
  const normalized = normalizeBookingStatus(status);
  return PROVIDER_STATUS_TITLES[normalized] ?? serviceStatusTitle(status);
}

export function providerStatusBody(
  serviceName: string,
  bookingRef: string,
  status: string
): string {
  const normalized = normalizeBookingStatus(status);
  const msg = PROVIDER_STATUS_BODIES[normalized] ?? getStatusMessage(status);
  return `${serviceName} · ${msg} · ${bookingRef}`;
}
