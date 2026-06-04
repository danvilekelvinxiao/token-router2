import { buildAdminUsageLogs, buildUsageLogExcelRows, buildUsageLogs, USAGE_LOG_HEADERS } from "@/lib/usage-log-service";
import { sendExcel } from "@/lib/export/server-excel";
import { getCustomer } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";

function stamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = requireCustomerSession(req, res);
  if (!session) return;

  const viewer = await getCustomer(session.customerId);
  const wantsAdmin = req.query.scope === "admin" || req.query.admin === "1";
  if (wantsAdmin && viewer?.role !== "admin") {
    return res.status(403).json({ error: "只有管理员可以导出全站使用日志" });
  }

  const data = wantsAdmin
    ? await buildAdminUsageLogs({
      filters: req.query || {},
      limit: 10000,
    })
    : await buildUsageLogs({
    customerId: session.customerId,
    filters: req.query || {},
    limit: 5000,
  });
  const rows = buildUsageLogExcelRows(data.items || []);
  return sendExcel(res, {
    fileName: `FlowAPI_使用日志_${stamp()}.xlsx`,
    sheets: [{ name: "使用日志", headers: USAGE_LOG_HEADERS, rows }],
  });
}
