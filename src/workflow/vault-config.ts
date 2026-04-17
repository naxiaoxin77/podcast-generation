/**
 * Obsidian Vault 共享配置
 * 用正斜杠，避免 \b \n \O 等被解释为转义字符
 */
export const VAULT_BASE = "E:/natebrain";

/** 拼接 vault 相对路径为绝对路径 */
export function vaultFullPath(relPath: string): string {
  return VAULT_BASE + "/" + relPath;
}
