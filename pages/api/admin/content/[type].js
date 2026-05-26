import { requireAdmin } from "@/lib/admin-auth";
import { adminCreateContent, adminGetContent, adminSaveConfig } from "@/lib/content-cms";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { type } = req.query || {};
  if (!type) return res.status(400).json({ error: "缺少 content type 参数" });

  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      ok: true,
      type,
      data: adminGetContent(type),
    });
  }

  if (req.method === "POST") {
    const payload = req.body?.data || req.body || {};
    const audit = {
      createdBy: admin.customer?.id || admin.session?.customerId || "",
      updatedBy: admin.customer?.id || admin.session?.customerId || "",
    };
    if (["home", "support"].includes(String(type))) {
      const saved = adminSaveConfig(type, { ...payload, ...audit });
      return res.status(200).json({ success: true, ok: true, type, data: saved });
    }
    const created = adminCreateContent(type, { ...payload, ...audit });
    return res.status(200).json({ success: true, ok: true, type, data: created });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
