# Obsidian 播客落盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `--from-kanban` 模式下自动过滤过去 24 小时发布的文章，生成完毕后将 MP3、MP4、shownote.md 写入 Obsidian vault 指定目录。

**Architecture:** 三条改动线独立推进：① 提取 `vault-config.ts` 共享常量；② 新建 `podcast-publisher.ts`（shownote 生成 + 文件复制）；③ 修改 `obsidian-scan.ts` 加 24h 过滤，修改 `index.ts` 串联 Step 9。每条线均有单元测试。

**Tech Stack:** Node.js ESM + TypeScript, Vitest, `fs.copyFileSync` / `fs.mkdirSync`

---

## 文件一览

| 状态 | 路径 | 说明 |
|------|------|------|
| **新增** | `src/workflow/vault-config.ts` | VAULT_BASE 常量 + vaultFullPath 工具函数 |
| **新增** | `src/workflow/podcast-publisher.ts` | generateShownote（纯函数）+ publishToObsidian |
| **新增** | `src/tests/podcast-publisher.test.ts` | generateShownote 单元测试 |
| **修改** | `src/workflow/obsidian-scan.ts` | 引用 vault-config；新增 isWithinHours；ScanOptions 加 withinHours |
| **修改** | `src/index.ts` | videoOutputPath 作用域提升；新增 Step 9 Obsidian 落盘 |

---

## Task 1: vault-config.ts — 共享 Vault 常量

**Files:**
- Create: `src/workflow/vault-config.ts`
- Modify: `src/workflow/obsidian-scan.ts`（第 10-20 行，替换本地常量为 import）

这个 task 没有业务逻辑，不需要测试，但要确保 TypeScript 编译通过且现有测试不回归。

- [ ] **Step 1: 创建 `src/workflow/vault-config.ts`**

```typescript
/**
 * Obsidian Vault 共享配置
 * 用正斜杠，避免 \b \n \O 等被解释为转义字符
 */
export const VAULT_BASE = "E:/natebrain";

/** 拼接 vault 相对路径为绝对路径 */
export function vaultFullPath(relPath: string): string {
  return VAULT_BASE + "/" + relPath;
}
```

- [ ] **Step 2: 修改 `src/workflow/obsidian-scan.ts`**

在文件顶部 import 列表中追加：
```typescript
import { VAULT_BASE, vaultFullPath } from "./vault-config.js";
```

删除第 10-20 行的本地声明（`VAULT_BASE`、`KANBAN_VAULT_PATH` 保留，但 `VAULT_BASE` 改为从 import 获取）：
```typescript
// 删除这两行：
// const VAULT_BASE = "E:/natebrain";
// function vaultFullPath(vaultRelPath: string): string { ... }
```

确保文件其余部分仍使用同名的 `VAULT_BASE` 和 `vaultFullPath`（名字一致，无需其他改动）。

- [ ] **Step 3: TypeScript 编译检查**

```
cd E:\cc\podcast-generation && npx tsc --noEmit
```
预期：0 errors

- [ ] **Step 4: 运行全量测试确认无回归**

```
cd E:\cc\podcast-generation && npx vitest run
```
预期：全部 passed

- [ ] **Step 5: 提交**

```bash
git add src/workflow/vault-config.ts src/workflow/obsidian-scan.ts
git commit -m "refactor: extract VAULT_BASE to shared vault-config module"
```

---

## Task 2: podcast-publisher.ts — generateShownote 纯函数 + 测试

**Files:**
- Create: `src/workflow/podcast-publisher.ts`（仅 generateShownote + extractSummary，不含 publishToObsidian）
- Create: `src/tests/podcast-publisher.test.ts`

### 类型参考（来自 `src/pipeline/types.ts`）

```typescript
interface ArticleScript {
  articleIndex: number;
  title: string;
  text: string;          // 完整口播文稿
  estimatedDuration: number;
}
interface PodcastMeta {
  title: string;         // 如 "每日商业快报 - 2026-04-17"
  articleScripts: ArticleScript[];
}
```

