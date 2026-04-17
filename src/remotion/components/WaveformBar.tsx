import React from "react";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { designConfig } from "../design.config";

interface Props {
  audioPath: string; // relative to publicDir, e.g. "podcast.mp3"
}

export const WaveformBar: React.FC<Props> = ({ audioPath }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { waveform } = designConfig;

  const audioData = useAudioData(staticFile(audioPath));
  if (!audioData) return null;

  const visualization = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: waveform.numberOfSamples,
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: waveform.bottomOffset,
        left: 0,
        right: 0,
        height: waveform.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: waveform.barGap,
        paddingLeft: waveform.padding,
        paddingRight: waveform.padding,
      }}
    >
      {visualization.map((amplitude, i) => {
        const barHeight = Math.max(
          waveform.minBarHeight,
          amplitude * waveform.maxBarHeight
        );
        return (
          <div
            key={i}
            style={{
              width: waveform.barWidth,
              height: barHeight,
              background: waveform.barColor,
              borderRadius: waveform.barWidth / 2,
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
};
