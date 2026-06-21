import QRCode from "qrcode";
import crypto from "node:crypto";
import { getSettings } from "../admin-store.js";

const DEFAULT_XPAY_QR_IMAGE = "/images/pay/xpay-wechat.jpg";
const DEFAULT_PAID_VALUES = ["1", "3", "paid", "success", "succeeded", "completed", "confirmed", "finished", "ok", "true"];

function readExplicitEnvFlag(key) {
  if (!Object.prototype.hasOwnProperty.call(process.env, key)) return null;
  const raw = String(process.env[key] ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off", ""].includes(raw)) return false;
  return null;
}

function resolveEnabled(explicitValue, qrImage, qrContent) {
  if (explicitValue !== null && explicitValue !== undefined) return Boolean(explicitValue);
  return Boolean(qrImage || qrContent);
}

function splitCsv(value, fallback = []) {
  const text = String(value || "").trim();
  if (!text) return [...fallback];
  return text.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function readXPayField(path, payload) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), payload);
}

function getXPayConfig() {
  const adminSettings = globalThis.__TOKEN_ROUTER_ADMIN__?.settings || {};
  const qrImage = String(adminSettings.xpayQrImage || process.env.XPAY_QR_IMAGE || DEFAULT_XPAY_QR_IMAGE).trim();
  const qrContent = String(adminSettings.xpayQrContent || process.env.XPAY_QR_CONTENT || "").trim();
  const envEnabled = readExplicitEnvFlag("XPAY_ENABLED");
  return {
    enabled: adminSettings.xpayEnabled != null
      ? Boolean(adminSettings.xpayEnabled)
      : resolveEnabled(envEnabled, qrImage, qrContent),
    providerName: String(adminSettings.xpayProviderName || process.env.XPAY_PROVIDER_NAME || "XPay").trim() || "XPay",
    qrImage,
    qrContent,
    paymentNotePrefix: String(adminSettings.xpayPaymentNotePrefix || process.env.XPAY_PAYMENT_NOTE_PREFIX || "XPAY").trim() || "XPAY",
    queryUrl: String(adminSettings.xpayQueryUrl || process.env.XPAY_QUERY_URL || "").trim(),
    queryMethod: String(adminSettings.xpayQueryMethod || process.env.XPAY_QUERY_METHOD || "GET").trim().toUpperCase(),
    queryOrderParam: String(adminSettings.xpayQueryOrderParam || process.env.XPAY_QUERY_ORDER_PARAM || "orderId").trim() || "orderId",
    queryStatusField: String(adminSettings.xpayQueryStatusField || process.env.XPAY_QUERY_STATUS_FIELD || "result").trim() || "result",
    queryPaidValues: splitCsv(adminSettings.xpayQueryPaidValues || "", DEFAULT_PAID_VALUES),
    notifyOrderField: String(adminSettings.xpayNotifyOrderField || "").trim(),
    notifyTradeField: String(adminSettings.xpayNotifyTradeField || "").trim(),
    notifyAmountField: String(adminSettings.xpayNotifyAmountField || "").trim(),
    notifyStatusField: String(adminSettings.xpayNotifyStatusField || "").trim(),
    notifyPaidValues: splitCsv(adminSettings.xpayNotifyPaidValues || "", DEFAULT_PAID_VALUES),
    signatureHeader: String(adminSettings.xpaySignatureHeader || "x-xpay-signature").trim() || "x-xpay-signature",
    signatureField: String(adminSettings.xpaySignatureField || "signature").trim() || "signature",
    signatureAlgorithm: String(adminSettings.xpaySignatureAlgorithm || "sha256").trim() || "sha256",
    manualConfirm: adminSettings.xpayManualConfirm != null
      ? Boolean(adminSettings.xpayManualConfirm)
      : String(process.env.XPAY_MANUAL_CONFIRM || "true").toLowerCase() !== "false",
  };
}

