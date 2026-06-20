#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const results = [];

function run(label, cmd, args, options = {}) {
  const child = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
  });
  const ok = child.status === 0;
  const output = `${child.stdout || ""}${child.stderr || ""}`.trim();
  results.push({ label, ok, status: child.status, output });
  console.log(`\n== ${label} ==`);
  console.log(output || "(no output)");
  return ok;
}

function envFileExists(file) {
  return fs.existsSync(path.resolve(root, file));
}

function loadEnvFile(file) {
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs)) return;
  for (const line of fs.readFileSync(abs, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");

const envFile = process.argv[2] || (envFileExists(".env.production") ? ".env.production" : ".env.local");
if (envFile !== ".env.local") loadEnvFile(envFile);

run("New API 预检", "node", ["scripts/verify-new-api-env.mjs", envFile], {
  env: { NODE_ENV: "production" },
});

run("XPay 回归", "node", ["scripts/test-xpay-payment.mjs"]);

run("Runtime 合同", "node", ["scripts/test-flowapi-runtime-contract.mjs"], {
  env: { FLOWAPI_PUBLIC_BASE_URL: process.env.FLOWAPI_PUBLIC_BASE_URL || "http://127.0.0.1:3000" },
});

if (process.env.FLOWAPI_E2E_API_KEY) {
  run("商业 E2E", "node", ["scripts/e2e-commercial-loop.mjs"], {
    env: {
      FLOWAPI_E2E_BASE_URL: process.env.FLOWAPI_E2E_BASE_URL || "http://127.0.0.1:3000",
      FLOWAPI_E2E_API_KEY: process.env.FLOWAPI_E2E_API_KEY,
      FLOWAPI_E2E_EMAIL: process.env.FLOWAPI_E2E_EMAIL || "",
      FLOWAPI_E2E_PASSWORD: process.env.FLOWAPI_E2E_PASSWORD || "",
      FLOWAPI_E2E_ADMIN_EMAIL: process.env.FLOWAPI_E2E_ADMIN_EMAIL || "",
      FLOWAPI_E2E_ADMIN_PASSWORD: process.env.FLOWAPI_E2E_ADMIN_PASSWORD || "",
      FLOWAPI_E2E_RUN_PAID_CALL: process.env.FLOWAPI_E2E_RUN_PAID_CALL || "false",
    },
  });
} else {
  results.push({ label: "商业 E2E", ok: false, status: "skip", output: "未配置 FLOWAPI_E2E_API_KEY，跳过真实扣费调用" });
  console.log("\n== 商业 E2E ==\n未配置 FLOWAPI_E2E_API_KEY，跳过真实扣费调用");
}

if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  run("钱包审计", "node", ["scripts/audit-wallet.cjs", "--dry-run"]);
} else {
  results.push({ label: "钱包审计", ok: false, status: "skip", output: "未配置 DATABASE_URL / POSTGRES_URL，跳过钱包审计" });
  console.log("\n== 钱包审计 ==\n未配置 DATABASE_URL / POSTGRES_URL，跳过钱包审计");
}

const passed = results.filter((item) => item.ok).length;
const failed = results.filter((item) => item.status !== "skip" && !item.ok).length;
const skipped = results.filter((item) => item.status === "skip").length;
const score = Math.max(0, Math.round((passed / Math.max(1, results.length)) * 10));

console.log("\n== Summary ==");
console.log(JSON.stringify({ passed, failed, skipped, score, results }, null, 2));
process.exit(failed > 0 ? 1 : 0);
