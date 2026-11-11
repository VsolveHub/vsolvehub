import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useCaptainStatus, useCurrentOffer } from "./queries";

/**
 * While the captain is on duty and a Rides screen is open, open each new ride request full
 * screen. Each request is opened once; the request screen itself follows it to the end.
 *
 * A request is known by its id and when it was sent: the server reuses the same offer when a
 * ride comes back to this captain (another captain cancelled), and that must ring again.
 */
export function useOfferWatch(): void {
  const router = useRouter();
  const onDuty = useCaptainStatus().data?.on_duty === true;
  const offer = useCurrentOffer(onDuty).data?.offer ?? null;
  const offerId = offer?.id ?? null;
  const sent = offer ? `${offer.id}@${offer.offered_at}` : null;
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (sent === null || offerId === null || opened.current === sent) return;
    opened.current = sent;
    router.push(`/rides/offer/${offerId}`);
  }, [sent, offerId, router]);
}
