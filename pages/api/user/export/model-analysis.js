import { buildModelAnalysisExport } from "@/lib/export/user-export-data";
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
  const data = await buildModelAnalysisExport(session.customerId, filters, req.query);
  const fileName = `FlowAPI_模型数据分析包_${filters.startLabel}_${filters.endLabel}.xlsx`;

  return sendExcel(res, {
    fileName,
    sheets: [
      { name: "模型汇总", headers: data.summary.headers, rows: data.summary.rows },
      { name: "按日期统计", headers: data.daily.headers, rows: data.daily.rows },
      { name: "明细记录", headers: data.detail.headers, rows: data.detail.rows },
    ],
  });
}
