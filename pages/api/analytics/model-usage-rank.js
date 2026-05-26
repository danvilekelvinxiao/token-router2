import { buildStationModelUsageRank } from "@/lib/model-rank";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const period = ["today", "week", "month"].includes(req.query.period) ? req.query.period : "week";

  return res.status(200).json(buildStationModelUsageRank(period));
}
