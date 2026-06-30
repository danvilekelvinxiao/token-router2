import { requireAdmin } from "@/lib/admin-auth";
import { adminGetContent, adminUpdateContent, adminCreateContent, adminDeleteContent, adminToggleContent, adminSaveConfig } from "@/lib/content-cms";
import { normalizeAnnouncementAdminInput } from "@/lib/announcement-utils";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  const { method, query, body } = req;
  const type = query?.type || body?.type || "";

  if (!type) {
    return res.status(400).json({ error: "缺少 content type 参数" });
  }

  // GET — list all (including disabled) for admin
  if (method === "GET") {
    const data = adminGetContent(type);
    return res.status(200).json({ ok: true, type, data });
  }

  // POST — create new item
  if (method === "POST") {
    if (type === "home" || type === "support") {
      const saved = adminSaveConfig(type, body.data || {});
      return res.status(200).json({ ok: true, type, data: saved });
    }
    const created = adminCreateContent(type, type === "announcements" ? normalizeAnnouncementAdminInput(body || {}) : (body || {}));
    return res.status(200).json({ ok: true, type, data: created });
  }

  // PUT — update existing item
  if (method === "PUT") {
    const { id, ...data } = body || {};
    if (!id) return res.status(400).json({ error: "缺少 id" });
    if (type === "home" || type === "support") {
      const saved = adminSaveConfig(type, data);
      return res.status(200).json({ ok: true, type, data: saved });
    }
    if (data.toggle) {
      const item = adminToggleContent(type, id, data.toggle);
      return item ? res.status(200).json({ ok: true, data: item }) : res.status(404).json({ error: "未找到" });
    }
    const updated = adminUpdateContent(type, id, type === "announcements" ? normalizeAnnouncementAdminInput({ ...data, id }) : data);
    return updated ? res.status(200).json({ ok: true, data: updated }) : res.status(404).json({ error: "未找到" });
  }

  // DELETE
  if (method === "DELETE") {
    const { id } = body || {};
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const result = adminDeleteContent(type, id);
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
