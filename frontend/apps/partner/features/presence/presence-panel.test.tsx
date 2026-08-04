import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Going online, and what the Partner is told when it does not work.
 *
 * The test this file exists for: a refusal must reach the screen. Django
 * answers `presence/online` with a specific, actionable sentence — "Your
 * required identity documents are not approved" — and the panel used to fold
 * every failure into the badge, where it became "Not sure. We could not confirm
 * whether you are online." That is the copy for *doubt*, and the server was not
 * doubtful; it had refused and said why.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

/**
 * `@` resolves to the Customer app under Vitest, which has no
 * `features/application`. The panel only reads the service areas off this hook,
 * so it is supplied directly rather than reshaping a shared alias that 46 other
 * test files depend on.
 */
const reference = {
  serviceAreas: [] as unknown[],
  skills: [],
  requiredConsents: [],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/features/application/reference-queries", () => ({
  useApplicationReference: () => reference,
}));

const { PresencePanel } = await import("./view/presence-panel");
const { STORAGE_KEY } = await import("./model/stored-session");

const AREA = {
  id: "area-1",
  slug: "hyderabad-500032",
  name: "Hyderabad 500032",
  timezone: "Asia/Kolkata",
  is_accepting_partners: true,
};

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

/** A refusal shaped the way the transport delivers one: resolved, not rejected. */
function refusal(code: string, message: string, status = 403) {
  return {
    data: undefined,
    error: { error: { code, message, details: null, retryable: false, request_id: "req_1" } },
    response: new Response(null, { status }),
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  window.localStorage.clear();
  for (const method of Object.values(client)) method.mockReset();

  reference.serviceAreas = [AREA];
  reference.isPending = false;
  reference.isError = false;

  // jsdom has no geolocation, and the panel asks for a position before it calls
  // Django at all — without this every test would stop at "Location needed".
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (onSuccess: PositionCallback) =>
        onSuccess({
          coords: { latitude: 17.44, longitude: 78.38, accuracy: 20 },
          timestamp: Date.now(),
        } as GeolocationPosition),
    },
  });
});

afterEach(() => {
  queryClient.clear();
});

async function goOnline() {
  const areas = await screen.findByLabelText(/area you are working in/i);
  fireEvent.change(areas, { target: { value: AREA.id } });
  fireEvent.click(screen.getByRole("button", { name: /go online/i }));
}

describe("after a reload", () => {
  /**
   * Presence lives on the server, but the only record of *which* session was
   * this browser's lived in React state — so a refresh reported "Offline. You
   * will not be offered any jobs" to a Partner whose session was live and who
   * was, in fact, being offered jobs. That is the exact false claim the whole
   * status model exists to prevent, just in the other direction.
   */
  it("restores a session Django still has", async () => {
    window.localStorage.setItem(STORAGE_KEY, "sess-1");
    client.POST.mockResolvedValue(
      ok({
        id: "sess-1",
        service_area_id: AREA.id,
        started_at: new Date().toISOString(),
        last_persisted_heartbeat_at: new Date().toISOString(),
        server_now: new Date().toISOString(),
      }),
    );

    render(<PresencePanel consentVersion="2026-07" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /go offline/i })).toBeInTheDocument(),
    );
    // Confirmed by Django, so the badge may say so.
    expect(screen.getByText("Online")).toBeInTheDocument();
    // Restoring must not re-place the Partner: a heartbeat, never a second
    // `online` call, which would move their recorded location on every refresh.
    expect(client.POST).toHaveBeenCalledTimes(1);
    expect(client.POST.mock.calls[0]![0]).toBe("/api/v1/partner/presence/heartbeat/");
  });

  it("treats the answer as a fresh beat, not the timestamp inside it", async () => {
    /**
     * Django persists `last_persisted_heartbeat_at` at most once every
     * `PARTNER_PRESENCE_DB_TOUCH_SECONDS` (300s) and serves presence from cache
     * in between, so a perfectly healthy session reports a timestamp minutes
     * old. Reading it as "when we last heard from the server" — against a 90s
     * staleness threshold — declared "Connection lost" on every restore of a
     * session that was never lost. What the response proves is that the server
     * answered *now*.
     */
    window.localStorage.setItem(STORAGE_KEY, "sess-1");
    const persistedLongAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    client.POST.mockResolvedValue(
      ok({
        id: "sess-1",
        service_area_id: AREA.id,
        started_at: persistedLongAgo,
        last_persisted_heartbeat_at: persistedLongAgo,
        server_now: new Date().toISOString(),
      }),
    );

    render(<PresencePanel consentVersion="2026-07" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /go offline/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.queryByText(/connection lost/i)).not.toBeInTheDocument();
  });

  it("forgets a session Django no longer has", async () => {
    window.localStorage.setItem(STORAGE_KEY, "sess-expired");
    client.POST.mockResolvedValue(
      refusal("partner_presence_invalid", "This online session has expired. Go online again.", 409),
    );

    render(<PresencePanel consentVersion="2026-07" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /go online/i })).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("says nothing about a Partner who was never online", async () => {
    render(<PresencePanel consentVersion="2026-07" />, { wrapper });

    await screen.findByRole("button", { name: /go online/i });
    // No stored session means no probe: an idle Partner must not spend a
    // request on every page load.
    expect(client.POST).not.toHaveBeenCalled();
  });
});

describe("when Django refuses to put the Partner online", () => {
  it("shows the reason the server gave", async () => {
    client.POST.mockResolvedValue(
      refusal(
        "partner_not_operationally_eligible",
        "Your required identity documents are not approved.",
      ),
    );

    render(<PresencePanel consentVersion="2026-07" />, { wrapper });
    await goOnline();

    await waitFor(() =>
      expect(
        screen.getByText(/your required identity documents are not approved/i),
      ).toBeInTheDocument(),
    );
  });

  it("still refuses to claim the Partner is online", async () => {
    // The badge must not improve just because the failure is now legible.
    client.POST.mockResolvedValue(
      refusal("partner_not_operationally_eligible", "Your required identity documents are not approved."),
    );

    render(<PresencePanel consentVersion="2026-07" />, { wrapper });
    await goOnline();

    await waitFor(() => expect(screen.getByText(/not sure/i)).toBeInTheDocument());
    expect(screen.queryByText(/^online$/i)).not.toBeInTheDocument();
  });
});
