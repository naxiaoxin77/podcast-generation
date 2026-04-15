# Remotion Video Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Remotion video rendering to the podcast pipeline — input is existing audio + script data, output is a 1920×1080 MP4 with animated warm-editorial background, segment title cards, subtitle bar, and data overlay cards.

**Architecture:** Three new pipeline steps (subtitle-generator → overlay-planner → render) plug in after the existing audio concat (Step 4). All Remotion components are new except slide components which are copied verbatim from `E:\cc\talking-video-generation`. The composition receives all data as serializable props; no filesystem access inside components.

**Tech Stack:** Remotion 4.x, React 19 (reference project `E:\cc\talking-video-generation` already uses React 19 with Remotion 4.x successfully — spec cautioned React 18 but React 19 is proven compatible in practice), Noto Sans SC (via @remotion/google-fonts), Vitest for unit tests, Zod for Gemini output validation.

**Reference project (copy source):** `E:\cc\talking-video-generation`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add Remotion + React + Vitest deps |
| `remotion.config.ts` | Create | Remotion CLI config |
| `src/pipeline/types.ts` | Modify | Add SlideData, SubtitleCue, OverlayItem, PodcastCompositionProps |
| `src/remotion/fonts.ts` | Copy | Load Noto Sans SC |
| `src/remotion/design.config.ts` | Create (adapted) | Warm editorial colour palette, 1920×1080 |
| `src/remotion/components/slides/BulletListSlide.tsx` | Copy | Bullet list slide component |
| `src/remotion/components/slides/BigNumberSlide.tsx` | Copy | Big number slide component |
| `src/remotion/components/slides/ComparisonSlide.tsx` | Copy | Comparison slide component |
| `src/remotion/components/slides/QuoteSlide.tsx` | Copy | Quote slide component |
| `src/remotion/components/slides/TimelineSlide.tsx` | Copy | Timeline slide component |
| `src/remotion/components/slides/SlideRenderer.tsx` | Copy | Dispatch to correct slide |
| `src/remotion/components/PodcastBackground.tsx` | Create | Dark warm bg + floating gold particles |
| `src/remotion/components/SegmentTitleCard.tsx` | Create | Full-screen 3s article title card |
| `src/remotion/components/SubtitleBar.tsx` | Create | Bottom subtitle bar driven by SubtitleCue[] |
| `src/remotion/components/DataOverlay.tsx` | Create | Timed right-side data card (wraps SlideRenderer) |
| `src/remotion/components/HUD.tsx` | Create | Top-left logo + bottom progress bar |
| `src/remotion/PodcastVideo.tsx` | Create | Main composition: 6-layer stack |
| `src/remotion/Root.tsx` | Create | Register PodcastVideo composition |
| `src/remotion/render.ts` | Create (adapted) | Bundle + renderMedia to MP4 |
| `src/pipeline/subtitle-generator.ts` | Create | ArticleScript[] + timings → SubtitleCue[] |
| `src/pipeline/overlay-planner.ts` | Create | Gemini per-article → OverlayItem[] |
| `src/index.ts` | Modify | Wire Steps 5-7, add --no-video / --video-only flags |
| `src/tests/subtitle-generator.test.ts` | Create | Unit tests for subtitle splitting + timing |
| `src/tests/overlay-planner.test.ts` | Create | Unit tests for Gemini output parsing |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json with Remotion, React, and Vitest dependencies**

```json
{
  "name": "podcast-generation",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx src/index.ts",
    "dev:script": "tsx src/dev/test-script-gen.ts",
    "dev:tts": "tsx src/dev/test-tts.ts",
    "preview": "npx remotion preview src/remotion/Root.tsx",
    "test": "vitest run"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@remotion/bundler": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "@remotion/google-fonts": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    "dotenv": "^16.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remotion": "^4.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
cd E:/cc/podcast-generation && npm install
```

Expected: installs without errors. `node_modules/remotion` and `node_modules/react` should exist.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Remotion and Vitest dependencies"
```

---

## Task 2: New Types in types.ts

**Files:**
- Modify: `src/pipeline/types.ts`

- [ ] **Step 1: Add new types at the bottom of `src/pipeline/types.ts`**

> **Note on SlideData field names:** The spec document had simplified/approximated field names. The types below use the **exact field names from the reference project's** `src/pipeline/types.ts`, which is what the copied slide components expect. These are the authoritative definitions — do not substitute the spec's field names.

Append after the existing `PipelineConfig` interface:

```typescript
// ====== Remotion / Video Types ======

export interface SlideColorTheme {
  background?: string;
  accent?: string;
  text?: string;
}

export interface BulletListSlide {
  layout: "bullet-list";
  title: string;
  items: Array<{ icon?: string; text: string }>;
  theme?: SlideColorTheme;
}

