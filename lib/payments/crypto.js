import crypto from "node:crypto";
import { getSettings } from "../admin-store.js";

const NETWORK_MAP = {
  tron: "tron",
  trc: "tron",
  trc20: "tron",
  trx: "tron",
  polygon: "polygon",
  matic: "polygon",
  poly: "polygon",
  ethereum: "ethereum",
  erc20: "ethereum",
  eth: "ethereum",
};

const TOKEN_MAP = {
  usdt: "usdt",
  usdc: "usdc",
};

const SUPPORTED_CRYPTO_PAYMENTS = [
  { token: "usdt", network: "tron" },
  { token: "usdt", network: "ethereum" },
  { token: "usdc", network: "ethereum" },
  { token: "usdc", network: "polygon" },
];

const CRYPTO_CNY_PER_USD = 7;

export function calculateCryptoUsdAmount(amountCny) {
  const value = Number(amountCny);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / CRYPTO_CNY_PER_USD);
}

function readCryptoConfigSource(settings = {}) {
  return {
    enabled: settings.gmwalletEnabled != null
      ? Boolean(settings.gmwalletEnabled)
      : String(process.env.GMWALLET_ENABLED || "").toLowerCase() === "true",
    mode: String(settings.gmwalletMode || process.env.GMWALLET_MODE || "gmpay").trim() || "gmpay",
    baseUrl: String(settings.gmwalletBaseUrl || process.env.GMWALLET_BASE_URL || process.env.EPUSDT_BASE_URL || "").trim(),
    pid: String(settings.gmwalletPid || process.env.GMWALLET_PID || process.env.EPUSDT_PID || "").trim(),
    secretKey: String(settings.gmwalletSecretKey || process.env.GMWALLET_SECRET_KEY || process.env.EPUSDT_SECRET_KEY || "").trim(),
    currency: String(settings.gmwalletCurrency || process.env.GMWALLET_CURRENCY || "cny").trim().toLowerCase() || "cny",
    token: String(settings.gmwalletToken || process.env.GMWALLET_TOKEN || "usdt").trim().toLowerCase() || "usdt",
    network: String(settings.gmwalletNetwork || process.env.GMWALLET_NETWORK || "tron").trim().toLowerCase() || "tron",
    notifyUrl: String(settings.gmwalletNotifyUrl || process.env.GMWALLET_NOTIFY_URL || process.env.EPUSDT_NOTIFY_URL || "").trim(),
    returnUrl: String(settings.gmwalletReturnUrl || process.env.GMWALLET_RETURN_URL || process.env.EPUSDT_RETURN_URL || "").trim(),
    directCheckout: settings.gmwalletDirectCheckout != null
      ? Boolean(settings.gmwalletDirectCheckout)
      : String(process.env.GMWALLET_DIRECT_CHECKOUT || "true").toLowerCase() !== "false",
  };
}

function buildMissingFields(conf = {}) {
  const missing = [];
  if (!conf.enabled) return missing;
  if (!conf.baseUrl) missing.push("缺少 GMWallet Base URL");
  if (!conf.pid) missing.push("缺少 GMWallet 商户 PID");
  if (!conf.secretKey) missing.push("缺少 GMWallet Secret Key");
  if (!conf.notifyUrl) missing.push("缺少 GMWallet 回调地址");
  if (!conf.currency || !conf.token || !conf.network) missing.push("缺少默认收款网络或币种");
  return missing;
}

function normalizeCryptoConfig(settings = {}) {
  const normalized = readCryptoConfigSource(settings);
  const missingFields = buildMissingFields(normalized);
  return {
    ...normalized,
    missingFields,
    configured: Boolean(normalized.enabled) && missingFields.length === 0,
  };
}

export async function getCryptoConfig() {
  try {
    const settings = await getSettings();
    return normalizeCryptoConfig(settings || {});
  } catch {
    return normalizeCryptoConfig({});
  }
}

function normalizeToken(token = "") {
  return TOKEN_MAP[String(token || "").trim().toLowerCase()] || "";
}

function normalizeNetwork(network = "") {
  return NETWORK_MAP[String(network || "").trim().toLowerCase()] || "";
}

