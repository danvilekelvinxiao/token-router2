#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(path.join(repoRoot, ".env.local"));

const baseUrl = String(process.env.FLOWAPI_ADMIN_SYNC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const adminCookie = String(process.env.FLOWAPI_ADMIN_COOKIE || process.env.FLOWAPI_E2E_ADMIN_COOKIE || "").trim();
const sessionSecret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "";
const customerId = process.env.FLOWAPI_ADMIN_CUSTOMER_ID || "cus_admin";
const email = process.env.FLOWAPI_ADMIN_EMAIL || "xiaoyijie@flowapi.fun";

if (!adminCookie && !sessionSecret) {
  console.error("缺少 FLOWAPI_ADMIN_COOKIE / FLOWAPI_E2E_ADMIN_COOKIE 或 SESSION_SECRET / NEXTAUTH_SECRET / JWT_SECRET，无法生成管理员会话。");
  process.exit(1);
}

function createSessionToken() {
  const payload = {
    customerId,
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function buildAdminCookie() {
  if (adminCookie) {
    return adminCookie.includes("=") ? adminCookie : `flowapi_session=${encodeURIComponent(adminCookie)}`;
  }
  return `flowapi_session=${encodeURIComponent(createSessionToken())}`;
}

async function main() {
  const response = await fetch(`${baseUrl}/api/admin/sync-consistency/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: buildAdminCookie(),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("同步一致性检查失败:", data.error || response.statusText);
    process.exit(1);
  }

  console.log("=== FlowAPI 后台/前台同步一致性检查 ===");
  console.log("检查时间:", data.checkedAt || new Date().toISOString());
  console.log("总状态:", data.ok ? "通过" : "存在不一致");
  console.log("计数:", JSON.stringify(data.counts || {}, null, 2));
  console.log("\n检查项:");
  for (const item of data.checks || []) {
    console.log(`- ${item.name}: ${item.status}${item.message ? ` - ${item.message}` : ""}`);
  }
  if (data.issues?.length) {
    console.log("\n不一致 / 缺失:");
    for (const issue of data.issues) {
      console.log(`- [${issue.level || "warn"}] ${issue.item || ""} ${issue.message}`);
    }
  }

  if (!data.ok) process.exit(2);
}

main().catch((error) => {
  console.error("同步一致性检查异常:", error.message || String(error));
  process.exit(1);
});
