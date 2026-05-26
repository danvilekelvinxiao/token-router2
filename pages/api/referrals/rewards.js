import { listReferralRewards } from "@/lib/referrals/store";
import { assertCustomerOwner, getSessionPayload } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = getSessionPayload(req);
  const customerId = req.query.customerId || session?.customerId;
  const owner = assertCustomerOwner(req, res, customerId);
  if (!owner) return;
  const result = await listReferralRewards(owner.customerId, { limit: Number(req.query.limit || 80) });
  return res.status(200).json(result);
}
