import { listImageModels, updateImageModelConfig } from "@/lib/image-studio";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const models = await listImageModels({ includeDisabled: true });
    return res.status(200).json({ success: true, models });
  }

  if (req.method === "PUT") {
    const { modelId, updates } = req.body || {};
    if (!modelId || !updates || typeof updates !== "object") {
      return res.status(400).json({ error: "缺少 modelId 或 updates" });
    }
    const model = await updateImageModelConfig(String(modelId), updates);
    return res.status(200).json({ success: true, model });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
