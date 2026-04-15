import React from "react";
import type { SlideData } from "../../../pipeline/types";
import { BulletListSlide } from "./BulletListSlide";
import { BigNumberSlide } from "./BigNumberSlide";
import { ComparisonSlide } from "./ComparisonSlide";
import { QuoteSlide } from "./QuoteSlide";
import { TimelineSlide } from "./TimelineSlide";

export const SlideRenderer: React.FC<{
  slideData: SlideData;
  durationInFrames: number;
  /** When true, renders with transparent background so the BrollOverlay card backdrop shows through */
  overlayMode?: boolean;
}> = ({ slideData, durationInFrames, overlayMode }) => {
  // In overlay mode, override background to transparent
  const data: SlideData = overlayMode
    ? { ...slideData, theme: { ...slideData.theme, background: "transparent" } }
    : slideData;

  switch (data.layout) {
    case "bullet-list":
      return <BulletListSlide data={data} durationInFrames={durationInFrames} />;
    case "big-number":
      return <BigNumberSlide data={data} durationInFrames={durationInFrames} />;
    case "comparison":
      return <ComparisonSlide data={data} durationInFrames={durationInFrames} />;
    case "quote":
      return <QuoteSlide data={data} durationInFrames={durationInFrames} />;
    case "timeline":
      return <TimelineSlide data={data} durationInFrames={durationInFrames} />;
    default:
      return null;
  }
};
