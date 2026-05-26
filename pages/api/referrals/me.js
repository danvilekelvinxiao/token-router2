import { getReferralMe } from "@/lib/referrals/store";
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

  const data = await getReferralMe(owner.customerId);
  if (!data) return res.status(404).json({ error: "用户不存在" });
  return res.status(200).json(data);
}
