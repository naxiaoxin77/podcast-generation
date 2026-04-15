import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import type { SlideColorTheme } from "../../../pipeline/types";
import { fontFamily } from "../../fonts";
import { designConfig } from "../../design.config";

const dc = designConfig;

export function resolveTheme(theme?: SlideColorTheme): Required<SlideColorTheme> {
  return {
    background: theme?.background || dc.theme.background,
    accent: theme?.accent || dc.theme.accent,
    text: theme?.text || dc.theme.text,
  };
}

export const SlideBackground: React.FC<{
  theme?: SlideColorTheme;
  durationInFrames?: number;
  children: React.ReactNode;
}> = ({ theme, durationInFrames = 300, children }) => {
  const t = resolveTheme(theme);
  const frame = useCurrentFrame();
  const fx = dc.effects;

  // ── 镜头缓推 ──────────────────────────────────────
  const scale = fx.cameraPush.enabled
    ? interpolate(frame, [0, durationInFrames], [fx.cameraPush.scaleFrom, fx.cameraPush.scaleTo], {
        extrapolateRight: "clamp",
      })
    : 1;

  // ── 光效扫过 ──────────────────────────────────────
  const sweepStart = fx.lightSweep.startFrame;
  const sweepEnd = sweepStart + fx.lightSweep.duration;
  // translateX: 从屏幕左侧外 → 右侧外
  const sweepX = interpolate(frame, [sweepStart, sweepEnd], [-300, 1400], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sweepOpacity = interpolate(
    frame,
    [sweepStart, sweepStart + fx.lightSweep.duration * 0.3, sweepEnd - fx.lightSweep.duration * 0.3, sweepEnd],
    [0, fx.lightSweep.opacity, fx.lightSweep.opacity, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const showSweep = fx.lightSweep.enabled && frame >= sweepStart && frame <= sweepEnd;

  return (
    <AbsoluteFill
      style={{
        background: t.background,
        fontFamily,
        color: t.text,
        overflow: "hidden",
      }}
    >
      {/* 缓推层：包裹内容并缓慢放大 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: dc.slide.padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>

      {/* 光效扫过层 */}
      {showSweep && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-10%",
              bottom: "-10%",
              width: fx.lightSweep.width,
              background: `linear-gradient(to right, transparent, rgba(255,255,255,${sweepOpacity}), transparent)`,
              transform: `translateX(${sweepX}px) skewX(-${fx.lightSweep.angle}deg)`,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

export const SlideTitle: React.FC<{
  children: React.ReactNode;
  opacity: number;
  translateY: number;
  accent?: string;
}> = ({ children, opacity, translateY, accent }) => (
  <div
    style={{
      fontSize: dc.slide.title.fontSize,
      fontWeight: dc.slide.title.fontWeight,
      marginBottom: dc.slide.title.marginBottom,
      opacity,
      transform: `translateY(${translateY}px)`,
      color: accent || dc.theme.accent,
      lineHeight: dc.slide.title.lineHeight,
    }}
  >
    {children}
  </div>
);
