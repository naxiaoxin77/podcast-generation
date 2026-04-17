import { describe, it, expect } from "vitest";
import { isWithinHours } from "../workflow/obsidian-scan.js";

describe("isWithinHours", () => {
  it("今天日期返回 true", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isWithinHours(`path/${today}/file`, 24)).toBe(true);
  });

  it("昨天日期返回 true（在 24h 内）", () => {
    const yesterday = new Date(Date.now() - 23 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(isWithinHours(`path/${yesterday}/file`, 24)).toBe(true);
  });

  it("两天前日期返回 false", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(isWithinHours(`path/${twoDaysAgo}/file`, 24)).toBe(false);
  });

  it("路径无日期返回 false", () => {
    expect(isWithinHours("path/without/date/file.md", 24)).toBe(false);
  });
});
