import React from "react";
import { Composition, registerRoot } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { PodcastVideo } from "./PodcastVideo.js";
import type { PodcastCompositionProps } from "../pipeline/types.js";
import { designConfig } from "./design.config.js";

type RemotionProps = PodcastCompositionProps & Record<string, unknown>;

const calculateMetadata: CalculateMetadataFunction<RemotionProps> = async ({ props }) => ({
  durationInFrames: Math.ceil((props.totalDuration || 10) * designConfig.video.fps),
  fps: designConfig.video.fps,
  width: designConfig.video.width,
  height: designConfig.video.height,
});

const defaultProps: RemotionProps = {
  audioPath: "podcast.mp3",
  totalDuration: 60,
  subtitleCues: [],
  overlays: [],
  segmentTimings: [],
  podcastTitle: "每日商业快报",
  date: new Date().toISOString().slice(0, 10),
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="PodcastVideo"
    component={PodcastVideo as React.ComponentType<RemotionProps>}
    durationInFrames={1}
    fps={designConfig.video.fps}
    width={designConfig.video.width}
    height={designConfig.video.height}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
  />
);

registerRoot(RemotionRoot);
