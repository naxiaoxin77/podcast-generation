import type { SubtitleCue } from "./types.js";

export interface TranscribedCue {
  relativeTime: number; // seconds relative to segment start
  text: string;
}

/**
 * Parse Gemini transcript response text into TranscribedCue[].
 * Handles [MM:SS.mmm] and [H:MM:SS.mmm] formats.
 * Strips markdown code block wrappers.
 * Returns [] on parse failure (does not throw).
 * Note: requires at least MM:SS.mmm format; bare SS.mmm (no minutes) is not supported.
 */
export function parseTranscriptResponse(text: string): TranscribedCue[] {
  // Strip markdown code block wrappers (```...``` or ```plaintext...```)
  const cleaned = text.replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/, "");

  const pattern = /\[(?:(\d+):)?(\d{2}):(\d{2}\.\d{1,3})\]\s*(.+)/g;
  const cues: TranscribedCue[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    const sentence = match[4].trim();
    if (!sentence) continue;
    cues.push({
      relativeTime: hours * 3600 + minutes * 60 + seconds,
      text: sentence,
    });
  }

  return cues;
}

/**
 * Apply a timing offset to TranscribedCue[], producing SubtitleCue[].
 * endTime of each cue = startTime of next cue.
 * Last cue's endTime = startTime + estimated duration (text.length / 5, min 1s).
 * Times are rounded to 3 decimal places (millisecond precision) to avoid floating-point errors.
 */
export function applyOffset(
  cues: TranscribedCue[],
  segmentStartTime: number
): SubtitleCue[] {
  if (cues.length === 0) return [];

  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  return cues.map((c, i) => {
    const startTime = round3(segmentStartTime + c.relativeTime);
    const nextRelative = cues[i + 1]?.relativeTime;
    const endTime =
      nextRelative !== undefined
        ? round3(segmentStartTime + nextRelative)
        : round3(startTime + Math.max(1, c.text.length / 5));
    return { startTime, endTime, text: c.text };
  });
}
