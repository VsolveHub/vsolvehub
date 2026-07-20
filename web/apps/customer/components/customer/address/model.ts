export type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
  area?: string | null;
  city?: string | null;
};

export type AddrForm = {
  label: string;
  houseNumber: string;
  landmark: string;
  area: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
};

export const EMPTY_FORM: AddrForm = {
  label: "Home",
  houseNumber: "",
  landmark: "",
  area: "",
  city: "",
  pincode: "",
};

/** Returns an error message when the form isn't ready to save, otherwise null. */
export function validateAddressForm(form: AddrForm): string | null {
  if (!form.label.trim()) return "Label is required";
  const hasArea = form.area.trim() && form.city.trim();
  const hasCoords = form.lat != null && form.lng != null;
  if (!hasArea && !hasCoords) return "Enter at least an area and city, or use your current location.";
  if (form.pincode && !/^\d{6}$/.test(form.pincode)) return "Enter a valid 6-digit pincode";
  return null;
}

export type AddressPayload = {
  label: string;
  houseNumber?: string;
  landmark?: string;
  area?: string;
  city?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
};

/** Trim the form into an API payload, dropping blank optional fields. */
export function buildAddressPayload(form: AddrForm): AddressPayload {
  const opt = (v: string) => v.trim() || undefined;
  return {
    label: form.label.trim(),
    houseNumber: opt(form.houseNumber),
    landmark: opt(form.landmark),
    area: opt(form.area),
    city: opt(form.city),
    pincode: opt(form.pincode),
    lat: form.lat,
    lng: form.lng,
  };
}

export function buildGuestFullAddress(payload: {
  houseNumber?: string;
  landmark?: string;
  area?: string;
  city?: string;
  pincode?: string;
}): string {
  return [
    payload.houseNumber,
    payload.landmark,
    payload.area,
    [payload.city, payload.pincode].filter(Boolean).join(" — "),
  ]
    .filter(Boolean)
    .join(", ");
}
