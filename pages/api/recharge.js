import { createRechargeOrder, getRechargeOrderById, listRechargeOrders, logActivity } from "@/lib/customer-store";
import { assertCustomerOwner, requireCustomerSession } from "@/lib/session";

function buildPurchaseRef(body = {}) {
  const {
    purchaseType = "balance_recharge",
    packageId = "",
    packageName = "",
    quotaText = "",
    validDays = "",
    paymentRef = "",
  } = body;
  if (purchaseType === "balance_recharge") return paymentRef || "";
  return [
    `购买类型：${purchaseType}`,
    packageId ? `套餐ID：${packageId}` : "",
    packageName ? `套餐名称：${packageName}` : "",
    quotaText ? `额度：${quotaText} Token` : "",
    validDays ? `有效期：${validDays} 天` : "",
    paymentRef ? `付款备注：${paymentRef}` : "",
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { customerId, orderId } = req.query || {};
    if (orderId) {
      const session = requireCustomerSession(req, res);
      if (!session) return;
      const order = await getRechargeOrderById(orderId);
      if (!order) return res.status(404).json({ error: "订单不存在" });
      if (order.customerId !== session.customerId) return res.status(403).json({ error: "无权查看其他用户的订单" });
      return res.status(200).json({ order });
    }
    const session = assertCustomerOwner(req, res, customerId);
    if (!session) return;
    return res.status(200).json({ orders: await listRechargeOrders({ customerId: session.customerId, limit: 20 }) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { customerId, amount, paymentMethod = "wechat", purchaseType = "balance_recharge" } = req.body || {};
  const session = assertCustomerOwner(req, res, customerId);
  if (!session) return;
  if (!amount) {
    return res.status(400).json({ error: "缺少参数" });
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: "金额无效" });
  }

  const paymentRef = buildPurchaseRef(req.body);
  const result = await createRechargeOrder({ customerId: session.customerId, amount: value, paymentMethod, paymentRef });
  if (result.error) return res.status(400).json({ error: result.error });

  await logActivity({
    customerId: session.customerId,
    action: "recharge_order",
    category: "payment",
    detail: purchaseType === "balance_recharge" ? `${paymentMethod} 充值订单 ¥${value.toFixed(2)}` : `${paymentMethod} 套餐订单 ¥${value.toFixed(2)} ${paymentRef}`,
    amount: value,
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  });

  return res.status(200).json({ ok: true, order: result.order });
}
