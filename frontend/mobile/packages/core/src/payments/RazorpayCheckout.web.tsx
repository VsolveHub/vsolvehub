import { useEffect } from "react";

import type { RazorpayCheckoutProps } from "./RazorpayCheckout";

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayWindow extends Window {
  Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
}

/** Browser preview loads the same checkout script the customer website uses. */
export function RazorpayCheckout({
  publicKey,
  providerOrderId,
  amountPaise,
  currency,
  onEnded,
}: RazorpayCheckoutProps) {
  useEffect(() => {
    let cancelled = false;
    const open = () => {
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay || cancelled) return;
      const checkout = new Razorpay({
        key: publicKey,
        order_id: providerOrderId,
        amount: amountPaise,
        currency,
        name: "V Solve Hub",
        handler: () => onEnded("paid"),
        modal: { ondismiss: () => onEnded("dismissed") },
      });
      checkout.open();
    };
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    if (existing) {
      open();
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.onload = open;
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [amountPaise, currency, onEnded, providerOrderId, publicKey]);

  return null;
}
