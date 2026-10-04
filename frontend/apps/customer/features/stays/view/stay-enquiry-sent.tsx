"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import type { StayEnquiry } from "../model";
import { OwnerContact } from "./owner-contact";
import { StayPaymentNote } from "./stay-payment-note";

/** What the guest sees the moment their enquiry is sent: who the owner is, and their number. */
export function StayEnquirySent({
  enquiry,
  onViewProperty,
}: {
  enquiry: StayEnquiry;
  onViewProperty?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" role="status">
      <div className="flex items-start gap-3 rounded-control border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="text-sm font-bold text-emerald-900">Enquiry sent</p>
          <p className="mt-0.5 text-xs leading-relaxed text-emerald-900/90">
            Your details have been sent to the owner. They will contact you shortly.
          </p>
        </div>
      </div>
      <OwnerContact
        hostName={enquiry.host_name}
        hostPhone={enquiry.host_phone}
        propertySlug={enquiry.property_slug}
        onViewProperty={onViewProperty}
      />
      <StayPaymentNote compact />
      <Link href="/stays/mine" className="text-center text-xs font-bold text-text-link hover:underline">
        See all my enquiries and visits
      </Link>
    </div>
  );
}
