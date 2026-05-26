import { requireAdmin } from "@/lib/admin-auth";
import { listReferralWithdrawals } from "@/lib/referrals/store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  return res.status(200).json(await listReferralWithdrawals({ limit: Number(req.query.limit || 300) }));
}
