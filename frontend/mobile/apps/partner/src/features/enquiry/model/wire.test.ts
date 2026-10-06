// Ported from frontend/apps/partner/features/enquiry/model/wire.test.ts

import { enquiryDetail, enquirySummary } from "../fixtures";
import { readEnquiryRecord, readEnquiryRow } from "./wire";

/**
 * The nullability seam.
 *
 * Contract 1.21.0 declares `requested_start`, `service_by` and `responds_by` as
 * required non-null strings. All three are `null=True` where they are stored,
 * and none of the three nulls is an edge case:
 *
 * - a requirement with no hard needed-by date is ordinary;
 * - `matching._invitation_deadline` returns nothing for any service area with
 *   no operating windows, or any variant configuration with no SLA hours.
 *
 * Reading them as declared and formatting them straight prints `Invalid Date`
 * into a live enquiry. These tests pin the compensation to one file so that when
 * the contract is corrected the change is one diff, not a hunt.
 *
 * The casts below are the point: TypeScript says these values cannot be null,
 * and the migrations say they can.
 */

function withNulls<T>(base: T, nulls: Record<string, null>): T {
  return { ...base, ...nulls } as T;
}

describe("what the contract says cannot be null", () => {
  it("reads a missing response deadline as no deadline", () => {
    const row = readEnquiryRow(
      withNulls(enquirySummary(), { responds_by: null }),
    );
    expect(row.respondsBy).toBeNull();
  });

  it("reads a missing start date and needed-by date as absent", () => {
    const row = readEnquiryRow(
      withNulls(enquirySummary(), { requested_start: null, service_by: null }),
    );
    expect(row.requestedStart).toBeNull();
    expect(row.serviceBy).toBeNull();
  });

  it("treats an empty string the same as a null", () => {
    // A blank instant is not a date either, and formatting one produces the
    // same Invalid Date.
    const row = readEnquiryRow({ ...enquirySummary(), responds_by: "" });
    expect(row.respondsBy).toBeNull();
  });

  it("passes a real instant through untouched", () => {
    const row = readEnquiryRow(enquirySummary({ responds_by: "2026-08-14T09:00:00Z" }));
    expect(row.respondsBy).toBe("2026-08-14T09:00:00Z");
  });
});

describe("the detail record", () => {
  it("carries the summary fields plus the snapshot", () => {
    const record = readEnquiryRecord(enquiryDetail());
    expect(record.id).toBe(enquiryDetail().id);
    expect(record.answers).toMatchObject({ worker_count: 6 });
    expect(record.budgetMaxPaise).toBe(4_000_000);
  });

  it("narrows the answers blob rather than trusting it", () => {
    const record = readEnquiryRecord(enquiryDetail({ answers: "not an object" }));
    expect(record.answers).toEqual({});
  });

  it("keeps the archetype as the server sent it", () => {
    // The one field that decides which composer opens. It must never be
    // normalised, lowercased or mapped through a client table.
    const record = readEnquiryRecord(enquiryDetail({ archetype: "A5_CUSTOM_PROJECT" }));
    expect(record.archetype).toBe("A5_CUSTOM_PROJECT");
  });

  it("keeps the explicit material owner instead of inferring it from the service", () => {
    const record = readEnquiryRecord(
      enquiryDetail({ material_fulfilment_mode: "PARTNER_TURNKEY" }),
    );

    expect(record.materialFulfilmentMode).toBe("PARTNER_TURNKEY");
  });
});
