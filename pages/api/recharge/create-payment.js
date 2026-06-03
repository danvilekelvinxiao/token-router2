import { createRechargeOrder, logActivity } from "@/lib/customer-store";
import { createAlipayRechargePayment, isAlipayConfigured } from "@/lib/payments/alipay";
import { createWechatRechargePayment, isWechatConfigured } from "@/lib/payments/wechat";
import { assertCustomerOwner } from "@/lib/session";

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { customerId, amount, paymentMethod } = req.body || {};
  const session = assertCustomerOwner(req, res, customerId);
  if (!session) return;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: "缺少有效的充值参数" });
  }

  if (!["wechat", "alipay"].includes(paymentMethod)) {
    return res.status(400).json({ error: "该支付方式暂不支持自动到账" });
  }

  async function recordOrderFlow(order) {
    const requestId = order?.outTradeNo || order?.id || "";
    await logActivity({
      customerId: session.customerId,
      action: "recharge_order",
      category: "payment",
      detail: `生成交易流水：${requestId || "-"} · ${paymentMethod} ¥${value.toFixed(2)}`,
      amount: value,
      ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
    });
  }

  if (paymentMethod === "wechat" && !isWechatConfigured()) {
    const created = await createRechargeOrder({ customerId: session.customerId, amount: value, paymentMethod, paymentRef: buildPurchaseRef(req.body) });
    if (created.error) return res.status(400).json({ error: created.error });
    await recordOrderFlow(created.order);
    return res.status(200).json({
      ok: true,
      mode: "manual",
      order: created.order,
      reason: "微信商户参数未配置完整，已切换到手动确认模式",
    });
  }

  if (paymentMethod === "alipay" && !isAlipayConfigured()) {
    const created = await createRechargeOrder({ customerId: session.customerId, amount: value, paymentMethod, paymentRef: buildPurchaseRef(req.body) });
    if (created.error) return res.status(400).json({ error: created.error });
    await recordOrderFlow(created.order);
    return res.status(200).json({
      ok: true,
      mode: "manual",
      order: created.order,
      reason: "支付宝商户参数未配置完整，已切换到手动确认模式",
    });
  }

  const created = await createRechargeOrder({ customerId: session.customerId, amount: value, paymentMethod, paymentRef: buildPurchaseRef(req.body) });
  if (created.error) {
    return res.status(400).json({ error: created.error });
  }
  await recordOrderFlow(created.order);

  const payment = paymentMethod === "wechat"
    ? await createWechatRechargePayment({ req, order: created.order })
    : await createAlipayRechargePayment({ req, order: created.order });

  if (payment.error) {
    return res.status(400).json({ error: payment.error });
  }

  return res.status(200).json({
    ok: true,
    order: created.order,
    payment: {
      provider: payment.provider,
      qrContent: payment.qrContent,
      qrImage: payment.qrImage,
    },
  });
}
