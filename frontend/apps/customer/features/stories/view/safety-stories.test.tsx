import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SafetyStoryItem } from "../queries";
import { SafetyStoriesTray } from "./safety-stories-tray";
import { SafetyStoryViewer } from "./safety-story-viewer";

const mockStories: SafetyStoryItem[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "ID Verification",
    caption: "All pros are verified.",
    media_type: "IMAGE",
    media_url: "https://example.com/id.jpg",
    content_type: "image/jpeg",
    display_order: 0,
    published_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 82800000).toISOString(),
    time_remaining_seconds: 82800,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Sanitized Equipment",
    caption: "Equipment is disinfected.",
    media_type: "VIDEO",
    media_url: "https://example.com/sanitized.mp4",
    content_type: "video/mp4",
    display_order: 1,
    published_at: new Date(Date.now() - 7200000).toISOString(),
    expires_at: new Date(Date.now() + 79200000).toISOString(),
    time_remaining_seconds: 79200,
  },
];

describe("SafetyStoriesTray", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders story thumbnails correctly", () => {
    render(<SafetyStoriesTray initialStories={mockStories} />);

    expect(screen.getByText("Safety Stories")).toBeDefined();
    expect(screen.getByText("ID Verification")).toBeDefined();
    expect(screen.getByText("Sanitized Equipment")).toBeDefined();
  });

  it("filters out expired stories based on expiration date", () => {
    const expiredStory: SafetyStoryItem = {
      id: "33333333-3333-3333-3333-333333333333",
      title: "Old Story",
      caption: "Already expired",
      media_type: "IMAGE",
      media_url: "https://example.com/old.jpg",
      content_type: "image/jpeg",
      display_order: 2,
      published_at: new Date(Date.now() - 90000000).toISOString(),
      expires_at: new Date(Date.now() - 3600000).toISOString(), // expired 1h ago
      time_remaining_seconds: 0,
    };

    render(<SafetyStoriesTray initialStories={[...mockStories, expiredStory]} />);

    expect(screen.getByText("ID Verification")).toBeDefined();
    expect(screen.queryByText("Old Story")).toBeNull();
  });

  it("opens viewer when thumbnail clicked and tracks viewed state in localStorage", () => {
    render(<SafetyStoriesTray initialStories={mockStories} />);

    const firstStoryButton = screen.getByLabelText("Watch story: ID Verification");
    fireEvent.click(firstStoryButton);

    // Viewer should now be open
    expect(screen.getByRole("dialog", { name: /Safety Stories Viewer/i })).toBeDefined();

    // Verify localStorage has recorded viewed story ID
    const viewed = JSON.parse(localStorage.getItem("vsolve_viewed_stories") || "[]");
    expect(viewed).toContain("11111111-1111-1111-1111-111111111111");
  });
});

describe("SafetyStoryViewer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates through stories and closes at the end", () => {
    const onClose = vi.fn();
    const onViewed = vi.fn();

    render(
      <SafetyStoryViewer
        isOpen={true}
        stories={mockStories}
        initialIndex={0}
        onClose={onClose}
        onStoryViewed={onViewed}
      />,
    );

    expect(screen.getByText("All pros are verified.")).toBeDefined();

    // Click next zone
    const nextZone = screen.getByLabelText("Next story");
    fireEvent.click(nextZone);

    // Now on second story
    expect(screen.getByText("Equipment is disinfected.")).toBeDefined();

    // Click next zone on last story should trigger onClose
    fireEvent.click(nextZone);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on close button click", () => {
    const onClose = vi.fn();
    render(
      <SafetyStoryViewer
        isOpen={true}
        stories={mockStories}
        initialIndex={0}
        onClose={onClose}
      />,
    );

    const closeBtn = screen.getByLabelText("Close story viewer");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("auto-advances image story after duration", () => {
    const onClose = vi.fn();
    render(
      <SafetyStoryViewer
        isOpen={true}
        stories={mockStories}
        initialIndex={0}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("All pros are verified.")).toBeDefined();

    // Fast-forward 5 seconds (5000ms image duration)
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    // Should advance to second story
    expect(screen.getByText("Equipment is disinfected.")).toBeDefined();
  });
});
