import { logActivity, updateRechargeOrderManualProof } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const {
    orderId = "",
    paymentRef = "",
    providerTradeNo = "",
    gatewayPayload = "",
  } = req.body || {};

  const result = await updateRechargeOrderManualProof({
    orderId: String(orderId || "").trim(),
    customerId: session.customerId,
    paymentRef: String(paymentRef || "").trim(),
    providerTradeNo: String(providerTradeNo || "").trim(),
    gatewayPayload: String(gatewayPayload || "").trim(),
  });

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  await logActivity({
    customerId: session.customerId,
    action: "recharge_manual_confirm",
    category: "payment",
    detail: `提交人工确认：${result.order?.outTradeNo || result.order?.id || "-"} · ${String(paymentRef || providerTradeNo || "未填写凭证").slice(0, 120)}`,
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  });

  return res.status(200).json({
    ok: true,
    order: result.order,
    message: "已提交人工确认，请到充值管理中确认到账。",
  });
}
