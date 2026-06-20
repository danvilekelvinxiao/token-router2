import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const { buildApp } = require("../src/index");
const detector = require("../src/detector");

function createWordFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sensitive-proxy-proxy-"));
  const blocklistPath = path.join(dir, "block.txt");
  const allowlistPath = path.join(dir, "allow.txt");
  fs.writeFileSync(blocklistPath, "测试禁词\n");
  fs.writeFileSync(allowlistPath, "安全词\n");
  return { blocklistPath, allowlistPath };
}

function startMockUpstream() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      calls.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, echoed: JSON.parse(body || "{}") }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({
        server,
        calls,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

describe("sensitive proxy", () => {
  beforeEach(() => {
    detector.resetWords();
  });

  it("forwards clean requests to upstream", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: false,
      auditLogEnabled: true,
      logRawPrompt: false,
    });

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Content-Type", "application/json")
      .set("Authorization", "Bearer test-key")
      .send({ model: "gpt-4o-mini", messages: [{ role: "user", content: "你好，请介绍一下人工智能。" }] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(upstream.calls.length).toBe(1);
    expect(upstream.calls[0].body).toContain("人工智能");
    await upstream.close();
  });

  it("forwards FlowAPI /api/v1 paths after normalization", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: false,
      auditLogEnabled: true,
      logRawPrompt: false,
    });

    const res = await request(app)
      .post("/api/v1/chat/completions/")
      .set("Content-Type", "application/json")
      .send({ model: "gpt-4o-mini", messages: [{ role: "user", content: "你好" }] });

    expect(res.status).toBe(200);
    expect(upstream.calls.length).toBe(1);
    expect(upstream.calls[0].url).toBe("/v1/chat/completions");
    await upstream.close();
  });

  it("blocks sensitive requests and does not call upstream", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: false,
      auditLogEnabled: true,
      logRawPrompt: false,
    });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Content-Type", "application/json")
      .set("Authorization", "Bearer test-key")
      .send({ model: "gpt-4o-mini", messages: [{ role: "user", content: "这里包含测试禁词" }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("sensitive_words_detected");
    expect(res.body.error.matched_words).toBeUndefined();
    expect(upstream.calls.length).toBe(0);
    expect(spy).toHaveBeenCalled();
    const logText = spy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logText).not.toContain("这里包含测试禁词");
    spy.mockRestore();
    await upstream.close();
  });

  it("rejects unknown paths instead of forwarding them", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: false,
      auditLogEnabled: true,
      logRawPrompt: false,
    });

    const res = await request(app)
      .get("/v1/unknown")
      .set("Authorization", "Bearer test-key");

    expect(res.status).toBe(404);
    expect(res.body.error.type).toBe("not_found");
    expect(upstream.calls.length).toBe(0);
    await upstream.close();
  });

  it("allows model list paths", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: false,
      auditLogEnabled: true,
      logRawPrompt: false,
    });

    const res = await request(app).get("/v1/models");
    expect(res.status).toBe(200);
    expect(upstream.calls.length).toBe(1);
    expect(upstream.calls[0].url).toBe("/v1/models");
    await upstream.close();
  });

  it("exposes matched words only when enabled", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: true,
      auditLogEnabled: false,
      logRawPrompt: false,
    });

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Content-Type", "application/json")
      .send({ model: "gpt-4o-mini", messages: [{ role: "user", content: "测试禁词" }] });

    expect(res.status).toBe(400);
    expect(res.body.error.matched_words).toEqual(["测试禁词"]);
    await upstream.close();
  });

  it("checks upstream health endpoint", async () => {
    const upstream = await startMockUpstream();
    const { blocklistPath, allowlistPath } = createWordFiles();
    const app = buildApp({
      port: 8787,
      upstreamBaseUrl: upstream.baseUrl,
      upstreamHealthPath: "/health",
      sensitiveFilterEnabled: true,
      useSystemWords: false,
      blocklistPath,
      allowlistPath,
      exposeMatchedWords: false,
      auditLogEnabled: false,
      logRawPrompt: false,
    });

    const res = await request(app).get("/__upstream_health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    await upstream.close();
  });
});
