"use client";

import { request } from "@vsolve/api-client";
import { Badge, Button, Dialog, useT } from "@vsolve/ui";
import { LocationPicker, type PickedLocation } from "@vsolve/ui/location-picker";
import { MapPin } from "lucide-react";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * "Find on map" for a Partner listing's location: opens the shared map picker
 * and hands back the confirmed pin with the server's address text for it.
 *
 * The caller saves the pin (`pickup_latitude`/`pickup_longitude` on a rental,
 * `latitude`/`longitude` on a stay) and places the text. A Partner may have
 * typed a shop name the geocoder cannot know, so callers fill blanks and the
 * area fields rather than overwriting everything.
 */

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

function reverseGeocode(point: { latitude: string; longitude: string }): Promise<PickedLocation> {
  return request(() => getApiClient().POST("/api/v1/geocoding/reverse/", { body: point }));
}

export interface FindOnMapProps {
  onPicked: (location: PickedLocation) => void;
  /** The pin already chosen, if any. The map opens on it. */
  pin?: { latitude: string; longitude: string } | null;
  /** Names what is being located, for the dialog title. */
  title?: string;
}

export function FindOnMap({ onPicked, pin = null, title }: FindOnMapProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <MapPin className="size-4" aria-hidden />
        {pin ? t("workspaces.location.movePin") : t("workspaces.location.findOnMap")}
      </Button>
      {pin ? <Badge tone="success">{t("workspaces.location.pinned")}</Badge> : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title ?? t("workspaces.location.title")}
        description={t("workspaces.location.description")}
      >
        {/* Mounted only while open, so each opening starts from the saved pin,
            not one dragged and then abandoned. */}
        {open ? (
          <LocationPicker
            apiKey={MAPS_KEY}
            reverseGeocode={reverseGeocode}
            initial={pin}
            confirmLabel={t("workspaces.location.useThis")}
            onConfirm={(location) => {
              onPicked(location);
              setOpen(false);
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
