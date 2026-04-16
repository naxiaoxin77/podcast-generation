# SRT 精确字幕 + 音频波形可视化 设计文档

**日期：** 2026-04-16
**项目：** podcast-generation
**阶段：** 第三期——SRT 精确字幕 + 音频波形可视化

---

## 1. 背景与目标

第二期完成了基于字符数估算的字幕时间轴（`subtitle-generator.ts`）和 Remotion 视频渲染。
本期目标：

1. **SRT 精确字幕**：用 Gemini 音频转录替代估算逻辑，获得带精确时间戳的 SubtitleCue[]
2. **音频波形可视化**：在视频底部添加实时音频波形条，增强视听一致性
3. **输出文件命名规范**：统一使用 `laona-digest-YYYY-MM-DD` 前缀

**不在本期范围：**
- BGM / 转场音效
- Obsidian 看板"已完成"列自动移卡

---

## 2. SRT 精确字幕

### 2.1 策略

对各段独立 TTS 文件（`tts/intro.mp3`、`tts/article-00.mp3`…）分别调用 Gemini 音频转录 API，
再根据 `timings.json` 的时间偏移拼合成全局 `SubtitleCue[]`，替换原有字符数比例估算。

保留原 `subtitle-generator.ts` 作为降级备用：API 失败时自动回退。

### 2.2 Gemini 音频转录流程

1. `uploadFile(audioPath)` — 上传 MP3 到 Gemini Files API，获得 `fileUri`
2. `generateContent({ fileUri, mimeType: "audio/mpeg" }, prompt)` — 要求模型输出带时间戳的逐句文字
3. 解析响应文本，提取 `[MM:SS.mmm] 句子` 格式
4. 每句相对时间戳 + 该段 `startTime` 偏移 → 全局 `SubtitleCue`
5. 上传后删除 Gemini 上的临时文件（`deleteFile(fileUri)`）

**Prompt 策略：**
```
请将以下音频转录为文字，每句话用时间戳标注，格式：[MM:SS.mmm] 文字内容
只输出时间戳和文字，不要任何说明。
```

### 2.3 接口

**文件：** `src/pipeline/srt-generator.ts`

```typescript
import type { SubtitleCue, SegmentTiming, ArticleScript } from "./types.js";
import { generateSubtitleCues } from "./subtitle-generator.js";

export interface TranscribedCue {
  relativeTime: number;  // 秒，相对于该段起点
  text: string;
}

/** 解析 Gemini 响应文本为 TranscribedCue[]（纯函数，供测试） */
export function parseTranscriptResponse(text: string): TranscribedCue[]

/** 将 TranscribedCue[] 应用时间偏移，输出 SubtitleCue[]（纯函数，供测试） */
export function applyOffset(cues: TranscribedCue[], segmentStartTime: number): SubtitleCue[]

/** 上传单段音频到 Gemini 并转录，返回带全局时间戳的 SubtitleCue[] */
export async function transcribeSegment(
  audioPath: string,
  segmentStartTime: number,  // 秒，该段在全局音频中的起始时间
  apiKey: string
): Promise<SubtitleCue[]>

export interface SrtFallbackData {
  introText: string;
  articleScripts: ArticleScript[];
  outroText: string;
}

/**
 * 转录所有段并合并为全局 SubtitleCue[]。
 * fallback 参数用于单段转录失败时降级到字符数估算版。
 */
export async function generateSrtSubtitleCues(
  timings: SegmentTiming[],
  ttsDir: string,            // tts 文件目录，含 intro.mp3 / article-NN.mp3 / outro.mp3
  apiKey: string,
  fallback: SrtFallbackData  // 必填，降级时使用
): Promise<SubtitleCue[]>
```

### 2.4 TTS 文件路径约定

| SegmentTiming.articleIndex | TTS 文件名 |
|---------------------------|-----------|
| -1（开场白）               | `intro.mp3` |
| 0, 1, 2…（文章）           | `article-00.mp3`, `article-01.mp3`… |
| -2（结束语）               | `outro.mp3` |

**注意**：`ttsDir` 在 `--keep` 模式下保留，否则 Step 9 清理。`generateSrtSubtitleCues` 必须在清理前（Step 5）调用，现有流程已满足此条件。

### 2.5 降级策略

`generateSrtSubtitleCues` 内部对每段做 try/catch，降级时使用 `fallback` 参数中的原始文本：

