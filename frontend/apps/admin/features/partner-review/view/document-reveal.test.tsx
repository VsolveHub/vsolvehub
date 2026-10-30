import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentReveal } from "./document-reveal";

const api = vi.hoisted(() => {
  const calls: string[] = [];
  let response: () => Promise<unknown> = () =>
    Promise.resolve({
      data: { review_url: "https://storage.test/signed/abc", expires_at: "2026-08-02T12:05:00Z" },
      response: new Response(null, { status: 200 }),
    });

  const client = {
    GET: (path: string) => {
      calls.push(path);
      return response();
    },
    POST: (path: string) => {
      calls.push(path);
      return response();
    },
  };

  return {
    calls,
    client,
    setResponse: (next: () => Promise<unknown>) => {
      response = next;
    },
  };
});

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => api.client }));

const document = (overrides: Partial<Schemas["PartnerDocument"]> = {}) =>
  ({
    id: "doc-1",
    kind: "GOVERNMENT_ID",
    version: 1,
    content_type: "image/jpeg",
    size_bytes: 1024,
    sha256: "a".repeat(64),
    scan_status: "CLEAN",
    scanned_at: "2026-08-01T10:00:00Z",
    status: "PENDING",
    review_reason: "",
    uploaded_at: "2026-08-01T09:00:00Z",
    reviewed_at: null,
    ...overrides,
  }) as Schemas["PartnerDocument"];

function renderReveal(
  doc: Schemas["PartnerDocument"] = document(),
  canReview = true,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <DocumentReveal
        document={doc}
        applicationId="app-1"
        canReview={canReview}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.calls.length = 0;
  api.setResponse(() =>
    Promise.resolve({
      data: { review_url: "https://storage.test/signed/abc", expires_at: "2026-08-02T12:05:00Z" },
      response: new Response(null, { status: 200 }),
    }),
  );
});

describe("masked by default", () => {
  it("requests nothing until a reviewer asks", () => {
    renderReveal();

    expect(api.calls).toEqual([]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reveal document/i })).toBeEnabled();
  });

  it("warns that opening it is recorded, before it is opened", () => {
    renderReveal();
    expect(screen.getByText(/access is recorded for audit/i)).toBeInTheDocument();
  });

  it("fetches a fresh URL only on the explicit press", async () => {
    renderReveal();
    fireEvent.click(screen.getByRole("button", { name: /reveal document/i }));

    await waitFor(() =>
      expect(api.calls).toEqual(["/api/v1/operations/partner-documents/{document_id}/access/"]),
    );
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });

  it("drops the URL when hidden, so looking again is a new disclosure", async () => {
    renderReveal();
    fireEvent.click(screen.getByRole("button", { name: /reveal document/i }));
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /hide document/i }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reveal document/i }));
    await waitFor(() => expect(api.calls).toHaveLength(2));
  });
});

describe("document review actions", () => {
  it("allows reviewer to approve a pending document", async () => {
    renderReveal(document({ status: "PENDING" }), true);

    const approveBtn = screen.getByRole("button", { name: /approve document/i });
    expect(approveBtn).toBeInTheDocument();
    fireEvent.click(approveBtn);

    await waitFor(() =>
      expect(api.calls).toContain("/api/v1/operations/partner-documents/{document_id}/review/"),
    );
  });

  it("allows reviewer to reject with a required reason", async () => {
    renderReveal(document({ status: "PENDING" }), true);

    const rejectBtn = screen.getByRole("button", { name: /reject document/i });
    fireEvent.click(rejectBtn);

    expect(screen.getByPlaceholderText(/type specific reason/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /confirm rejection/i });
    expect(confirmBtn).toBeDisabled();

    // Select a quick reason
    fireEvent.click(screen.getByRole("button", { name: /expired document/i }));
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(api.calls).toContain("/api/v1/operations/partner-documents/{document_id}/review/"),
    );
  });

  it("does not show approve button if document is already approved", () => {
    renderReveal(document({ status: "APPROVED" }), true);
    expect(screen.queryByRole("button", { name: /approve document/i })).not.toBeInTheDocument();
  });
});

describe("self-review", () => {
  it("does not tell a reviewer to ask for access they cannot be given", async () => {
    api.setResponse(() =>
      Promise.resolve({
        error: {
          error: {
            code: "partner_self_review_forbidden",
            message: "You cannot review your own Partner record.",
            details: null,
            retryable: false,
            request_id: null,
          },
        },
        response: new Response(null, { status: 403 }),
      }),
    );

    renderReveal();
    fireEvent.click(screen.getByRole("button", { name: /reveal document/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/your own record/i),
    );
    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/team lead|ask for access/i);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
