import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UNIT_ID,
  attempt,
  dispatchReservation,
  explanation,
  ok,
  offer,
  refusal,
  unitDispatch,
} from "@/features/shared/fixtures";

/**
 * Dispatch recovery — read the decision, then correct it.
 *
 * These four endpoints were published by BE-07 and had no caller at all, so the
 * tests are written against the properties that make a caller safe rather than
 * against the layout:
 *
 *  - **No command is offered without a version to guard it.** The version comes
 *    from the explanation and nowhere else; a console that let an operator
 *    revoke before reading would be asking them to guess the guard.
 *  - **The version is sent as read.** Not typed, and never re-sent with the
 *    number a `409` quoted back — that would automate around the guard.
 *  - **The explanation is re-read after every outcome, including refusals.** A
 *    refusal is precisely when the console's copy is known to be wrong.
 *  - **The ranking is reported, not interpreted.** `ranking.py` still orders by
 *    Partner UUID, so nothing on screen may call the order a quality judgement.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { DispatchExplanation } = await import("./dispatch-explanation");
const { DispatchCommands } = await import("./dispatch-commands");

const OFFER_ID = "18181818-1818-4818-8818-181818181818";
const RESERVATION_ID = "17171717-1717-4717-8717-171717171717";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The page's own wiring: the explanation supplies the version the commands use. */
function Surface({ unitId = UNIT_ID as string | null }: { unitId?: string | null }) {
  return (
    <>
      <DispatchExplanation unitId={unitId} />
      <Wired unitId={unitId} />
    </>
  );
}

function Wired({ unitId }: { unitId: string | null }) {
  const { useDispatchExplanation } = wired;
  const query = useDispatchExplanation(unitId);
  return <DispatchCommands unitId={unitId} unitVersion={query.data?.unit_version ?? null} />;
}

const wired = await import("../queries");

