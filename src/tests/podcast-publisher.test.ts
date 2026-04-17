import { describe, it, expect } from "vitest";
import { generateShownote } from "../workflow/podcast-publisher.js";
import type { PodcastMeta } from "../pipeline/types.js";

const meta: PodcastMeta = {
  title: "每日商业快报 - 2026-04-17",
  articleScripts: [
    {
      articleIndex: 0,
      title: "文章标题一",
      text: "这是第一句话。这是第二句话。这是第三句话，不应出现在摘要中。",
      estimatedDuration: 60,
    },
    {
      articleIndex: 1,
      title: "文章标题二",
      text: "只有一句话。",
      estimatedDuration: 30,
    },
  ],
};

describe("generateShownote", () => {
  it("包含节目标题行", () => {
    const result = generateShownote(meta);
    expect(result).toContain("# 每日商业快报 - 2026-04-17");
  });

  it("包含'本期内容'小标题", () => {
    const result = generateShownote(meta);
    expect(result).toContain("## 本期内容");
  });

  it("每篇文章标题加粗", () => {
    const result = generateShownote(meta);
    expect(result).toContain("**文章标题一**");
    expect(result).toContain("**文章标题二**");
  });

  it("取口播稿前 2 句作为摘要，不含第 3 句", () => {
    const result = generateShownote(meta);
    expect(result).toContain("这是第一句话。这是第二句话。");
    expect(result).not.toContain("这是第三句话");
  });

  it("只有 1 句时取全文", () => {
    const result = generateShownote(meta);
    expect(result).toContain("只有一句话。");
  });

  it("文章 text 为空时不崩溃，摘要为空行", () => {
    const emptyMeta: PodcastMeta = {
      title: "测试",
      articleScripts: [{ articleIndex: 0, title: "空", text: "", estimatedDuration: 0 }],
    };
    expect(() => generateShownote(emptyMeta)).not.toThrow();
  });

  it("shownote 以换行符结尾", () => {
    const result = generateShownote(meta);
    expect(result.endsWith("\n")).toBe(true);
  });
});
