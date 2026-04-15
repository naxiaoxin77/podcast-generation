import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { TimelineSlide as TimelineSlideData } from "../../../pipeline/types";
import { SlideBackground, SlideTitle, resolveTheme } from "./SlideBackground";
import { designConfig } from "../../design.config";

const dc = designConfig;
const ds = dc.slide;
const dt = dc.timeline;

export const TimelineSlide: React.FC<{
  data: TimelineSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = resolveTheme(data.theme);

  const titleOpacity = interpolate(frame, [0, ds.titleEnterDuration], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, ds.titleEnterDuration], [ds.titleEnterOffset, 0], { extrapolateRight: "clamp" });

  const nodeCount = data.nodes.length;
  const staggerDelay = Math.min(dt.maxStaggerDelay, Math.floor((durationInFrames * 0.6) / Math.max(nodeCount, 1)));

  const lineEnd = ds.titleEnterDuration + nodeCount * staggerDelay;
  const lineProgress = interpolate(frame, [ds.titleEnterDuration, lineEnd], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      <SlideTitle opacity={titleOpacity} translateY={titleY} accent={theme.accent}>
        {data.title}
      </SlideTitle>

      <div style={{ position: "relative", paddingLeft: dt.paddingLeft }}>
        {/* Vertical timeline line */}
        <div
          style={{
            position: "absolute",
            left: dt.dotSize / 2 + (dt.paddingLeft - dt.dotSize) / 2 - dt.paddingLeft + 18,
            top: 0,
            width: 4,
            height: `${lineProgress}%`,
            background: `linear-gradient(to bottom, ${theme.accent}, ${theme.accent}44)`,
            borderRadius: 2,
          }}
        />

        {data.nodes.map((node, i) => {
          const delay = ds.titleEnterDuration + i * staggerDelay;
          const progress = spring({ frame: frame - delay, fps, config: dt.spring });
          const opacity = interpolate(progress, [0, 1], [0, 1]);
          const translateX = interpolate(progress, [0, 1], [-30, 0]);
          const circleFill = interpolate(progress, [0, 0.5, 1], [0, 0.5, 1]);

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 24,
                marginBottom: dt.nodeMarginBottom,
                opacity,
                transform: `translateX(${translateX}px)`,
                position: "relative",
              }}
            >
              {/* Timeline dot */}
              <div
                style={{
                  position: "absolute",
                  left: -dt.paddingLeft + 6,
                  top: 8,
                  width: dt.dotSize,
                  height: dt.dotSize,
                  borderRadius: "50%",
                  border: `${dt.dotBorderWidth}px solid ${theme.accent}`,
                  backgroundColor: circleFill > 0.5 ? theme.accent : "transparent",
                  flexShrink: 0,
                  boxShadow: dt.dotGlow && circleFill > 0.5 ? `0 0 12px ${theme.accent}88` : "none",
                }}
              />

              <div>
                <div style={{ fontSize: dt.labelFontSize, fontWeight: dt.labelFontWeight, lineHeight: 1.4 }}>
                  {node.label}
                </div>
                {node.description && (
                  <div
                    style={{
                      fontSize: dt.descriptionFontSize,
                      fontWeight: 400,
                      color: `${theme.text}aa`,
                      marginTop: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {node.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SlideBackground>
  );
};
