import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { noContent, ok, refusal } from "../fixtures";

/**
 * Where this account is signed in.
 *
 * Both actions on this screen are a `DELETE` on the same path, and that is
 * exactly why they need separating: "end this session on my phone" and "sign me
 * out right now" are not the same decision. Without the distinction the first
 * person to tidy up their device list ends up logged out with no idea why.
 *
 * `is_current` is read from the server's own flag and never guessed, because it
 * is what decides whether the whole query cache is cleared.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { SessionList } = await import("./session-list");

function session(overrides: Partial<Schemas["UserSession"]> = {}): Schemas["UserSession"] {
  return {
    id: "sess-1",
    device_label: "Pixel 8",
    active_role: "customer",
    created_at: "2026-07-20T09:00:00Z",
    last_seen_at: "2026-08-04T18:00:00Z",
    expires_at: "2026-09-01T09:00:00Z",
    is_current: false,
    ...overrides,
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
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("the current device is set apart", () => {
  it("puts it first, whatever order the server sent", async () => {
    client.GET.mockResolvedValue(
      ok([
        session({ id: "sess-1", device_label: "Pixel 8", is_current: false }),
        session({ id: "sess-2", device_label: "This laptop", is_current: true }),
      ]),
    );
    render(<SessionList />, { wrapper });

    const headings = await screen.findAllByRole("heading");
    expect(headings[0]).toHaveTextContent("This laptop");
  });

  it("names the action for what it is on each row", async () => {
    client.GET.mockResolvedValue(
      ok([session({ id: "sess-1" }), session({ id: "sess-2", is_current: true })]),
    );
    render(<SessionList />, { wrapper });

    expect(await screen.findByRole("button", { name: "Sign out here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
  });

  it("warns that signing out here means logging in again", async () => {
    client.GET.mockResolvedValue(ok([session({ is_current: true })]));
    render(<SessionList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Sign out here" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/signed out here straight away/i)).toBeInTheDocument();
  });

  it("says only that the other device stops, for a session that is not this one", async () => {
    client.GET.mockResolvedValue(ok([session({ is_current: false })]));
    render(<SessionList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "End session" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/that device will be signed out/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/log in again/i)).not.toBeInTheDocument();
  });
});

describe("an unlabelled session is still a real session", () => {
  it("names it honestly rather than hiding the row", async () => {
    client.GET.mockResolvedValue(ok([session({ device_label: null })]));
    render(<SessionList />, { wrapper });

    expect(await screen.findByText("Unrecognised device")).toBeInTheDocument();
  });
});

describe("revoking", () => {
  it("sends nothing until the confirmation is taken", async () => {
    client.GET.mockResolvedValue(ok([session()]));
    render(<SessionList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "End session" }));

    expect(client.DELETE).not.toHaveBeenCalled();
  });

  it("targets the session the row belongs to", async () => {
    client.GET.mockResolvedValue(ok([session({ id: "sess-9" })]));
    client.DELETE.mockResolvedValue(noContent());
    render(<SessionList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "End session" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "End session" }));

    await waitFor(() => expect(client.DELETE).toHaveBeenCalledTimes(1));
    expect(client.DELETE.mock.calls[0]![1].params.path).toEqual({ session_id: "sess-9" });
  });

  it("keeps the dialog open and says why when it fails", async () => {
    // A dialog that closes on failure claims the session ended when it did not.
    client.GET.mockResolvedValue(ok([session()]));
    client.DELETE.mockResolvedValue(refusal("service_unavailable", 503));
    render(<SessionList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "End session" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});