- **单段转录失败**：对该段调用 `generateSubtitleCues`（估算版），传入对应文本（intro/article/outro）和该段 timing，追加到结果中，`console.warn` 标记
- **全部失败**：完整回退到 `generateSubtitleCues(fallback.introText, fallback.articleScripts, fallback.outroText, timings)`

`generateSubtitleCues` 的单段降级逻辑：通过 `timing.articleIndex` 判断使用 `introText`、`outroText` 或对应 `ArticleScript.text`，与 `subtitle-generator.ts` 现有实现一致。

### 2.6 index.ts 改动

Step 5 替换调用（其余不变）：

```typescript
// 旧
subtitleCues = generateSubtitleCues(introText, podcastMeta.articleScripts, outroText, allTimings);

// 新
subtitleCues = await generateSrtSubtitleCues(
  allTimings,
  ttsDir,
  config.geminiApiKey,
  { introText, articleScripts: podcastMeta.articleScripts, outroText }  // 降级备用
);
```

---

## 3. 音频波形可视化

### 3.1 视觉设计

- **位置**：全宽条带，`bottom: 100px`，字幕条正上方
- **尺寸**：高度 52px，左右各 40px padding
- **样式**：金色细柱（`rgba(232,200,122,0.6)`），柱宽 3px，间距 2px，圆角顶部
- **行为**：柱高度实时映射当前帧的音频振幅，范围 2~44px

### 3.2 实现

使用 `@remotion/media-utils` 的 `useAudioData` + `visualizeAudio`：

```typescript
const audioData = useAudioData(staticFile(audioPath));
// audioData 在音频未加载时为 null，返回 null 不渲染
if (!audioData) return null;

const visualization = visualizeAudio({
  fps,
  frame,
  audioData,
  numberOfSamples: 128,  // 输出 128 个振幅采样
});
```

**渲染柱数**：`visualization` 数组固定 128 个元素，全部渲染为 128 根柱。
可用宽度 `1920 - 2×40 = 1840px`，128 根柱 × (3px 宽 + 2px 间距) = 640px，居中显示，两侧留白约 600px，视觉上整洁。如需更密集的效果可调大 `numberOfSamples`（最大 2048）。

每根柱高度 = `Math.max(waveform.minBarHeight, visualization[i] * waveform.maxBarHeight)`

### 3.3 文件

**新增：** `src/remotion/components/WaveformBar.tsx`

```typescript
interface Props {
  audioPath: string;  // 同 PodcastVideo 的 audioPath，相对 publicDir
}
export const WaveformBar: React.FC<Props>
```

**修改：** `src/remotion/design.config.ts` — 新增 `waveform` 配置节：

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
}
```

**修改：** `src/remotion/PodcastVideo.tsx` — 在 DataOverlay 和 SubtitleBar 之间插入 WaveformBar（第 4.5 层）：

```typescript
{/* Layer 4.5: Waveform */}
<WaveformBar audioPath={audioPath} />
```

**修改：** `package.json` — 新增依赖：

```json
"@remotion/media-utils": "^4.0.0"
```

### 3.4 SubtitleBar 位置联动

布局坐标验证（从屏幕底部向上）：

```
bottom: 0px          ── 进度条（2px）
bottom: 52px         ── 字幕条顶部（高约 48px = 24px 字号 + 上下 padding 12px×2）
bottom: 100px        ── 波形条底部
bottom: 152px        ── 波形条顶部（100 + 52px 高度）
```

波形条底部（100px）= 字幕条顶部（52px）+ 8px 间隙，不重叠。
`design.config.ts` 中将 `subtitle.bottomOffset` 从 48 → 52，留出 8px 间隙。

---

## 4. 输出文件命名规范

### 4.1 命名格式

```
laona-digest-YYYY-MM-DD.mp3
laona-digest-YYYY-MM-DD.mp4
```

同一天多次运行自动递增：
```
laona-digest-YYYY-MM-DD.mp3      (首次)
laona-digest-YYYY-MM-DD-2.mp3   (第二次)
laona-digest-YYYY-MM-DD-3.mp3   (第三次)
```

### 4.2 实现

新增工具函数 `src/utils/naming.ts`：

```typescript
export function resolveOutputName(outputDir: string, ext: "mp3" | "mp4"): string
```

逻辑：检查 `outputDir` 中是否已有同日期文件，自动追加数字后缀。

**修改：** `src/index.ts` — Step 4（MP3）、Step 7（MP4）**以及 `--video-only` 快速路径**均使用新函数替换 `podcast-${Date.now()}` 命名。

**计数器按扩展名分别计数**：`.mp3` 和 `.mp4` 独立递增，互不影响。
同一天先生成音频再生成视频，两者均为 `laona-digest-YYYY-MM-DD.{ext}`（各自的第一次）。
同一天第二次完整运行：`laona-digest-YYYY-MM-DD-2.mp3` 和 `laona-digest-YYYY-MM-DD-2.mp4`。

### 4.3 不受影响的中间文件

以下工作文件命名不变（非对外产物）：

| 文件 | 命名 |
|------|------|
| `output/scripts.json` | 不变 |
| `output/timings.json` | 不变 |
| `output/subtitle-cues.json` | 不变 |
| `output/overlays.json` | 不变 |
| `output/metadata.md` | 不变 |

---

## 5. 新增/修改文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/pipeline/srt-generator.ts` | Gemini 音频转录 → SubtitleCue[] |
| `src/remotion/components/WaveformBar.tsx` | 全宽波形条组件 |
| `src/utils/naming.ts` | 输出文件命名工具函数 |
| `src/tests/srt-generator.test.ts` | 单元测试：时间戳解析、偏移计算、降级逻辑 |
| `src/tests/naming.test.ts` | 单元测试：文件名生成、递增后缀 |

