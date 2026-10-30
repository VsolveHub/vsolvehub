import { createTranslator } from "@vsolve/ui";
import { describe, expect, it, vi } from "vitest";

import { catalogs } from "@/i18n/catalogs";

const t = createTranslator("en-IN", catalogs["en-IN"]).t;

// `@` resolves to the Customer app under Vitest; supply the partner queries these files import.
vi.mock("@/features/stays/queries", () => ({
  addPartnerStayRoom: vi.fn(),
  byRoomNumber: (a: { number: string }, b: { number: string }) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }),
}));
vi.mock("./room-photos", () => ({ RoomPhotosDraft: () => null }));

const { previewCards } = await import("./guest-preview");
const { addRoomOutcome, sameAsLabel } = await import("./add-room-sheet");

const photo = [{ id: "m", url: "https://cdn.example.com/a.jpg", display_order: 0 }];

function look(id: string, name: string, available: number, media = photo, order = 0) {
  return {
    id,
    name,
    display_name: name ? `1 BHK · ${name}` : "1 BHK",
    display_order: order,
    media,
    available_count: available,
    room_count: 2,
  };
}

describe("How guests see it", () => {
  it("shows a card per look, hiding those without a photo or a room on", () => {
    const unit = {
      name: "1 BHK",
      looks: [look("A", "", 2), look("B", "With balcony", 0, photo, 1), look("C", "Corner", 1, [], 2)],
    };
    const cards = previewCards(unit as never, t);
    expect(cards.map((c) => c.visible)).toEqual([true, false, false]);
    expect(cards[1]?.reason).toBe("Hidden from guests — no room of With balcony is on.");
    expect(cards[2]?.reason).toBe("Hidden from guests — add a photo of Corner.");
  });
});

describe("Add a room", () => {
  it("names the rooms a look is shared with", () => {
    expect(sameAsLabel(["101", "102", "103"], t)).toBe("Same as 101, 102, 103");
    expect(sameAsLabel(["1", "2", "3", "4", "5", "6"], t)).toBe("Same as 1, 2, 3, 4 +2");
    expect(sameAsLabel([], t)).toBe("No rooms yet");
  });

  it("says whether the room joins a card or makes a new one", () => {
    const looks = [look("A", "", 2), look("B", "With balcony", 1, photo, 1)];
    expect(addRoomOutcome("B", looks as never, "1 BHK", t)).toBe(
      'The room joins the "1 BHK · With balcony" card. No new card appears.',
    );
    expect(addRoomOutcome("__new__", looks as never, "1 BHK", t)).toBe(
      "A new 1 BHK card appears once you name this look and add a photo.",
    );
  });
});
