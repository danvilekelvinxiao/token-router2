import { requireAdmin } from "@/lib/admin-auth";
import { getRequestCacheSettings, saveRequestCacheSettings } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, settings: await getRequestCacheSettings() });
    }
    if (req.method === "POST") {
      const settings = await saveRequestCacheSettings(req.body || {}, admin.id);
      return res.status(200).json({ ok: true, settings });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "缓存配置保存失败" });
  }
}
