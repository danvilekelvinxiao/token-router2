import { markRechargeOrderPaid } from "@/lib/customer-store";
import { isEpusdtPaid, verifyEpusdtNotifySignature } from "@/lib/payments/crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function normalizePayload(payload = {}) {
  const data = payload?.data || payload;
  return {
    outTradeNo: String(data?.order_id || data?.out_trade_no || data?.merchant_order_no || "").trim(),
    providerTradeNo: String(data?.trade_id || data?.trade_no || data?.txid || data?.hash || "").trim(),
    amount: Number(data?.actual_amount || data?.amount || data?.money || data?.pay_amount || 0),
    paid: isEpusdtPaid(data),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return res.status(400).json({ error: "回调数据格式错误" });
  }

  const verified = verifyEpusdtNotifySignature(rawBody, req.headers, payload);
  if (!verified) return res.status(401).json({ error: "回调验签失败" });

  const normalized = normalizePayload(payload);
  if (!normalized.outTradeNo) return res.status(400).json({ error: "缺少商户订单号" });
  if (!normalized.paid) return res.status(200).json({ ok: true, ignored: true, reason: "订单未支付完成" });

  const marked = await markRechargeOrderPaid({
    outTradeNo: normalized.outTradeNo,
    providerTradeNo: normalized.providerTradeNo,
    amount: normalized.amount,
    rawPayload: rawBody.slice(0, 2000),
    approvedBy: "gmwallet-notify",
  });
  if (marked.error) return res.status(400).json({ error: marked.error });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send("success");
}
