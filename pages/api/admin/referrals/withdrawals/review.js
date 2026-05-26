import { requireAdmin } from "@/lib/admin-auth";
import { reviewReferralWithdrawal } from "@/lib/referrals/store";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await reviewReferralWithdrawal({
    id: req.body?.id,
    action: req.body?.action,
    adminId: admin.customer?.id || "admin",
    note: req.body?.note || "",
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(200).json(result);
}
