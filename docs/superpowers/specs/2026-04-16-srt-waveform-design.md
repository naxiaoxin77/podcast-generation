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
export interface TranscribedCue {
  relativeTime: number;  // 秒，相对于该段起点
  text: string;
}

export async function transcribeSegment(
  audioPath: string,
  segmentStartTime: number,  // 秒，该段在全局音频中的起始时间
  apiKey: string
): Promise<SubtitleCue[]>

export async function generateSrtSubtitleCues(
  timings: SegmentTiming[],
  ttsDir: string,            // tts 文件目录，含 intro.mp3 / article-NN.mp3 / outro.mp3
  apiKey: string
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

`generateSrtSubtitleCues` 内部对每段做 try/catch：
- 单段转录失败 → 对该段使用 `generateSubtitleCues`（估算版）补充
- 全部失败 → 完整回退到估算版，`console.warn` 提示

### 2.6 index.ts 改动

Step 5 替换调用（其余不变）：

```typescript
// 旧
subtitleCues = generateSubtitleCues(introText, podcastMeta.articleScripts, outroText, allTimings);

// 新
subtitleCues = await generateSrtSubtitleCues(allTimings, ttsDir, config.geminiApiKey);
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
const visualization = visualizeAudio({
  fps,
  frame,
  audioData,
  numberOfSamples: 128,
});
```

每根柱高度 = `Math.max(2, visualization[i] * 44)`

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

现有 SubtitleBar `bottomOffset: 48px`，WaveformBar `bottomOffset: 100px`，两者不重叠（52px 高的波形条恰好位于字幕条上方）。
`design.config.ts` 中将 `subtitle.bottomOffset` 从 48 → 52，保留 8px 间隙。

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

**修改：** `src/index.ts` — Step 4（MP3）和 Step 7（MP4）使用新函数替换 `podcast-${Date.now()}` 命名。

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
// 1. 时间戳解析
parseTimestampLine("[01:23.456] 今天的新闻")
// → { relativeTime: 83.456, text: "今天的新闻" }

// 2. 多行解析
parseTranscriptResponse("[00:00.500] 第一句。\n[00:03.200] 第二句。")
// → [{ relativeTime: 0.5, text: "第一句。" }, { relativeTime: 3.2, text: "第二句。" }]

// 3. 时间偏移
applyOffset(cues, segmentStartTime: 10)
// → cues 中每个 startTime += 10

// 4. 无法解析时返回空数组（不抛出）
parseTranscriptResponse("无法识别的格式")
// → []
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
