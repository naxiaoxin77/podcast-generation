import fs from "fs";
import path from "path";

/**
 * 返回当日首个可用的输出文件路径。
 * 格式：laona-digest-YYYY-MM-DD.{ext}
 * 已存在则递增后缀：laona-digest-YYYY-MM-DD-2.ext, -3.ext ...
 * mp3 和 mp4 分别独立计数。
 *
 * 注：调用方必须保证 outputDir 目录已存在。
 */
export function resolveOutputName(outputDir: string, ext: "mp3" | "mp4"): string {
  const MAX_SUFFIX = 9999;
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const base = `laona-digest-${today}`;

  const candidate = path.join(outputDir, `${base}.${ext}`);
  if (!fs.existsSync(candidate)) return candidate;

  let n = 2;
  while (n <= MAX_SUFFIX) {
    const next = path.join(outputDir, `${base}-${n}.${ext}`);
    if (!fs.existsSync(next)) return next;
    n++;
  }
  throw new Error(`resolveOutputName: exceeded ${MAX_SUFFIX} files for ${base}.${ext}`);
}
