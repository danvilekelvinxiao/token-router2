import { createRechargeOrder, logActivity, updateRechargeOrderGatewayPayload } from "@/lib/customer-store";
import { calculateCryptoUsdAmount, createEpusdtPayment, getCryptoConfigSafe, getManualCryptoWallet, isSupportedCryptoPayment, normalizeCryptoSelection } from "@/lib/payments/crypto";
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

  const { customerId, amount, cryptoToken = "USDT", cryptoNetwork = "TRON", purchaseType = "balance_recharge", packageId = "", packageName = "", quotaText = "", validDays = null } = req.body || {};
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
    purchaseType,
    packageId,
    packageName,
    quotaText,
    validDays,
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
  if (!selected.token || !selected.network) {
    return res.status(400).json({ error: "请选择正确的加密货币和链网络", order: created.order });
  }
  if (!isSupportedCryptoPayment({ token: cryptoToken, network: cryptoNetwork })) {
    return res.status(400).json({
      error: "当前仅支持 USDT-TRON、USDT-Ethereum、USDC-Ethereum、USDC-Polygon 收银台。",
      order: created.order,
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
    const manualWallet = getManualCryptoWallet({ token: cryptoToken, network: cryptoNetwork });
    if (!manualWallet) {
      return res.status(400).json({
        error: payment.error,
        order: created.order,
        gateway: getCryptoConfigSafe(),
      });
    }
    return res.status(200).json({
      ok: true,
      mode: "manual",
      reason: `GMWallet 暂时未能生成自动收银台：${payment.error}。已切换到人工确认兜底，请按页面订单号转账后提交凭证。`,
      order: created.order,
      payment: {
        provider: "manual_crypto",
        receiveAddress: manualWallet.address,
        actualAmount: calculateCryptoUsdAmount(value),
        amountUsd: calculateCryptoUsdAmount(value),
        token: manualWallet.token,
        network: manualWallet.network,
        orderId: created.order.outTradeNo,
      },
      gateway: getCryptoConfigSafe(),
    });
  }

  const bound = await updateRechargeOrderGatewayPayload({
    orderId: created.order.id,
    customerId: session.customerId,
    providerTradeNo: payment.tradeId || payment.gatewayOrderNo || "",
    gatewayPayload: JSON.stringify({
      provider: payment.provider,
      tradeId: payment.tradeId,
      gatewayOrderNo: payment.gatewayOrderNo,
      orderId: payment.orderId,
      token: payment.token,
      network: payment.network,
      amountUsd: payment.amountUsd,
      actualAmount: payment.actualAmount,
      receiveAddress: payment.receiveAddress,
      checkoutUrl: payment.checkoutUrl,
      expiresAt: payment.expiresAt,
    }),
  });
  if (bound.error) {
    return res.status(500).json({
      error: `GMWallet 订单已创建，但 FlowAPI 交易流水绑定失败：${bound.error}。请重新发起支付，避免付款后无法自动到账。`,
      order: created.order,
      gateway: getCryptoConfigSafe(),
    });
  }

  return res.status(200).json({
    ok: true,
    mode: "gateway",
    order: bound.order || created.order,
    payment: {
      provider: payment.provider,
      checkoutUrl: payment.checkoutUrl,
      gatewayOrderNo: payment.gatewayOrderNo,
      tradeId: payment.tradeId,
      orderId: payment.orderId,
      receiveAddress: payment.receiveAddress,
      actualAmount: payment.actualAmount,
      amountUsd: payment.amountUsd,
      token: payment.token,
      network: payment.network,
      expiresAt: payment.expiresAt,
    },
  });
}
