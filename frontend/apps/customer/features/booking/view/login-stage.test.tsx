import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Stage } from "../model/stages";
import { LoginStage } from "./login-stage";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";

/**
 * The login interrupt as the customer meets it.
 *
 * The reducer tests already prove that nothing is lost; these prove the screen
 * says so, asks for a code only when one is actually needed, and puts the
 * customer back where they were the moment Django issues a session.
 */

const api = vi.hoisted(() => {
  const routes = new Map<string, () => Promise<unknown>>();
  const calls: string[] = [];

  const ok = (data: unknown) => ({
    data,
    response: new Response(null, { status: 200 }),
  });

  const call = (path: string) => {
    calls.push(path);
    const route = api.routes.get(path);
    return route ? route() : Promise.resolve(ok(null));
  };

  const api = {
    routes,
    calls,
    ok,
    client: { GET: call, POST: call, DELETE: call },
  };

  return api;
});

vi.mock("@/lib/api/browser", () => ({
  getApiClient: () => api.client,
}));

function envelope(status: number, code: string) {
  return () =>
    Promise.resolve({
      error: { error: { code, message: "", details: null, retryable: false, request_id: null } },
      response: new Response(null, { status }),
    });
}

/**
 * Contract 1.3.0 answers `200` with `user: null` for an anonymous caller, so
 * discovering "nobody is signed in" no longer means provoking a 401 — and no
 * longer trips the client's cross-tab logout broadcast.
 */
const ANONYMOUS = () =>
  Promise.resolve(
    api.ok({ user: null, active_role: null, session_expires_at: null }),
  );

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  phone_number: "+919876543210",
  full_name: "",
  email: "",
  roles: ["customer"],
};

const SUMMARY = [
  { label: "Service", value: "Fan installation" },
  { label: "Jobs selected", value: "2" },
];

function Harness({ returnTo }: { returnTo: Stage }) {
  const { state, dispatch } = useWorkspace();

  return (
    <>
      <button type="button" onClick={() => dispatch({ type: "REQUIRE_LOGIN", returnTo })}>
        raise login
      </button>
      <p data-testid="stage">{state.stage}</p>
      {state.stage === "login" ? <LoginStage summary={SUMMARY} /> : null}
    </>
  );
}

/** Renders the workspace and raises the login interrupt from `returnTo`. */
function raiseLogin(returnTo: Stage = "address") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider serviceSlug="fan-installation">
        <Harness returnTo={returnTo} />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "raise login" }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  api.routes.clear();
  api.calls.length = 0;
  api.routes.set("/api/v1/auth/session/", ANONYMOUS);
});

describe("an anonymous customer", () => {
  it("is told the booking is still there before being asked for anything", async () => {
    raiseLogin();

    expect(screen.getByText(/nothing here is lost/i)).toBeInTheDocument();
    expect(screen.getByText("Fan installation")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    await screen.findByLabelText(/mobile number/i);
  });

  it("gets the shared OTP form rather than a second implementation", async () => {
    raiseLogin();

    const input = await screen.findByLabelText(/mobile number/i);
    expect(input).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByRole("button", { name: /send code/i })).toBeDisabled();
  });

  it("reaches the code step and then resumes the stage it was interrupted at", async () => {
    api.routes.set("/api/v1/auth/otp/request/", () =>
      Promise.resolve(
        api.ok({
          challenge_id: "11111111-1111-1111-1111-111111111111",
          expires_in_seconds: 300,
          resend_after_seconds: 60,
          development_code: null,
        }),
      ),
    );
    api.routes.set("/api/v1/auth/otp/verify/", () =>
      Promise.resolve(
        api.ok({
          user: USER,
          active_role: "customer",
          session_expires_at: "2026-08-02T00:00:00Z",
        }),
      ),
    );

    raiseLogin("scope");

    fireEvent.change(await screen.findByLabelText(/mobile number/i), {
      target: { value: "9876543210" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    const code = await screen.findByLabelText(/6-digit code/i);
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    // Back on the stage the interrupt was raised from, not on the stage that
    // happens to follow `login` in the sequence.
    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("scope"));
  });

  it("can cancel and go back to where it came from", async () => {
    raiseLogin("scope");
    await screen.findByLabelText(/mobile number/i);

    fireEvent.click(screen.getByRole("button", { name: /back to what you need/i }));
    expect(screen.getByTestId("stage")).toHaveTextContent("scope");
  });
});

describe("a customer who already has a session", () => {
  it("is not asked for a code it does not need", async () => {
    // Reachable when they logged in from another tab. Django allows five codes
    // per number per window; spending one here would be careless.
    api.routes.set("/api/v1/auth/session/", () =>
      Promise.resolve(
        api.ok({
          user: USER,
          active_role: "customer",
          session_expires_at: "2026-08-31T00:00:00Z",
        }),
      ),
    );

    raiseLogin("review");

    expect(
      await screen.findByRole("button", { name: /continue to review/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
    expect(api.calls).not.toContain("/api/v1/auth/otp/request/");
  });

  it("resumes when that continue is used", async () => {
    api.routes.set("/api/v1/auth/session/", () =>
      Promise.resolve(
        api.ok({
          user: USER,
          active_role: "customer",
          session_expires_at: "2026-08-31T00:00:00Z",
        }),
      ),
    );

    raiseLogin("review");
    fireEvent.click(await screen.findByRole("button", { name: /continue to review/i }));

    expect(screen.getByTestId("stage")).toHaveTextContent("review");
  });
});

describe("when the session cannot be checked", () => {
  it("offers a retry instead of a login wall", async () => {
    // A 500 is not evidence that nobody is signed in. Showing the OTP form here
    // would ask a logged-in customer to authenticate again for no reason.
    api.routes.set("/api/v1/auth/session/", envelope(500, "internal_error"));

    raiseLogin();

    expect(await screen.findByText(/could not check your account/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
