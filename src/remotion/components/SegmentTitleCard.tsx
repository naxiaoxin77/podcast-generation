import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";

interface Props {
  articleNumber: number;  // 1-based display number
  title: string;
  startFrame: number;     // frame when this card should appear
}

export const SegmentTitleCard: React.FC<Props> = ({ articleNumber, title, startFrame }) => {
  const frame = useCurrentFrame();
  const { fadeDuration, holdDuration, totalDuration } = designConfig.titleCard;

  const localFrame = frame - startFrame;
  if (localFrame < 0 || localFrame >= totalDuration) return null;

  const opacity = interpolate(
    localFrame,
    [0, fadeDuration, fadeDuration + holdDuration, totalDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: designConfig.titleCard.bgColor,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily,
      }}
    >
      <div
        style={{
          fontSize: designConfig.titleCard.numberFontSize,
          color: designConfig.titleCard.numberColor,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        第 {articleNumber} 条
      </div>
      <div
        style={{
          fontSize: designConfig.titleCard.titleFontSize,
          fontWeight: designConfig.titleCard.titleFontWeight,
          color: designConfig.titleCard.titleColor,
          maxWidth: "80%",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
