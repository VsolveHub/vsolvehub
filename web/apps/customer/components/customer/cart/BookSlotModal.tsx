"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { getServiceConfig } from "@/lib/catalog/service-config";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import type { CartItem } from "@/lib/cart/types";

const TIME_SLOTS = ["08–10 AM", "10–12 PM", "12–02 PM", "02–04 PM", "04–06 PM", "06–08 PM"];

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
};

export function BookSlotModal({ open, items, onClose, onSuccess, scheduledMap, setScheduledMap }: Props) {
  const queryClient = useQueryClient();
  
  // Track which item is currently expanded for scheduling (default to first item if empty)
  const [expandedItemId, setExpandedItemId] = useState<string>(() => items[0]?.id ?? "");
  const [scheduleType, setScheduleType] = useState<"instant" | "scheduled">("scheduled");
  const [dateKey, setDateKey] = useState(() => nextDays(1)[0]!.key);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[2]!);
  const [error, setError] = useState("");

  // Load catalog to get service durations
  const { data: catalogData } = useQuery({ 
    queryKey: ["catalog"], 
    queryFn: api.catalog, 
    staleTime: 5 * 60_000 
  });
  const catalogServices = catalogData?.services ?? [];

  const days = useMemo(() => nextDays(7), []);

  const activeItem = useMemo(() => {
    return items.find((it) => it.id === expandedItemId) ?? items[0] ?? null;
  }, [items, expandedItemId]);

  const serviceConfig = useMemo(() => {
    if (!activeItem) return null;
    return getServiceConfig(activeItem.categorySlug, undefined, activeItem.serviceSlug);
  }, [activeItem]);

  const supportsInstant = useMemo(() => {
    return serviceConfig?.bookingTypes?.includes("instant") ?? false;
  }, [serviceConfig]);

  function buildSlotIso(): string {
    if (scheduleType === "instant") {
      return new Date(Date.now() + 45 * 60 * 1000).toISOString();
    }
    const startHour = 8 + TIME_SLOTS.indexOf(timeSlot) * 2;
    const d = new Date(`${dateKey}T00:00:00`);
    d.setHours(startHour, 0, 0, 0);
    return d.toISOString();
  }

  const updateSlotMutation = useMutation({
    mutationFn: (input: { id: string; slot: string; scheduleType: "instant" | "scheduled" }) =>
      api.updateCartItem(input.id, { slot: input.slot, scheduleType: input.scheduleType }),
    onSuccess: (_, variables) => {
      const formatted =
        variables.scheduleType === "instant"
          ? "Instant (Within 1 hour)"
          : `${new Date(variables.slot).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}`;
      
      setScheduledMap((prev) => ({ ...prev, [variables.id]: formatted }));
      queryClient.invalidateQueries({ queryKey: qk.cart() });
      setExpandedItemId("");
      setError("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not book slot"),
  });

  if (!open) return null;

  const currentActiveId = expandedItemId || items[0]?.id || "";
  const allScheduled = items.every((it) => scheduledMap[it.id]);

  const handleConfirmSlot = (itemId: string) => {
    setError("");
    const slotIso = buildSlotIso();
    updateSlotMutation.mutate({
      id: itemId,
      slot: slotIso,
      scheduleType,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in select-none">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-black text-[#0b1c30] tracking-tight">Select Time Slot</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Pick a convenient arrival window</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-200/60 rounded-full text-slate-500 font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Services List with Expandable Slots */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold border border-red-200">
              {error}
            </div>
          )}

          {items.map((it) => {
            const isExpanded = it.id === currentActiveId;
            const scheduledText = scheduledMap[it.id];
            
            // Find service details from catalog for duration in minutes
            const catalogSvc = catalogServices.find((s) => s.id === it.serviceId || s.slug === it.serviceSlug);
            const durationMin = catalogSvc?.durationMinutes || (catalogSvc?.duration ? Math.round(catalogSvc.duration) : 45);
            const durationText = durationMin >= 60 
              ? `Duration: ~${Math.floor(durationMin / 60)} hr ${durationMin % 60 > 0 ? `${durationMin % 60} mins` : ""}`
              : `Duration: ~${durationMin} mins`;

            return (
              <div 
                key={it.id} 
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isExpanded ? "border-[#ea580c] ring-2 ring-[#ea580c]/15 shadow-sm bg-white" : "border-slate-200 bg-white"
                }`}
              >
                {/* Accordion Trigger Row */}
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#0b1c30] truncate">
                      {it.serviceName}
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      {durationText}
                    </p>
                    {scheduledText && !isExpanded && (
                      <p className="text-xs text-emerald-700 font-extrabold mt-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                        {scheduledText}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedItemId("");
                      } else {
                        setExpandedItemId(it.id);
                        const config = getServiceConfig(it.categorySlug, undefined, it.serviceSlug);
                        setScheduleType(config.bookingTypes?.includes("instant") ? "instant" : "scheduled");
                      }
                    }}
                    className={`px-4 py-2 text-xs font-extrabold rounded-xl border transition-all cursor-pointer ${
                      scheduledText
                        ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                        : "border-[#ea580c] text-[#ea580c] bg-[#fff7ed] hover:bg-[#ea580c] hover:text-white"
                    }`}
                  >
                    {scheduledText ? "Reschedule" : "Select Slot"}
                  </button>
                </div>

                {/* Inline Slot Picker Area */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-4">
                    {/* Instant vs Scheduled selector */}
                    <div className="grid grid-cols-2 gap-2">
                      {supportsInstant && (
                        <button
                          type="button"
                          onClick={() => setScheduleType("instant")}
                          className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                            scheduleType === "instant" ? "border-[#ea580c] bg-[#fff7ed] text-[#ea580c] ring-1 ring-[#ea580c]/20" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${scheduleType === "instant" ? "bg-[#ea580c] text-white" : "bg-slate-100 text-slate-500"}`}>
                            ⚡
                          </div>
                          <div>
                            <p className="text-xs font-black text-[#0b1c30]">Instant</p>
                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">30-60 min arrival</p>
                          </div>
                        </button>
                      )}
                      
                      <button
                        type="button"
                        onClick={() => setScheduleType("scheduled")}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          scheduleType === "scheduled" ? "border-[#ea580c] bg-[#fff7ed] text-[#ea580c] ring-1 ring-[#ea580c]/20" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        } ${!supportsInstant ? "col-span-2" : ""}`}
                      >
                        <div className={`p-2 rounded-lg ${scheduleType === "scheduled" ? "bg-[#ea580c] text-white" : "bg-slate-100 text-slate-500"}`}>
                          📅
                        </div>
                        <div>
                          <p className="text-xs font-black text-[#0b1c30]">Scheduled</p>
                          <p className="text-[10px] text-slate-500 font-bold mt-0.5">Select date &amp; time</p>
                        </div>
                      </button>
                    </div>

                    {/* Calendar Date Badges and Time Slot Picker */}
                    {scheduleType === "scheduled" && (
                      <div className="space-y-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          AVAILABLE DATES
                        </span>
                        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 hide-scrollbar">
                          {days.map((d) => {
                            const isSelected = dateKey === d.key;
                            return (
                              <button
                                key={d.key}
                                type="button"
                                onClick={() => setDateKey(d.key)}
                                className={`flex-shrink-0 w-16 rounded-xl border py-2 text-center transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-[#ea580c] border-[#ea580c] text-white shadow-xs"
                                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <span className={`block text-[9px] font-black uppercase tracking-wider ${isSelected ? "text-white/90" : "text-slate-500"}`}>
                                  {d.day}
                                </span>
                                <span className={`block text-xs font-black mt-0.5 ${isSelected ? "text-white" : "text-[#0b1c30]"}`}>
                                  {d.date.split(" ")[0]}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block pt-1">
                          SELECT TIME SLOT
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {TIME_SLOTS.map((slot) => {
                            const isSelected = timeSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setTimeSlot(slot)}
                                className={`rounded-xl border py-2.5 text-xs font-black transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-[#ea580c] border-[#ea580c] text-white shadow-xs"
                                    : "border-slate-200 text-[#0b1c30] bg-white hover:bg-slate-50 hover:border-slate-300"
                                }`}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Slot Save Action */}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-xs font-extrabold text-slate-700">
                        Selected for {formatPrice(it.quotedAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleConfirmSlot(it.id)}
                        disabled={updateSlotMutation.isPending}
                        className="px-5 py-2 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {updateSlotMutation.isPending && updateSlotMutation.variables?.id === it.id 
                          ? "Saving..." 
                          : "Save Slot"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Footer Main Confirm Button */}
        <div className="p-5 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => {
              if (allScheduled) {
                onSuccess();
                onClose();
              }
            }}
            disabled={!allScheduled}
            className={`w-full py-3.5 rounded-2xl text-sm font-black transition-all shadow-md ${
              allScheduled
                ? "bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white shadow-orange-500/20 cursor-pointer"
                : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
            }`}
          >
            {allScheduled ? "Confirm Slot Selection" : "Save slot above to confirm"}
          </button>
        </div>

      </div>
    </div>
  );
}
