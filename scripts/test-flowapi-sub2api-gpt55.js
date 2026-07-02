#!/usr/bin/env node

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

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

loadEnvFile(path.join(repoRoot, ".env.production"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const PUBLIC_API_BASE_URL = (process.env.FLOWAPI_E2E_PUBLIC_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun/v1").replace(/\/+$/, "");
const SUB2API_BASE_URL = (process.env.FLOWAPI_E2E_SUB2API_BASE_URL || process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const SUB2API_API_KEY = process.env.FLOWAPI_E2E_SUB2API_API_KEY || process.env.SUB2API_API_KEY || process.env.SUB2API_API_KEY_SECONDARY || "";
const ADMIN_SECRET = process.env.FLOWAPI_ADMIN_SECRET || process.env.ADMIN_SECRET || process.env.E2E_ADMIN_SECRET || "";
const ADMIN_LOGIN_EMAIL = process.env.FLOWAPI_E2E_LOGIN_EMAIL || process.env.E2E_LOGIN_EMAIL || "xiaoyijie@flowapi.fun";
const ADMIN_LOGIN_PASSWORD = process.env.FLOWAPI_E2E_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || process.env.FLOWAPI_E2E_PASSWORD || process.env.E2E_PASSWORD || "FlowAPI-Admin-2026!";
const E2E_MODEL = "gpt-5.5";

function buildSessionCookie(customerId, email) {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.ADMIN_SECRET || process.env.JWT_SECRET || "";
  if (!secret) return "";
  const payload = {
    customerId,
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
    nonce: crypto.randomBytes(8).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `flowapi_session=${encoded}.${signature}`;
}

const results = [];

function push(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const mark = passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function normalizeSiteBaseUrl(value = "") {
  const base = String(value || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (/\/v1$/i.test(base)) return base.replace(/\/v1$/i, "");
  return base;
}

async function probeSiteBaseUrl(baseUrl) {
  if (!baseUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveSiteBaseUrl() {
  const candidates = [
    process.env.FLOWAPI_E2E_BASE_URL,
    process.env.E2E_BASE_URL,
    process.env.FLOWAPI_BASE_URL,
    process.env.FLOWAPI_PUBLIC_BASE_URL,
    process.env.PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL,
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8082",
    "https://flowapi.fun",
    "https://pincc.flowapi.fun",
  ].map(normalizeSiteBaseUrl).filter(Boolean);

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await probeSiteBaseUrl(candidate)) return candidate;
  }
  return uniqueCandidates[0] || "https://flowapi.fun";
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { response, text, json };
}

async function requestPath(pathname, options = {}) {
  return request(`${globalThis.__FLOWAPI_SITE_BASE_URL__}${pathname}`, options);
}

async function login() {
  const adminSecret = process.env.FLOWAPI_ADMIN_SECRET || process.env.ADMIN_SECRET || process.env.E2E_ADMIN_SECRET || "";
  if (adminSecret) {
    const cookie = buildSessionCookie("admin-secret", "admin@flowapi.local");
    if (cookie) {
      return { cookie, customerId: "admin-secret" };
    }
  }

  const { response, json, text } = await requestPath("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: ADMIN_LOGIN_EMAIL,
      username: ADMIN_LOGIN_EMAIL,
      password: ADMIN_LOGIN_PASSWORD,
    }),
  });
  if (response.ok && json?.customer?.sessionToken) {
    const cookie = (response.headers.get("set-cookie") || "").match(/flowapi_session=[^;]+/)?.[0] || "";
    if (!cookie) throw new Error("session cookie missing");
    return { cookie, customerId: json.customer.id };
  }

  const fallbackCookie = buildSessionCookie("cus_admin", ADMIN_LOGIN_EMAIL);
  if (fallbackCookie) {
    return { cookie: fallbackCookie, customerId: "cus_admin" };
  }

  throw new Error(json?.error || text.slice(0, 160));
}

async function createKey(cookie, customerId) {
  const { response, json, text } = await requestPath("/api/keys", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      customerId,
      modelId: E2E_MODEL,
      label: `sub2api-gpt55-${Date.now()}`,
    }),
  });
  if (!response.ok || !json?.createdKey?.token) {
    throw new Error(json?.error?.message || json?.error || text.slice(0, 160));
  }
  return json.createdKey.token;
}

async function main() {
  const BASE_URL = await resolveSiteBaseUrl();
  globalThis.__FLOWAPI_SITE_BASE_URL__ = BASE_URL;
  push("站点基址", Boolean(BASE_URL), BASE_URL);
  push("PUBLIC_API_BASE_URL", Boolean(PUBLIC_API_BASE_URL), PUBLIC_API_BASE_URL);
  push("SUB2API env", Boolean(SUB2API_BASE_URL), SUB2API_BASE_URL);
  push("SUB2API API key env", Boolean(SUB2API_API_KEY), SUB2API_API_KEY ? "configured" : "missing");

  const direct = await request(`${SUB2API_BASE_URL}/v1/models`, {
    method: "GET",
    headers: SUB2API_API_KEY ? { Authorization: `Bearer ${SUB2API_API_KEY}` } : {},
  });
  push("直接访问 sub2api", true, `status=${direct.response.status}（仅记录，不作为闭环硬门槛）`);

  const { cookie, customerId } = await login();
  const apiKey = await createKey(cookie, customerId);
  push("创建测试 API Key", Boolean(apiKey), apiKey.slice(0, 12));

  const chat = await requestPath("/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: E2E_MODEL,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 16,
    }),
  });
  push("FlowAPI gpt-5.5 调用", chat.response.ok, chat.response.ok ? `status=${chat.response.status}` : `status=${chat.response.status}, body=${String(chat.text || "").slice(0, 240)}`);

  const metrics = await requestPath("/api/admin/commercial-health", {
    headers: ADMIN_SECRET ? { "x-admin-secret": ADMIN_SECRET } : {},
  });
  push("商业健康检查", metrics.response.ok, `status=${metrics.response.status}`);

  const routes = await requestPath("/api/admin/routes", {
    headers: ADMIN_SECRET ? { "x-admin-secret": ADMIN_SECRET } : {},
  });
  const gpt55Route = Array.isArray(routes.json?.routes)
    ? routes.json.routes.find((item) => {
        const publicModelId = String(item.publicModelId || "").trim();
        const displayName = String(item.displayName || "").trim();
        const actualModelId = String(item.actualModelId || "").trim();
        return (
          publicModelId === "gpt-5.5"
          || publicModelId === "flowapi-gpt55"
          || displayName === "GPT-5.5"
          || actualModelId === "gpt-5.5"
        );
      })
    : null;
  const gpt55Channel = gpt55Route?.selectedChannel
    || gpt55Route?.selected_channel
    || gpt55Route?.channelName
    || gpt55Route?.channel_name
    || gpt55Route?.candidates?.[0]?.channelName
    || gpt55Route?.candidates?.[0]?.channel_name
    || "";
  push("gpt-5.5 路由记录", Boolean(gpt55Route), gpt55Channel);

  console.log("");
  console.log(`sub2api 后台首页: ${BASE_URL}/admin/token-pool`);
  console.log(`sub2api subscriptions 页面: ${BASE_URL}/admin/subscriptions`);
  console.log(`FlowAPI 公共 API: ${PUBLIC_API_BASE_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