function buildSignature(params = {}, secretKey = "") {
  const payload = Object.keys(params)
    .filter((key) => key !== "signature" && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHash("md5").update(`${payload}${secretKey}`, "utf8").digest("hex");
}

async function readJsonSafe(response) {
  return response.json().catch(() => ({}));
}

function extractCheckoutPayload(payload = {}) {
  const data = payload?.data || payload;
  const rawExpiresAt = data?.expiration_time || data?.expires_at || data?.expire_at || null;
  const expiresAt =
    typeof rawExpiresAt === "number"
      ? new Date(rawExpiresAt < 1e12 ? rawExpiresAt * 1000 : rawExpiresAt).toISOString()
      : rawExpiresAt;
  return {
    tradeId: String(data?.trade_id || data?.tradeId || "").trim(),
    orderId: String(data?.order_id || data?.orderId || "").trim(),
    paymentUrl: String(data?.payment_url || data?.paymentUrl || "").trim(),
    token: String(data?.token || "").trim().toUpperCase(),
    network: String(data?.network || "").trim(),
    receiveAddress: String(
      data?.receive_address ||
      data?.receiveAddress ||
      data?.pay_address ||
      data?.payAddress ||
      data?.payment_address ||
      data?.paymentAddress ||
      data?.address ||
      data?.to_address ||
      data?.toAddress ||
      ""
    ).trim(),
    actualAmount: Number(
      data?.actual_amount ||
      data?.actualAmount ||
      data?.pay_amount ||
      data?.payAmount ||
      data?.token_amount ||
      data?.tokenAmount ||
      data?.crypto_amount ||
      data?.cryptoAmount ||
      0
    ),
    expiresAt,
    raw: data,
  };
}

async function fetchCheckoutCounter(baseUrl, tradeId) {
  if (!tradeId) return { ok: false, error: "缺少网关交易号" };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/pay/checkout-counter-resp/${encodeURIComponent(tradeId)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const data = await readJsonSafe(response);
  if (!response.ok) {
    return { ok: false, error: data?.message || data?.error || "获取收银台信息失败" };
  }
  return { ok: true, data: extractCheckoutPayload(data) };
}

export async function isCryptoConfigured() {
  const conf = await getCryptoConfig();
  return Boolean(conf.configured);
}

export async function createEpusdtPayment({
  order,
  amountCny,
  customerId,
  token,
  network,
}) {
  const conf = await getCryptoConfig();
  if (!conf.enabled) {
    return { error: "GMWallet 自动收银台未启用", gateway: getCryptoConfigSafe(conf) };
  }
  if (conf.missingFields.length) {
    return {
      error: conf.missingFields.join("、"),
      missingFields: conf.missingFields,
      gateway: getCryptoConfigSafe(conf),
    };
  }

  const payCurrency = normalizeToken(token);
  const payNetwork = normalizeNetwork(network);
  if (!payCurrency || !payNetwork) {
    return { error: "请选择正确的加密货币和链网络" };
  }
  const usdAmount = calculateCryptoUsdAmount(amountCny);

  const params = {
    pid: conf.pid,
    amount: usdAmount,
    order_id: order.outTradeNo,
    currency: payCurrency,
    token: payCurrency,
    network: payNetwork,
    notify_url: conf.notifyUrl,
    redirect_url: conf.returnUrl,
    name: `FlowAPI 充值 ¥${Number(amountCny).toFixed(2)}`,
  };

  const signature = buildSignature(params, conf.secretKey);
  const endpoint = `${conf.baseUrl.replace(/\/$/, "")}/payments/gmpay/v1/order/create-transaction`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ...params, signature }),
  });
  const data = await readJsonSafe(response);
  if (!response.ok) {
    return { error: data?.message || data?.error || "GMWallet 创建订单失败" };
  }

  const created = extractCheckoutPayload(data);
  if (!created.tradeId) {
    return { error: "支付网关未返回交易流水号" };
  }

  const checkoutResp = created.paymentUrl ? { ok: true, data: created } : await fetchCheckoutCounter(conf.baseUrl, created.tradeId);
  const checkout = checkoutResp.ok ? checkoutResp.data : created;
  const checkoutUrl = checkout.paymentUrl || created.paymentUrl || "";
  if (!checkoutUrl) {
    return { error: "支付网关未返回收银台链接" };
  }

  return {
    success: true,
    ok: true,
    provider: "gmwallet",
    mode: "gmpay",
    orderNo: order.outTradeNo,
    checkoutUrl,
    payment_url: checkoutUrl,
    gatewayOrderNo: created.tradeId,
    tradeId: created.tradeId,
    orderId: created.orderId || order.outTradeNo,
    receiveAddress: checkout.receiveAddress || "",
    actualAmount: checkout.actualAmount || usdAmount,
    amountUsd: usdAmount,
    token: (checkout.token || token || "").toUpperCase(),
    network: checkout.network || network || "",
    expiresAt: checkout.expiresAt || null,
    directCheckout: Boolean(conf.directCheckout),
    raw: {
      create: data,
      checkout: checkout.raw || {},
    },
  };
}

