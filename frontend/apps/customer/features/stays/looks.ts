import type { Schemas } from "@vsolve/api-client";

import type { StayUnit } from "./model";

export type RoomLook = Schemas["RoomLook"];

/**
 * A room type can come in several looks: "1 BHK" rooms 101-103 look one way, 104-105 another.
 * Guests see one card per look ("1 BHK", "1 BHK · With balcony") and never a room number.
 *
 * A look is shown when it has a photo and at least one room available. A room type saved
 * before looks existed comes back with one look holding all its rooms; if a payload has none
 * at all, the type's own photos stand in as a single look.
 */
export function looksOf(unit: StayUnit): RoomLook[] {
  const looks = [...(unit.looks ?? [])].sort((a, b) => a.display_order - b.display_order);
  if (looks.length > 0) return looks;
  return [
    {
      id: "",
      name: "",
      display_name: unit.name,
      display_order: 0,
      media: unit.media ?? [],
      // Public payloads list only active types, so a type with no count has a room free.
      available_count: unit.available_count ?? 1,
      room_count: unit.quantity ?? 0,
    },
  ];
}

/** The looks a guest can see right now: with a photo and a room free. */
export function visibleLooks(unit: StayUnit): RoomLook[] {
  return looksOf(unit).filter((look) => look.media.length > 0 && look.available_count > 0);
}

/** The look to open with: the one asked for, else the first visible, else the first. */
export function pickLook(unit: StayUnit | undefined, lookId?: string | null): RoomLook | undefined {
  if (!unit) return undefined;
  const all = looksOf(unit);
  return (
    all.find((look) => look.id && look.id === lookId) ?? visibleLooks(unit)[0] ?? all[0]
  );
}

export function lookTitle(unit: StayUnit, look: RoomLook | undefined): string {
  return look?.display_name || unit.name;
}

/** "+1 more look": how many other looks of the same room type a guest can switch to. */
export function otherLooksLabel(count: number): string {
  return count > 0 ? `+${count} more look${count === 1 ? "" : "s"}` : "";
}
