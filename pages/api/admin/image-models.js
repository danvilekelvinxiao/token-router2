import { listImageModels, updateImageModelConfig } from "@/lib/image-studio";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const models = await listImageModels({ includeDisabled: true });
    return res.status(200).json({ success: true, models });
  }

  if (req.method === "POST") {
    const action = req.body?.action;
    if (action !== "enable_default_pack") {
      return res.status(400).json({ error: "不支持的操作" });
    }

    const retiredIds = new Set(["gpt-image-2", "flux-pro", "flux-schnell", "sdxl", "recraft", "ideogram"]);
    const models = await listImageModels({ includeDisabled: true });
    const targets = models.filter((item) => !retiredIds.has(item.id) && String(item.id || "").startsWith("flowapi-"));
    let enabledCount = 0;
    for (const model of targets) {
      if (!model.enabled) {
        await updateImageModelConfig(String(model.id), { enabled: true });
        enabledCount += 1;
      }
    }

    const latest = await listImageModels({ includeDisabled: true });
    return res.status(200).json({
      success: true,
      message: enabledCount > 0 ? `已启用 ${enabledCount} 个默认图片模型` : "默认图片模型本来就是启用状态",
      enabledCount,
      models: latest,
    });
  }

  if (req.method === "PUT") {
    const { modelId, updates } = req.body || {};
    if (!modelId || !updates || typeof updates !== "object") {
      return res.status(400).json({ error: "缺少 modelId 或 updates" });
    }
    const model = await updateImageModelConfig(String(modelId), updates);
    return res.status(200).json({ success: true, model });
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