export async function queryEpusdtOrder({ tradeId, outTradeNo }) {
  const conf = await getCryptoConfig();
  if (!conf.enabled) return { error: "GMWallet 自动收银台未启用" };
  if (conf.missingFields.length) return { error: conf.missingFields.join("、") };
  if (!tradeId) return { error: outTradeNo ? "当前订单缺少网关交易号，请重新发起支付" : "缺少订单查询参数" };

  const endpoint = `${conf.baseUrl.replace(/\/$/, "")}/pay/check-status/${encodeURIComponent(tradeId)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const data = await readJsonSafe(response);
  if (!response.ok) return { error: data?.message || data?.error || "订单查询失败" };

  return { data };
}

export function isEpusdtPaid(payload = {}) {
  const data = payload?.data || payload;
  if (Number(data?.status) === 2) return true;
  const candidates = [
    data?.status,
    data?.trade_status,
    data?.payment_status,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (data?.paid === true || data?.is_paid === true) return true;
  return candidates.some((value) => ["paid", "success", "succeeded", "completed", "confirmed", "finished"].includes(value));
}

export async function verifyEpusdtNotifySignature(_rawBody, _headers = {}, body = {}, config = null) {
  const conf = config && typeof config === "object" ? config : await getCryptoConfig();
  if (!conf.secretKey) return process.env.NODE_ENV !== "production";

  const payload = body?.data || body;
  const provided = String(payload?.signature || payload?.sign || "").trim().toLowerCase();
  if (!provided) return false;

  const source = { ...payload };
  delete source.signature;
  delete source.sign;

  const expected = buildSignature(source, conf.secretKey).toLowerCase();
  return expected === provided;
}

export function getCryptoConfigSafe(conf = null) {
  const resolved = conf && typeof conf === "object" ? conf : readCryptoConfigSource();
  const missingFields = buildMissingFields(resolved);
  return {
    configured: Boolean(resolved.enabled) && missingFields.length === 0,
    enabled: Boolean(resolved.enabled),
    mode: resolved.mode || "gmpay",
    baseUrl: resolved.baseUrl || "",
    pidConfigured: Boolean(resolved.pid),
    secretConfigured: Boolean(resolved.secretKey),
    currency: resolved.currency || "cny",
    token: resolved.token || "usdt",
    network: resolved.network || "tron",
    notifyUrl: resolved.notifyUrl || "",
    returnUrl: resolved.returnUrl || "",
    directCheckout: resolved.directCheckout !== false,
    missingFields,
  };
}

export function normalizeCryptoSelection({ token, network }) {
  return {
    token: normalizeToken(token),
    network: normalizeNetwork(network),
  };
}

export function isSupportedCryptoPayment({ token, network } = {}) {
  const selected = normalizeCryptoSelection({ token, network });
  return SUPPORTED_CRYPTO_PAYMENTS.some(
    (item) => item.token === selected.token && item.network === selected.network
  );
}

export function getManualCryptoWallet({ token, network } = {}) {
  const selected = normalizeCryptoSelection({ token, network });
  const key = `${selected.token}:${selected.network}`;
  const wallets = {
    "usdt:tron": {
      token: "USDT",
      network: "TRON",
      address: "TJeTTxyTnvhmMMyGU9EUBmQwbjHhjgENeY",
    },
    "usdt:ethereum": {
      token: "USDT",
      network: "Ethereum",
      address: "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12",
    },
    "usdc:ethereum": {
      token: "USDC",
      network: "Ethereum",
      address: "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12",
    },
    "usdc:polygon": {
      token: "USDC",
      network: "Polygon",
      address: "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12",
    },
  };
  return wallets[key] || null;
}
