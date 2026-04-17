# Obsidian 播客落盘 设计文档

**日期：** 2026-04-17
**项目：** podcast-generation
**阶段：** 第四期——Obsidian 播客产物落盘

---

## 1. 背景与目标

前三期完成了完整的播客音视频生成管道。本期目标：

1. **过去 24 小时文章过滤**：`--from-kanban` 模式下只处理"已发布"列中日期在过去 24 小时内的文章
2. **产物落盘到 Obsidian**：生成完毕后，将 MP3、MP4 和 shownote.md 写入 Vault 指定目录
3. **shownote 自动生成**：简洁版，标题 + 每篇文章口播稿前 2 句摘要，不额外调用 Gemini

**不在本期范围：**
- 看板卡片移列（已明确不需要）
- BGM / 转场音效
- shownote 的丰富格式（时间戳、节目简介段落等）

---

## 2. 文章扫描：过去 24 小时过滤

### 2.1 过滤策略

文章 wikilink 路径中已嵌入日期，例如：
```
03_Content_Factory/01_Final_Assets/深度blog/2026-04-16/2026-04-16-跨国巨头续命局/[终稿-图文]-...
```

现有 `extractDateFromPath(p)` 函数能直接提取 `YYYY-MM-DD`。

在 `scanKanbanForArticles` 的排序/截取逻辑之前，增加一步过滤：仅保留日期在 `Date.now() - 24 * 3600 * 1000` 以内的链接。

### 2.2 改动

**文件：** `src/workflow/obsidian-scan.ts`

```typescript
/** 判断路径中的日期是否在过去 N 小时内（按自然天比较，避免傍晚运行时同天文章被误过滤） */
function isWithinHours(p: string, hours: number): boolean {
  const dateStr = extractDateFromPath(p);
  if (dateStr === "0000-00-00") return false;
  const articleDate = new Date(dateStr + "T00:00:00");
  // 取截止时刻所在天的零点，避免时间精度导致同天文章被误排除
  const cutoffMs = Date.now() - hours * 3600 * 1000;
  const cutoffDay = new Date(
    new Date(cutoffMs).toISOString().slice(0, 10) + "T00:00:00"
  );
  return articleDate >= cutoffDay;
}
```

在 `scanKanbanForArticles` 中，`parseColumnLinks` 之后、排序之前：

```typescript
// 过滤：只保留过去 24 小时内的文章
const recentLinks = allLinks.filter(link => isWithinHours(link, 24));
if (recentLinks.length === 0) {
  throw new Error("过去 24 小时内没有已发布文章");
}
```

`ScanOptions` 新增可选字段 `withinHours`（默认 24），方便测试时调整：

```typescript
export interface ScanOptions {
  limit?: number;       // 最多返回几篇，默认 5
  withinHours?: number; // 只取该小时数内的文章，默认 24
}
```

---

## 3. 播客产物落盘

### 3.1 输出目录

```
E:/natebrain/03_Content_Factory/01_Final_Assets/podcast/YYYY-MM-DD/
├── laona-digest-YYYY-MM-DD.mp3
├── laona-digest-YYYY-MM-DD.mp4
└── shownote.md
```

若同天多次运行（MP3/MP4 有 `-2`、`-3` 后缀），MP3/MP4 文件名与 `output/` 目录中一致，shownote.md 覆盖写入（同目录只保留最新一份）。

### 3.2 shownote.md 格式

```markdown
# 每日商业快报 · 2026-04-17

## 本期内容

**文章标题一**
口播稿前 2 句话（按 `。` 分割，取前 2 个非空句）。

**文章标题二**
...
```

摘要提取规则：
- 对 `articleScript.text` 按 `。！？` 分句（复用 `splitSentences` 逻辑）
- 取前 2 句拼接，末尾确保有 `。`
- 若全文不足 2 句，取全文

### 3.3 新增文件

**文件：** `src/workflow/podcast-publisher.ts`

