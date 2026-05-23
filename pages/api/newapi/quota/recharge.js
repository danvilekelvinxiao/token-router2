import { rechargeNewApiUserQuota } from "@/lib/new-api/client";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  try {
    const { tokenId, quota } = req.body || {};

    if (!tokenId || !quota) {
      return res.status(400).json({ error: "缺少参数: tokenId, quota" });
    }

    const result = await rechargeNewApiUserQuota({
      tokenId,
      quota: Number(quota),
    });

    return res.status(200).json(result);
  } catch (e) {
    console.error("[newapi/quota/recharge]", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
