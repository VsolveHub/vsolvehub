import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

import { UploadedDocumentCard } from "./uploaded-document-card";

const api = vi.hoisted(() => {
  const calls: string[] = [];
  let response: () => Promise<unknown> = () =>
    Promise.resolve({
      data: {
        document: {
          id: "doc-1",
          kind: "GOVERNMENT_ID",
          label: "Government photo ID",
          status: "PENDING",
          version: 2,
          file_name: "government_id_v2.pdf",
          mime_type: "application/pdf",
          file_size: 1048576,
          uploaded_at: "2026-10-26T10:00:00Z",
          rejection_reason: null,
        },
        access_url: "https://storage.test/signed-preview/doc-1.pdf",
        expires_at: "2026-10-26T11:00:00Z",
      },
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
    version: 2,
    content_type: "application/pdf",
    size_bytes: 1048576, // 1 MB
    sha256: "b".repeat(64),
    scan_status: "CLEAN",
    scanned_at: "2026-10-26T10:00:00Z",
    status: "PENDING",
    review_reason: "",
    uploaded_at: "2026-10-26T10:00:00Z",
    reviewed_at: null,
    ...overrides,
  }) as Schemas["PartnerDocument"];

function renderCard(
  doc: Schemas["PartnerDocument"] = document(),
  canReplace = true,
  onReplace = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    withI18n(
      <QueryClientProvider client={queryClient}>
        <UploadedDocumentCard
          document={doc}
          label="Government photo ID"
          canReplace={canReplace}
          onReplace={onReplace}
        />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  api.calls.length = 0;
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("UploadedDocumentCard", () => {
  it("displays file info and version", () => {
    renderCard();

    expect(screen.getByText(/government_id_v2\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText(/PDF Document/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 MB/i)).toBeInTheDocument();
  });

  it("fetches access URL and opens new tab on View document click", async () => {
    renderCard();

    const viewBtn = screen.getByRole("button", { name: /view document/i });
    fireEvent.click(viewBtn);

    await waitFor(() =>
      expect(api.calls).toEqual(["/api/v1/partner/application/documents/{document_id}/access/"]),
    );
    expect(window.open).toHaveBeenCalledWith(
      "https://storage.test/signed-preview/doc-1.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("triggers onReplace when Replace file is clicked", () => {
    const onReplace = vi.fn();
    renderCard(document(), true, onReplace);

    const replaceBtn = screen.getByRole("button", { name: /replace file/i });
    fireEvent.click(replaceBtn);

    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("displays reviewer rejection note when rejected", () => {
    renderCard(
      document({
        status: "REJECTED",
        review_reason: "Aadhaar photo is blurred, kindly re-upload.",
      }),
    );

    expect(screen.getByText(/Reviewer requested changes:/i)).toBeInTheDocument();
    expect(screen.getByText(/Aadhaar photo is blurred, kindly re-upload\./i)).toBeInTheDocument();
  });
});
