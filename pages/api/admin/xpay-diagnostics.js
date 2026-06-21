import { requireAdmin } from "@/lib/admin-auth";
import { listRechargeOrders } from "@/lib/customer-store";
import { getXPayMappingGuide, getXPayConfigSafe } from "@/lib/payments/xpay";

function summarizeGatewayPayload(payload) {
  if (!payload) return null;
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (parsed && typeof parsed === "object") {
      return {
        keys: Object.keys(parsed).slice(0, 40),
        sample: parsed,
      };
    }
  } catch {
    return {
      rawText: String(payload).slice(0, 2000),
    };
  }
  return null;
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const orders = await listRechargeOrders({ status: "", limit: 20 });
  const xpayOrders = (orders || [])
    .filter((order) => String(order.paymentMethod || "").toLowerCase() === "xpay" || String(order.provider || "").toLowerCase() === "xpay")
    .slice(0, 10)
    .map((order) => ({
      id: order.id,
      outTradeNo: order.outTradeNo,
      status: order.status,
      amount: order.amount,
      providerTradeNo: order.providerTradeNo || "",
      paidAt: order.paidAt || "",
      createdAt: order.createdAt || "",
      gatewayPayload: summarizeGatewayPayload(order.gatewayPayload),
    }));

  return res.status(200).json({
    ok: true,
    config: getXPayConfigSafe(),
    mappingGuide: getXPayMappingGuide(),
    orders: xpayOrders,
  });
}
