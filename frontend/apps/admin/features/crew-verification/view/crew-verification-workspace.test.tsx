import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Operations crew-document workspace.
 *
 * Three things this file is here to hold:
 *
 * 1. **A row with no documents is not a row to review.** The queue used to show one button on
 *    every unverified membership, so a reviewer's only move on somebody who had uploaded nothing
 *    was to attest that they had checked it. The card now says whose move it is.
 * 2. **A verified membership is reachable.** `verify_crew_documents` has always been able to
 *    withdraw a verification and no screen could get to a verified row to do it.
 * 3. **Withdrawing asks for a reason first.** The server refuses a blank one; asking here means
 *    the refusal is never how a reviewer finds out.
 */
const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { CrewVerificationWorkspace } = await import("./crew-verification-workspace");

const ROW = {
  membership_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  partner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  partner_name: "V Solve Hub Partners",
  crew_member_name: "Asha Rao",
  is_supervisor: true,
  added_at: "2026-09-01T08:30:00Z",
  documents_verified_at: null,
  gender: "" as const,
  documents_pending: 0,
  documents_approved: 0,
};

const DOCUMENT = {
  document_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  kind: "GOVERNMENT_ID" as const,
  kind_label: "Government identity",
  status: "PENDING" as const,
  version: 1,
  content_type: "image/jpeg",
  size_bytes: 1_048_576,
  uploaded_at: "2026-09-01T09:00:00Z",
  reviewed_at: null,
  review_reason: "",
  expires_on: null,
  review_url: "https://storage.example/signed/asha-id.jpg",
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/** Routes each GET by path, so the queue and the document list can answer differently. */
function respondWith(
  queue: Record<string, unknown>[],
  documents: Record<string, unknown>[] = [DOCUMENT],
) {
  client.GET.mockImplementation((path: string) => {
    if (path.endsWith("/documents/")) {
      return Promise.resolve({
        data: {
          membership_id: ROW.membership_id,
          crew_member_name: ROW.crew_member_name,
          partner_name: ROW.partner_name,
          documents_verified_at: null,
          missing_required_kinds: documents.some((entry) => entry.status === "APPROVED")
            ? []
            : ["GOVERNMENT_ID"],
          documents,
          server_now: "2026-09-02T08:30:00Z",
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    }
    return Promise.resolve({
      data: { memberships: queue, server_now: "2026-09-02T08:30:00Z" },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
  });
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  respondWith([ROW]);
  client.POST.mockResolvedValue({
    data: { ...DOCUMENT, status: "APPROVED", reviewed_at: "2026-09-02T08:31:00Z" },
    error: undefined,
    response: new Response(null, { status: 200 }),
  });
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe("CrewVerificationWorkspace", () => {
  it("says whose move it is when the partner has uploaded nothing", async () => {
    render(<CrewVerificationWorkspace />, { wrapper });

    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText(/cannot mark them as checked/i)).toBeInTheDocument();
    expect(screen.getByText(/has not sent any identity documents/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing uploaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open documents/i })).not.toBeInTheDocument();
  });

  it("approves a document a reviewer could actually open", async () => {
    respondWith([{ ...ROW, documents_pending: 1 }]);
    render(<CrewVerificationWorkspace />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /open documents/i }));

    expect(await screen.findByText("Government identity")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the file/i })).toHaveAttribute(
      "href",
      DOCUMENT.review_url,
    );

    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/operations/crew-documents/{document_id}/review/",
      expect.objectContaining({
        params: {
          path: { document_id: DOCUMENT.document_id },
          header: { "Idempotency-Key": expect.any(String) },
        },
        body: { approved: true, reason: "" },
      }),
    );
  });

  it("refuses to decide a document the file store could not produce a link for", async () => {
    respondWith([{ ...ROW, documents_pending: 1 }], [{ ...DOCUMENT, review_url: null }]);
    render(<CrewVerificationWorkspace />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /open documents/i }));

    expect(await screen.findByText(/cannot be opened/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeDisabled();
  });

  it("will not withdraw a check without a reason", async () => {
    respondWith([{ ...ROW, documents_verified_at: "2026-09-02T08:00:00Z", documents_approved: 1 }]);
    render(<CrewVerificationWorkspace />, { wrapper });

    fireEvent.click(await screen.findByRole("tab", { name: /checked/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^withdraw$/i }));

    expect(screen.getByRole("button", { name: /^withdraw check$/i })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: /why are you withdrawing/i }), {
      target: { value: "Their ID expired last month" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^withdraw check$/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/operations/crew-memberships/{membership_id}/verification/",
      expect.objectContaining({
        body: { verified: false, reason: "Their ID expired last month" },
      }),
    );
  });

  it("corrects a disputed gender with a reason", async () => {
    respondWith([{ ...ROW, gender: "MAN" }]);
    render(<CrewVerificationWorkspace />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /correct gender/i }));
    fireEvent.click(screen.getByRole("radio", { name: /woman/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /why are you correcting/i }), {
      target: { value: "Partner confirmed by phone" },
    });
    fireEvent.click(screen.getByRole("button", { name: /correct the record/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/operations/crew-memberships/{membership_id}/gender/",
      expect.objectContaining({
        body: { gender: "WOMAN", reason: "Partner confirmed by phone" },
      }),
    );
  });

  it("shows an honest empty queue", async () => {
    respondWith([]);
    render(<CrewVerificationWorkspace />, { wrapper });

    expect(await screen.findByText(/no crew documents are waiting/i)).toBeInTheDocument();
  });
});
