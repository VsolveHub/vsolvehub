import { visibleLooks, type RoomLook } from "./looks";
import type { StayPropertySummary, StayUnit } from "./model";

/**
 * Search shows rooms, not buildings.
 *
 * Django returns the properties that have at least one matching room. Each
 * property is turned into one card per *look* of each room type here, so a
 * guest sees the room's own photos and price: "1 BHK" and "1 BHK · With
 * balcony" are two cards. At most three cards per property: the rest become
 * "+N more room types here", so one big property cannot fill the page. A look
 * without a photo, or with no room available, is left out of search.
 */

export const ROOM_CARDS_PER_PROPERTY = 3;

export type RoomCard = {
  key: string;
  property: StayPropertySummary;
  unit: StayUnit;
  /** The look this card shows: its photos, title and availability. */
  look: RoomLook;
  /** Other looks of the same room type the guest can switch to on the room page. */
  otherLooks: number;
  /** Matching cards of this property not shown as their own card. */
  moreHere: number;
};

export type RoomCardFilters = {
  minPrice?: number;
  maxPrice?: number;
  ac?: boolean;
  food?: boolean;
  sort?: string;
};

const AC_YES: unknown[] = ["AC", true];
const FOOD_YES: unknown[] = ["Food included", true];

function fieldOf(source: unknown, key: string): unknown {
  return source && typeof source === "object" ? (source as Record<string, unknown>)[key] : undefined;
}

function matches(unit: StayUnit, property: StayPropertySummary, filters: RoomCardFilters): boolean {
  if (filters.minPrice != null && unit.nightly_rate_paise < filters.minPrice) return false;
  if (filters.maxPrice != null && unit.nightly_rate_paise > filters.maxPrice) return false;
  // Same rule as the server: the room says so, or the whole property does.
  if (
    filters.ac &&
    !AC_YES.includes(fieldOf(unit.attributes, "ac")) &&
    !AC_YES.includes(fieldOf(property.structured_fields, "ac"))
  ) {
    return false;
  }
  if (
    filters.food &&
    !FOOD_YES.includes(fieldOf(unit.attributes, "food")) &&
    !FOOD_YES.includes(fieldOf(property.structured_fields, "food"))
  ) {
    return false;
  }
  return true;
}

export function hasRoomPhoto(unit: StayUnit): boolean {
  return visibleLooks(unit).length > 0;
}

export function roomCardsFrom(properties: StayPropertySummary[], filters: RoomCardFilters = {}): RoomCard[] {
  const cards: RoomCard[] = [];
  for (const property of properties) {
    const rooms = property.units
      .filter((unit) => hasRoomPhoto(unit) && matches(unit, property, filters))
      .sort((a, b) => a.nightly_rate_paise - b.nightly_rate_paise)
      .flatMap((unit) => {
        const looks = visibleLooks(unit);
        return looks.map((look) => ({ unit, look, otherLooks: looks.length - 1 }));
      });
    const shown = rooms.slice(0, ROOM_CARDS_PER_PROPERTY);
    const more = rooms.length - shown.length;
    shown.forEach(({ unit, look, otherLooks }, index) => {
      cards.push({
        key: `${property.id}:${unit.id}:${look.id}`,
        property,
        unit,
        look,
        otherLooks,
        // The note sits on the property's last card, where the guest finishes reading it.
        moreHere: index === shown.length - 1 ? more : 0,
      });
    });
  }
  if (filters.sort === "price_asc") cards.sort((a, b) => a.unit.nightly_rate_paise - b.unit.nightly_rate_paise);
  if (filters.sort === "price_desc") cards.sort((a, b) => b.unit.nightly_rate_paise - a.unit.nightly_rate_paise);
  return cards;
}
