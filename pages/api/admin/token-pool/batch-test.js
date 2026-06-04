import { requireAdmin } from "@/lib/admin-auth";
import { batchTestTokenPool } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const result = await batchTestTokenPool({ adminId: admin.id, teamId: req.body?.teamId || "", useRealUpstream: req.body?.useRealUpstream === true });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "批量测试失败" });
  }
}
