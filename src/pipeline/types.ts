// ====== Content Types ======

/** 一篇来自 Obsidian 或文件系统的新闻文章 */
export interface NewsArticle {
  title: string;
  content: string;       // markdown 正文
  sourcePath: string;    // 文件路径
}

// ====== Script Types ======

/**
 * 一篇文章对应的口播稿
 * 第 2 篇起，text 开头自带过渡句（由 LLM 生成）
 */
export interface ArticleScript {
  articleIndex: number;  // 0-based
  title: string;         // 文章原标题
  text: string;          // 完整口播文稿（含过渡句）
  estimatedDuration: number; // 预估秒数（text.length / 5）
}

/** 完整播客描述（用于元数据） */
export interface PodcastMeta {
  title: string;         // 节目标题，如 "每日商业快报 - 2026-04-15"
  articleScripts: ArticleScript[];
}

// ====== TTS Types ======

/** 一篇文章的 TTS 生成结果 */
export interface TTSResult {
  articleIndex: number;
  audioPath: string;
  duration: number;      // 秒（ffprobe 实测）
}

/** 每篇文章在总音频中的时间段 */
export interface SegmentTiming {
  articleIndex: number;
  title: string;
  startTime: number;     // 秒
  endTime: number;       // 秒
}

// ====== Pipeline Config ======

export interface PipelineConfig {
  geminiApiKey: string;
  topviewScriptsDir: string;
  podcastVoiceId: string;
  ttsSpeed: number;
  ttsEmotion: string;
  outputDir: string;
  publicDir: string;
}

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
  number: number;
  unit?: string;
  subtitle: string;
  theme?: SlideColorTheme;
}

export interface ComparisonSlide {
  layout: "comparison";
  title: string;
  left: { label: string; items: string[] };
  right: { label: string; items: string[] };
  theme?: SlideColorTheme;
}

export interface QuoteSlide {
  layout: "quote";
  title?: string;
  quote: string;
  attribution?: string;
  theme?: SlideColorTheme;
}

export interface TimelineSlide {
  layout: "timeline";
  title: string;
  nodes: Array<{ label: string; description?: string }>;
  theme?: SlideColorTheme;
}

export interface StatRowSlide {
  layout: "stat-row";
  title?: string;
  stats: Array<{
    label: string;      // 小标签，如 "来源：AMD分析"
    value: string;      // 大值，可含箭头，如 "7,000" 或 "2200 → 600"
    unit?: string;      // 单位，如 "次"
    trend?: string;     // 趋势说明，如 "▼ 暴跌 -73%"
    trendUp?: boolean;  // true=涨（绿），false=跌（红），undefined=中性
  }>;
  theme?: SlideColorTheme;
}

export interface TextHighlightSlide {
  layout: "text-highlight";
  text: string;         // 主要大字
  subtext?: string;     // 小字说明（可选）
  theme?: SlideColorTheme;
}

export type SlideData =
  | BulletListSlide
  | BigNumberSlide
  | ComparisonSlide
  | QuoteSlide
  | TimelineSlide
  | StatRowSlide
  | TextHighlightSlide;

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
