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
const relayKey = process.env.NEW_API_KEY || "";
const adminToken = process.env.NEW_API_ADMIN_TOKEN || "";

console.log("=== 环境变量 ===");
console.log("NEW_API_BASE_URL:", base || "(未设置)");
console.log("NEW_API_KEY:", relayKey ? `${relayKey.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_ADMIN_TOKEN:", adminToken ? `${adminToken.slice(0, 12)}...` : "(未设置)");
console.log("NEW_API_DEFAULT_GROUP:", process.env.NEW_API_DEFAULT_GROUP || "default");
console.log("NEW_API_DEFAULT_QUOTA:", process.env.NEW_API_DEFAULT_QUOTA || "500000");

if (!base) {
  console.error("\n缺少 NEW_API_BASE_URL");
  process.exit(1);
}

async function checkStatus() {
  const res = await fetch(`${base}/api/status`);
  const data = await res.json().catch(() => ({}));
  console.log("\n=== GET /api/status ===", res.status, data.success ? "OK" : data);
  return data?.success;
}

async function checkModels(key) {
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  console.log("\n=== GET /v1/models (中转 Key) ===", res.status);
  if (res.ok) {
    try {
      const j = JSON.parse(text);
      console.log("模型数量:", j.data?.length ?? "?");
    } catch {
      console.log(text.slice(0, 200));
    }
  } else {
    console.log(text.slice(0, 300));
  }
  return res.ok;
}

async function checkAdmin() {
  if (!adminToken) {
    console.log("\n=== Admin /api/token/ === 跳过（无 NEW_API_ADMIN_TOKEN）");
    return false;
  }
  const res = await fetch(`${base}/api/token/`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "New-Api-User": "1",
    },
  });
  const data = await res.json().catch(() => ({}));
  console.log("\n=== GET /api/token/ (Admin) ===", res.status, data.success ? "OK" : data);
  return res.ok && data.success !== false;
}

const key = relayKey || adminToken;
if (!key) {
  console.error("\n需要 NEW_API_KEY 或 NEW_API_ADMIN_TOKEN 至少一个");
  process.exit(1);
}

let ok = true;
try {
  ok = (await checkStatus()) && ok;
  ok = (await checkModels(key)) && ok;
  if (adminToken) ok = (await checkAdmin()) && ok;
} catch (e) {
  console.error("\n连接失败:", e.message);
  process.exit(1);
}

console.log(ok ? "\n✓ New API 配置可用" : "\n✗ 请检查 URL / Token / 渠道");
process.exit(ok ? 0 : 1);
