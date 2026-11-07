import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { handoffTarget, waitForPaymentHandoff, type HandoffTarget, type PaymentAttemptDetail } from "./handoff";
import { RazorpayCheckout } from "./RazorpayCheckout";

export type CheckoutEnded = "paid" | "dismissed";

type OpenCheckout = (target: HandoffTarget) => Promise<CheckoutEnded>;

const CheckoutContext = createContext<OpenCheckout | null>(null);

interface Pending {
  target: HandoffTarget;
  resolve: (ended: CheckoutEnded) => void;
}

/**
 * Mounted once at the app root. Any screen can open Razorpay with `useCompleteOrOpenCheckout`
 * (or `useProviderCheckout`) and await it, the way the website awaits `openProviderCheckout`,
 * instead of every screen placing its own checkout modal.
 */
export function ProviderCheckoutHost({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const settledRef = useRef(false);

  const open = useCallback<OpenCheckout>(
    (target) =>
      new Promise<CheckoutEnded>((resolve) => {
        settledRef.current = false;
        setPending({ target, resolve });
      }),
    [],
  );

  return (
    <CheckoutContext.Provider value={open}>
      {children}
      {pending ? (
        <RazorpayCheckout
          publicKey={pending.target.publicKey}
          providerOrderId={pending.target.providerOrderId}
          amountPaise={pending.target.amountPaise}
          currency={pending.target.currency}
          onEnded={(ended) => {
            // The widget can report both "paid" and "dismissed" for one session.
            if (settledRef.current) return;
            settledRef.current = true;
            pending.resolve(ended);
            setPending(null);
          }}
        />
      ) : null}
    </CheckoutContext.Provider>
  );
}

/** Open Razorpay for a ready target. Resolves when the screen closes, paid or not. */
export function useProviderCheckout(): OpenCheckout {
  const open = useContext(CheckoutContext);
  if (open === null) throw new Error("ProviderCheckoutHost is not mounted at the app root.");
  return open;
}

export type CheckoutOutcome =
  | { mode: "checkout"; ended: CheckoutEnded; attempt: PaymentAttemptDetail }
  | { mode: "pending"; attempt: PaymentAttemptDetail };

/**
 * The web's `completeOrOpenCheckout`: wait until the charge can be paid, then open Razorpay.
 * `pending` means it was not ready in time (or already finished); the caller says so. Capture
 * is confirmed only by Razorpay's webhook, so a closed checkout is never "paid" by itself: the
 * caller re-reads the server.
 */
export function useCompleteOrOpenCheckout(): (
  attemptId: string,
  options?: { onAwaitingCapture?: () => void },
) => Promise<CheckoutOutcome> {
  const open = useProviderCheckout();
  return useCallback(
    async (attemptId, options) => {
      const attempt = await waitForPaymentHandoff(attemptId);
      const target = handoffTarget(attempt);
      if (target === null) return { mode: "pending", attempt };
      options?.onAwaitingCapture?.();
      const ended = await open(target);
      return { mode: "checkout", ended, attempt };
    },
    [open],
  );
}
