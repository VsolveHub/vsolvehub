import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { availabilityException, availabilityRule, ok, refusal } from "@/features/shared/fixtures";

/**
 * Rewriting a Partner's working week from Operations.
 *
 * The single most damaging thing this console can do, and the easiest to do by
 * accident: the editor opens empty because no Operations read of a Partner's
 * schedule is published, and saving replaces everything. So the assertions are
 * about the guard rails rather than the form —
 *
 *  - the replace is stated before anything is typed, not discovered afterwards;
 *  - an untouched form cannot become a save in one press;
 *  - clearing the week gets its own wording and its own destructive button;
 *  - a day switched from "working" to "not working" does not carry its old
 *    hours into the request.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { AvailabilityEditor } = await import("./availability-editor");

const PARTNER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AREA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * A required field's accessible label.
 *
 * `Field` renders the label, a decorative asterisk and an `sr-only` "(required)",
 * so the accessible name is `Starts* (required)`. Anchoring on the asterisk
 * keeps `Ends` from also matching the "Ends the next day" checkbox beside it.
 */
function required(label: string) {
  return new RegExp(`^${label}\\*`, "i");
}

function fillIdentity() {
  fireEvent.change(screen.getByLabelText(/partner id/i), { target: { value: PARTNER_ID } });
  fireEvent.change(screen.getByLabelText(/consent purpose/i), {
    target: { value: "schedule-change" },
  });
  fireEvent.change(screen.getByLabelText(/consent version/i), { target: { value: "2026-07" } });
}

function addWindow() {
  fireEvent.click(screen.getByRole("button", { name: /add a window/i }));
  fireEvent.change(screen.getAllByLabelText(/service area id/i)[0]!, {
    target: { value: AREA_ID },
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

describe("what the console cannot see, it says", () => {
  it("states the replace before anything is typed", () => {
    render(<AvailabilityEditor />, { wrapper });

    expect(
      screen.getByRole("heading", { name: /replaces the Partner's whole week/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot read their current schedule/i)).toBeInTheDocument();
  });

  it("does not present the empty form as the Partner's current hours", () => {
    render(<AvailabilityEditor />, { wrapper });

    expect(screen.getByText(/no windows yet/i)).toBeInTheDocument();
    expect(screen.getByText(/receives no offers/i)).toBeInTheDocument();
  });

  it("reads nothing on mount, because no such read is published", () => {
    render(<AvailabilityEditor />, { wrapper });

    expect(client.GET).not.toHaveBeenCalled();
  });
});

describe("saving is two presses, and the second one reads back the week", () => {
  it("sends nothing on the first press", () => {
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();

    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));

    expect(client.PUT).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /confirm the week/i })).toBeInTheDocument();
  });

  it("will not reach the confirmation with a broken window", () => {
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();
    fireEvent.change(screen.getAllByLabelText(required("Ends"))[0]!, { target: { value: "08:00" } });

    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/ends before it starts/i);
    expect(screen.queryByRole("button", { name: /^replace the schedule$/i })).not.toBeInTheDocument();
  });

  it("sends the week as entered, with the consent that permits it", async () => {
    client.PUT.mockResolvedValue(ok({ rules: [availabilityRule()], exceptions: [] }));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();

    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    fireEvent.click(screen.getByRole("button", { name: /^replace the schedule$/i }));

    await waitFor(() => expect(client.PUT).toHaveBeenCalledTimes(1));
    const [path, init] = client.PUT.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/partners/{partner_id}/availability/");
    expect(init.params.path).toEqual({ partner_id: PARTNER_ID });
    expect(init.body).toEqual({
      consent_purpose: "schedule-change",
      consent_document_version: "2026-07",
      rules: [
        {
          service_area_id: AREA_ID,
          weekday: 0,
          starts_at: "09:00",
          ends_at: "17:00",
          ends_next_day: false,
        },
      ],
      exceptions: [],
    });
  });

  it("drops the confirmation when the draft is edited underneath it", () => {
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();
    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));

    fireEvent.change(screen.getAllByLabelText(required("Starts"))[0]!, { target: { value: "07:00" } });

    // The read-back described the old week. Confirming against it would save a
    // week nobody read.
    expect(screen.queryByRole("button", { name: /^replace the schedule$/i })).not.toBeInTheDocument();
  });
});