function getXPayConfigFromSettings(settings = {}) {
  const qrImage = String(settings.xpayQrImage || process.env.XPAY_QR_IMAGE || DEFAULT_XPAY_QR_IMAGE).trim();
  const qrContent = String(settings.xpayQrContent || process.env.XPAY_QR_CONTENT || "").trim();
  const envEnabled = readExplicitEnvFlag("XPAY_ENABLED");
  return {
    enabled: settings.xpayEnabled != null
      ? Boolean(settings.xpayEnabled)
      : resolveEnabled(envEnabled, qrImage, qrContent),
    providerName: String(settings.xpayProviderName || process.env.XPAY_PROVIDER_NAME || "XPay").trim() || "XPay",
    qrImage,
    qrContent,
    paymentNotePrefix: String(settings.xpayPaymentNotePrefix || process.env.XPAY_PAYMENT_NOTE_PREFIX || "XPAY").trim() || "XPAY",
    queryUrl: String(settings.xpayQueryUrl || process.env.XPAY_QUERY_URL || "").trim(),
    queryMethod: String(settings.xpayQueryMethod || process.env.XPAY_QUERY_METHOD || "GET").trim().toUpperCase(),
    queryOrderParam: String(settings.xpayQueryOrderParam || process.env.XPAY_QUERY_ORDER_PARAM || "orderId").trim() || "orderId",
    queryStatusField: String(settings.xpayQueryStatusField || process.env.XPAY_QUERY_STATUS_FIELD || "result").trim() || "result",
    queryPaidValues: splitCsv(settings.xpayQueryPaidValues || "", DEFAULT_PAID_VALUES),
    notifyOrderField: String(settings.xpayNotifyOrderField || "").trim(),
    notifyTradeField: String(settings.xpayNotifyTradeField || "").trim(),
    notifyAmountField: String(settings.xpayNotifyAmountField || "").trim(),
    notifyStatusField: String(settings.xpayNotifyStatusField || "").trim(),
    notifyPaidValues: splitCsv(settings.xpayNotifyPaidValues || "", DEFAULT_PAID_VALUES),
    signatureHeader: String(settings.xpaySignatureHeader || "x-xpay-signature").trim() || "x-xpay-signature",
    signatureField: String(settings.xpaySignatureField || "signature").trim() || "signature",
    signatureAlgorithm: String(settings.xpaySignatureAlgorithm || "sha256").trim() || "sha256",
    manualConfirm: settings.xpayManualConfirm != null
      ? Boolean(settings.xpayManualConfirm)
      : String(process.env.XPAY_MANUAL_CONFIRM || "true").toLowerCase() !== "false",
  };
}

export async function getXPayConfigAsync() {
  try {
    const settings = await getSettings();
    return getXPayConfigFromSettings(settings || {});
  } catch {
    return getXPayConfig();
  }
}

export async function isXPayConfiguredAsync() {
  const conf = await getXPayConfigAsync();
  return Boolean(conf.enabled && (conf.qrImage || conf.qrContent));
}

export function isXPayConfigured() {
  const conf = getXPayConfig();
  return Boolean(conf.enabled && (conf.qrImage || conf.qrContent));
}

export function getXPayConfigSafe() {
  const conf = getXPayConfig();
  return {
    enabled: conf.enabled,
    providerName: conf.providerName,
    qrImage: conf.qrImage,
    qrContent: conf.qrContent ? "[masked]" : "",
    paymentNotePrefix: conf.paymentNotePrefix,
    queryUrl: conf.queryUrl,
    queryMethod: conf.queryMethod,
    queryOrderParam: conf.queryOrderParam,
    queryStatusField: conf.queryStatusField,
    queryPaidValues: conf.queryPaidValues,
    notifyOrderField: conf.notifyOrderField,
    notifyTradeField: conf.notifyTradeField,
    notifyAmountField: conf.notifyAmountField,
    notifyStatusField: conf.notifyStatusField,
    notifyPaidValues: conf.notifyPaidValues,
    signatureHeader: conf.signatureHeader,
    signatureField: conf.signatureField,
    signatureAlgorithm: conf.signatureAlgorithm,
    manualConfirm: conf.manualConfirm,
  };
}

