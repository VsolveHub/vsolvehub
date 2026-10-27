import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

const render = (ui: ReactElement) => rtlRender(withI18n(ui));

/**
 * "Find on map" on the Partner listing forms.
 *
 * Tests run without `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, so the shared picker renders
 * its no-map mode: the device fix and this app's reverse-geocode call. The map
 * itself is covered in `@vsolve/ui`'s own picker tests.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { FindOnMap } = await import("./find-on-map");

const LOCATED = {
  formatted_address: "Plot 12, Road 3, Kukatpally, Hyderabad 500072",
  line1: "Plot 12, Road 3",
  locality: "Kukatpally",
  city: "Hyderabad",
  state: "Telangana",
  postal_code: "500072",
  country_code: "IN",
  latitude: "17.494812",
  longitude: "78.399574",
  provider: "test",
};

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset();
  client.POST.mockResolvedValue({ data: LOCATED, error: undefined, response: new Response(null, { status: 200 }) });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: 17.494812, longitude: 78.399574 },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition),
    },
  });
});

describe("find on map", () => {
  it("hands back the server's address for the confirmed pin and closes", async () => {
    const onPicked = vi.fn();
    render(<FindOnMap onPicked={onPicked} title="Find the pickup location" />);

    fireEvent.click(screen.getByRole("button", { name: /find on map/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    const confirm = await screen.findByRole("button", { name: /use this location/i });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    expect(client.POST).toHaveBeenCalledWith("/api/v1/geocoding/reverse/", {
      body: { latitude: "17.494812", longitude: "78.399574" },
    });
    expect(onPicked).toHaveBeenCalledWith(
      expect.objectContaining({ locality: "Kukatpally", postal_code: "500072" }),
    );
    expect(screen.queryByRole("button", { name: /use this location/i })).toBeNull();
  });

  it("says the place is pinned and offers to move the pin", () => {
    render(
      <FindOnMap onPicked={vi.fn()} pin={{ latitude: "17.494812", longitude: "78.399574" }} />,
    );

    expect(screen.getByText("Pinned on map")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move pin/i })).toBeInTheDocument();
  });

  it("opens on the saved pin and names it", async () => {
    render(
      <FindOnMap onPicked={vi.fn()} pin={{ latitude: "17.494812", longitude: "78.399574" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /move pin/i }));

    expect(await screen.findByText(/Plot 12, Road 3, Kukatpally/)).toBeInTheDocument();
    expect(client.POST).toHaveBeenCalledWith("/api/v1/geocoding/reverse/", {
      body: { latitude: "17.494812", longitude: "78.399574" },
    });
  });

  it("does not open the picker until asked", () => {
    render(<FindOnMap onPicked={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /use my current location/i })).toBeNull();
    expect(client.POST).not.toHaveBeenCalled();
  });
});
