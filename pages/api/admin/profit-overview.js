import { requireAdmin } from "@/lib/admin-auth";
import { getProfitOverview } from "@/lib/customer-store";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const overview = await getProfitOverview({ days: req.query?.days || 7 });
    return res.status(200).json(overview);
  } catch (error) {
    console.error("[admin/profit-overview]", error);
    return res.status(500).json({
      error: "毛利数据读取失败",
      suggestion: "请先确认 calls 表已完成迁移，并检查最近调用日志是否正常写入。",
    });
  }
}
