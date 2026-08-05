import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok, privacyRequest, refusal } from "../fixtures";

/**
 * Access and erasure requests.
 *
 * **Status is read, never derived.** Django publishes `status` and
 * `completed_at` separately, and rendering one from the other is a second
 * implementation of a rule the server owns. `REJECTED` is exactly the case that
 * breaks it: the request is finished and has no completion, so a screen that
 * inferred "pending" from a null `completed_at` would tell somebody their
 * erasure request is still being worked on when it was refused days ago.
 *
 * **Erasure is confirmed, and the confirmation says what it costs.** Filing one
 * is not itself destructive, but it starts something the customer cannot take
 * back from this screen.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { PrivacyRequests } = await import("./privacy-requests");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

describe("status is Django's word", () => {
  it("shows a rejected request as finished, not as still pending", async () => {
    // The case that breaks any rule derived from `completed_at`: rejected is
    // terminal and has no completion.
    client.GET.mockResolvedValue(
      ok([privacyRequest({ kind: "ERASURE", status: "REJECTED", completed_at: null })]),
    );
    render(<PrivacyRequests />, { wrapper });

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(/could not act on this one/i)).toBeInTheDocument();
    expect(screen.queryByText(/someone is working through it/i)).not.toBeInTheDocument();
  });

  it("renders each status Django publishes with its own meaning", async () => {
    client.GET.mockResolvedValue(
      ok([
        privacyRequest({ id: "pr-1", status: "RECEIVED" }),
        privacyRequest({ id: "pr-2", status: "IN_REVIEW" }),
        privacyRequest({
          id: "pr-3",
          status: "COMPLETED",
          completed_at: "2026-08-01T10:00:00Z",
        }),
      ]),
    );
    render(<PrivacyRequests />, { wrapper });

    expect(await screen.findByText("Received")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("says plainly when nothing has been asked for", async () => {
    client.GET.mockResolvedValue(ok([]));
    render(<PrivacyRequests />, { wrapper });

    expect(await screen.findByText(/have not asked for anything yet/i)).toBeInTheDocument();
  });
});

describe("a second identical request is not offered", () => {
  it("blocks a duplicate while one of the same kind is still open", async () => {
    client.GET.mockResolvedValue(ok([privacyRequest({ kind: "ACCESS", status: "IN_REVIEW" })]));
    render(<PrivacyRequests />, { wrapper });

    // Django does not refuse a duplicate, so this is the client being
    // considerate — and the reason is shown next to the disabled control rather
    // than left as a dead button.
    expect(await screen.findByRole("button", { name: /get a copy of my data/i })).toBeDisabled();
    expect(screen.getByText(/already asked for on/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete my data/i })).toBeEnabled();
  });

  it("allows another once the previous one has finished", async () => {
    client.GET.mockResolvedValue(
      ok([
        privacyRequest({
          kind: "ACCESS",
          status: "COMPLETED",
          completed_at: "2026-08-01T10:00:00Z",
        }),
      ]),
    );
    render(<PrivacyRequests />, { wrapper });

    expect(await screen.findByRole("button", { name: /get a copy of my data/i })).toBeEnabled();
  });

  it("treats a rejected request as finished for this purpose too", async () => {
    client.GET.mockResolvedValue(ok([privacyRequest({ kind: "ERASURE", status: "REJECTED" })]));
    render(<PrivacyRequests />, { wrapper });

    expect(await screen.findByRole("button", { name: /delete my data/i })).toBeEnabled();
  });
});

describe("erasure is confirmed, and the confirmation is honest about it", () => {
  it("sends nothing on the first press", async () => {
    client.GET.mockResolvedValue(ok([]));
    render(<PrivacyRequests />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /delete my data/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says it cannot be cancelled from here, and does not claim to cancel bookings", async () => {
    client.GET.mockResolvedValue(ok([]));
    render(<PrivacyRequests />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /delete my data/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/cannot cancel this from here/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/still going ahead are not cancelled by this/i),
    ).toBeInTheDocument();
  });

  it("does not promise to delete records the law requires us to keep", async () => {
    client.GET.mockResolvedValue(ok([]));
    render(<PrivacyRequests />, { wrapper });

    await screen.findByRole("button", { name: /delete my data/i });
    expect(screen.getByText(/records tax and consumer law require us to hold/i)).toBeInTheDocument();
  });

  it("files the request Django's way and shows the server's own row", async () => {
    client.GET.mockResolvedValue(ok([]));
    client.POST.mockResolvedValue(
      ok(privacyRequest({ id: "pr-new", kind: "ERASURE", status: "RECEIVED" }), 201),
    );
    render(<PrivacyRequests />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /delete my data/i }));
    fireEvent.click(screen.getByRole("button", { name: /request deletion/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![0]).toBe("/api/v1/auth/privacy/requests/");
    expect(client.POST.mock.calls[0]![1].body).toEqual({ kind: "ERASURE" });
    // The id, the timestamp and the opening status are Django's to decide, so
    // the row is the 201 body rather than something assembled from the form.
    expect(await screen.findByText("Received")).toBeInTheDocument();
  });

  it("keeps the dialog open and says why when the request is refused", async () => {
    client.GET.mockResolvedValue(ok([]));
    client.POST.mockResolvedValue(refusal("service_unavailable", 503));
    render(<PrivacyRequests />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /get a copy of my data/i }));
    fireEvent.click(screen.getByRole("button", { name: /request my data/i }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("is never retried automatically", async () => {
    client.GET.mockResolvedValue(ok([]));
    client.POST.mockResolvedValue(refusal("service_unavailable", 503));
    render(<PrivacyRequests />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /get a copy of my data/i }));
    fireEvent.click(screen.getByRole("button", { name: /request my data/i }));

    await within(screen.getByRole("dialog")).findByRole("alert");
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("when the log cannot be read", () => {
  it("says so rather than showing an empty history", async () => {
    client.GET.mockResolvedValue(refusal("service_unavailable", 503));
    render(<PrivacyRequests />, { wrapper });

    expect(await screen.findByText(/could not load your privacy requests/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
