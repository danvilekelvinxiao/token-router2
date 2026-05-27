import { getContentSnapshot, upsertContentCategory } from "@/lib/content-store";
import { requireAdminAccess } from "@/lib/api-auth";

export default function handler(req, res) {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  if (req.method === "GET") {
    return res.status(200).json({ success: true, ...getContentSnapshot() });
  }

  if (req.method === "POST") {
    const category = upsertContentCategory(req.body?.category || req.body || {});
    if (!category) {
      return res.status(400).json({ success: false, error: "分类配置缺少 id 或 slug" });
    }

    return res.status(200).json({ success: true, category, ...getContentSnapshot() });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ success: false, error: "Method not allowed" });
}
