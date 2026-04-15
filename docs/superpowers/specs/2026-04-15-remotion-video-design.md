# Remotion 视频层 设计文档

**日期：** 2026-04-15  
**项目：** podcast-generation  
**阶段：** 第二期——Remotion 视频渲染

---

## 1. 背景与目标

音频 pipeline（Step 0–4）已完成，输出 `podcast.mp3` + `timings.json`。  
本期目标：在音频基础上生成 1920×1080 横屏视频（MP4），内容为播客音频 + 文字动效可视化，无 avatar。

**不在本期范围：**
- 音频波形可视化（`useAudioData`）
- 音效触发（BGM、转场音效）
- SRT 精确字幕（当前用脚本估算，接口预留升级路径）

---

## 2. 视觉设计决策

| 项目 | 决策 |
|------|------|
| 风格 | 暖色报刊风——深棕/近黑背景，金色/米白文字 |
| 尺寸 | 1920×1080，横屏，30fps |
| 背景动效 | 金色粒子漂浮（若干细粒子缓慢漂移） |
| 字幕 | 底部米白字幕条，当前句高亮，脚本估算时间轴 |
| 数据卡片 | 每篇文章 2~3 张，右侧滑入，复用参考项目 5 种 slide 类型 |
| 标题卡 | 文章切换时全屏显示 3 秒，fade-in/out |

### 色板

```
背景：#1a1208（深棕近黑）
主文字：#f5e6c8（米白）
金色强调：#e8c87a / #c8a46e
字幕条背景：rgba(245, 230, 200, 0.95)
字幕条文字：#1a0e04（近黑）
字幕高亮：#c05010（暖橙）
数据卡片背景：rgba(10, 6, 2, 0.92)
数据卡片边框：rgba(200, 164, 110, 0.45)
```

---

## 3. 视频层次结构（从底到顶）

```
层 6（顶）  HUD               Logo + 日期 + 进度条，始终可见
层 5        SubtitleBar        底部字幕条，逐句更新
层 4        DataOverlay        按时间点出入场的数据卡片（可选出现）
层 3        SegmentTitleCard   文章切换时的全屏标题卡（3 秒）
层 2        <Audio>            Remotion 内置音频组件，播放 podcast.mp3
层 1（底）  PodcastBackground  深棕背景 + 金色粒子漂浮动效
```

### 各层行为

**PodcastBackground**
- 固定深棕渐变底色：`linear-gradient(160deg, #1a1208, #0d0904)`
- 10~15 个金色圆点粒子，用 `interpolate` + `spring` 做缓慢漂移和呼吸效果
- 粒子大小 2~4px，透明度 0.3~0.6

**SegmentTitleCard**
- 每篇文章的 `startTime` 触发，持续 3 秒
- 内容：「第 N 条」（金色小字）+ 文章标题（米白大字）
- 动效：fade-in 0.5s → 停留 2s → fade-out 0.5s
- 开场白和结束语段不显示标题卡

**DataOverlay**
- 包裹参考项目的 `SlideRenderer`，支持 5 种布局：`bullet-list / big-number / comparison / quote / timeline`
- 定位：右侧，距边 40px，宽度约 420px
- 入场：右滑入（translateX 从 +60px → 0）+ fade-in，时长 0.4s
- 出场：fade-out，时长 0.3s
- 卡片背景：深色半透明 + 金色边框

**SubtitleBar**
- 定位：底部，距底边 48px，居中，最大宽度 1600px
- 背景：米白半透明圆角矩形
- 字体：Noto Sans SC，24px，行高 1.6
- 当前句：正常显示；当前强调词（可选）：暖橙色
- 接口：`SubtitleCue[]`，与来源无关（估算或 SRT 均可）

**HUD**
- 左上角：「每日商业快报 · YYYY-MM-DD」，金色，字号 18px
- 底部：1px 细进度条，金色，宽度 = `(useCurrentFrame() / (totalDuration * fps)) * 100%`（跟随已播放时间比例）

---

## 4. 核心数据类型

### ArticleScript（已有，Step 2 输出）

```typescript
// src/pipeline/types.ts 中已定义
export interface ArticleScript {
  articleIndex: number;       // 0-based，对应 SegmentTiming.articleIndex
  title: string;
  text: string;               // 完整口播文稿，含过渡句
  estimatedDuration: number;  // 预估秒数
}
```

### timings.json schema（已有，Step 4 输出）

```typescript
// src/pipeline/types.ts 中已定义
export interface SegmentTiming {
  articleIndex: number;  // -1=开场白, -2=结束语, 0~N=文章
  title: string;
  startTime: number;     // 秒，相对音频起点
  endTime: number;
}
```

