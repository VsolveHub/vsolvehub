import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useCaptainStatus, useCurrentOffer } from "./queries";

/**
 * While the captain is on duty and a Rides screen is open, open each new ride request full
 * screen. Each request is opened once; the request screen itself follows it to the end.
 */
export function useOfferWatch(): void {
  const router = useRouter();
  const onDuty = useCaptainStatus().data?.on_duty === true;
  const offerId = useCurrentOffer(onDuty).data?.offer?.id ?? null;
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (offerId === null || opened.current === offerId) return;
    opened.current = offerId;
    router.push(`/rides/offer/${offerId}`);
  }, [offerId, router]);
}
