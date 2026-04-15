import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { BigNumberSlide as BigNumberSlideData } from "../../../pipeline/types";
import { SlideBackground, SlideTitle, resolveTheme } from "./SlideBackground";
import { designConfig } from "../../design.config";

const dc = designConfig;
const ds = dc.slide;
const dn = dc.bigNumber;

export const BigNumberSlide: React.FC<{
  data: BigNumberSlideData;
  durationInFrames: number;
}> = ({ data, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = resolveTheme(data.theme);

  const titleOpacity = interpolate(frame, [0, ds.titleEnterDuration], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, ds.titleEnterDuration], [ds.titleEnterOffset, 0], { extrapolateRight: "clamp" });

  const countEnd = Math.floor(durationInFrames * dn.countDurationRatio);
  const countProgress = interpolate(frame, [10, countEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - countProgress, 3);
  const displayNumber = Math.round(eased * data.number);

  const unitOpacity = interpolate(frame, [countEnd, countEnd + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtitleProgress = spring({
    frame: frame - countEnd - 5,
    fps,
    config: dn.spring,
  });

  const scale = frame < countEnd
    ? 1
    : interpolate(frame, [countEnd, countEnd + 8, countEnd + 16], [1, dn.pulseScale, 1], {
        extrapolateRight: "clamp",
      });

  return (
    <SlideBackground theme={data.theme} durationInFrames={durationInFrames}>
      <SlideTitle opacity={titleOpacity} translateY={titleY} accent={theme.accent}>
        {data.title}
      </SlideTitle>

      <div style={{ textAlign: "center", marginTop: 40 }}>
        <div
          style={{
            fontSize: dn.numberFontSize,
            fontWeight: dn.numberFontWeight,
            color: theme.accent,
            transform: `scale(${scale})`,
            lineHeight: 1.1,
          }}
        >
          {displayNumber}
          <span style={{ fontSize: dn.unitFontSize, opacity: unitOpacity }}>{data.unit || ""}</span>
        </div>

        <div
          style={{
            fontSize: dn.subtitleFontSize,
            fontWeight: 400,
            marginTop: dn.subtitleMarginTop,
            opacity: subtitleProgress,
            transform: `translateY(${interpolate(subtitleProgress, [0, 1], [20, 0])}px)`,
            color: `${theme.text}cc`,
          }}
        >
          {data.subtitle}
        </div>
      </div>
    </SlideBackground>
  );
};
