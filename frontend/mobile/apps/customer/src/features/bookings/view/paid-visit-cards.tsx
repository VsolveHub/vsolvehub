// Ported from frontend/apps/customer/features/bookings/view/paid-visit-cards.tsx
import { Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { bookingVisitHref } from "@/lib/routes";
import { Money } from "@/features/payment/view/money";

import type { BookingGroup, FulfilmentUnit } from "../queries";
import {
  formatBookingDate,
  formatBookingTime,
  formatBookingWhen,
  linePresentationLabel,
  serviceLinesOf,
} from "./booking-format";
import { MockProfessionalCard } from "./mock-professional-card";
import { ProfessionalCard } from "./professional-card";
import { UnitStatusBadge } from "./group-status";
import { VisitProgress } from "./visit-progress";

function ProfessionalBlock({ unit, isPaid }: { unit: FulfilmentUnit; isPaid: boolean }) {
  if (unit.professional && isPaid) {
    return (
      <View className="gap-2">
        <View className="flex-row items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-emerald-700">✓ Real Partner Details Unlocked</Text>
        </View>
        <ProfessionalCard professional={unit.professional} embedded />
      </View>
    );
  }
  if (unit.professional || unit.status === "HELD" || unit.status === "PAYMENT_PENDING") {
    return <MockProfessionalCard serviceName={unit.lines[0]?.label} />;
  }
  return null;
}

function RecoveryNote({ unit }: { unit: FulfilmentUnit }) {
  if (unit.status !== "RECOVERY_REQUIRED") return null;
  return (
    <Text className="mt-3 rounded-control bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
      Your professional had to step back. We are assigning someone else now — if we cannot, this visit is cancelled and refunded in full automatically.
    </Text>
  );
}

function ScheduleBlock({ unit }: { unit: FulfilmentUnit }) {
  const cells = [
    ["Date", formatBookingDate(unit.starts_at)],
    ["Time", formatBookingTime(unit.starts_at)],
    ["Arrival window", `${unit.arrival_window_minutes} min`],
    ["Estimated work", `about ${unit.estimated_duration_minutes} min`],
  ];
  return (
    <View className="flex-row flex-wrap gap-y-3">
      {cells.map(([label, value]) => (
        <View key={label} className="w-[48%]">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</Text>
          <Text className="mt-0.5 text-sm font-medium text-text">{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function SingleVisitDetailCard({ unit, isPaid }: { unit: FulfilmentUnit; isPaid: boolean }) {
  const services = serviceLinesOf(unit);
  return (
    <View className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-lg font-bold text-text">Your visit</Text>
        <UnitStatusBadge unit={unit} />
      </View>
      {unit.booking_status ? (
        <View className="mt-4">
          <VisitProgress status={unit.booking_status} />
        </View>
      ) : null}
      <View className="mt-5">
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Professional</Text>
        <View className="mt-2">
          <ProfessionalBlock unit={unit} isPaid={isPaid} />
        </View>
      </View>
      <RecoveryNote unit={unit} />
      {services.length > 0 ? (
        <View className="mt-5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Service</Text>
          <View className="mt-2 gap-1">
            {services.map((line) => (
              <Text key={line.id} className="text-sm text-text">
                {line.label}
                {line.quantity > 1 ? <Text className="text-text-secondary"> × {line.quantity}</Text> : null}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      <View className="mt-5 border-t border-line pt-5">
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Schedule</Text>
        <View className="mt-3">
          <ScheduleBlock unit={unit} />
        </View>
      </View>
    </View>
  );
}

export function MultiVisitOverviewCard({
  unit,
  index,
  total,
  groupId,
  isPaid,
}: {
  unit: FulfilmentUnit;
  index: number;
  total: number;
  groupId: string;
  isPaid: boolean;
}) {
  const services = serviceLinesOf(unit);
  return (
    <View className="rounded-card border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="text-sm font-semibold text-text">
          Visit {index + 1} of {total}
        </Text>
        <UnitStatusBadge unit={unit} />
      </View>
      <Text className="mt-1 text-sm text-text-secondary">
        {formatBookingWhen(unit.starts_at)}
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </Text>
      <View className="mt-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Professional</Text>
        <View className="mt-2">
          <ProfessionalBlock unit={unit} isPaid={isPaid} />
        </View>
      </View>
      <RecoveryNote unit={unit} />
      {services.length > 0 ? (
        <View className="mt-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Service</Text>
          {services.map((line) => (
            <Text key={line.id} className="text-sm text-text">
              {line.label}
              {line.quantity > 1 ? <Text className="text-text-secondary"> × {line.quantity}</Text> : null}
            </Text>
          ))}
        </View>
      ) : null}
      {unit.booking_id ? (
        <Link href={bookingVisitHref(groupId, unit.booking_id)} asChild>
          <Pressable className={buttonStyles({ variant: "outline", className: "mt-4 w-full justify-center" })}>
            <Text className="text-sm font-semibold text-text">View details</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

function PaymentLineRow({ line }: { line: FulfilmentUnit["lines"][number] }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-text-secondary">
        {linePresentationLabel(line)}
        {line.kind === "SERVICE" && line.quantity > 1 ? ` × ${line.quantity}` : ""}
      </Text>
      <Money value={line.amount} className="shrink-0 text-sm tabular-nums text-text" />
    </View>
  );
}

function ReceiptLink({ groupId, orderId }: { groupId: string; orderId: string | null }) {
  if (orderId === null) return null;
  return (
    <Link href={`/bookings/${groupId}/receipt`} asChild>
      <Pressable className={buttonStyles({ variant: "outline", className: "mt-5 w-full justify-center" })}>
        <Text className="text-sm font-semibold text-text">View your receipt</Text>
      </Pressable>
    </Link>
  );
}

export function PaidVisitPaymentCard({
  unit,
  groupId,
  orderId,
}: {
  unit: FulfilmentUnit;
  groupId: string;
  orderId: string | null;
}) {
  return (
    <View className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Payment summary</Text>
      <View className="mt-4 gap-2">
        {unit.lines.map((line) => (
          <PaymentLineRow key={line.id} line={line} />
        ))}
      </View>
      <View className="mt-4 flex-row justify-between border-t border-line pt-3">
        <Text className="text-sm font-semibold text-text">Visit total</Text>
        <Money value={unit.total} className="text-sm font-semibold tabular-nums text-text" />
      </View>
      <ReceiptLink groupId={groupId} orderId={orderId} />
    </View>
  );
}

export function PaidGroupPaymentCard({ group }: { group: BookingGroup }) {
  const currency = group.units[0]?.total.currency ?? "INR";
  const totalPaise = group.units.reduce((sum, unit) => sum + unit.total.amount_paise, 0);
  return (
    <View className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Payment summary</Text>
      <View className="mt-4 gap-4">
        {group.units.map((unit, index) => (
          <View key={unit.id} className={index > 0 ? "border-t border-line pt-4" : undefined}>
            <Text className="text-xs font-semibold text-text">Visit {index + 1}</Text>
            <View className="mt-2 gap-2">
              {unit.lines.map((line) => (
                <PaymentLineRow key={line.id} line={line} />
              ))}
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-sm text-text-secondary">Visit total</Text>
              <Money value={unit.total} className="text-sm tabular-nums text-text-secondary" />
            </View>
          </View>
        ))}
      </View>
      <View className="mt-4 flex-row justify-between border-t border-line pt-3">
        <Text className="text-sm font-semibold text-text">Booking total</Text>
        <Money
          value={{ amount_paise: totalPaise, currency }}
          className="text-sm font-semibold tabular-nums text-text"
        />
      </View>
      <ReceiptLink groupId={group.id} orderId={group.order_id} />
    </View>
  );
}
