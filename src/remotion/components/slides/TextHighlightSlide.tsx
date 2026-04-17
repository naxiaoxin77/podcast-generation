import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import type { TextHighlightSlide as TextHighlightSlideData } from "../../../pipeline/types";
import { SlideBackground, resolveTheme } from "./SlideBackground";
import { fontFamily } from "../../fonts";

export const TextHighlightSlide: React.FC<{
  data: TextHighlightSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const theme = resolveTheme(data.theme);

  const progress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.96, 1]);

  const exitProgress = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 60px",
          opacity: opacity * exitProgress,
          transform: `scale(${scale})`,
          fontFamily,
        }}
      >
        {/* Left accent bar */}
        <div
          style={{
            width: 60,
            height: 4,
            backgroundColor: theme.accent,
            borderRadius: 2,
            marginBottom: 40,
            opacity: progress,
          }}
        />

        {/* Main text */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: theme.text,
            lineHeight: 1.4,
            maxWidth: 1100,
          }}
        >
          {data.text}
        </div>

        {/* Subtext */}
        {data.subtext && (
          <div
            style={{
              fontSize: 36,
              fontWeight: 400,
              color: `${theme.text}80`,
              marginTop: 32,
              lineHeight: 1.5,
              maxWidth: 900,
            }}
          >
            {data.subtext}
          </div>
        )}
      </div>
    </SlideBackground>
  );
};
