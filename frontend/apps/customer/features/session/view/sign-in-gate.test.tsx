import { fireEvent, render, screen } from "@testing-library/react";
import { ApiRequestError } from "@vsolve/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  state: "signedIn" as "checking" | "signedIn" | "signedOut" | "offline",
  refetch: vi.fn(),
}));
vi.mock("../queries", () => ({
  useCustomerSession: () => ({
    isResolving: session.state === "checking",
    isAuthenticated: session.state === "signedIn",
    isAnonymous: session.state === "signedOut",
    isUnavailable: session.state === "offline",
    refetch: session.refetch,
  }),
}));

const { SignInCard, SignInGate, isSignInError } = await import("./sign-in-gate");

beforeEach(() => {
  session.state = "signedIn";
  session.refetch.mockReset();
});

function gate() {
  return render(
    <SignInGate title="Sign in to book">
      <button type="button">Book now</button>
    </SignInGate>,
  );
}

describe("SignInGate", () => {
  it("shows the action to a signed-in customer", () => {
    gate();
    expect(screen.getByRole("button", { name: "Book now" })).toBeInTheDocument();
    expect(screen.queryByTestId("sign-in-card")).not.toBeInTheDocument();
  });

  it("shows the sign-in card instead of the action when signed out", () => {
    session.state = "signedOut";
    gate();
    expect(screen.queryByRole("button", { name: "Book now" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to book" })).toBeInTheDocument();
  });

  it("shows neither while the session is still being checked", () => {
    session.state = "checking";
    gate();
    expect(screen.queryByRole("button", { name: "Book now" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("sign-in-card")).not.toBeInTheDocument();
  });

  it("does not put a login wall in front of a dropped connection", () => {
    session.state = "offline";
    gate();
    expect(screen.getByRole("button", { name: "Book now" })).toBeInTheDocument();
  });
});

describe("SignInCard", () => {
  it("re-checks the session and opens the header's sign-in popup", () => {
    const opened = vi.fn();
    const onSignIn = vi.fn();
    window.addEventListener("open-login-popup", opened);
    render(<SignInCard title="Sign in to book" onSignIn={onSignIn} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(session.refetch).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("open-login-popup", opened);
  });

  it("says the session ended when it did", () => {
    render(<SignInCard title="Sign in to book" expired />);
    expect(
      screen.getByRole("heading", { name: "Your session ended. Sign in again" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing was submitted/)).toBeInTheDocument();
  });
});

describe("isSignInError", () => {
  it("is true only for a 401", () => {
    const detail = { code: "not_authenticated", message: "x", details: null, retryable: false };
    expect(isSignInError(new ApiRequestError(401, detail as never))).toBe(true);
    expect(isSignInError(new ApiRequestError(403, { ...detail, code: "permission_denied" } as never))).toBe(
      false,
    );
    expect(isSignInError(new Error("boom"))).toBe(false);
  });
});
