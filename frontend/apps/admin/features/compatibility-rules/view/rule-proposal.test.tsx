import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPERATOR_ID, PROPOSER_ID, conflict, ok, rule, sessionState } from "@/features/shared/fixtures";

/**
 * The maker half of maker-checker: proposing a rule, and finding it in the queue.
 *
 * `rule-detail` already proves the proposer is not offered the decision. These
 * two cover the half either side of it, and the property that ties them
 * together: **a proposer must learn it is their own draft before they open it.**
 * The badge on the row is not decoration — a reviewer who opens a rule, hunts
 * for an Approve button that was never rendered, and finds nothing is a reviewer
 * learning that the console is broken.
 *
 * The proposal form's own job is to not read as a decision. It saves a draft
 * that governs nothing until somebody else acts, and it has to say so before the
 * operator presses the button, not after.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { ProposeRule } = await import("./propose-rule");
const { RuleQueue } = await import("./rule-queue");

const LEFT = "44444444-4444-4444-8444-444444444444";
const RIGHT = "55555555-5555-4555-8555-555555555555";
const SESSION_PATH = "/api/v1/auth/session/";
const RULES_PATH = "/api/v1/operations/compatibility-rules/";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function page(results: ReturnType<typeof rule>[]) {
  return { count: results.length, next: null, previous: null, results };
}

function serve(results: ReturnType<typeof rule>[] = []) {
  client.GET.mockImplementation((path: string) => {
    if (path === SESSION_PATH) return Promise.resolve(ok(sessionState()));
    if (path === RULES_PATH) return Promise.resolve(ok(page(results)));
    throw new Error(`Unexpected GET ${path}`);
  });
}

function fillDraft() {
  fireEvent.change(screen.getByLabelText(/first service variant/i), {
    target: { value: LEFT },
  });
  fireEvent.change(screen.getByLabelText(/second service variant/i), {
    target: { value: RIGHT },
  });
  fireEvent.change(screen.getByLabelText(/how they may be booked together/i), {
    target: { value: "SAME_PARTNER_SEQUENTIAL" },
  });
  fireEvent.change(screen.getByLabelText(/starts applying/i), {
    target: { value: "2026-09-01T00:00" },
  });
  fireEvent.change(screen.getByLabelText(/why this rule is needed/i), {
    target: { value: "Cleaning after a repair leaves the room usable." },
  });
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  serve();
});

afterEach(() => {
  queryClient.clear();
});

describe("proposing a rule", () => {
  it("says up front that the draft governs nothing yet", () => {
    render(<ProposeRule onProposed={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /propose a rule/i }));

    expect(screen.getByText(/governs no bookings until another Operations/i)).toBeInTheDocument();
    expect(screen.getByText(/not be able to activate it yourself/i)).toBeInTheDocument();
  });

  it("sends the ids and the reason, with the effective date as an absolute instant", async () => {
    // `datetime-local` carries no offset. Sending the raw string would let the
    // server read an Indian effective date as UTC and shift it by five and a
    // half hours.
    client.POST.mockResolvedValue(ok(rule(), 201));
    render(<ProposeRule onProposed={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /propose a rule/i }));
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const body = client.POST.mock.calls[0]![1].body;
    expect(body.left_variant_id).toBe(LEFT);
    expect(body.right_variant_id).toBe(RIGHT);
    expect(body.change_reason).toBe("Cleaning after a repair leaves the room usable.");
    expect(body.effective_from).toBe(new Date("2026-09-01T00:00").toISOString());
    // Django refuses any rule carrying conditions, so a console that sent them
    // would manufacture drafts that can only ever be rejected.
    expect(body).not.toHaveProperty("conditions");
  });

  it("refuses to spend a request on a draft Django would reject", () => {
    render(<ProposeRule onProposed={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /propose a rule/i }));
    fillDraft();
    fireEvent.change(screen.getByLabelText(/second service variant/i), {
      target: { value: LEFT },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    expect(client.POST).not.toHaveBeenCalled();
    expect(screen.getByText(/two different services/i)).toBeInTheDocument();
  });

  it("names a concurrent proposal as its own outcome", async () => {
    // Two operators proposing for one pair at the same time. "Try again" would
    // be wrong: the other draft exists and should be read first.
    client.POST.mockResolvedValue(conflict("concurrent_version_created"));
    render(<ProposeRule onProposed={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /propose a rule/i }));
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    expect(await screen.findByText(/at the same time/i)).toBeInTheDocument();
    expect(screen.getByText(/read the other proposal/i)).toBeInTheDocument();
  });

  it("is never retried automatically", async () => {
    // A retried proposal is a second draft nobody chose to write.
    client.POST.mockResolvedValue(conflict("concurrent_version_created"));
    render(<ProposeRule onProposed={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /propose a rule/i }));
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));
    await screen.findByText(/at the same time/i);

    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("hands the new draft's id back so the operator lands on it", async () => {
    const onProposed = vi.fn();
    client.POST.mockResolvedValue(ok(rule({ id: "new-rule-1" }), 201));
    render(<ProposeRule onProposed={onProposed} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /propose a rule/i }));
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => expect(onProposed).toHaveBeenCalledWith("new-rule-1"));
  });
});

describe("the queue tells a proposer before they open the rule", () => {
  it("marks a draft the signed-in operator proposed", async () => {
    serve([rule({ created_by_id: OPERATOR_ID, lifecycle_status: "DRAFT" })]);
    render(<RuleQueue selectedId={null} onSelect={vi.fn()} />, { wrapper });

    expect(await screen.findByText("Your proposal")).toBeInTheDocument();
  });

  it("does not mark somebody else's draft", async () => {
    serve([rule({ created_by_id: PROPOSER_ID, lifecycle_status: "DRAFT" })]);
    render(<RuleQueue selectedId={null} onSelect={vi.fn()} />, { wrapper });

    await screen.findByText(/Geyser repair/);
    expect(screen.queryByText("Your proposal")).not.toBeInTheDocument();
  });

  it("drops the mark once the rule is no longer a draft", async () => {
    // An active rule is one anybody may retire, so "yours" would imply a
    // restriction that does not exist.
    serve([rule({ created_by_id: OPERATOR_ID, lifecycle_status: "ACTIVE" })]);
    render(<RuleQueue selectedId={null} onSelect={vi.fn()} />, { wrapper });

    await screen.findByText("Active");
    expect(screen.queryByText("Your proposal")).not.toBeInTheDocument();
  });

  it("says the filter is empty rather than looking broken", async () => {
    serve([]);
    render(<RuleQueue selectedId={null} onSelect={vi.fn()} />, { wrapper });

    expect(await screen.findByText(/no rules match this filter/i)).toBeInTheDocument();
  });

  it("asks Django for the filter the operator picked", async () => {
    serve([rule()]);
    render(<RuleQueue selectedId={null} onSelect={vi.fn()} />, { wrapper });
    await screen.findByText(/Geyser repair/);

    fireEvent.click(screen.getByRole("tab", { name: "Active" }));

    await waitFor(() => {
      const queries = client.GET.mock.calls
        .filter(([path]) => path === RULES_PATH)
        .map(([, init]) => init.params.query);
      expect(queries).toContainEqual(expect.objectContaining({ lifecycle_status: "ACTIVE" }));
    });
  });
});
