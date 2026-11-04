import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { getApiClient } from "../api/client";
import { PlaceSearch } from "./place-search";
import { usePlaceSearch, useReverseGeocode } from "./queries";

jest.mock("../api/client", () => ({
  getApiClient: jest.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("places queries and PlaceSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("usePlaceSearch queries geocoding search endpoint when query is at least 3 chars", async () => {
    const mockGet = jest.fn().mockResolvedValue({
      data: {
        results: [
          { label: "Banjara Hills, Hyderabad", latitude: "17.4156", longitude: "78.4350" },
        ],
      },
      error: undefined,
      response: { ok: true, status: 200 } as unknown as Response,
    });
    (getApiClient as jest.Mock).mockReturnValue({ GET: mockGet });

    const { result } = await renderHook(() => usePlaceSearch("Banjara"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("/api/v1/geocoding/search/", {
      params: { query: { q: "Banjara" } },
    });
    expect(result.current.data?.results).toHaveLength(1);
    expect(result.current.data?.results?.[0].label).toBe("Banjara Hills, Hyderabad");
  });

  it("useReverseGeocode posts coordinates to geocoding reverse endpoint", async () => {
    const mockPost = jest.fn().mockResolvedValue({
      data: {
        formatted_address: "Road No 12, Banjara Hills, Hyderabad, Telangana 500034",
        line1: "Road No 12",
        locality: "Banjara Hills",
        city: "Hyderabad",
        state: "Telangana",
        postal_code: "500034",
        latitude: "17.4156",
        longitude: "78.4350",
      },
      error: undefined,
      response: { ok: true, status: 200 } as unknown as Response,
    });
    (getApiClient as jest.Mock).mockReturnValue({ POST: mockPost });

    const { result } = await renderHook(() => useReverseGeocode(), {
      wrapper: createWrapper(),
    });

    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({
        latitude: "17.4156",
        longitude: "78.4350",
      });
    });

    expect(mockPost).toHaveBeenCalledWith("/api/v1/geocoding/reverse/", {
      body: { latitude: "17.4156", longitude: "78.4350" },
    });
    expect((res as { city: string }).city).toBe("Hyderabad");
  });

  it("PlaceSearch renders, triggers debounced search, and calls onPick when pressed", async () => {
    const mockGet = jest.fn().mockResolvedValue({
      data: {
        results: [
          { label: "Madhapur, Hyderabad", latitude: "17.4483", longitude: "78.3915" },
        ],
      },
      error: undefined,
      response: { ok: true, status: 200 } as unknown as Response,
    });
    (getApiClient as jest.Mock).mockReturnValue({ GET: mockGet });

    const onPick = jest.fn();

    const { getByPlaceholderText, findByText, getByText } = await render(
      <PlaceSearch onPick={onPick} placeholder="Search pickup area" />,
      { wrapper: createWrapper() },
    );

    const input = getByPlaceholderText("Search pickup area");
    expect(input).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(input, "Madhapur");
    });

    const item = await findByText("Madhapur, Hyderabad");
    expect(item).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText("Madhapur, Hyderabad"));
    });

    expect(onPick).toHaveBeenCalledWith({
      label: "Madhapur, Hyderabad",
      latitude: "17.4483",
      longitude: "78.3915",
    });
  });
});