export function getXPayConfigPublic() {
  const conf = getXPayConfig();
  return {
    enabled: conf.enabled,
    providerName: conf.providerName,
    qrImage: conf.qrImage,
    qrContent: conf.qrContent,
    paymentNotePrefix: conf.paymentNotePrefix,
    queryUrl: conf.queryUrl,
    queryMethod: conf.queryMethod,
    queryOrderParam: conf.queryOrderParam,
    queryStatusField: conf.queryStatusField,
    queryPaidValues: conf.queryPaidValues,
    notifyOrderField: conf.notifyOrderField,
    notifyTradeField: conf.notifyTradeField,
    notifyAmountField: conf.notifyAmountField,
    notifyStatusField: conf.notifyStatusField,
    notifyPaidValues: conf.notifyPaidValues,
    signatureHeader: conf.signatureHeader,
    signatureField: conf.signatureField,
    signatureAlgorithm: conf.signatureAlgorithm,
    manualConfirm: conf.manualConfirm,
  };
}

export async function createXPayRechargePayment({ order, amountCny }) {
  const conf = await getXPayConfigAsync();
  if (!Boolean(conf.enabled && (conf.qrImage || conf.qrContent))) {
    return { error: "XPay 收款码暂未配置完成" };
  }

  const amount = Number(amountCny || order?.amount || 0);
  const note = `${conf.paymentNotePrefix}-${order.outTradeNo}`;
  const generatedQrImage = conf.qrContent
    ? await QRCode.toDataURL(conf.qrContent, { width: 320, margin: 1 })
    : "";
  const resolvedQrImage = conf.qrImage && conf.qrImage !== DEFAULT_XPAY_QR_IMAGE
    ? conf.qrImage
    : generatedQrImage || conf.qrImage;

  return {
    provider: "xpay",
    providerName: conf.providerName,
    paymentNote: note,
    qrContent: conf.qrContent,
    qrImage: resolvedQrImage,
    orderId: order.outTradeNo,
    actualAmount: amount,
    amountUsd: amount,
    receiveAddress: "",
    checkoutUrl: "",
    manualConfirm: conf.manualConfirm,
    providerType: "qr-code",
  };
}

export function isXPayPaid(payload = {}) {
  if (typeof payload === "number") {
    return payload === 1 || payload === 3;
  }
  if (typeof payload === "string") {
    const compact = payload.trim().toLowerCase();
    if (compact === "1" || compact === "3") return true;
    if (["0", "2", "false", "fail", "failed", "reject", "rejected", "cancel", "cancelled"].includes(compact)) return false;
  }
  const candidates = [
    payload?.status,
    payload?.tradeStatus,
    payload?.trade_status,
    payload?.payStatus,
    payload?.pay_status,
    payload?.paymentStatus,
    payload?.state,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return candidates.some((value) => ["paid", "success", "succeeded", "completed", "confirmed", "finished", "ok", "true"].includes(value))
    || payload?.paid === true
    || payload?.is_paid === true;
}

function isPaidValueMatched(value, allowedValues = []) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Boolean(normalized) && allowedValues.includes(normalized);
}