function chooseAndFill(
  command: RegExp,
  options: { targetId?: string; reason?: string } = {},
) {
  fireEvent.click(screen.getByRole("button", { name: command }));
  if (options.targetId !== undefined) {
    fireEvent.change(screen.getByLabelText(/offer id|reservation id/i), {
      target: { value: options.targetId },
    });
  }
  fireEvent.change(screen.getByLabelText(/^Why\*/), {
    target: { value: options.reason ?? "PARTNER_UNREACHABLE" },
  });
  fireEvent.click(screen.getByRole("button", { name: /review this command/i }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  client.GET.mockResolvedValue(ok(explanation()));
});

afterEach(() => {
  queryClient.clear();
});

describe("the explanation", () => {
  it("shows the version every command below is guarded on", async () => {
    render(<DispatchExplanation unitId={UNIT_ID} />, { wrapper });

    expect(await screen.findByText(/Version/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("prints the ranking policy and does not call the order a judgement", async () => {
    const { container } = render(<DispatchExplanation unitId={UNIT_ID} />, { wrapper });
    await screen.findByText(/partner_uuid_order/);

    const text = container.textContent ?? "";
    expect(text).toMatch(/record of what happened, not a ranking of who was best/i);
    expect(text).not.toMatch(/best match|top candidate|highest score/i);
  });

  it("says when no ranking snapshot was recorded, rather than 'no candidates'", async () => {
    client.GET.mockResolvedValue(
      ok(explanation({ attempts: [attempt({ ranked: [], excluded: [] })] })),
    );
    render(<DispatchExplanation unitId={UNIT_ID} />, { wrapper });

    expect(await screen.findByText(/no ranking snapshot was recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/not a dispatch that found nobody/i)).toBeInTheDocument();
  });

  it("masks Partner ids rather than printing them in full", async () => {
    const { container } = render(<DispatchExplanation unitId={UNIT_ID} />, { wrapper });
    await screen.findByText(/partner_uuid_order/);

    expect(container.textContent ?? "").not.toContain(attempt().partner_id);
    expect(screen.getAllByText(`…${attempt().partner_id.slice(-12)}`).length).toBeGreaterThan(0);
  });

  it("says a visit with no attempts has not been offered to anyone", async () => {
    client.GET.mockResolvedValue(ok(explanation({ attempts: [] })));
    render(<DispatchExplanation unitId={UNIT_ID} />, { wrapper });

    expect(await screen.findByText(/has not offered this visit to anyone yet/i)).toBeInTheDocument();
  });

  it("reads nothing until a visit id is given", () => {
    render(<DispatchExplanation unitId={null} />, { wrapper });

    expect(client.GET).not.toHaveBeenCalled();
    expect(screen.getByText(/paste a fulfilment unit id/i)).toBeInTheDocument();
  });
});

describe("no command is offered without a version", () => {
  it("withholds all three until a visit has been read", () => {
    render(<DispatchCommands unitId={null} unitVersion={null} />, { wrapper });

    expect(screen.queryByRole("button", { name: /revoke this offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /release this reservation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run recovery/i })).not.toBeInTheDocument();
    expect(screen.getByText(/load a visit first/i)).toBeInTheDocument();
  });

  it("offers them once the explanation has landed", async () => {
    render(<Surface />, { wrapper });

    expect(await screen.findByRole("button", { name: /revoke this offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /release this reservation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run recovery on this visit/i })).toBeInTheDocument();
  });
});

describe("sending a command", () => {
  it("sends the version as read, with the reason and the idempotency key", async () => {
    client.POST.mockResolvedValue(ok(offer({ status: "REVOKED" })));
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });

    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(
      screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!,
    );

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/offers/{offer_id}/revoke/");
    expect(init.params.path).toEqual({ offer_id: OFFER_ID });
    expect(init.params.header["Idempotency-Key"]).toBeTruthy();
    expect(init.body).toEqual({
      expected_unit_version: 4,
      reason: "PARTNER_UNREACHABLE",
      note: "",
    });
  });

  it("addresses recovery at the visit already on screen, with nothing to paste", async () => {
    client.POST.mockResolvedValue(ok(unitDispatch()));
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /run recovery on this visit/i });

    fireEvent.click(screen.getByRole("button", { name: /run recovery on this visit/i }));
    expect(screen.queryByLabelText(/fulfilment unit id/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Why\*/), { target: { value: "STUCK_DISPATCH" } });
    fireEvent.click(screen.getByRole("button", { name: /review this command/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /run recovery on this visit/i }).at(-1)!);

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![1].params.path).toEqual({ unit_id: UNIT_ID });
  });

  it("releases a reservation by the id the operator pasted", async () => {
    client.POST.mockResolvedValue(ok(dispatchReservation()));
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /release this reservation/i });

    chooseAndFill(/release this reservation/i, { targetId: RESERVATION_ID });
    fireEvent.click(
      screen.getAllByRole("button", { name: /release this reservation/i }).at(-1)!,
    );

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![0]).toBe(
      "/api/v1/operations/reservations/{reservation_id}/release/",
    );
    expect(client.POST.mock.calls[0]![1].params.path).toEqual({
      reservation_id: RESERVATION_ID,
    });
  });

  it("sends nothing on the first press, and reads the cost back", async () => {
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /release this reservation/i });

    chooseAndFill(/release this reservation/i, { targetId: RESERVATION_ID });

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/no command that undoes this/i)).toBeInTheDocument();
    // The damage that reaches visits the operator was not looking at.
    expect(screen.getAllByText(/whole Booking Group is unwound/i).length).toBeGreaterThan(0);
  });

  it("refuses to send without a reason, because the reason is the audit", async () => {
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });

    fireEvent.click(screen.getByRole("button", { name: /revoke this offer/i }));
    fireEvent.change(screen.getByLabelText(/offer id/i), { target: { value: OFFER_ID } });
    fireEvent.click(screen.getByRole("button", { name: /review this command/i }));

    expect(screen.getByText(/choose why you are doing this/i)).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("drops the confirmation when the command is edited underneath it", async () => {
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });

    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.change(screen.getByLabelText(/offer id/i), {
      target: { value: "19191919-1919-4919-8919-191919191919" },
    });

    // The read-back described the previous offer. Confirming against it would
    // pull the wrong Partner off a job.
    expect(screen.queryByText(/no command that undoes this/i)).not.toBeInTheDocument();
  });
});

describe("one key per decision", () => {
  it("reuses the key when the same command is sent again for the same version", async () => {
    client.POST.mockResolvedValue(ok(offer({ status: "REVOKED" })));
    const view = render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });

    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!);
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));

    // A refresh mid-request: the operator comes back and sends it again. Django
    // must replay rather than revoke a second offer.
    view.unmount();
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });
    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!);
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    expect(client.POST.mock.calls[1]![1].params.header["Idempotency-Key"]).toBe(
      client.POST.mock.calls[0]![1].params.header["Idempotency-Key"],
    );
  });

  it("mints a different key once the visit has moved to a new version", async () => {
    client.POST.mockResolvedValue(ok(offer({ status: "REVOKED" })));
    const view = render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });
    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!);
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    view.unmount();

    // A decision about a different state is a different decision.
    client.GET.mockResolvedValue(ok(explanation({ unit_version: 5 })));
    queryClient.clear();
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });
    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!);
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    expect(client.POST.mock.calls[1]![1].body.expected_unit_version).toBe(5);
    expect(client.POST.mock.calls[1]![1].params.header["Idempotency-Key"]).not.toBe(
      client.POST.mock.calls[0]![1].params.header["Idempotency-Key"],
    );
  });
});

