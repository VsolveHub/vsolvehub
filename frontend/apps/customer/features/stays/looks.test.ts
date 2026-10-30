import { describe, expect, it } from "vitest";

import { lookTitle, otherLooksLabel, pickLook, visibleLooks } from "./looks";
import type { StayUnit } from "./model";

const photo = [{ id: "m", url: "https://cdn.example.com/a.jpg", display_order: 0 }];

function look(id: string, name: string, available: number, media = photo, order = 0) {
  return {
    id,
    name,
    display_name: name ? `1 BHK · ${name}` : "1 BHK",
    display_order: order,
    media,
    available_count: available,
    room_count: 3,
  };
}

function unit(looks: ReturnType<typeof look>[], extra: Partial<StayUnit> = {}): StayUnit {
  return { id: "u", name: "1 BHK", nightly_rate_paise: 1, media: photo, looks, ...extra } as StayUnit;
}

describe("room looks for guests", () => {
  it("shows looks with a photo and a free room, in the owner's order", () => {
    const u = unit([look("B", "With balcony", 1, photo, 1), look("A", "", 2), look("C", "Dark", 0, photo, 2)]);
    expect(visibleLooks(u).map((l) => l.id)).toEqual(["A", "B"]);
  });

  it("opens on the look asked for, else the first visible one", () => {
    const u = unit([look("A", "", 0), look("B", "With balcony", 1, photo, 1)]);
    expect(pickLook(u, "A")?.id).toBe("A");
    expect(pickLook(u, "missing")?.id).toBe("B");
    expect(pickLook(u)?.id).toBe("B");
  });

  it("titles a named look after the room type", () => {
    const u = unit([look("A", "", 1), look("B", "With balcony", 1, photo, 1)]);
    expect(lookTitle(u, pickLook(u, "A"))).toBe("1 BHK");
    expect(lookTitle(u, pickLook(u, "B"))).toBe("1 BHK · With balcony");
  });

  it("treats a type with no looks as one look of its own photos", () => {
    const u = unit([], { available_count: 2 });
    expect(visibleLooks(u)).toHaveLength(1);
    expect(visibleLooks(u)[0]?.display_name).toBe("1 BHK");
  });

  it("labels the other looks", () => {
    expect(otherLooksLabel(0)).toBe("");
    expect(otherLooksLabel(1)).toBe("+1 more look");
    expect(otherLooksLabel(2)).toBe("+2 more looks");
  });
});
