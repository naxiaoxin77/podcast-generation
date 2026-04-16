import { describe, it, expect } from "vitest";
import {
  parseTranscriptResponse,
  applyOffset,
  type TranscribedCue,
} from "../pipeline/srt-generator.js";

describe("parseTranscriptResponse", () => {
  it("标准单行格式", () => {
    const result = parseTranscriptResponse("[01:23.456] 今天的新闻");
    expect(result).toEqual([{ relativeTime: 83.456, text: "今天的新闻" }]);
  });

  it("多行解析", () => {
    const result = parseTranscriptResponse(
      "[00:00.500] 第一句。\n[00:03.200] 第二句。"
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ relativeTime: 0.5, text: "第一句。" });
    expect(result[1]).toEqual({ relativeTime: 3.2, text: "第二句。" });
  });

  it("无法解析时返回空数组，不抛出", () => {
    expect(parseTranscriptResponse("无法识别的格式")).toEqual([]);
  });

  it("超过 1 小时的 H:MM:SS.mmm 格式", () => {
    const result = parseTranscriptResponse("[1:02:03.456] 长音频");
    expect(result).toEqual([{ relativeTime: 3723.456, text: "长音频" }]);
  });

  it("包裹在 markdown 代码块中时能正确提取", () => {
    const result = parseTranscriptResponse("```\n[00:01.000] 句子\n```");
    expect(result).toEqual([{ relativeTime: 1.0, text: "句子" }]);
  });

  it("包含 ```plaintext 标识符的代码块", () => {
    const result = parseTranscriptResponse(
      "```plaintext\n[00:05.000] 内容\n```"
    );
    expect(result).toEqual([{ relativeTime: 5.0, text: "内容" }]);
  });
});

describe("applyOffset", () => {
  it("单句：endTime 按字符数估算", () => {
    const input: TranscribedCue[] = [{ relativeTime: 2.5, text: "测试内容" }];
    const result = applyOffset(input, 10);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(12.5);
    expect(result[0].endTime).toBeGreaterThan(12.5);
    expect(result[0].text).toBe("测试内容");
  });

  it("多句：中间句的 endTime = 下一句 startTime", () => {
    const input: TranscribedCue[] = [
      { relativeTime: 0.0, text: "第一句" },
      { relativeTime: 3.0, text: "第二句" },
    ];
    const result = applyOffset(input, 5);
    expect(result[0].startTime).toBe(5.0);
    expect(result[0].endTime).toBe(8.0); // 5 + 3
    expect(result[1].startTime).toBe(8.0);
  });

  it("偏移为 0 时不改变相对时间", () => {
    const input: TranscribedCue[] = [{ relativeTime: 1.5, text: "abc" }];
    const result = applyOffset(input, 0);
    expect(result[0].startTime).toBe(1.5);
  });

  it("空数组返回空数组", () => {
    expect(applyOffset([], 10)).toEqual([]);
  });
});
