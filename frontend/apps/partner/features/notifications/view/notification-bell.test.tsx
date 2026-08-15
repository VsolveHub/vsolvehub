import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROJECT_WORKSPACE, WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

/**
 * The bell and its panel, at the layer a Partner actually sees.
 *
 * ## The defects these exist to prevent
 *
 * 1. **A badge invented to fill a gap.** Before the first response, and after a
 *    failed refetch, nothing has told this browser how many notices are unread.
 *    A "0" drawn in either window is a claim about somebody's inbox that nothing
 *    checked, and this codebase has been burned by exactly that class of
 *    placeholder before.
 * 2. **A count with no noun.** A digit beside a bell glyph is not a sentence. The
 *    number has to be inside the control's accessible name or a screen-reader user
 *    hears "button" and learns nothing.
 * 3. **A feed fetched for a panel nobody opened.** Twenty rendered rows on every
 *    page view, for most Partners, forever.
 * 4. **A link the Partner cannot use.** An `ENGAGEMENT` target carries no
 *    archetype, so a Partner holding both capabilities must get an unlinked row
 *    rather than a coin-flip onto a screen that describes their project in
 *    shift-days.
 */

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { NotificationBell } = await import("./notification-bell");

const COUNT_PATH = "/api/v1/notifications/unread-count/";
const FEED_PATH = "/api/v1/notifications/";

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function notice(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    purpose: "m2.engagement.opened",
    title: "The job is open",
    body: "The customer has confirmed. You can start work as the agreed schedule allows.",
    target: { kind: "ENGAGEMENT", id: "eng-1" },
    created_at: "2026-08-15T09:00:00Z",
    read_at: null,
    ...overrides,
  };
}

/** Answers the two reads by path, so a test can vary either independently. */
function serve({
  unread,
  results = [],
  next = null,
}: {
  unread: number;
  results?: ReturnType<typeof notice>[];
  next?: string | null;
}) {
  client.GET.mockImplementation((path: string) => {
    if (path === COUNT_PATH) return Promise.resolve(ok({ unread }));
    if (path === FEED_PATH) return Promise.resolve(ok({ next, previous: null, results }));
    throw new Error(`Unexpected read: ${path}`);
  });
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderBell(workspaceKeys: readonly string[] = [WORKFORCE_WORKSPACE]) {
  return render(<NotificationBell workspaceKeys={workspaceKeys} />, { wrapper });
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

describe("the badge", () => {
  it("says only 'Notifications' before the server has answered", () => {
    // The unknown window. No number is offered, in the name or beside the glyph,
    // because nothing has been told to this browser yet.
    client.GET.mockReturnValue(new Promise(() => {}));
    renderBell();

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("does not fall back to zero when the read fails", async () => {
    // A failed refetch leaves the last good answer in `data` while the status goes
    // to error. Rendering either that or a 0 would be stating a count the server
    // is currently refusing to confirm.
    client.GET.mockRejectedValue(new Error("offline"));
    renderBell();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /unread/i })).toBeNull();
  });

  it("puts the real count inside the control's own name", async () => {
    serve({ unread: 3 });
    renderBell();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument(),
    );
  });

  it("says nothing is unread rather than going quiet", async () => {
    serve({ unread: 0 });
    renderBell();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications, nothing unread" }),
      ).toBeInTheDocument(),
    );
  });
});

describe("opening the panel", () => {
  it("does not read the feed until the bell is pressed", async () => {
    serve({ unread: 1, results: [notice()] });
    renderBell();

    await waitFor(() => expect(client.GET).toHaveBeenCalledWith(COUNT_PATH));
    expect(client.GET).not.toHaveBeenCalledWith(FEED_PATH);
  });

  it("reads the feed once it is open, and shows what a notice says", async () => {
    serve({ unread: 1, results: [notice()] });
    renderBell();

    await waitFor(() => expect(client.GET).toHaveBeenCalledWith(COUNT_PATH));
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("The job is open")).toBeInTheDocument());
    // The body is rendered by Django from `templates_registry`; the panel draws it
    // and adds nothing.
    expect(screen.getByText(/customer has confirmed/i)).toBeInTheDocument();
  });

  it("says an empty feed is empty rather than looking broken", async () => {
    serve({ unread: 0, results: [] });
    renderBell();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText(/nothing to read yet/i)).toBeInTheDocument());
  });

  it("states that the list is only the recent ones when there are more", async () => {
    // A capped list that reads as a complete history is a quiet lie. Same rule the
    // enquiry inbox follows.
    serve({
      unread: 1,
      results: [notice()],
      next: "https://api.test/api/v1/notifications/?cursor=cD0y",
    });
    renderBell();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() =>
      expect(screen.getByText(/only your most recent notices/i)).toBeInTheDocument(),
    );
  });
});

describe("where a notice leads", () => {
  it("links a workforce Partner's engagement to their shift booking", async () => {
    serve({ unread: 1, results: [notice()] });
    renderBell([WORKFORCE_WORKSPACE]);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /open.*the job is open/i })).toHaveAttribute(
        "href",
        "/workforce/shifts/eng-1",
      ),
    );
  });

  it("offers no link at all when the workspace cannot be told from the payload", async () => {
    // The headline negative. Both capabilities held, no archetype on the target —
    // so there is nothing to decide on, and the wrong screen would describe a
    // project in shift-days.
    serve({ unread: 1, results: [notice()] });
    renderBell([WORKFORCE_WORKSPACE, PROJECT_WORKSPACE]);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("The job is open")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /open/i })).toBeNull();
  });

  it("offers no link for a notice the server said leads nowhere", async () => {
    serve({ unread: 1, results: [notice({ target: null, title: "Your request is closed" })] });
    renderBell([WORKFORCE_WORKSPACE]);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("Your request is closed")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /open/i })).toBeNull();
  });
});

describe("marking things read", () => {
  it("offers Mark all read only when something is actually unread", async () => {
    serve({ unread: 0, results: [notice({ read_at: "2026-08-15T10:00:00Z" })] });
    renderBell();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("The job is open")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /mark all read/i })).toBeNull();
  });

  it("sends the whole-inbox command, not a list of ids", async () => {
    serve({ unread: 2, results: [notice()] });
    client.POST.mockResolvedValue(ok({ unread: 0 }));
    renderBell();

    await waitFor(() => expect(client.GET).toHaveBeenCalledWith(COUNT_PATH));
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/notifications/read/", {
        body: { all: true },
      }),
    );
  });

  it("gives an unlinked unread notice a way to be marked read", async () => {
    // Otherwise a notice with nowhere to go can never leave the badge, and the
    // count becomes a number the Partner learns to ignore.
    serve({ unread: 1, results: [notice({ target: null, title: "Your request is closed" })] });
    client.POST.mockResolvedValue(ok({ unread: 0 }));
    renderBell();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /mark read.*your request is closed/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /mark read.*your request is closed/i }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/notifications/read/", {
        body: { notification_id: "note-1", all: false },
      }),
    );
  });

  it("does not offer Mark read on a notice that is already read", async () => {
    serve({
      unread: 1,
      results: [
        notice({ target: null, title: "Your request is closed", read_at: "2026-08-15T10:00:00Z" }),
      ],
    });
    renderBell();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("Your request is closed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /mark read/i })).toBeNull();
  });
});
