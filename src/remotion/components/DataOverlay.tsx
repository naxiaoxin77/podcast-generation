import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config.js";
import { SlideRenderer } from "./slides/SlideRenderer.js";
import type { OverlayItem } from "../../pipeline/types.js";

interface Props {
  overlays: OverlayItem[];
}

const SingleOverlay: React.FC<{ item: OverlayItem; startFrame: number; endFrame: number }> = ({
  item,
  startFrame,
  endFrame,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  const totalFrames = endFrame - startFrame;
  const { enterDuration, exitDuration, slideDistance } = designConfig.overlay;

  if (localFrame < 0 || localFrame >= totalFrames) return null;

  // Guard against too-short overlays where enter + exit > total
  const safeTotalFrames = Math.max(totalFrames, enterDuration + exitDuration + 1);
  const safeExitStart = safeTotalFrames - exitDuration;

  const opacity = interpolate(
    localFrame,
    [0, enterDuration, safeExitStart, safeTotalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const translateX = interpolate(
    localFrame,
    [0, enterDuration],
    [slideDistance, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const { overlay } = designConfig;

  return (
    <div
      style={{
        position: "absolute",
        right: overlay.rightOffset,
        top: overlay.topOffset,
        width: overlay.width,
        opacity,
        transform: `translateX(${translateX}px)`,
        backgroundColor: overlay.bgColor,
        border: `1px solid ${overlay.borderColor}`,
        borderRadius: overlay.borderRadius,
        overflow: "hidden",
      }}
    >
      <SlideRenderer
        slideData={{ ...item.slideData, theme: designConfig.slideTheme }}
        durationInFrames={totalFrames}
        overlayMode
      />
    </div>
  );
};

export const DataOverlay: React.FC<Props> = ({ overlays }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {overlays.map((item, i) => (
        <SingleOverlay
          key={i}
          item={item}
          startFrame={Math.round(item.startTime * fps)}
          endFrame={Math.round(item.endTime * fps)}
        />
      ))}
    </AbsoluteFill>
  );
};
