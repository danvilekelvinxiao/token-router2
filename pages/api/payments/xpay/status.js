import { getRechargeOrderById, markRechargeOrderPaid } from "@/lib/customer-store";
import { normalizeXPayNotify, normalizeXPayQueryResponse, queryXPayOrder } from "@/lib/payments/xpay";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const orderId = String(req.query?.orderId || "").trim();
  if (!orderId) return res.status(400).json({ error: "缺少订单号" });

  const order = await getRechargeOrderById(orderId);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.customerId !== session.customerId) return res.status(403).json({ error: "无权查看其他用户订单" });
  if (order.status === "approved") return res.status(200).json({ ok: true, order, paid: true });

  const payload = normalizeXPayNotify({
    outTradeNo: order.outTradeNo,
    tradeId: order.providerTradeNo || order.outTradeNo,
    amount: order.amount,
    status: order.status,
    paidAt: order.paidAt || order.approvedAt || order.createdAt,
  });

  if (!payload.paid) {
    const queryResult = await queryXPayOrder({ orderId: order.outTradeNo });
    if (queryResult.error) {
      return res.status(200).json({ ok: true, order, paid: false, gatewayError: queryResult.error });
    }
    const normalized = normalizeXPayQueryResponse(queryResult.data);
    if (!normalized.paid) {
      return res.status(200).json({ ok: true, order, paid: false, gateway: queryResult.data, gatewayError: "等待 XPay 通知或查询返回支付完成" });
    }

    const paid = await markRechargeOrderPaid({
      outTradeNo: order.outTradeNo,
      providerTradeNo: normalized.tradeNo || order.providerTradeNo || order.outTradeNo,
      amount: Number(order.amount),
      rawPayload: JSON.stringify({ source: "xpay-query", query: queryResult.data }),
      approvedBy: "xpay_query",
      paidAt: normalized.paidAt || order.paidAt || order.approvedAt || new Date().toISOString(),
    });

    if (paid.error) return res.status(400).json({ error: paid.error });
    return res.status(200).json({ ok: true, order: paid.order, paid: true, gateway: queryResult.data });
  }

  const paid = await markRechargeOrderPaid({
    outTradeNo: order.outTradeNo,
    providerTradeNo: order.providerTradeNo || order.outTradeNo,
    amount: Number(order.amount),
    rawPayload: JSON.stringify({ source: "xpay-status-poll", orderId }),
    approvedBy: "xpay_status",
    paidAt: order.paidAt || order.approvedAt || new Date().toISOString(),
  });

  if (paid.error) return res.status(400).json({ error: paid.error });
  return res.status(200).json({ ok: true, order: paid.order, paid: true });
}
