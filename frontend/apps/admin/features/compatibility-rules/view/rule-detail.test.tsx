import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPERATOR_ID,
  PROPOSER_ID,
  conflict,
  ok,
  rule,
  sessionState,
} from "@/features/shared/fixtures";

/**
 * The compatibility-rule decision screen.
 *
 * Three properties are worth a test here, and they are all about what the screen
 * refuses to do:
 *
 *  - **The proposer's Activate button does not exist.** Not disabled, not hidden
 *    with CSS — absent from the DOM. A disabled control still tells someone that
 *    approving was nearly theirs to do, and invites a second attempt through a
 *    refresh or a stale tab. Separation of duties is not a validation message.
 *  - **A maker-checker refusal is its own outcome.** The console does not offer
 *    the command to a proposer, so reaching this refusal means the client acted
 *    on a rule whose proposer it had not loaded. "The button did nothing" is the
 *    worst possible answer to it.
 *  - **Identity is masked to the relationship.** A colleague's account id
 *    answers a question nobody asked, and the contract publishes no audited
 *    disclosure for staff identity.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RuleDetail } = await import("./rule-detail");

const RULE_PATH = "/api/v1/operations/compatibility-rules/{rule_id}/";
const SESSION_PATH = "/api/v1/auth/session/";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * Answers by path.
 *
 * `useActorId` reads the same session query the shell already guards on, so the
 * detail issues two reads and a mock that answered positionally would hand the
 * rule payload to the session query.
 */
function serve(options: {
  rule?: ReturnType<typeof rule>;
  session?: ReturnType<typeof sessionState>;
}) {
  client.GET.mockImplementation((path: string) => {
    if (path === SESSION_PATH) return Promise.resolve(ok(options.session ?? sessionState()));
    if (path === RULE_PATH) return Promise.resolve(ok(options.rule ?? rule()));
    throw new Error(`Unexpected GET ${path}`);
  });
}

function renderDetail() {
  return render(<RuleDetail ruleId={rule().id} />, { wrapper });
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

describe("a second reviewer", () => {
  it("is offered both decisions on somebody else's draft", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID }) });
    renderDetail();

    expect(await screen.findByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("cannot confirm until the reason is long enough for Django", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID }) });
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    const confirm = screen.getByRole("button", { name: /confirm activate/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Agreed on the rota call." },
    });
    expect(confirm).toBeEnabled();
  });

  it("sends the version that was on screen, not the latest one", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID, version: 7 }) });
    client.POST.mockResolvedValue(ok(rule({ lifecycle_status: "ACTIVE", version: 8 })));
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Agreed on the rota call." },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm activate/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/compatibility-rules/{rule_id}/activate/");
    expect(init.body).toEqual({
      expected_version: 7,
      review_reason: "Agreed on the rota call.",
    });
  });
});

describe("the proposer", () => {
  it("is not shown the decision at all", async () => {
    serve({ rule: rule({ created_by_id: OPERATOR_ID }) });
    renderDetail();

    // The wording is the assertion that the screen rendered — waiting on it
    // first means the "no button" checks below cannot pass by being early.
    expect(await screen.findByText(/waiting on another reviewer/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("is told it is somebody else's decision, not that access can be granted", async () => {
    serve({ rule: rule({ created_by_id: OPERATOR_ID }) });
    renderDetail();

    const explanation = await screen.findByText(/somebody\s+else's decision/i);
    expect(explanation.textContent ?? "").toMatch(/not access that can be granted/i);
  });

  it("may still retire a rule they proposed once it is active", async () => {
    // Active means a second person already activated it. Withholding Retire
    // would leave a bad rule in force with nobody able to pull it.
    serve({ rule: rule({ lifecycle_status: "ACTIVE", created_by_id: OPERATOR_ID }) });
    renderDetail();

    expect(await screen.findByRole("button", { name: "Retire" })).toBeInTheDocument();
  });
});

describe("while the signed-in user is unknown", () => {
  it("withholds the decision rather than guessing", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === SESSION_PATH) return new Promise(() => {});
      if (path === RULE_PATH) return Promise.resolve(ok(rule({ created_by_id: PROPOSER_ID })));
      throw new Error(`Unexpected GET ${path}`);
    });

    renderDetail();

    // The rule renders; the decision does not, because nothing yet proves this
    // operator is a different person from the proposer.
    expect(await screen.findByText(/Geyser repair/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
  });
});

describe("a refusal", () => {
  it("names maker-checker instead of offering a retry", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID }) });
    client.POST.mockResolvedValue(conflict("maker_checker_required"));
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Agreed on the rota call." },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm activate/i }));

    const alert = await screen.findByText(/not yours to decide/i);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/another Operations reviewer has to activate/i)).toBeInTheDocument();
  });

  it("distinguishes a rule that moved from one that was never yours", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID }) });
    client.POST.mockResolvedValue(conflict("version_changed"));
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Superseded by the new pairing." },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm reject/i }));

    expect(await screen.findByText(/someone else acted first/i)).toBeInTheDocument();
    expect(screen.queryByText(/not yours to decide/i)).not.toBeInTheDocument();
  });

  it("is never retried automatically", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID }) });
    client.POST.mockResolvedValue(conflict("version_changed"));
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Agreed on the rota call." },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm activate/i }));

    await screen.findByText(/someone else acted first/i);
    // A retried decision is a second decision, taken by nobody.
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("identity on screen", () => {
  it("names the relationship and never the account id", async () => {
    serve({ rule: rule({ created_by_id: PROPOSER_ID }) });
    const { container } = renderDetail();

    await screen.findByText("Another Operations reviewer");
    expect(container.textContent ?? "").not.toContain(PROPOSER_ID);
    expect(container.textContent ?? "").not.toContain(OPERATOR_ID);
  });

  it("says a rule that predates the process had no proposer", async () => {
    serve({ rule: rule({ created_by_id: null }) });
    renderDetail();

    expect(await screen.findByText(/predates the review process/i)).toBeInTheDocument();
  });
});
