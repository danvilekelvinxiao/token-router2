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

const base = (process.env.NEW_API_BASE_URL || "").replace(/\/+$/, "");
const adminUrl = (process.env.NEW_API_ADMIN_URL || process.env.NEW_API_BASE_URL || "").replace(/\/+$/, "");
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

console.log("=== 环境变量 ===");
console.log("NEW_API_BASE_URL:", base || "(未设置)");
console.log("NEW_API_ADMIN_URL:", adminUrl || "(未设置)");
console.log("NEW_API_RUNTIME_KEY:", relayKey ? `${relayKey.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_ADMIN_TOKEN:", adminToken ? `${adminToken.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_DEFAULT_GROUP:", process.env.NEW_API_DEFAULT_GROUP || "default");
console.log("NEW_API_DEFAULT_QUOTA:", process.env.NEW_API_DEFAULT_QUOTA || "500000");

if (!base) {
  console.error("\n缺少 NEW_API_BASE_URL");
  process.exit(1);
}

async function checkRuntimeModels(key) {
  if (!key) {
    console.log("\n=== GET /v1/models (运行时 Key) === 缺少 NEW_API_KEY / NEW_API_KEY_ALL_MODELS / NEW_API_ADMIN_TOKEN");
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
    return { ok: true, skipped: true };
  }
  if (!adminUrl) {
    console.log("\n=== Admin /api/token/ === 跳过（无 NEW_API_ADMIN_URL / NEW_API_BASE_URL）");
    return { ok: true, skipped: true };
  }
  const res = await fetch(`${adminUrl}/api/token/`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "New-Api-User": "1",
    },
  });
  const data = await res.json().catch(() => ({}));
  console.log("\n=== GET /api/token/ (Admin) ===", res.status, data.success ? "OK" : data);
  if (res.status === 404 || res.status === 405) {
    return { ok: true, skipped: true, unsupported: true };
  }
  return { ok: res.ok && data.success !== false, skipped: false };
}

const key = relayKey || adminToken;
if (!key) {
  console.error("\n需要 NEW_API_KEY / NEW_API_KEY_ALL_MODELS 至少一个；NEW_API_ADMIN_TOKEN 可作为运行时回退");
  process.exit(1);
}

let ok = true;
let runtimeOk = false;
try {
  runtimeOk = await checkRuntimeModels(key);
  ok = runtimeOk && ok;
  if (adminToken) {
    const adminCheck = await checkAdmin();
    ok = adminCheck.ok && ok;
    if (adminCheck.unsupported) {
      console.log("\n提示: 当前 New API 管理端未暴露 /api/token/，已跳过管理校验。");
    }
  }
} catch (e) {
  console.error("\n连接失败:", e.message);
  process.exit(1);
}

if (!runtimeOk && adminToken && relayKey !== adminToken) {
  console.log("\n提示: 仅检测到 NEW_API_ADMIN_TOKEN，未检测到可用于运行时的 NEW_API_KEY。");
}

console.log(ok ? "\n✓ New API 运行时配置可用" : "\n✗ New API 运行时未通过，请检查 URL / runtime key / 渠道");
process.exit(ok ? 0 : 1);
