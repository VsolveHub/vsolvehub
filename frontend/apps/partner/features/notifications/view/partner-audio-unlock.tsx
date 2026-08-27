"use client";

import { useEffect } from "react";

import {
  preloadBookingAlertAudio,
  prepareBookingAlertsFromGesture,
  stopBookingAlertLoop,
  isBookingAlertRequested,
} from "./booking-alert-audio";

function isBookingAlertAction(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-booking-alert-action]") !== null;
}

/**
 * Unlocks alert audio on the Partner's first normal interaction (login, nav, tap).
 * After unlock, booking popups play sound automatically with no extra tap.
 */
export function PartnerAudioUnlock() {
  useEffect(() => {
    preloadBookingAlertAudio();

    const unlock = (event: Event) => {
      if (isBookingAlertAction(event.target)) {
        if (isBookingAlertRequested()) {
          stopBookingAlertLoop();
        }
        return;
      }
      prepareBookingAlertsFromGesture();
    };

    // Capture phase so unlock runs before action handlers stop the loop.
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("touchstart", unlock, { capture: true, passive: true });
    window.addEventListener("keydown", unlock, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("touchstart", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  return null;
}