- [ ] **Step 1: 写失败测试 `src/tests/podcast-publisher.test.ts`**

```typescript
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
    const result = generateShownote(meta, "2026-04-17");
    expect(result).toContain("# 每日商业快报 - 2026-04-17");
  });

  it("包含'本期内容'小标题", () => {
    const result = generateShownote(meta, "2026-04-17");
    expect(result).toContain("## 本期内容");
  });

  it("每篇文章标题加粗", () => {
    const result = generateShownote(meta, "2026-04-17");
    expect(result).toContain("**文章标题一**");
    expect(result).toContain("**文章标题二**");
  });

  it("取口播稿前 2 句作为摘要，不含第 3 句", () => {
    const result = generateShownote(meta, "2026-04-17");
    expect(result).toContain("这是第一句话。这是第二句话。");
    expect(result).not.toContain("这是第三句话");
  });

  it("只有 1 句时取全文", () => {
    const result = generateShownote(meta, "2026-04-17");
    expect(result).toContain("只有一句话。");
  });

  it("文章 text 为空时不崩溃，摘要为空行", () => {
    const emptyMeta: PodcastMeta = {
      title: "测试",
      articleScripts: [{ articleIndex: 0, title: "空", text: "", estimatedDuration: 0 }],
    };
    expect(() => generateShownote(emptyMeta, "2026-04-17")).not.toThrow();
  });

  it("shownote 以换行符结尾", () => {
    const result = generateShownote(meta, "2026-04-17");
    expect(result.endsWith("\n")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```
cd E:\cc\podcast-generation && npx vitest run src/tests/podcast-publisher.test.ts
```
预期：FAIL — `generateShownote` not exported

- [ ] **Step 3: 创建 `src/workflow/podcast-publisher.ts`（纯函数部分）**

```typescript
import fs from "fs";
import path from "path";
import type { PodcastMeta } from "../pipeline/types.js";
import { VAULT_BASE } from "./vault-config.js";

// ====== 内部工具 ======

/**
 * 提取文本前 N 句（按句末标点 。！？ 分割）。
 * 返回拼接后的字符串；若文本无可识别句子则返回原文。
 */
function extractSummary(text: string, maxSentences = 2): string {
  if (!text.trim()) return "";
  const sentences = text
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return text.trim();
  return sentences.slice(0, maxSentences).join("");
}

// ====== 公开接口 ======

export interface PublishOptions {
  date: string;       // "YYYY-MM-DD"
  audioPath: string;  // 绝对路径，如 E:/cc/podcast-generation/output/laona-digest-YYYY-MM-DD.mp3
  videoPath: string;  // 绝对路径；空字符串表示跳过 MP4 复制
  podcastMeta: PodcastMeta;
}

/**
 * 生成 shownote.md 内容（纯函数，供单元测试）。
 * 格式：节目标题 + 每篇文章加粗标题 + 口播稿前 2 句摘要。
 */