### SlideData union type（从参考项目复制，含以下5种）

```typescript
export type SlideData =
  | { layout: "bullet-list"; title: string; items: { icon?: string; text: string }[] }
  | { layout: "big-number"; number: string; unit?: string; subtitle: string }
  | { layout: "comparison"; leftLabel: string; rightLabel: string; leftItems: string[]; rightItems: string[] }
  | { layout: "quote"; text: string; source?: string }
  | { layout: "timeline"; title: string; events: { time: string; text: string }[] }
```

### OverlayItem

```typescript
export interface OverlayItem {
  startTime: number;   // 秒，绝对时间
  endTime: number;     // 持续 8~12 秒
  slideData: SlideData;
}
```

### SubtitleCue

```typescript
export interface SubtitleCue {
  startTime: number;   // 秒，绝对时间
  endTime: number;
  text: string;
}
```

### PodcastCompositionProps

```typescript
export interface PodcastCompositionProps {
  audioPath: string;            // 相对于 publicDir 的路径，如 "podcast-1234.mp3"
  totalDuration: number;        // 秒
  subtitleCues: SubtitleCue[];
  overlays: OverlayItem[];
  segmentTimings: SegmentTiming[];  // 用于触发标题卡（articleIndex >= 0 的条目）
  podcastTitle: string;
  date: string;                 // "YYYY-MM-DD"
}
```

---

## 5. Pipeline 扩展

在现有 Step 4（拼接音频）之后新增 3 个步骤：

### Step 5：生成字幕时间轴

**文件：** `src/pipeline/subtitle-generator.ts`

```
输入：ArticleScript[] + introText + outroText + timings (SegmentTiming[])
输出：SubtitleCue[]  →  output/subtitle-cues.json
```

**各段文本来源（与 SegmentTiming 的对应关系）：**
- `articleIndex === -1`（开场白）→ `introText` 参数
- `articleIndex === -2`（结束语）→ `outroText` 参数
- `articleIndex >= 0`（文章）→ `articleScripts.find(s => s.articleIndex === timing.articleIndex).text`

**算法：**
1. 遍历 `timings`（按 startTime 排序），取每段文本
2. 将文本按中文句末标点切分（`。！？…`），末尾无标点的作为最后一句
3. 按**字符数比例**分配时间（`句子时长 = 段总时长 × 句字数 / 段总字数`）——比等分更接近实际语速
4. 拼接成全局 `SubtitleCue[]`，`startTime` 为 `segmentStartTime + 句在段内的累计偏移`

**接口：**
```typescript
export interface SubtitleCue {
  startTime: number;   // 秒，相对于音频起点
  endTime: number;
  text: string;
}

export function generateSubtitleCues(
  introText: string,
  articleScripts: ArticleScript[],
  outroText: string,
  timings: SegmentTiming[]
): SubtitleCue[]
```

### Step 6：规划数据叠层卡片

**文件：** `src/pipeline/overlay-planner.ts`

```
输入：ArticleScript[] + timings (SegmentTiming[])
输出：OverlayItem[]  →  output/overlays.json
```

**Gemini Prompt 策略：**
- 每篇文章单独调用，输入口播稿文本 + 该文章在音频中的 startTime/endTime
- System prompt 要求输出严格 JSON 数组，每项包含 `layout`、内容字段、`startTime`
- 时间点分布规则：第一张卡片不早于 `articleStartTime + 3`（避开标题卡），相邻卡片间隔 ≥ 15 秒，每张持续 10 秒
- 可选卡片类型优先级：`big-number`（有具体数字时）> `bullet-list`（要点列举）> `quote`（金句）> `comparison`（对比）> `timeline`（事件序列）

**Zod schema（输出验证）：**
```typescript
const OverlayItemSchema = z.object({
  startTime: z.number(),
  layout: z.enum(["bullet-list", "big-number", "comparison", "quote", "timeline"]),
  data: z.record(z.unknown()),  // 由 layout 决定具体字段
});
const OverlaysOutputSchema = z.array(OverlayItemSchema).min(1).max(3);
```

**接口：**
```typescript
export interface OverlayItem {
  startTime: number;   // 秒
  endTime: number;     // 秒，持续 8~12 秒
  slideData: SlideData;
}

export async function planOverlays(
  articleScripts: ArticleScript[],
  timings: SegmentTiming[],
  apiKey: string
): Promise<OverlayItem[]>
```

### Step 7：Remotion 渲染视频

**文件：** `src/remotion/render.ts`

```
输入：PodcastCompositionProps
输出：output/podcast-TIMESTAMP.mp4
```

