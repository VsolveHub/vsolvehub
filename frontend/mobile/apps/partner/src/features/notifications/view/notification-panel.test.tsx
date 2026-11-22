/* eslint-disable @typescript-eslint/no-require-imports */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Dimensions, StyleSheet } from "react-native";

import { LIST_SHARE_OF_SCREEN, NotificationPanel } from "./notification-panel";

/**
 * The notification sheet on a phone. The badge said there were notices while the sheet showed an
 * empty gap: the list was told to fill the remaining space inside a sheet that only has a maximum
 * height, which works out to 0 pixels on a device. Jest cannot measure a real layout, so this pins
 * what caused it: the list carries a real maximum height and never asks to fill the space.
 */

jest.setTimeout(15000);

const mockClient = { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), PUT: jest.fn(), DELETE: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({ getApiClient: () => mockClient }));
jest.mock("expo-blur", () => ({ BlurView: require("react-native").View }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function notice(id: string, title: string) {
  return {
    id,
    purpose: "partner_application_update",
    title,
    body: `${title}: more detail`,
    target: null,
    created_at: "2026-11-21T08:00:00Z",
    read_at: null,
  };
}

const NOTICES = [
  notice("n1", "You are approved"),
  notice("n2", "Your application is being reviewed"),
  notice("n3", "We have your application"),
];

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mockClient.GET.mockReset();
  mockClient.GET.mockImplementation((path: string) =>
    path === "/api/v1/notifications/"
      ? Promise.resolve(ok({ results: NOTICES, next: null, previous: null }))
      : Promise.resolve(ok({})),
  );
});

afterEach(() => queryClient.clear());

async function openPanel() {
  return await render(<NotificationPanel open onOpenChange={jest.fn()} workspaceKeys={[]} unreadCount={3} />, {
    wrapper,
  });
}

describe("the notification sheet", () => {
  it("shows every notice the badge counted", async () => {
    const panel = await openPanel();

    expect(await panel.findByText("You are approved")).toBeTruthy();
    expect(panel.getByText("Your application is being reviewed")).toBeTruthy();
    expect(panel.getByText("We have your application")).toBeTruthy();
    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/notifications/", {
      params: { query: { audience: "partner" } },
    });
  });

  it("gives the list a real maximum height instead of asking it to fill the space", async () => {
    const panel = await openPanel();
    await panel.findByText("You are approved");

    const list = panel.getByTestId("notification-list");
    const style = StyleSheet.flatten(list.props.style) ?? {};

    expect(style.maxHeight).toBe(Math.floor(Dimensions.get("window").height * LIST_SHARE_OF_SCREEN));
    expect(style.maxHeight).toBeGreaterThan(0);
    expect(style.flex).toBeUndefined();
    expect(style.flexGrow).toBeUndefined();
    expect(list.props.className ?? "").not.toMatch(/\bflex-1\b/);
  });
});
