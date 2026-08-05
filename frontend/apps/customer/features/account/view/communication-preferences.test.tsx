import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok, preference, refusal } from "../fixtures";

/**
 * Which messages go to which channel.
 *
 * Two properties, and both are about not lying to somebody about their phone.
 *
 * **The switch is not optimistic.** Showing "Off" before Django has stored it
 * turns a failed request into a promise we did not keep — and the person will
 * only find out when the next message arrives.
 *
 * **The screen renders the server's rows and invents none of its own.**
 * `purpose` is a free `SlugField`, no endpoint publishes the set of purposes,
 * and nothing seeds a row when an account is created. A slug minted in the
 * browser creates a preference under a name the sending code does not look for,
 * so the customer would turn something off, see it saved, and keep receiving it.
 * An empty screen that says so is the honest answer; the fix is a backend one.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { CommunicationPreferences } = await import("./communication-preferences");

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

describe("only what Django holds", () => {
  it("shows nothing at all when the account has no preferences", async () => {
    client.GET.mockResolvedValue(ok([]));
    render(<CommunicationPreferences />, { wrapper });

    expect(await screen.findByText(/no message settings yet/i)).toBeInTheDocument();
    // The tempting fix — a hard-coded list of purposes — would be a switch that
    // lies. There must be no checkbox here.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("still explains that service messages are sent regardless", async () => {
    client.GET.mockResolvedValue(ok([]));
    render(<CommunicationPreferences />, { wrapper });

    expect(await screen.findByText(/part of the service and are always sent/i)).toBeInTheDocument();
  });

  it("renders a purpose it does not recognise rather than hiding it", async () => {
    // A preference the customer holds and this client has no copy for is still
    // theirs to control.
    client.GET.mockResolvedValue(ok([preference({ purpose: "service-updates_v2" })]));
    render(<CommunicationPreferences />, { wrapper });

    expect(await screen.findByRole("checkbox", { name: /Service updates v2 by SMS/i })).toBeInTheDocument();
  });

  it("labels each switch with its channel, because the same purpose has two", async () => {
    client.GET.mockResolvedValue(
      ok([
        preference({ channel: "SMS", purpose: "marketing" }),
        preference({ channel: "EMAIL", purpose: "marketing" }),
      ]),
    );
    render(<CommunicationPreferences />, { wrapper });

    expect(
      await screen.findByRole("checkbox", { name: /Offers and promotions by SMS/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Offers and promotions by Email/i }),
    ).toBeInTheDocument();
  });
});

describe("the switch waits for the server", () => {
  it("does not move until Django's own record comes back", async () => {
    client.GET.mockResolvedValue(ok([preference({ is_enabled: true })]));
    let settle!: (value: unknown) => void;
    client.PUT.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    render(<CommunicationPreferences />, { wrapper });

    const toggle = await screen.findByRole("checkbox");
    fireEvent.click(toggle);

    await waitFor(() => expect(client.PUT).toHaveBeenCalledTimes(1));
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();

    settle(ok(preference({ is_enabled: false })));
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("leaves the switch where it was when the save is refused", async () => {
    client.GET.mockResolvedValue(ok([preference({ is_enabled: true })]));
    client.PUT.mockResolvedValue(refusal("service_unavailable", 503));
    render(<CommunicationPreferences />, { wrapper });

    const toggle = await screen.findByRole("checkbox");
    fireEvent.click(toggle);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it("sends the channel and purpose Django keyed the row by", async () => {
    client.GET.mockResolvedValue(ok([preference({ channel: "EMAIL", purpose: "reminders", is_enabled: true })]));
    client.PUT.mockResolvedValue(ok(preference({ channel: "EMAIL", purpose: "reminders", is_enabled: false })));
    render(<CommunicationPreferences />, { wrapper });

    fireEvent.click(await screen.findByRole("checkbox"));

    await waitFor(() => expect(client.PUT).toHaveBeenCalledTimes(1));
    expect(client.PUT.mock.calls[0]![1].body).toEqual({
      channel: "EMAIL",
      purpose: "reminders",
      is_enabled: false,
    });
  });

  it("marks only the row being saved as pending", async () => {
    client.GET.mockResolvedValue(
      ok([
        preference({ channel: "SMS", purpose: "marketing" }),
        preference({ channel: "EMAIL", purpose: "marketing" }),
      ]),
    );
    client.PUT.mockReturnValue(new Promise(() => {}));
    render(<CommunicationPreferences />, { wrapper });

    const [sms, email] = await screen.findAllByRole("checkbox");
    fireEvent.click(sms!);

    // The mutation is shared, so without a per-row key every switch on the
    // screen would look busy when one of them was pressed.
    await waitFor(() => expect(sms!).toBeDisabled());
    expect(email!).toBeEnabled();
  });

  it("reports the failure against the row it belongs to", async () => {
    client.GET.mockResolvedValue(
      ok([
        preference({ channel: "SMS", purpose: "marketing" }),
        preference({ channel: "EMAIL", purpose: "reminders" }),
      ]),
    );
    client.PUT.mockResolvedValue(refusal("service_unavailable", 503));
    render(<CommunicationPreferences />, { wrapper });

    const [sms] = await screen.findAllByRole("checkbox");
    fireEvent.click(sms!);

    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("when the list cannot be read", () => {
  it("says so and offers a retry rather than an empty screen", async () => {
    // An error rendered as "no settings" would read as "we send you nothing",
    // which is the opposite of the truth.
    client.GET.mockResolvedValue(refusal("service_unavailable", 503));
    render(<CommunicationPreferences />, { wrapper });

    expect(await screen.findByText(/could not load your message settings/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
