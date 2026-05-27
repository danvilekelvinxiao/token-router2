import { getPublicModels } from "@/lib/content-store";

export default function handler(req, res) {
  const models = getPublicModels();

  return res.status(200).json({ source: "content", models });
}
