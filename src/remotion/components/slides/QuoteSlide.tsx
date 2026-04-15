import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { QuoteSlide as QuoteSlideData } from "../../../pipeline/types";
import { SlideBackground, SlideTitle, resolveTheme } from "./SlideBackground";
import { designConfig } from "../../design.config";

const dc = designConfig;
const ds = dc.slide;
const dq = dc.quote;

export const QuoteSlide: React.FC<{
  data: QuoteSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = resolveTheme(data.theme);

  const quoteMarkOpacity = interpolate(frame, [0, 12], [0, dq.quoteMarkOpacity], { extrapolateRight: "clamp" });
  const quoteMarkScale = interpolate(frame, [0, 12], [0.5, 1], { extrapolateRight: "clamp" });

  const titleOpacity = data.title
    ? interpolate(frame, [5, ds.titleEnterDuration + 3], [0, 1], { extrapolateRight: "clamp" })
    : 0;
  const titleY = data.title
    ? interpolate(frame, [5, ds.titleEnterDuration + 3], [ds.titleEnterOffset, 0], { extrapolateRight: "clamp" })
    : 0;

  const typewriterStart = ds.titleEnterDuration;
  const typewriterEnd = Math.min(
    typewriterStart + data.quote.length * dq.typewriterSpeed,
    durationInFrames * dq.typewriterMaxRatio
  );
  const charsToShow = Math.floor(
    interpolate(frame, [typewriterStart, typewriterEnd], [0, data.quote.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const visibleText = data.quote.slice(0, charsToShow);

  const cursorVisible = charsToShow < data.quote.length && Math.floor(frame / dq.cursorBlinkInterval) % 2 === 0;

  const attrDelay = Math.floor(typewriterEnd + 5);
  const attrProgress = spring({
    frame: frame - attrDelay,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      {/* Decorative quotation mark */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 40,
          fontSize: dq.quoteMarkFontSize,
          fontWeight: 900,
          color: theme.accent,
          opacity: quoteMarkOpacity,
          transform: `scale(${quoteMarkScale})`,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {"\u201C"}
      </div>

      {data.title && (
        <SlideTitle opacity={titleOpacity} translateY={titleY} accent={theme.accent}>
          {data.title}
        </SlideTitle>
      )}

      <div
        style={{
          fontSize: dq.quoteFontSize,
          fontWeight: dq.quoteFontWeight,
          lineHeight: dq.quoteLineHeight,
          fontStyle: "italic",
          textAlign: "center",
          padding: "0 20px",
          marginTop: data.title ? 0 : 40,
          minHeight: 200,
        }}
      >
        {visibleText}
        {cursorVisible && (
          <span style={{ color: theme.accent, fontStyle: "normal" }}>|</span>
        )}
      </div>

      {data.attribution && (
        <div
          style={{
            fontSize: dq.attributionFontSize,
            fontWeight: 400,
            textAlign: "right",
            marginTop: 50,
            opacity: attrProgress,
            color: `${theme.text}99`,
            transform: `translateY(${interpolate(attrProgress, [0, 1], [15, 0])}px)`,
          }}
        >
          {"\u2014"} {data.attribution}
        </div>
      )}
    </SlideBackground>
  );
};
