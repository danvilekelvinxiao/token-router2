const baseUrl = process.env.FLOWAPI_BASE_URL || process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun";
const secret = process.env.FLOWAPI_CRON_SECRET || "";

if (!secret) {
  console.error("FLOWAPI_CRON_SECRET 未配置，无法分析限流。");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/admin/rate-limits/analysis`, {
  headers: { "x-flowapi-cron-secret": secret },
});
const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(data.error || `限流分析失败：${response.status}`);
  process.exit(1);
}
console.log(`限流分析完成：${data.analysis?.suggestions?.length || 0} 条建议`);
