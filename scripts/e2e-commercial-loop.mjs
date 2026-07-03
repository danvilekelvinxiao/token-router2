#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, ".env.production"));

const BASE_URL = (process.env.FLOWAPI_E2E_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const ADMIN_SECRET = process.env.FLOWAPI_ADMIN_SECRET || process.env.ADMIN_SECRET || process.env.E2E_ADMIN_SECRET || "";
const ADMIN_LOGIN_EMAIL = process.env.FLOWAPI_E2E_LOGIN_EMAIL || process.env.E2E_LOGIN_EMAIL || "849481756@qq.com";
const ADMIN_LOGIN_PASSWORD = process.env.FLOWAPI_E2E_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || "xiaoyijie";
const API_KEY = process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const E2E_MODEL = process.env.FLOWAPI_E2E_MODEL || process.env.E2E_MODEL || "gpt-5.5";
const E2E_KEY_MODEL = process.env.FLOWAPI_E2E_KEY_MODEL || process.env.E2E_KEY_MODEL || getKeyModelForRequest(E2E_MODEL);
const E2E_TEAM_ID = process.env.FLOWAPI_E2E_TEAM_ID || process.env.E2E_TEAM_ID || "team_sub2api_e2e";
const E2E_TEAM_NAME = process.env.FLOWAPI_E2E_TEAM_NAME || process.env.E2E_TEAM_NAME || "sub2api 号池验证";
const E2E_TEAM_CODE = process.env.FLOWAPI_E2E_TEAM_CODE || process.env.E2E_TEAM_CODE || "sub2api-e2e";
const E2E_TEAM_TOKEN_ID = process.env.FLOWAPI_E2E_TEAM_TOKEN_ID || process.env.E2E_TEAM_TOKEN_ID || "token_sub2api_e2e";
const E2E_TEAM_TOKEN_NAME = process.env.FLOWAPI_E2E_TEAM_TOKEN_NAME || process.env.E2E_TEAM_TOKEN_NAME || "sub2api 号池主卡";
const E2E_TEAM_TOKEN_BASE_URL = (process.env.FLOWAPI_E2E_TEAM_TOKEN_BASE_URL || process.env.E2E_TEAM_TOKEN_BASE_URL || process.env.SUB2API_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const E2E_TEAM_TOKEN_API_KEY = process.env.FLOWAPI_E2E_TEAM_TOKEN_API_KEY || process.env.E2E_TEAM_TOKEN_API_KEY || process.env.SUB2API_API_KEY || process.env.SUB2API_API_KEY_SECONDARY || "";
const E2E_TEAM_TOKEN_API_PATH = process.env.FLOWAPI_E2E_TEAM_TOKEN_API_PATH || process.env.E2E_TEAM_TOKEN_API_PATH || "/v1/chat/completions";
const E2E_TEAM_TOKEN_ALLOWED_MODELS = (process.env.FLOWAPI_E2E_TEAM_TOKEN_ALLOWED_MODELS || process.env.E2E_TEAM_TOKEN_ALLOWED_MODELS || E2E_MODEL).split(",").map((item) => item.trim()).filter(Boolean);
const E2E_SETUP_TEAM_POOL = process.env.FLOWAPI_E2E_SETUP_TEAM_POOL === "true" || process.env.E2E_SETUP_TEAM_POOL === "true";
const TEST_EMAIL = process.env.FLOWAPI_E2E_EMAIL || process.env.E2E_EMAIL || "";
const TEST_PASSWORD = process.env.FLOWAPI_E2E_PASSWORD || process.env.E2E_PASSWORD || `FlowAPI${Date.now()}!`;
const RUN_PAID_CALL = process.env.FLOWAPI_E2E_RUN_PAID_CALL === "true" || process.env.E2E_RUN_PAID_CALL === "true";

const results = [];
let paidCallRequestId = "";
let paidCallSucceeded = false;
let paidApiKey = API_KEY;

function getKeyModelForRequest(modelId = "") {
  const value = String(modelId || "").trim().toLowerCase();
  if (value === "gpt-5.5" || value === "flowapi-gpt55" || value === "gpt55" || value === "gpt5.5") return "flowapi-gpt55";
  if (value === "gpt-5.4-pro" || value === "flowapi-gpt54-pro" || value === "gpt54-pro" || value === "gpt5.4-pro") return "flowapi-gpt54-pro";
  if (value === "gpt-5.4" || value === "gpt-5.4-mini" || value === "flowapi-gpt54" || value === "gpt54" || value === "gpt5.4-mini") return "flowapi-gpt54";
  if (value.includes("codex")) return "flowapi-codex-plus";
  if (value.includes("deepseek")) return "deepseek-chat";
  if (value.includes("gemini")) return "flowapi-gemini-flash";
  if (value.includes("claude")) return "flowapi-claude-sonnet";
  return value || "flowapi-gpt55";
}

function push(name, passed, detail = "", meta = {}) {
  const status = meta.status || (passed ? "pass" : "fail");
  results.push({ name, passed, status, detail, ...meta });
  const mark = status === "skip" ? "SKIP" : passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function skip(name, detail) {
  push(name, false, detail, { status: "skip" });
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
  return { response, json, text };
}

async function loginAndGetCookie() {
  const { response, json, text } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: ADMIN_LOGIN_EMAIL,
      password: ADMIN_LOGIN_PASSWORD,
    }),
  });
  if (!response.ok || !json?.customer?.sessionToken) {
    throw new Error(`status=${response.status} ${json?.error || text.slice(0, 160)}`);
  }
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/flowapi_session=[^;]+/);
  if (!match) throw new Error("session cookie missing");
  return { cookie: match[0], customerId: json?.customer?.id || "", customer: json?.customer || null };
}

