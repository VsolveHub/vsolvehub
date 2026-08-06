import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok, refusal, resolvedLocation } from "../account/fixtures";

/**
 * Turning a device fix into address text, and the five ways it fails.
 *
 * Collapsing these into "we could not get your location" is how somebody sits in
 * a basement pressing a button that was never going to work — and how somebody
 * whose browser has the permission switched off keeps pressing one that will
 * never work either. Each classification maps to a different thing the customer
 * can actually do, so each one is asserted here rather than trusted.
 *
 * The privacy rule is tested too: a failed reverse geocode must not surface the
 * thrown error, because its request context carries the coordinate.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { usePinLocation } = await import("./use-pin-location");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Installs a geolocation that succeeds with one fix. */
function geolocationResolving(coords = { latitude: 17.4567891, longitude: 78.3645123 }) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords, timestamp: Date.now() } as unknown as GeolocationPosition),
    },
  });
}

/** Installs a geolocation that fails with one of the platform's numeric codes. */
function geolocationFailing(code: number) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (_success: PositionCallback, failure?: PositionErrorCallback) =>
        failure?.({ code, message: "denied" } as GeolocationPositionError),
    },
  });
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("a fix the browser gave us", () => {
  it("sends six decimal places, and no more", async () => {
    // The contract's own precision (`^-?\d{0,3}(?:\.\d{0,6})?$`), and more than
    // a doorway needs is data we have no reason to hold.
    geolocationResolving();
    client.POST.mockResolvedValue(ok(resolvedLocation()));
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      await result.current.pin();
    });

    expect(client.POST).toHaveBeenCalledWith("/api/v1/geocoding/reverse/", {
      body: { latitude: "17.456789", longitude: "78.364512" },
    });
  });

  it("returns the server's address text, not the coordinate", async () => {
    geolocationResolving();
    client.POST.mockResolvedValue(ok(resolvedLocation()));
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.pin();
    });

    expect(resolved).toMatchObject({ locality: "Kondapur", city: "Hyderabad" });
    expect(result.current.failure).toBeNull();
  });
});

describe("the five failures, each with its own way forward", () => {
  it("tells a customer who refused the prompt to change a browser setting", async () => {
    // Retrying does nothing until they do, so "try again" would be a button that
    // was never going to work.
    geolocationFailing(1);
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      expect(await result.current.pin()).toBeNull();
    });

    expect(result.current.failure).toBe("denied");
    expect(result.current.failureMessage).toMatch(/browser settings/i);
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("tells a customer with no fix that moving helps", async () => {
    geolocationFailing(2);
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      await result.current.pin();
    });

    expect(result.current.failure).toBe("unavailable");
    expect(result.current.failureMessage).toMatch(/near a window/i);
  });

  it("tells a customer whose fix timed out to try again", async () => {
    geolocationFailing(3);
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      await result.current.pin();
    });

    expect(result.current.failure).toBe("timeout");
    expect(result.current.failureMessage).toMatch(/try again/i);
  });

  it("tells a customer with no geolocation API to type it in", async () => {
    // An insecure origin, or a browser without the API. Retrying is pointless.
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      await result.current.pin();
    });

    expect(result.current.failure).toBe("unsupported");
    expect(result.current.failureMessage).toMatch(/type the address in yourself/i);
  });

  it("separates a fix we could not turn into an address from one we never got", async () => {
    geolocationResolving();
    client.POST.mockResolvedValue(refusal("geocoding_unavailable", 503));
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      expect(await result.current.pin()).toBeNull();
    });

    expect(result.current.failure).toBe("lookup");
    expect(result.current.failureMessage).toMatch(/found your location but could not turn it/i);
  });

  it("never surfaces the thrown error, which carries the coordinate", async () => {
    geolocationResolving();
    client.POST.mockResolvedValue(refusal("geocoding_unavailable", 503));
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      await result.current.pin();
    });

    // Authored copy, not `describeError` over an error whose request context
    // holds where the customer is standing.
    expect(result.current.failureMessage).not.toMatch(/17\.45|78\.36|refused/i);
  });
});

describe("recovering", () => {
  it("clears the failure so a second attempt starts clean", async () => {
    geolocationFailing(1);
    const { result } = renderHook(() => usePinLocation(), { wrapper });

    await act(async () => {
      await result.current.pin();
    });
    expect(result.current.failure).toBe("denied");

    act(() => result.current.reset());

    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.failureMessage).toBeNull();
  });

  it("stops reporting a failure the moment a new attempt begins", async () => {
    geolocationFailing(2);
    const { result } = renderHook(() => usePinLocation(), { wrapper });
    await act(async () => {
      await result.current.pin();
    });
    expect(result.current.failure).toBe("unavailable");

    geolocationResolving();
    client.POST.mockResolvedValue(ok(resolvedLocation()));
    await act(async () => {
      await result.current.pin();
    });

    expect(result.current.failure).toBeNull();
  });
});
