import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OpsSafetyStory } from "../queries";
import { StoriesWorkspace } from "./stories-workspace";

const mockOpsStories: OpsSafetyStory[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Technician ID Verification",
    caption: "Pros carry verified badges.",
    media_type: "IMAGE",
    media_url: "https://example.com/id.jpg",
    original_name: "id.jpg",
    content_type: "image/jpeg",
    size_bytes: 1024 * 500,
    display_order: 0,
    is_published: true,
    is_active: true,
    created_by_name: "Ops Team",
    published_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 82800000).toISOString(),
    time_remaining_seconds: 82800,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Tool Sterilization Demo",
    caption: "Watch how instruments are cleaned.",
    media_type: "VIDEO",
    media_url: "https://example.com/demo.mp4",
    original_name: "demo.mp4",
    content_type: "video/mp4",
    size_bytes: 1024 * 1024 * 5,
    display_order: 1,
    is_published: true,
    is_active: false, // Expired
    created_by_name: "Ops Team",
    published_at: new Date(Date.now() - 90000000).toISOString(),
    expires_at: new Date(Date.now() - 3600000).toISOString(),
    time_remaining_seconds: 0,
    created_at: new Date(Date.now() - 90000000).toISOString(),
    updated_at: new Date(Date.now() - 90000000).toISOString(),
  },
];

vi.mock("../queries", async () => {
  const actual = await vi.importActual("../queries");
  return {
    ...actual,
    useOpsStories: (filter: string) => ({
      data: filter === "expired" ? [mockOpsStories[1]] : mockOpsStories,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useCreateOpsStory: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useUpdateOpsStory: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useDeleteOpsStory: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

describe("StoriesWorkspace", () => {
  it("renders metrics, filters, and stories", () => {
    render(<StoriesWorkspace />);

    // Check stats headers
    expect(screen.getByText("Total Stories")).toBeDefined();
    expect(screen.getByText("Live (Active Now)")).toBeDefined();

    // Check filter buttons
    expect(screen.getByRole("button", { name: "all" })).toBeDefined();
    expect(screen.getByRole("button", { name: "active" })).toBeDefined();
    expect(screen.getByRole("button", { name: "expired" })).toBeDefined();

    // Check story items
    expect(screen.getByText("Technician ID Verification")).toBeDefined();
    expect(screen.getByText("Tool Sterilization Demo")).toBeDefined();
    expect(screen.getByText("IMAGE")).toBeDefined();
    expect(screen.getByText("VIDEO")).toBeDefined();
  });

  it("opens upload dialog when Upload Safety Story clicked", () => {
    render(<StoriesWorkspace />);

    const uploadBtn = screen.getByRole("button", { name: /Upload Safety Story/i });
    fireEvent.click(uploadBtn);

    expect(screen.getByRole("dialog", { name: /Upload Safety Story/i })).toBeDefined();
  });

  it("opens edit dialog when edit button clicked", () => {
    render(<StoriesWorkspace />);

    const editButtons = screen.getAllByLabelText("Edit story");
    expect(editButtons[0]).toBeDefined();
    fireEvent.click(editButtons[0]!);

    expect(screen.getByRole("dialog", { name: /Edit Safety Story/i })).toBeDefined();
    expect(screen.getByText(/24-Hour Expiration Preservation/i)).toBeDefined();
  });
});
