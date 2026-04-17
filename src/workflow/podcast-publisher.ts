import fs, { promises as fsp } from "fs";
import path from "path";
import type { PodcastMeta } from "../pipeline/types.js";
import { VAULT_BASE, vaultFullPath } from "./vault-config.js";

// ====== 内部工具 ======

/**
 * 提取文本前 maxSentences 句（按句末标点 。！？ 分割）。
 * 若无可识别句子则返回原文（trim 后）。
 */
function extractSummary(text: string, maxSentences = 2): string {
  if (!text.trim()) return "";
  const sentences = text
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return text.trim();
  return sentences.slice(0, maxSentences).join("");
}

// ====== 公开接口 ======

export interface PublishOptions {
  date: string;       // "YYYY-MM-DD"
  audioPath: string;  // 绝对路径，如 .../output/laona-digest-YYYY-MM-DD.mp3
  videoPath: string;  // 绝对路径；空字符串表示跳过 MP4 复制
  podcastMeta: PodcastMeta;
}

/**
 * 生成 shownote.md 内容（纯函数，供单元测试）。
 * 格式：节目标题 + 每篇文章加粗标题 + 口播稿前 2 句摘要。
 */
export function generateShownote(podcastMeta: PodcastMeta, date: string): string {
  const lines: string[] = [
    `# ${podcastMeta.title}`,
    "",
    "## 本期内容",
    "",
  ];

  for (const script of podcastMeta.articleScripts) {
    const summary = extractSummary(script.text, 2);
    lines.push(`**${script.title}**`);
    lines.push(summary);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * 将播客产物复制到 Obsidian vault 指定目录。
 * 目录：VAULT_BASE/03_Content_Factory/01_Final_Assets/podcast/YYYY-MM-DD/
 * videoPath 为空字符串时跳过 MP4 复制。
 */
export async function publishToObsidian(options: PublishOptions): Promise<void> {
  const { date, audioPath, videoPath, podcastMeta } = options;

  const destDir = vaultFullPath(path.join("03_Content_Factory/01_Final_Assets/podcast", date));
  await fsp.mkdir(destDir, { recursive: true });

  // 验证源文件存在
  if (!fs.existsSync(audioPath)) {
    throw new Error(`publishToObsidian: 音频文件不存在: ${audioPath}`);
  }
  if (videoPath && !fs.existsSync(videoPath)) {
    throw new Error(`publishToObsidian: 视频文件不存在: ${videoPath}`);
  }

  // 复制 MP3
  await fsp.copyFile(audioPath, destDir + "/" + path.basename(audioPath));

  // 复制 MP4（可选）
  if (videoPath) {
    await fsp.copyFile(videoPath, destDir + "/" + path.basename(videoPath));
  }

  // 写入 shownote.md（覆盖）
  const shownote = generateShownote(podcastMeta, date);
  await fsp.writeFile(destDir + "/shownote.md", shownote, "utf-8");
}
