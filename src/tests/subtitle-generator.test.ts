import { describe, it, expect } from "vitest";
import { generateSubtitleCues } from "../pipeline/subtitle-generator.js";
import type { ArticleScript, SegmentTiming } from "../pipeline/types.js";

const timings: SegmentTiming[] = [
  { articleIndex: -1, title: "开场白", startTime: 0, endTime: 10 },
  { articleIndex: 0,  title: "文章A",  startTime: 10, endTime: 30 },
  { articleIndex: -2, title: "结束语", startTime: 30, endTime: 36 },
];

const scripts: ArticleScript[] = [
  { articleIndex: 0, title: "文章A", text: "第一句话。第二句话！第三句话？", estimatedDuration: 20 },
];

describe("generateSubtitleCues", () => {
  it("returns one cue per sentence across all segments", () => {
    const cues = generateSubtitleCues("你好。今天内容。", scripts, "感谢收听。", timings);
    // intro: 2 sentences, article: 3 sentences, outro: 1 sentence = 6 total
    expect(cues).toHaveLength(6);
  });

  it("cue timestamps are sequential and non-overlapping", () => {
    const cues = generateSubtitleCues("你好。今天内容。", scripts, "感谢收听。", timings);
    for (let i = 0; i < cues.length - 1; i++) {
      expect(cues[i].endTime).toBeCloseTo(cues[i + 1].startTime, 5);
    }
  });

  it("first cue starts at segment startTime", () => {
    const cues = generateSubtitleCues("你好。今天内容。", scripts, "感谢收听。", timings);
    expect(cues[0].startTime).toBeCloseTo(0, 5);
  });

  it("last cue in a segment ends at segment endTime", () => {
    const cues = generateSubtitleCues("你好。今天内容。", scripts, "感谢收听。", timings);
    // intro ends at 10s — second cue (last of intro) should end at 10
    expect(cues[1].endTime).toBeCloseTo(10, 5);
  });

  it("allocates time proportionally by character count", () => {
    // intro: "一。二二。" — sentence 1 has 1 char, sentence 2 has 2 chars
    // total intro duration = 10s → sentence1 = 10 * 1/3 ≈ 3.33s, sentence2 = 10 * 2/3 ≈ 6.67s
    const cues = generateSubtitleCues("一。二二。", scripts, "感谢收听。", timings);
    expect(cues[0].endTime - cues[0].startTime).toBeCloseTo(10 / 3, 1);
    expect(cues[1].endTime - cues[1].startTime).toBeCloseTo(20 / 3, 1);
  });

  it("handles text with no punctuation as a single sentence", () => {
    const cues = generateSubtitleCues("无标点文本", scripts, "感谢收听。", timings);
    expect(cues[0].text).toBe("无标点文本");
    expect(cues[0].startTime).toBeCloseTo(0, 5);
    expect(cues[0].endTime).toBeCloseTo(10, 5);
  });
});
