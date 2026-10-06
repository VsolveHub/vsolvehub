// Ported from frontend/apps/customer/features/payment/model/provider-handoff.ts
import type { PaymentAttempt } from "./outcome";

/**
 * Handing the customer to the payment provider, and the line this module will
 * not cross.
 *
 * ## The widget reports; it does not decide
 *
 * Razorpay Checkout calls `handler` on what it believes was a success and
 * `ondismiss` when the customer closes it. Neither is an outcome. The money moves
 * when Razorpay says so to Django, over a signed webhook, and Django reduces that
 * monotonically. So both callbacks here do exactly one thing — tell the screen to
 * re-read the attempt — and neither carries a status, an amount or a payment id
 * into application state.
 *
 * This is why `openProviderCheckout` resolves to a bare `"closed"` rather than
 * anything resembling a result. There is no shape it could return that a caller
 * would be entitled to believe.
 *
 * ## Why the script is loaded here and not in a layout
 *
 * `checkout.js` is a third-party script on the money path. Loading it on every
 * page would put it on the catalog, the cart and the marketing pages, where it
 * has no business running. It is fetched once, on demand, by the one screen that
 * hands over — and never at all in an environment with no interactive provider.
 */

/** Providers this client can actually open a widget for. */
const INTERACTIVE_PROVIDERS = ["razorpay"] as const;

export type InteractiveProvider = (typeof INTERACTIVE_PROVIDERS)[number];

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Whether this attempt's provider has a widget this client knows how to open.
 *
 * `fake` is the deliberate `false`. The fake provider exists so backend tests and
 * local development can exercise capture without a Razorpay account; it has no
 * customer-facing surface, and inventing a "Simulate payment" button for it would
 * put a control that fabricates a financial outcome into the production bundle.
 */
export function isInteractiveProvider(provider: string): provider is InteractiveProvider {
  return (INTERACTIVE_PROVIDERS as readonly string[]).includes(provider);
}

/** Everything the widget needs, or `null` when the attempt cannot be handed off. */
export interface HandoffTarget {
  provider: InteractiveProvider;
  publicKey: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}

export function handoffTarget(attempt: PaymentAttempt): HandoffTarget | null {
  if (!isInteractiveProvider(attempt.provider)) return null;
  if (attempt.provider_public_key === null || attempt.provider_order_id === "") return null;

  return {
    provider: attempt.provider,
    publicKey: attempt.provider_public_key,
    providerOrderId: attempt.provider_order_id,
    // Passed to the widget for display only. Razorpay charges what its own order
    // says, so this cannot cause a mismatched charge — and it is Django's number
    // either way, never one this client worked out.
    amountPaise: attempt.amount.amount_paise,
    currency: attempt.amount.currency,
  };
}

/** Resolves once, when the widget is no longer on screen. Never a result. */
export type HandoffEnded = "closed";

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  handler: () => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<void> | null = null;

/**
 * Loads the provider script once per page.
 *
 * The promise is cached rather than the boolean: two components mounting in the
 * same tick would otherwise both see "not loaded" and append two script tags.
 * A failure clears the cache so a retry can genuinely retry.
 */
function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The payment provider can only be opened in a browser."));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("The payment provider could not be reached."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Opens the provider's checkout and resolves when it closes.
 *
 * Both the success handler and the dismiss handler resolve identically. That is
 * the whole design: the caller's only correct response to either is to re-read
 * the attempt from Django, and giving it two paths would invite it to trust one.
 */
export async function openProviderCheckout(
  target: HandoffTarget,
  options: { businessName: string },
): Promise<HandoffEnded> {
  await loadRazorpayScript();

  const Razorpay = window.Razorpay;
  if (!Razorpay) {
    throw new Error("The payment provider did not load correctly.");
  }

  return new Promise<HandoffEnded>((resolve) => {
    let settled = false;
    const end = () => {
      // The widget can fire both handler and ondismiss for one session. Resolving
      // twice is harmless to the promise but would run the caller's re-read twice.
      if (settled) return;
      settled = true;
      resolve("closed");
    };

    new Razorpay({
      key: target.publicKey,
      order_id: target.providerOrderId,
      amount: target.amountPaise,
      currency: target.currency,
      name: options.businessName,
      handler: end,
      modal: { ondismiss: end },
    }).open();
  });
}
