import QRCode from "qrcode";
import {
  getAppOrigin,
  getRechargePaymentAmount,
  makeRechargeDescription,
  parsePem,
  randomNonce,
  readRawBody,
  signRsaSha256,
  stringifySignedParams,
  verifyRsaSha256,
} from "@/lib/payments/common";

const gateway = process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do";

function getAlipayConfig() {
  return {
    appId: process.env.ALIPAY_APP_ID || "",
    privateKey: parsePem(process.env.ALIPAY_PRIVATE_KEY || ""),
    publicKey: parsePem(process.env.ALIPAY_PUBLIC_KEY || ""),
  };
}

export function isAlipayConfigured() {
  const config = getAlipayConfig();
  return Boolean(config.appId && config.privateKey && config.publicKey);
}

function signAlipayParams(params, privateKey) {
  const content = stringifySignedParams(params);
  return signRsaSha256(content, privateKey);
}

export async function createAlipayRechargePayment({ req, order }) {
  const config = getAlipayConfig();
  if (!isAlipayConfigured()) {
    return { error: "支付宝商户参数未配置完整" };
  }

  const notifyUrl = process.env.ALIPAY_NOTIFY_URL || `${getAppOrigin(req)}/api/payments/alipay/notify`;
  const paymentAmountRmb = getRechargePaymentAmount(order);
  const bizContent = {
    out_trade_no: order.outTradeNo,
    total_amount: Number(paymentAmountRmb).toFixed(2),
    subject: makeRechargeDescription(paymentAmountRmb),
    timeout_express: "15m",
  };

  const params = {
    app_id: config.appId,
    method: "alipay.trade.precreate",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    version: "1.0",
    notify_url: notifyUrl,
    biz_content: JSON.stringify(bizContent),
    nonce_str: randomNonce(12),
  };
  params.sign = signAlipayParams(params, config.privateKey);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(gateway, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  const payload = data.alipay_trade_precreate_response || {};
  if (!res.ok || payload.code !== "10000" || !payload.qr_code) {
    return { error: payload.sub_msg || payload.msg || "支付宝下单失败" };
  }

  return {
    provider: "alipay",
    qrContent: payload.qr_code,
    qrImage: await QRCode.toDataURL(payload.qr_code, { width: 320, margin: 1 }),
    raw: data,
  };
}

export async function parseAlipayNotify(req) {
  const config = getAlipayConfig();
  if (!isAlipayConfigured()) {
    return { error: "支付宝商户参数未配置完整" };
  }

  const rawBody = await readRawBody(req);
  const formText = rawBody.toString("utf8");
  const params = {};
  const parsed = new URLSearchParams(formText);
  for (const [key, value] of parsed.entries()) {
    params[key] = value;
  }

  const signature = params.sign || "";
  if (!signature) {
    return { error: "支付宝回调缺少签名" };
  }

  const verified = verifyRsaSha256(stringifySignedParams(params), signature, config.publicKey);
  if (!verified) {
    return { error: "支付宝回调验签失败" };
  }

  return {
    result: params,
    raw: formText,
  };
}
