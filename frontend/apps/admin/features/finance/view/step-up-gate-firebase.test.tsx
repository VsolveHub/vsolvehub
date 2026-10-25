import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok, refusal } from "@/features/shared/fixtures";

/**
 * The step-up when Firebase sends the code (contract 1.77.0).
 *
 * Firebase proves the number; Django decides. So the token Firebase hands back
 * is sent to Django once, never kept, and whatever Django answers the form goes
 * back to asking for a new code — the token is spent either way.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
const confirmCode = vi.fn<(code: string) => Promise<string>>();
const startVerification = vi.fn<(phone: string) => Promise<(code: string) => Promise<string>>>();

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("@vsolve/query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vsolve/query")>();
  return {
    ...actual,
    isFirebasePhoneAuth: () => true,
    startFirebasePhoneVerification: startVerification,
  };
});

const { StepUpGate } = await import("./step-up-gate");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function routeStepUp(stepUpResult: unknown) {
  client.POST.mockImplementation((path: string) =>
    Promise.resolve(path === "/api/v1/auth/firebase/precheck/" ? ok(undefined, 204) : stepUpResult),
  );
}

async function sendAndConfirm() {
  fireEvent.change(screen.getByLabelText(/your mobile number/i), {
    target: { value: "9000000001" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send me a code/i }));
  const codeField = await screen.findByLabelText(/the code we sent you/i);
  fireEvent.change(codeField, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
}

describe("StepUpGate with Firebase", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.POST.mockReset();
    confirmCode.mockReset().mockResolvedValue("fresh-id-token");
    startVerification.mockReset().mockResolvedValue(confirmCode);
  });

  it("checks the number with Django first, then exchanges the fresh token once", async () => {
    const onSteppedUp = vi.fn();
    routeStepUp(ok({ stepped_up_at: "2026-10-26T12:00:00Z" }));
    render(<StepUpGate session={null} onSteppedUp={onSteppedUp} />, { wrapper });

    await sendAndConfirm();

    await waitFor(() => expect(onSteppedUp).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]![0]).toBe("/api/v1/auth/firebase/precheck/");
    expect(client.POST.mock.calls[0]![1].body).toEqual({
      phone_number: "+919000000001",
      intended_role: "operations",
    });
    expect(startVerification).toHaveBeenCalledWith("9000000001");
    expect(confirmCode).toHaveBeenCalledWith("123456");
    expect(client.POST.mock.calls[1]![0]).toBe("/api/v1/auth/firebase/step-up/");
    expect(client.POST.mock.calls[1]![1].body).toEqual({ id_token: "fresh-id-token" });
    // Spent: back at the phone step.
    expect(screen.getByLabelText(/your mobile number/i)).toBeInTheDocument();
  });

  it("sends no SMS to a number without Operations access", async () => {
    client.POST.mockResolvedValue(refusal("no_account_for_role", 404));
    render(<StepUpGate session={null} onSteppedUp={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText(/your mobile number/i), {
      target: { value: "9000000002" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me a code/i }));

    expect(await screen.findByText(/no operations access/i)).toBeInTheDocument();
    expect(startVerification).not.toHaveBeenCalled();
  });

  it("says plainly when the number is not the signed-in operator's", async () => {
    const onSteppedUp = vi.fn();
    routeStepUp(refusal("permission_denied", 403));
    render(<StepUpGate session={null} onSteppedUp={onSteppedUp} />, { wrapper });

    await sendAndConfirm();

    expect(await screen.findByText(/that is not your number/i)).toBeInTheDocument();
    expect(onSteppedUp).not.toHaveBeenCalled();
    // The token is spent, so a new code is needed.
    expect(screen.getByLabelText(/your mobile number/i)).toBeInTheDocument();
  });

  it("keeps the operator on the code step when Firebase rejects the code", async () => {
    confirmCode.mockRejectedValue({ code: "auth/invalid-verification-code" });
    render(<StepUpGate session={null} onSteppedUp={vi.fn()} />, { wrapper });
    routeStepUp(ok({ stepped_up_at: "2026-10-26T12:00:00Z" }));

    await sendAndConfirm();

    expect(await screen.findByText(/incorrect otp/i)).toBeInTheDocument();
    expect(client.POST).toHaveBeenCalledTimes(1); // the precheck only
  });
});
