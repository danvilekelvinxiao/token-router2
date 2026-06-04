const baseUrl = process.env.FLOWAPI_BASE_URL || process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun";
const secret = process.env.FLOWAPI_CRON_SECRET || "";

if (!secret) {
  console.error("FLOWAPI_CRON_SECRET 未配置，无法扫描告警。");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/admin/alerts`, {
  method: "POST",
  headers: { "x-flowapi-cron-secret": secret },
});
const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(data.error || `告警扫描失败：${response.status}`);
  process.exit(1);
}
console.log(`告警扫描完成：已发送 ${data.result?.sent || 0} 条告警`);
