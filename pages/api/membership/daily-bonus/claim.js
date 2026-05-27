import { claimDailyBonus } from "@/lib/membership/store";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = requireCustomerSession(req, res);
  if (!session) return;
  return res.status(200).json(await claimDailyBonus(session.customerId));
}
