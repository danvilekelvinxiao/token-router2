import { requireAdmin } from "@/lib/admin-auth";
import { adminDeleteContent, adminToggleContent, adminUpdateContent } from "@/lib/content-cms";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { type, id } = req.query || {};
  if (!type || !id) return res.status(400).json({ error: "缺少 content type 或 id" });

  if (req.method === "PUT") {
    const payload = req.body || {};
    const updatedBy = admin.customer?.id || admin.session?.customerId || "";
    if (payload.toggle) {
      const toggled = adminToggleContent(type, id, payload.toggle);
      return toggled
        ? res.status(200).json({ success: true, ok: true, data: { ...toggled, updatedBy } })
        : res.status(404).json({ error: "未找到" });
    }
    const updated = adminUpdateContent(type, id, { ...payload, updatedBy });
    return updated
      ? res.status(200).json({ success: true, ok: true, data: updated })
      : res.status(404).json({ error: "未找到" });
  }

  if (req.method === "DELETE") {
    return res.status(200).json(adminDeleteContent(type, id));
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
