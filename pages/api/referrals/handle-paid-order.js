import { handlePaidReferralOrder } from "@/lib/referrals/store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await handlePaidReferralOrder({
    orderId: req.body?.orderId,
    userId: req.body?.userId,
    paidAmountCny: req.body?.paidAmountCny,
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(200).json(result);
}
