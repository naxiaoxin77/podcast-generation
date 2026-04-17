import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config";
import { fontFamily } from "../fonts";
import type { SubtitleCue } from "../../pipeline/types";

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
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: subtitle.bottomOffset,
          left: 0,
          right: 0,
          backgroundColor: subtitle.backgroundColor,
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
