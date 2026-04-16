# SRT 精确字幕 + 音频波形可视化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Gemini 音频转录替换字幕估算逻辑，添加全宽波形可视化条，统一输出文件命名为 `laona-digest-YYYY-MM-DD.{ext}`。

**Architecture:** 三条独立改动线：① `naming.ts` 纯工具函数，② `srt-generator.ts` 纯函数层 + Gemini API 层，③ WaveformBar Remotion 组件；最后在 `index.ts` 串联。各模块均可独立测试。

**Tech Stack:** Node.js ESM + TypeScript, Vitest, `@google/generative-ai`, `@remotion/media-utils`, Remotion 4.x + React 19

---

## 文件一览

| 状态 | 路径 | 说明 |
|------|------|------|
| **新增** | `src/utils/naming.ts` | 输出文件命名工具函数 |
| **新增** | `src/tests/naming.test.ts` | naming 单元测试 |
| **新增** | `src/pipeline/srt-generator.ts` | Gemini 音频转录 → SubtitleCue[] |
| **新增** | `src/tests/srt-generator.test.ts` | srt-generator 单元测试（纯函数 + 降级） |
| **新增** | `src/remotion/components/WaveformBar.tsx` | 全宽波形条 Remotion 组件 |
| **修改** | `src/remotion/design.config.ts` | 新增 `waveform` 配置节；`subtitle.bottomOffset` 48 → 52 |
| **修改** | `src/remotion/PodcastVideo.tsx` | 在 Layer 4/5 之间插入 WaveformBar |
| **修改** | `src/index.ts` | Step 5 替换为 `generateSrtSubtitleCues`；MP3/MP4 路径使用 `resolveOutputName` |
| **修改** | `package.json` | 新增 `@remotion/media-utils ^4.0.0` |

---

## Task 1: 输出文件命名工具

**Files:**
- Create: `src/utils/naming.ts`
- Create: `src/tests/naming.test.ts`

### 接口设计

