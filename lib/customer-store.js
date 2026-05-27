import crypto from "node:crypto";

const store = globalThis.__TOKEN_ROUTER_CUSTOMERS__ || {
  customers: [],
  apiKeys: [],
  calls: [],
  balanceEvents: [],
  activationCodes: [],
  notices: [],
  withdrawals: [],
  riskEvents: [],
};

globalThis.__TOKEN_ROUTER_CUSTOMERS__ = store;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function makeToken() {
  return `tr_${crypto.randomBytes(24).toString("base64url")}`;
}

function makeAccessToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function maskToken(token = "") {
  if (!token) {
    return "";
  }

  if (token.length <= 12) {
    return `${token.slice(0, 3)}****${token.slice(-3)}`;
  }

  return `${token.slice(0, 6)}****${token.slice(-4)}`;
}

function publicApiKey(key, includeSecret = false) {
  return {
    id: key.id,
    customerId: key.customerId,
    label: key.label,
    maskedToken: maskToken(key.token),
    token: includeSecret ? key.token : undefined,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

function publicCall(call) {
  return {
    ...call,
    totalTokens: Number(call.promptTokens || 0) + Number(call.completionTokens || 0),
  };
}

function publicBalanceEvent(event) {
  return { ...event };
}

function publicActivationCode(code) {
  return {
    ...code,
    code: code.code ? `${code.code.slice(0, 4)}****${code.code.slice(-4)}` : "",
  };
}

function buildCustomerMetrics(customerId) {
  const calls = store.calls.filter((call) => call.customerId === customerId);
  const balanceEvents = store.balanceEvents.filter((event) => event.customerId === customerId);
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const windowSpend = (since) => calls
    .filter((call) => new Date(call.createdAt || 0).getTime() >= since)
    .reduce((sum, call) => sum + Number(call.cost || 0), 0);

  const totalTokens = calls.reduce(
    (sum, call) => sum + Number(call.promptTokens || 0) + Number(call.completionTokens || 0),
    0,
  );

  const latestCall = calls[0] || null;
  const latestBalanceEvent = balanceEvents[0] || null;

  return {
    requestCount: calls.length,
    totalTokens,
    totalSpend: Number(calls.reduce((sum, call) => sum + Number(call.cost || 0), 0).toFixed(6)),
    todaySpend: Number(windowSpend(dayAgo).toFixed(6)),
    weekSpend: Number(windowSpend(weekAgo).toFixed(6)),
    monthSpend: Number(windowSpend(monthAgo).toFixed(6)),
    latestCallAt: latestCall?.createdAt || null,
    latestBalanceEventAt: latestBalanceEvent?.createdAt || null,
    lastModel: latestCall?.routedModel || latestCall?.requestedModel || null,
    lastStatus: latestCall?.status ?? null,
    hasData: calls.length > 0 || balanceEvents.length > 0,
    balanceEvents: balanceEvents.length,
  };
}

function publicCustomer(customer, includeAccessToken = false) {
  return {
    id: customer.id,
    phone: customer.phone,
    company: customer.company,
    balance: customer.balance,
    totalSpend: customer.totalSpend,
    agreedToTerms: customer.agreedToTerms,
    createdAt: customer.createdAt,
    accessToken: includeAccessToken ? customer.accessToken : undefined,
    metrics: buildCustomerMetrics(customer.id),
    apiKeys: store.apiKeys
      .filter((key) => key.customerId === customer.id)
      .map((key) => publicApiKey(key)),
    calls: store.calls
      .filter((call) => call.customerId === customer.id)
      .map(publicCall),
    balanceEvents: store.balanceEvents
      .filter((event) => event.customerId === customer.id)
      .map(publicBalanceEvent),
  };
}

export function loginCustomer({ phone = "", company = "", agreedToTerms = false }) {
  const cleanPhone = phone.trim() || "demo";
  const cleanCompany = company.trim() || "未命名客户";
  let customer = store.customers.find((item) => item.phone === cleanPhone);

  if (!customer) {
    if (!agreedToTerms) {
      throw new Error("请先勾选并同意用户协议");
    }
    customer = {
      id: makeId("cus"),
      phone: cleanPhone,
      company: cleanCompany,
      accessToken: makeAccessToken(),
      balance: 0,
      totalSpend: 0,
      agreedToTerms: true,
      createdAt: new Date().toISOString(),
    };
    store.customers.push(customer);
  } else if (company.trim()) {
    customer.company = cleanCompany;
  }

  if (!customer.accessToken) {
    customer.accessToken = makeAccessToken();
  }

  return publicCustomer(customer, true);
}

export function getCustomer(customerId = "") {
  const customer = store.customers.find((item) => item.id === customerId);
  return customer ? publicCustomer(customer) : null;
}

export function verifyCustomerAccess(customerId = "", accessToken = "") {
  const customer = store.customers.find((item) => item.id === customerId);

  if (!customer?.accessToken || !accessToken) {
    return false;
  }

  const expected = Buffer.from(customer.accessToken);
  const actual = Buffer.from(String(accessToken));

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createApiKey(customerId, label = "API Key") {
  const customer = store.customers.find((item) => item.id === customerId);

  if (!customer) {
    return null;
  }

  const key = {
    id: makeId("key"),
    customerId,
    token: makeToken(),
    label,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  store.apiKeys.push(key);
  return key;
}

export function createPublicApiKey(customerId, label = "API Key") {
  const key = createApiKey(customerId, label);
  return key ? publicApiKey(key, true) : null;
}

export function findCustomerByToken(token) {
  const apiKey = store.apiKeys.find((key) => key.token === token);

  if (!apiKey) {
    return null;
  }

  const customer = store.customers.find((item) => item.id === apiKey.customerId);

  if (!customer) {
    return null;
  }

  return { apiKey, customer };
}

export function rechargeCustomer(customerId, amount) {
  const value = Number(amount);
  const customer = store.customers.find((item) => item.id === customerId);

  if (!customer) {
    return null;
  }

  if (Number.isFinite(value) && value > 0) {
    customer.balance = Number((customer.balance + value).toFixed(4));
    store.balanceEvents.unshift({
      id: makeId("bal"),
      customerId: customer.id,
      type: "recharge",
      amount: value,
      balanceAfter: customer.balance,
      status: "到账",
      createdAt: new Date().toISOString(),
    });
    store.balanceEvents = store.balanceEvents.slice(0, 200);
  }

  return publicCustomer(customer);
}

export function redeemActivationCode(customerId, codeValue) {
  const customer = store.customers.find((item) => item.id === customerId);
  const code = store.activationCodes.find((item) => item.code === codeValue && item.status === "active");

  if (!customer || !code) {
    return null;
  }

  const amount = Number(code.amount || 0);
  customer.balance = Number((customer.balance + amount).toFixed(4));
  code.status = "redeemed";
  code.redeemedBy = customer.id;
  code.redeemedAt = new Date().toISOString();
  store.balanceEvents.unshift({
    id: makeId("bal"),
    customerId: customer.id,
    type: "redeem",
    amount,
    balanceAfter: customer.balance,
    status: "已兑换",
    source: "activation_code",
    code: code.code,
    createdAt: new Date().toISOString(),
  });
  store.balanceEvents = store.balanceEvents.slice(0, 200);

  return publicCustomer(customer);
}

export function adjustCustomerBalance(customerId, amount, reason = "manual_adjust") {
  const customer = store.customers.find((item) => item.id === customerId);

  if (!customer) {
    return null;
  }

  const value = Number(amount);

  if (!Number.isFinite(value) || value === 0) {
    return publicCustomer(customer);
  }

  customer.balance = Number((customer.balance + value).toFixed(4));
  store.balanceEvents.unshift({
    id: makeId("bal"),
    customerId: customer.id,
    type: value > 0 ? "adjust_in" : "adjust_out",
    amount: value,
    balanceAfter: customer.balance,
    status: value > 0 ? "已调增" : "已调减",
    source: reason,
    createdAt: new Date().toISOString(),
  });
  store.balanceEvents = store.balanceEvents.slice(0, 200);

  return publicCustomer(customer);
}

export function createActivationCode({ amount = 0, note = "" }) {
  const value = Number(amount);
  const code = {
    id: makeId("act"),
    code: `ACT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString(36).slice(-5).toUpperCase()}`,
    amount: Number.isFinite(value) ? Number(value.toFixed(2)) : 0,
    note,
    status: "active",
    createdAt: new Date().toISOString(),
    redeemedBy: null,
    redeemedAt: null,
  };

  store.activationCodes.unshift(code);
  store.activationCodes = store.activationCodes.slice(0, 100);

  return code;
}

export function recordCallByToken(token, record) {
  const match = findCustomerByToken(token);

  if (!match) {
    return null;
  }

  const cost = Number(record.cost || 0);
  match.apiKey.lastUsedAt = new Date().toISOString();
  match.customer.balance = Math.max(0, Number((match.customer.balance - cost).toFixed(6)));
  match.customer.totalSpend = Number((match.customer.totalSpend + cost).toFixed(6));
  if (cost > 0) {
    store.balanceEvents.unshift({
      id: makeId("bal"),
      customerId: match.customer.id,
      type: "consume",
      amount: -cost,
      balanceAfter: match.customer.balance,
      status: "已扣费",
      createdAt: new Date().toISOString(),
    });
    store.balanceEvents = store.balanceEvents.slice(0, 200);
  }

  store.calls.unshift({
    id: makeId("call"),
    customerId: match.customer.id,
    apiKeyId: match.apiKey.id,
    customer: match.customer.company,
    createdAt: new Date().toISOString(),
    ...record,
  });

  store.calls = store.calls.slice(0, 200);
  return publicCustomer(match.customer);
}

export function getDashboard(customerId = "") {
  return getCustomer(customerId);
}

export function getAdminSnapshot() {
  const modelStats = store.calls.reduce((acc, call) => {
    const model = call.routedModel || call.requestedModel || "unknown";
    const current = acc[model] || { model, calls: 0, tokens: 0, cost: 0, failures: 0 };
    current.calls += 1;
    current.tokens += Number(call.promptTokens || 0) + Number(call.completionTokens || 0);
    current.cost = Number((current.cost + Number(call.cost || 0)).toFixed(6));
    current.failures += Number(call.status || 0) >= 400 ? 1 : 0;
    acc[model] = current;
    return acc;
  }, {});

  return {
    customers: store.customers.map((customer) => publicCustomer(customer)),
    apiKeys: store.apiKeys.map((key) => publicApiKey(key)),
    calls: store.calls.map(publicCall),
    balanceEvents: store.balanceEvents.map(publicBalanceEvent),
    activationCodes: store.activationCodes.map(publicActivationCode),
    notices: [...store.notices],
    withdrawals: [...store.withdrawals],
    riskEvents: [...store.riskEvents],
    totals: {
      users: store.customers.length,
      apiKeys: store.apiKeys.length,
      calls: store.calls.length,
      balance: Number(store.customers.reduce((sum, customer) => sum + Number(customer.balance || 0), 0).toFixed(4)),
      spend: Number(store.customers.reduce((sum, customer) => sum + Number(customer.totalSpend || 0), 0).toFixed(6)),
      recharges: store.balanceEvents.filter((event) => event.type === "recharge").length,
      activationCodes: store.activationCodes.length,
    },
    modelStats: Object.values(modelStats).sort((a, b) => b.cost - a.cost),
  };
}
