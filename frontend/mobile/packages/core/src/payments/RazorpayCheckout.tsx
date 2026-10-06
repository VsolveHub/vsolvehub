import { useMemo } from "react";
import { Linking, Modal } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { razorpayCheckoutHtml, shouldOpenPaymentUrlExternally } from "./checkout-html";

export interface RazorpayCheckoutProps {
  publicKey: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  onEnded: (result: "paid" | "dismissed") => void;
}

/** Full-screen Razorpay checkout. The screen must still poll Django for the outcome. */
export function RazorpayCheckout({
  publicKey,
  providerOrderId,
  amountPaise,
  currency,
  onEnded,
}: RazorpayCheckoutProps) {
  const html = useMemo(
    () => razorpayCheckoutHtml({ publicKey, providerOrderId, amountPaise, currency }),
    [amountPaise, currency, providerOrderId, publicKey],
  );

  const onShouldStart = (request: WebViewNavigation) => {
    if (shouldOpenPaymentUrlExternally(request.url)) {
      void Linking.openURL(request.url);
      return false;
    }
    return true;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => onEnded("dismissed")}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        onShouldStartLoadWithRequest={onShouldStart}
        onMessage={(event) => {
          const message = event.nativeEvent.data;
          if (message === "paid" || message === "dismissed") onEnded(message);
        }}
      />
    </Modal>
  );
}
