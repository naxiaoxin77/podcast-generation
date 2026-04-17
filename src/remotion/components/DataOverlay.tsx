import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { designConfig } from "../design.config";
import { SlideRenderer } from "./slides/SlideRenderer";
import type { OverlayItem } from "../../pipeline/types";

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
  const { enterDuration, exitDuration, scaleFrom, yFrom } = designConfig.overlay;

  if (localFrame < 0 || localFrame >= totalFrames) return null;

  const safeTotalFrames = Math.max(totalFrames, enterDuration + exitDuration + 1);
  const safeExitStart = safeTotalFrames - exitDuration;

  // 透明度：入场淡入，退场淡出
  const opacity = interpolate(
    localFrame,
    [0, enterDuration, safeExitStart, safeTotalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 缩放：入场从 scaleFrom 放大到 1.0
  const scale = interpolate(
    localFrame,
    [0, enterDuration],
    [scaleFrom, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Y 位移：入场从略低处浮上来
  const translateY = interpolate(
    localFrame,
    [0, enterDuration],
    [yFrom, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const { overlay } = designConfig;

  return (
    <div
      style={{
        position: "absolute",
        // 居中定位
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) scale(${scale}) translateY(${translateY}px)`,
        width: overlay.width,
        opacity,
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
