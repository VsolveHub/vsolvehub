import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  isResolving: false,
  isAuthenticated: true,
  isAnonymous: false,
  isUnavailable: false,
  userId: "customer-1",
  phoneNumber: "+919876543210",
  displayName: "Gopal",
  fullName: "Gopal Rao",
  email: "gopal@example.test",
  dateJoined: "2026-01-12T08:30:00Z",
  activeRole: "customer",
  refetch: vi.fn(),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const logout = vi.hoisted(() => ({
  mutate: vi.fn((_input: undefined, options?: { onSuccess?: () => void }) => {
    options?.onSuccess?.();
  }),
  isPending: false,
  isError: false,
  error: null,
}));

vi.mock("@/features/session/queries", () => ({ useCustomerSession: () => session }));
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useLogout: () => logout,
}));

const { ProfileOverview } = await import("./profile-overview");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileOverview", () => {
  it("lists the personal information returned by the session API", () => {
    render(<ProfileOverview />);

    expect(screen.getByText("Gopal Rao")).toBeInTheDocument();
    expect(screen.getByText("+919876543210")).toBeInTheDocument();
    expect(screen.getByText("gopal@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit profile/i })).toBeInTheDocument();
  });

  it("goes to login after sign out succeeds", () => {
    render(<ProfileOverview />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
