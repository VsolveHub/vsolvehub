/** Normalize Indian mobile numbers to 10 digits (strips +91, leading 0, spaces). */
export function normalizePhone(input: unknown): string {
  if (input == null) return "";
  const digits = String(input).replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("91")) {
    return digits.slice(-10);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

export function phoneValidationMessage(phone: string): string | null {
  if (phone.length !== 10) return "Enter a valid 10-digit phone number";
  if (!isValidIndianPhone(phone)) return "Enter a valid Indian mobile number";
  return null;
}
