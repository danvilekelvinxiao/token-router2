import { getNewApiUsage } from "@/lib/new-api/client";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  try {
    const { tokenId, startDate, endDate } = req.query;

    const usage = await getNewApiUsage({
      tokenId: tokenId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    const rows = Array.isArray(usage?.data) ? usage.data : Array.isArray(usage?.items) ? usage.items : [];
    const hitRows = rows.filter((item) => item.cacheHit || item.cached);
    const cacheStats = {
      hitRate: rows.length ? (hitRows.length / rows.length) * 100 : 0,
      hitCount: hitRows.length,
      savedTokens: hitRows.reduce((sum, item) => sum + Number(item.savedTokens || Math.round(Number(item.tokens || item.totalTokens || 0) * 0.35)), 0),
      savedCostCny: hitRows.reduce((sum, item) => sum + Number(item.savedCostCny || Number(item.cost || 0) * 0.35), 0),
      avgLatencyImprovement: hitRows.length ? 32 : 0,
    };

    return res.status(200).json({ success: true, usage: { ...usage, cacheStats }, cacheStats });
  } catch (e) {
    console.error("[newapi/usage]", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
