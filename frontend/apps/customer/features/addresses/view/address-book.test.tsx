import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { address, noContent, ok, refusal, resolvedLocation } from "../../account/fixtures";

/**
 * The saved address book.
 *
 * The property this file exists for is **deletion is never optimistic**. It is
 * two separate guarantees and both are easy to lose:
 *
 *  - The dialog is the *confirmation*. An address is the only thing in the
 *    account area whose loss cannot be undone from the UI.
 *  - `useArchiveAddress` is the *verification*. `DELETE` answers `204` with no
 *    body, so there is nothing to write into the cache — and the obvious
 *    shortcut, filtering the row out of the cached array, is the client deciding
 *    what the address book now contains. That guess is wrong in a case that
 *    actually happens: archiving the default address makes Django promote
 *    another one. So the mutation resolves only once the refetch has landed, and
 *    the dialog closes on server truth rather than on a request having left the
 *    browser.
 *
 * The other assertions cover the two things a customer loses if they drift: an
 * address without a pin is undispatchable and must say so, and a failed save
 * must keep the draft on screen instead of throwing away what was typed.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { AddressBook } = await import("./address-book");

const LIST_PATH = "/api/v1/addresses/";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * Serves a list that changes as Django's would, one answer per `GET`.
 *
 * Each argument is one whole answer, so `serveList([one], [])` is "the list had
 * one address, then it had none" — which is how the archive path is observed.
 */
function serveList(...answers: ReturnType<typeof address>[][]) {
  let call = 0;
  client.GET.mockImplementation((path: string) => {
    if (path !== LIST_PATH) throw new Error(`Unexpected GET ${path}`);
    const answer = answers[Math.min(call, answers.length - 1)]!;
    call += 1;
    return Promise.resolve(ok(answer));
  });
}

function grantGeolocation(coords = { latitude: 17.456789, longitude: 78.364512 }) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords, timestamp: Date.now() } as unknown as GeolocationPosition),
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

