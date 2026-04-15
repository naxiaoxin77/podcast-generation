import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { BulletListSlide as BulletListSlideData } from "../../../pipeline/types";
import { SlideBackground, SlideTitle, resolveTheme } from "./SlideBackground";
import { designConfig } from "../../design.config";

const dc = designConfig;
const ds = dc.slide;
const db = dc.bulletList;

export const BulletListSlide: React.FC<{
  data: BulletListSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = resolveTheme(data.theme);

  const titleOpacity = interpolate(frame, [0, ds.titleEnterDuration], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, ds.titleEnterDuration], [ds.titleEnterOffset, 0], { extrapolateRight: "clamp" });

  const staggerDelay = Math.min(db.maxStaggerDelay, Math.floor((durationInFrames * 0.6) / Math.max(data.items.length, 1)));

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      <SlideTitle opacity={titleOpacity} translateY={titleY} accent={theme.accent}>
        {data.title}
      </SlideTitle>

      <div style={{ display: "flex", flexDirection: "column", gap: db.itemGap }}>
        {data.items.map((item, i) => {
          const delay = ds.titleEnterDuration + i * staggerDelay;
          const progress = spring({ frame: frame - delay, fps, config: db.spring });
          const opacity = interpolate(progress, [0, 1], [0, 1]);
          const translateX = interpolate(progress, [0, 1], [-60, 0]);

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                opacity,
                transform: `translateX(${translateX}px)`,
              }}
            >
              <div
                style={{
                  width: db.iconSize,
                  height: db.iconSize,
                  borderRadius: db.iconBorderRadius,
                  backgroundColor: `${theme.accent}22`,
                  border: `2px solid ${theme.accent}66`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: db.iconFontSize,
                  flexShrink: 0,
                }}
              >
                {item.icon || "·"}
              </div>
              <div style={{ fontSize: db.textFontSize, fontWeight: db.textFontWeight, lineHeight: 1.4 }}>
                {item.text}
              </div>
            </div>
          );
        })}
      </div>
    </SlideBackground>
  );
};
