import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rental fee was one number that a Save button overwrote: no history, no approval reference,
 * no way to schedule a change. It is now versioned like the crew and project fees.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RentalPlatformFeeForm } = await import("./rental-platform-fee");

const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });

const v1 = {
  id: "v1",
  version: 1,
  percent: 10,
  effective_from: "2026-08-01T00:00:00Z",
  approval_reference: "FIN-03",
  created_by_name: "Ops Person",
  created_at: "2026-08-01T00:00:00Z",
};
const v2 = { ...v1, id: "v2", version: 2, percent: 12, effective_from: "2026-12-01T00:00:00Z", approval_reference: "FIN-14" };

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RentalPlatformFeeForm />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset();
});

describe("versioned rental fee", () => {
  it("shows the fee in force, what is scheduled, and who approved each", async () => {
    client.GET.mockResolvedValue(ok({ percent: 10, current: v1, upcoming: [v2], history: [] }));
    renderForm();

    expect(await screen.findByText("v1 · 10%")).toBeInTheDocument();
    expect(screen.getByText(/Approval FIN-03 · Added by Ops Person/)).toBeInTheDocument();
    expect(screen.getByText("v2 · 12%")).toBeInTheDocument();
  });

  it("needs an approval reference, and adds a version rather than overwriting", async () => {
    client.GET.mockResolvedValue(ok({ percent: 10, current: v1, upcoming: [], history: [] }));
    client.POST.mockResolvedValue(ok({ percent: 12, current: { ...v2, effective_from: v1.effective_from }, upcoming: [], history: [v1] }));
    renderForm();

    fireEvent.change(await screen.findByLabelText(/Percent/), { target: { value: "12" } });
    const review = screen.getByRole("button", { name: "Review change" });
    expect(review).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Approval reference/), { target: { value: "FIN-14" } });
    fireEvent.click(review);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add version" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/ops/rentals/platform-fee", {
        body: { percent: 12, approval_reference: "FIN-14" },
      }),
    );
    expect(client.PUT).not.toHaveBeenCalled();
    expect(await screen.findByText("Earlier versions")).toBeInTheDocument();
  });

  it("withdraws a scheduled version", async () => {
    client.GET.mockResolvedValue(ok({ percent: 10, current: v1, upcoming: [v2], history: [] }));
    client.DELETE.mockResolvedValue(ok({ percent: 10, current: v1, upcoming: [], history: [] }));
    renderForm();

    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    await waitFor(() =>
      expect(client.DELETE).toHaveBeenCalledWith("/api/v1/ops/rentals/platform-fee/{version_id}", {
        params: { path: { version_id: "v2" } },
      }),
    );
    await waitFor(() => expect(screen.queryByText("v2 · 12%")).not.toBeInTheDocument());
  });

  it("says plainly when no fee is set", async () => {
    client.GET.mockResolvedValue(ok({ percent: 0, current: null, upcoming: [], history: [] }));
    renderForm();

    expect(await screen.findByText(/No fee is set, so customers are not charged one/)).toBeInTheDocument();
  });
});
