import { describe, expect, it } from "vitest";

import {
  availability,
  availabilityDay,
  eligiblePartner,
  eligiblePartners,
  instantCancellationLadder,
  instantPreCheck,
  quote,
  slot,
} from "../contract-pending/fixtures";
import { toAvailabilityView, toSlotView } from "./availability";
import { AUTO_ASSIGN_ID, toProviderOptions } from "./providers";
import { toPreCheckView } from "./precheck";
import { toQuoteView } from "./quote";

describe("availability adapter", () => {
  it("keeps unavailable slots and labels why", () => {
    // They are rendered disabled rather than omitted, so the customer sees the
    // window exists and is taken instead of a gap they cannot explain.
    const view = toSlotView(
      slot({ is_available: false, unavailable_reason: "FULLY_BOOKED" }),
    );
    expect(view.isAvailable).toBe(false);
    expect(view.unavailableLabel).toBe("Fully booked");
  });

  it("labels an available slot with no reason", () => {
    expect(toSlotView(slot()).unavailableLabel).toBeNull();
  });

  it("formats slot times in the booking timezone, not the device's", () => {
    // 06:30 UTC is 12:00 noon IST. A device in another timezone must still see
    // the time the professional arrives in Hyderabad.
    const view = toSlotView(
      slot({ start_at: "2026-07-30T06:30:00Z", end_at: "2026-07-30T08:00:00Z" }),
    );
    expect(view.label).toBe("12:00 pm – 1:30 pm");
  });

  it("labels today and tomorrow from the server clock", () => {
    const view = toAvailabilityView(
      availability({
        server_now: "2026-07-30T09:00:00Z",
        days: [
          availabilityDay({ date: "2026-07-30" }),
          availabilityDay({ date: "2026-07-31" }),
          availabilityDay({ date: "2026-08-06" }),
        ],
      }),
    );
    // "Today" and "Tomorrow" are our rule and are asserted exactly. The third
    // label is the locale's business — asserting its punctuation would pin the
    // test to an ICU version rather than to any behaviour we own.
    expect(view.days.slice(0, 2).map((day) => day.label)).toEqual(["Today", "Tomorrow"]);
    expect(view.days[2]?.label).toMatch(/Thu.*6.*Aug/);
  });

  it("reports empty when every returned slot is unavailable", () => {
    // `has_availability: true` with nothing bookable still means nothing to book.
    const view = toAvailabilityView(
      availability({
        days: [
          availabilityDay({
            has_availability: true,
            slots: [slot({ is_available: false, unavailable_reason: "FULLY_BOOKED" })],
          }),
        ],
      }),
    );
    expect(view.isEmpty).toBe(true);
  });

  it("is not empty when a bookable slot exists", () => {
    expect(toAvailabilityView(availability()).isEmpty).toBe(false);
  });
});

describe("provider adapter", () => {
  it("puts auto assign first", () => {
    const options = toProviderOptions(eligiblePartners());
    expect(options[0]?.id).toBe(AUTO_ASSIGN_ID);
    expect(options[0]?.isAutoAssign).toBe(true);
  });

  it("omits auto assign when the server says it is unavailable", () => {
    const options = toProviderOptions(eligiblePartners({ auto_assign_available: false }));
    expect(options.some((option) => option.isAutoAssign)).toBe(false);
  });

  it("caps named providers at four", () => {
    const options = toProviderOptions(
      eligiblePartners({
        partners: Array.from({ length: 9 }, (_, index) =>
          eligiblePartner({ id: `partner-${index}` }),
        ),
      }),
    );
    expect(options.filter((option) => !option.isAutoAssign)).toHaveLength(4);
  });

  it("shows no price text when a provider costs the same", () => {
    // "+₹0" reads as a fee that does not exist.
    const options = toProviderOptions(
      eligiblePartners({ partners: [eligiblePartner({ price_difference: null })] }),
    );
    expect(options[1]?.priceDifferenceLabel).toBeNull();
  });

  it("formats a positive price difference with a sign", () => {
    const options = toProviderOptions(
      eligiblePartners({
        partners: [
          eligiblePartner({ price_difference: { amount_paise: 5000, currency: "INR" } }),
        ],
      }),
    );
    expect(options[1]?.priceDifferenceLabel).toBe("+₹50");
  });

  it("omits a rating for a provider with no ratings yet", () => {
    const options = toProviderOptions(
      eligiblePartners({ partners: [eligiblePartner({ rating_count: 0 })] }),
    );
    expect(options[1]?.ratingLabel).toBeNull();
  });
});

describe("quote adapter", () => {
  it("formats the server total rather than summing the lines", () => {
    const view = toQuoteView(quote());
    expect(view.totalLabel).toBe("₹481.44");
    expect(view.totalPaise).toBe(48144);
  });

  it("carries the tax label from the server", () => {
    // The frontend must not assert a GST rate.
    expect(toQuoteView(quote()).taxLabel).toBe("GST 18%");
  });

  it("renders whichever ladder arrives without knowing which", () => {
    const scheduled = toQuoteView(quote());
    const instant = toQuoteView(
      quote({ fulfilment_type: "INSTANT", cancellation_ladder: instantCancellationLadder() }),
    );
    expect(scheduled.cancellationBands).toHaveLength(3);
    expect(instant.cancellationBands).toHaveLength(5);
    expect(instant.cancellationPolicyVersion).toBe("instant-v1");
  });

  it("marks full-refund bands", () => {
    const bands = toQuoteView(quote()).cancellationBands;
    expect(bands[0]?.isFullRefund).toBe(true);
    expect(bands[2]?.isFullRefund).toBe(false);
  });
});

describe("pre-check adapter", () => {
  it("passes through the arrival estimate as text", () => {
    const view = toPreCheckView(instantPreCheck());
    expect(view.canDispatch).toBe(true);
    expect(view.arrivalText).toBe("Usually 25–40 minutes");
  });

  it("says the customer has not been charged on a refusal", () => {
    // Safe only pre-payment. Doc 11 §4 forbids it on NO_PARTNER_CONFIRMED.
    const view = toPreCheckView(
      instantPreCheck({ can_dispatch: false, reason_code: "ELIGIBLE_POOL_EXHAUSTED" }),
    );
    expect(view.reassurance).toBe("You have not been charged.");
  });

  it("distinguishes an out-of-hours refusal from an empty pool", () => {
    // Doc 11 §2.2: a 2 AM request in an area closing at 10 PM is refused with
    // the operating-window message, not by an empty search.
    const closed = toPreCheckView(
      instantPreCheck({
        can_dispatch: false,
        reason_code: "OUTSIDE_OPERATING_WINDOW",
        message: "Instant service in your area runs 8:00 am to 10:00 pm. Book a slot instead.",
      }),
    );
    const empty = toPreCheckView(
      instantPreCheck({ can_dispatch: false, reason_code: "ELIGIBLE_POOL_EXHAUSTED" }),
    );

    expect(closed.headline).not.toBe(empty.headline);
    expect(closed.detail).toContain("8:00 am to 10:00 pm");
  });

  it("sends an unserviceable address to fix the address, not to reschedule", () => {
    const view = toPreCheckView(
      instantPreCheck({ can_dispatch: false, reason_code: "AREA_NOT_SERVICEABLE" }),
    );
    expect(view.primaryAction).toBe("change_address");
  });

  it("still offers a way forward when the server sends no reason code", () => {
    const view = toPreCheckView(instantPreCheck({ can_dispatch: false, reason_code: null }));
    expect(view.primaryAction).toBe("switch_to_scheduled");
    expect(view.headline).toBeTruthy();
  });
});
