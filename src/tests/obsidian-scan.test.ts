import { describe, it, expect } from "vitest";
import { isWithinHours } from "../workflow/obsidian-scan.js";

describe("isWithinHours", () => {
  it("今天日期返回 true", () => {
    const today = new Date().toLocaleDateString("sv"); // "sv" locale 输出 YYYY-MM-DD 格式
    expect(isWithinHours(`path/${today}/file`, 24)).toBe(true);
  });

  it("昨天日期返回 true（在 24h 内）", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toLocaleDateString("sv"); // "sv" locale 输出 YYYY-MM-DD 格式
    expect(isWithinHours(`path/${yesterday}/file`, 24)).toBe(true);
  });

  it("两天前日期返回 false", () => {
    // 使用一个确定性的历史日期，避免时区相关的边界问题
    expect(isWithinHours("path/2020-01-01/article", 24)).toBe(false);
  });

  it("路径无日期返回 false", () => {
    expect(isWithinHours("path/without/date/file.md", 24)).toBe(false);
  });
});
