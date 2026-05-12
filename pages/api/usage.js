import { getDashboard, rechargeCustomer } from "@/lib/customer-store";

export default function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json(getDashboard(req.query.customerId));
  }

  if (req.method === "POST") {
    return res.status(200).json(rechargeCustomer(req.body?.customerId, req.body?.amount));
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
