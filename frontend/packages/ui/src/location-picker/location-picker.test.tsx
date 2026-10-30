import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocationPicker, type PickedLocation } from "./location-picker";

/**
 * The map picker.
 *
 * The properties that matter, and the ways each would quietly break:
 *
 *  - **The default view is not an answer.** Geocoding the city view on load
 *    would invent an address in the middle of Hyderabad.
 *  - **Address text comes from the server** for the coordinate the pin settled
 *    on, however the pin got there — a search result asks Google for `location`
 *    only.
 *  - **The latest settle wins.** A slow answer for where the pin *was* must not
 *    overwrite the answer for where it is.
 *  - **A failed lookup still keeps the pin**, so the user can type the text.
 *  - **Device failures are told apart**, because the remedies differ.
 *
 * `@vis.gl/react-google-maps` is replaced with a stand-in that exposes the map's
 * event props, so a test can drag the map by calling `onDragstart` / `onIdle`.
 */

interface MapEventProps {
  onDragstart?: () => void;
  onIdle?: (event: { map: typeof fakeMap }) => void;
}

let center = { lat: 17.385, lng: 78.4867 };
let mapProps: MapEventProps = {};

const fakeMap = {
  getCenter: () => ({ lat: () => center.lat, lng: () => center.lng }),
  getZoom: () => 11,
  setZoom: vi.fn(),
  panTo: vi.fn((point: { lat: number; lng: number }) => {
    center = point;
  }),
};

const fetchFields = vi.fn(() => Promise.resolve());
const fetchAutocompleteSuggestions = vi.fn(() =>
  Promise.resolve({
    suggestions: [
      {
        placePrediction: {
          placeId: "place-1",
          mainText: { text: "Kondapur" },
          secondaryText: { text: "Hyderabad, Telangana" },
          text: { text: "Kondapur, Hyderabad, Telangana" },
          toPlace: () => ({
            fetchFields,
            location: { lat: () => 17.4651, lng: () => 78.3633 },
          }),
        },
      },
    ],
  }),
);

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  APILoadingStatus: { LOADED: "LOADED", FAILED: "FAILED", AUTH_FAILURE: "AUTH_FAILURE" },
  useApiLoadingStatus: () => "LOADED",
  useMap: () => fakeMap,
  useMapsLibrary: () => ({
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
  }),
  Map: (props: MapEventProps) => {
    mapProps = props;
    return <div data-testid="map" />;
  },
}));

function located(overrides: Partial<PickedLocation> = {}): PickedLocation {
  return {
    formatted_address: "Flat 402, Lotus Residency, Kondapur, Hyderabad 500084",
    line1: "Flat 402, Lotus Residency",
    locality: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    postal_code: "500084",
    country_code: "IN",
    latitude: "17.456789",
    longitude: "78.364512",
    provider: "test",
    ...overrides,
  };
}

type Geocode = (point: { latitude: string; longitude: string }) => Promise<PickedLocation>;

function renderPicker(
  props: { reverseGeocode?: Geocode; onConfirm?: (l: PickedLocation) => void } & Partial<
    Parameters<typeof LocationPicker>[0]
  > = {},
) {
  const reverseGeocode = vi.fn<Geocode>(props.reverseGeocode ?? (() => Promise.resolve(located())));
  const onConfirm = vi.fn(props.onConfirm ?? (() => undefined));
  render(
    <LocationPicker
      apiKey="test-browser-key"
      {...props}
      reverseGeocode={reverseGeocode}
      onConfirm={onConfirm}
    />,
  );
  return { reverseGeocode, onConfirm };
}

/** Drags the map so its centre — the pin's tip — lands on `point`. */
function dragTo(point: { lat: number; lng: number }) {
  act(() => {
    mapProps.onDragstart?.();
    center = point;
    mapProps.onIdle?.({ map: fakeMap });
  });
}

function stubGeolocation(
  answer:
    | { coords: { latitude: number; longitude: number } }
    | { code: number }
    | "unsupported",
) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value:
      answer === "unsupported"
        ? undefined
        : {
            getCurrentPosition: (success: PositionCallback, failure?: PositionErrorCallback) =>
              "coords" in answer
                ? success({ coords: answer.coords, timestamp: Date.now() } as GeolocationPosition)
                : failure?.({ code: answer.code, message: "" } as GeolocationPositionError),
          },
  });
}

beforeEach(() => {
  center = { lat: 17.385, lng: 78.4867 };
  mapProps = {};
  fakeMap.panTo.mockClear();
  fetchFields.mockClear();
  fetchAutocompleteSuggestions.mockClear();
});

afterEach(() => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
});

