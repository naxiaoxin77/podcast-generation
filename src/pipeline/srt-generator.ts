import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs";
import path from "path";
import type { ArticleScript, SegmentTiming, SubtitleCue } from "./types.js";
import { generateSubtitleCues } from "./subtitle-generator.js";

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

export interface SrtFallbackData {
  introText: string;
  articleScripts: ArticleScript[];
  outroText: string;
}

/**
 * Upload a single MP3 segment to Gemini Files API, transcribe it,
 * and return SubtitleCue[] with global timestamps applied.
 * mimeType MUST be "audio/mpeg" (NOT "audio/mp3").
 * Always deletes the remote file on exit (pass file.name, not fileUri).
 */
export async function transcribeSegment(
  audioPath: string,
  segmentStartTime: number,
  apiKey: string
): Promise<SubtitleCue[]> {
  const fileManager = new GoogleAIFileManager(apiKey);
  const genai = new GoogleGenerativeAI(apiKey);

  const uploadResult = await fileManager.uploadFile(audioPath, {
    mimeType: "audio/mpeg",
    displayName: path.basename(audioPath),
  });
  const fileUri = uploadResult.file.uri;
  const fileName = uploadResult.file.name; // "files/xxxx" — used for deleteFile

  try {
    const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([
      { fileData: { mimeType: "audio/mpeg", fileUri } },
      {
        text: "请将以下音频转录为文字，每句话用时间戳标注，格式：[MM:SS.mmm] 文字内容\n只输出时间戳和文字，不要任何说明。",
      },
    ]);
    const text = result.response.text();
    const cues = parseTranscriptResponse(text);
    return applyOffset(cues, segmentStartTime);
  } finally {
    // Always delete the remote file; pass file.name (not fileUri)
    try {
      await fileManager.deleteFile(fileName);
    } catch {
      // Deletion failure does not affect main flow
    }
  }
}

/**
 * Transcribe all TTS segments and merge into global SubtitleCue[].
 * Per-segment API failure → fall back to character-count estimation.
 * All segments fail API → whole-pipeline fallback.
 * File-not-found segments do NOT count toward API failure statistics.
 */
export async function generateSrtSubtitleCues(
  timings: SegmentTiming[],
  ttsDir: string,
  apiKey: string,
  fallback: SrtFallbackData
): Promise<SubtitleCue[]> {
  const sorted = [...timings].sort((a, b) => a.startTime - b.startTime);
  const allCues: SubtitleCue[] = [];
  let apiFailed = 0;
  let apiAttempted = 0;

  for (const timing of sorted) {
    let segFileName: string;
    if (timing.articleIndex === -1) segFileName = "intro.mp3";
    else if (timing.articleIndex === -2) segFileName = "outro.mp3";
    else segFileName = `article-${String(timing.articleIndex).padStart(2, "0")}.mp3`;

    const segAudioPath = path.join(ttsDir, segFileName);

    if (!fs.existsSync(segAudioPath)) {
      console.warn(`[srt-generator] File not found, falling back: ${segAudioPath}`);
      allCues.push(...getFallbackCuesForSegment(timing, fallback));
      continue;
    }

    apiAttempted++;
    try {
      const cues = await transcribeSegment(segAudioPath, timing.startTime, apiKey);
      if (cues.length === 0) throw new Error("Empty transcription");
      allCues.push(...cues);
    } catch (err) {
      console.warn(`[srt-generator] Transcription failed for ${segFileName}, falling back:`, err);
      apiFailed++;
      allCues.push(...getFallbackCuesForSegment(timing, fallback));
    }
  }

  // If every attempted API call failed, do a full pipeline fallback
  if (apiAttempted > 0 && apiFailed === apiAttempted) {
    console.warn("[srt-generator] All segments failed, using full estimation fallback");
    return generateSubtitleCues(
      fallback.introText,
      fallback.articleScripts,
      fallback.outroText,
      timings
    );
  }

  return allCues.sort((a, b) => a.startTime - b.startTime);
}

/** Select fallback text for a segment by articleIndex and call estimation version */
function getFallbackCuesForSegment(
  timing: SegmentTiming,
  fallback: SrtFallbackData
): SubtitleCue[] {
  if (timing.articleIndex === -1) {
    return generateSubtitleCues(fallback.introText, [], "", [timing]);
  } else if (timing.articleIndex === -2) {
    return generateSubtitleCues("", [], fallback.outroText, [timing]);
  } else {
    const script = fallback.articleScripts.find(
      (s) => s.articleIndex === timing.articleIndex
    );
    if (!script) return [];
    return generateSubtitleCues("", [script], "", [timing]);
  }
}
