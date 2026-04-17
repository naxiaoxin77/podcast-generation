import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { ArticleScript, SegmentTiming, OverlayItem, SlideData } from "./types.js";

// ── Zod schema for Gemini output ──────────────────────────────────────────────

const BaseCard = z.object({ startTime: z.number() });

// Gemini sometimes returns plain strings; normalize to { text } objects via transform
const BulletListItemSchema = z.union([
  z.string().transform(s => ({ text: s })),
  z.object({ icon: z.string().optional(), text: z.string() }),
]);

const BulletListCardSchema = BaseCard.extend({
  layout: z.literal("bullet-list"),
  title: z.string(),
  items: z.array(BulletListItemSchema).min(1),
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
  left: z.object({ label: z.string(), items: z.array(z.string()) }),
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

type CardWithTime = z.infer<typeof CardSchema>;
type CardData = Omit<CardWithTime, "startTime">;

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
    const slideData: CardData = rest;
    return {
      startTime,
      endTime: startTime + CARD_DURATION,
      slideData: slideData as SlideData,
    };
  });
}

/** Enforce timing rules: first card >= articleStart+3, spacing >= 15s between cards. */
export function applyTimingConstraints(
  items: OverlayItem[],
  articleStartTime: number,
  articleEndTime: number
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

    // 跳过起始时间已超过文章结束时间的卡片
    if (start >= articleEndTime) continue;

    // 截断 endTime，不超过文章结束时间
    const end = Math.min(start + CARD_DURATION, articleEndTime);

    result.push({ ...item, startTime: start, endTime: end });
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

各类型 JSON 格式示例（严格按此格式，不得改动字段名）：

big-number: {"layout":"big-number","title":"GMV蒸发","number":380,"unit":"亿","subtitle":"腾讯内容电商年损失","startTime":15}

bullet-list items 必须是对象数组，每项含 text 字段：
{"layout":"bullet-list","title":"三大核心问题","items":[{"text":"没有股权保护"},{"text":"只拿工资"},{"text":"风险全担"}],"startTime":30}

comparison 必须含 left/right 两个对象，每个含 label 和 items（字符串数组）：
{"layout":"comparison","title":"合伙 vs 打工","left":{"label":"真合伙人","items":["有股权","共担风险"]},"right":{"label":"假合伙人","items":["只拿薪水","无退出机制"]},"startTime":60}

quote: {"layout":"quote","quote":"不拿工资的合伙人是最贵的员工","attribution":"创始人说","startTime":45}

timeline nodes 必须是对象数组，每项含 label 字段：
{"layout":"timeline","title":"事件经过","nodes":[{"label":"2020年签约"},{"label":"2022年亏损"},{"label":"2024年解散"}],"startTime":80}

只输出 JSON 数组，不要代码块，不要说明文字。`;
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