export interface BigNumberSlide {
  layout: "big-number";
  title: string;
  number: number;       // number type, not string
  unit?: string;
  subtitle: string;
  theme?: SlideColorTheme;
}

export interface ComparisonSlide {
  layout: "comparison";
  title: string;
  left: { label: string; items: string[] };   // nested, not flat leftLabel/leftItems
  right: { label: string; items: string[] };
  theme?: SlideColorTheme;
}

export interface QuoteSlide {
  layout: "quote";
  title?: string;
  quote: string;          // field is "quote", not "text"
  attribution?: string;   // field is "attribution", not "source"
  theme?: SlideColorTheme;
}

export interface TimelineSlide {
  layout: "timeline";
  title: string;
  nodes: Array<{ label: string; description?: string }>;  // "nodes", not "events"
  theme?: SlideColorTheme;
}

export type SlideData =
  | BulletListSlide
  | BigNumberSlide
  | ComparisonSlide
  | QuoteSlide
  | TimelineSlide;

/** One subtitle sentence with absolute timestamps */
export interface SubtitleCue {
  startTime: number;  // seconds from audio start
  endTime: number;
  text: string;
}

/** One data overlay card with timing */
export interface OverlayItem {
  startTime: number;  // seconds from audio start
  endTime: number;
  slideData: SlideData;
}

