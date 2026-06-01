import crypto from "node:crypto";

const NETWORK_MAP = {
  tron: "tron",
  trc20: "tron",
  polygon: "polygon",
  matic: "polygon",
  ethereum: "ethereum",
  erc20: "ethereum",
};

const TOKEN_MAP = {
  usdt: "usdt",
  usdc: "usdc",
};

function getCryptoConfig() {
  return {
    baseUrl: String(process.env.EPUSDT_BASE_URL || "").trim(),
    pid: String(process.env.EPUSDT_PID || process.env.GMWALLET_PID || "").trim(),
    secretKey: String(process.env.EPUSDT_SECRET_KEY || process.env.GMWALLET_SECRET_KEY || "").trim(),
    returnUrl: String(process.env.EPUSDT_RETURN_URL || "").trim(),
    notifyUrl: String(process.env.EPUSDT_NOTIFY_URL || "").trim(),
  };
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
    receiveAddress: String(data?.receive_address || data?.receiveAddress || "").trim(),
    actualAmount: Number(data?.actual_amount || data?.actualAmount || 0),
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

export function isCryptoConfigured() {
  const conf = getCryptoConfig();
  return Boolean(conf.baseUrl && conf.pid && conf.secretKey && conf.notifyUrl);
}

export async function createEpusdtPayment({
  order,
  amountCny,
  customerId,
  token,
  network,
}) {
  const conf = getCryptoConfig();
  if (!isCryptoConfigured()) {
    return { error: "GMWallet 支付网关暂未配置完成" };
  }

  const payCurrency = normalizeToken(token);
  const payNetwork = normalizeNetwork(network);
  if (!payCurrency || !payNetwork) {
    return { error: "请选择正确的加密货币和链网络" };
  }
  const usdAmount = Number((Number(amountCny) / 7.2).toFixed(2));

  const params = {
    pid: conf.pid,
    amount: usdAmount,
    order_id: order.outTradeNo,
    currency: "usd",
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

  const checkoutResp = await fetchCheckoutCounter(conf.baseUrl, created.tradeId);
  const checkout = checkoutResp.ok ? checkoutResp.data : created;

  return {
    provider: "gmwallet",
    gatewayOrderNo: created.tradeId,
    tradeId: created.tradeId,
    orderId: created.orderId || order.outTradeNo,
    checkoutUrl: checkout.paymentUrl || created.paymentUrl || "",
    receiveAddress: checkout.receiveAddress || "",
    actualAmount: checkout.actualAmount || 0,
    token: (checkout.token || token || "").toUpperCase(),
    network: checkout.network || network || "",
    expiresAt: checkout.expiresAt || null,
    raw: {
      create: data,
      checkout: checkout.raw || {},
    },
  };
}

export async function queryEpusdtOrder({ tradeId, outTradeNo }) {
  const conf = getCryptoConfig();
  if (!isCryptoConfigured()) return { error: "GMWallet 支付网关暂未配置完成" };
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

export function verifyEpusdtNotifySignature(_rawBody, _headers = {}, body = {}) {
  const conf = getCryptoConfig();
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

export function getCryptoConfigSafe() {
  const conf = getCryptoConfig();
  return {
    configured: isCryptoConfigured(),
    baseUrl: conf.baseUrl || "",
    pidConfigured: Boolean(conf.pid),
    secretConfigured: Boolean(conf.secretKey),
  };
}

export function normalizeCryptoSelection({ token, network }) {
  return {
    token: normalizeToken(token),
    network: normalizeNetwork(network),
  };
}
