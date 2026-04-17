import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { StatRowSlide as StatRowSlideData } from "../../../pipeline/types";
import { SlideBackground, resolveTheme } from "./SlideBackground";
import { fontFamily } from "../../fonts";

export const StatRowSlide: React.FC<{
  data: StatRowSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = resolveTheme(data.theme);

  // Title fade in
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 15], [-16, 0], { extrapolateRight: "clamp" });

  const stats = data.stats;
  const colCount = stats.length;

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      {/* Optional title */}
      {data.title && (
        <div
          style={{
            fontFamily,
            fontSize: 36,
            fontWeight: 600,
            color: `${theme.text}99`,
            textAlign: "center",
            marginBottom: 48,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {data.title}
        </div>
      )}

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "flex-start",
          gap: 24,
          padding: "0 40px",
        }}
      >
        {stats.map((stat, i) => {
          const delay = 8 + i * 10;
          const progress = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 110 } });
          const opacity = interpolate(progress, [0, 1], [0, 1]);
          const translateY = interpolate(progress, [0, 1], [30, 0]);

          // Trend color
          const trendColor =
            stat.trendUp === true
              ? "#4caf82"    // green
              : stat.trendUp === false
              ? "#e05050"    // red
              : `${theme.text}80`;  // neutral muted

          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                opacity,
                transform: `translateY(${translateY}px)`,
                // Divider between columns
                borderLeft: i > 0 ? `1px solid ${theme.accent}33` : "none",
                padding: "0 32px",
                fontFamily,
              }}
            >
              {/* Label */}
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: `${theme.text}80`,
                  marginBottom: 16,
                  lineHeight: 1.3,
                }}
              >
                {stat.label}
              </div>

              {/* Main value */}
              <div
                style={{
                  fontSize: colCount <= 2 ? 110 : 80,
                  fontWeight: 900,
                  color: theme.accent,
                  lineHeight: 1.05,
                  letterSpacing: "-2px",
                }}
              >
                {stat.value}
                {stat.unit && (
                  <span style={{ fontSize: colCount <= 2 ? 56 : 44, fontWeight: 700, marginLeft: 8 }}>
                    {stat.unit}
                  </span>
                )}
              </div>

              {/* Trend */}
              {stat.trend && (
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: trendColor,
                    marginTop: 16,
                  }}
                >
                  {stat.trend}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SlideBackground>
  );
};
