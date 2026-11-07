const EXTERNAL_SCHEMES = ["upi:", "intent:", "tez:", "phonepe:", "paytmmp:", "credpay:"];

/** UPI apps must leave the WebView. Everything else stays inside checkout. */
export function shouldOpenPaymentUrlExternally(url: string): boolean {
  return EXTERNAL_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function razorpayCheckoutHtml(input: {
  publicKey: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}): string {
  const options = JSON.stringify({
    key: input.publicKey,
    order_id: input.providerOrderId,
    amount: input.amountPaise,
    currency: input.currency,
    name: "V Solve Hub",
  });
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
    var checkout = new Razorpay(Object.assign(${options}, {
      handler: function () { window.ReactNativeWebView.postMessage("paid"); },
      modal: { ondismiss: function () { window.ReactNativeWebView.postMessage("dismissed"); } }
    }));
    checkout.open();
  </script></body></html>`;
}