### 修改

| 文件 | 改动 |
|------|------|
| `src/remotion/design.config.ts` | 新增 `waveform` 配置节；`subtitle.bottomOffset` 48 → 52 |
| `src/remotion/PodcastVideo.tsx` | 插入 WaveformBar 第 4.5 层 |
| `src/index.ts` | Step 5 替换为 `generateSrtSubtitleCues`；MP3/MP4 使用新命名函数 |
| `package.json` | 新增 `@remotion/media-utils ^4.0.0` |

---

## 6. 测试策略

### srt-generator.test.ts（单元测试，不调用真实 API）

```typescript
// 1. 标准格式解析
parseTranscriptResponse("[01:23.456] 今天的新闻")
// → [{ relativeTime: 83.456, text: "今天的新闻" }]

// 2. 多行解析
parseTranscriptResponse("[00:00.500] 第一句。\n[00:03.200] 第二句。")
// → [{ relativeTime: 0.5, text: "第一句。" }, { relativeTime: 3.2, text: "第二句。" }]

// 3. 时间偏移
applyOffset([{ relativeTime: 2.5, text: "测试" }], 10)
// → [{ startTime: 12.5, endTime: 12.5, text: "测试" }]
// （endTime 由下一句 startTime 填充，最后一句 endTime = startTime + 估算时长）

// 4. 无法解析时返回空数组（不抛出）
parseTranscriptResponse("无法识别的格式")
// → []

// 5. 超过 1 小时的格式（H:MM:SS.mmm）
parseTranscriptResponse("[1:02:03.456] 长音频")
// → [{ relativeTime: 3723.456, text: "长音频" }]

// 6. Gemini 响应包裹 markdown 代码块时能正确提取
parseTranscriptResponse("```\n[00:01.000] 句子\n```")
// → [{ relativeTime: 1.0, text: "句子" }]

// 7. mimeType 必须为 "audio/mpeg"（不是 "audio/mp3"）
// 在 transcribeSegment 的实现注释中标注
```

### naming.test.ts（单元测试）

```typescript
// 1. 首次生成
resolveOutputName(emptyDir, "mp3") → "laona-digest-2026-04-16.mp3"

// 2. 已有同日期文件时递增
resolveOutputName(dirWithExisting, "mp4") → "laona-digest-2026-04-16-2.mp4"
```

---

## 7. 数据流

```
ttsDir/intro.mp3
ttsDir/article-00.mp3   ─┐
...                       ├─→ srt-generator.ts ──→ SubtitleCue[]
ttsDir/outro.mp3        ─┘         ↑
                              timings.json
                              (startTime 偏移)

publicDir/podcast.mp3 ──→ WaveformBar（Remotion useAudioData）

resolveOutputName() ──→ laona-digest-YYYY-MM-DD.mp3 / .mp4
```

---

## 8. 延后至下一阶段

- BGM / 转场音效触发
- Obsidian 看板"已完成"列自动移卡
