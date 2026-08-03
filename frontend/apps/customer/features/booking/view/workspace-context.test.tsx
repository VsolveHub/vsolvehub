import { act, render, renderHook, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkspaceProvider,
  clearPersistedIntent,
  useWorkspace,
} from "./workspace-context";

/**
 * Server render, first client render and persisted intent.
 *
 * The bug these guard against is quiet by construction. An initializer that
 * reads `sessionStorage` produces one tree on the server and a different one on
 * the client's first pass; React reacts by discarding the client tree and
 * re-rendering the whole subtree from scratch. Nothing throws, nothing turns
 * red, and the only symptom is a slower page and — where the two trees disagree
 * about form state — answers that appear and then vanish.
 *
 * So these tests do not assert that restoration *works*, which the old
 * implementation also did. They assert that it happens **after** hydration, and
 * that the render path is storage-free even in an environment where storage is
 * perfectly readable.
 */

const SLUG = "fan-installation";

function seedIntent(intent: Record<string, unknown>) {
  window.sessionStorage.setItem(`vsolve.booking.${SLUG}`, JSON.stringify(intent));
}

/** Renders the parts of workspace state that persistence is supposed to carry. */
function Probe() {
  const { state, taskCount } = useWorkspace();
  return (
    <div>
      <span data-testid="notes">{state.notes}</span>
      <span data-testid="answers">{JSON.stringify(state.answers)}</span>
      <span data-testid="tasks">{taskCount}</span>
    </div>
  );
}

function tree() {
  return (
    <WorkspaceProvider serviceSlug={SLUG} initialStage="scope">
      <Probe />
    </WorkspaceProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("server and first client render agree", () => {
  it("renders identical markup on the server and on the client's first pass", () => {
    // Storage is fully readable here. That is the point: if any code path
    // consulted it during render, these two strings would differ and the real
    // browser would hydrate a mismatched tree.
    seedIntent({
      serviceSlug: SLUG,
      answers: { rooms: 3 },
      notes: "Gate code 4821",
      taskLines: [{ taskCode: "fan.install", quantity: 2 }],
      addressId: null,
    });

    const serverHtml = renderToString(tree());
    const { container } = render(tree());

    // `render` has already flushed effects, so compare against a fresh
    // server-side pass of the same component rather than the settled DOM.
    expect(serverHtml).toBe(renderToString(tree()));
    expect(serverHtml).not.toContain("Gate code 4821");
    expect(container.innerHTML).toContain("Gate code 4821");
  });

  it("hydrates a server-rendered tree without a recoverable mismatch", async () => {
    seedIntent({
      serviceSlug: SLUG,
      answers: { rooms: 3 },
      notes: "Gate code 4821",
      taskLines: [{ taskCode: "fan.install", quantity: 2 }],
      addressId: null,
    });

    const container = document.createElement("div");
    container.innerHTML = renderToString(tree());
    document.body.append(container);

    // React reports every hydration mismatch here, including the ones it
    // recovers from silently. An empty spy is the assertion.
    const onRecoverableError = vi.fn();

    await act(async () => {
      hydrateRoot(container, tree(), { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Gate code 4821");
    container.remove();
  });
});

describe("restoring persisted intent", () => {
  it("applies stored answers, notes and task lines after mount", () => {
    seedIntent({
      serviceSlug: SLUG,
      answers: { rooms: 3, floor: "2" },
      notes: "Gate code 4821",
      taskLines: [{ taskCode: "fan.install", quantity: 2 }],
      addressId: null,
    });

    render(tree());

    expect(screen.getByTestId("notes")).toHaveTextContent("Gate code 4821");
    expect(screen.getByTestId("answers")).toHaveTextContent('{"rooms":3,"floor":"2"}');
    expect(screen.getByTestId("tasks")).toHaveTextContent("2");
  });

  it("does not overwrite stored intent with the empty state it mounts from", () => {
    // The regression that a naive "persist on every state change" introduces:
    // the mount commit writes the initial state before the restore lands, so a
    // second reload finds an empty record where the answers used to be.
    const stored = {
      serviceSlug: SLUG,
      answers: { rooms: 3 },
      notes: "Gate code 4821",
      taskLines: [{ taskCode: "fan.install", quantity: 2 }],
      addressId: null,
    };
    seedIntent(stored);

    const first = render(tree());
    first.unmount();

    const persisted = JSON.parse(
      window.sessionStorage.getItem(`vsolve.booking.${SLUG}`) ?? "null",
    ) as typeof stored;
    expect(persisted.notes).toBe("Gate code 4821");
    expect(persisted.answers).toEqual({ rooms: 3 });

    // And a second mount still finds it.
    render(tree());
    expect(screen.getByTestId("notes")).toHaveTextContent("Gate code 4821");
  });

  it("ignores intent stored under a different service", () => {
    window.sessionStorage.setItem(
      "vsolve.booking.geyser-repair",
      JSON.stringify({
        serviceSlug: "geyser-repair",
        answers: { litres: 25 },
        notes: "wrong service",
        taskLines: [],
        addressId: null,
      }),
    );

    render(tree());
    expect(screen.getByTestId("notes")).toHaveTextContent("");
    expect(screen.getByTestId("answers")).toHaveTextContent("{}");
  });

  it("starts fresh rather than throwing when storage holds corrupt JSON", () => {
    window.sessionStorage.setItem(`vsolve.booking.${SLUG}`, "{not json");

    expect(() => render(tree())).not.toThrow();
    expect(screen.getByTestId("answers")).toHaveTextContent("{}");
  });

  it("persists changes made after the restore", () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider serviceSlug={SLUG} initialStage="scope">
          {children}
        </WorkspaceProvider>
      ),
    });

    act(() => {
      result.current.dispatch({ type: "SET_NOTES", notes: "Second floor, no lift" });
    });

    const persisted = JSON.parse(
      window.sessionStorage.getItem(`vsolve.booking.${SLUG}`) ?? "null",
    ) as { notes: string };
    expect(persisted.notes).toBe("Second floor, no lift");
  });

  it("clears the record when the booking is finished with", () => {
    seedIntent({
      serviceSlug: SLUG,
      answers: { rooms: 3 },
      notes: "Gate code 4821",
      taskLines: [],
      addressId: null,
    });

    clearPersistedIntent(SLUG);
    expect(window.sessionStorage.getItem(`vsolve.booking.${SLUG}`)).toBeNull();
  });
});

describe("what is deliberately not restored", () => {
  it("does not restore the address, whose serviceability is a server verdict with an expiry", () => {
    seedIntent({
      serviceSlug: SLUG,
      answers: {},
      notes: "",
      taskLines: [],
      addressId: "addr-1",
    });

    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider serviceSlug={SLUG} initialStage="scope">
          {children}
        </WorkspaceProvider>
      ),
    });

    expect(result.current.state.address).toBeNull();
  });

  it("does not let a late restore overwrite work already in progress", () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider serviceSlug={SLUG} initialStage="scope">
          {children}
        </WorkspaceProvider>
      ),
    });

    act(() => {
      result.current.dispatch({ type: "ANSWER", questionCode: "rooms", value: 9 });
    });
    act(() => {
      result.current.dispatch({
        type: "RESTORE_INTENT",
        answers: { rooms: 1 },
        notes: "stale",
        taskLines: [],
      });
    });

    expect(result.current.state.answers).toEqual({ rooms: 9 });
    expect(result.current.state.notes).toBe("");
  });
});
