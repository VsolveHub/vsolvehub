import { describe, expect, it } from "vitest";

import { isOptimizableImage, OPTIMIZED_IMAGE_HOSTS } from "./remote-images";

const R2 = "https://pub-32e84da8140449ddbc61c13539728e0e.r2.dev/Images/Service%20Cover/Fan.jpeg";

describe("isOptimizableImage", () => {
  it("accepts every listed host over https", () => {
    for (const host of OPTIMIZED_IMAGE_HOSTS) {
      expect(isOptimizableImage(`https://${host}/a.jpeg`)).toBe(true);
    }
    expect(isOptimizableImage(R2)).toBe(true);
  });

  it("accepts the app's own public files", () => {
    expect(isOptimizableImage("/catalog/tiles/fan.png")).toBe(true);
  });

  it("refuses hosts the optimizer would answer with a broken image", () => {
    expect(isOptimizableImage("https://cdn.example/a.png")).toBe(false);
    expect(isOptimizableImage("http://pub-32e84da8140449ddbc61c13539728e0e.r2.dev/a.png")).toBe(false);
    expect(isOptimizableImage("//images.unsplash.com/photo-1")).toBe(false);
  });

  it("refuses anything that is not a URL", () => {
    expect(isOptimizableImage("")).toBe(false);
    expect(isOptimizableImage("not a url")).toBe(false);
  });
});
