import {
  availability,
  availabilityDay,
  instantCancellationLadder,
  quote,
  slot,
} from "../contract-pending/fixtures";
import { toAvailabilityView, type AvailabilityView } from "./availability";
import { toQuoteView, type QuoteView } from "./quote";

/**
 * View-model fixtures for component tests.
 *
 * Component tests need realistic data, but importing the pending fixtures
 * directly would put them on the wrong side of the quarantine boundary — and
 * then Codex publishing the real contract would force every component test to
 * change, which is exactly what the boundary exists to prevent.
 *
 * So the fixtures are converted here, inside the adapter layer, where knowing
 * the pending shapes is the job. On integration this file is rewritten with
 * everything else in `../adapters/`, and the component tests are untouched.
 */

export function availabilityViewFixture(): AvailabilityView {
  return toAvailabilityView(availability());
}

/** A window where every returned slot is unavailable. */
export function fullyBookedAvailabilityFixture(): AvailabilityView {
  return toAvailabilityView(
    availability({
      days: [
        availabilityDay({
          slots: [slot({ is_available: false, unavailable_reason: "FULLY_BOOKED" })],
        }),
      ],
    }),
  );
}

export function quoteViewFixture(): QuoteView {
  return toQuoteView(quote());
}

/** The five-band Instant ladder, for asserting the ladder is not hardcoded. */
export function instantQuoteViewFixture(): QuoteView {
  return toQuoteView(
    quote({ fulfilment_type: "INSTANT", cancellation_ladder: instantCancellationLadder() }),
  );
}
