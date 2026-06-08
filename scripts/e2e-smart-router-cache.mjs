#!/usr/bin/env node

const BASE_URL = (process.env.FLOWAPI_E2E_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const API_KEY = process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const ADMIN_SECRET = process.env.FLOWAPI_ADMIN_SECRET || process.env.ADMIN_SECRET || process.env.E2E_ADMIN_SECRET || "";
const RUN_PAID = process.env.FLOWAPI_E2E_RUN_PAID_CALL === "true" || process.env.E2E_RUN_PAID_CALL === "true";
const MODEL = process.env.FLOWAPI_E2E_MODEL || "deepseek-chat";

const results = [];

function push(name, passed, detail = "", status = passed ? "pass" : "fail") {
  results.push({ name, passed, detail, status });
  const mark = status === "skip" ? "SKIP" : passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function skip(name, detail) {
  push(name, false, detail, "skip");
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { response, text, json };
}

async function testModelsCache() {
  if (!API_KEY) return skip("/v1/models 缓存命中", "未提供 FLOWAPI_E2E_API_KEY");
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const first = await request("/api/v1/models", { headers });
  const second = await request("/api/v1/models", { headers });
  const firstCache = first.response.headers.get("x-flowapi-cache") || "";
  const secondCache = second.response.headers.get("x-flowapi-cache") || "";
  push("/v1/models 首次可用", first.response.ok && Array.isArray(first.json?.data), `status=${first.response.status}, cache=${firstCache}`);
  push("/v1/models 二次命中缓存", second.response.ok && secondCache === "HIT", `status=${second.response.status}, cache=${secondCache}`);
}

async function testStreamFirstToken() {
  if (!API_KEY) return skip("stream=true 首字测试", "未提供 FLOWAPI_E2E_API_KEY");
  if (!RUN_PAID) return skip("stream=true 首字测试", "需设置 FLOWAPI_E2E_RUN_PAID_CALL=true 才消耗真实余额测试");
  const start = Date.now();
  const response = await fetch(`${BASE_URL}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "x-request-id": `smart_router_stream_${Date.now()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [{ role: "user", content: "用中文输出一句话：FlowAPI stream ok" }],
      max_tokens: 24,
    }),
  });
  const reader = response.body?.getReader();
  if (!reader) return push("stream=true 首字测试", false, `status=${response.status}, no body`);
  const first = await reader.read();
  const firstTokenMs = Date.now() - start;
  try { await reader.cancel(); } catch {}
  push("stream=true 首字测试", response.ok && !first.done, `status=${response.status}, first_chunk_ms=${firstTokenMs}, buffering=${response.headers.get("x-accel-buffering") || "-"}`);
}

async function testAdminRoutes() {
  if (!ADMIN_SECRET) return skip("/api/admin/routes", "未提供 FLOWAPI_ADMIN_SECRET / ADMIN_SECRET");
  const { response, json } = await request("/api/admin/routes", {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  push("/api/admin/routes 路由矩阵", response.ok && Array.isArray(json?.routes), `status=${response.status}, routes=${json?.routes?.length || 0}`);
  push("/api/admin/routes 性能监控", response.ok && json?.performance && typeof json.performance.cacheHitRate === "number", `cacheHitRate=${json?.performance?.cacheHitRate ?? "-"}`);
}

async function main() {
  console.log(`FlowAPI smart-router/cache E2E: ${BASE_URL}`);
  const health = await request("/api/health");
  push("/api/health", health.response.ok && health.json?.ok, `status=${health.response.status}`);

  const invalid = await request("/api/v1/models", {
    headers: { Authorization: "Bearer sk-invalid-smart-router-cache" },
  });
  push("未知 API Key 返回 401", invalid.response.status === 401, `status=${invalid.response.status}`);

  await testModelsCache();
  await testAdminRoutes();
  await testStreamFirstToken();

  const passed = results.filter((item) => item.passed).length;
  const failed = results.filter((item) => item.status === "fail").length;
  const skipped = results.filter((item) => item.status === "skip").length;
  console.log(JSON.stringify({ baseUrl: BASE_URL, passed, failed, skipped, results }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
