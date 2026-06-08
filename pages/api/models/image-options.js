import { listImageModels, mapPublicImageModel } from "@/lib/image-studio";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const models = await listImageModels();
    return res.status(200).json({
      ok: true,
      success: true,
      models: models.map(mapPublicImageModel),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "图片模型加载失败" });
  }
}