async function createApiKeyForE2E({ cookie, customerId, modelId }) {
  const { response, json, text } = await request("/api/keys", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      customerId,
      modelId,
      label: `E2E ${modelId} ${Date.now()}`,
    }),
  });
  if (!response.ok || !json?.createdKey?.token) {
    throw new Error(`create_key_status=${response.status} ${json?.error?.message || json?.error || text.slice(0, 160)}`);
  }
  return json.createdKey;
}

async function createTeamForE2E({ cookie }) {
  const { response, json, text } = await request("/api/admin/teams", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      id: E2E_TEAM_ID,
      name: E2E_TEAM_NAME,
      code: E2E_TEAM_CODE,
      description: "自动化验收创建的 sub2api 号池团队",
      status: "active",
    }),
  });
  if (!response.ok || !json?.team?.id) {
    throw new Error(`team_status=${response.status} ${json?.error || text.slice(0, 160)}`);
  }
  return json.team;
}

async function createTeamTokenPoolForE2E({ cookie, teamId }) {
  const { response, json, text } = await request("/api/admin/token-pool", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      id: E2E_TEAM_TOKEN_ID,
      name: E2E_TEAM_TOKEN_NAME,
      tokenType: "自定义 OpenAI Compatible",
      modelType: "chat",
      provider: "sub2api",
      teamId,
      quotaTotal: 999999,
      quotaRemaining: 999999,
      usageScope: "all",
      allowedTeamIds: teamId,
      allowedModels: E2E_TEAM_TOKEN_ALLOWED_MODELS.join(","),
      allowedPurposes: "模型测试,代码生成,对话",
      environmentScope: "all",
      notes: "E2E 自动创建的 sub2api 号池 token",
      status: "normal",
      priority: 10,
      weight: 10,
      enabled: true,
      baseUrl: E2E_TEAM_TOKEN_BASE_URL,
      apiPath: E2E_TEAM_TOKEN_API_PATH,
      secret: E2E_TEAM_TOKEN_API_KEY,
    }),
  });
  if (!response.ok || !json?.token?.id) {
    throw new Error(`token_pool_status=${response.status} ${json?.error || text.slice(0, 160)}`);
  }
  return json.token;
}

