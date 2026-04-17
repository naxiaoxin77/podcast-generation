import React from "react";
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { PodcastBackground } from "./components/PodcastBackground";
import { SegmentTitleCard } from "./components/SegmentTitleCard";
import { DataOverlay } from "./components/DataOverlay";
import { SubtitleBar } from "./components/SubtitleBar";
import { HUD } from "./components/HUD";
import { WaveformBar } from "./components/WaveformBar";
import type { PodcastCompositionProps } from "../pipeline/types";

export const PodcastVideo: React.FC<PodcastCompositionProps> = ({
  audioPath,
  totalDuration,
  subtitleCues,
  overlays,
  segmentTimings,
  podcastTitle,
  date,
}) => {
  const { fps } = useVideoConfig();

  // Only show title cards for articles (articleIndex >= 0)
  const articleTimings = segmentTimings.filter(t => t.articleIndex >= 0);

  return (
    <AbsoluteFill>
      {/* Layer 1: Background */}
      <PodcastBackground />

      {/* Layer 2: Audio */}
      <Audio src={staticFile(audioPath)} />

      {/* Layer 3: Article title cards */}
      {articleTimings.map((timing) => (
        <SegmentTitleCard
          key={timing.articleIndex}
          articleNumber={timing.articleIndex + 1}
          title={timing.title}
          startFrame={Math.round(timing.startTime * fps)}
        />
      ))}

      {/* Layer 4: Data overlays */}
      <DataOverlay overlays={overlays} />

      {/* Layer 4.5: Waveform */}
      <WaveformBar audioPath={audioPath} />

      {/* Layer 5: Subtitles */}
      <SubtitleBar cues={subtitleCues} />

      {/* Layer 6: HUD */}
      <HUD podcastTitle={podcastTitle} date={date} totalDuration={totalDuration} />
    </AbsoluteFill>
  );
};
