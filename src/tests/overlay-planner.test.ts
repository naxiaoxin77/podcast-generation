import { describe, it, expect } from "vitest";
import { parseOverlayResponse, applyTimingConstraints } from "../pipeline/overlay-planner.js";

describe("parseOverlayResponse", () => {
  it("parses valid big-number card", () => {
    const raw = JSON.stringify([
      {
        layout: "big-number",
        title: "GMV蒸发",
        number: 380,
        unit: "亿",
        subtitle: "年度损失",
        startTime: 15,
      },
      {
        layout: "text-highlight",
        text: "腾讯内容电商遭遇重创",
        subtext: "GMV 大幅下滑",
        startTime: 35,
      },
    ]);
    const items = parseOverlayResponse(raw, 10, 60);
    expect(items).toHaveLength(2);
    expect(items[0].slideData.layout).toBe("big-number");
    expect(items[0].startTime).toBe(15);
    expect(items[0].endTime).toBe(25); // startTime + 10
  });

  it("parses valid bullet-list card", () => {
    const raw = JSON.stringify([
      {
        layout: "bullet-list",
        title: "三个原因",
        items: [{ text: "原因一" }, { text: "原因二" }],
        startTime: 20,
      },
      {
        layout: "text-highlight",
        text: "核心问题一目了然",
        startTime: 45,
      },
    ]);
    const items = parseOverlayResponse(raw, 10, 60);
    expect(items[0].slideData.layout).toBe("bullet-list");
  });

  it("skips cards with invalid layout type", () => {
    const raw = JSON.stringify([{ layout: "invalid", startTime: 10 }]);
    const items = parseOverlayResponse(raw, 10, 60);
    expect(items).toHaveLength(0);
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

  it("enforces minimum 12s spacing between cards", () => {
    const items = [
      { startTime: 5, endTime: 15, slideData: { layout: "quote" as const, quote: "a" } },
      { startTime: 10, endTime: 20, slideData: { layout: "quote" as const, quote: "b" } },
    ];
    const result = applyTimingConstraints(items, 0, 60);
    expect(result[1].startTime).toBeGreaterThanOrEqual(result[0].endTime + 12);
  });

  it("does not push first card if already past articleStart + 3", () => {
    const items = [
      { startTime: 10, endTime: 20, slideData: { layout: "quote" as const, quote: "test" } },
    ];
    const result = applyTimingConstraints(items, 0, 60);
    // startTime: 10 > articleStart(0) + 3, should stay at 10
    expect(result[0].startTime).toBe(10);
  });

  it("truncates card endTime to articleEndTime", () => {
    const items = [
      { startTime: 55, endTime: 65, slideData: { layout: "quote" as const, quote: "test" } },
    ];
    const result = applyTimingConstraints(items, 0, 60);
    expect(result[0].endTime).toBe(60); // truncated to articleEndTime
  });

  it("skips cards that start at or after articleEndTime", () => {
    const items = [
      { startTime: 61, endTime: 71, slideData: { layout: "quote" as const, quote: "test" } },
    ];
    const result = applyTimingConstraints(items, 0, 60);
    expect(result).toHaveLength(0);
  });
});
