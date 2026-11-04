// Ported from frontend/apps/partner/features/support/contact.ts
import { Linking } from "react-native";

/**
 * The one Partner support line and mailbox, aligned across web and mobile.
 */
export const PARTNER_SUPPORT_PHONE = "+918790564634";
export const PARTNER_SUPPORT_PHONE_DISPLAY = "+91 879 056 4634";
export const PARTNER_SUPPORT_HOURS = "9am–9pm, every day";
export const PARTNER_SUPPORT_HOURS_KEY = "workspaces.support.hours";
export const PARTNER_SUPPORT_EMAIL = "support@vsolvehub.com";

export function openSupportWhatsApp(
  message = "Hi VsolveHub Partner Support, I need help with my application.",
) {
  const phone = PARTNER_SUPPORT_PHONE.replace(/^\+/, "");
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  void Linking.openURL(url);
}

export function openSupportCall() {
  void Linking.openURL(`tel:${PARTNER_SUPPORT_PHONE}`);
}

export function openSupportEmail(
  subject = "Partner Application Support",
  body = "",
) {
  const url = `mailto:${PARTNER_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  void Linking.openURL(url);
}
