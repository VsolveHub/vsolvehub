import type { useT } from "@vsolve/ui";

/**
 * Provider checkout handoff — partner edition.
 *
 * Mirrors `frontend/apps/customer/features/payment/model/provider-handoff.ts`.
 * Both files must stay in sync; if you change the Razorpay integration in one,
 * update the other.
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
 * customer-facing surface.
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

export interface PaymentAttemptHandoff {
  id: string;
  provider: string;
  provider_public_key: string | null;
  provider_order_id: string;
  amount_paise?: number;
  /** Set to true when the backend is running in fake-provider mode. */
  simulated_capture_available?: boolean;
}

export function handoffTarget(attempt: PaymentAttemptHandoff): HandoffTarget | null {
  if (!isInteractiveProvider(attempt.provider)) return null;
  if (
    !attempt.provider_public_key ||
    !attempt.provider_order_id ||
    attempt.provider_order_id.trim() === ""
  ) {
    return null;
  }

  return {
    provider: attempt.provider,
    publicKey: attempt.provider_public_key,
    providerOrderId: attempt.provider_order_id,
    amountPaise: attempt.amount_paise ?? 0,
    currency: "INR",
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

/**
 * The guard errors below stay plain English (this module has no `t`). A
 * component that shows one of them resolves it with `translateProviderError`.
 */
const PROVIDER_ERROR_KEYS: Record<string, string> = {
  "The payment provider can only be opened in a browser.": "workspaces.payment.browserOnly",
  "The payment provider could not be reached.": "workspaces.payment.unreachable",
  "Payment order ID or public key is missing.": "workspaces.payment.missingOrder",
  "The payment provider did not load correctly.": "workspaces.payment.didNotLoad",
};

/** Translates one of this module's guard messages; any other text is returned unchanged. */
export function translateProviderError(t: ReturnType<typeof useT>, message: string): string {
  const key = PROVIDER_ERROR_KEYS[message];
  return key ? t(key) : message;
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
  if (!target.providerOrderId || !target.publicKey) {
    throw new Error("Payment order ID or public key is missing.");
  }

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
