"use client";

import { useState } from "react";
import { PinIcon } from "@/components/ui/AppIcons";
import { LocationError, detectCurrentLocation } from "@/lib/location/geocode";
import {
  useAddressesQuery,
  useAddAddressMutation,
  useDeleteAddressMutation,
} from "@/lib/query/hooks";
import { motion, AnimatePresence } from "framer-motion";

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type FormState = {
  label: string;
  houseNumber: string;
  landmark: string;
  area: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
};

const EMPTY: FormState = {
  label: "Home",
  houseNumber: "",
  landmark: "",
  area: "",
  city: "",
  pincode: "",
};

export function AddressManager({ initialAddresses }: { initialAddresses: Address[] }) {
  const { data: addressesData } = useAddressesQuery({
    initialData: { addresses: initialAddresses },
  });
  const addresses = addressesData?.addresses || [];

  const addAddressMutation = useAddAddressMutation();
  const deleteAddressMutation = useDeleteAddressMutation();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");

  const saving = addAddressMutation.isPending;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function detect() {
    setError("");
    setDetecting(true);
    try {
      const loc = await detectCurrentLocation();
      setForm((prev) => ({
        ...prev,
        houseNumber: loc.houseNumber || prev.houseNumber,
        area: loc.area || prev.area,
        city: loc.city || prev.city,
        pincode: loc.pincode || prev.pincode,
        lat: loc.lat,
        lng: loc.lng,
      }));
      if (!loc.area && !loc.city) {
        setError("We found your position but couldn't read the address — please complete the fields.");
      }
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location.");
    } finally {
      setDetecting(false);
    }
  }

  function addAddress() {
    setError("");
    if (!form.label.trim()) {
      setError("Label is required");
      return;
    }
    if ((!form.area.trim() || !form.city.trim()) && form.lat == null) {
      setError("Enter an area and city, or use your current location.");
      return;
    }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      setError("Enter a valid 6-digit pincode");
      return;
    }

    addAddressMutation.mutate({
      label: form.label.trim(),
      houseNumber: form.houseNumber.trim() || undefined,
      landmark: form.landmark.trim() || undefined,
      area: form.area.trim() || undefined,
      city: form.city.trim() || undefined,
      pincode: form.pincode.trim() || undefined,
      lat: form.lat,
      lng: form.lng,
      isDefault: addresses.length === 0,
    }, {
      onSuccess: () => {
        setForm(EMPTY);
        setShowForm(false);
      },
      onError: (err: any) => {
        setError(err.message || "Could not save address. Please check the fields.");
      }
    });
  }

  function removeAddress(id: string) {
    deleteAddressMutation.mutate(id);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-500">Manage delivery addresses for bookings.</p>
        <button
          className={`py-2 px-4 rounded-xl text-sm font-bold transition-colors focus:outline-none ${showForm ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-[var(--color-brand-light)] text-[var(--color-brand)] border border-[var(--color-brand-light)] hover:border-[var(--color-brand)]/30"}`}
          onClick={() => {
            setError("");
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "+ Add address"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {showForm ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className="bg-white rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-6 sm:p-8 flex flex-col gap-5 overflow-hidden"
          >
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full py-4 px-4 rounded-xl font-bold text-sm bg-[var(--color-brand-light)] text-[var(--color-brand)] border border-[var(--color-brand-light)] hover:border-[var(--color-brand)]/30 transition-all shadow-sm focus:outline-none"
              onClick={detect}
              disabled={detecting}
            >
              <PinIcon />
              {detecting ? "Detecting your location…" : "Use my current location"}
            </button>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Label</label>
              <input 
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                value={form.label} 
                onChange={(e) => setField("label", e.target.value)} 
                placeholder="Home, Office, Parent's house…" 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">House / flat no.</label>
                <input 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                  value={form.houseNumber} 
                  onChange={(e) => setField("houseNumber", e.target.value)} 
                  placeholder="Flat 204, Block B" 
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Pincode</label>
                <input
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                  value={form.pincode}
                  onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="500032"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Landmark</label>
              <input 
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                value={form.landmark} 
                onChange={(e) => setField("landmark", e.target.value)} 
                placeholder="Near metro station" 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Area / locality</label>
                <input 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                  value={form.area} 
                  onChange={(e) => setField("area", e.target.value)} 
                  placeholder="Gachibowli" 
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider">City</label>
                <input 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                  value={form.city} 
                  onChange={(e) => setField("city", e.target.value)} 
                  placeholder="Hyderabad" 
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold border border-red-200 mt-2"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={addAddress} 
              disabled={saving || detecting}
              className="w-full mt-2 py-4 px-6 bg-[var(--color-brand)] text-white rounded-xl text-sm font-black shadow-xl shadow-[var(--color-brand)]/20 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2 focus:outline-none"
            >
              {saving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "Save address"}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {addresses.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-gray-50/50 rounded-3xl border border-gray-100 border-dashed text-center">
                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-3xl mb-4 text-gray-300 border border-gray-100">
                  📍
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-1">No addresses saved</h3>
                <p className="text-sm font-semibold text-gray-500 max-w-sm mx-auto">
                  Add an address so you can quickly book services without entering details every time.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {addresses.map((addr: Address) => (
                  <div key={addr.id} className="group relative bg-white rounded-2xl p-5 border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                        📍
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-black text-gray-900">{addr.label}</h3>
                          {addr.isDefault && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] text-[10px] font-black uppercase tracking-wider">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-500 leading-relaxed max-w-lg">{addr.fullAddress}</p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      className="text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors focus:outline-none sm:opacity-0 sm:group-hover:opacity-100 self-start sm:self-auto" 
                      onClick={() => removeAddress(addr.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
