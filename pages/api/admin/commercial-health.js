import { requireAdmin } from "@/lib/admin-auth";
import { buildCommercialHealth } from "@/lib/commercial-health";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const health = await buildCommercialHealth();
    return res.status(200).json({ success: true, ...health });
  } catch (error) {
    return res.status(500).json({ success: false, ok: false, error: error.message || "商业闭环检查失败" });
  }
}
