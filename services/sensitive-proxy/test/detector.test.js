import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const detector = require("../src/detector");

function createWordFiles() {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sensitive-proxy-"));
  const blocklistPath = path.join(dir, "block.txt");
  const allowlistPath = path.join(dir, "allow.txt");
  fs.writeFileSync(blocklistPath, ["测试禁词", "# comment", "示例敏感词1", "示例敏感词1"].join("\n"));
  fs.writeFileSync(allowlistPath, ["安全词"].join("\n"));
  return { blocklistPath, allowlistPath };
}

describe("detector", () => {
  beforeEach(() => {
    detector.resetWords();
  });

  it("normalizes NFKC and zero width chars", () => {
    expect(detector.normalizeText("ＡＢＣ\u200b")).toBe("abc");
  });

  it("blocks sensitive text", () => {
    const { blocklistPath, allowlistPath } = createWordFiles();
    detector.loadWords({ blocklistPath, allowlistPath, useSystemWords: false });
    expect(detector.checkSensitiveText("这里包含测试禁词").blocked).toBe(true);
  });

  it("does not block clean text", () => {
    const { blocklistPath, allowlistPath } = createWordFiles();
    detector.loadWords({ blocklistPath, allowlistPath, useSystemWords: false });
    expect(detector.checkSensitiveText("这是正常内容").blocked).toBe(false);
  });

  it("keeps allowlist words from triggering", () => {
    const { blocklistPath, allowlistPath } = createWordFiles();
    detector.loadWords({ blocklistPath, allowlistPath, useSystemWords: false });
    expect(detector.checkSensitiveText("这是安全词").blocked).toBe(false);
  });

  it("deduplicates matches", () => {
    const { blocklistPath, allowlistPath } = createWordFiles();
    detector.loadWords({ blocklistPath, allowlistPath, useSystemWords: false });
    const result = detector.checkSensitiveText("测试禁词和测试禁词");
    expect(result.blocked).toBe(true);
    expect(result.matchedWords).toEqual(["测试禁词"]);
  });
});
