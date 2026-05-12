const initialKey = process.env.PROXY_ACCESS_TOKEN || "customer_token_001";

const store = globalThis.__TOKEN_ROUTER_CUSTOMERS__ || {
  customers: [
    {
      id: "cus_demo",
      phone: "demo",
      company: "Demo Customer",
      balance: 20,
      totalSpend: 0,
      createdAt: new Date().toISOString(),
    },
  ],
  apiKeys: [
    {
      id: "key_demo",
      customerId: "cus_demo",
      token: initialKey,
      label: "Default API Key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    },
  ],
  calls: [],
};

globalThis.__TOKEN_ROUTER_CUSTOMERS__ = store;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function makeToken() {
  return `tr_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function publicCustomer(customer) {
  return {
    ...customer,
    apiKeys: store.apiKeys.filter((key) => key.customerId === customer.id),
    calls: store.calls.filter((call) => call.customerId === customer.id),
  };
}

export function loginCustomer({ phone = "", company = "" }) {
  const cleanPhone = phone.trim() || "demo";
  const cleanCompany = company.trim() || "未命名客户";
  let customer = store.customers.find((item) => item.phone === cleanPhone);

  if (!customer) {
    customer = {
      id: makeId("cus"),
      phone: cleanPhone,
      company: cleanCompany,
      balance: 0,
      totalSpend: 0,
      createdAt: new Date().toISOString(),
    };
    store.customers.push(customer);
    createApiKey(customer.id, "Primary API Key");
  } else if (company.trim()) {
    customer.company = cleanCompany;
  }

  return publicCustomer(customer);
}

export function getCustomer(customerId = "cus_demo") {
  const customer = store.customers.find((item) => item.id === customerId) || store.customers[0];
  return publicCustomer(customer);
}

export function createApiKey(customerId, label = "API Key") {
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
  const customer = store.customers.find((item) => item.id === customerId) || store.customers[0];

  if (Number.isFinite(value) && value > 0) {
    customer.balance = Number((customer.balance + value).toFixed(4));
  }

  return publicCustomer(customer);
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

export function getDashboard(customerId = "cus_demo") {
  return getCustomer(customerId);
}
