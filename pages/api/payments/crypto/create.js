import { createRechargeOrder, logActivity } from "@/lib/customer-store";
import { createEpusdtPayment, getCryptoConfigSafe, normalizeCryptoSelection } from "@/lib/payments/crypto";
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

  const { customerId, amount, cryptoToken = "USDT", cryptoNetwork = "TRON" } = req.body || {};
  const session = assertCustomerOwner(req, res, customerId);
  if (!session) return;

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: "缺少有效的充值金额" });
  }

  const created = await createRechargeOrder({
    customerId: session.customerId,
    amount: value,
    paymentMethod: "crypto",
    paymentRef: buildPurchaseRef(req.body),
  });
  if (created.error) return res.status(400).json({ error: created.error });

  await logActivity({
    customerId: session.customerId,
    action: "recharge_order",
    category: "payment",
    detail: `生成加密货币交易流水：${created.order?.outTradeNo || created.order?.id || "-"} · ¥${value.toFixed(2)}`,
    amount: value,
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  });

  const selected = normalizeCryptoSelection({ token: cryptoToken, network: cryptoNetwork });
  if (selected.network && selected.network !== "ethereum") {
    const manualAddress = String(cryptoToken || "").toUpperCase() === "USDT"
      ? "TJeTTxyTnvhmMMyGU9EUBmQwbjHhjgENeY"
      : "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12";
    return res.status(200).json({
      ok: true,
      mode: "manual",
      reason: "当前新钱包已切换为 USDT-TRON 与 USDC-Polygon，链上到账先走人工确认。",
      order: created.order,
      payment: {
        provider: "manual_crypto",
        receiveAddress: manualAddress,
        token: String(cryptoToken || "USDT").toUpperCase(),
        network: cryptoNetwork || "TRON",
      },
      gateway: getCryptoConfigSafe(),
    });
  }

  const payment = await createEpusdtPayment({
    order: created.order,
    amountCny: value,
    customerId: session.customerId,
    token: cryptoToken,
    network: cryptoNetwork,
  });
  if (payment.error) {
    return res.status(400).json({
      error: payment.error,
      order: created.order,
      gateway: getCryptoConfigSafe(),
    });
  }

  return res.status(200).json({
    ok: true,
    order: created.order,
    payment: {
      provider: payment.provider,
      checkoutUrl: payment.checkoutUrl,
      gatewayOrderNo: payment.gatewayOrderNo,
      tradeId: payment.tradeId,
      orderId: payment.orderId,
      receiveAddress: payment.receiveAddress,
      actualAmount: payment.actualAmount,
      token: payment.token,
      network: payment.network,
      expiresAt: payment.expiresAt,
    },
  });
}
