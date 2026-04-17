import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import type { PodcastCompositionProps } from "../pipeline/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function renderPodcastVideo(
  props: PodcastCompositionProps,
  outputPath: string
): Promise<string> {
  console.log("  Bundling Remotion project...");
  const bundled = await bundle({
    entryPoint: path.resolve(__dirname, "Root.tsx"),
    webpackOverride: (config) => config,
  });

  try {
    console.log("  Selecting composition...");
    const remotionProps = props as unknown as Record<string, unknown>;
    const composition = await selectComposition({
      serveUrl: bundled,
      id: "PodcastVideo",
      inputProps: remotionProps,
    });

    console.log(`  Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps...`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: remotionProps,
    });

    console.log(`  Video saved: ${outputPath}`);
    return outputPath;
  } finally {
    // Clean up bundle temp directory
    try {
      fs.rmSync(bundled, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
