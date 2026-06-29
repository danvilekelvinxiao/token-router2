#!/usr/bin/env node

const baseUrl = process.env.FLOWAPI_BASE_URL || process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun";
const secret = process.env.FLOWAPI_CRON_SECRET || "";

if (!secret) {
  console.error("FLOWAPI_CRON_SECRET 未配置，无法刷新号池状态缓存。");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/admin/pool-status/health`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-flowapi-cron-secret": secret,
  },
  body: JSON.stringify({ runChecks: true }),
});

const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(data.error || `号池状态刷新失败：${response.status}`);
  process.exit(1);
}

console.log(`号池状态刷新完成：${data.statusLabel || data.status || "unknown"}，账号 ${data.summary?.accounts?.total ?? 0}，渠道 ${data.summary?.channels?.total ?? 0}`);
