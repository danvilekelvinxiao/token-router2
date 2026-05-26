import { convertCommissionToBalance } from "@/lib/referrals/store";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = requireCustomerSession(req, res);
  if (!session) return;
  const result = await convertCommissionToBalance({
    customerId: session.customerId,
    amountCny: req.body?.amountCny,
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(200).json(result);
}
