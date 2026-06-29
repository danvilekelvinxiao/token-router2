import { requireAdmin } from "@/lib/admin-auth";
import { getPoolStatusSnapshot } from "@/lib/pool-status";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const data = await getPoolStatusSnapshot({ visibility: "admin" });
    return res.status(200).json({
      success: true,
      generatedAt: data.generatedAt,
      cache: data.cache,
      summary: data.summary?.channels || {},
      channels: data.channels || [],
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "渠道状态读取失败" });
  }
}
