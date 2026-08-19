import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PROJECT_WORKSPACE,
  WORKFORCE_WORKSPACE,
  resolveWorkspaces,
} from "@/features/workspace/registry";

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { ProjectInvitationBanner } = await import("./project-invitation-banner");

const FEED_PATH = "/api/v1/notifications/";

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function notice(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    purpose: "m2.invitation.received",
    title: "New project enquiry",
    body: "A customer has sent a new enquiry.",
    target: { kind: "PROJECT_INVITATION", id: "invite-1" },
    created_at: "2026-08-15T09:00:00Z",
    read_at: null,
    ...overrides,
  };
}

function workspace(key: string, actions: string[]) {
  const [resolved] = resolveWorkspaces([{ workspaceKey: key, commercialMode: null, actions }]);
  return resolved!;
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

describe("ProjectInvitationBanner", () => {
  it("shows unread project invitations as a workspace interruption", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === FEED_PATH) {
        return Promise.resolve(ok({ next: null, previous: null, results: [notice()] }));
      }
      throw new Error(`Unexpected read: ${path}`);
    });

    render(
      <ProjectInvitationBanner workspace={workspace(PROJECT_WORKSPACE, ["enquiry.view"])} />,
      { wrapper },
    );

    await waitFor(() =>
      expect(screen.getByText(/1 new project enquiry for you/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute(
      "href",
      "/projects/enquiries/invite-1",
    );
  });

  it("stays quiet outside the Projects enquiry workspace", () => {
    render(
      <ProjectInvitationBanner workspace={workspace(WORKFORCE_WORKSPACE, ["enquiry.view"])} />,
      { wrapper },
    );

    expect(client.GET).not.toHaveBeenCalled();
    expect(screen.queryByText(/new project enquiry/i)).toBeNull();
  });

  it("does not shout about notices that are already read", async () => {
    client.GET.mockResolvedValue(
      ok({
        next: null,
        previous: null,
        results: [notice({ read_at: "2026-08-15T10:00:00Z" })],
      }),
    );

    render(
      <ProjectInvitationBanner workspace={workspace(PROJECT_WORKSPACE, ["enquiry.view"])} />,
      { wrapper },
    );

    await waitFor(() => expect(client.GET).toHaveBeenCalledWith(FEED_PATH));
    expect(screen.queryByText(/new project enquiry/i)).toBeNull();
  });
});
