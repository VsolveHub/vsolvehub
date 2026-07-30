"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { getServiceConfig } from "@/lib/catalog/service-config";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import type { CartItem } from "@/lib/cart/types";

const TIME_SLOTS = ["08-10 AM", "10-12 PM", "12-02 PM", "02-04 PM", "04-06 PM", "06-08 PM"];

function nextDays(count: number) {
  const out: { key: string; day: string; date: string }[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      key: d.toISOString().slice(0, 10),
      day: i === 0 ? "Today" : days[d.getDay()]!,
      date: `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`,
    });
  }
  return out;
}

type Props = {
  open: boolean;
  items: CartItem[];
  onClose: () => void;
  onSuccess: () => void;
  scheduledMap: Record<string, string>;
  setScheduledMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  embedded?: boolean;
};

export function BookSlotModal({
  open,
  items,
  onClose,
  onSuccess,
  scheduledMap,
  setScheduledMap,
  embedded = false,
}: Props) {
  const queryClient = useQueryClient();
  const [expandedItemId, setExpandedItemId] = useState<string>(() => items[0]?.id ?? "");
  const [scheduleType, setScheduleType] = useState<"instant" | "scheduled" | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [instantSlot, setInstantSlot] = useState(() => new Date(Date.now() + 45 * 60 * 1000).toISOString());
  const [error, setError] = useState("");
  const [preferredByItem, setPreferredByItem] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (open && items.length === 1 && !expandedItemId) setExpandedItemId(items[0]!.id);
  }, [expandedItemId, items, open]);

  const { data: catalogData } = useQuery({
    queryKey: ["catalog"],
    queryFn: api.catalog,
    staleTime: 5 * 60_000,
  });
  const catalogServices = catalogData?.services ?? [];
  const days = useMemo(() => nextDays(7), []);

  const activeItem = useMemo(
    () => items.find((it) => it.id === expandedItemId) ?? items[0] ?? null,
    [items, expandedItemId],
  );

  const serviceConfig = useMemo(() => {
    if (!activeItem) return null;
    return getServiceConfig(activeItem.categorySlug, undefined, activeItem.serviceSlug);
  }, [activeItem]);

  const supportsInstant = serviceConfig?.bookingTypes?.includes("instant") ?? false;

  const candidateSlot = useMemo(() => {
    if (!activeItem || !scheduleType) return null;
    if (scheduleType === "instant") return instantSlot;
    if (!dateKey || !timeSlot) return null;
    const startHour = 8 + TIME_SLOTS.indexOf(timeSlot) * 2;
    const d = new Date(`${dateKey}T00:00:00`);
    d.setHours(startHour, 0, 0, 0);
    return d.toISOString();
  }, [activeItem, dateKey, instantSlot, scheduleType, timeSlot]);

  const availabilityInput =
    activeItem && candidateSlot && scheduleType
      ? {
          serviceId: activeItem.serviceId,
          addressId: activeItem.addressId,
          slot: candidateSlot,
          scheduleType,
          durationMinutes: activeItem.durationMinutes,
        }
      : null;

  const availability = useQuery({
    queryKey: availabilityInput
      ? qk.availability(
          availabilityInput.serviceId,
          availabilityInput.addressId,
          availabilityInput.slot,
          availabilityInput.scheduleType,
          availabilityInput.durationMinutes,
        )
      : ["availability", "idle"],
    queryFn: () => api.availability(availabilityInput!),
    enabled: Boolean(open && availabilityInput),
    staleTime: 20_000,
    retry: 1,
  });

  const updateSlotMutation = useMutation({
    mutationFn: (input: {
      id: string;
      slot: string;
      scheduleType: "instant" | "scheduled";
      preferredPartnerId: string | null;
    }) =>
      api.updateCartItem(input.id, {
        slot: input.slot,
        scheduleType: input.scheduleType,
        preferredPartnerId: input.preferredPartnerId,
      }),
    onSuccess: (_, variables) => {
      const formatted =
        variables.scheduleType === "instant"
          ? "Instant (within 1 hour)"
          : new Date(variables.slot).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });

      setScheduledMap((prev) => ({ ...prev, [variables.id]: formatted }));
      queryClient.invalidateQueries({ queryKey: qk.cart() });
      if (items.length > 1) setExpandedItemId("");
      setError("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not book slot"),
  });

  if (!open) return null;

  const currentActiveId = expandedItemId || items[0]?.id || "";
  const allScheduled = items.every((it) => scheduledMap[it.id]);

  const resetChoice = (type: "instant" | "scheduled") => {
    setError("");
    setScheduleType(type);
    setDateKey("");
    setTimeSlot("");
    if (type === "instant") setInstantSlot(new Date(Date.now() + 45 * 60 * 1000).toISOString());
  };

  const handleConfirmSlot = (itemId: string) => {
    setError("");
    if (!scheduleType) {
      setError("Select Instant or Scheduled to continue.");
      return;
    }
    if (!candidateSlot) {
      setError("Choose a date and time slot to continue.");
      return;
    }
    if (availability.isFetching) {
      setError("Checking professional availability. Please wait a moment.");
      return;
    }
    if (!availability.data?.count) {
      setError("No professional is available for this slot. Choose another time.");
      return;
    }
    updateSlotMutation.mutate({
      id: itemId,
      slot: candidateSlot,
      scheduleType,
      preferredPartnerId: preferredByItem[itemId] ?? null,
    });
  };

  const body = (
    <>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700" role="alert">
          {error}
        </div>
      )}

      {items.map((it) => {
        const isExpanded = it.id === currentActiveId;
        const scheduledText = scheduledMap[it.id];
        const catalogSvc = catalogServices.find((s) => s.id === it.serviceId || s.slug === it.serviceSlug);
        const durationMin =
          (catalogSvc as { durationMinutes?: number; duration?: number } | undefined)?.durationMinutes ||
          (catalogSvc?.duration ? Math.round(catalogSvc.duration) : it.durationMinutes);
        const durationText =
          durationMin >= 60
            ? `Duration: ${Math.floor(durationMin / 60)} hr${durationMin % 60 ? ` ${durationMin % 60} min` : ""}`
            : `Duration: ${durationMin} min`;

        return (
          <div
            key={it.id}
            className={`overflow-hidden rounded-2xl border bg-white transition-all duration-200 ${
              isExpanded ? "border-[#ea580c] ring-2 ring-[#ea580c]/15" : "border-slate-200"
            }`}
          >
            {items.length > 1 ? (
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#0b1c30]">{it.serviceName}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{durationText}</p>
                  {scheduledText && !isExpanded ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-extrabold text-emerald-700">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                      {scheduledText}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExpandedItemId(isExpanded ? "" : it.id);
                    setScheduleType(null);
                    setDateKey("");
                    setTimeSlot("");
                    setError("");
                  }}
                  className={`min-h-[44px] rounded-xl border px-4 py-2 text-xs font-extrabold transition-all ${
                    scheduledText
                      ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                      : "border-[#ea580c] bg-[#fff7ed] text-[#ea580c] hover:bg-[#ea580c] hover:text-white"
                  }`}
                >
                  {scheduledText ? "Reschedule" : "Select slot"}
                </button>
              </div>
            ) : null}

            {isExpanded ? (
              <div className={`${items.length > 1 ? "border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3" : "p-4"} space-y-4`}>
                <div>
                  <p className="text-sm font-black text-[#0b1c30]">Book a slot</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Choose how soon you want the professional to arrive.
                  </p>
                </div>

                <div className={`grid gap-2 ${supportsInstant ? "grid-cols-2" : "grid-cols-1"}`}>
                  {supportsInstant ? (
                    <button
                      type="button"
                      onClick={() => resetChoice("instant")}
                      className={`min-h-[76px] rounded-xl border p-3 text-left transition-all ${
                        scheduleType === "instant"
                          ? "border-[#ea580c] bg-[#fff7ed] ring-1 ring-[#ea580c]/20"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-black text-[#0b1c30]">
                        <span className={`rounded-lg p-2 ${scheduleType === "instant" ? "bg-[#ea580c] text-white" : "bg-slate-100 text-slate-500"}`}>
                          <FlaticonIcon name="bolt" size={14} />
                        </span>
                        Instant
                      </span>
                      <span className="mt-2 block text-[11px] font-semibold text-slate-500">Professional arrives in 30-60 min</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => resetChoice("scheduled")}
                    className={`min-h-[76px] rounded-xl border p-3 text-left transition-all ${
                      scheduleType === "scheduled"
                        ? "border-[#ea580c] bg-[#fff7ed] ring-1 ring-[#ea580c]/20"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs font-black text-[#0b1c30]">
                      <span className={`rounded-lg p-2 ${scheduleType === "scheduled" ? "bg-[#ea580c] text-white" : "bg-slate-100 text-slate-500"}`}>
                        <FlaticonIcon name="calendar" size={14} />
                      </span>
                      Scheduled
                    </span>
                    <span className="mt-2 block text-[11px] font-semibold text-slate-500">Pick a date and time in the next 7 days</span>
                  </button>
                </div>

                {scheduleType === "scheduled" ? (
                  <div className="space-y-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Available dates
                    </span>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 hide-scrollbar">
                      {days.map((d) => {
                        const isSelected = dateKey === d.key;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => {
                              setDateKey(d.key);
                              setTimeSlot("");
                              setError("");
                            }}
                            className={`w-16 flex-shrink-0 rounded-xl border py-2 text-center transition-all ${
                              isSelected
                                ? "border-[#ea580c] bg-[#ea580c] text-white"
                                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                            }`}
                          >
                            <span className={`block text-[9px] font-black uppercase tracking-wider ${isSelected ? "text-white/90" : "text-slate-500"}`}>
                              {d.day}
                            </span>
                            <span className={`mt-0.5 block text-xs font-black ${isSelected ? "text-white" : "text-[#0b1c30]"}`}>
                              {d.date}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {dateKey ? (
                      <>
                        <span className="block pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Select time slot
                        </span>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {TIME_SLOTS.map((slot) => {
                            const isSelected = timeSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => {
                                  setTimeSlot(slot);
                                  setError("");
                                }}
                                className={`min-h-[44px] rounded-xl border px-2 py-2.5 text-xs font-black transition-all ${
                                  isSelected
                                    ? "border-[#ea580c] bg-[#ea580c] text-white"
                                    : "border-slate-200 bg-white text-[#0b1c30] hover:border-slate-300"
                                }`}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {scheduleType ? (
                  <div className="rounded-2xl border border-orange-100 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-[#0b1c30]">Choose your professional</p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          Pick a favourite or let Vsolve Hub assign the best match.
                        </p>
                      </div>
                      {!candidateSlot ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">
                          Select slot
                        </span>
                      ) : availability.isFetching ? (
                        <span className="text-[11px] font-bold text-[#ea580c]">Checking...</span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                            availability.data?.count ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          {availability.data?.count ?? 0} available
                        </span>
                      )}
                    </div>

                    {candidateSlot && !availability.isFetching && !availability.data?.count ? (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800" role="alert">
                        No professional can take this slot. Select another time to continue.
                      </div>
                    ) : candidateSlot ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setPreferredByItem((current) => ({ ...current, [it.id]: null }))}
                          className={`min-h-[72px] rounded-xl border p-3 text-left transition ${
                            !preferredByItem[it.id]
                              ? "border-[#ea580c] bg-[#fff7ed] ring-2 ring-orange-100"
                              : "border-slate-200 hover:border-orange-200"
                          }`}
                        >
                          <span className="block text-xs font-black text-[#0b1c30]">Best match</span>
                          <span className="mt-1 block text-[10px] font-medium text-slate-500">
                            Auto-assign by rating, distance and fairness
                          </span>
                        </button>
                        {(availability.data?.professionals ?? []).map((professional) => (
                          <button
                            key={professional.id}
                            type="button"
                            onClick={() =>
                              setPreferredByItem((current) => ({ ...current, [it.id]: professional.id }))
                            }
                            className={`min-h-[72px] rounded-xl border p-3 text-left transition ${
                              preferredByItem[it.id] === professional.id
                                ? "border-[#ea580c] bg-[#fff7ed] ring-2 ring-orange-100"
                                : "border-slate-200 hover:border-orange-200"
                            }`}
                          >
                            <span className="block truncate text-xs font-black text-[#0b1c30]">
                              {professional.name}
                              {professional.isPreviouslyBooked ? (
                                <span className="ml-1.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[9px] text-[#c2410c]">
                                  Booked before
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                              {professional.rating.toFixed(1)} rating - {professional.jobsCompleted} jobs - {professional.distanceKm} km
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-xs font-extrabold text-slate-700">
                    Service total {formatPrice(it.quotedAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleConfirmSlot(it.id)}
                    disabled={updateSlotMutation.isPending || availability.isFetching || !candidateSlot || !availability.data?.count}
                    className="min-h-[44px] rounded-xl bg-[#ea580c] px-5 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-[#c2410c] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {updateSlotMutation.isPending && updateSlotMutation.variables?.id === it.id ? "Saving..." : "Save slot"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in">
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div>
            <h2 className="text-lg font-black tracking-tight text-[#0b1c30]">Select time slot</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Pick a convenient arrival window</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close slot picker"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200/60"
          >
            <FlaticonIcon name="cross" size={14} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">{body}</div>

        <div className="border-t border-slate-100 bg-white p-5">
          <button
            type="button"
            onClick={() => {
              if (allScheduled) {
                onSuccess();
                onClose();
              }
            }}
            disabled={!allScheduled}
            className={`w-full rounded-2xl py-3.5 text-sm font-black shadow-md transition-all ${
              allScheduled
                ? "bg-[#ea580c] text-white shadow-orange-500/20 hover:bg-[#c2410c]"
                : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            {allScheduled ? "Confirm slot selection" : "Save each service slot to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
