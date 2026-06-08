import { requireAdmin } from "@/lib/admin-auth";
import { listModelPricing, saveModelPricing } from "@/lib/admin-commercial-config";
import { invalidateModelCaches } from "@/lib/cache-manager";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const pricing = await listModelPricing();
      return res.status(200).json({ ok: true, pricing });
    }
    if (req.method === "POST") {
      const body = req.body || {};
      const pricing = await saveModelPricing(body.model || body, body);
      invalidateModelCaches();
      return res.status(200).json({ ok: true, pricing });
    }
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "定价配置失败" });
  }
}
