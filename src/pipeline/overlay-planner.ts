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

const StatRowCardSchema = BaseCard.extend({
  layout: z.literal("stat-row"),
  title: z.string().optional(),
  stats: z.array(z.object({
    label: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    trend: z.string().optional(),
    trendUp: z.boolean().optional(),
  })).min(1).max(4),
});

const TextHighlightCardSchema = BaseCard.extend({
  layout: z.literal("text-highlight"),
  text: z.string(),
  subtext: z.string().optional(),
});

const CardSchema = z.discriminatedUnion("layout", [
  BulletListCardSchema,
  BigNumberCardSchema,
  ComparisonCardSchema,
  QuoteCardSchema,
  TimelineCardSchema,
  StatRowCardSchema,
  TextHighlightCardSchema,
]);

const CardsArraySchema = z.array(z.unknown()).min(1);

type CardWithTime = z.infer<typeof CardSchema>;
type CardData = Omit<CardWithTime, "startTime">;

const CARD_DURATION = 10; // seconds each card is visible

// ── Exported helpers (also used by tests) ────────────────────────────────────

/** Parse and validate Gemini JSON output into OverlayItem[].
 *  Parses each card individually; silently skips cards that fail validation.
 */
export function parseOverlayResponse(
  jsonText: string,
  articleStartTime: number,
  articleEndTime: number
): OverlayItem[] {
  const raw = JSON.parse(jsonText);
  const rawCards = CardsArraySchema.parse(raw);

  const items: OverlayItem[] = [];
  for (const rawCard of rawCards) {
    const result = CardSchema.safeParse(rawCard);
    if (!result.success) {
      console.warn(`    ⚠️ 跳过无效卡片: ${result.error.message}`);
      continue;
    }
    const card = result.data;
    const { startTime, ...rest } = card;
    const slideData: CardData = rest;
    items.push({
      startTime,
      endTime: startTime + CARD_DURATION,
      slideData: slideData as SlideData,
    });
  }
  return items;
}

/** Enforce timing rules: first card >= articleStart+3, spacing >= 12s between cards. */
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
      start = Math.max(start, prevEnd + 12);
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
  return `你是一个播客数据可视化专家。给定一篇新闻口播稿和它在音频中的起止时间，输出 3～6 张数据叠层卡片的 JSON 数组。

目标：几乎每个关键论点都应该有一张可视化卡片支撑，让观看者不用听声音也能从画面获取核心信息。

卡片类型选择规则：
- stat-row：**最优先**。文章里有 2-4 个相关数据/指标时用这个，用多列并排展示（3列最美观）
- big-number：只有 1 个关键数字时用
- text-highlight：提炼核心论点/金句，每篇必须至少 1 张，配合 stat-row 一起用
- bullet-list：3-4 个要点但无数据时用
- comparison：有明显对比（A vs B）时用
- quote：有金句/反话时用
- timeline：有时间线时用

每张卡片必须包含 startTime（秒，绝对时间）。
只输出 JSON 数组，不要代码块，不要说明文字。

各类型 JSON 格式（严格按此，不得改动字段名）：

stat-row（三列统计，stats 数组 2-4 项）：
{"layout":"stat-row","title":"Claude 降智实况","stats":[{"label":"分析样本","value":"7,000","unit":"次","trend":"Claude Code对话"},{"label":"推理字元","value":"2200→600","trend":"▼ 暴跌 -73%","trendUp":false},{"label":"不读档案就改代码","value":"6%→33.7%","trend":"▼ +461%","trendUp":false}],"startTime":15}

text-highlight（核心论点，text 控制在 20 字内）：
{"layout":"text-highlight","text":"模型没变笨，是算力分配出了问题","subtext":"本质是 Anthropic 在拆东墙补西墙","startTime":45}

big-number（单个大数字）：
{"layout":"big-number","title":"GMV蒸发","number":380,"unit":"亿","subtitle":"腾讯内容电商年损失","startTime":70}

bullet-list（要点列表，items 用对象数组）：
{"layout":"bullet-list","title":"三大核心问题","items":[{"text":"没有股权保护"},{"text":"只拿工资不担风险"},{"text":"无退出机制"}],"startTime":90}

comparison（对比，left/right 各含 label 和 items 字符串数组）：
{"layout":"comparison","title":"合伙 vs 打工","left":{"label":"真合伙人","items":["有股权","共担风险"]},"right":{"label":"假合伙人","items":["只拿薪水","无退出机制"]},"startTime":100}

timeline（时间线，nodes 用对象数组含 label）：
{"layout":"timeline","title":"事件经过","nodes":[{"label":"2020年签约"},{"label":"2022年亏损"},{"label":"2024年解散"}],"startTime":120}`;
}

function buildUserPrompt(
  script: ArticleScript,
  timing: SegmentTiming
): string {
  const duration = timing.endTime - timing.startTime;
  const targetCount = Math.max(3, Math.min(6, Math.floor(duration / 18)));
  return `文章标题：${script.title}
在音频中的时间段：${timing.startTime.toFixed(1)}s ~ ${timing.endTime.toFixed(1)}s（共 ${duration.toFixed(0)} 秒）

口播稿全文：
${script.text}

任务：提取 ${targetCount}～${Math.min(targetCount + 2, 6)} 张卡片，覆盖文章的不同论点。
- startTime 必须在 ${(timing.startTime + 3).toFixed(1)} ~ ${(timing.endTime - 12).toFixed(1)} 之间
- 卡片之间至少间隔 12 秒
- 优先用 stat-row（有数据时）和 text-highlight（提炼论点），不要全用 bullet-list
- stat-row 的 value 字段可以是字符串，支持 "X → Y" 格式表示变化
- 数字必须来自文章，不要编造`;
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
