#!/usr/bin/env node
/**
 * 校验 New API 环境变量与连通性
 * 用法: node scripts/verify-new-api-env.mjs [.env.production]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const sub2ApiBase = (process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "").replace(/\/+$/, "");
const sub2ApiKey = String(process.env.SUB2API_API_KEY || process.env.SUB2API_API_KEY_SECONDARY || "").trim();
const base = (process.env.NEW_API_BASE_URL || "").replace(/\/+$/, "");
const defaultGroup = String(process.env.NEW_API_DEFAULT_GROUP || "default").trim();
const runtimeKeyCandidates = [
  process.env.NEW_API_KEY,
  process.env.NEW_API_KEY_ALL_MODELS,
  process.env[`NEW_API_KEY_${defaultGroup.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`],
  process.env[`NEW_API_${defaultGroup.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_KEY`],
  process.env.NEW_API_ADMIN_TOKEN,
];
const relayKey = runtimeKeyCandidates.find((value) => String(value || "").trim()) || "";
const adminToken = process.env.NEW_API_ADMIN_TOKEN || "";
const adminUserId = process.env.NEW_API_ADMIN_USER_ID || "1";

console.log("=== 环境变量 ===");
console.log("SUB2API_BASE_URL:", sub2ApiBase || "(未设置)");
console.log("SUB2API_API_KEY:", sub2ApiKey ? `${sub2ApiKey.slice(0, 4)}****${sub2ApiKey.slice(-4)}` : "(未设置)");
console.log("NEW_API_BASE_URL:", base || "(未设置)");
console.log("NEW_API_RUNTIME_KEY:", relayKey ? `${relayKey.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_ADMIN_TOKEN:", adminToken ? `${adminToken.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_ADMIN_USER_ID:", adminUserId);
console.log("NEW_API_DEFAULT_GROUP:", process.env.NEW_API_DEFAULT_GROUP || "default");
console.log("NEW_API_DEFAULT_QUOTA:", process.env.NEW_API_DEFAULT_QUOTA || "500000");

if (!base) {
  console.error("\n缺少 NEW_API_BASE_URL");
  process.exit(1);
}

async function checkRuntimeModels(key) {
  if (!key) {
    console.log("\n=== GET /v1/models (运行时 Key) === 缺少 NEW_API_KEY / NEW_API_KEY_ALL_MODELS");
    return false;
  }
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  console.log("\n=== GET /v1/models (运行时 Key) ===", res.status, res.ok ? "OK" : data);
  if (res.ok) {
    console.log("模型数量:", Array.isArray(data?.data) ? data.data.length : "?");
  }
  return res.ok;
}

async function checkAdmin() {
  if (!adminToken) {
    console.log("\n=== Admin /api/token/ === 跳过（无 NEW_API_ADMIN_TOKEN）");
    return true;
  }
  const res = await fetch(`${base}/api/token/`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "New-Api-User": adminUserId,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) {
    console.log("\n=== GET /api/token/ (Admin) === 404 跳过（当前 New API 版本未暴露该接口）");
    return true;
  }
  console.log("\n=== GET /api/token/ (Admin) ===", res.status, data.success ? "OK" : data);
  return res.ok && data.success !== false;
}

const key = relayKey || adminToken;
if (!key) {
  console.error("\n需要 NEW_API_KEY / NEW_API_KEY_ALL_MODELS 至少一个；NEW_API_ADMIN_TOKEN 只用于后台验证");
  process.exit(1);
}

let ok = true;
let runtimeOk = false;
try {
  runtimeOk = await checkRuntimeModels(relayKey || adminToken);
  ok = runtimeOk && ok;
  if (adminToken) ok = (await checkAdmin()) && ok;
} catch (e) {
  console.error("\n连接失败:", e.message);
  process.exit(1);
}

if (!runtimeOk && adminToken && relayKey !== adminToken) {
  console.log("\n提示: 仅检测到 NEW_API_ADMIN_TOKEN，未检测到单独的 NEW_API_KEY，已用管理员 Token 兜底校验。");
}

console.log(ok ? "\n✓ New API 运行时配置可用" : "\n✗ New API 运行时未通过，请检查 URL / runtime key / 渠道");
process.exit(ok ? 0 : 1);