describe("the list", () => {
  it("shows each saved address with the text the server holds", async () => {
    serveList([address({ label: "Home" }), address({ id: "addr-2", label: "Office", is_default: false })]);
    render(<AddressBook />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Office" })).toBeInTheDocument();
    // Two rows, and the dialog's own (closed) form is in the DOM too — a native
    // <dialog> never leaves it — so this counts rather than singles one out.
    expect(screen.getAllByText(/Kondapur/).length).toBeGreaterThanOrEqual(2);
  });

  it("marks the one Django says is the default", async () => {
    serveList([address({ is_default: true }), address({ id: "addr-2", is_default: false })]);
    render(<AddressBook />, { wrapper });

    await screen.findAllByRole("heading", { name: "Home" });
    expect(screen.getAllByText("Default")).toHaveLength(1);
  });

  it("warns that an unpinned address cannot be dispatched to", async () => {
    serveList([address({ latitude: "", longitude: "" })]);
    render(<AddressBook />, { wrapper });

    expect(await screen.findByText(/cannot send anyone to an address without one/i)).toBeInTheDocument();
    expect(screen.getAllByText("Not pinned").length).toBeGreaterThan(0);
  });

  it("offers to add one when there are none, rather than looking broken", async () => {
    serveList([]);
    render(<AddressBook />, { wrapper });

    expect(await screen.findByText(/no saved addresses/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add an address/i })).toBeInTheDocument();
  });

  it("offers a retry when the list could not be read", async () => {
    client.GET.mockResolvedValue(refusal("service_unavailable", 503));
    render(<AddressBook />, { wrapper });

    expect(await screen.findByText(/could not load your addresses/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("deleting is confirmed, then verified", () => {
  it("asks first, and sends nothing until the customer confirms", async () => {
    serveList([address()]);
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(client.DELETE).not.toHaveBeenCalled();
  });

  it("shows which address is about to go, read from memory and not a URL", async () => {
    serveList([address({ label: "Office" })]);
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Office")).toBeInTheDocument();
    expect(within(dialog).getByText(/Kondapur/)).toBeInTheDocument();
  });

  it("keeps the dialog open until Django's own list comes back without the row", async () => {
    // The whole point. If the dialog closed on the 204, a refetch that failed —
    // or one that promoted a different default — would leave the customer with a
    // screen that disagrees with the server.
    serveList([address()]);
    let releaseRefetch!: () => void;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });

    client.DELETE.mockResolvedValue(noContent());
    render(<AddressBook />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    // The refetch is the second GET; hold it open.
    client.GET.mockImplementation(() => refetchGate.then(() => ok([])));
    fireEvent.click(screen.getByRole("button", { name: /delete address/i }));

    await waitFor(() => expect(client.DELETE).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    releaseRefetch();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/no saved addresses/i)).toBeInTheDocument();
  });

  it("leaves the row exactly where it was when the delete is refused", async () => {
    serveList([address({ label: "Home" })]);
    client.DELETE.mockResolvedValue(refusal("address_in_use", 409));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /delete address/i }));

    // Closing here would suggest the address is gone while it is still on the
    // server.
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("announces the label, never the street", async () => {
    // A live region is read out loud. The address should not be announced across
    // the room.
    serveList([address({ label: "Home" })], []);
    client.DELETE.mockResolvedValue(noContent());
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /delete address/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const announcement = document.querySelector('[aria-live="polite"]');
    expect(announcement?.textContent).toBe("Home deleted.");
    expect(announcement?.textContent ?? "").not.toContain("Lotus Residency");
  });

  it("does not filter the cached list itself", async () => {
    // Archiving the default makes Django promote another one, and only Django
    // knows which. A locally filtered list would show an address book with no
    // default until something else forced a read.
    serveList([address({ id: "addr-1", is_default: true })], []);
    client.DELETE.mockResolvedValue(noContent());
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /delete address/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Two reads: the initial list, and the re-read that made the deletion a fact.
    expect(client.GET).toHaveBeenCalledTimes(2);
  });

  it("is never retried automatically", async () => {
    serveList([address()]);
    client.DELETE.mockResolvedValue(refusal("address_in_use", 409));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /delete address/i }));

    await within(screen.getByRole("dialog")).findByRole("alert");
    expect(client.DELETE).toHaveBeenCalledTimes(1);
  });
});

/**
 * The map picker step. Tests run without `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, so the
 * real `LocationPicker` renders its no-map mode: the device fix, the server's
 * reverse geocode and Confirm — the same path the map's own button takes.
 */
async function confirmPin() {
  const confirm = await screen.findByRole("button", { name: /confirm location/i });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}

/** Reverse geocode that echoes the coordinate it was asked about. */
function echoReverseGeocode(path: string, init: { body: { latitude: string; longitude: string } }) {
  return path === "/api/v1/geocoding/reverse/"
    ? Promise.resolve(ok(resolvedLocation({ ...init.body })))
    : undefined;
}