```typescript
// src/utils/naming.ts
import fs from "fs";
import path from "path";

/**
 * 返回当日首个可用的输出文件路径。
 * 格式：laona-digest-YYYY-MM-DD.{ext}
 * 已存在则递增后缀：laona-digest-YYYY-MM-DD-2.ext, -3.ext ...
 * mp3 和 mp4 分别独立计数。
 */
export function resolveOutputName(outputDir: string, ext: "mp3" | "mp4"): string {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const base = `laona-digest-${today}`;

  const candidate = path.join(outputDir, `${base}.${ext}`);
  if (!fs.existsSync(candidate)) return candidate;

  let n = 2;
  while (true) {
    const next = path.join(outputDir, `${base}-${n}.${ext}`);
    if (!fs.existsSync(next)) return next;
    n++;
  }
}
```

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/naming.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveOutputName } from "../utils/naming.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "naming-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveOutputName", () => {
  it("首次生成 mp3 时返回不带后缀的路径", () => {
    const result = resolveOutputName(tmpDir, "mp3");
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(path.join(tmpDir, `laona-digest-${today}.mp3`));
  });

  it("已有同日 mp3 时递增为 -2", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}.mp3`), "");
    const result = resolveOutputName(tmpDir, "mp3");
    expect(result).toBe(path.join(tmpDir, `laona-digest-${today}-2.mp3`));
  });

  it("已有 -1 和 -2 时递增为 -3", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}.mp3`), "");
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}-2.mp3`), "");
    const result = resolveOutputName(tmpDir, "mp3");
    expect(result).toBe(path.join(tmpDir, `laona-digest-${today}-3.mp3`));
  });

  it("mp3 和 mp4 计数互不影响", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}.mp3`), "");
    const mp4Result = resolveOutputName(tmpDir, "mp4");
    expect(mp4Result).toBe(path.join(tmpDir, `laona-digest-${today}.mp4`));
  });

  it("返回的路径包含 outputDir 前缀", () => {
    const result = resolveOutputName(tmpDir, "mp4");
    expect(result.startsWith(tmpDir)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```
npx vitest run src/tests/naming.test.ts
```
预期：FAIL — `resolveOutputName` not exported

- [ ] **Step 3: 实现 `src/utils/naming.ts`**（参考上方接口设计，原样照搬即可）

- [ ] **Step 4: 再次运行测试，确认全部通过**

```
npx vitest run src/tests/naming.test.ts
```
预期：5 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/utils/naming.ts src/tests/naming.test.ts
git commit -m "feat: add resolveOutputName utility with laona-digest date prefix"
```

---

## Task 2: SRT 纯函数层 + 单元测试

**Files:**
- Create: `src/pipeline/srt-generator.ts`（仅纯函数部分）
- Create: `src/tests/srt-generator.test.ts`（纯函数测试）

### 纯函数接口

```typescript
// src/pipeline/srt-generator.ts（本 Task 只实现纯函数部分）
import type { SubtitleCue, SegmentTiming, ArticleScript } from "./types.js";

export interface TranscribedCue {
  relativeTime: number; // 秒，相对该段起点
  text: string;
}

/**
 * 解析 Gemini 响应文本，提取 [MM:SS.mmm] 或 [H:MM:SS.mmm] 格式时间戳。
 * 容错：去除 markdown 代码块包裹，解析失败时返回 []（不抛出）。
 */
export function parseTranscriptResponse(text: string): TranscribedCue[] {
  // 去除 ```...``` 代码块包裹
  const cleaned = text.replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/, "");

  const pattern = /\[(?:(\d+):)?(\d{2}):(\d{2}\.\d{1,3})\]\s*(.+)/g;
  const cues: TranscribedCue[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    const sentence = match[4].trim();
    if (!sentence) continue;
    cues.push({
      relativeTime: hours * 3600 + minutes * 60 + seconds,
      text: sentence,
    });
  }

  return cues;
}

/**
 * 将 TranscribedCue[] 应用时间偏移，输出 SubtitleCue[]。
 * endTime 由下一句 startTime 填充；最后一句按 text.length / 5 秒估算时长。
 */
export function applyOffset(
  cues: TranscribedCue[],
  segmentStartTime: number
): SubtitleCue[] {
  if (cues.length === 0) return [];

  const result: SubtitleCue[] = cues.map((c, i) => {
    const startTime = segmentStartTime + c.relativeTime;
    const nextRelative = cues[i + 1]?.relativeTime;
    const endTime =
      nextRelative !== undefined
        ? segmentStartTime + nextRelative
        : startTime + Math.max(1, c.text.length / 5);
    return { startTime, endTime, text: c.text };
  });

  return result;
}
```

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/srt-generator.test.ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

```
npx vitest run src/tests/srt-generator.test.ts
```
预期：FAIL — `parseTranscriptResponse` not exported

- [ ] **Step 3: 实现纯函数（`src/pipeline/srt-generator.ts` 纯函数部分）**

按上方接口设计实现 `parseTranscriptResponse` 和 `applyOffset`，文件末尾暂留 `export {}` 占位，API 函数在 Task 3 添加。

- [ ] **Step 4: 再次运行测试，确认全部通过**

```
npx vitest run src/tests/srt-generator.test.ts
```
预期：10 tests passed

- [ ] **Step 5: 提交**

```bash
git add src/pipeline/srt-generator.ts src/tests/srt-generator.test.ts
git commit -m "feat: add srt-generator pure functions with timestamp parsing and offset"
```

---

## Task 3: SRT API 集成层（transcribeSegment + generateSrtSubtitleCues）

**Files:**
- Modify: `src/pipeline/srt-generator.ts`（添加 API 调用函数）
- Modify: `src/tests/srt-generator.test.ts`（添加降级逻辑测试）

### API 层接口

```typescript
// 追加到 src/pipeline/srt-generator.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs";
import path from "path";
import { generateSubtitleCues } from "./subtitle-generator.js";

export interface SrtFallbackData {
  introText: string;
  articleScripts: ArticleScript[];
  outroText: string;
}

/**
 * 上传单段 MP3 到 Gemini Files API，转录后返回带全局时间戳的 SubtitleCue[]。
 * mimeType 必须用 "audio/mpeg"（不是 "audio/mp3"）。
 * 无论成功失败，均在函数退出前删除远端临时文件（传 file.name，格式 "files/xxxx"）。
 */
export async function transcribeSegment(
  audioPath: string,
  segmentStartTime: number,
  apiKey: string
): Promise<SubtitleCue[]> {
  const fileManager = new GoogleAIFileManager(apiKey);
  const genai = new GoogleGenerativeAI(apiKey);

  // 上传文件（mimeType 必须是 "audio/mpeg"，不能是 "audio/mp3"）
  const uploadResult = await fileManager.uploadFile(audioPath, {
    mimeType: "audio/mpeg",
    displayName: path.basename(audioPath),
  });
  const fileUri = uploadResult.file.uri;
  const fileName = uploadResult.file.name; // "files/xxxx"，用于 deleteFile

  try {
    const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([
      {
        fileData: { mimeType: "audio/mpeg", fileUri },
      },
      {
        text: "请将以下音频转录为文字，每句话用时间戳标注，格式：[MM:SS.mmm] 文字内容\n只输出时间戳和文字，不要任何说明。",
      },
    ]);
    const text = result.response.text();
    const cues = parseTranscriptResponse(text);
    return applyOffset(cues, segmentStartTime);
  } finally {
    // 无论成功失败均删除远端文件，传 file.name（不是 fileUri）
    try {
      await fileManager.deleteFile(fileName);
    } catch {
      // 删除失败不影响主流程
    }
  }
}

/**
 * 转录所有段并合并为全局 SubtitleCue[]。
 * 单段 API 转录失败时降级到字符数估算；
 * 所有可访问的 TTS 文件均 API 失败时整体降级（文件不存在不计入 API 失败）。
 */
export async function generateSrtSubtitleCues(
  timings: SegmentTiming[],
  ttsDir: string,
  apiKey: string,
  fallback: SrtFallbackData
): Promise<SubtitleCue[]> {
  const sorted = [...timings].sort((a, b) => a.startTime - b.startTime);
  const allCues: SubtitleCue[] = [];
  // 只跟踪"有文件但 API 失败"的段数，文件缺失不参与计数
  let apiFailed = 0;
  let apiAttempted = 0;

  for (const timing of sorted) {
    // 确定该段 TTS 文件路径
    let segFileName: string;
    if (timing.articleIndex === -1) segFileName = "intro.mp3";
    else if (timing.articleIndex === -2) segFileName = "outro.mp3";
    else segFileName = `article-${String(timing.articleIndex).padStart(2, "0")}.mp3`;

    const segAudioPath = path.join(ttsDir, segFileName);

    // 若文件不存在，直接降级（不计入 API 失败统计）
    if (!fs.existsSync(segAudioPath)) {
      console.warn(`[srt-generator] 文件不存在，降级估算: ${segAudioPath}`);
      allCues.push(...getFallbackCuesForSegment(timing, fallback));
      continue;
    }

    apiAttempted++;
    try {
      const cues = await transcribeSegment(segAudioPath, timing.startTime, apiKey);
      if (cues.length === 0) throw new Error("Empty transcription");
      allCues.push(...cues);
    } catch (err) {
      console.warn(`[srt-generator] 段 ${segFileName} 转录失败，降级估算:`, err);
      apiFailed++;
      allCues.push(...getFallbackCuesForSegment(timing, fallback));
    }
  }

  // 如果所有尝试过的段均 API 失败，整体回退（避免零散降级的拼接质量问题）
  if (apiAttempted > 0 && apiFailed === apiAttempted) {
    console.warn("[srt-generator] 所有段转录失败，整体回退到估算模式");
    return generateSubtitleCues(
      fallback.introText,
      fallback.articleScripts,
      fallback.outroText,
      timings
    );
  }

  return allCues.sort((a, b) => a.startTime - b.startTime);
}

/** 单段降级：通过 articleIndex 选取对应文本，调用估算版 */
function getFallbackCuesForSegment(
  timing: SegmentTiming,
  fallback: SrtFallbackData
): SubtitleCue[] {
  if (timing.articleIndex === -1) {
    return generateSubtitleCues(fallback.introText, [], "", [timing]);
  } else if (timing.articleIndex === -2) {
    return generateSubtitleCues("", [], fallback.outroText, [timing]);
  } else {
    const script = fallback.articleScripts.find(
      (s) => s.articleIndex === timing.articleIndex
    );
    if (!script) return [];
    return generateSubtitleCues("", [script], "", [timing]);
  }
}
```

- [ ] **Step 1: 写降级逻辑测试（追加到 srt-generator.test.ts）**

```typescript
// 追加到 src/tests/srt-generator.test.ts
import { generateSrtSubtitleCues, type SrtFallbackData } from "../pipeline/srt-generator.js";
import type { SegmentTiming, ArticleScript } from "../pipeline/types.js";

describe("generateSrtSubtitleCues 降级策略", () => {
  const timings: SegmentTiming[] = [
    { articleIndex: -1, title: "开场白", startTime: 0, endTime: 10 },
    { articleIndex: 0, title: "文章一", startTime: 10, endTime: 30 },
    { articleIndex: -2, title: "结束语", startTime: 30, endTime: 40 },
  ];

  const fallback: SrtFallbackData = {
    introText: "欢迎收听今天的节目。",
    articleScripts: [
      {
        articleIndex: 0,
        title: "文章一",
        text: "这是文章一的内容。非常有趣。",
        estimatedDuration: 10,
      } as ArticleScript,
    ],
    outroText: "感谢收听，再见。",
  };

  it("TTS 文件不存在时降级估算并返回非空数组", async () => {
    // ttsDir 指向不存在的目录，所有段都会文件缺失降级
    const cues = await generateSrtSubtitleCues(
      timings,
      "/nonexistent/tts",
      "fake-key",
      fallback
    );
    expect(cues.length).toBeGreaterThan(0);
    // 降级的结果时间戳：第一条从 0 开始，最后一条 startTime 在 timings 范围内
    expect(cues[0].startTime).toBeGreaterThanOrEqual(0);
    // endTime 允许略超段边界（字符数估算会外推），只验证 startTime 上界
    expect(cues[cues.length - 1].startTime).toBeLessThan(40);
  });

  it("降级结果按 startTime 升序排列", async () => {
    const cues = await generateSrtSubtitleCues(
      timings,
      "/nonexistent/tts",
      "fake-key",
      fallback
    );
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startTime).toBeGreaterThanOrEqual(cues[i - 1].startTime);
    }
  });
});
```

- [ ] **Step 2: 运行测试，确认新增测试失败**

```
npx vitest run src/tests/srt-generator.test.ts
```
预期：前 10 个 PASS，新增 2 个 FAIL（`generateSrtSubtitleCues` not exported）

- [ ] **Step 3: 在 `src/pipeline/srt-generator.ts` 追加 API 层**

按上方接口设计实现 `transcribeSegment`、`generateSrtSubtitleCues`、`getFallbackCuesForSegment`（私有）。

> **注意：** `@google/generative-ai` 4.x 的 Files API 通过 `new GoogleAIFileManager(apiKey)` 访问（`import { GoogleAIFileManager } from "@google/generative-ai/server"`），不是 `genai.uploadFile`。实际调用方式：
> ```typescript
> import { GoogleAIFileManager } from "@google/generative-ai/server";
> const fileManager = new GoogleAIFileManager(apiKey);
> const uploadResult = await fileManager.uploadFile(audioPath, { mimeType: "audio/mpeg", displayName: ... });
> const fileUri = uploadResult.file.uri;
> // 用完后
> await fileManager.deleteFile(uploadResult.file.name); // name 格式 "files/xxxx"
> ```
> 在 generateContent 中传入 `{ fileData: { mimeType: "audio/mpeg", fileUri } }` 不变。

- [ ] **Step 4: 运行全部 srt-generator 测试，确认通过**

```
npx vitest run src/tests/srt-generator.test.ts
```
预期：12 tests passed

- [ ] **Step 5: 运行全量测试，确认无回归**

```
npx vitest run
```

- [ ] **Step 6: 提交**

```bash
git add src/pipeline/srt-generator.ts src/tests/srt-generator.test.ts
git commit -m "feat: add srt-generator Gemini transcription with per-segment fallback"
```

---

## Task 4: WaveformBar 组件 + design.config 更新 + 安装依赖

**Files:**
- Create: `src/remotion/components/WaveformBar.tsx`
- Modify: `src/remotion/design.config.ts`
- Modify: `package.json`

### design.config.ts 改动

在 `subtitle` 块：
```typescript
// 修改 subtitle.bottomOffset: 48 → 52
bottomOffset: 52,
```

在文件末尾（`} as const;` 之前）新增：
```typescript
waveform: {
  height: 52,
  bottomOffset: 100,
  barWidth: 3,
  barGap: 2,
  barColor: "rgba(232, 200, 122, 0.6)",
  minBarHeight: 2,
  maxBarHeight: 44,
  numberOfSamples: 128,
  padding: 40,
},
```

### WaveformBar.tsx

```tsx
// src/remotion/components/WaveformBar.tsx
import React from "react";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { designConfig } from "../design.config.js";

