import { describe, expect, it } from "vitest";

import type { Category } from "@/features/catalog/client-queries";

import { ALL_TILE_SLUG, buildBrowseTiles } from "./taxonomy-tiles";

describe("buildBrowseTiles", () => {
  it("prepends the All tile and merges category artwork & descriptions into taxonomy subcategories", () => {
    const category = {
      id: "cat-1",
      slug: "rental-services",
      name: "Rental Services",
      description: "Rent gear",
      image_url: "https://cdn.example.com/rental-services.png",
      icon_key: "service",
      subcategories: [
        {
          id: "sub-1",
          slug: "camera-media-equipment",
          name: "Camera & Media Equipment",
          description: "DSLRs, lights and audio kits.",
          image_url: "https://cdn.example.com/camera.png",
          icon_key: "security-camera",
        },
      ],
    } as unknown as Category;

    const tiles = buildBrowseTiles({
      taxonomy: [
        {
          id: "1",
          slug: "camera-media-equipment",
          name: "Camera & Media Equipment",
          services: [{ id: "svc-1", slug: "dslr-camera", name: "DSLR Camera" }],
        },
        {
          id: "2",
          slug: "construction-equipment",
          name: "Construction Equipment",
          services: [],
        },
      ],
      category,
      allLabel: "All Equipment",
      allDescription: "All tools & equipment",
    });

    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toMatchObject({
      slug: ALL_TILE_SLUG,
      name: "All Equipment",
      imageUrl: "https://cdn.example.com/rental-services.png",
    });
    expect(tiles[1]).toMatchObject({
      slug: "camera-media-equipment",
      imageUrl: "https://cdn.example.com/camera.png",
      description: "DSLRs, lights and audio kits.",
      services: [{ id: "svc-1", slug: "dslr-camera", name: "DSLR Camera" }],
    });
    expect(tiles[2]).toMatchObject({
      slug: "construction-equipment",
      imageUrl: "",
      description: "",
    });
  });
});