/** Props for the PodcastVideo Remotion composition */
export interface PodcastCompositionProps {
  audioPath: string;            // relative to publicDir, e.g. "podcast.mp3"
  totalDuration: number;        // seconds
  subtitleCues: SubtitleCue[];
  overlays: OverlayItem[];
  segmentTimings: SegmentTiming[];  // all segments including intro/outro
  podcastTitle: string;
  date: string;                 // "YYYY-MM-DD"
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd E:/cc/podcast-generation && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/types.ts
git commit -m "feat: add Remotion types (SlideData, SubtitleCue, OverlayItem, PodcastCompositionProps)"
```

---

## Task 3: Remotion Config + Boilerplate

**Files:**
- Create: `remotion.config.ts`
- Create: `src/remotion/fonts.ts` (copy)
- Create: `src/remotion/components/slides/` (6 files copied)

- [ ] **Step 1: Create `remotion.config.ts` at project root**

```typescript
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
```

- [ ] **Step 2: Copy `fonts.ts` from reference**

Copy `E:\cc\talking-video-generation\src\remotion\fonts.ts` to `src/remotion/fonts.ts` unchanged.

Content should be:
```typescript
import { loadFont } from "@remotion/google-fonts/NotoSansSC";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export { fontFamily };
```

- [ ] **Step 3: Create `src/remotion/components/slides/` directory and copy all 5 slide components + SlideRenderer**

Copy these files verbatim from `E:\cc\talking-video-generation\src\remotion\components\slides\`:
- `BulletListSlide.tsx`
- `BigNumberSlide.tsx`
- `ComparisonSlide.tsx`
- `QuoteSlide.tsx`
- `TimelineSlide.tsx`
- `SlideRenderer.tsx`

After copying, open `SlideRenderer.tsx` and check the `SlideData` import line. It will read:
```typescript
import type { SlideData } from "../../../pipeline/types";
```
The relative path `../../../pipeline/types` resolves to `src/pipeline/types` — which is the same path in this project. **No change needed.** If the import path differs, update it to point to `src/pipeline/types.js`.

Also verify each individual slide component's import of `designConfig`. They import from `"../../design.config"` — which will resolve to `src/remotion/design.config.ts` in this project. That is correct and matches Task 4's file location. No change needed there either.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add remotion.config.ts src/remotion/
git commit -m "feat: add Remotion config, fonts, and slide components"
```

---

## Task 4: design.config.ts (Warm Editorial Palette)

**Files:**
- Create: `src/remotion/design.config.ts`

- [ ] **Step 1: Create `src/remotion/design.config.ts` with warm editorial colours**

```typescript
/**
 * Warm editorial palette — 每日商业快报
 * 1920×1080 horizontal podcast video
 */
export const designConfig = {

  video: {
    width: 1920,
    height: 1080,
    fps: 30,
  },

  theme: {
    background: "linear-gradient(160deg, #1a1208 0%, #0d0904 100%)",
    accent: "#e8c87a",
    accentMuted: "#c8a46e",
    text: "#f5e6c8",
    textMuted: "#a08060",
  },

  particles: {
    count: 12,
    minSize: 2,
    maxSize: 4,
    minOpacity: 0.3,
    maxOpacity: 0.6,
    color: "#e8c87a",
  },

  subtitle: {
    fontSize: 24,
    fontWeight: 600,
    color: "#1a0e04",
    highlightColor: "#c05010",
    backgroundColor: "rgba(245, 230, 200, 0.95)",
    borderRadius: 8,
    padding: "12px 24px",
    bottomOffset: 48,
    maxWidth: 1600,
    lineHeight: 1.6,
  },

  titleCard: {
    numberFontSize: 20,
    numberColor: "#e8c87a",
    titleFontSize: 64,
    titleFontWeight: 800,
    titleColor: "#f5e6c8",
    bgColor: "rgba(10, 6, 2, 0.85)",
    fadeDuration: 15,   // frames (0.5s @ 30fps)
    holdDuration: 60,   // frames (2s)
    totalDuration: 90,  // frames (3s)
  },

  overlay: {
    width: 420,
    rightOffset: 40,
    topOffset: 80,
    bgColor: "rgba(10, 6, 2, 0.92)",
    borderColor: "rgba(200, 164, 110, 0.45)",
    borderRadius: 10,
    enterDuration: 12,  // frames
    exitDuration: 9,    // frames
    slideDistance: 60,  // px
  },

  hud: {
    fontSize: 18,
    color: "#e8c87a",
    topOffset: 24,
    leftOffset: 32,
    progressHeight: 2,
    progressColor: "rgba(200, 164, 110, 0.6)",
  },

  // Slide component overrides (passed as theme to SlideRenderer)
  slideTheme: {
    background: "transparent",
    accent: "#e8c87a",
    text: "#f5e6c8",
  },

  // Reuse reference project slide configs unchanged
  bulletList: {
    itemGap: 32,
    iconSize: 56,
    iconBorderRadius: 14,
    iconFontSize: 28,
    textFontSize: 36,
    textFontWeight: 500,
    spring: { damping: 15, stiffness: 120 },
    maxStaggerDelay: 12,
  },

  bigNumber: {
    numberFontSize: 140,
    numberFontWeight: 900,
    unitFontSize: 70,
    subtitleFontSize: 38,
    subtitleMarginTop: 32,
    countDurationRatio: 0.5,
    pulseScale: 1.06,
    spring: { damping: 15, stiffness: 100 },
  },

} as const;

export type DesignConfig = typeof designConfig;
```

- [ ] **Step 2: Commit**

```bash
git add src/remotion/design.config.ts
git commit -m "feat: add warm editorial design config for podcast video"
```

---

## Task 5: subtitle-generator.ts (TDD)

**Files:**
- Create: `src/tests/subtitle-generator.test.ts`
- Create: `src/pipeline/subtitle-generator.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/subtitle-generator.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd E:/cc/podcast-generation && npx vitest run src/tests/subtitle-generator.test.ts
```

Expected: fails with "Cannot find module '../pipeline/subtitle-generator.js'"

- [ ] **Step 3: Implement `src/pipeline/subtitle-generator.ts`**

```typescript
import type { ArticleScript, SegmentTiming, SubtitleCue } from "./types.js";

/** Split Chinese text into sentences by punctuation. */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation (。！？), keep delimiter with previous segment
  const sentences = text.split(/(?<=[。！？])/).map(s => s.trim()).filter(s => s.length > 0);
  return sentences.length > 0 ? sentences : [text.trim()];
}

/**
 * Generate subtitle cues from script text and segment timings.
 * Time is allocated proportionally by character count within each segment.
 */
export function generateSubtitleCues(
  introText: string,
  articleScripts: ArticleScript[],
  outroText: string,
  timings: SegmentTiming[]
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Sort timings by startTime
  const sorted = [...timings].sort((a, b) => a.startTime - b.startTime);

  for (const timing of sorted) {
    let text: string;
    if (timing.articleIndex === -1) {
      text = introText;
    } else if (timing.articleIndex === -2) {
      text = outroText;
    } else {
      const script = articleScripts.find(s => s.articleIndex === timing.articleIndex);
      if (!script) continue;
      text = script.text;
    }

    const sentences = splitSentences(text);
    const segDuration = timing.endTime - timing.startTime;
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);

    let cursor = timing.startTime;
    for (const sentence of sentences) {
      const duration = totalChars > 0
        ? segDuration * (sentence.length / totalChars)
        : segDuration / sentences.length;
      cues.push({
        startTime: cursor,
        endTime: cursor + duration,
        text: sentence,
      });
      cursor += duration;
    }
  }

  return cues;
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run src/tests/subtitle-generator.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/subtitle-generator.ts src/tests/subtitle-generator.test.ts
git commit -m "feat: subtitle-generator — script-based SubtitleCue[] generation"
```

---

## Task 6: overlay-planner.ts (TDD)

**Files:**
- Create: `src/tests/overlay-planner.test.ts`
- Create: `src/pipeline/overlay-planner.ts`

- [ ] **Step 1: Write failing tests (parsing + validation logic only; Gemini call is tested via integration)**

Create `src/tests/overlay-planner.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/tests/overlay-planner.test.ts
```

Expected: fails with module not found.

- [ ] **Step 3: Implement `src/pipeline/overlay-planner.ts`**

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { ArticleScript, SegmentTiming, OverlayItem, SlideData } from "./types.js";

// ── Zod schema for Gemini output ──────────────────────────────────────────────

const BaseCard = z.object({ startTime: z.number() });

const BulletListCardSchema = BaseCard.extend({
  layout: z.literal("bullet-list"),
  title: z.string(),
  items: z.array(z.object({ icon: z.string().optional(), text: z.string() })).min(1),
});

const BigNumberCardSchema = BaseCard.extend({
  layout: z.literal("big-number"),
  title: z.string(),
  number: z.number(),
  unit: z.string().optional(),
  subtitle: z.string(),
});

const ComparisonCardSchema = BaseCard.extend({
  layout: z.literal("comparison"),
  title: z.string(),
  left: z.object({ label: z.string(), items: z.array(z.string()) }),   // nested, matches SlideData
  right: z.object({ label: z.string(), items: z.array(z.string()) }),
});

const QuoteCardSchema = BaseCard.extend({
  layout: z.literal("quote"),
  title: z.string().optional(),
  quote: z.string(),
  attribution: z.string().optional(),
});

const TimelineCardSchema = BaseCard.extend({
  layout: z.literal("timeline"),
  title: z.string(),
  nodes: z.array(z.object({ label: z.string(), description: z.string().optional() })).min(1),
});

const CardSchema = z.discriminatedUnion("layout", [
  BulletListCardSchema,
  BigNumberCardSchema,
  ComparisonCardSchema,
  QuoteCardSchema,
  TimelineCardSchema,
]);

const CardsArraySchema = z.array(CardSchema).min(1).max(3);

const CARD_DURATION = 10; // seconds each card is visible

// ── Exported helpers (also used by tests) ────────────────────────────────────

/** Parse and validate Gemini JSON output into OverlayItem[]. */
export function parseOverlayResponse(
  jsonText: string,
  articleStartTime: number,
  articleEndTime: number
): OverlayItem[] {
  const raw = JSON.parse(jsonText);
  const cards = CardsArraySchema.parse(raw);

  return cards.map(card => {
    const { startTime, ...rest } = card;
    return {
      startTime,
      endTime: startTime + CARD_DURATION,
      slideData: rest as SlideData,
    };
  });
}

/** Enforce timing rules: first card ≥ articleStart+3, spacing ≥ 15s between cards. */
export function applyTimingConstraints(
  items: OverlayItem[],
  articleStartTime: number,
  _articleEndTime: number
): OverlayItem[] {
  const minFirst = articleStartTime + 3;
  const result: OverlayItem[] = [];

  for (const item of items) {
    let start = item.startTime;

    if (result.length === 0) {
      start = Math.max(start, minFirst);
    } else {
      const prevEnd = result[result.length - 1].endTime;
      start = Math.max(start, prevEnd + 15);
    }

    result.push({ ...item, startTime: start, endTime: start + CARD_DURATION });
  }

  return result;
}

// ── Main export ───────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `你是一个播客数据卡片规划师。给定一篇新闻口播稿和它在音频中的起止时间，
输出 2~3 张数据叠层卡片的 JSON 数组。

卡片类型选择优先级：
- big-number：文章有具体数字时优先选
- bullet-list：提炼 2~4 个要点
- quote：有金句时选
- comparison：有明显对比时选
- timeline：有时间线事件序列时选

每张卡片必须包含 startTime（秒，绝对时间）。
只输出 JSON 数组，不要任何说明文字。

JSON 格式示例（big-number）：
[{"layout":"big-number","title":"GMV蒸发","number":380,"unit":"亿","subtitle":"腾讯内容电商年损失","startTime":15}]`;
}

function buildUserPrompt(
  script: ArticleScript,
  timing: SegmentTiming
): string {
  return `文章标题：${script.title}
在音频中的时间段：${timing.startTime.toFixed(1)}s ~ ${timing.endTime.toFixed(1)}s
口播稿全文：
${script.text}

请生成 2~3 张数据卡片。startTime 必须在 ${(timing.startTime + 3).toFixed(1)} ~ ${(timing.endTime - 12).toFixed(1)} 范围内。`;
}

export async function planOverlays(
  articleScripts: ArticleScript[],
  timings: SegmentTiming[],
  apiKey: string
): Promise<OverlayItem[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: buildSystemPrompt(),
  });

  const allOverlays: OverlayItem[] = [];

  for (const script of articleScripts) {
    const timing = timings.find(t => t.articleIndex === script.articleIndex);
    if (!timing) continue;

    console.log(`  [${script.articleIndex + 1}/${articleScripts.length}] 规划叠层卡片: ${script.title}`);

    try {
      const result = await model.generateContent(buildUserPrompt(script, timing));
      const text = result.response.text().trim();

      // Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found in response");

      const items = parseOverlayResponse(jsonMatch[0], timing.startTime, timing.endTime);
      const constrained = applyTimingConstraints(items, timing.startTime, timing.endTime);
      allOverlays.push(...constrained);
      console.log(`    → ${constrained.length} 张卡片`);
    } catch (err) {
      console.warn(`    ⚠️ 卡片生成失败，跳过: ${err}`);
    }
  }

  return allOverlays;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/tests/overlay-planner.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/overlay-planner.ts src/tests/overlay-planner.test.ts
git commit -m "feat: overlay-planner — Gemini-driven OverlayItem[] generation"
```

---

## Task 7: PodcastBackground Component

**Files:**
- Create: `src/remotion/components/PodcastBackground.tsx`

- [ ] **Step 1: Create `src/remotion/components/PodcastBackground.tsx`**

```typescript
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";

interface Particle {
  x: number;      // % from left
  y: number;      // % from top
  size: number;   // px
  opacity: number;
  speedX: number; // fraction of width per second
  speedY: number;
  phase: number;  // phase offset for breathing
}

// Deterministic pseudo-random seeded particles (stable across frames)
function createParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const seed = i * 137.508; // golden angle
    particles.push({
      x: ((Math.sin(seed) * 0.5 + 0.5) * 90 + 5),
      y: ((Math.cos(seed * 1.3) * 0.5 + 0.5) * 80 + 10),
      size: designConfig.particles.minSize + (Math.abs(Math.sin(seed * 2)) * (designConfig.particles.maxSize - designConfig.particles.minSize)),
      opacity: designConfig.particles.minOpacity + (Math.abs(Math.cos(seed * 3)) * (designConfig.particles.maxOpacity - designConfig.particles.minOpacity)),
      speedX: (Math.sin(seed * 5) * 0.004),
      speedY: (Math.cos(seed * 7) * 0.003),
      phase: seed % (Math.PI * 2),
    });
  }
  return particles;
}

const PARTICLES = createParticles(designConfig.particles.count);

export const PodcastBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // time in seconds

  return (
    <AbsoluteFill
      style={{
        background: designConfig.theme.background,
        fontFamily,
      }}
    >
      {PARTICLES.map((p, i) => {
        // Slow drift
        const x = (p.x + p.speedX * t * 100) % 100;
        const y = (p.y + p.speedY * t * 100) % 100;
        // Breathing opacity
        const breathe = Math.sin(t * 0.5 + p.phase) * 0.15;
        const opacity = Math.max(0.1, Math.min(0.8, p.opacity + breathe));

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: designConfig.particles.color,
              opacity,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/remotion/components/PodcastBackground.tsx
git commit -m "feat: PodcastBackground — dark warm bg with floating gold particles"
```

---

## Task 8: SegmentTitleCard Component

**Files:**
- Create: `src/remotion/components/SegmentTitleCard.tsx`

- [ ] **Step 1: Create `src/remotion/components/SegmentTitleCard.tsx`**

```typescript
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";

interface Props {
  articleNumber: number;  // 1-based display number
  title: string;
  startFrame: number;     // frame when this card should appear
}

export const SegmentTitleCard: React.FC<Props> = ({ articleNumber, title, startFrame }) => {
  const frame = useCurrentFrame();
  const { fadeDuration, holdDuration, totalDuration } = designConfig.titleCard;

  const localFrame = frame - startFrame;
  if (localFrame < 0 || localFrame >= totalDuration) return null;

  const opacity = interpolate(
    localFrame,
    [0, fadeDuration, fadeDuration + holdDuration, totalDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: designConfig.titleCard.bgColor,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily,
      }}
    >
      <div
        style={{
          fontSize: designConfig.titleCard.numberFontSize,
          color: designConfig.titleCard.numberColor,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        第 {articleNumber} 条
      </div>
      <div
        style={{
          fontSize: designConfig.titleCard.titleFontSize,
          fontWeight: designConfig.titleCard.titleFontWeight,
          color: designConfig.titleCard.titleColor,
          maxWidth: "80%",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/remotion/components/SegmentTitleCard.tsx
git commit -m "feat: SegmentTitleCard — 3s full-screen article title card"
```

---

## Task 9: SubtitleBar Component

**Files:**
- Create: `src/remotion/components/SubtitleBar.tsx`

- [ ] **Step 1: Create `src/remotion/components/SubtitleBar.tsx`**

```typescript
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";
import type { SubtitleCue } from "../../pipeline/types.js";

interface Props {
  cues: SubtitleCue[];
}

export const SubtitleBar: React.FC<Props> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const activeCue = cues.find(
    c => currentTime >= c.startTime && currentTime < c.endTime
  );

  if (!activeCue) return null;

  const { subtitle } = designConfig;

  return (
    <AbsoluteFill
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          position: "absolute",
          bottom: subtitle.bottomOffset,
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: subtitle.maxWidth,
          width: "90%",
          backgroundColor: subtitle.backgroundColor,
          borderRadius: subtitle.borderRadius,
          padding: subtitle.padding,
          textAlign: "center",
          fontFamily,
          fontSize: subtitle.fontSize,
          fontWeight: subtitle.fontWeight,
          color: subtitle.color,
          lineHeight: subtitle.lineHeight,
        }}
      >
        {activeCue.text}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/remotion/components/SubtitleBar.tsx
git commit -m "feat: SubtitleBar — bottom subtitle bar driven by SubtitleCue[]"
```

---

## Task 10: DataOverlay Component

**Files:**
- Create: `src/remotion/components/DataOverlay.tsx`

- [ ] **Step 1: Create `src/remotion/components/DataOverlay.tsx`**

```typescript
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { SlideRenderer } from "./slides/SlideRenderer.js";
import type { OverlayItem } from "../../pipeline/types.js";

interface Props {
  overlays: OverlayItem[];
}

const SingleOverlay: React.FC<{ item: OverlayItem; startFrame: number; endFrame: number }> = ({
  item,
  startFrame,
  endFrame,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  const totalFrames = endFrame - startFrame;
  const { enterDuration, exitDuration, slideDistance } = designConfig.overlay;

  if (localFrame < 0 || localFrame >= totalFrames) return null;

  const opacity = interpolate(
    localFrame,
    [0, enterDuration, totalFrames - exitDuration, totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const translateX = interpolate(
    localFrame,
    [0, enterDuration],
    [slideDistance, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const { overlay } = designConfig;

  return (
    <div
      style={{
        position: "absolute",
        right: overlay.rightOffset,
        top: overlay.topOffset,
        width: overlay.width,
        opacity,
        transform: `translateX(${translateX}px)`,
        backgroundColor: overlay.bgColor,
        border: `1px solid ${overlay.borderColor}`,
        borderRadius: overlay.borderRadius,
        overflow: "hidden",
      }}
    >
      <SlideRenderer
        slideData={{ ...item.slideData, theme: designConfig.slideTheme }}
        durationInFrames={totalFrames}
        overlayMode
      />
    </div>
  );
};

export const DataOverlay: React.FC<Props> = ({ overlays }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {overlays.map((item, i) => (
        <SingleOverlay
          key={i}
          item={item}
          startFrame={Math.round(item.startTime * fps)}
          endFrame={Math.round(item.endTime * fps)}
        />
      ))}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/remotion/components/DataOverlay.tsx
git commit -m "feat: DataOverlay — timed right-side data cards wrapping SlideRenderer"
```

---

## Task 11: HUD Component

**Files:**
- Create: `src/remotion/components/HUD.tsx`

- [ ] **Step 1: Create `src/remotion/components/HUD.tsx`**

```typescript
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";

interface Props {
  podcastTitle: string;
  date: string;
  totalDuration: number;  // seconds
}

export const HUD: React.FC<Props> = ({ podcastTitle, date, totalDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = frame / (totalDuration * fps);
  const { hud } = designConfig;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Top-left logo */}
      <div
        style={{
          position: "absolute",
          top: hud.topOffset,
          left: hud.leftOffset,
          fontFamily,
          fontSize: hud.fontSize,
          color: hud.color,
          letterSpacing: "0.05em",
          opacity: 0.85,
        }}
      >
        {podcastTitle} · {date}
      </div>

      {/* Bottom progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: hud.progressHeight,
          backgroundColor: "rgba(200, 164, 110, 0.15)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, progress * 100)}%`,
            backgroundColor: hud.progressColor,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/remotion/components/HUD.tsx
git commit -m "feat: HUD — top-left logo and bottom progress bar"
```

---

## Task 12: PodcastVideo + Root Compositions

**Files:**
- Create: `src/remotion/PodcastVideo.tsx`
- Create: `src/remotion/Root.tsx`

- [ ] **Step 1: Create `src/remotion/PodcastVideo.tsx`**

```typescript
import React from "react";
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { PodcastBackground } from "./components/PodcastBackground.js";
import { SegmentTitleCard } from "./components/SegmentTitleCard.js";
import { DataOverlay } from "./components/DataOverlay.js";
import { SubtitleBar } from "./components/SubtitleBar.js";
import { HUD } from "./components/HUD.js";
import type { PodcastCompositionProps } from "../pipeline/types.js";

export const PodcastVideo: React.FC<PodcastCompositionProps> = ({
  audioPath,
  totalDuration,
  subtitleCues,
  overlays,
  segmentTimings,
  podcastTitle,
  date,
}) => {
  const { fps } = useVideoConfig();

  // Only show title cards for articles (articleIndex >= 0)
  const articleTimings = segmentTimings.filter(t => t.articleIndex >= 0);

  return (
    <AbsoluteFill>
      {/* Layer 1: Background */}
      <PodcastBackground />

      {/* Layer 2: Audio */}
      <Audio src={staticFile(audioPath)} />

      {/* Layer 3: Article title cards */}
      {articleTimings.map((timing, i) => (
        <SegmentTitleCard
          key={timing.articleIndex}
          articleNumber={timing.articleIndex + 1}
          title={timing.title}
          startFrame={Math.round(timing.startTime * fps)}
        />
      ))}

      {/* Layer 4: Data overlays */}
      <DataOverlay overlays={overlays} />

      {/* Layer 5: Subtitles */}
      <SubtitleBar cues={subtitleCues} />

      {/* Layer 6: HUD */}
      <HUD podcastTitle={podcastTitle} date={date} totalDuration={totalDuration} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Create `src/remotion/Root.tsx`**

```typescript
import React from "react";
import { Composition, registerRoot } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { PodcastVideo } from "./PodcastVideo.js";
import type { PodcastCompositionProps } from "../pipeline/types.js";
import { designConfig } from "./design.config.js";

type RemotionProps = PodcastCompositionProps & Record<string, unknown>;

const calculateMetadata: CalculateMetadataFunction<RemotionProps> = async ({ props }) => ({
  durationInFrames: Math.ceil((props.totalDuration || 10) * designConfig.video.fps),
  fps: designConfig.video.fps,
  width: designConfig.video.width,
  height: designConfig.video.height,
});

const defaultProps: RemotionProps = {
  audioPath: "podcast.mp3",
  totalDuration: 60,
  subtitleCues: [],
  overlays: [],
  segmentTimings: [],
  podcastTitle: "每日商业快报",
  date: new Date().toISOString().slice(0, 10),
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="PodcastVideo"
    component={PodcastVideo as React.ComponentType<RemotionProps>}
    durationInFrames={1}
    fps={designConfig.video.fps}
    width={designConfig.video.width}
    height={designConfig.video.height}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
  />
);

registerRoot(RemotionRoot);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test with Remotion preview**

```bash
npx remotion preview src/remotion/Root.tsx
```

Expected: browser opens showing a 60-second composition with warm dark background, gold particles, HUD. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/remotion/PodcastVideo.tsx src/remotion/Root.tsx
git commit -m "feat: PodcastVideo composition and Root — 6-layer podcast video"
```

---

## Task 13: render.ts

**Files:**
- Create: `src/remotion/render.ts`

- [ ] **Step 1: Create `src/remotion/render.ts`**

```typescript
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import type { PodcastCompositionProps } from "../pipeline/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function renderPodcastVideo(
  props: PodcastCompositionProps,
  outputPath: string
): Promise<string> {
  console.log("  Bundling Remotion project...");
  const bundled = await bundle({
    entryPoint: path.resolve(__dirname, "Root.tsx"),
    webpackOverride: (config) => config,
  });

  console.log("  Selecting composition...");
  const remotionProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl: bundled,
    id: "PodcastVideo",
    inputProps: remotionProps,
  });

  console.log(`  Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps...`);
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: remotionProps,
  });

  console.log(`  Video saved: ${outputPath}`);
  return outputPath;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/remotion/render.ts
git commit -m "feat: renderPodcastVideo — Remotion bundle + renderMedia to MP4"
```

---

## Task 14: Wire Steps 5–7 into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports at top of `src/index.ts`**

```typescript
import { generateSubtitleCues } from "./pipeline/subtitle-generator.js";
import { planOverlays } from "./pipeline/overlay-planner.js";
import { renderPodcastVideo } from "./remotion/render.js";
import type { PodcastCompositionProps } from "./pipeline/types.js";
```

- [ ] **Step 2: Update CLI args parsing in `main()` to add new flags**

Replace the existing args section:
```typescript
const noVideo = args.includes("--no-video");
const videoOnly = args.includes("--video-only");
```

- [ ] **Step 3: After Step 4 (audio concat), add the audio copy to public/**

After the line `console.log(`\n完成！播客音频: ${audioPath}`)` in Step 4 (or wherever the final MP3 path is known), add:

```typescript
// Copy audio to public/ for Remotion staticFile access
const publicAudioPath = path.join(config.publicDir, "podcast.mp3");
fs.copyFileSync(audioPath, publicAudioPath);
```

- [ ] **Step 4: Add Steps 5–7 block before the metadata/cleanup section**

Insert after the timings block and before `// ── Step 5: 元数据 ───`:

```typescript
  // ── Step 5: 生成字幕时间轴 ──────────────────────────────────────
  let subtitleCues: import("./pipeline/types.js").SubtitleCue[] = [];
  let overlays: import("./pipeline/types.js").OverlayItem[] = [];

  if (!noVideo) {
    console.log("\n=== Step 5: 生成字幕时间轴 ===");
    subtitleCues = generateSubtitleCues(
      introText,
      podcastMeta.articleScripts,
      outroText,
      allTimings
    );
    fs.writeFileSync(
      path.join(config.outputDir, "subtitle-cues.json"),
      JSON.stringify(subtitleCues, null, 2),
      "utf-8"
    );
    console.log(`  ${subtitleCues.length} 条字幕`);

    // ── Step 6: 规划叠层卡片 ──────────────────────────────────────
    console.log("\n=== Step 6: 规划叠层卡片 ===");
    overlays = await planOverlays(
      podcastMeta.articleScripts,
      allTimings,
      config.geminiApiKey
    );
    fs.writeFileSync(
      path.join(config.outputDir, "overlays.json"),
      JSON.stringify(overlays, null, 2),
      "utf-8"
    );
    console.log(`  ${overlays.length} 张卡片`);

    // ── Step 7: Remotion 渲染视频 ──────────────────────────────────
    console.log("\n=== Step 7: Remotion 渲染视频 ===");
    const videoOutputPath = path.join(config.outputDir, `podcast-${Date.now()}.mp4`);
    const videoProps: PodcastCompositionProps = {
      audioPath: "podcast.mp3",
      totalDuration,
      subtitleCues,
      overlays,
      segmentTimings: allTimings,
      podcastTitle: podcastMeta.title,
      date: new Date().toISOString().slice(0, 10),
    };
    await renderPodcastVideo(videoProps, videoOutputPath);
    console.log(`  视频输出: ${videoOutputPath}`);
  }
```

- [ ] **Step 5: Add --video-only fast path at the start of main(), before Step 0**

```typescript
  // Fast path: --video-only re-renders from existing output files
  if (videoOnly) {
    console.log("\n=== --video-only: 从已有数据重新渲染视频 ===");
    const scriptsData = JSON.parse(fs.readFileSync(path.join(config.outputDir, "scripts.json"), "utf-8"));
    const loadedTimings = JSON.parse(fs.readFileSync(path.join(config.outputDir, "timings.json"), "utf-8"));
    const loadedCues = JSON.parse(fs.readFileSync(path.join(config.outputDir, "subtitle-cues.json"), "utf-8"));
    const loadedOverlays = JSON.parse(fs.readFileSync(path.join(config.outputDir, "overlays.json"), "utf-8"));
    const videoProps: PodcastCompositionProps = {
      audioPath: "podcast.mp3",
      totalDuration: loadedTimings[loadedTimings.length - 1]?.endTime ?? 0,
      subtitleCues: loadedCues,
      overlays: loadedOverlays,
      segmentTimings: loadedTimings,
      podcastTitle: scriptsData.title,
      date: new Date().toISOString().slice(0, 10),
    };
    const videoOutputPath = path.join(config.outputDir, `podcast-${Date.now()}.mp4`);
    await renderPodcastVideo(videoProps, videoOutputPath);
    console.log(`\n完成！视频: ${videoOutputPath}`);
    return;
  }
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire Steps 5-7 into main pipeline — subtitle, overlays, video render"
```

---

## Task 15: End-to-End Smoke Test

- [ ] **Step 1: Run unit tests to confirm nothing regressed**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run full pipeline with --no-video first to confirm audio still works**

```bash
npx tsx src/index.ts --from-kanban --limit 2 --no-video --keep
```

Expected: completes with `output/podcast-*.mp3` produced. No errors.

- [ ] **Step 3: Run Remotion preview with default props to verify composition renders**

```bash
npx remotion preview src/remotion/Root.tsx
```

Expected: browser opens at localhost, shows warm dark background with gold particles and bottom progress bar. No React or TypeScript errors in console.

- [ ] **Step 4: Run full pipeline end-to-end with 2 articles**

```bash
npx tsx src/index.ts --from-kanban --limit 2 --keep
```

Expected:
- `output/subtitle-cues.json` — array of subtitle cues
- `output/overlays.json` — array of overlay items
- `output/podcast-*.mp4` — video file, size > 10MB
- Console logs Steps 5, 6, 7 completing without errors

- [ ] **Step 5: Spot-check the video**

Open `output/podcast-*.mp4`. Verify:
- Warm dark background with visible gold particles
- Bottom subtitle bar showing text during audio
- Title cards appearing at article starts (first ~3 seconds)
- Data overlay cards appearing on the right side during articles
- HUD logo visible top-left, progress bar at bottom

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Remotion video pipeline complete — warm editorial podcast video"
```
