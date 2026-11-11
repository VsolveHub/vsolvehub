"use client";

import { Car } from "lucide-react";

import { ServiceTabs, useServiceTab } from "@/features/money/service-tabs";

import { CaptainsList } from "./captains-list";
import { RideList } from "./ride-list";
import { SosQueue } from "./sos-queue";

const TABS = [
  { key: "rides", label: "Rides" },
  { key: "sos", label: "SOS" },
  { key: "captains", label: "Captains" },
] as const;

/** Operations › Rides: live and past rides, the SOS queue and the captains (brief §5.11). */
export function RidesWorkspace() {
  const [tab, setTab] = useServiceTab(TABS);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <div>
        <div className="flex items-center gap-2">
          <Car className="size-6 text-brand-600" aria-hidden />
          <h1 className="text-2xl font-bold text-navy-900">Rides</h1>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Bike, auto and car rides: watch live rides, answer SOS alerts and check captains.
        </p>
      </div>

      <ServiceTabs tabs={TABS} active={tab} onChange={setTab} label="Rides sections" />

      {tab === "rides" ? <RideList /> : null}
      {tab === "sos" ? <SosQueue /> : null}
      {tab === "captains" ? <CaptainsList /> : null}
    </div>
  );
}
