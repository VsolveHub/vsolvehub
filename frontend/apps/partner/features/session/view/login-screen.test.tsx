import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useAuthGuard: () => ({ status: "unauthenticated" }),
}));
vi.mock("@/features/application/queries", () => ({
  usePartnerApplication: () => ({ isPending: false, data: undefined, error: null }),
}));
vi.mock("@/features/notifications/view/booking-alert-audio", () => ({
  prepareBookingAlertsFromGesture: vi.fn(),
}));
vi.mock("@/components/marketing-mobile-nav", () => ({ MarketingMobileNav: () => null }));
vi.mock("@/components/marketing-nav-cta", () => ({ MarketingNavCta: () => null }));
vi.mock("@/components/home-hero-link", () => ({
  HomeHeroLink: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@/lib/api/browser", () => ({ getApiClient: vi.fn(), browserApiBaseUrl: () => "" }));

import { withI18n } from "@/i18n/test-utils";

import { LoginScreen } from "./login-screen";

function renderLogin() {
  return render(
    withI18n(
      <QueryClientProvider client={new QueryClient()}>
        <LoginScreen />
      </QueryClientProvider>,
    ),
  );
}

describe("LoginScreen phone prefill", () => {
  beforeEach(() => {
    search = "";
  });

  it("prefills the mobile number the hero sent as ?phone=", async () => {
    search = "phone=9876543210&next=%2Fapply";

    renderLogin();

    expect(await screen.findByDisplayValue("9876543210")).toBeInTheDocument();
  });

  it("starts empty when there is no ?phone=", async () => {
    renderLogin();

    expect(await screen.findByPlaceholderText("9876543210")).toHaveValue("");
  });
});
