import type { HomeProps } from "./homeShared";
import { OfflineScreen } from "./OfflineScreen";
import { SearchingScreen } from "./SearchingScreen";
import { OfferScreen } from "./OfferScreen";
import { EnrouteScreen } from "./EnrouteScreen";
import { OtpScreen } from "./OtpScreen";
import { WorkingScreen } from "./WorkingScreen";
import { CompleteScreen } from "./CompleteScreen";

/* ------------------------------------------------------------------ *
 * HOME tab — drives the full job lifecycle.
 * ------------------------------------------------------------------ */
export function HomeTab(p: HomeProps) {
  switch (p.stage) {
    case "offline":
      return <OfflineScreen {...p} />;
    case "searching":
      return <SearchingScreen {...p} />;
    case "offer":
      return <OfferScreen {...p} />;
    case "enroute":
      return <EnrouteScreen {...p} />;
    case "arrived":
      return <OtpScreen {...p} />;
    case "working":
      return <WorkingScreen {...p} />;
    case "complete":
      return <CompleteScreen {...p} />;
  }
}

export type { HomeProps };
