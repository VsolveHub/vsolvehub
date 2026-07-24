"use client";

import type { AddrForm } from "./model";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

// Leaflet + its CSS are heavy and only needed once this form renders. Code-split
// the map out of the address bundle so the rest of the flow stays lightweight.
// ssr:false because Leaflet touches `window` and never needs to run on the server.
const LocationMap = dynamic(() => import("./LocationMap").then((m) => m.LocationMap), {
  ssr: false,
  loading: () => <div className="h-[200px] w-full animate-pulse bg-gray-200" />,
});

type Props = {
  form: AddrForm;
  setField: <K extends keyof AddrForm>(key: K, value: AddrForm[K]) => void;
  detectButton: React.ReactNode;
  saving: boolean;
  detecting: boolean;
  isLoggedIn: boolean;
  hasSavedAddresses: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  onPickCoords: (lat: number, lng: number) => void;
};

export function AddressFormView({ form, setField, detectButton, saving, detecting, isLoggedIn, hasSavedAddresses, onSubmit, onBack, onPickCoords }: Props) {
  const showBackButton = isLoggedIn ? hasSavedAddresses : true;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {detectButton}

      <div className="flex flex-col gap-2">
        <div className="w-full rounded-2xl overflow-hidden border-2 border-white shadow-md bg-gray-200">
          <LocationMap lat={form.lat} lng={form.lng} onPick={onPickCoords} />
        </div>
        <p className="text-[11px] font-semibold text-gray-500 mt-1 flex items-center gap-1">
          <span className="text-gray-400">ℹ️</span> Drag the pin or tap the map to set your exact location.
        </p>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Label</label>
          <input
            type="text"
            placeholder="Home, Office, Parent's house…"
            value={form.label}
            onChange={(e) => setField("label", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider">House / flat no.</label>
            <input
              type="text"
              placeholder="Flat 204, Block B"
              value={form.houseNumber}
              onChange={(e) => setField("houseNumber", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Pincode</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="500032"
              value={form.pincode}
              onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Landmark</label>
          <input
            type="text"
            placeholder="Near metro station"
            value={form.landmark}
            onChange={(e) => setField("landmark", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Area / locality</label>
            <input
              type="text"
              placeholder="Gachibowli"
              value={form.area}
              onChange={(e) => setField("area", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider">City</label>
            <input
              type="text"
              placeholder="Hyderabad"
              value={form.city}
              onChange={(e) => setField("city", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={saving || detecting}
          className="flex-1 py-4 px-4 bg-[var(--color-brand)] text-white rounded-xl text-sm font-black shadow-xl shadow-[var(--color-brand)]/20 disabled:opacity-60 transition-opacity focus:outline-none"
        >
          {saving ? "Saving…" : "Save & select"}
        </motion.button>
        {showBackButton && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onBack}
            className="py-4 px-6 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors focus:outline-none"
          >
            {isLoggedIn && hasSavedAddresses ? "Back" : "Cancel"}
          </motion.button>
        )}
      </div>
    </form>
  );
}
