"use client";

import { useEffect } from "react";

import { requestBookingAlertLoop, stopBookingAlertLoop } from "./booking-alert-audio";

/** Starts the booking alert loop while the popup is open; stops on dismiss. */
export function useBookingAlertSound(active: boolean): void {
  useEffect(() => {
    if (!active) {
      stopBookingAlertLoop();
      return;
    }

    requestBookingAlertLoop();
  }, [active]);
}
