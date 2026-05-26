import { loadGlobalModelRank } from "@/lib/model-rank";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  return Promise.resolve(loadGlobalModelRank())
    .then((data) => res.status(200).json(data))
    .catch((error) => res.status(500).json({ success: false, error: error?.message || "同步失败" }));
}
