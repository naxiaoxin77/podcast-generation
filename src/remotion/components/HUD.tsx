import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config";
import { fontFamily } from "../fonts";

interface Props {
  podcastTitle: string;
  date: string;
  totalDuration: number;  // seconds
}

export const HUD: React.FC<Props> = ({ podcastTitle, date, totalDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = totalDuration > 0 ? frame / (totalDuration * fps) : 0;
  const { hud } = designConfig;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Top-left logo */}
      <div
        style={{
          position: "absolute",
          top: hud.topOffset,
          left: hud.leftOffset,
          fontFamily,
          fontSize: hud.fontSize,
          color: hud.color,
          letterSpacing: "0.05em",
          opacity: 0.85,
        }}
      >
        {podcastTitle} · {date}
      </div>

      {/* Bottom progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: hud.progressHeight,
          backgroundColor: "rgba(200, 164, 110, 0.15)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, progress * 100)}%`,
            backgroundColor: hud.progressColor,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