describe("placing the pin", () => {
  it("does not treat the opening city view as an answer", () => {
    const { reverseGeocode } = renderPicker();

    act(() => mapProps.onIdle?.({ map: fakeMap }));

    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm location/i })).toBeDisabled();
  });

  it("asks the server for the address where a drag settles, and confirms it", async () => {
    const { reverseGeocode, onConfirm } = renderPicker();

    dragTo({ lat: 17.4567891234, lng: 78.3645119876 });

    await screen.findByText(/Lotus Residency, Kondapur/);
    // Six decimals: the contract's precision.
    expect(reverseGeocode).toHaveBeenCalledWith({ latitude: "17.456789", longitude: "78.364512" });

    fireEvent.click(screen.getByRole("button", { name: /confirm location/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ locality: "Kondapur" }));
  });

  it("does not ask again when the map settles on the same spot", async () => {
    const { reverseGeocode } = renderPicker();

    dragTo({ lat: 17.456789, lng: 78.364512 });
    await screen.findByText(/Lotus Residency/);
    act(() => mapProps.onIdle?.({ map: fakeMap }));

    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer for where the pin is, not a slow one for where it was", async () => {
    let releaseFirst!: () => void;
    renderPicker({
      reverseGeocode: (point) =>
        point.latitude === "17.100000"
          ? new Promise((resolve) => {
              releaseFirst = () => resolve(located({ formatted_address: "Old spot" }));
            })
          : Promise.resolve(located({ formatted_address: "New spot" })),
    });

    dragTo({ lat: 17.1, lng: 78.1 });
    dragTo({ lat: 17.2, lng: 78.2 });
    await screen.findByText("New spot");

    await act(async () => releaseFirst());
    expect(screen.getByText("New spot")).toBeInTheDocument();
    expect(screen.queryByText("Old spot")).toBeNull();
  });

  it("keeps the pin when the address lookup fails, so the text can be typed", async () => {
    const { onConfirm } = renderPicker({ reverseGeocode: () => Promise.reject(new Error("503")) });

    dragTo({ lat: 17.45, lng: 78.36 });
    expect(await screen.findByText(/could not name this spot/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm location/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: "17.450000", longitude: "78.360000", line1: "" }),
    );
  });

  it("never shows the thrown lookup error, which carries the coordinate", async () => {
    renderPicker({ reverseGeocode: () => Promise.reject(new Error("POST lat=17.45 lng=78.36")) });

    dragTo({ lat: 17.45, lng: 78.36 });
    await screen.findByText(/could not name this spot/i);

    expect(screen.queryByText(/lat=17\.45/)).toBeNull();
  });

  it("starts from an existing pin and names it", async () => {
    const { reverseGeocode } = renderPicker({
      initial: { latitude: "17.456789", longitude: "78.364512" },
    });

    await screen.findByText(/Lotus Residency/);
    expect(reverseGeocode).toHaveBeenCalledWith({ latitude: "17.456789", longitude: "78.364512" });
    expect(screen.getByRole("button", { name: /confirm location/i })).toBeEnabled();
  });

  it("offers the device's location when there is no browser key", async () => {
    stubGeolocation({ coords: { latitude: 17.456789, longitude: 78.364512 } });
    const { reverseGeocode } = renderPicker({ apiKey: "" });

    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByText(/map is not available/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    await screen.findByText(/Lotus Residency/);
    expect(reverseGeocode).toHaveBeenCalledWith({ latitude: "17.456789", longitude: "78.364512" });
  });
});

describe("using the device", () => {
  it("moves the map to the fix and names it", async () => {
    stubGeolocation({ coords: { latitude: 17.44, longitude: 78.38 } });
    const { reverseGeocode } = renderPicker({ autoLocate: true });

    await screen.findByText(/Lotus Residency/);
    expect(fakeMap.panTo).toHaveBeenCalledWith({ lat: 17.44, lng: 78.38 });
    expect(reverseGeocode).toHaveBeenCalledWith({ latitude: "17.440000", longitude: "78.380000" });
  });

  it.each([
    [{ code: 1 }, /browser settings/i],
    [{ code: 2 }, /move near a window/i],
    [{ code: 3 }, /took too long/i],
    ["unsupported" as const, /cannot share a location/i],
  ])("tells the remedy apart for %o", async (answer, message) => {
    stubGeolocation(answer);
    const { reverseGeocode } = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm location/i })).toBeDisabled();
  });

  it("clears the failure when the next attempt begins", async () => {
    stubGeolocation({ code: 1 });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    await screen.findByRole("alert");

    stubGeolocation({ coords: { latitude: 17.44, longitude: 78.38 } });
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await screen.findByText(/Lotus Residency/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("searching", () => {
  it("moves the pin to a picked place and takes the text from the server, not Google", async () => {
    const { reverseGeocode } = renderPicker();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Kond" } });
    fireEvent.click(await screen.findByRole("button", { name: /Kondapur/ }));

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledTimes(1));
    // Places is asked for the coordinate and nothing billable beyond it.
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["location"] });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ input: "Kond", includedRegionCodes: ["in"] }),
    );
    expect(fakeMap.panTo).toHaveBeenCalledWith({ lat: 17.4651, lng: 78.3633 });
    expect(reverseGeocode).toHaveBeenCalledWith({ latitude: "17.465100", longitude: "78.363300" });
  });

  it("does not search for fewer than three characters", async () => {
    renderPicker();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Ko" } });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
  });
});

describe("inside a caller's form", () => {
  it("keeps Enter in the search box from submitting the form around it", () => {
    render(
      <form>
        <LocationPicker
          apiKey="test-browser-key"
          reverseGeocode={() => Promise.resolve(located())}
          onConfirm={() => undefined}
        />
      </form>,
    );

    // A browser submits the enclosing form as Enter's default action, which
    // jsdom does not simulate, so the assertion is that the default is cancelled.
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    screen.getByRole("searchbox").dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
  });
});
