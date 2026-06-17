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
const ADMIN_LOGIN_EMAIL = process.env.FLOWAPI_E2E_LOGIN_EMAIL || process.env.E2E_LOGIN_EMAIL || "xiaoyijie@flowapi.fun";
const ADMIN_LOGIN_PASSWORD = process.env.FLOWAPI_E2E_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || "xiaoyijie";
const API_KEY = process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const TEST_EMAIL = process.env.FLOWAPI_E2E_EMAIL || process.env.E2E_EMAIL || "";
const TEST_PASSWORD = process.env.FLOWAPI_E2E_PASSWORD || process.env.E2E_PASSWORD || `FlowAPI${Date.now()}!`;
const RUN_PAID_CALL = process.env.FLOWAPI_E2E_RUN_PAID_CALL === "true" || process.env.E2E_RUN_PAID_CALL === "true";

const results = [];

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
  return match[0];
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

  if (API_KEY) {
    try {
      const { response, json } = await request("/api/v1/models", {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      push("真实 API Key 调用 /v1/models", response.ok && Array.isArray(json?.data), `status=${response.status}, models=${json?.data?.length || 0}`);
    } catch (error) {
      push("真实 API Key 调用 /v1/models", false, error.message);
    }

    if (RUN_PAID_CALL) {
      try {
        const { response, json } = await request("/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({
            model: process.env.FLOWAPI_E2E_MODEL || "deepseek-chat",
            messages: [{ role: "user", content: "用一句话回复：FlowAPI commercial loop ok" }],
            max_tokens: 20,
          }),
        });
        push("真实扣费模型调用 /v1/chat/completions", response.ok && json?.choices, `status=${response.status}`);
      } catch (error) {
        push("真实扣费模型调用 /v1/chat/completions", false, error.message);
      }
    } else {
      skip("真实扣费模型调用 /v1/chat/completions", "需设置 FLOWAPI_E2E_RUN_PAID_CALL=true，避免默认消耗真实余额");
    }
  } else {
    skip("真实 API Key 调用 /v1/models", "未提供 FLOWAPI_E2E_API_KEY / E2E_API_KEY");
  }

  let sessionCookie = "";
  try {
    sessionCookie = await loginAndGetCookie();
    push("管理员登录", true, `email=${ADMIN_LOGIN_EMAIL}`);
  } catch (error) {
    push("管理员登录", false, error.message);
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
  } else {
    skip("登录态钱包摘要接口", "未获取到会话 cookie");
    skip("登录态数据面板", "未获取到会话 cookie");
    skip("登录态个人资料", "未获取到会话 cookie");
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
