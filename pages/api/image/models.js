import { listImageModels, mapPublicImageModel } from "@/lib/image-studio";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const models = await listImageModels().then((items) => items.map(mapPublicImageModel)).catch(() => []);
  return res.status(200).json({
    success: true,
    models,
  });
}
