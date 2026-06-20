import { getRechargeOrderById, getRechargeOrderByOutTradeNo, markRechargeOrderPaid } from "@/lib/customer-store";
import { normalizeXPayNotify, verifyXPayNotifySignature } from "@/lib/payments/xpay";

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = req.body && typeof req.body === "object" ? req.body : {};
  console.log("XPAY_NOTIFY_RAW:", JSON.stringify(payload));
  const verified = verifyXPayNotifySignature(payload, req.headers || {});
  if (!verified.ok) {
    return res.status(400).json({ ok: false, error: `签名校验失败: ${verified.reason}` });
  }

  const normalized = normalizeXPayNotify(payload);
  if (!normalized.paid) {
    return res.status(200).json({ ok: true, ignored: true, reason: "订单未支付完成" });
  }
  if (!normalized.orderId) {
    return res.status(400).json({ ok: false, error: "缺少订单号" });
  }

  const order =
    (await getRechargeOrderByOutTradeNo(normalized.orderId))
    || (await getRechargeOrderById(normalized.orderId));
  const outTradeNo = order?.outTradeNo || normalized.orderId;

  const result = await markRechargeOrderPaid({
    outTradeNo,
    providerTradeNo: normalized.tradeNo || outTradeNo,
    amount: Number.isFinite(normalized.amount) && normalized.amount > 0 ? Number(normalized.amount) : 0,
    rawPayload: JSON.stringify(payload),
    approvedBy: "xpay_notify",
    paidAt: normalized.paidAt || new Date().toISOString(),
  });

  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  return res.status(200).json({ ok: true, paid: true, order: result.order });
}
