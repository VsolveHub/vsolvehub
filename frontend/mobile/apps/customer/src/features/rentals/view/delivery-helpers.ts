// Delivery address extraction and validation matching web rental-book-panel.tsx
import type { Address } from "@/features/addresses/queries";

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function extractPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function deliveryAddressFrom(address: Address, phone: string) {
  return {
    line: [address.line1, address.line2].filter(Boolean).join(", "),
    area: address.locality || address.landmark || "",
    city: address.city,
    pincode: address.postal_code,
    contact_phone: extractPhoneDigits(phone),
    ...(address.latitude != null && address.longitude != null
      ? { latitude: String(address.latitude), longitude: String(address.longitude) }
      : {}),
  };
}

export function deliveryProblem(address: Address | null, phone: string): string | null {
  if (address === null) return "Choose where to deliver.";
  if (!PINCODE_REGEX.test((address.postal_code || "").trim())) {
    return "That address has no valid pincode. Edit it, or choose another.";
  }
  if (extractPhoneDigits(phone).length < 10) {
    return "Add a 10-digit phone number for the delivery.";
  }
  return null;
}
