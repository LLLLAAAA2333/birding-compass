import { describe, expect, it } from "vitest";
import { appleMapsUrl } from "./appleMaps";

describe("Apple Maps link", () => {
  it("keeps the birding coordinates and treats the place name as a label", () => {
    const url = new URL(appleMapsUrl("天鹅湖 & 周边", 31.816, 117.226));
    expect(url.origin).toBe("https://maps.apple.com");
    expect(url.searchParams.get("ll")).toBe("31.816,117.226");
    expect(url.searchParams.get("q")).toBe("天鹅湖 & 周边");
    expect([...url.searchParams.keys()]).toEqual(["ll", "q"]);
  });
});