describe("adding an address", () => {
  it("asks for the pin first, because an address cannot be saved without one", async () => {
    serveList([]);
    grantGeolocation();
    client.POST.mockResolvedValue(ok(resolvedLocation(), 200));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /add an address/i }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/geocoding/reverse/", expect.anything()),
    );
    // Six decimal places: the contract's own precision, and no more than a
    // doorway needs.
    expect(client.POST.mock.calls[0]![1].body).toEqual({
      latitude: "17.456789",
      longitude: "78.364512",
    });
    // The fields wait for the Customer to confirm the pin.
    expect(screen.queryByLabelText(/name this address/i)).toBeNull();
  });

  it("says why the address cannot be saved when the pin was refused", async () => {
    serveList([]);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure?: PositionErrorCallback) =>
          failure?.({ code: 1, message: "denied" } as GeolocationPositionError),
      },
    });
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /add an address/i }));

    // Retrying does nothing until a browser setting changes, so the copy has to
    // say that rather than offer a button that was never going to work.
    expect(await screen.findByRole("alert")).toHaveTextContent(/browser settings/i);
    // No pin, so nothing to confirm.
    expect(screen.getByRole("button", { name: /confirm location/i })).toBeDisabled();
  });

  it("fills the fields from the confirmed pin", async () => {
    serveList([]);
    grantGeolocation();
    client.POST.mockResolvedValue(ok(resolvedLocation()));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /add an address/i }));
    expect(await screen.findByText(/Lotus Residency, Kondapur/)).toBeInTheDocument();
    await confirmPin();

    expect(screen.getByLabelText(/area/i, { selector: "input" })).toHaveValue("Kondapur");
    expect(screen.getByText("Pinned on map")).toBeInTheDocument();
  });

  it("keeps the draft on screen when the save is rejected", async () => {
    serveList([]);
    grantGeolocation();
    client.POST.mockImplementation((path: string) =>
      path === "/api/v1/geocoding/reverse/"
        ? Promise.resolve(ok(resolvedLocation()))
        : Promise.resolve(
            refusal("validation_error", 400, { postal_code: [{ message: "Outside our service area.", code: "invalid" }] }),
          ),
    );
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /add an address/i }));
    await confirmPin();
    await screen.findByDisplayValue("Kondapur");

    fireEvent.change(screen.getByLabelText(/name this address/i), { target: { value: "Home" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    expect(await screen.findByText(/outside our service area/i)).toBeInTheDocument();
    // Throwing away what was typed is the one thing a rejected save must not do.
    expect(screen.getByLabelText(/name this address/i)).toHaveValue("Home");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("marks the first address as the default without offering a choice", async () => {
    // A customer with one address has no meaningful default to pick.
    serveList([]);
    grantGeolocation();
    client.POST.mockImplementation((path: string) =>
      path === "/api/v1/geocoding/reverse/"
        ? Promise.resolve(ok(resolvedLocation()))
        : Promise.resolve(ok(address(), 201)),
    );
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /add an address/i }));
    await confirmPin();
    await screen.findByDisplayValue("Kondapur");

    expect(screen.queryByLabelText(/use this address by default/i)).not.toBeInTheDocument();
  });
});

describe("editing an address", () => {
  it("keeps the pin when only the text is corrected", async () => {
    // People fix a flat number far more often than they move house. Discarding
    // the pin on a typo fix would make the address undispatchable.
    serveList([address()]);
    client.PATCH.mockResolvedValue(ok(address({ landmark: "Next to the pharmacy" })));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/landmark/i), {
      target: { value: "Next to the pharmacy" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    const body = client.PATCH.mock.calls[0]![1].body;
    expect(body.landmark).toBe("Next to the pharmacy");
    expect(body).not.toHaveProperty("latitude");
    expect(body).not.toHaveProperty("longitude");
  });

  it("sends the new coordinates when an unpinned address is pinned during an edit", async () => {
    serveList([address({ latitude: "", longitude: "" })]);
    grantGeolocation();
    client.POST.mockResolvedValue(ok(resolvedLocation()));
    client.PATCH.mockResolvedValue(ok(address()));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: /pin my location/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    await confirmPin();
    await screen.findByText("Pinned on map");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toMatchObject({
      latitude: "17.456789",
      longitude: "78.364512",
      source: "REVERSE_GEOCODED",
    });
  });

  it("sends the moved coordinates when an already pinned address is pinned again", async () => {
    // Regression: the edit used to send coordinates only for an address that had
    // none, so moving an existing pin was silently dropped on save.
    serveList([address({ line1: "Flat 7" })]);
    grantGeolocation({ latitude: 17.44, longitude: 78.38 });
    client.POST.mockImplementation(echoReverseGeocode);
    client.PATCH.mockResolvedValue(ok(address()));
    render(<AddressBook />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: /pin again/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    await waitFor(() =>
      expect(client.POST).toHaveBeenLastCalledWith(
        "/api/v1/geocoding/reverse/",
        expect.objectContaining({ body: { latitude: "17.440000", longitude: "78.380000" } }),
      ),
    );
    await confirmPin();

    // A moved pin is no reason to overwrite the flat the Customer typed.
    expect(screen.getByLabelText(/flat, house or building/i)).toHaveValue("Flat 7");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toMatchObject({
      latitude: "17.440000",
      longitude: "78.380000",
      source: "REVERSE_GEOCODED",
    });
  });
});
