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
  limit?: number;   // 最多返回几篇，默认 5
}

export async function scanKanbanForArticles(options: ScanOptions = {}): Promise<NewsArticle[]> {
  const limit = options.limit ?? 5;

  // 1. 读取看板文件
  console.log(`  读取看板: ${KANBAN_VAULT_PATH}`);
  let kanbanContent: string;
  try {
    kanbanContent = readVaultFile(KANBAN_VAULT_PATH);
  } catch (err: any) {
    throw new Error(`无法读取看板文件 ${vaultFullPath(KANBAN_VAULT_PATH)}: ${err.message}`);
  }
  console.log(`  看板文件: ${kanbanContent.length} 字节`);

  // 2. 解析"已发布"列
  const allLinks = parseColumnLinks(kanbanContent, "已发布");
  if (allLinks.length === 0) {
    throw new Error(`已发布列中没有找到任何文章链接（看板字节数: ${kanbanContent.length}）`);
  }
  console.log(`  已发布列共 ${allLinks.length} 篇文章`);

  // 3. 按日期降序排序，取最新 N 篇
  const topLinks = [...allLinks]
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
    } catch (err: any) {
      console.warn(`  ⚠️ 跳过（读取失败）: ${title} — ${err.message}`);
    }
  }

  if (articles.length === 0) {
    throw new Error("未能成功读取任何文章内容");
  }

  return articles;
}
