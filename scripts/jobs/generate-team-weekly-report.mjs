const baseUrl = process.env.FLOWAPI_BASE_URL || process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun";
const secret = process.env.FLOWAPI_CRON_SECRET || "";

if (!secret) {
  console.error("FLOWAPI_CRON_SECRET 未配置，无法生成团队周报。");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/admin/team-reports/weekly`, {
  headers: { "x-flowapi-cron-secret": secret },
});
const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(data.error || `团队周报生成失败：${response.status}`);
  process.exit(1);
}
console.log(`团队周报生成完成：${data.period?.start || ""} - ${data.period?.end || ""}`);
