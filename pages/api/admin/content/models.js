import { getContentSnapshot, upsertContentModel } from "@/lib/content-store";
import { requireAdminAccess } from "@/lib/api-auth";

export default function handler(req, res) {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  if (req.method === "GET") {
    return res.status(200).json({ success: true, ...getContentSnapshot() });
  }

  if (req.method === "POST") {
    const model = upsertContentModel(req.body?.model || req.body || {});
    if (!model) {
      return res.status(400).json({ success: false, error: "模型配置缺少 id 或 Model ID" });
    }

    return res.status(200).json({ success: true, model, ...getContentSnapshot() });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ success: false, error: "Method not allowed" });
}
