import { buildBillingExport } from "@/lib/export/user-export-data";
import { parseDateFilters, sendExcel } from "@/lib/export/server-excel";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const filters = parseDateFilters(req.query);
  const data = await buildBillingExport(session.customerId, filters);
  const fileName = `FlowAPI_账单记录_${filters.startLabel}_${filters.endLabel}.xlsx`;

  return sendExcel(res, {
    fileName,
    sheets: [{ name: "账单记录", headers: data.headers, rows: data.rows }],
  });
}