export function normalizeXPayNotify(payload = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const conf = getXPayConfig();
  const orderId = readXPayField(conf.notifyOrderField, body) || body.outTradeNo || body.out_trade_no || body.orderId || body.order_id || body.merchantOrderNo || body.merchant_order_no || body.tradeId || body.trade_id || "";
  const tradeNo = readXPayField(conf.notifyTradeField, body) || body.tradeNo || body.trade_no || body.transactionId || body.transaction_id || body.payId || body.pay_id || body.tradeId || body.trade_id || "";
  const amount = readXPayField(conf.notifyAmountField, body) || body.amount || body.totalAmount || body.total_amount || body.payAmount || body.pay_amount || 0;
  const paidState = readXPayField(conf.notifyStatusField, body) ?? body.status ?? body.tradeStatus ?? body.trade_status ?? body.payStatus ?? body.pay_status ?? body.paymentStatus ?? body.state;
  return {
    orderId: String(orderId || "").trim(),
    tradeNo: String(tradeNo || "").trim(),
    amount: Number(amount || 0),
    paidAt: String(body.paidAt || body.paid_at || body.successTime || body.success_time || body.notifyTime || body.notify_time || new Date().toISOString()).trim(),
    paid: isPaidValueMatched(paidState, conf.notifyPaidValues) || isXPayPaid(body),
    note: String(body.note || body.remark || body.paymentNote || body.payment_note || "").trim(),
    raw: body,
  };
}

export function getXPayMappingGuide() {
  const conf = getXPayConfig();
  return {
    sourceProfile: {
      source: "xpay-3.1",
      stateRoute: "/pay/state/{orderId}",
      paidValue: "1",
      statusField: "result",
      note: "源码查询返回 ResultUtil.setData(1) 视为支付成功",
    },
    query: {
      urlTemplate: conf.queryUrl || process.env.XPAY_QUERY_URL || "",
      method: conf.queryMethod || process.env.XPAY_QUERY_METHOD || "GET",
      orderParam: conf.queryOrderParam || process.env.XPAY_QUERY_ORDER_PARAM || "orderId",
      statusField: conf.queryStatusField || "result",
      paidValues: conf.queryPaidValues || DEFAULT_PAID_VALUES,
    },
    notify: {
      orderField: conf.notifyOrderField || "",
      tradeField: conf.notifyTradeField || "",
      amountField: conf.notifyAmountField || "",
      statusField: conf.notifyStatusField || "",
      paidValues: conf.notifyPaidValues || DEFAULT_PAID_VALUES,
      signatureHeader: conf.signatureHeader || "x-xpay-signature",
      signatureField: conf.signatureField || "signature",
      signatureAlgorithm: conf.signatureAlgorithm || "sha256",
    },
  };
}

export function verifyXPayNotifySignature(payload = {}, headers = {}) {
  const secret = String(process.env.XPAY_NOTIFY_SECRET || "").trim();
  if (!secret) return { ok: false, reason: "missing-secret" };
  const conf = getXPayConfig();

  const provided = String(
    headers[String(conf.signatureHeader || "x-xpay-signature").toLowerCase()] ||
    headers["x-signature"] ||
    readXPayField(conf.signatureField, payload) ||
    payload.signature ||
    payload.sign ||
    payload.signa ||
    ""
  ).trim();
  if (!provided) return { ok: false, reason: "missing-signature" };

  const algorithm = String(conf.signatureAlgorithm || "sha256").trim().toLowerCase();
  const hmac = crypto.createHmac(algorithm, secret);
  const base = JSON.stringify({
    orderId: payload.outTradeNo || payload.out_trade_no || payload.orderId || payload.order_id || "",
    tradeNo: payload.tradeNo || payload.trade_no || payload.transactionId || payload.transaction_id || payload.tradeId || payload.trade_id || "",
    amount: payload.amount || payload.totalAmount || payload.total_amount || payload.payAmount || payload.pay_amount || "",
    paidAt: payload.paidAt || payload.paid_at || payload.successTime || payload.success_time || payload.notifyTime || payload.notify_time || "",
    status: payload.status || payload.tradeStatus || payload.trade_status || payload.payStatus || payload.pay_status || payload.state || "",
  });
  const expected = hmac.update(base).digest("hex");
  return { ok: provided === expected, reason: provided === expected ? "ok" : "signature-mismatch" };
}

function readQueryConfig() {
  return {
    url: String(process.env.XPAY_QUERY_URL || "").trim(),
    method: String(process.env.XPAY_QUERY_METHOD || "GET").trim().toUpperCase(),
    orderParam: String(process.env.XPAY_QUERY_ORDER_PARAM || "orderId").trim() || "orderId",
  };
}

