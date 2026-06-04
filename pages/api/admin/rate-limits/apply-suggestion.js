import { requireAdmin } from "@/lib/admin-auth";
import { applyRateLimitSuggestion } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const rule = await applyRateLimitSuggestion({ ruleId: req.body?.ruleId, proposedRequestsPerMinute: req.body?.proposedRequestsPerMinute, adminId: admin.id });
    return res.status(200).json({ ok: true, rule });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "应用限流建议失败" });
  }
}
