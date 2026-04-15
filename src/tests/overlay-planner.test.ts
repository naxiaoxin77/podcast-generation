import { describe, it, expect } from "vitest";
import { parseOverlayResponse, applyTimingConstraints } from "../pipeline/overlay-planner.js";

describe("parseOverlayResponse", () => {
  it("parses valid big-number card", () => {
    const raw = JSON.stringify([{
      layout: "big-number",
      title: "GMV蒸发",
      number: 380,
      unit: "亿",
      subtitle: "年度损失",
      startTime: 15,
    }]);
    const items = parseOverlayResponse(raw, 10, 60);
    expect(items).toHaveLength(1);
    expect(items[0].slideData.layout).toBe("big-number");
    expect(items[0].startTime).toBe(15);
    expect(items[0].endTime).toBe(25); // startTime + 10
  });

  it("parses valid bullet-list card", () => {
    const raw = JSON.stringify([{
      layout: "bullet-list",
      title: "三个原因",
      items: [{ text: "原因一" }, { text: "原因二" }],
      startTime: 20,
    }]);
    const items = parseOverlayResponse(raw, 10, 60);
    expect(items[0].slideData.layout).toBe("bullet-list");
  });

  it("throws on invalid layout type", () => {
    const raw = JSON.stringify([{ layout: "invalid", startTime: 10 }]);
    expect(() => parseOverlayResponse(raw, 10, 60)).toThrow();
  });
});

describe("applyTimingConstraints", () => {
  it("pushes first card to articleStart + 3 if too early", () => {
    const items = [
      { startTime: 1, endTime: 11, slideData: { layout: "quote" as const, quote: "test" } },
    ];
    const result = applyTimingConstraints(items, 0, 60);
    expect(result[0].startTime).toBe(3);
    expect(result[0].endTime).toBe(13);
  });

  it("enforces minimum 15s spacing between cards", () => {
    const items = [
      { startTime: 5, endTime: 15, slideData: { layout: "quote" as const, quote: "a" } },
      { startTime: 10, endTime: 20, slideData: { layout: "quote" as const, quote: "b" } },
    ];
    const result = applyTimingConstraints(items, 0, 60);
    expect(result[1].startTime).toBeGreaterThanOrEqual(result[0].endTime + 15);
  });
});