```typescript
import type { PodcastMeta } from "../pipeline/types.js";

export interface PublishOptions {
  date: string;           // "YYYY-MM-DD"
  audioPath: string;      // output/laona-digest-YYYY-MM-DD.mp3 绝对路径
  videoPath: string;      // output/laona-digest-YYYY-MM-DD.mp4 绝对路径（空字符串表示跳过）
  podcastMeta: PodcastMeta;
}

/** 生成 shownote.md 内容（纯函数，供测试） */
export function generateShownote(
  podcastMeta: PodcastMeta,
  date: string
): string

/** 将播客产物复制到 Obsidian vault 指定目录 */
export async function publishToObsidian(options: PublishOptions): Promise<void>
```

`publishToObsidian` 内部步骤：
1. 构建目标目录路径：`VAULT_BASE/03_Content_Factory/01_Final_Assets/podcast/YYYY-MM-DD`
2. `fs.mkdirSync(destDir, { recursive: true })`
3. 复制 MP3（`fs.copyFileSync`）
4. 若 `videoPath` 存在则复制 MP4
5. 写入 `shownote.md`

### 3.4 常量共享

`VAULT_BASE`（`"E:/natebrain"`）目前在 `obsidian-scan.ts` 中定义为模块私有常量。将其提取到新文件 `src/workflow/vault-config.ts`，供 `obsidian-scan.ts` 和 `podcast-publisher.ts` 共同引用：

```typescript
// src/workflow/vault-config.ts
export const VAULT_BASE = "E:/natebrain";
export function vaultFullPath(relPath: string): string {
  return VAULT_BASE + "/" + relPath;
}
```

---

## 4. index.ts 改动

### 4.1 Step 9（新增）

在 Step 8（元数据保存）之后：

```typescript
// ── Step 9: 落盘到 Obsidian ──────────────────────────────
if (fromKanban) {
  console.log("\n=== Step 9: 落盘到 Obsidian ===");
  await publishToObsidian({
    date: new Date().toISOString().slice(0, 10),
    audioPath,
    videoPath: noVideo ? "" : videoOutputPath,
    podcastMeta,
  });
  console.log("  ✅ 产物已落盘到 Obsidian vault");
}
```

`videoPath` 为空字符串时，`publishToObsidian` 跳过 MP4 复制。

### 4.2 `videoOutputPath` 作用域

当前 `videoOutputPath` 声明在 `if (!noVideo)` 块内。需提升到外层：

```typescript
let videoOutputPath = "";
if (!noVideo) {
  // ...渲染逻辑...
  videoOutputPath = resolveOutputName(config.outputDir, "mp4");
  // ...
}
```

---

## 5. 新增/修改文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/workflow/vault-config.ts` | VAULT_BASE 常量 + vaultFullPath 工具函数 |
| `src/workflow/podcast-publisher.ts` | 生成 shownote + 复制产物到 Obsidian |
| `src/tests/podcast-publisher.test.ts` | `generateShownote` 纯函数单元测试 |

### 修改

| 文件 | 改动 |
|------|------|
| `src/workflow/obsidian-scan.ts` | 引用 `vault-config.ts`；新增 `isWithinHours`；`ScanOptions` 加 `withinHours` 字段 |
| `src/index.ts` | `videoOutputPath` 提升作用域；新增 Step 9 |

---

## 6. 测试策略

### podcast-publisher.test.ts（单元测试，不写真实文件）

```typescript
// 1. 标准格式：2 篇文章各取前 2 句
generateShownote(meta, "2026-04-17")
// → 含 "# 每日商业快报 · 2026-04-17"
// → 含每篇标题加粗 + 2 句摘要

// 2. 文章只有 1 句时取全文
// 3. 文章为空时输出空摘要行（不崩溃）
// 4. shownote 以 \n 结尾
```

### obsidian-scan.ts 的 isWithinHours（可在现有测试文件中追加）

```typescript
// 今天日期 → true
// 昨天日期 → true（24h 内）
// 两天前 → false
// 无法解析日期 → false
```

---

## 7. 数据流

```
kanban "已发布"列
  → isWithinHours(24h) 过滤
  → 读取文章内容
  → 现有 Step 2-8 管道
  → audioPath (output/laona-digest-YYYY-MM-DD.mp3)
  → videoOutputPath (output/laona-digest-YYYY-MM-DD.mp4)
  → publishToObsidian()
      ├── 复制 MP3 → vault/03_Content_Factory/01_Final_Assets/podcast/YYYY-MM-DD/
      ├── 复制 MP4 → 同上
      └── 写 shownote.md → 同上
```
