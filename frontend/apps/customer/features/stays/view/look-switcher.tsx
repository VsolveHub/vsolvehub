"use client";

import { BedDouble } from "lucide-react";
import { cn } from "@vsolve/ui";

import { availabilityLabel } from "../model";
import type { RoomLook } from "../looks";

/**
 * "Other looks of this room": the same room type, same price and features, in another look.
 *
 * Shown under the gallery when the guest's room type has more than one look. Tapping a look
 * swaps the photos and the availability in place, so it reads as one room with a choice of
 * look, not a different listing. Room numbers are never shown.
 */
export function LookSwitcher({
  looks,
  selectedId,
  roomStyle,
  onSelect,
}: {
  looks: RoomLook[];
  selectedId: string;
  roomStyle?: string | null;
  onSelect: (lookId: string) => void;
}) {
  if (looks.length < 2) return null;
  return (
    <section
      aria-labelledby="other-looks-heading"
      className="rounded-[var(--radius-card)] border border-navy-200 bg-navy-50 p-4"
      data-testid="look-switcher"
    >
      <h2 id="other-looks-heading" className="text-sm font-bold text-text">
        Other looks of this room
      </h2>
      <p className="mt-0.5 text-xs text-navy-700">
        Same room, same price — different look. {looks.length} looks available.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {looks.map((look) => {
          const on = look.id === selectedId;
          const cover = look.media[0]?.url;
          return (
            <button
              key={look.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(look.id)}
              className={cn(
                "flex flex-col overflow-hidden rounded-control border bg-surface text-left transition",
                on ? "border-navy-900 ring-2 ring-navy-900" : "border-line hover:border-line-strong",
              )}
            >
              <span className="relative block aspect-[16/10] bg-surface-sunken">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <BedDouble className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-text-muted" />
                )}
              </span>
              <span className="flex flex-col gap-0.5 p-2">
                <span className="text-xs font-bold text-text">{look.name || look.display_name}</span>
                <span className="text-[11px] font-semibold text-success-text">
                  {availabilityLabel(look.available_count, roomStyle)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
