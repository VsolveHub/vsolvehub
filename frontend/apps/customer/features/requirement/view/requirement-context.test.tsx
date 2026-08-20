import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequirementProvider, useRequirement } from "./requirement-context";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/requests/new/interior-fit-out-project",
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams("step=review&selected_service=office-fit-out"),
}));

const SLUG = "interior-fit-out-project";
const STORAGE_KEY = `vsolve.requirement.${SLUG}`;

function seedIntent() {
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categorySlug: SLUG,
      requirementId: "req-42",
      answers: { fit_out_style: "office-fit-out", rooms: 4 },
      addressId: "address-9",
      requestedStart: "2026-09-14",
      serviceBy: "2026-10-30",
      flexibilityDays: 7,
      additionalDetails: "Work around the occupied east wing.",
      language: "en-IN",
      optionalDetails: { access: { instructions: "Use loading gate B" } },
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return <RequirementProvider categorySlug={SLUG}>{children}</RequirementProvider>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  routerReplace.mockClear();
});

describe("requirement reload persistence", () => {
  it("restores the same server draft, address, dates and remaining customer intent", () => {
    seedIntent();

    const { result } = renderHook(() => useRequirement(), { wrapper });

    expect(result.current.hasRestoredIntent).toBe(true);
    expect(result.current.state.requirementId).toBe("req-42");
    expect(result.current.state.answers).toEqual({
      fit_out_style: "office-fit-out",
      rooms: 4,
    });
    expect(result.current.state.addressId).toBe("address-9");
    expect(result.current.state.requestedStart).toBe("2026-09-14");
    expect(result.current.state.serviceBy).toBe("2026-10-30");
    expect(result.current.state.flexibilityDays).toBe(7);
    expect(result.current.state.additionalDetails).toBe(
      "Work around the occupied east wing.",
    );
    expect(result.current.state.screen).toBe("review");
  });

  it("does not overwrite restored intent with the empty hydration state", () => {
    seedIntent();

    const first = renderHook(() => useRequirement(), { wrapper });
    first.unmount();

    const persisted = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as {
      requirementId: string | null;
      addressId: string | null;
      requestedStart: string | null;
      serviceBy: string | null;
    };
    expect(persisted).toMatchObject({
      requirementId: "req-42",
      addressId: "address-9",
      requestedStart: "2026-09-14",
      serviceBy: "2026-10-30",
    });

    const second = renderHook(() => useRequirement(), { wrapper });
    expect(second.result.current.state.addressId).toBe("address-9");
    expect(second.result.current.state.requestedStart).toBe("2026-09-14");
    expect(second.result.current.state.serviceBy).toBe("2026-10-30");
  });

  it("keeps older stored entries compatible", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        categorySlug: SLUG,
        answers: { fit_out_style: "office-fit-out" },
        addressId: "address-legacy",
        additionalDetails: "",
        language: null,
      }),
    );

    const { result } = renderHook(() => useRequirement(), { wrapper });

    expect(result.current.state.requirementId).toBeNull();
    expect(result.current.state.addressId).toBe("address-legacy");
    expect(result.current.state.requestedStart).toBeNull();
    expect(result.current.state.serviceBy).toBeNull();
  });
});
