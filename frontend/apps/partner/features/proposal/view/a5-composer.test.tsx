import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proposal } from "@/features/enquiry/fixtures";

/**
 * The A5 project quote.
 *
 * Longer than the A3 composer on purpose — the flow-weight budget names the A3
 * response as one screen and nothing else — but bounded by the same rule: it
 * collects only fields the wire carries, because a DRF serializer silently drops
 * an unknown key and a control whose input is discarded is worse than no control.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { A5Composer } = await import("./a5-composer");

function ok<T>(data: T, status = 201) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderComposer(supersedesRevision = 0) {
  const onSubmitted = vi.fn();
  const view = render(
    <A5Composer
      invitationId="11111111-1111-4111-8111-111111111111"
      requirementId="22222222-2222-4222-8222-222222222222"
      supersedesRevision={supersedesRevision}
      onSubmitted={onSubmitted}
    />,
    { wrapper },
  );
  return { ...view, onSubmitted };
}

function fillStage(index: number, name: string, amount: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(`Stage ${index + 1} name`, "i")), {
    target: { value: name },
  });
  const amounts = screen.getAllByLabelText(/Amount for this stage/i);
  fireEvent.change(amounts[index]!, { target: { value: amount } });
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

describe("stages", () => {
  it("starts with one and can add more", () => {
    renderComposer();
    expect(screen.getAllByLabelText(/Amount for this stage/i)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Add a stage/i }));
    expect(screen.getAllByLabelText(/Amount for this stage/i)).toHaveLength(2);
  });

  it("cannot remove the only stage", () => {
    // `_assert_a5_shape`: "A project quote needs at least one stage."
    renderComposer();
    expect(screen.queryByRole("button", { name: /Remove stage 1/i })).toBeNull();
  });

  it("can remove an added one", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /Add a stage/i }));
    fireEvent.click(screen.getByRole("button", { name: /Remove stage 2/i }));
    expect(screen.getAllByLabelText(/Amount for this stage/i)).toHaveLength(1);
  });

  it("adds the stage amounts into the total the customer compares", async () => {
    renderComposer();
    fillStage(0, "Preparation", "5000");
    fireEvent.click(screen.getByRole("button", { name: /Add a stage/i }));
    fillStage(1, "Build", "15000");

    await waitFor(() => expect(screen.getByText("₹20,000")).toBeInTheDocument());
  });
});

describe("what this composer does not ask for", () => {
  it("has no assumptions field, because the wire drops one", () => {
    // `ProposalCreateRequest` carries inclusions, exclusions, warranty and
    // validity — and nothing for assumptions. DRF silently ignores unknown
    // keys, so a field here would take a vendor's caveats and discard them
    // without an error.
    renderComposer();
    expect(screen.queryByLabelText(/assumption/i)).toBeNull();
  });

  it("does not relabel exclusions to stand in for assumptions", () => {
    // "Not included" and "assumed true" are different promises, and a customer
    // reads them differently in a dispute.
    renderComposer();
    const exclusions = screen.getByLabelText(/What it does not include/i);
    expect(exclusions).toBeInTheDocument();
    expect(screen.queryByText(/assum/i)).toBeNull();
  });

  it("has no total input", () => {
    renderComposer();
    expect(screen.queryByLabelText(/^Total$/i)).toBeNull();
  });
});

describe("submitting", () => {
  it("refuses a stage with no amount", () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText(/Stage 1 name/i), { target: { value: "Prep" } });
    fireEvent.change(screen.getByLabelText(/^Tax$/i), { target: { value: "INCLUSIVE" } });
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/add up to your total/i)).toBeInTheDocument();
  });

  it("sends stages whose amounts reconcile with the total", async () => {
    client.POST.mockResolvedValue(ok(proposal({ stages: [], total_paise: 2_000_000 })));
    renderComposer();
    fillStage(0, "Preparation", "5000");
    fireEvent.click(screen.getByRole("button", { name: /Add a stage/i }));
    fillStage(1, "Build", "15000");
    fireEvent.change(screen.getByLabelText(/^Tax$/i), { target: { value: "INCLUSIVE" } });
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [, options] = client.POST.mock.calls[0] as [
      string,
      { body: { total_paise: number; stages: { amount_paise: number }[] } },
    ];
    const summed = options.body.stages.reduce((total, stage) => total + stage.amount_paise, 0);
    expect(summed).toBe(options.body.total_paise);
    expect(summed).toBe(2_000_000);
  });

  it("sets a validity date to the end of that day", async () => {
    // Midnight would expire a quote "valid until the 20th" a day early.
    client.POST.mockResolvedValue(ok(proposal()));
    renderComposer();
    fillStage(0, "Preparation", "5000");
    fireEvent.change(screen.getByLabelText(/^Tax$/i), { target: { value: "INCLUSIVE" } });
    fireEvent.change(screen.getByLabelText(/Quote valid until/i), {
      target: { value: "2026-08-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [, options] = client.POST.mock.calls[0] as [string, { body: { valid_until: string } }];
    expect(new Date(options.body.valid_until).getHours()).toBe(23);
  });
});
