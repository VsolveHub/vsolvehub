import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { PartnerRentalAsset } from "../model";
import { RentalAdSheet } from "./rental-ad-sheet";

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: "Images" },
}));

const mockReverseGeocodeMutate = jest.fn();
jest.mock("@vsolve/mobile-core", () => {
  const actual = jest.requireActual("@vsolve/mobile-core");
  return {
    ...actual,
    getCurrentPosition: jest.fn().mockResolvedValue({
      coords: { latitude: 17.4483, longitude: 78.3915, accuracy: 10 },
      timestamp: Date.now(),
    }),
    useReverseGeocode: () => ({
      mutate: mockReverseGeocodeMutate,
      isPending: false,
    }),
  };
});

jest.mock("../queries", () => ({
  fetchRentalTaxonomy: jest.fn().mockResolvedValue([
    {
      id: "sub-1",
      slug: "power-tools",
      name: "Power Tools",
      services: [
        {
          id: "srv-1",
          name: "Drills",
          variants: [{ id: "var-1", name: "Hammer Drill", default_deposit_paise: 50000 }],
        },
      ],
    },
  ]),
  fetchPartnerDefaultLocation: jest.fn().mockResolvedValue(""),
  createPartnerRentalAsset: jest.fn().mockResolvedValue({ id: "asset-1" }),
  updatePartnerRentalAsset: jest.fn().mockResolvedValue({ id: "asset-1" }),
  deletePartnerRentalAsset: jest.fn().mockResolvedValue(undefined),
  deletePartnerRentalAssetMedia: jest.fn().mockResolvedValue(undefined),
  uploadPartnerRentalPhoto: jest.fn().mockResolvedValue({ upload_id: "u-1", url: "https://photo.jpg" }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  };
}

describe("RentalAdSheet - Pickup Location & Map Pin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders create form with no default pin (Rule 5 honest empty state)", async () => {
    await render(
      <RentalAdSheet open={true} onOpenChange={jest.fn()} editingAsset={null} />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("Post Rental Equipment")).toBeTruthy();
    expect(screen.getByText("Pickup Address & Location Pin")).toBeTruthy();
    expect(screen.getByText("Use my current location")).toBeTruthy();
    // Rule: pickup pin must be one the partner placed, never a default
    expect(screen.queryByText("✓ Pinned")).toBeNull();
  });

  it("loads existing asset pickup pin and formatted address when editing", async () => {
    const editingAsset: PartnerRentalAsset = {
      id: "asset-existing-1",
      title: "Bosch Rotary Hammer Drill",
      daily_rate_paise: 50000,
      deposit_paise: 150000,
      quantity_available: 2,
      location_text: "Shop 4, Ameerpet, Hyderabad",
      pickup_address_line: "Shop 4",
      pickup_area: "Ameerpet",
      pickup_city: "Hyderabad",
      pickup_pincode: "500038",
      pickup_latitude: "17.4375",
      pickup_longitude: "78.4482",
      status: "ACTIVE",
    };

    await render(
      <RentalAdSheet open={true} onOpenChange={jest.fn()} editingAsset={editingAsset} />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("Edit Rental Ad")).toBeTruthy();
    expect(screen.getByText("✓ Pinned")).toBeTruthy();
    expect(screen.getByText("Move pin to current location")).toBeTruthy();
    expect(screen.getByDisplayValue("Shop 4")).toBeTruthy();
    expect(screen.getByDisplayValue("Ameerpet")).toBeTruthy();
    expect(screen.getByDisplayValue("Hyderabad")).toBeTruthy();
    expect(screen.getByDisplayValue("500038")).toBeTruthy();
  });

  it("calls reverseGeocode and places pin when partner picks a place", async () => {
    mockReverseGeocodeMutate.mockImplementation((coords, options) => {
      options?.onSuccess?.({
        line1: "Plot 42",
        locality: "Jubilee Hills",
        city: "Hyderabad",
        postal_code: "500033",
        formatted_address: "Plot 42, Jubilee Hills, Hyderabad 500033",
        latitude: "17.4319",
        longitude: "78.4073",
      });
    });

    await render(
      <RentalAdSheet open={true} onOpenChange={jest.fn()} editingAsset={null} />,
      { wrapper: createWrapper() },
    );

    const input = screen.getByPlaceholderText("Search pickup area, street or landmark");
    expect(input).toBeTruthy();

    // Trigger place pick through PlaceSearch
    fireEvent.changeText(input, "Jubilee");

    // Click "Use my current location"
    const useLocationBtn = screen.getByText("Use my current location");
    await act(async () => {
      fireEvent.press(useLocationBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("✓ Pinned")).toBeTruthy();
    });

    expect(screen.getByText("Plot 42, Jubilee Hills, Hyderabad 500033")).toBeTruthy();
    expect(screen.getByDisplayValue("Plot 42")).toBeTruthy();
    expect(screen.getByDisplayValue("Jubilee Hills")).toBeTruthy();
  });
});