**音频文件可访问性：**
Remotion bundle 通过 `publicDir`（即项目根目录下的 `public/`）暴露静态文件。在 Step 4 拼接完成后，将 `podcast.mp3` 复制到 `public/podcast.mp3`，`audioPath` 传入相对路径 `"podcast.mp3"`，在合成中通过 Remotion 的 `staticFile("podcast.mp3")` 引用。

**接口：**（见第4节 `PodcastCompositionProps`）

---

## 5. 文件清单

### 从参考项目复制（改动极少）

| 源文件 | 目标 | 改动 |
|--------|------|------|
| `remotion.config.ts` | 根目录 | composition ID 改为 `PodcastVideo` |
| `src/remotion/render.ts` | 同路径 | composition ID、尺寸（1920×1080） |
| `src/remotion/fonts.ts` | 同路径 | 不动 |
| `src/remotion/components/slides/*`（5个） | 同路径 | 不动 |
| `src/remotion/components/SlideRenderer.tsx` | 同路径 | 不动 |

### 改编自参考项目

| 文件 | 改动内容 |
|------|---------|
| `src/remotion/design.config.ts` | 色板改为暖色报刊风，尺寸改为 1920×1080 |

### 全新创建

| 文件 | 说明 |
|------|------|
| `src/remotion/Root.tsx` | 注册 `PodcastVideo` 合成，动态计算帧数 |
| `src/remotion/PodcastVideo.tsx` | 主合成，6 层结构 |
| `src/remotion/components/PodcastBackground.tsx` | 深棕背景 + 金色粒子 |
| `src/remotion/components/SegmentTitleCard.tsx` | 文章切换标题卡 |
| `src/remotion/components/SubtitleBar.tsx` | 底部字幕条 |
| `src/remotion/components/DataOverlay.tsx` | 数据叠层卡片包装组件 |
| `src/remotion/components/HUD.tsx` | Logo + 日期 + 进度条 |
| `src/pipeline/subtitle-generator.ts` | 脚本 → SubtitleCue[] |
| `src/pipeline/overlay-planner.ts` | Gemini → OverlayItem[] |

### 修改现有文件

| 文件 | 改动 |
|------|------|
| `src/pipeline/types.ts` | 新增 `SubtitleCue`、`OverlayItem`、`PodcastCompositionProps` |
| `src/index.ts` | 新增 Step 5、6、7；新增 `--video-only` / `--no-video` 参数 |
| `package.json` | 新增 Remotion 依赖 |

---

## 6. 依赖新增

Remotion 4.x 官方支持 React 18，锁定 React 18 避免兼容风险：

```json
{
  "remotion": "^4.0.0",
  "@remotion/bundler": "^4.0.0",
  "@remotion/cli": "^4.0.0",
  "@remotion/renderer": "^4.0.0",
  "@remotion/google-fonts": "^4.0.0",
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "@types/react": "^18.0.0",
  "@types/react-dom": "^18.0.0"
}
```

---

## 7. 数据流

```
ArticleScript[] + timings.json
        │
        ├──→ subtitle-generator.ts ──→ SubtitleCue[]
        │
        └──→ overlay-planner.ts ────→ OverlayItem[]

podcast.mp3 (已在 public/)
        │
        └──→ PodcastCompositionProps
                    │
                    └──→ Remotion renderMedia ──→ podcast.mp4
```

---

## 8. 输出文件约定

所有产物统一写入 `config.outputDir`（默认 `output/`）：

| 文件 | 来源步骤 |
|------|---------|
| `output/scripts.json` | Step 2 |
| `output/timings.json` | Step 4 |
| `output/podcast-TIMESTAMP.mp3` | Step 4 |
| `public/podcast.mp3` | Step 4 后复制（供 Remotion staticFile 访问） |
| `output/subtitle-cues.json` | Step 5 |
| `output/overlays.json` | Step 6 |
| `output/podcast-TIMESTAMP.mp4` | Step 7 |

---

## 9. CLI 参数扩展

```
--no-video      只生成音频，跳过 Step 5-7（现有行为）
--video-only    跳过 Step 1-4，从 output/ 读取已有数据直接渲染视频（调试用）
                读取文件：output/scripts.json, output/timings.json,
                          output/subtitle-cues.json, output/overlays.json,
                          public/podcast.mp3（必须已存在）
                执行：Step 7 only
（默认）        完整流程，输出 MP3 + MP4
```

---

## 10. 延后至下一阶段

- 音频波形可视化（`@remotion/media-utils` `useAudioData`）
- BGM / 转场音效触发
- SRT 精确字幕（Gemini 音频转录）
- Obsidian 看板"已完成"列自动移卡
