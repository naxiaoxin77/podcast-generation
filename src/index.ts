import fs from "fs";
import path from "path";
import { loadConfig } from "./utils/config.js";
import { TopviewClient } from "./utils/topview.js";
import { generateAllArticleScripts, generateIntroScript, generateOutroScript } from "./pipeline/script-generator.js";
import { generateAllTTS, generateSingleTTS } from "./pipeline/tts-generator.js";
import { concatAudioFiles } from "./utils/ffmpeg.js";
import { scanKanbanForArticles } from "./workflow/obsidian-scan.js";
import type { NewsArticle, SubtitleCue, OverlayItem } from "./pipeline/types.js";
import { generateSrtSubtitleCues } from "./pipeline/srt-generator.js";
import { resolveOutputName } from "./utils/naming.js";
import { planOverlays } from "./pipeline/overlay-planner.js";
import { renderPodcastVideo } from "./remotion/render.js";
import { publishToObsidian } from "./workflow/podcast-publisher.js";
import type { PodcastCompositionProps } from "./pipeline/types.js";

/** 递归收集目录下所有 .md 文件路径 */
function collectMdFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

/** 从目录读取 markdown 文章（支持子目录） */
function loadArticlesFromDir(dirPath: string): NewsArticle[] {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Input directory not found: ${dirPath}`);
  }
  const files = collectMdFiles(dirPath);
  if (files.length === 0) throw new Error(`No .md files found in: ${dirPath}`);

  return files.map(filePath => {
    let content = fs.readFileSync(filePath, "utf-8");
    content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
    return { title: path.basename(filePath, ".md"), content: content.trim(), sourcePath: filePath };
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const fromKanban = args.includes("--from-kanban");
  const limitIndex = args.indexOf("--limit");
  const keepArtifacts = args.includes("--keep");
  const noVideo = args.includes("--no-video");
  const videoOnly = args.includes("--video-only");

  if (inputIndex === -1 && !fromKanban && !videoOnly) {
    console.error("Usage:");
    console.error("  npx tsx src/index.ts --from-kanban [--limit 5] [--keep]");
    console.error("  npx tsx src/index.ts --input <articles-dir> [--keep]");
    console.error("  npx tsx src/index.ts --video-only");
    process.exit(1);
  }

  // Fast path: --video-only re-renders from existing output files
  if (videoOnly) {
    const config = loadConfig();
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log("\n=== --video-only: 从已有数据重新渲染视频 ===");
    const scriptsData = JSON.parse(fs.readFileSync(path.join(config.outputDir, "scripts.json"), "utf-8"));
    const loadedTimings = JSON.parse(fs.readFileSync(path.join(config.outputDir, "timings.json"), "utf-8"));
    const loadedCues = JSON.parse(fs.readFileSync(path.join(config.outputDir, "subtitle-cues.json"), "utf-8"));
    const loadedOverlays = JSON.parse(fs.readFileSync(path.join(config.outputDir, "overlays.json"), "utf-8"));
    if (!loadedTimings.length) throw new Error("timings.json 为空，无法渲染视频");
    const videoProps: PodcastCompositionProps = {
      audioPath: "podcast.mp3",
      totalDuration: loadedTimings[loadedTimings.length - 1]?.endTime ?? 0,
      subtitleCues: loadedCues,
      overlays: loadedOverlays,
      segmentTimings: loadedTimings,
      podcastTitle: scriptsData.title,
      date: new Date().toISOString().slice(0, 10),
    };
    const videoOutputPath = resolveOutputName(config.outputDir, "mp4");
    await renderPodcastVideo(videoProps, videoOutputPath);
    console.log(`\n完成！视频: ${videoOutputPath}`);
    return;
  }

  const config = loadConfig();
  const topview = new TopviewClient(config.topviewScriptsDir);

  // ── Step 0: Topview board ID ───────────────────────────────────
  console.log("\n=== Step 0: Topview board ID ===");
  const boardId = await topview.getBoardId();
  console.log(`  Board ID: ${boardId}`);

  // ── Step 1: 读取文章 ──────────────────────────────────────────
  console.log("\n=== Step 1: 读取文章 ===");
  let articles: NewsArticle[];
  if (fromKanban) {
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 5;
    console.log(`  从 Obsidian 看板"已发布"列读取最新 ${limit} 篇...`);
    articles = await scanKanbanForArticles({ limit });
  } else {
    articles = loadArticlesFromDir(args[inputIndex + 1]);
  }
  console.log(`  共 ${articles.length} 篇：`);
  articles.forEach((a, i) => console.log(`    ${i + 1}. ${a.title} (${a.content.length} 字)`));

  // ── Step 2: 逐篇生成口播稿 + 开场白 + 结束语 ──────────────────
  console.log("\n=== Step 2: 逐篇生成口播稿 ===");
  const podcastMeta = await generateAllArticleScripts(articles, config.geminiApiKey);

  console.log("\n  生成开场白...");
  const introText = await generateIntroScript(articles, podcastMeta.title, config.geminiApiKey);
  console.log(`    → ${introText.length} 字`);

  console.log("  生成结束语...");
  const outroText = await generateOutroScript(podcastMeta.title, config.geminiApiKey);
  console.log(`    → ${outroText.length} 字`);

  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.outputDir, "scripts.json"),
    JSON.stringify({ ...podcastMeta, intro: introText, outro: outroText }, null, 2),
    "utf-8"
  );
  console.log(`  脚本已保存: output/scripts.json`);

  // ── Step 3: 逐篇 TTS ─────────────────────────────────────────
  console.log("\n=== Step 3: TTS 生成 ===");
  const ttsDir = path.join(config.publicDir, "tts");
  fs.mkdirSync(ttsDir, { recursive: true });

  const ttsOpts = { speed: config.ttsSpeed, emotion: config.ttsEmotion || undefined };

  // 开场白
  const introDuration = await generateSingleTTS(
    introText, "开场白", topview,
    config.podcastVoiceId, boardId,
    path.join(ttsDir, "intro.mp3"), ttsOpts
  );

  // 各篇文章
  const ttsResults = await generateAllTTS(
    podcastMeta.articleScripts,
    topview,
    config.podcastVoiceId,
    boardId,
    ttsDir,
    ttsOpts
  );

  // 结束语
  const outroDuration = await generateSingleTTS(
    outroText, "结束语", topview,
    config.podcastVoiceId, boardId,
    path.join(ttsDir, "outro.mp3"), ttsOpts
  );

  const articlesDuration = ttsResults.reduce((s, r) => s + r.duration, 0);
  const totalDuration = introDuration + articlesDuration + outroDuration;
  console.log(`  TTS 完成，总时长: ${(totalDuration / 60).toFixed(1)} 分钟`);

  // ── Step 4: 拼接音频 ──────────────────────────────────────────
  console.log("\n=== Step 4: 拼接音频 ===");

  // 构建完整时间线（开场白 + 各文章 + 结束语）
  const allTimings = [];
  let currentTime = 0;

  // 开场白
  allTimings.push({ articleIndex: -1, title: "开场白", startTime: currentTime, endTime: currentTime + introDuration });
  currentTime += introDuration;

  // 各文章（按 articleIndex 排序）
  const sortedResults = [...ttsResults].sort((a, b) => a.articleIndex - b.articleIndex);
  for (const result of sortedResults) {
    const script = podcastMeta.articleScripts[result.articleIndex];
    allTimings.push({
      articleIndex: result.articleIndex,
      title: script.title,
      startTime: currentTime,
      endTime: currentTime + result.duration,
    });
    currentTime += result.duration;
  }

  // 结束语
  allTimings.push({ articleIndex: -2, title: "结束语", startTime: currentTime, endTime: currentTime + outroDuration });

  // 拼接顺序：开场白 + 文章 + 结束语
  const audioPaths = [
    path.join(ttsDir, "intro.mp3"),
    ...sortedResults.map(r => r.audioPath),
    path.join(ttsDir, "outro.mp3"),
  ];

  const finalAudioPath = resolveOutputName(config.outputDir, "mp3");
  const audioPath = await concatAudioFiles(audioPaths, finalAudioPath);

  console.log(`  输出: ${audioPath}`);
  console.log(`  时间线:`);
  allTimings.forEach(t =>
    console.log(`    [${formatTime(t.startTime)} - ${formatTime(t.endTime)}] ${t.title}`)
  );
  fs.writeFileSync(
    path.join(config.outputDir, "timings.json"),
    JSON.stringify(allTimings, null, 2),
    "utf-8"
  );
  const timings = allTimings;

  // ── Step 5: 生成字幕时间轴 ──────────────────────────────────────
  let subtitleCues: SubtitleCue[] = [];
  let overlays: OverlayItem[] = [];
  let videoOutputPath = "";

  if (!noVideo) {
    console.log("\n=== Step 5: 生成字幕时间轴 ===");
    subtitleCues = await generateSrtSubtitleCues(
      allTimings,
      ttsDir,
      config.geminiApiKey,
      { introText, articleScripts: podcastMeta.articleScripts, outroText }
    );
    fs.writeFileSync(
      path.join(config.outputDir, "subtitle-cues.json"),
      JSON.stringify(subtitleCues, null, 2),
      "utf-8"
    );
    console.log(`  ${subtitleCues.length} 条字幕`);

    // ── Step 6: 规划叠层卡片 ──────────────────────────────────────
    console.log("\n=== Step 6: 规划叠层卡片 ===");
    overlays = await planOverlays(
      podcastMeta.articleScripts,
      allTimings,
      config.geminiApiKey
    );
    fs.writeFileSync(
      path.join(config.outputDir, "overlays.json"),
      JSON.stringify(overlays, null, 2),
      "utf-8"
    );
    console.log(`  ${overlays.length} 张卡片`);

    // ── Step 7: Remotion 渲染视频 ──────────────────────────────────
    console.log("\n=== Step 7: Remotion 渲染视频 ===");

    // Copy audio to public/ for Remotion staticFile access
    const publicAudioPath = path.join(config.publicDir, "podcast.mp3");
    fs.copyFileSync(audioPath, publicAudioPath);

    videoOutputPath = resolveOutputName(config.outputDir, "mp4");
    const videoProps: PodcastCompositionProps = {
      audioPath: "podcast.mp3",
      totalDuration,
      subtitleCues,
      overlays,
      segmentTimings: allTimings,
      podcastTitle: podcastMeta.title,
      date: new Date().toISOString().slice(0, 10),
    };
    await renderPodcastVideo(videoProps, videoOutputPath);
    console.log(`  视频输出: ${videoOutputPath}`);
  }

  // ── Step 8: 元数据 ────────────────────────────────────────────
  const metadata = [
    `# ${podcastMeta.title}`,
    "",
    "## 内容时间线",
    "",
    ...timings.map(t => `- [${formatTime(t.startTime)}] ${t.title}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(config.outputDir, "metadata.md"), metadata, "utf-8");

  // ── Step 9: 落盘到 Obsidian ─────────────────────────────────────
  if (fromKanban) {
    console.log("\n=== Step 9: 落盘到 Obsidian ===");
    const today = new Date().toISOString().slice(0, 10);
    await publishToObsidian({
      date: today,
      audioPath,
      videoPath: noVideo ? "" : videoOutputPath,
      podcastMeta,
    });
    console.log(`  ✅ 产物已落盘: natebrain/03_Content_Factory/01_Final_Assets/podcast/${today}/`);
  }

  // ── Step 10: 清理 ─────────────────────────────────────────────
  if (keepArtifacts) {
    console.log("\n=== 保留中间文件 (--keep) ===");
  } else {
    if (fs.existsSync(ttsDir)) {
      fs.rmSync(ttsDir, { recursive: true, force: true });
      console.log("\n  清理中间文件完成");
    }
  }

  console.log(`\n完成！播客音频: ${audioPath}`);
  console.log(`时长: ${(totalDuration / 60).toFixed(1)} 分钟，${articles.length} 条新闻`);
}

main().catch(err => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
