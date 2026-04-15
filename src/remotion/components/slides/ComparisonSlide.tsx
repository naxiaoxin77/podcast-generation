import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { ComparisonSlide as ComparisonSlideData } from "../../../pipeline/types";
import { SlideBackground, SlideTitle, resolveTheme } from "./SlideBackground";
import { designConfig } from "../../design.config";

const dc = designConfig;
const ds = dc.slide;
const dcmp = dc.comparison;

export const ComparisonSlide: React.FC<{
  data: ComparisonSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = resolveTheme(data.theme);

  const titleOpacity = interpolate(frame, [0, ds.titleEnterDuration], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, ds.titleEnterDuration], [ds.titleEnterOffset, 0], { extrapolateRight: "clamp" });

  const leftProgress = spring({ frame: frame - ds.titleEnterDuration, fps, config: dcmp.spring });
  const leftX = interpolate(leftProgress, [0, 1], [-80, 0]);

  const rightProgress = spring({ frame: frame - ds.titleEnterDuration - 7, fps, config: dcmp.spring });
  const rightX = interpolate(rightProgress, [0, 1], [80, 0]);

  const dividerHeight = interpolate(frame, [20, 40], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const maxItems = Math.max(data.left.items.length, data.right.items.length);
  const itemStagger = Math.min(dcmp.maxItemStagger, Math.floor((durationInFrames * 0.4) / Math.max(maxItems, 1)));

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      <SlideTitle opacity={titleOpacity} translateY={titleY} accent={theme.accent}>
        {data.title}
      </SlideTitle>

      <div style={{ display: "flex", gap: 20, flex: 1, alignItems: "flex-start" }}>
        {/* Left column */}
        <div style={{ flex: 1, opacity: leftProgress, transform: `translateX(${leftX}px)` }}>
          <div
            style={{
              fontSize: dcmp.labelFontSize,
              fontWeight: dcmp.labelFontWeight,
              color: dcmp.leftColor,
              marginBottom: 30,
              textAlign: "center",
            }}
          >
            {data.left.label}
          </div>
          {data.left.items.map((item, i) => {
            const delay = 30 + i * itemStagger;
            const itemOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  fontSize: dcmp.itemFontSize,
                  padding: "12px 0",
                  opacity: itemOpacity,
                  borderBottom: `1px solid ${theme.text}22`,
                  lineHeight: 1.5,
                }}
              >
                {item}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div
          style={{
            width: dcmp.dividerWidth,
            background: `linear-gradient(to bottom, ${theme.accent}, transparent)`,
            height: `${dividerHeight}%`,
            alignSelf: "stretch",
            borderRadius: 2,
          }}
        />

        {/* Right column */}
        <div style={{ flex: 1, opacity: rightProgress, transform: `translateX(${rightX}px)` }}>
          <div
            style={{
              fontSize: dcmp.labelFontSize,
              fontWeight: dcmp.labelFontWeight,
              color: dcmp.rightColor,
              marginBottom: 30,
              textAlign: "center",
            }}
          >
            {data.right.label}
          </div>
          {data.right.items.map((item, i) => {
            const delay = 35 + i * itemStagger;
            const itemOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  fontSize: dcmp.itemFontSize,
                  padding: "12px 0",
                  opacity: itemOpacity,
                  borderBottom: `1px solid ${theme.text}22`,
                  lineHeight: 1.5,
                }}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>
    </SlideBackground>
  );
};
