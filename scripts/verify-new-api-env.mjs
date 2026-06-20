#!/usr/bin/env node
/**
 * 校验 New API 环境变量与连通性
 * 用法: node scripts/verify-new-api-env.mjs [.env.production]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveNewApiBaseUrl, resolveNewApiAdminToken, resolveNewApiAdminUrl, resolveNewApiRuntimeToken, resolveNewApiRuntimeTokenSource } from "../lib/new-api/runtime.js";

const envFile = process.argv[2] || ".env.local";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, envFile);

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error(`找不到 ${file}`);
    process.exit(1);
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(envPath);

const base = resolveNewApiBaseUrl();
const adminUrl = resolveNewApiAdminUrl();
const relayKey = resolveNewApiRuntimeToken();
const adminToken = resolveNewApiAdminToken();
const relaySource = resolveNewApiRuntimeTokenSource().source || "(未设置)";
const explicitBase = String(process.env.NEW_API_BASE_URL || "").trim().replace(/\/+$/, "");
const legacySub2ApiBase = String(process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "").trim().replace(/\/+$/, "");
const probeBases = [
  { label: "NEW_API_BASE_URL", url: base, primary: true },
  ...(legacySub2ApiBase && legacySub2ApiBase !== base
    ? [{ label: "SUB2API_BASE_URL", url: legacySub2ApiBase, primary: false }]
    : []),
];
const probeKeys = [
  { label: relaySource || "NEW_API_RUNTIME_TOKEN", token: relayKey },
  { label: "NEW_API_ADMIN_TOKEN", token: adminToken },
].filter((item, index, array) => item.token && array.findIndex((other) => other.token === item.token) === index);

console.log("=== 环境变量 ===");
console.log("NEW_API_BASE_URL:", base || "(未设置)");
console.log("NEW_API_ADMIN_URL:", adminUrl || "(未设置)");
console.log("NEW_API_KEY / runtime:", relayKey ? `${relayKey.slice(0, 12)}... (${relaySource})` : "(未设置)");
console.log("NEW_API_ADMIN_TOKEN:", adminToken ? `${adminToken.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_DEFAULT_GROUP:", process.env.NEW_API_DEFAULT_GROUP || "default");
console.log("NEW_API_DEFAULT_QUOTA:", process.env.NEW_API_DEFAULT_QUOTA || "500000");
console.log("SUB2API_BASE_URL:", legacySub2ApiBase || "(未设置)");

if (!base) {
  console.error("\n缺少 NEW_API_BASE_URL");
  process.exit(1);
}

const productionMode = process.env.NODE_ENV === "production" || envFile.includes("production");
if (productionMode && explicitBase !== "http://127.0.0.1:8080") {
  console.warn("\n生产环境 NEW_API_BASE_URL 不是 http://127.0.0.1:8080，继续尝试可用运行链路校验");
}
if (productionMode) {
  if (probeKeys.length === 0) {
    console.error("\n生产环境必须配置 NEW_API_KEY / NEW_API_KEY_ALL_MODELS / SUB2API_API_KEY 或 NEW_API_ADMIN_TOKEN");
    process.exit(1);
  }
  if (adminUrl && adminUrl !== "https://pincc.flowapi.fun") {
    console.error("\n生产环境 NEW_API_ADMIN_URL 必须是 https://pincc.flowapi.fun");
    process.exit(1);
  }
  if (!explicitBase && legacySub2ApiBase) {
    console.error("\n生产环境缺少 NEW_API_BASE_URL，当前只检测到 SUB2API_BASE_URL。New API 地址必须单独配置。");
    process.exit(1);
  }
}

async function probeModels(token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}/v1/models`, { headers });
  const data = await res.json().catch(() => ({}));
  const count = Array.isArray(data?.data) ? data.data.length : Array.isArray(data?.models) ? data.models.length : 0;
  return { res, data, count };
}

async function checkStatus() {
  let lastFailure = null;
  for (const targetBase of probeBases) {
    for (const probe of probeKeys) {
      const res = await fetch(`${targetBase.url}/v1/models`, {
        headers: { Authorization: `Bearer ${probe.token}` },
      });
      const data = await res.json().catch(() => ({}));
      const count = Array.isArray(data?.data) ? data.data.length : Array.isArray(data?.models) ? data.models.length : 0;
      console.log(`\n=== GET /v1/models (${targetBase.label} / ${probe.label}) ===`, res.status, res.ok ? `OK (models=${count})` : data);
      if (res.ok) {
        if (!targetBase.primary) {
          console.warn(`=== 使用 ${targetBase.label} 作为可用运行链路完成校验 ===`);
        }
        return true;
      }
      lastFailure = { base: targetBase.label, label: probe.label, status: res.status, data };
    }
  }
  if (lastFailure) {
    console.log("\n=== GET /v1/models === 最终失败:", lastFailure);
  }
  return false;
}

async function checkModels() {
  for (const targetBase of probeBases) {
    for (const probe of probeKeys) {
      const res = await fetch(`${targetBase.url}/v1/models`, {
        headers: { Authorization: `Bearer ${probe.token}` },
      });
      const text = await res.text();
      console.log(`\n=== GET /v1/models (${targetBase.label} / ${probe.label}) ===`, res.status);
      if (res.ok) {
        try {
          const j = JSON.parse(text);
          console.log("模型数量:", j.data?.length ?? "?");
        } catch {
          console.log(text.slice(0, 200));
        }
        return true;
      }
      console.log(text.slice(0, 300));
    }
  }
  return false;
}

async function checkAdmin() {
  if (!adminToken) {
    console.log("\n=== Admin /api/token/ === 跳过（无 NEW_API_ADMIN_TOKEN）");
    return true;
  }
  const res = await fetch(`${base}/api/token/`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "New-Api-User": process.env.NEW_API_ADMIN_USER_ID || "1",
    },
  });
  const data = await res.json().catch(() => ({}));
  console.log("\n=== GET /api/token/ (Admin) ===", res.status, data.success ? "OK" : data);
  if (res.status === 404 && relayKey) {
    console.log("=== Admin /api/token/ === 当前上游未暴露该管理接口，已跳过");
    return true;
  }
  return Boolean(res.ok && data.success !== false);
}

if (probeKeys.length === 0) {
  console.error("\n需要 NEW_API_KEY / NEW_API_KEY_ALL_MODELS / SUB2API_API_KEY 或 NEW_API_ADMIN_TOKEN 至少一个");
  process.exit(1);
}

let ok = true;
try {
  ok = (await checkStatus()) && ok;
  ok = (await checkModels()) && ok;
  if (adminToken) ok = (await checkAdmin()) && ok;
} catch (e) {
  console.error("\n连接失败:", e.message);
  process.exit(1);
}

console.log(ok ? "\n✓ New API 配置可用" : "\n✗ 请检查 URL / Token / 渠道");
process.exit(ok ? 0 : 1);