export function generateShownote(podcastMeta: PodcastMeta, date: string): string {
  const lines: string[] = [
    `# ${podcastMeta.title}`,
    "",
    "## 本期内容",
    "",
  ];

  for (const script of podcastMeta.articleScripts) {
    const summary = extractSummary(script.text, 2);
    lines.push(`**${script.title}**`);
    lines.push(summary);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * 将播客产物复制到 Obsidian vault 指定目录。
 * 目录：VAULT_BASE/03_Content_Factory/01_Final_Assets/podcast/YYYY-MM-DD/
 */
export async function publishToObsidian(options: PublishOptions): Promise<void> {
  const { date, audioPath, videoPath, podcastMeta } = options;

  const destDir =
    VAULT_BASE + "/03_Content_Factory/01_Final_Assets/podcast/" + date;
  fs.mkdirSync(destDir, { recursive: true });

  // 复制 MP3
  fs.copyFileSync(audioPath, destDir + "/" + path.basename(audioPath));

  // 复制 MP4（可选）
  if (videoPath) {
    fs.copyFileSync(videoPath, destDir + "/" + path.basename(videoPath));
  }

  // 写入 shownote.md（覆盖）
  const shownote = generateShownote(podcastMeta, date);
  fs.writeFileSync(destDir + "/shownote.md", shownote, "utf-8");
}
```

- [ ] **Step 4: 运行测试确认 7 条全部通过**

```
cd E:\cc\podcast-generation && npx vitest run src/tests/podcast-publisher.test.ts
```
预期：7 tests passed

- [ ] **Step 5: 运行全量测试确认无回归**

```
cd E:\cc\podcast-generation && npx vitest run
```

- [ ] **Step 6: TypeScript 检查**

```
cd E:\cc\podcast-generation && npx tsc --noEmit
```
预期：0 errors

- [ ] **Step 7: 提交**

```bash
git add src/workflow/podcast-publisher.ts src/tests/podcast-publisher.test.ts
git commit -m "feat: add podcast-publisher with generateShownote and publishToObsidian"
```

---

## Task 3: obsidian-scan.ts — 过去 24 小时过滤

**Files:**
- Modify: `src/workflow/obsidian-scan.ts`（第 74-101 行附近）
- Modify: `src/tests/obsidian-scan.test.ts`（如文件不存在则新建）

注意：`isWithinHours` 是纯函数，用 `export` 导出以便测试。

- [ ] **Step 1: 写失败测试**

若 `src/tests/obsidian-scan.test.ts` 不存在，新建；否则追加：

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

```
cd E:\cc\podcast-generation && npx vitest run src/tests/obsidian-scan.test.ts
```
预期：FAIL — `isWithinHours` not exported

- [ ] **Step 3: 修改 `src/workflow/obsidian-scan.ts`**

**改动 A：** 将 `isWithinHours` 函数加在 `extractTitle` 之后（第 62 行后），并 `export`：

```typescript
/**
 * 判断路径中的日期是否在过去 N 小时内。
 * 使用截止时刻所在天的零点比较，避免傍晚运行时同天文章被误过滤。
 */
export function isWithinHours(p: string, hours: number): boolean {
  const dateStr = extractDateFromPath(p);
  if (dateStr === "0000-00-00") return false;
  const articleDate = new Date(dateStr + "T00:00:00");
  const cutoffMs = Date.now() - hours * 3600 * 1000;
  const cutoffDay = new Date(
    new Date(cutoffMs).toISOString().slice(0, 10) + "T00:00:00"
  );
  return articleDate >= cutoffDay;
}
```

**改动 B：** 更新 `ScanOptions` 接口（当前第 74-76 行）：

```typescript
export interface ScanOptions {
  limit?: number;        // 最多返回几篇，默认 5
  withinHours?: number;  // 只取该小时数内的文章，默认 24；传 0 不过滤
}
```

**改动 C：** 在 `scanKanbanForArticles` 中，`allLinks.length === 0` 检查之后（当前第 93-96 行后）插入过滤逻辑：

```typescript
// 过滤：仅保留过去 withinHours 小时内的文章（默认 24h）
const hours = options.withinHours ?? 24;
const filteredLinks = hours > 0
  ? allLinks.filter(link => isWithinHours(link, hours))
  : allLinks;
if (filteredLinks.length === 0) {
  throw new Error(`过去 ${hours} 小时内没有已发布文章`);
}
console.log(`  过去 ${hours}h 内共 ${filteredLinks.length} 篇`);
```

同时将第 99-101 行的排序/截取由 `allLinks` 改为 `filteredLinks`：

```typescript
const topLinks = [...filteredLinks]
  .sort((a, b) => extractDateFromPath(b).localeCompare(extractDateFromPath(a)))
  .slice(0, limit);
```

- [ ] **Step 4: 运行测试确认 4 条通过**

```
cd E:\cc\podcast-generation && npx vitest run src/tests/obsidian-scan.test.ts
```
预期：4 tests passed

- [ ] **Step 5: 全量测试 + TypeScript 检查**

```
cd E:\cc\podcast-generation && npx vitest run && npx tsc --noEmit
```
预期：全部 passed，0 errors

- [ ] **Step 6: 提交**

```bash
git add src/workflow/obsidian-scan.ts src/tests/obsidian-scan.test.ts
git commit -m "feat: add 24h article filter to scanKanbanForArticles"
```

---

## Task 4: index.ts — videoOutputPath 作用域提升 + Step 9

**Files:**
- Modify: `src/index.ts`

### 当前代码位置参考

- 第 9-13 行：import 列表
- 第 247 行：`const videoOutputPath = resolveOutputName(...)` — 在 `if (!noVideo)` 块内
- 第 261-270 行：Step 8 元数据保存
- 第 272-279 行：Step 9 清理（现有）

### 改动 A：添加 import

在第 12 行（`import { renderPodcastVideo }` 附近）后追加：

```typescript
import { publishToObsidian } from "./workflow/podcast-publisher.js";
```

### 改动 B：videoOutputPath 作用域提升

**将现有第 247 行**：
```typescript
const videoOutputPath = resolveOutputName(config.outputDir, "mp4");
```
**改为** 在 `if (!noVideo)` 块外（第 207 行 `let subtitleCues` 附近）提前声明：
```typescript
let videoOutputPath = "";
```
然后在 `if (!noVideo)` 块内的原位置改为赋值：
```typescript
videoOutputPath = resolveOutputName(config.outputDir, "mp4");
```

### 改动 C：新增 Step 9（Obsidian 落盘）

在 Step 8 元数据保存之后、清理之前（第 271 行空行处）插入：

```typescript
  // ── Step 9: 落盘到 Obsidian ─────────────────────────────────
  if (fromKanban) {
    console.log("\n=== Step 9: 落盘到 Obsidian ===");
    const today = new Date().toISOString().slice(0, 10);
    await publishToObsidian({
      date: today,
      audioPath,
      videoPath: noVideo ? "" : videoOutputPath,
      podcastMeta,
    });
    console.log(`  ✅ 产物已落盘: natebrain/03_Content_Factory/01_Final_Assets/podcast/${today}/`);
  }
```

### 改动 D：清理步骤重编号

将原 `// ── Step 9: 清理` 注释改为 `// ── Step 10: 清理`（仅注释，不影响逻辑）。

- [ ] **Step 1: 实施上述 4 项改动**

按 A → B → C → D 顺序修改 `src/index.ts`。

- [ ] **Step 2: TypeScript 编译检查**

```
cd E:\cc\podcast-generation && npx tsc --noEmit
```
预期：0 errors

- [ ] **Step 3: 全量测试**

```
cd E:\cc\podcast-generation && npx vitest run
```
预期：全部 passed（含新加的 obsidian-scan 和 podcast-publisher 测试）

- [ ] **Step 4: 提交**

```bash
git add src/index.ts
git commit -m "feat: add Step 9 — publish podcast artifacts to Obsidian vault"
```

---

## 验收清单

- [ ] `npx vitest run` 全部通过（含 podcast-publisher × 7，obsidian-scan × 4）
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `--from-kanban` 模式下仅读取过去 24 小时内的文章
- [ ] 传 `withinHours: 0` 可关闭过滤（测试/调试用）
- [ ] 运行完毕后 `E:/natebrain/03_Content_Factory/01_Final_Assets/podcast/YYYY-MM-DD/` 目录下存在 MP3、MP4（若有）、shownote.md
- [ ] shownote.md 格式：`# 节目标题` + `## 本期内容` + 每篇文章加粗标题 + 前 2 句摘要
