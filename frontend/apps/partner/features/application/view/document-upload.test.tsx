import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

import { DocumentSlot } from "./document-upload";

const api = vi.hoisted(() => {
  const calls: string[] = [];
  const client = {
    GET: (path: string) => {
      calls.push(path);
      return Promise.resolve({
        data: {
          document: {},
          access_url: "https://storage.test/signed-preview/doc-1.pdf",
          expires_at: "2026-10-26T11:00:00Z",
        },
        response: new Response(null, { status: 200 }),
      });
    },
    POST: (path: string) => {
      calls.push(path);
      return Promise.resolve({ data: {}, response: new Response(null, { status: 200 }) });
    },
  };
  return { calls, client };
});

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => api.client }));

const document = (overrides: Partial<Schemas["PartnerDocument"]> = {}) =>
  ({
    id: "doc-1",
    kind: "GOVERNMENT_ID",
    version: 2,
    content_type: "image/png",
    size_bytes: 1048576,
    sha256: "b".repeat(64),
    scan_status: "CLEAN",
    scanned_at: "2026-10-26T10:00:00Z",
    status: "PENDING",
    review_reason: "",
    uploaded_at: "2026-10-26T10:00:00Z",
    reviewed_at: null,
    file_name: "government_id_v2.png",
    can_replace: false,
    ...overrides,
  }) as Schemas["PartnerDocument"];

const application = (
  overrides: Partial<Schemas["PartnerApplication"]> = {},
): Schemas["PartnerApplication"] =>
  ({
    id: "app-1",
    status: "UNDER_REVIEW",
    version: 7,
    can_edit: false,
    documents: [document()],
    ...overrides,
  }) as Schemas["PartnerApplication"];

function renderSlot(app: Schemas["PartnerApplication"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    withI18n(
      <QueryClientProvider client={queryClient}>
        <DocumentSlot application={app} kind="GOVERNMENT_ID" required />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  api.calls.length = 0;
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("DocumentSlot", () => {
  it("shows the server's file name, so a PNG is never called a .jpg", () => {
    renderSlot(application());

    expect(screen.getByText("government_id_v2.png")).toBeInTheDocument();
    expect(screen.getByText(/1 MB/)).toBeInTheDocument();
  });

  it("opens the signed preview in a new tab", async () => {
    renderSlot(application());

    fireEvent.click(screen.getByRole("button", { name: /view document/i }));

    await waitFor(() =>
      expect(api.calls).toEqual(["/api/v1/partner/application/documents/{document_id}/access/"]),
    );
    expect(window.open).toHaveBeenCalledWith(
      "https://storage.test/signed-preview/doc-1.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("offers a re-upload for a rejected document the server lets the Partner replace", () => {
    renderSlot(
      application({
        documents: [document({ status: "REJECTED", review_reason: "Expired document", can_replace: true })],
      }),
    );

    expect(screen.getByText(/Expired document/)).toBeInTheDocument();
    expect(screen.getByLabelText(/replace your government photo id/i)).toBeInTheDocument();
  });

  it("shows a rejection on a declined application without any upload control", () => {
    renderSlot(
      application({
        status: "DECLINED",
        documents: [document({ status: "REJECTED", review_reason: "Expired document", can_replace: false })],
      }),
    );

    expect(screen.getByText(/Expired document/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/replace your government photo id/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /replace file/i })).not.toBeInTheDocument();
  });

  it("lets a draft replace a file on purpose, behind a Replace button", () => {
    renderSlot(application({ status: "DRAFT", can_edit: true, documents: [document({ can_replace: true })] }));

    expect(screen.queryByLabelText(/replace your government photo id/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /replace file/i }));
    expect(screen.getByLabelText(/replace your government photo id/i)).toBeInTheDocument();
  });
});
