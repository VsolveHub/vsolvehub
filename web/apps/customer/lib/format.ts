export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPriceLabel(paise: number, unit?: string): string {
  if (unit === "job" || paise === 0) return "Free to browse";
  const price = formatPrice(paise);
  if (unit === "day") return `${price}/day`;
  if (unit === "night") return `${price}/night`;
  if (unit === "hour") return `${price}/hr`;
  return price;
}

/** @deprecated Use formatPrice — price is stored in paise */
export function formatMoney(paise: number): string {
  return formatPrice(paise);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

export function generateBookingRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VSH-${ts}-${rand}`;
}
