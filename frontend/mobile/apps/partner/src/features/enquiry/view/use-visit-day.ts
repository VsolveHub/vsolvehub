// Ported from frontend/apps/partner/features/visit/view/use-visit-day.ts
import { serverClock } from "@vsolve/api-client";
import { describeError, useServerCountdown, type Countdown } from "@vsolve/query/native";
import { useState } from "react";

import { planVisitOf, type EnquiryRecord } from "@/features/enquiry/model/wire";
import { describeVisitTiming, type VisitTiming } from "@/features/visit/model/visit-clock";
import {
  describeVisitStatus,
  visitPermissionsFor,
  type SiteVisit,
  type VisitPermissions,
  type VisitStatusCopy,
} from "@/features/visit/model/visit-state";
import {
  useCompleteVisit,
  useConfirmVisitArrivalWithCode,
  useReportCustomerNoShow,
} from "@/features/visit/queries";

export interface VisitDayControls {
  readonly visit: SiteVisit;
  readonly status: VisitStatusCopy;
  readonly permissions: VisitPermissions;
  readonly timing: VisitTiming | null;
  readonly estimateCountdown: Countdown | null;
  readonly askingForCode: boolean;
  readonly setAskingForCode: (asking: boolean) => void;
  readonly canStartArrival: boolean;
  readonly overrideArrivalGate: (() => void) | null;
  readonly arrival: ReturnType<typeof useConfirmVisitArrivalWithCode>;
  readonly complete: ReturnType<typeof useCompleteVisit>;
  readonly noShow: ReturnType<typeof useReportCustomerNoShow>;
  readonly pending: boolean;
  readonly failure: ReturnType<typeof describeError> | null;
  readonly resetFailure: () => void;
}

const ARRIVAL_GATE_IS_OVERRIDABLE = process.env.NODE_ENV !== "production";

export function useVisitDay(enquiry: EnquiryRecord): VisitDayControls | null {
  const [askingForCode, setAskingForCode] = useState(false);
  const [gateOverridden, setGateOverridden] = useState(false);
  const visit = planVisitOf(enquiry.siteVisits);
  const arrival = useConfirmVisitArrivalWithCode(enquiry.id);
  const complete = useCompleteVisit(enquiry.id);
  const noShow = useReportCustomerNoShow(enquiry.id);
  const estimateCountdown = useServerCountdown(visit?.estimate_due_at ?? null, 60_000);

  if (visit === null) return null;

  const permissions = visitPermissionsFor(visit);
  const timing = describeVisitTiming(visit, serverClock.now());
  const error = complete.error ?? noShow.error;
  const dayHasCome = timing?.arrivalWindowOpen ?? false;

  return {
    visit,
    status: describeVisitStatus(visit.status),
    permissions,
    timing,
    estimateCountdown,
    askingForCode,
    setAskingForCode,
    canStartArrival: permissions.canConfirmArrival && (dayHasCome || gateOverridden),
    overrideArrivalGate:
      ARRIVAL_GATE_IS_OVERRIDABLE && permissions.canConfirmArrival && !dayHasCome && !gateOverridden
        ? () => setGateOverridden(true)
        : null,
    arrival,
    complete,
    noShow,
    pending: arrival.isPending || complete.isPending || noShow.isPending,
    failure: error ? describeError(error, "mutation") : null,
    resetFailure: () => {
      arrival.reset();
      complete.reset();
      noShow.reset();
    },
  };
}
