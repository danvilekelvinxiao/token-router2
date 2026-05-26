import { getDashboard, rechargeCustomer, redeemActivationCode } from "@/lib/customer-store";

export default function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      customer: getDashboard(req.query.customerId),
    });
  }

  if (req.method === "POST") {
    const action = req.body?.action || "recharge";
    let customer = null;

    if (action === "recharge") {
      customer = rechargeCustomer(req.body?.customerId, req.body?.amount);
    }

    if (action === "redeemActivationCode") {
      customer = redeemActivationCode(req.body?.customerId, req.body?.code);
    }

    if (!customer) {
      return res.status(404).json({ error: "请先创建账号后再操作" });
    }

    return res.status(200).json({
      customer,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
