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
    background: "linear-gradient(160deg, #141210 0%, #0a0908 100%)",
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
    fontSize: 40,
    fontWeight: 700,
    color: "#ffffff",
    highlightColor: "#e8c87a",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    borderRadius: 0,
    padding: "18px 60px",
    bottomOffset: 0,
    maxWidth: 1920,
    lineHeight: 1.5,
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
    width: 1300,
    bgColor: "rgba(8, 6, 4, 0.88)",
    borderColor: "rgba(200, 164, 110, 0.35)",
    borderRadius: 16,
    enterDuration: 18,  // frames
    exitDuration: 12,   // frames
    scaleFrom: 0.94,    // 入场起始缩放
    yFrom: 30,          // 入场 Y 偏移（像素），从略低处浮上来
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

  // ========== 幻灯片通用 ==========
  slide: {
    padding: "60px 50px",
    title: {
      fontSize: 75,
      fontWeight: 600,
      marginBottom: 50,
      lineHeight: 1.3,
    },
    titleEnterDuration: 15,
    titleEnterOffset: -20,
  },

  // ========== B-roll 动效 ==========
  effects: {
    cameraPush: {
      enabled: false,
      scaleFrom: 1.0,
      scaleTo: 1.12,
    },
    lightSweep: {
      enabled: true,
      startFrame: 18,
      duration: 25,
      width: 120,
      opacity: 0.28,
      angle: 20,
    },
  },

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

  // ========== comparison 对比 ==========
  comparison: {
    leftColor: "#e8a87a",
    rightColor: "#7ac8e8",
    labelFontSize: 42,
    labelFontWeight: 700,
    itemFontSize: 38,
    dividerWidth: 3,
    spring: { damping: 15, stiffness: 100 },
    maxItemStagger: 10,
  },

  // ========== quote 引用 ==========
  quote: {
    quoteMarkFontSize: 320,
    quoteMarkOpacity: 0.15,
    quoteFontSize: 52,
    quoteFontWeight: 500,
    quoteLineHeight: 1.8,
    attributionFontSize: 38,
    typewriterSpeed: 1.5,
    typewriterMaxRatio: 0.75,
    cursorBlinkInterval: 8,
  },

  // ========== timeline 时间线 ==========
  timeline: {
    paddingLeft: 50,
    dotSize: 32,
    dotBorderWidth: 3,
    dotGlow: true,
    labelFontSize: 44,
    labelFontWeight: 700,
    descriptionFontSize: 36,
    nodeMarginBottom: 52,
    spring: { damping: 14, stiffness: 120 },
    maxStaggerDelay: 18,
  },

  waveform: {
    height: 52,
    bottomOffset: 90,
    barWidth: 3,
    barGap: 2,
    barColor: "rgba(232, 200, 122, 0.7)",
    minBarHeight: 2,
    maxBarHeight: 44,
    numberOfSamples: 128,
    padding: 40,
  },

} as const;

export type DesignConfig = typeof designConfig;