describe("clearing the week", () => {
  it("gets its own wording rather than the ordinary confirmation", () => {
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();

    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));

    expect(
      screen.getByRole("heading", { name: /clears the Partner's schedule/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no working hours at all/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear this Partner's schedule/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^replace the schedule$/i })).not.toBeInTheDocument();
  });

  it("still takes a deliberate second press", async () => {
    client.PUT.mockResolvedValue(ok({ rules: [], exceptions: [] }));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();

    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    expect(client.PUT).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /clear this Partner's schedule/i }));
    await waitFor(() => expect(client.PUT).toHaveBeenCalledTimes(1));
    expect(client.PUT.mock.calls[0]![1].body.rules).toEqual([]);
  });

  it("says afterwards that the Partner will receive no offers", async () => {
    client.PUT.mockResolvedValue(ok({ rules: [], exceptions: [] }));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear this Partner's schedule/i }));

    expect(await screen.findByText(/no working hours\./i)).toBeInTheDocument();
    expect(screen.getByText(/until hours are added back/i)).toBeInTheDocument();
  });
});

describe("a day off carries no hours", () => {
  it("does not send the leftovers of a row switched away from working", async () => {
    client.PUT.mockResolvedValue(ok({ rules: [], exceptions: [availabilityException()] }));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();

    fireEvent.click(screen.getByRole("button", { name: /add an exception/i }));
    fireEvent.change(screen.getByLabelText(/service area id/i), { target: { value: AREA_ID } });
    fireEvent.change(screen.getByLabelText(required("Date")), { target: { value: "2026-09-10" } });

    // Switch to "working", set hours, then switch back. The hours must not
    // survive: publishing times the operator had already decided against is how
    // a day off becomes a shift.
    fireEvent.change(screen.getByLabelText(/that day/i), { target: { value: "working" } });
    fireEvent.change(screen.getByLabelText(required("Starts")), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText(/that day/i), { target: { value: "off" } });

    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    fireEvent.click(screen.getByRole("button", { name: /^replace the schedule$/i }));

    await waitFor(() => expect(client.PUT).toHaveBeenCalledTimes(1));
    expect(client.PUT.mock.calls[0]![1].body.exceptions).toEqual([
      {
        service_area_id: AREA_ID,
        date: "2026-09-10",
        is_available: false,
        starts_at: null,
        ends_at: null,
        ends_next_day: false,
        reason: "",
      },
    ]);
  });
});

describe("refusals leave the week alone, and say so", () => {
  it("reports an unknown Partner without claiming a change", async () => {
    client.PUT.mockResolvedValue(refusal("not_found", 404));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();
    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    fireEvent.click(screen.getByRole("button", { name: /^replace the schedule$/i }));

    expect(await screen.findByText(/could not find that Partner/i)).toBeInTheDocument();
    expect(screen.getByText(/their schedule is unchanged/i)).toBeInTheDocument();
  });

  it("shows Django's own sentence when the schedule itself was refused", async () => {
    // A missing consent receipt, an offboarded Partner and an area the Partner
    // does not hold all arrive here, and Django's message is specific enough to
    // act on — replacing it with a guess would lose the only useful detail.
    client.PUT.mockResolvedValue(refusal("partner_schedule_invalid", 400));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();
    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    fireEvent.click(screen.getByRole("button", { name: /^replace the schedule$/i }));

    expect(await screen.findByText(/was not accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/Refused\./)).toBeInTheDocument();
  });

  it("is never retried automatically", async () => {
    client.PUT.mockResolvedValue(refusal("partner_schedule_invalid", 400));
    render(<AvailabilityEditor />, { wrapper });
    fillIdentity();
    addWindow();
    fireEvent.click(screen.getByRole("button", { name: /review this schedule/i }));
    fireEvent.click(screen.getByRole("button", { name: /^replace the schedule$/i }));
    await screen.findByText(/was not accepted/i);

    // An automatic second attempt could overwrite a change somebody else made
    // in between.
    expect(client.PUT).toHaveBeenCalledTimes(1);
  });
});
