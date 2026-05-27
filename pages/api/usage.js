import { getDashboard, rechargeCustomer, redeemActivationCode } from "@/lib/customer-store";
import { requireCustomerAccess } from "@/lib/api-auth";

export default function handler(req, res) {
  if (req.method === "GET") {
    if (!requireCustomerAccess(req, res, req.query.customerId)) {
      return;
    }

    return res.status(200).json({
      customer: getDashboard(req.query.customerId),
    });
  }

  if (req.method === "POST") {
    const action = req.body?.action || "recharge";
    const customerId = req.body?.customerId;
    let customer = null;

    if (!requireCustomerAccess(req, res, customerId)) {
      return;
    }

    if (action === "recharge") {
      if (process.env.FLOWAPI_DEMO_RECHARGE_ENABLED !== "true") {
        return res.status(402).json({ error: "真实支付通道未配置，不能直接增加余额" });
      }

      customer = rechargeCustomer(customerId, req.body?.amount);
    }

    if (action === "redeemActivationCode") {
      customer = redeemActivationCode(customerId, req.body?.code);
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