async function main() {
  console.log(`FlowAPI commercial loop E2E: ${BASE_URL}`);

  try {
    const { response, json } = await request("/api/health", { method: "GET" });
    push("健康检查 /api/health", response.ok && json?.ok, `status=${response.status}`);
  } catch (error) {
    push("健康检查 /api/health", false, error.message);
  }

  try {
    const { response } = await request("/api/v1/models", {
      method: "GET",
      headers: { Authorization: "Bearer sk-invalid-commercial-loop-test" },
    });
    push("未知 API Key 返回 401", response.status === 401, `status=${response.status}`);
  } catch (error) {
    push("未知 API Key 返回 401", false, error.message);
  }

  for (const [name, path] of [
    ["模型广场后台同步接口", "/api/models/market"],
    ["API Key 可选模型接口", "/api/models/api-key-options"],
    ["图片模型接口", "/api/models/image-options"],
  ]) {
    try {
      const { response, json } = await request(path);
      const count = json?.models?.length || json?.data?.length || 0;
      push(name, response.ok && count >= 0, `status=${response.status}, count=${count}`);
    } catch (error) {
      push(name, false, error.message);
    }
  }

  if (ADMIN_SECRET) {
    try {
      const { response, json } = await request("/api/admin/commercial-health", {
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      push("管理员商业闭环看板接口", response.ok && json?.success, `score=${json?.score ?? "-"}, status=${response.status}`);
    } catch (error) {
      push("管理员商业闭环看板接口", false, error.message);
    }
  } else {
    skip("管理员商业闭环看板接口", "未提供 FLOWAPI_ADMIN_SECRET / ADMIN_SECRET / E2E_ADMIN_SECRET");
  }

  if (TEST_EMAIL) {
    try {
      const { response, json } = await request("/api/auth/send-code", {
        method: "POST",
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          purpose: "register",
          acceptedTerms: true,
          acceptedPrivacy: true,
          deviceId: `e2e_${Date.now()}`,
        }),
      });
      const registerMessage = json?.error || json?.message || "";
      if (!response.ok && String(registerMessage).includes("已注册")) {
        skip("注册验证码发送接口", "测试邮箱已注册；验证码发送链路此前已验证，可换新邮箱复测");
      } else {
        push("注册验证码发送接口", Boolean(response.ok && json?.verifyToken), response.ok ? "已返回 verifyToken；真实收件箱需人工确认" : (registerMessage || `status=${response.status}`));
      }
      if (response.ok && json?.devCode) {
        const verify = await request("/api/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            code: json.devCode,
            verifyToken: json.verifyToken,
            acceptedTerms: true,
            acceptedPrivacy: true,
          }),
        });
        push("注册验证码自动验证", Boolean(verify.response.ok && verify.json?.customer), `status=${verify.response.status}`);
      } else {
        skip("注册验证码自动验证", "生产真发不会返回 devCode，需要人工读取邮箱验证码");
      }
    } catch (error) {
      push("注册验证码发送接口", false, error.message);
    }
  } else {
    skip("注册验证码发送接口", "未提供 FLOWAPI_E2E_EMAIL / E2E_EMAIL");
  }

  let sessionCookie = "";
  let sessionCustomerId = "";
  let e2eTeam = null;
  try {
    const login = await loginAndGetCookie();
    sessionCookie = login.cookie;
    sessionCustomerId = login.customerId;
    push("管理员登录", true, `email=${ADMIN_LOGIN_EMAIL}`);
  } catch (error) {
    push("管理员登录", false, error.message);
  }

  if (E2E_SETUP_TEAM_POOL && sessionCookie) {
    try {
      e2eTeam = await createTeamForE2E({ cookie: sessionCookie });
      push("团队创建", true, `teamId=${e2eTeam.id}`);
    } catch (error) {
      push("团队创建", false, error.message);
    }

    if (e2eTeam) {
      try {
        const tokenPool = await createTeamTokenPoolForE2E({ cookie: sessionCookie, teamId: e2eTeam.id });
        push("团队号池创建", true, `tokenPoolId=${tokenPool.id}, baseUrl=${tokenPool.baseUrl}`);
      } catch (error) {
        push("团队号池创建", false, error.message);
      }
    }
  } else if (E2E_SETUP_TEAM_POOL) {
    skip("团队创建", "未获取到会话 cookie");
    skip("团队号池创建", "未获取到会话 cookie");
  }

  if (!paidApiKey && sessionCookie && sessionCustomerId) {
    try {
      const createdKey = await createApiKeyForE2E({
        cookie: sessionCookie,
        customerId: sessionCustomerId,
        modelId: E2E_KEY_MODEL,
        teamId: e2eTeam?.id || "",
      });
      paidApiKey = createdKey.token;
      push("E2E API Key 创建", true, `model=${E2E_KEY_MODEL}, keyId=${createdKey.id}${e2eTeam?.id ? `, teamId=${e2eTeam.id}` : ""}`);
    } catch (error) {
      push("E2E API Key 创建", false, error.message);
    }
  } else if (!paidApiKey) {
    skip("E2E API Key 创建", "未拿到登录态，无法自动创建 Key");
  }

  if (paidApiKey) {
    try {
      const { response, json } = await request("/api/v1/models", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
      });
      push("真实 API Key 调用 /v1/models", response.ok && Array.isArray(json?.data), `status=${response.status}, models=${json?.data?.length || 0}`);
    } catch (error) {
      push("真实 API Key 调用 /v1/models", false, error.message);
    }

    if (RUN_PAID_CALL) {
      try {
        const { response, json, text } = await request("/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${paidApiKey}` },
          body: JSON.stringify({
            model: E2E_MODEL,
            messages: [{ role: "user", content: "用一句话回复：FlowAPI commercial loop ok" }],
            max_tokens: 20,
          }),
        });
        paidCallRequestId = json?.token_router?.request_id || json?.request_id || "";
        paidCallSucceeded = Boolean(response.ok && json?.choices);
        push("真实扣费模型调用 /v1/chat/completions", paidCallSucceeded, response.ok ? `status=${response.status}${paidCallRequestId ? `, request_id=${paidCallRequestId}` : ""}` : `status=${response.status}, body=${String(text || "").slice(0, 240)}${paidCallRequestId ? `, request_id=${paidCallRequestId}` : ""}`);
        if (!paidCallRequestId) {
          skip("消费流水落库验证", "响应未返回 request_id");
          skip("使用日志落库验证", "响应未返回 request_id");
        } else {
          // Defer record checks until after login, where we have a stable session cookie.
        }
      } catch (error) {
        push("真实扣费模型调用 /v1/chat/completions", false, error.message);
      }
    } else {
      skip("真实扣费模型调用 /v1/chat/completions", "需设置 FLOWAPI_E2E_RUN_PAID_CALL=true，避免默认消耗真实余额");
    }
  } else {
    skip("真实 API Key 调用 /v1/models", "未提供 FLOWAPI_E2E_API_KEY / E2E_API_KEY");
  }

  if (sessionCookie) {
    const authHeaders = { Cookie: sessionCookie };
    for (const [name, path, expected] of [
      ["登录态钱包摘要接口", "/api/user/wallet-summary", "wallet"],
      ["登录态数据面板", "/dashboard", "AI Token 资产总览"],
      ["登录态个人资料", "/profile", "client-rendered"],
    ]) {
      try {
        const { response, text, json } = await request(path, { method: "GET", headers: authHeaders });
        const ok = response.ok && (expected === "wallet" ? Boolean(json?.wallet || json?.walletProgress) : true);
        push(name, ok, `status=${response.status}${expected === "client-rendered" ? ", client-rendered" : ""}`);
      } catch (error) {
        push(name, false, error.message);
      }
    }

    if (RUN_PAID_CALL && paidCallRequestId) {
      try {
        const wallet = await request("/api/user/wallet-summary", {
          headers: authHeaders,
        });
        const recent = Array.isArray(wallet.json?.recentConsumptions) ? wallet.json.recentConsumptions : [];
        const matched = recent.find((item) => String(item.requestId || "").trim() === paidCallRequestId || String(item.id || "").trim() === paidCallRequestId);
        push(
          "消费流水落库验证",
          Boolean(wallet.response.ok && matched && Number(matched.cost || matched.sellPriceCny || matched.userCharge || 0) > 0),
          matched ? `status=${wallet.response.status}, cost=${matched.cost || matched.sellPriceCny || matched.userCharge || 0}, routeAttempts=${matched.routeAttempts || 0}` : `status=${wallet.response.status}, 未找到 request_id=${paidCallRequestId}`,
        );
      } catch (error) {
        push("消费流水落库验证", false, error.message);
      }

      try {
        const logs = await request("/api/usage-logs?limit=20", {
          headers: authHeaders,
        });
        const items = Array.isArray(logs.json?.items) ? logs.json.items : [];
        const matched = items.find((item) => String(item.requestId || "").trim() === paidCallRequestId || String(item.id || "").trim() === paidCallRequestId);
        push(
          "使用日志落库验证",
          Boolean(logs.response.ok && matched && Number(matched.moneyCost || matched.cost || 0) > 0),
          matched ? `status=${logs.response.status}, moneyCost=${matched.moneyCost || matched.cost || 0}` : `status=${logs.response.status}, 未找到 request_id=${paidCallRequestId}`,
        );
      } catch (error) {
        push("使用日志落库验证", false, error.message);
      }

      try {
        const routeProbe = await request(`/api/admin/routes?publicModelId=${encodeURIComponent(E2E_MODEL)}`, {
          headers: { "x-admin-secret": ADMIN_SECRET, Cookie: sessionCookie },
        });
        const failures = Array.isArray(routeProbe.json?.failures) ? routeProbe.json.failures : [];
        const matchedFailures = failures.filter((item) => String(item.requestId || "").trim() === paidCallRequestId);
        push(
          "路由尝试落库验证",
          Boolean(routeProbe.response.ok && matchedFailures.length > 0),
          matchedFailures.length ? `status=${routeProbe.response.status}, attempts=${matchedFailures.length}` : `status=${routeProbe.response.status}, 未找到 request_id=${paidCallRequestId}`,
        );
      } catch (error) {
        push("路由尝试落库验证", false, error.message);
      }

      if (e2eTeam?.id) {
        try {
          const teamLogs = await request(`/api/admin/team-usage-logs?teamId=${encodeURIComponent(e2eTeam.id)}&limit=20`, {
            headers: { Cookie: sessionCookie },
          });
          const items = Array.isArray(teamLogs.json?.logs) ? teamLogs.json.logs : [];
          const matched = items.find((item) => String(item.requestId || "").trim() === paidCallRequestId);
          push(
            "团队流水落库验证",
            Boolean(teamLogs.response.ok && matched && Number(matched.actualCostCny || 0) > 0 && Number(matched.totalTokens || 0) > 0),
            matched ? `status=${teamLogs.response.status}, actualCostCny=${matched.actualCostCny || 0}, tokenId=${matched.tokenId || "-"}` : `status=${teamLogs.response.status}, 未找到 request_id=${paidCallRequestId}`,
          );
        } catch (error) {
          push("团队流水落库验证", false, error.message);
        }

        try {
          const keyUsage = await request(`/api/flowapi/keys/${encodeURIComponent(paidApiKey)}/usage`, {
            headers: { Cookie: sessionCookie },
          });
          push("API Key 使用记录接口", Boolean(keyUsage.response.ok), `status=${keyUsage.response.status}`);
        } catch (error) {
          push("API Key 使用记录接口", false, error.message);
        }
      }
    } else if (RUN_PAID_CALL) {
      skip("消费流水落库验证", "未拿到付费调用 request_id");
      skip("使用日志落库验证", "未拿到付费调用 request_id");
      skip("路由尝试落库验证", "未拿到付费调用 request_id");
      if (e2eTeam?.id) {
        skip("团队流水落库验证", "未拿到付费调用 request_id");
        skip("API Key 使用记录接口", "未拿到付费调用 request_id");
      }
    }
  } else {
    skip("登录态钱包摘要接口", "未获取到会话 cookie");
    skip("登录态数据面板", "未获取到会话 cookie");
    skip("登录态个人资料", "未获取到会话 cookie");
    skip("路由尝试落库验证", "未获取到会话 cookie");
  }

  const passed = results.filter((item) => item.passed).length;
  const skipped = results.filter((item) => item.status === "skip").length;
  const failed = results.filter((item) => item.status === "fail").length;
  console.log(JSON.stringify({ baseUrl: BASE_URL, passed, failed, skipped, results }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
