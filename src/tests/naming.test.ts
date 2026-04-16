import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveOutputName } from "../utils/naming.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "naming-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveOutputName", () => {
  it("首次生成 mp3 时返回不带后缀的路径", () => {
    const result = resolveOutputName(tmpDir, "mp3");
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(path.join(tmpDir, `laona-digest-${today}.mp3`));
  });

  it("已有同日 mp3 时递增为 -2", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}.mp3`), "");
    const result = resolveOutputName(tmpDir, "mp3");
    expect(result).toBe(path.join(tmpDir, `laona-digest-${today}-2.mp3`));
  });

  it("已有 base 和 -2 时递增为 -3", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}.mp3`), "");
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}-2.mp3`), "");
    const result = resolveOutputName(tmpDir, "mp3");
    expect(result).toBe(path.join(tmpDir, `laona-digest-${today}-3.mp3`));
  });

  it("mp3 和 mp4 计数互不影响", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `laona-digest-${today}.mp3`), "");
    const mp4Result = resolveOutputName(tmpDir, "mp4");
    expect(mp4Result).toBe(path.join(tmpDir, `laona-digest-${today}.mp4`));
  });
});