export function normalizeXPayQueryResponse(payload = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const primitive = typeof payload === "number" || typeof payload === "string" || typeof payload === "boolean" ? payload : null;
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const result = body.result && typeof body.result === "object" ? body.result : {};
  const conf = getXPayConfig();
  const statusValue = readXPayField(conf.queryStatusField, data) ?? readXPayField(conf.queryStatusField, body) ?? readXPayField(conf.queryStatusField, result);
  const allowedPaidValues = conf.queryPaidValues;
  const successFlag = [body.success, body.ok, result.success]
    .map((value) => (typeof value === "string" ? value.toLowerCase() : value))
    .some((value) => value === true || value === 1 || value === 200 || value === "true" || value === "ok");
  const paid = isPaidValueMatched(primitive, allowedPaidValues) || isPaidValueMatched(statusValue, allowedPaidValues) || isXPayPaid(primitive) || isXPayPaid(data) || isXPayPaid(body) || isXPayPaid(result) || successFlag;
  return {
      paid,
      orderId: String(
        data.outTradeNo ||
        data.out_trade_no ||
      data.orderId ||
      data.order_id ||
      data.merchantOrderNo ||
      data.merchant_order_no ||
      body.outTradeNo ||
      body.out_trade_no ||
        body.orderId ||
        body.order_id ||
        result.outTradeNo ||
        result.out_trade_no ||
        result.orderId ||
        result.order_id ||
        ""
      ).trim(),
      tradeNo: String(
        data.tradeNo ||
        data.trade_no ||
      data.transactionId ||
      data.transaction_id ||
      data.tradeId ||
      data.trade_id ||
      body.tradeNo ||
      body.trade_no ||
        body.transactionId ||
        body.transaction_id ||
        body.tradeId ||
        body.trade_id ||
        result.tradeNo ||
        result.trade_no ||
        result.transactionId ||
        result.transaction_id ||
        result.tradeId ||
        result.trade_id ||
        ""
      ).trim(),
      amount: Number(
        data.amount ||
        data.totalAmount ||
      data.total_amount ||
      data.payAmount ||
      data.pay_amount ||
        body.amount ||
        body.totalAmount ||
        body.total_amount ||
        body.payAmount ||
        body.pay_amount ||
        result.amount ||
        result.totalAmount ||
        result.total_amount ||
        result.payAmount ||
        result.pay_amount ||
        0
      ),
    paidAt: String(data.paidAt || data.paid_at || data.successTime || data.success_time || data.notifyTime || data.notify_time || body.paidAt || body.paid_at || body.successTime || body.success_time || body.notifyTime || body.notify_time || result.paidAt || result.paid_at || result.successTime || result.success_time || result.notifyTime || result.notify_time || new Date().toISOString()).trim(),
    raw: body,
  };
}

export async function queryXPayOrder({ orderId }) {
  const conf = readQueryConfig();
  if (!conf.url) {
    return { error: "XPay 查询接口未配置" };
  }

  try {
    const template = String(conf.url || "");
    const resolvedUrl = template
      .replaceAll("{orderId}", encodeURIComponent(orderId))
      .replaceAll("{id}", encodeURIComponent(orderId))
      .replaceAll(":orderId", encodeURIComponent(orderId))
      .replaceAll(":id", encodeURIComponent(orderId));
    const url = new URL(resolvedUrl);
    const init = { method: conf.method, headers: { "content-type": "application/json" } };
    const hasPathPlaceholder = /(\{orderId\}|\{id\}|:orderId|:id)/.test(template);
    if (conf.method === "GET" && !hasPathPlaceholder) {
      url.searchParams.set(conf.orderParam, orderId);
    } else if (conf.method !== "GET" && !hasPathPlaceholder) {
      init.body = JSON.stringify({ [conf.orderParam]: orderId });
    }

    const res = await fetch(url, init);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { rawText: text };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { error: error?.message || "XPay 查询接口请求失败" };
  }
}
