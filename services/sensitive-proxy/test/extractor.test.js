import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { extractSensitiveText } = require("../src/extractor");

describe("extractSensitiveText", () => {
  it("extracts chat messages string content", () => {
    const result = extractSensitiveText({
      messages: [{ role: "user", content: "你好" }],
    });
    expect(result.text).toContain("你好");
    expect(result.segments).toEqual([{ path: "messages[0].content", text: "你好" }]);
  });

  it("extracts text from multimodal content array and ignores image urls", () => {
    const result = extractSensitiveText({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "敏感测试" },
          { type: "image_url", image_url: { url: "https://example.com/a.png" } },
        ],
      }],
    });
    expect(result.text).toContain("敏感测试");
    expect(result.text).not.toContain("example.com");
  });

  it("extracts input and prompt", () => {
    const result = extractSensitiveText({
      input: [{ role: "user", content: [{ type: "input_text", text: "输入文本" }] }],
      prompt: "提示词",
    });
    expect(result.text).toContain("输入文本");
    expect(result.text).toContain("提示词");
  });
});
