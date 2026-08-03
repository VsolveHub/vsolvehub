import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { group, refusal, unit, unitLine } from "../fixtures";

/**
 * The Booking Group screen.
 *
 * The assertions below are chosen for what they prevent, not for coverage:
 *
 *  - A partially held group must never read as partial success. Under
 *    `ALL_OR_NOTHING` two of three professionals means nothing is booked, and a
 *    customer who believes otherwise plans their day around visits that may
 *    never happen.
 *  - The recovery action must come from the server. Inferring it from `status`
 *    is a second implementation of a Django rule, and the first disagreement
 *    offers the customer an action that will be refused.
 *  - A cancellation must carry the version on screen, and a refused one must
 *    send the customer back to truth rather than to a retry.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { BookingGroupDetail } = await import("./group-detail");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderDetail() {
  return render(<BookingGroupDetail groupId="group-1" />, { wrapper });
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("every unit is rendered on its own terms", () => {
  it("shows each visit with its own status, timing and lines", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({
              id: "fu-2",
              position: 1,
              status: "MATCHING",
              lines: [unitLine({ id: "ul-2", label: "Geyser repair" })],
            }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Visit 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 2 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Professional held")).toBeInTheDocument();
    expect(screen.getByText("Finding a professional")).toBeInTheDocument();
    expect(screen.getByText("Geyser repair")).toBeInTheDocument();
  });

  it("does not let one failed visit make the others look failed", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "REPLAN_REQUIRED",
          recovery_action: "REPLAN",
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({ id: "fu-2", position: 1, status: "FAILED" }),
          ],
        }),
      ),
    );

    renderDetail();

    const first = (await screen.findByRole("heading", { name: "Visit 1 of 2" })).closest("li")!;
    const second = screen.getByRole("heading", { name: "Visit 2 of 2" }).closest("li")!;

    expect(within(first).getByText("Professional held")).toBeInTheDocument();
    expect(within(second).getByText("No professional found")).toBeInTheDocument();
  });
});

describe("partial holds are pending, never partial success", () => {
  it("says the search is still running", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "PARTIALLY_HELD",
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({ id: "fu-2", position: 1, status: "MATCHING" }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByText(/still finding professionals/i)).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is confirmed until every visit has a professional/i),
    ).toBeInTheDocument();
  });

  it("states the count beside the all-or-nothing rule, never as progress alone", async () => {
    client.GET.mockResolvedValue(
      ok(
        group({
          status: "PARTIALLY_HELD",
          units: [
            unit({ id: "fu-1", position: 0, status: "HELD" }),
            unit({ id: "fu-2", position: 1, status: "MATCHING" }),
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByText(/1 of 2 visits have a professional held/i)).toBeInTheDocument();
    expect(screen.getByText(/booked together or not at all/i)).toBeInTheDocument();
    // And never the words that would imply some of it is done.
    expect(screen.queryByText(/partially confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 of 2 confirmed/i)).not.toBeInTheDocument();
  });
});

describe("recovery is read from the server", () => {
  it("renders the published action rather than one inferred from status", async () => {
    // The pairing is deliberately unusual: a MATCHING group whose server says
    // REPLAN. A client that inferred the action from `status` would show "wait".
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING", recovery_action: "REPLAN" })));

    renderDetail();

    expect(await screen.findByTestId("recovery-action")).toHaveTextContent(
      /choose a new arrangement/i,
    );
    expect(screen.getByRole("link", { name: /choose a new arrangement/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("offers nothing at all when the server says there is nothing to do", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "BOOKED", recovery_action: "NONE" })));

    renderDetail();
    await screen.findByText(/everything is confirmed/i);

    expect(screen.queryByTestId("recovery-action")).not.toBeInTheDocument();
  });

  it("says payment is needed when the server says so", async () => {
    client.GET.mockResolvedValue(
      ok(group({ status: "PAYMENT_PENDING", recovery_action: "PAYMENT_REQUIRED" })),
    );

    renderDetail();
    expect(await screen.findByTestId("recovery-action")).toHaveTextContent(/payment is needed/i);
  });
});

describe("the screen says whether it is up to date", () => {
  it("tells the customer the booking continues without the page", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING" })));

    renderDetail();

    expect(await screen.findByText(/keeps going without it/i)).toBeInTheDocument();
  });

  it("says a finished booking will not change again, rather than implying live updates", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "BOOKED", recovery_action: "NONE" })));

    renderDetail();

    expect(await screen.findByText(/will not change again/i)).toBeInTheDocument();
  });
});

describe("cancelling", () => {
  it("confirms in a labelled dialog before doing anything", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING" })));

    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /cancel this booking/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(/cancel this booking\?/i);
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("sends the version currently on screen", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING", version: 4 })));
    client.POST.mockResolvedValue(ok(group({ status: "CANCELLED", version: 5 })));

    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /cancel this booking/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel this booking/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST.mock.calls[0]![1].body).toEqual({ expected_version: 4 });
  });

  it("explains a version conflict as a change, not as a failure to retry through", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "MATCHING", version: 4 })));
    client.POST.mockResolvedValue(refusal("booking_group_version_conflict"));

    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /cancel this booking/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel this booking/i }));

    await waitFor(() =>
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/changed while you were deciding/i),
    );
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("offers no cancellation once the booking is finished", async () => {
    client.GET.mockResolvedValue(ok(group({ status: "CANCELLED", recovery_action: "NONE" })));

    renderDetail();
    await screen.findByText(/this booking was cancelled/i);

    expect(screen.queryByRole("button", { name: /cancel this booking/i })).not.toBeInTheDocument();
  });
});

describe("failures", () => {
  it("offers a retry when the group cannot be read", async () => {
    // A 404 rather than a 500 on purpose: the hook deliberately *does* retry a
    // 5xx with backoff, so asserting against one would be timing the retry
    // policy instead of the boundary this test is about.
    client.GET.mockResolvedValue(refusal("not_found", 404));

    renderDetail();

    expect(await screen.findByText(/could not load this booking/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(client.GET).toHaveBeenCalledTimes(1);
  });
});
