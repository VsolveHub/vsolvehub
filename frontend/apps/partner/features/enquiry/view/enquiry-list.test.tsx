import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enquirySummary } from "../fixtures";

/**
 * The enquiry inbox.
 *
 * Three properties matter more than the layout:
 *
 * 1. **A workspace shows its own lifecycle's enquiries.** The endpoint returns
 *    both, filtered on the `archetype` field the server sent against the
 *    workspace key the server also sent — never inferred from a category slug.
 * 2. **Truncation is stated.** The endpoint is cursor-paginated and publishes no
 *    `cursor` parameter, so page two is unreachable; a Partner must not be shown
 *    a truncated inbox that looks complete.
 * 3. **A refused read does not offer a retry.** Asking again walks into the same
 *    refusal and delays the honest screen.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { EnquiryList } = await import("./enquiry-list");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderList(archetype = "A3_TIME_BLOCK") {
  return render(
    <EnquiryList archetype={archetype} basePath="/workforce/enquiries" workLabel="people by the day" />,
    { wrapper },
  );
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

describe("which enquiries a workspace shows", () => {
  it("shows the ones whose archetype matches the workspace", async () => {
    client.GET.mockResolvedValue(
      ok({
        next: null,
        previous: null,
        results: [
          enquirySummary({ id: "a", category_slug: "housekeeping-staff" }),
          enquirySummary({
            id: "b",
            archetype: "A5_CUSTOM_PROJECT",
            category_slug: "interior-fitout",
          }),
        ],
      }),
    );

    renderList("A3_TIME_BLOCK");

    expect(await screen.findByText(/housekeeping staff/i)).toBeInTheDocument();
    expect(screen.queryByText(/interior fitout/i)).toBeNull();
  });

  it("shows nothing for an archetype this build has no workspace for", async () => {
    client.GET.mockResolvedValue(
      ok({ next: null, previous: null, results: [enquirySummary({ archetype: "A9_SOMETHING" })] }),
    );

    renderList("A3_TIME_BLOCK");

    // Same rule as an unknown workspace key: nothing, never a generic row.
    expect(await screen.findByText(/No enquiries yet/i)).toBeInTheDocument();
  });
});

describe("grouping", () => {
  it("separates what is waiting on the vendor from what is already quoted", async () => {
    client.GET.mockResolvedValue(
      ok({
        next: null,
        previous: null,
        results: [
          enquirySummary({ id: "a", status: "INVITED" }),
          enquirySummary({ id: "b", status: "QUOTED" }),
        ],
      }),
    );

    renderList();

    expect(await screen.findByRole("heading", { name: /Waiting for you/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Quoted/i })).toBeInTheDocument();
  });

  it("does not render a heading for a bucket nothing falls into", async () => {
    client.GET.mockResolvedValue(
      ok({ next: null, previous: null, results: [enquirySummary({ status: "INVITED" })] }),
    );

    renderList();

    await screen.findByRole("heading", { name: /Waiting for you/i });
    expect(screen.queryByRole("heading", { name: /^Closed$/i })).toBeNull();
  });
});

describe("states", () => {
  it("announces the loading region rather than showing bare boxes", () => {
    client.GET.mockReturnValue(new Promise(() => {}));
    renderList();
    expect(screen.getByLabelText(/Loading your enquiries/i)).toBeInTheDocument();
  });

  it("says an empty inbox does not mean there is no work", async () => {
    client.GET.mockResolvedValue(ok({ next: null, previous: null, results: [] }));
    renderList();

    expect(await screen.findByText(/No enquiries yet/i)).toBeInTheDocument();
    expect(screen.getByText(/does not mean there is no work/i)).toBeInTheDocument();
  });

  it("offers a retry on a server error", async () => {
    client.GET.mockResolvedValue({
      data: undefined,
      error: { code: "server_error", message: "Something went wrong." },
      response: new Response(null, { status: 500 }),
    });

    renderList();

    expect(await screen.findByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("does not offer a retry when the read was refused", async () => {
    client.GET.mockResolvedValue({
      data: undefined,
      error: { code: "permission_denied", message: "Not allowed." },
      response: new Response(null, { status: 403 }),
    });

    renderList();

    await waitFor(() => expect(screen.getByText(/cannot read enquiries/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
  });
});

describe("truncation", () => {
  it("says so when the server is holding pages this build cannot ask for", async () => {
    client.GET.mockResolvedValue(
      ok({
        next: "https://api.example.test/api/v1/partner/enquiries/?cursor=cD0y",
        previous: null,
        results: [enquirySummary()],
      }),
    );

    renderList();

    expect(
      await screen.findByText(/holding older enquiries that this screen cannot ask for/i),
    ).toBeInTheDocument();
  });

  it("says nothing when the page is the whole list", async () => {
    client.GET.mockResolvedValue(
      ok({ next: null, previous: null, results: [enquirySummary()] }),
    );

    renderList();

    await screen.findByText(/housekeeping staff/i);
    expect(screen.queryByText(/holding older enquiries/i)).toBeNull();
  });
});

describe("what a row may not carry", () => {
  it("renders no customer identity", async () => {
    client.GET.mockResolvedValue(
      ok({ next: null, previous: null, results: [enquirySummary()] }),
    );

    const { container } = renderList();
    await screen.findByText(/housekeeping staff/i);

    // The projection withholds identity; this asserts the client never
    // reconstructs it from anywhere else on the row.
    expect(container.textContent).not.toMatch(/\+91|\b[6-9]\d{9}\b/);
  });

  it("renders no archetype code", async () => {
    client.GET.mockResolvedValue(
      ok({ next: null, previous: null, results: [enquirySummary()] }),
    );

    const { container } = renderList();
    await screen.findByText(/housekeeping staff/i);

    expect(container.textContent).not.toMatch(/A3_TIME_BLOCK|A5_CUSTOM_PROJECT/);
  });
});
