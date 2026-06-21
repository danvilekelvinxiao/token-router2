import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { logSensitiveEvent, sha256 } = require("../src/logger");

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("hashes authorization headers", () => {
    expect(sha256("Bearer test-key")).toMatch(/^sha256:/);
  });

  it("does not log raw prompt by default", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const req = {
      method: "POST",
      originalUrl: "/v1/chat/completions",
      headers: {
        authorization: "Bearer test-key",
        "x-request-id": "req-1",
      },
      ip: "127.0.0.1",
    };

    const payload = logSensitiveEvent(req, ["测试禁词"], {
      auditLogEnabled: true,
      logRawPrompt: false,
    });

    expect(payload.authorization_hash).toMatch(/^sha256:/);
    expect(JSON.stringify(payload)).not.toContain("测试禁词");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("\"matched_count\":1"));
    expect(spy.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain("Bearer test-key");
    spy.mockRestore();
  });
});
