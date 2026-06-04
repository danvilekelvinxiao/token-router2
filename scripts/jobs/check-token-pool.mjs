const baseUrl = process.env.FLOWAPI_BASE_URL || process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun";
const secret = process.env.FLOWAPI_CRON_SECRET || "";

if (!secret) {
  console.error("FLOWAPI_CRON_SECRET 未配置，无法执行 Token 池巡检。");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/admin/token-pool/check`, {
  method: "POST",
  headers: { "x-flowapi-cron-secret": secret },
});
const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(data.error || `Token 池巡检失败：${response.status}`);
  process.exit(1);
}
console.log(`Token 池巡检完成：${data.logs?.length || 0} 条记录`);