describe("refusals", () => {
  it("re-reads the visit after a version conflict instead of resending", async () => {
    client.POST.mockResolvedValue(
      refusal("dispatch_version_conflict", 409, { current_version: 7 }),
    );
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });
    const readsBefore = client.GET.mock.calls.length;

    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!);

    expect(await screen.findByText(/changed while you were reading it/i)).toBeInTheDocument();
    expect(screen.getByText(/version 7/)).toBeInTheDocument();
    // One attempt only, and a fresh read of the truth.
    expect(client.POST).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(client.GET.mock.calls.length).toBeGreaterThan(readsBefore));
  });

  it("shows Django's own sentence when the command no longer applies", async () => {
    client.POST.mockResolvedValue(refusal("dispatch_command_invalid", 400));
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /revoke this offer/i });

    chooseAndFill(/revoke this offer/i, { targetId: OFFER_ID });
    fireEvent.click(screen.getAllByRole("button", { name: /revoke this offer/i }).at(-1)!);

    expect(await screen.findByText(/no longer applies/i)).toBeInTheDocument();
    expect(screen.getByText(/Refused\./)).toBeInTheDocument();
  });

  it("tells the operator to wait while an identical command is running", async () => {
    client.POST.mockResolvedValue(refusal("idempotency_in_progress", 409));
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /run recovery on this visit/i });

    fireEvent.click(screen.getByRole("button", { name: /run recovery on this visit/i }));
    fireEvent.change(screen.getByLabelText(/^Why\*/), { target: { value: "STUCK_DISPATCH" } });
    fireEvent.click(screen.getByRole("button", { name: /review this command/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /run recovery on this visit/i }).at(-1)!);

    expect(await screen.findByText(/still being processed/i)).toBeInTheDocument();
    expect(screen.getByText(/do not send a second one/i)).toBeInTheDocument();
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("after a command lands", () => {
  it("shows where the visit now stands and re-reads the explanation", async () => {
    client.POST.mockResolvedValue(ok(unitDispatch({ version: 5, live_offer_id: OFFER_ID })));
    render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /run recovery on this visit/i });
    const readsBefore = client.GET.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /run recovery on this visit/i }));
    fireEvent.change(screen.getByLabelText(/^Why\*/), { target: { value: "STUCK_DISPATCH" } });
    fireEvent.click(screen.getByRole("button", { name: /review this command/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /run recovery on this visit/i }).at(-1)!);

    expect(await screen.findByText(/this is where it stands now/i)).toBeInTheDocument();
    expect(screen.getByText(/re-read the visit above to see whether anything moved/i)).toBeInTheDocument();
    // The live offer id is the one thing a revoke needs and cannot look up.
    expect(screen.getByText(new RegExp(OFFER_ID))).toBeInTheDocument();
    await waitFor(() => expect(client.GET.mock.calls.length).toBeGreaterThan(readsBefore));
  });

  it("does not claim whether the command ran or was replayed", async () => {
    // `CORS_EXPOSE_HEADERS` publishes `Date` alone, so `Idempotent-Replay` reads
    // null in a browser on this origin. Asserting either way would be a
    // fabricated claim about a Partner losing a job.
    client.POST.mockResolvedValue(ok(unitDispatch()));
    const { container } = render(<Surface />, { wrapper });
    await screen.findByRole("button", { name: /run recovery on this visit/i });

    fireEvent.click(screen.getByRole("button", { name: /run recovery on this visit/i }));
    fireEvent.change(screen.getByLabelText(/^Why\*/), { target: { value: "STUCK_DISPATCH" } });
    fireEvent.click(screen.getByRole("button", { name: /review this command/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /run recovery on this visit/i }).at(-1)!);
    await screen.findByText(/this is where it stands now/i);

    expect(container.textContent ?? "").not.toMatch(/replay|already ran|newly/i);
  });
});
