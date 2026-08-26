import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Duty: going on it, staying on it, and what a Partner is told when it does not
 * work.
 *
 * Ported from `presence-panel.test.tsx` when the presence state moved out of
 * `PresencePanel` into `DutyProvider` (see that provider's own note on the
 * two-heartbeat problem the move ended). Every case below is one the panel
 * already had to pass; the assertions are made against the provider's published
 * state rather than against a card's markup, because the state machine is what
 * actually moved and a sheet's layout is not what any of these are about.
 *
 * The test this file exists for is still the same one: **a refusal must reach
 * the Partner**. Django answers `presence/online` with a specific, actionable
 * sentence — "Your required identity documents are not approved" — and the
 * control this replaced used to fold every failure into the badge, where it
 * became "Not sure. We could not confirm whether you are online." That is the
 * copy for *doubt*, and the server was not doubtful; it had refused and said
 * why.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const AREA = {
  id: "area-1",
  slug: "hyderabad-500032",
  name: "Hyderabad 500032",
  timezone: "Asia/Kolkata",
  is_accepting_partners: true,
};

const CONSENT = { purpose: "PARTNER_TERMS", document_version: "2026-07" };

/**
 * `@` resolves to the Customer app under Vitest, which has no
 * `features/application`. Both application hooks are supplied directly rather
 * than reshaping a shared alias that 46 other test files depend on.
 */
const reference = {
  serviceAreas: [] as unknown[],
  skills: [],
  requiredConsents: [] as unknown[],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};

const application = {
  data: undefined as unknown,
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock("@/features/application/reference-queries", () => ({
  useApplicationReference: () => reference,
}));

vi.mock("@/features/application/queries", () => ({
  usePartnerApplication: () => application,
}));

const { DutyProvider, useDuty } = await import("./duty-context");
const { STORAGE_KEY } = await import("./model/stored-session");

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

function session(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "sess-1",
    service_area_id: AREA.id,
    started_at: now,
    last_persisted_heartbeat_at: now,
    server_now: now,
    ...overrides,
  };
}

/**
 * A probe, not the real sheet.
 *
 * `DutySheet` renders inside a `<dialog>` opened with `showModal()`, which is
 * not what any of these tests are about — every case here is a question about
 * the state machine. The probe renders the provider's published values as plain
 * text and exposes its two commands as buttons, so a failure points at the
 * logic rather than at a layout change.
 */
function Probe() {
  const duty = useDuty();
  if (duty === null) return <p>no provider</p>;

  return (
    <div>
      <p data-testid="status">{duty.status}</p>
      <p data-testid="label">{duty.copy.label}</p>
      <p data-testid="ready">{String(duty.isReady)}</p>
      <p data-testid="error">
        {duty.goOnlineError === null ? "" : JSON.stringify(duty.goOnlineError)}
      </p>
      <button type="button" onClick={() => duty.setAreaId(AREA.id)}>
        pick area
      </button>
      <button type="button" onClick={() => void duty.goOnline()}>
        go on duty
      </button>
      <button type="button" onClick={() => void duty.goOffline()}>
        go off duty
      </button>
    </div>
  );
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DutyProvider>{children}</DutyProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  window.localStorage.clear();
  for (const method of Object.values(client)) method.mockReset();

  reference.serviceAreas = [AREA];
  reference.requiredConsents = [CONSENT];
  reference.isPending = false;
  reference.isError = false;

  application.data = { status: "APPROVED", consents: [{ ...CONSENT, withdrawn_at: null }] };
  application.isPending = false;

  // jsdom has no geolocation, and the provider asks for a position before it
  // calls Django at all — without this every test would stop at
  // "location_denied".
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
  vi.useRealTimers();
});

async function goOnDuty() {
  fireEvent.click(screen.getByRole("button", { name: /pick area/i }));
  fireEvent.click(screen.getByRole("button", { name: /go on duty/i }));
}

