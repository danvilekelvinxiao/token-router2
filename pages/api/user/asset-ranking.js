import { requireCustomerSession } from "@/lib/session";
import { getUserAssetRanking } from "@/lib/ranking/user-ranking-service";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const customerId = session.customerId || req.query.customerId;
  if (!customerId) return res.status(401).json({ error: "请先登录后再查看资产排名" });

  if (session?.customerId && req.query.customerId && req.query.customerId !== session.customerId) {
    return res.status(403).json({ error: "无权查看其他用户的资产排名" });
  }

  try {
    const ranking = await getUserAssetRanking(customerId);
    if (!ranking) return res.status(404).json({ error: "用户不存在" });
    return res.status(200).json({
      success: true,
      ...ranking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "资产排名同步失败" });
  }
}
