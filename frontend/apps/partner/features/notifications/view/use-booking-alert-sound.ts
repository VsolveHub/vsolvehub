"use client";

import { useEffect } from "react";

import { useT } from "@vsolve/ui";

import { requestBookingAlertLoop, stopBookingAlertLoop } from "./booking-alert-audio";

/** Starts the booking alert loop while the popup is open; stops on dismiss. */
export function useBookingAlertSound(active: boolean): void {
  const t = useT();

  useEffect(() => {
    if (!active) {
      stopBookingAlertLoop();
      return;
    }

    requestBookingAlertLoop({
      title: t("notifications.offerPopup.title"),
      body: t("notifications.liveBooking.timer.running"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
