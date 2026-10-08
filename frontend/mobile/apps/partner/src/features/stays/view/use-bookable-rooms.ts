import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { byRoomNumber, type StayProperty } from "../model";
import { fetchPartnerStayProperties } from "../queries";

export interface BookableRoomOption {
  id: string;
  label: string;
  roomNumber: string;
  unitName: string;
}

/**
 * Lists the property's rooms that aren't booked, grouped by unit,
 * with the enquired unit first.
 */
export function useBookableRooms(
  propertyId: string | undefined,
  preferUnitId?: string | null,
): BookableRoomOption[] {
  const properties = useQuery({
    queryKey: ["partner-stay-properties"],
    queryFn: fetchPartnerStayProperties,
    enabled: Boolean(propertyId),
  });

  return useMemo(() => {
    const property = properties.data?.find((row: StayProperty) => row.id === propertyId);
    const units = [...(property?.units ?? [])].sort((a, b) =>
      a.id === preferUnitId ? -1 : b.id === preferUnitId ? 1 : 0,
    );
    return units.flatMap((unit) =>
      [...(unit.rooms ?? [])]
        .filter((room) => room.status !== "BOOKED")
        .sort(byRoomNumber)
        .map((room) => ({
          id: room.id,
          roomNumber: room.number,
          unitName: unit.name,
          label: `${room.number} · ${unit.name}${room.status === "UNAVAILABLE" ? " (switched off)" : ""}`,
        })),
    );
  }, [properties.data, propertyId, preferUnitId]);
}
