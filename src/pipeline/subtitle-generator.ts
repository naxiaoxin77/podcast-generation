import type { ArticleScript, SegmentTiming, SubtitleCue } from "./types.js";

/** Split Chinese text into sentences by punctuation. */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation (。！？), keep delimiter with previous segment
  const sentences = text.split(/(?<=[。！？])/).map(s => s.trim()).filter(s => s.length > 0);
  return sentences.length > 0 ? sentences : [text.trim()];
}

/**
 * Generate subtitle cues from script text and segment timings.
 * Time is allocated proportionally by character count within each segment.
 */
export function generateSubtitleCues(
  introText: string,
  articleScripts: ArticleScript[],
  outroText: string,
  timings: SegmentTiming[]
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Sort timings by startTime
  const sorted = [...timings].sort((a, b) => a.startTime - b.startTime);

  for (const timing of sorted) {
    let text: string;
    if (timing.articleIndex === -1) {
      text = introText;
    } else if (timing.articleIndex === -2) {
      text = outroText;
    } else {
      const script = articleScripts.find(s => s.articleIndex === timing.articleIndex);
      if (!script) continue;
      text = script.text;
    }

    const sentences = splitSentences(text);
    const segDuration = timing.endTime - timing.startTime;
    // Count only non-punctuation characters for proportional allocation
    const countChars = (s: string) => s.replace(/[。！？，、：；""'']/g, "").length || 1;
    const totalChars = sentences.reduce((sum, s) => sum + countChars(s), 0);

    let cursor = timing.startTime;
    for (const sentence of sentences) {
      const duration = totalChars > 0
        ? segDuration * (countChars(sentence) / totalChars)
        : segDuration / sentences.length;
      cues.push({
        startTime: cursor,
        endTime: cursor + duration,
        text: sentence,
      });
      cursor += duration;
    }
  }

  return cues;
}
