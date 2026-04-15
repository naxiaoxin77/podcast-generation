import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { fontFamily } from "../fonts.js";
import type { SubtitleCue } from "../../pipeline/types.js";

interface Props {
  cues: SubtitleCue[];
}

export const SubtitleBar: React.FC<Props> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const activeCue = cues.find(
    c => currentTime >= c.startTime && currentTime < c.endTime
  );

  if (!activeCue) return null;

  const { subtitle } = designConfig;

  return (
    <AbsoluteFill
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          position: "absolute",
          bottom: subtitle.bottomOffset,
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: subtitle.maxWidth,
          width: "90%",
          backgroundColor: subtitle.backgroundColor,
          borderRadius: subtitle.borderRadius,
          padding: subtitle.padding,
          textAlign: "center",
          fontFamily,
          fontSize: subtitle.fontSize,
          fontWeight: subtitle.fontWeight,
          color: subtitle.color,
          lineHeight: subtitle.lineHeight,
        }}
      >
        {activeCue.text}
      </div>
    </AbsoluteFill>
  );
};
