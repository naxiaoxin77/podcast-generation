/**
 * Obsidian 看板扫描工具
 * 直接从文件系统读取 Vault，不依赖 Obsidian CLI
 */

import fs from "fs";
import path from "path";
import type { NewsArticle } from "../pipeline/types.js";
import { VAULT_BASE, vaultFullPath } from "./vault-config.js";

const KANBAN_VAULT_PATH = "内容生产流水线.md";

// ====== 文件系统工具 ======

function readVaultFile(vaultRelPath: string): string {
  const fullPath = vaultFullPath(vaultRelPath);
  return fs.readFileSync(fullPath, "utf-8");
}

// ====== 看板解析 ======

/**
 * 从看板内容中提取指定列的 wikilink 列表
 * 用 split("## ") 方式，避免 emoji 正则匹配问题
 */
function parseColumnLinks(kanbanContent: string, columnKeyword: string): string[] {
  const sections = kanbanContent.split(/\n## /);
  const targetSection = sections.find(s => s.includes(columnKeyword));
  if (!targetSection) return [];

  const links: string[] = [];
  // 用懒惰匹配 .+? ，避免路径中 [终稿-图文] 的 ] 提前终止
  const linkRegex = /\[\[(.+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(targetSection)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

/** 从路径中提取最早出现的 YYYY-MM-DD 日期 */
function extractDateFromPath(p: string): string {
  const match = p.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "0000-00-00";
}

/** 从文件路径中提取文章标题（去掉 [终稿-图文]- 前缀和 .md 后缀） */
function extractTitle(vaultPath: string): string {
  const fileName = vaultPath.split("/").pop() || "";
  return fileName
    .replace(/^\[终稿-图文\]-/, "")
    .replace(/\.md$/, "")
    .trim();
}

/**
 * 判断路径中的日期是否在过去 N 小时内。
 * 使用截止时刻所在天的零点比较，避免傍晚运行时同天文章被误过滤。
 */
export function isWithinHours(p: string, hours: number): boolean {
  const dateStr = extractDateFromPath(p);
  if (dateStr === "0000-00-00") return false;
  const articleDate = new Date(dateStr + "T00:00:00");  // 本地时间零点

  // cutoffDate：本地时间今天零点，向前推 floor(hours/24) 天
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - Math.floor(hours / 24));

  return articleDate >= cutoffDate;
}

/** 将 wikilink 路径补全（加 .md 后缀；去掉多余的 natebrain/ 前缀，因为 VAULT_BASE 已经指向 natebrain 目录） */
function resolveVaultPath(linkPath: string): string {
  // 兼容旧数据：wikilink 可能含有 "natebrain/" 前缀，去掉即可
  const stripped = linkPath.startsWith("natebrain/")
    ? linkPath.slice("natebrain/".length)
    : linkPath;
  return stripped.endsWith(".md") ? stripped : stripped + ".md";
}

// ====== 主扫描函数 ======

export interface ScanOptions {
  limit?: number;        // 最多返回几篇，默认 5
  withinHours?: number;  // 只取该小时数内的文章，默认 24；传 0 不过滤
}

export async function scanKanbanForArticles(options: ScanOptions = {}): Promise<NewsArticle[]> {
  const limit = options.limit ?? 5;

  // 1. 读取看板文件
  console.log(`  读取看板: ${KANBAN_VAULT_PATH}`);
  let kanbanContent: string;
  try {
    kanbanContent = readVaultFile(KANBAN_VAULT_PATH);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`无法读取看板文件 ${vaultFullPath(KANBAN_VAULT_PATH)}: ${message}`);
  }
  console.log(`  看板文件: ${kanbanContent.length} 字节`);

  // 2. 解析"已发布"列
  const allLinks = parseColumnLinks(kanbanContent, "已发布");
  if (allLinks.length === 0) {
    throw new Error(`已发布列中没有找到任何文章链接（看板字节数: ${kanbanContent.length}）`);
  }
  console.log(`  已发布列共 ${allLinks.length} 篇文章`);

  // 过滤：仅保留过去 withinHours 小时内的文章（默认 24h）
  const hours = options.withinHours ?? 24;
  const filteredLinks = hours > 0
    ? allLinks.filter(link => isWithinHours(link, hours))
    : allLinks;
  if (filteredLinks.length === 0) {
    throw new Error(`过去 ${hours} 小时内没有已发布文章`);
  }
  console.log(`  过去 ${hours}h 内共 ${filteredLinks.length} 篇`);

  // 3. 按日期降序排序，取最新 N 篇
  const topLinks = [...filteredLinks]
    .sort((a, b) => extractDateFromPath(b).localeCompare(extractDateFromPath(a)))
    .slice(0, limit);

  console.log(`  取最新 ${topLinks.length} 篇：`);
  topLinks.forEach((link, i) =>
    console.log(`    ${i + 1}. [${extractDateFromPath(link)}] ${link.split(/[/\\]/).pop()}`)
  );

  // 4. 读取每篇文章内容（直接 fs.readFileSync）
  const articles: NewsArticle[] = [];

  for (const link of topLinks) {
    const vaultPath = resolveVaultPath(link);
    const title = extractTitle(vaultPath);

    try {
      const raw = readVaultFile(vaultPath);
      // 去掉 frontmatter
      const content = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").trim();

      if (content.length < 50) {
        console.warn(`  ⚠️ 跳过（内容过短 ${content.length} 字）: ${title}`);
        continue;
      }

      articles.push({ title, content, sourcePath: vaultPath });
      console.log(`  ✅ ${title} (${content.length} 字)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️ 跳过（读取失败）: ${title} — ${message}`);
    }
  }

  if (articles.length === 0) {
    throw new Error("未能成功读取任何文章内容");
  }

  return articles;
}
