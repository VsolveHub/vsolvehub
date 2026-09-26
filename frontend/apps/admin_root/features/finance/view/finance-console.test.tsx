import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNIT_ID, ok, refund, refusal } from "@/features/shared/fixtures";

/**
 * The Finance console.
 *
 * Three properties, each guarding a way somebody loses money.
 *
 * **A refund is confirmed before it is sent, and its outcome is never
 * overstated.** `POST /finance/refunds/` answers `202` with a `REQUESTED`
 * refund; nothing has reached the provider. "Refunded" at that moment is how a
 * Customer is told their money is on the way and a second operator issues it
 * again.
 *
 * **The step-up is Django's decision, not a client flag.**
 * `FINANCE_STEP_UP_TTL_SECONDS` is not published in the contract, so this
 * console keeps no "we are stepped up" boolean and counts nothing down. A `403`
 * is read as "confirm again" — the server is asked every time.
 *
 * **A `503` is not a failed refund.** `reconcile_refund` answers `503` when the
 * provider cannot be reached, and the refund is unchanged. Presenting that as an
 * error to retry-by-refunding-again would be the worst possible reading.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RefundConsole } = await import("./refund-console");
const { StepUpGate } = await import("./step-up-gate");

const ORDER_ID = "20202020-2020-4020-8020-202020202020";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function fillRefund() {
  fireEvent.change(screen.getByLabelText(/order id/i), { target: { value: ORDER_ID } });
  fireEvent.change(screen.getByLabelText(/reason code/i), {
    target: { value: "service-not-delivered" },
  });
  fireEvent.change(screen.getByLabelText(/fulfilment unit ids/i), {
    target: { value: UNIT_ID },
  });
}

function requestRefund() {
  fillRefund();
  fireEvent.click(screen.getByRole("button", { name: /review this refund/i }));
  fireEvent.click(screen.getByRole("button", { name: /request this refund/i }));
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

describe("issuing a refund", () => {
  it("sends nothing on the first press, and reads the decision back", () => {
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });
    fillRefund();

    fireEvent.click(screen.getByRole("button", { name: /review this refund/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/sends money back to a Customer/i)).toBeInTheDocument();
    expect(screen.getByText(/no command in this console that takes a refund back/i)).toBeInTheDocument();
  });

  it("sends the Order, the visits and the reason, with an idempotency key", async () => {
    client.POST.mockResolvedValue(ok(refund(), 202));
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/finance/refunds/");
    expect(init.params.header["Idempotency-Key"]).toBeTruthy();
    expect(init.body).toEqual({
      order_id: ORDER_ID,
      fulfilment_unit_ids: [UNIT_ID],
      reason_code: "service-not-delivered",
    });
  });

  it("chooses no amount, because Django works out what is left", () => {
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    // An amount field here would be a client deciding how much of somebody's
    // payment is still refundable.
    expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument();
    expect(screen.getByText(/does not choose an amount/i)).toBeInTheDocument();
  });

  it("refuses to send a malformed refund", () => {
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText(/order id/i), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /review this refund/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/paste the Order id/i)).toBeInTheDocument();
  });

  it("reuses one key for the same Order, visits and reason", async () => {
    client.POST.mockResolvedValue(ok(refund(), 202));
    const view = render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });
    requestRefund();
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));

    // A refresh mid-request. `request_unit_refund` short-circuits on the key
    // itself, so the second call must carry the same one or it creates a second
    // refund.
    view.unmount();
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });
    requestRefund();
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    expect(client.POST.mock.calls[1]![1].params.header["Idempotency-Key"]).toBe(
      client.POST.mock.calls[0]![1].params.header["Idempotency-Key"],
    );
  });

  it("treats the same visits in a different order as the same refund", async () => {
    const other = "21212121-2121-4121-8121-212121212121";
    client.POST.mockResolvedValue(ok(refund(), 202));
    const view = render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText(/order id/i), { target: { value: ORDER_ID } });
    fireEvent.change(screen.getByLabelText(/reason code/i), { target: { value: "goodwill" } });
    fireEvent.change(screen.getByLabelText(/fulfilment unit ids/i), {
      target: { value: `${UNIT_ID}\n${other}` },
    });
    fireEvent.click(screen.getByRole("button", { name: /review this refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /request this refund/i }));
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    view.unmount();

    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/order id/i), { target: { value: ORDER_ID } });
    fireEvent.change(screen.getByLabelText(/reason code/i), { target: { value: "goodwill" } });
    fireEvent.change(screen.getByLabelText(/fulfilment unit ids/i), {
      target: { value: `${other}\n${UNIT_ID}` },
    });
    fireEvent.click(screen.getByRole("button", { name: /review this refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /request this refund/i }));
    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));

    expect(client.POST.mock.calls[1]![1].params.header["Idempotency-Key"]).toBe(
      client.POST.mock.calls[0]![1].params.header["Idempotency-Key"],
    );
  });

  it("is never retried automatically", async () => {
    client.POST.mockResolvedValue(refusal("payment_conflict", 409));
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();
    await screen.findByText(/was not accepted/i);

    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("what the operator is told about the refund afterwards", () => {
  it("does not call a requested refund refunded", async () => {
    client.POST.mockResolvedValue(ok(refund({ status: "REQUESTED" }), 202));
    const { container } = render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();
    await screen.findByText("Requested");

    expect(screen.getByText(/no money has moved/i)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/has been refunded|money is on its way/i);
  });

  it("warns against a second refund while the outcome is unknown", async () => {
    client.POST.mockResolvedValue(ok(refund({ status: "PROCESSING" }), 202));
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();

    expect(await screen.findByText(/do not issue a second refund/i)).toBeInTheDocument();
  });

  it("shows status and reconciliation as two separate facts", async () => {
    // The combination that matters: the money moved and the books do not agree.
    client.POST.mockResolvedValue(
      ok(refund({ status: "SUCCEEDED", reconciliation_state: "NEEDS_ATTENTION" }), 202),
    );
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();

    expect(await screen.findByText("Paid back")).toBeInTheDocument();
    expect(screen.getByText("Does not match the provider")).toBeInTheDocument();
  });

  it("breaks the amount down per visit, as Django allocated it", async () => {
    client.POST.mockResolvedValue(ok(refund(), 202));
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();
    await screen.findByText(/per visit/i);

    expect(screen.getAllByText(/1,500/).length).toBeGreaterThan(0);
  });
});

describe("reconciling", () => {
  it("asks the provider about the refund the console is holding", async () => {
    client.POST.mockResolvedValueOnce(ok(refund(), 202)).mockResolvedValueOnce(
      ok(refund({ status: "SUCCEEDED", reconciliation_state: "IN_SYNC" })),
    );
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();
    fireEvent.click(await screen.findByRole("button", { name: /ask the provider/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(2));
    expect(client.POST.mock.calls[1]![0]).toBe(
      "/api/v1/finance/refunds/{refund_id}/reconcile/",
    );
    expect(client.POST.mock.calls[1]![1].params.path).toEqual({ refund_id: refund().id });
    expect(await screen.findByText("Paid back")).toBeInTheDocument();
  });

  it("says a provider outage left the refund alone, and not to refund again", async () => {
    client.POST.mockResolvedValueOnce(ok(refund(), 202)).mockResolvedValueOnce(
      refusal("payment_provider_unavailable", 503),
    );
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    requestRefund();
    fireEvent.click(await screen.findByRole("button", { name: /ask the provider/i }));

    expect(await screen.findByText(/could not reach the provider/i)).toBeInTheDocument();
    expect(screen.getByText(/do not issue another refund/i)).toBeInTheDocument();
  });

  it("reaches a refund from an earlier session by id, because no lookup exists", async () => {
    client.POST.mockResolvedValue(ok(refund({ status: "SUCCEEDED" })));
    render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    expect(screen.getByText(/no list of refunds and no staff lookup/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/refund id/i), { target: { value: refund().id } });
    fireEvent.click(screen.getByRole("button", { name: /reconcile this refund/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![0]).toBe(
      "/api/v1/finance/refunds/{refund_id}/reconcile/",
    );
  });
});

describe("the step-up", () => {
  it("gates nothing in the browser and counts nothing down", () => {
    // The TTL is unpublished. A countdown here would be a number invented about
    // an authorization decision.
    const { container } = render(<RefundConsole onStepUpRequired={vi.fn()} />, { wrapper });

    expect(screen.getByRole("button", { name: /review this refund/i })).toBeEnabled();
    expect(container.textContent ?? "").not.toMatch(/minutes left|expires in|\d+:\d\d/i);
  });

  it("says the server decides how long it lasts", () => {
    render(<StepUpGate session={null} onSteppedUp={vi.fn()} />, { wrapper });

    expect(screen.getByText(/how long is the server's decision/i)).toBeInTheDocument();
  });

  it("sends the operator back to confirm when a refund is refused for it", async () => {
    const onStepUpRequired = vi.fn();
    client.POST.mockResolvedValue(refusal("permission_denied", 403));
    render(<RefundConsole onStepUpRequired={onStepUpRequired} />, { wrapper });

    requestRefund();

    expect(await screen.findByText(/confirm it is you again/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing was refunded/i)).toBeInTheDocument();
    await waitFor(() => expect(onStepUpRequired).toHaveBeenCalledTimes(1));
    expect(onStepUpRequired.mock.calls[0]![0]).toMatch(/nothing was changed/i);
  });

  it("confirms against the signed-in session, then forgets the code", async () => {
    const onSteppedUp = vi.fn();
    client.POST.mockImplementation((path: string) =>
      path === "/api/v1/auth/otp/request/"
        ? Promise.resolve(
            ok({
              challenge_id: "chal-1",
              code_length: 6,
              expires_in_seconds: 300,
              resend_after_seconds: 30,
              development_code: null,
            }),
          )
        : Promise.resolve(ok({ stepped_up_at: "2026-08-05T12:00:00Z" })),
    );
    render(<StepUpGate session={null} onSteppedUp={onSteppedUp} />, { wrapper });

    fireEvent.change(screen.getByLabelText(/your mobile number/i), {
      target: { value: "9000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me a code/i }));

    const codeField = await screen.findByLabelText(/the code we sent you/i);
    fireEvent.change(codeField, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(onSteppedUp).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[1]![0]).toBe("/api/v1/auth/finance/step-up/");
    expect(client.POST.mock.calls[1]![1].body).toEqual({
      challenge_id: "chal-1",
      phone_number: "9000000001",
      code: "123456",
    });
    // Single-use and now spent: the form is back at the phone step.
    expect(screen.getByLabelText(/your mobile number/i)).toBeInTheDocument();
  });

  it("shows the instant Django stamped, and claims nothing beyond it", () => {
    render(
      <StepUpGate session={{ stepped_up_at: "2026-08-05T12:00:00Z" }} onSteppedUp={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByText(/last confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole("time")).toHaveAttribute("datetime", "2026-08-05T12:00:00Z");
  });

  it("does not say which of a wrong code or a wrong session was refused", async () => {
    // Django does not distinguish them, and neither should the console.
    client.POST.mockImplementation((path: string) =>
      path === "/api/v1/auth/otp/request/"
        ? Promise.resolve(
            ok({
              challenge_id: "chal-1",
              code_length: 6,
              expires_in_seconds: 300,
              resend_after_seconds: 30,
              development_code: null,
            }),
          )
        : Promise.resolve(refusal("invalid_otp", 400)),
    );
    render(<StepUpGate session={null} onSteppedUp={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText(/your mobile number/i), {
      target: { value: "9000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me a code/i }));
    fireEvent.change(await screen.findByLabelText(/the code we sent you/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(await screen.findByText(/not right, or it has expired/i)).toBeInTheDocument();
  });
});
