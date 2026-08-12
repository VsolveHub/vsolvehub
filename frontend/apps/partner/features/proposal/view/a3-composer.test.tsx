import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proposal } from "@/features/enquiry/fixtures";

/**
 * The A3 workforce quote.
 *
 * The flow-weight budget fixes this at one screen — rate per worker per day,
 * minimum days, what is included — and exceeding it is a design regression
 * rather than a detail. The first test is what makes a sixth control fail
 * something rather than pass a review.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { A3Composer } = await import("./a3-composer");
const { A3_COMPOSER_FIELDS } = await import("../model/proposal-draft");

function ok<T>(data: T, status = 201) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function refusal(status: number, code: string, message: string) {
  return { data: undefined, error: { code, message }, response: new Response(null, { status }) };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderComposer(suggestedWorkerCount: number | null = 6, supersedesRevision = 0) {
  const onSubmitted = vi.fn();
  const view = render(
    <A3Composer
      invitationId="11111111-1111-4111-8111-111111111111"
      requirementId="22222222-2222-4222-8222-222222222222"
      suggestedWorkerCount={suggestedWorkerCount}
      supersedesRevision={supersedesRevision}
      onSubmitted={onSubmitted}
    />,
    { wrapper },
  );
  return { ...view, onSubmitted };
}

function fill() {
  fireEvent.change(screen.getByLabelText(/Rate per worker per day/i), {
    target: { value: "900" },
  });
  fireEvent.change(screen.getByLabelText(/Minimum days/i), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText(/What the rate includes/i), {
    target: { value: "Own tools" },
  });
  fireEvent.change(screen.getByLabelText(/^Tax$/i), { target: { value: "INCLUSIVE" } });
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

describe("the one-screen budget", () => {
  it("renders no more inputs than the budget allows", () => {
    const { container } = renderComposer();

    // Every data-entry control on the screen, counted rather than named: the
    // budget is about how much a vendor has to fill in, and a control that
    // slipped in without a label would still cost them time.
    //
    // Five allowed: rate, minimum days, headcount, inclusions, tax basis. The
    // sixth appears only when the vendor picks EXCLUSIVE tax, which is a field
    // the wire forces and the ProposalTerms tests cover.
    const controls = container.querySelectorAll("input, textarea, select");

    expect(A3_COMPOSER_FIELDS).toHaveLength(5);
    expect(controls.length).toBe(A3_COMPOSER_FIELDS.length);
  });

  it("has no total input, because the total is computed", () => {
    renderComposer();
    expect(screen.queryByLabelText(/^Total$/i)).toBeNull();
    expect(screen.queryByLabelText(/Your total/i)).toBeNull();
  });

  it("asks nothing an A5 quote needs", () => {
    renderComposer();
    expect(screen.queryByRole("button", { name: /Add a stage/i })).toBeNull();
    expect(screen.queryByLabelText(/Warranty/i)).toBeNull();
    expect(screen.queryByLabelText(/valid until/i)).toBeNull();
  });
});

describe("headcount", () => {
  it("is prefilled from what the customer asked for", () => {
    // Turns a question into a confirmation, which is what keeps this to one
    // screen. `_assert_a3_shape` requires the field, so it cannot be dropped.
    renderComposer(6);
    expect(screen.getByLabelText(/Workers you can supply/i)).toHaveValue("6");
    expect(screen.getByText(/The customer asked for 6/i)).toBeInTheDocument();
  });

  it("is a real question when the customer did not say", () => {
    renderComposer(null);
    expect(screen.getByLabelText(/Workers you can supply/i)).toHaveValue("");
    expect(screen.getByText(/did not say how many they need/i)).toBeInTheDocument();
  });
});

describe("the total", () => {
  it("is rate times days times headcount, shown without being typed", async () => {
    renderComposer(6);
    fill();

    await waitFor(() => expect(screen.getByText("₹21,600")).toBeInTheDocument());
  });

  it("shows a dash rather than a zero while the inputs are incomplete", () => {
    renderComposer(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("the wage floor", () => {
  it("states the rule without inventing a figure", () => {
    // No endpoint publishes a floor for a state and skill, so any number here
    // would be this client making one up about statutory pay.
    renderComposer();
    expect(screen.getByText(/statutory minimum wage for this state and skill/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot show you that figure here yet/i)).toBeInTheDocument();
  });

  it("puts a below-floor refusal under the rate field", async () => {
    client.POST.mockResolvedValue(
      refusal(400, "m2_proposal_below_wage_floor", "That rate is below the minimum wage."),
    );
    renderComposer(6);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));

    expect(await screen.findByText(/below the minimum wage/i)).toBeInTheDocument();
  });
});

describe("submitting", () => {
  it("does not send an incomplete quote", () => {
    renderComposer(null);
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));
    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter what you charge for one worker/i)).toBeInTheDocument();
  });

  it("sends the computed total and an idempotency key", async () => {
    client.POST.mockResolvedValue(ok(proposal()));
    renderComposer(6);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [path, options] = client.POST.mock.calls[0] as [
      string,
      { params: { header: Record<string, string> }; body: Record<string, unknown> },
    ];
    expect(path).toBe("/api/v1/proposals/");
    expect(options.body.total_paise).toBe(2_160_000);
    expect(options.params.header["Idempotency-Key"]).toBeTruthy();
  });

  it("shows Django's own sentence when the shape is refused", async () => {
    // `m2_proposal_invalid_shape` carries three different causes — a lifecycle
    // mismatch, stage amounts that do not reconcile, and a tax basis another
    // vendor already fixed. The message is the only thing that says which.
    client.POST.mockResolvedValue(
      refusal(400, "m2_proposal_invalid_shape", "Quotes for this request are compared inclusive of tax."),
    );
    renderComposer(6);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Send quote/i }));

    expect(await screen.findByText(/compared inclusive of tax/i)).toBeInTheDocument();
  });

  it("blocks a second submission while the first is in flight", async () => {
    client.POST.mockReturnValue(new Promise(() => {}));
    renderComposer(6);
    fill();

    const send = screen.getByRole("button", { name: /Send quote/i });
    fireEvent.click(send);
    await waitFor(() => expect(send).toBeDisabled());
    fireEvent.click(send);

    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("revising", () => {
  it("says the previous quote is kept rather than overwritten", () => {
    renderComposer(6, 1);
    expect(screen.getByRole("button", { name: /Send a revised quote/i })).toBeInTheDocument();
    expect(screen.getByText(/kept on the record and marked replaced/i)).toBeInTheDocument();
  });
});

describe("what the vendor is told about comparison", () => {
  it("says the customer compares the total as entered", () => {
    // `commission_treatment` has no vocabulary and no M2 policy behind it, so
    // nothing is added or taken off on screen and the screen says so.
    renderComposer();
    expect(screen.getByText(/has not published how its commission is shown/i)).toBeInTheDocument();
  });

  it("warns that another vendor may already have fixed the tax basis", () => {
    // `_required_tax_basis` forces every quote on a requirement onto whichever
    // basis arrived first, and nothing publishes which that is.
    renderComposer();
    expect(screen.getByText(/We cannot see which way that is until you send yours/i)).toBeInTheDocument();
  });
});
