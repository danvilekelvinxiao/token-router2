/**
 * Public content API — read-only, only returns enabled items.
 * Used by all user-facing pages to load admin-configurable content.
 */
import { getContent } from "@/lib/content-cms";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const type = req.query?.type || "";

  if (!type) {
    return res.status(400).json({ error: "缺少 content type 参数" });
  }

  try {
    const data = getContent(type);
    return res.status(200).json({ ok: true, type, source: "real", data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
