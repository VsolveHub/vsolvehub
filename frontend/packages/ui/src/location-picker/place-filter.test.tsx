import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_PLACE, PlaceFilter } from "./place-filter";

/**
 * Without a key there are no suggestions, but the box still types and Near me still works:
 * the phone's location needs no Google key.
 */

function stubGeolocation(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn(impl) },
  });
}

afterEach(() => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
});

describe("PlaceFilter without a key", () => {
  it("reports typing as text that waits for the page's search", () => {
    const onChange = vi.fn();
    render(<PlaceFilter apiKey="" value={EMPTY_PLACE} onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Gachibowli" } });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_PLACE, name: "Gachibowli" }, false);
  });

  it("Near me searches from the phone's location at once", async () => {
    stubGeolocation((ok) =>
      ok({ coords: { latitude: 17.4948, longitude: 78.3996 } } as GeolocationPosition),
    );
    const onChange = vi.fn();
    render(<PlaceFilter apiKey="" value={EMPTY_PLACE} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        { name: "Near me", latitude: 17.4948, longitude: 78.3996, source: "device" },
        true,
      ),
    );
  });

  it("explains a refused location permission", async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1 } as GeolocationPositionError));
    const onChange = vi.fn();
    render(<PlaceFilter apiKey="" value={EMPTY_PLACE} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /near me/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/location permission is off/i);
    expect(onChange).not.toHaveBeenCalled();
  });
});
