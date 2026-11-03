import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SchedulingGroup } from "../queries";

/**
 * The per-visit slot picker.
 *
 * The property under test throughout is that this component renders the server's
 * grouping and never invents one, refuses to produce a partial schedule because
 * Django refuses one too — and, since Task 8, fetches each visit's grid on its
 * own rather than sharing one cart-wide answer that only the first visit's
 * duration and skill set could ever be correct for.
 */

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { SlotsModal } = await import("./slots-modal");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const ELECTRICIAN: SchedulingGroup = {
  key: "key-electrician",
  label: "Electrician",
  estimated_duration_minutes: 30,
  cart_item_ids: ["item-1"],
};

const SALON: SchedulingGroup = {
  key: "key-salon",
  label: "Salon Prime",
  estimated_duration_minutes: 130,
  cart_item_ids: ["item-2"],
};

function windowsResponse(
  overrides: Partial<Schemas["BookingWindows"]> = {},
): Schemas["BookingWindows"] {
  return {
    server_now: "2026-08-10T00:00:00Z",
    estimated_duration_minutes: 30,
    availability_is_preliminary: true,
    timezone: "Asia/Kolkata",
    instant: { is_available: false, earliest_starts_at: null, eta_minutes: null, unavailable_reason: null },
    days: [
      {
        date: "2026-08-10",
        is_today: true,
        windows: [
          {
            id: "win-1",
            starts_at: "2026-08-10T04:30:00Z",
            ends_at: "2026-08-10T05:30:00Z",
            is_available: true,
            unavailable_reason: null,
            capacity: 3,
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** Each visit's grid is distinguishable by its one window's start time. */
const ELECTRICIAN_WINDOWS = windowsResponse();
const SALON_WINDOWS = windowsResponse({
  days: [
    {
      date: "2026-08-10",
      is_today: true,
      windows: [
        {
          id: "win-2",
          starts_at: "2026-08-10T08:30:00Z",
          ends_at: "2026-08-10T10:30:00Z",
          is_available: true,
          unavailable_reason: null,
          capacity: 3,
        },
      ],
    },
  ],
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  client.POST.mockImplementation(
    (path: string, options: { body?: { group_key?: string } } | undefined) => {
      if (path !== "/api/v1/booking/windows/") return Promise.reject(new Error(`unexpected ${path}`));
      return Promise.resolve(
        ok(options?.body?.group_key === SALON.key ? SALON_WINDOWS : ELECTRICIAN_WINDOWS),
      );
    },
  );
});

afterEach(() => {
  queryClient.clear();
});

function renderModal(overrides: Partial<Parameters<typeof SlotsModal>[0]> = {}) {
  const props = {
    open: true,
    groups: [ELECTRICIAN, SALON],
    value: new Map<string, string>(),
    cartVersion: 1,
    addressId: "address-1",
    onConfirm: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<SlotsModal {...props} />, { wrapper });
  return props;
}

async function chooseSlot(groupLabel: string, timeLabel: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`select ${groupLabel}`, "i") }));
  await waitFor(() => expect(screen.getByRole("radio", { name: timeLabel })).toBeInTheDocument());
  const dayButton = screen.queryByRole("button", { name: /mon 10 aug|today/i });
  if (dayButton) fireEvent.click(dayButton);
  fireEvent.click(screen.getByRole("radio", { name: timeLabel }));
}

describe("visit rows", () => {
  it("renders one row per server group and merges nothing itself", () => {
    renderModal();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Electrician")).toBeInTheDocument();
    expect(screen.getByText("Salon Prime")).toBeInTheDocument();
  });

  it("states each visit's own estimated length", () => {
    renderModal();

    expect(screen.getByText(/30 mins/i)).toBeInTheDocument();
    expect(screen.getByText(/2 hrs & 10 mins/i)).toBeInTheDocument();
  });

  it("explains why there is more than one time to pick", () => {
    renderModal();

    expect(screen.getByText(/need different professionals/i)).toBeInTheDocument();
  });

  it("says nothing about multiple professionals for a single visit", () => {
    renderModal({ groups: [ELECTRICIAN] });

    expect(screen.queryByText(/need different professionals/i)).not.toBeInTheDocument();
  });
});

describe("fetching windows per visit", () => {
  it("fetches a separate window list per visit", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /select electrician/i }));
    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/booking/windows/",
        expect.objectContaining({
          body: expect.objectContaining({ group_key: ELECTRICIAN.key }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /select salon prime/i }));
    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/booking/windows/",
        expect.objectContaining({
          body: expect.objectContaining({ group_key: SALON.key }),
        }),
      ),
    );
  });
});

describe("confirming a complete schedule", () => {
  it("keeps Confirm disabled until every visit has a start", async () => {
    renderModal();

    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();

    await chooseSlot("Electrician", /10:00 am/i);
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();

    await chooseSlot("Salon Prime", /2:00 pm/i);
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeEnabled();
  });

  it("hands back one start per visit, keyed by the server's own group key", async () => {
    const props = renderModal();

    await chooseSlot("Electrician", /10:00 am/i);
    await chooseSlot("Salon Prime", /2:00 pm/i);
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    const chosen = vi.mocked(props.onConfirm).mock.calls[0]![0] as ReadonlyMap<string, string>;
    expect(chosen.get("key-electrician")).toBe("2026-08-10T04:30:00Z");
    expect(chosen.get("key-salon")).toBe("2026-08-10T08:30:00Z");
  });

  it("sends back the untouched instant the server published when selecting slot for a single service", async () => {
    const props = renderModal({ groups: [ELECTRICIAN] });

    // Single group opens directly into the time slot picker with Tomorrow preselected
    expect(await screen.findByRole("radio", { name: /10:00 am/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /10:00 am/i }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    const chosen = vi.mocked(props.onConfirm).mock.calls[0]![0] as ReadonlyMap<string, string>;
    expect(chosen.get("key-electrician")).toBe(ELECTRICIAN_WINDOWS.days[0]!.windows[0]!.starts_at);
  });

  it("tells the customer what is still missing", () => {
    renderModal();

    expect(screen.getByText(/pick a time for every visit/i)).toBeInTheDocument();
  });
});

describe("reopening", () => {
  it("shows times already chosen rather than a blank draft", () => {
    renderModal({ value: new Map([["key-electrician", "2026-08-10T04:30:00Z"]]) });

    expect(screen.getByRole("button", { name: /change electrician/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select salon prime/i })).toBeInTheDocument();
  });
});

describe("when start times cannot be loaded", () => {
  it("says nothing has been booked, and offers a retry", async () => {
    client.POST.mockRejectedValue(new Error("network down"));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /select electrician/i }));
    await waitFor(() => expect(screen.getByText(/nothing has been booked/i)).toBeInTheDocument());

    client.POST.mockResolvedValue(ok(ELECTRICIAN_WINDOWS));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /10:00 am/i })).toBeInTheDocument());
  });
});
