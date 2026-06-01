import { getRechargeOrderById, markRechargeOrderPaid } from "@/lib/customer-store";
import { isEpusdtPaid, queryEpusdtOrder } from "@/lib/payments/crypto";
import { requireCustomerSession } from "@/lib/session";

function extractStatusPayload(data = {}) {
  return data?.data || data;
}

function extractAmount(payload = {}, fallback = 0) {
  const raw = payload?.actual_amount || payload?.amount || payload?.money || payload?.pay_amount;
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) return value;
  return Number(fallback || 0);
}

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

  const tradeId = String(req.query?.tradeId || "").trim();
  const queryResult = await queryEpusdtOrder({ tradeId, outTradeNo: order.outTradeNo });
  if (queryResult.error) {
    return res.status(200).json({ ok: true, order, paid: false, gatewayError: queryResult.error });
  }

  const payload = extractStatusPayload(queryResult.data);
  if (!isEpusdtPaid(payload)) {
    return res.status(200).json({ ok: true, order, paid: false, gateway: payload });
  }

  const paid = await markRechargeOrderPaid({
    outTradeNo: order.outTradeNo,
    providerTradeNo: String(payload?.trade_id || payload?.trade_no || payload?.txid || payload?.hash || ""),
    amount: extractAmount(payload, order.amount),
    rawPayload: JSON.stringify(queryResult.data),
    approvedBy: "gmwallet-query",
  });
  if (paid.error) return res.status(400).json({ error: paid.error });

  return res.status(200).json({ ok: true, order: paid.order, paid: true });
}