describe("after a reload", () => {
  /**
   * Presence lives on the server, but the only record of *which* session was
   * this browser's lives in the browser — so without a restore a refresh
   * reported "Offline. You will not be offered any jobs" to a Partner whose
   * session was live and who was, in fact, being offered jobs. That is the
   * exact false claim the whole status model exists to prevent, in the other
   * direction.
   */
  it("restores a session Django still has", async () => {
    window.localStorage.setItem(STORAGE_KEY, "sess-1");
    client.POST.mockResolvedValue(ok(session()));

    render(<Probe />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("online"));

    // Restoring must not re-place the Partner: a heartbeat, never a second
    // `online` call, which would move their recorded location on every refresh.
    expect(client.POST).toHaveBeenCalledTimes(1);
    expect(client.POST.mock.calls[0]![0]).toBe("/api/v1/partner/presence/heartbeat/");
  });

  it("treats the answer as a fresh beat, not the timestamp inside it", async () => {
    /*
      Django persists `last_persisted_heartbeat_at` at most once every
      `PARTNER_PRESENCE_DB_TOUCH_SECONDS` (300s) and serves presence from cache
      in between, so a perfectly healthy session reports a timestamp minutes
      old. Reading it as "when we last heard from the server" — against a 90s
      staleness threshold — declared "Connection lost" on every restore of a
      session that was never lost. What the response proves is that the server
      answered *now*.
    */
    window.localStorage.setItem(STORAGE_KEY, "sess-1");
    const longAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    client.POST.mockResolvedValue(
      ok(session({ started_at: longAgo, last_persisted_heartbeat_at: longAgo })),
    );

    render(<Probe />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("online"));
    expect(screen.getByTestId("status")).not.toHaveTextContent("stale");
  });

  it("forgets a session Django no longer has", async () => {
    window.localStorage.setItem(STORAGE_KEY, "sess-expired");
    client.POST.mockResolvedValue(
      refusal("partner_presence_invalid", "This online session has expired. Go online again.", 409),
    );

    render(<Probe />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("offline"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("says nothing about a Partner who was never online", async () => {
    render(<Probe />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
    // No stored session means no probe: an idle Partner must not spend a
    // request on every page load.
    expect(client.POST).not.toHaveBeenCalled();
  });
});

describe("going on duty from a cold offline load", () => {
  /**
   * The control loaded with nothing in storage, so the mount probe had nothing
   * to confirm — and never marked itself complete. The id written by a
   * successful "Go online" then re-read as an unconfirmed stored session, and
   * the screen froze on "Checking" until a reload.
   */
  it("reaches online, not checking, once Django confirms the session", async () => {
    client.POST.mockResolvedValue(ok(session({ id: "sess-new" })));

    render(<Probe />, { wrapper });
    await goOnDuty();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("online"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("sess-new");
  });
});

describe("when Django refuses to put the Partner on duty", () => {
  it("keeps the refusal available for the screen to render", async () => {
    client.POST.mockResolvedValue(
      refusal(
        "partner_not_operationally_eligible",
        "Your required identity documents are not approved.",
      ),
    );

    render(<Probe />, { wrapper });
    await goOnDuty();

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(
        /your required identity documents are not approved/i,
      ),
    );
  });

  it("still refuses to claim the Partner is online", async () => {
    // The status must not improve just because the failure is now legible.
    client.POST.mockResolvedValue(
      refusal(
        "partner_not_operationally_eligible",
        "Your required identity documents are not approved.",
      ),
    );

    render(<Probe />, { wrapper });
    await goOnDuty();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unknown"));
    expect(screen.getByTestId("label")).toHaveTextContent("Not sure");
  });
});

describe("the consent version sent with a location", () => {
  /**
   * Going on duty records a location against a consent receipt, so the version
   * sent has to be the one the Partner accepted rather than the newest
   * published. The two differ exactly when legal text was republished and has
   * not been re-accepted — the case where guessing would attach a location to
   * an agreement nobody signed.
   */
  it("refuses to go on duty when nothing on file matches what is required", async () => {
    reference.requiredConsents = [{ purpose: "PARTNER_TERMS", document_version: "2026-09" }];
    application.data = {
      status: "APPROVED",
      consents: [{ purpose: "PARTNER_TERMS", document_version: "2026-07", withdrawn_at: null }],
    };

    render(<Probe />, { wrapper });
    await goOnDuty();

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
  });

  it("sends the accepted version, not the newest one", async () => {
    client.POST.mockResolvedValue(ok(session()));

    render(<Probe />, { wrapper });
    await goOnDuty();

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [path, options] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/partner/presence/online/");
    expect(options.body.consent_version).toBe("2026-07");
    expect(options.body.service_area_id).toBe(AREA.id);
  });
});

describe("when the browser refuses a location", () => {
  it("says so, and never calls Django", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, onError: PositionErrorCallback) =>
          onError({ code: 1, message: "denied" } as GeolocationPositionError),
      },
    });

    render(<Probe />, { wrapper });
    await goOnDuty();

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("location_denied"),
    );
    expect(client.POST).not.toHaveBeenCalled();
  });
});