interface Props {
  audioPath: string; // 相对 publicDir，如 "podcast.mp3"
}

export const WaveformBar: React.FC<Props> = ({ audioPath }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { waveform } = designConfig;

  const audioData = useAudioData(staticFile(audioPath));
  if (!audioData) return null;

  const visualization = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: waveform.numberOfSamples,
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: waveform.bottomOffset,
        left: 0,
        right: 0,
        height: waveform.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: waveform.barGap,
        paddingLeft: waveform.padding,
        paddingRight: waveform.padding,
      }}
    >
      {visualization.map((amplitude, i) => {
        const barHeight = Math.max(
          waveform.minBarHeight,
          amplitude * waveform.maxBarHeight
        );
        return (
          <div
            key={i}
            style={{
              width: waveform.barWidth,
              height: barHeight,
              background: waveform.barColor,
              borderRadius: waveform.barWidth / 2,
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
};
```

- [ ] **Step 1: 安装 `@remotion/media-utils`**

```bash
npm install @remotion/media-utils@^4.0.0
```

验证 `package.json` 的 `dependencies` 中出现 `"@remotion/media-utils": "^4.0.0"`

- [ ] **Step 2: 修改 `design.config.ts`**

修改 `subtitle.bottomOffset`（第 38 行）：`48` → `52`

在 `} as const;` 前（第 174 行之前）插入 `waveform` 配置节（见上方代码）。

- [ ] **Step 3: 创建 `WaveformBar.tsx`**（参照上方完整代码）

- [ ] **Step 4: TypeScript 类型检查**

```bash
npx tsc --noEmit
```
预期：0 errors

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json src/remotion/design.config.ts src/remotion/components/WaveformBar.tsx
git commit -m "feat: add WaveformBar component and waveform design config"
```

---

## Task 5: 将 WaveformBar 插入 PodcastVideo

**Files:**
- Modify: `src/remotion/PodcastVideo.tsx`

当前层次（第 25-51 行）：
```
Layer 1: PodcastBackground
Layer 2: Audio
Layer 3: SegmentTitleCard
Layer 4: DataOverlay
Layer 5: SubtitleBar
Layer 6: HUD
```

目标：在 Layer 4 和 Layer 5 之间插入 WaveformBar（Layer 4.5）。

- [ ] **Step 1: 修改 `PodcastVideo.tsx`**

在文件顶部 import 列表追加：
```typescript
import { WaveformBar } from "./components/WaveformBar.js";
```

在 `{/* Layer 4: Data overlays */}` 块之后、`{/* Layer 5: Subtitles */}` 之前插入：
```tsx
{/* Layer 4.5: Waveform */}
<WaveformBar audioPath={audioPath} />
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```
预期：0 errors

- [ ] **Step 3: Remotion 预览验证（可选，有 Remotion preview 环境时执行）**

```bash
npm run preview
```
手动观察视频底部出现波形条，位于字幕上方，字幕条位置正确。

- [ ] **Step 4: 提交**

```bash
git add src/remotion/PodcastVideo.tsx
git commit -m "feat: insert WaveformBar layer 4.5 into PodcastVideo"
```

---

## Task 6: index.ts 更新——SRT 转录 + 统一命名

**Files:**
- Modify: `src/index.ts`

### 改动点 A：导入

在现有 import 列表中追加：
```typescript
import { generateSrtSubtitleCues } from "./pipeline/srt-generator.js";
import { resolveOutputName } from "./utils/naming.js";
```

删除（或保留作备用）：
```typescript
import { generateSubtitleCues } from "./pipeline/subtitle-generator.js";
// ↑ 已被 srt-generator 内部调用，index.ts 不再直接 import
```

### 改动点 B：Step 4 MP3 命名（第 191 行）

```typescript
// 旧
const finalAudioPath = path.join(config.outputDir, `podcast-${Date.now()}.mp3`);

// 新
const finalAudioPath = resolveOutputName(config.outputDir, "mp3");
```

### 改动点 C：Step 5 字幕生成（第 212-217 行）

```typescript
// 旧
subtitleCues = generateSubtitleCues(
  introText,
  podcastMeta.articleScripts,
  outroText,
  allTimings
);

// 新
subtitleCues = await generateSrtSubtitleCues(
  allTimings,
  ttsDir,
  config.geminiApiKey,
  { introText, articleScripts: podcastMeta.articleScripts, outroText }
);
```

### 改动点 D：Step 7 MP4 命名（第 246 行）

```typescript
// 旧
const videoOutputPath = path.join(config.outputDir, `podcast-${Date.now()}.mp4`);

// 新
const videoOutputPath = resolveOutputName(config.outputDir, "mp4");
```

### 改动点 E：`--video-only` 快速路径 MP4 命名（第 75 行）

```typescript
// 旧
const videoOutputPath = path.join(config.outputDir, `podcast-${Date.now()}.mp4`);

// 新
const videoOutputPath = resolveOutputName(config.outputDir, "mp4");
```

> **注意：** `--video-only` 路径中的 `config` 已在同块中 `loadConfig()` 获取，`config.outputDir` 可直接使用。

- [ ] **Step 1: 修改 `src/index.ts`**

按上方 5 个改动点依次修改。注意 Step 5 的调用从同步改为 `await`，已在 `async function main()` 内部，无需额外修改签名。

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```
预期：0 errors

- [ ] **Step 3: 运行全量测试，确认无回归**

```bash
npx vitest run
```
预期：全部 passed

- [ ] **Step 4: 提交**

```bash
git add src/index.ts
git commit -m "feat: use Gemini SRT transcription and laona-digest naming in pipeline"
```

---

## 验收清单

- [ ] `npx vitest run` 全部通过（含 naming + srt-generator）
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `output/` 目录下 MP3 文件名格式为 `laona-digest-YYYY-MM-DD.mp3`
- [ ] `output/` 目录下 MP4 文件名格式为 `laona-digest-YYYY-MM-DD.mp4`
- [ ] 同天第二次运行生成 `-2` 后缀文件
- [ ] Remotion preview 可见波形条（金色，bottom: 100px，高 52px）
- [ ] 字幕条位置正确（bottom: 52px），与波形条之间有 8px 间隙
- [ ] 单段 TTS 文件缺失时不崩溃，字幕自动回退到估算模式
