import { hasDatabase, query } from "./db.js";

function adminStore() {
  if (!globalThis.__TOKEN_ROUTER_ADMIN__) {
    globalThis.__TOKEN_ROUTER_ADMIN__ = {
      channels: [
        { id: "ch_01", name: "DeepSeek 官方", provider: "DeepSeek", type: "OpenAI 兼容", baseUrl: "https://api.deepseek.com", path: "/v1", apiKey: "sk-ds-****", models: ["deepseek-chat", "deepseek-reasoner"], weight: 10, timeout: 30, retry: true, fallback: "ch_03", costInput: 0.5, costOutput: 2.0, priceMultiplier: 2.0, status: "active" },
      ],
      routingRules: [
        { id: "rt_1", path: "/v1/chat/completions", strategy: "按权重分配", defaultModel: "deepseek-chat", timeout: 30, enabled: true },
        { id: "rt_2", path: "/v1/models", strategy: "固定渠道(DeepSeek)", defaultModel: "-", timeout: 10, enabled: true },
      ],
      billingConfig: {
        unit: "每 1M Token", minCharge: "0.0001", chargeOnFail: false, billingCycle: "每日 00:00 (UTC+8)", defaultMultiplier: 2.0, precision: 4,
      },
      modelPrices: [
        { model: "deepseek-chat", inputPrice: 1.0, outputPrice: 2.0, costInput: 0.5, costOutput: 1.0, multiplier: 2.0 },
        { model: "gpt-4o-mini", inputPrice: 1.08, outputPrice: 4.32, costInput: 0.8, costOutput: 2.88, multiplier: 1.5 },
      ],
      alertRules: [
        { id: "ar_1", name: "余额不足提醒", condition: "余额 < ¥10", action: "发送邮件 + 站内通知", enabled: true },
        { id: "ar_2", name: "大额消耗预警", condition: "单日消耗 > ¥100", action: "发送邮件", enabled: true },
      ],
      blacklist: [
        { id: "bl_1", type: "IP", value: "103.45.67.89", reason: "高频暴力调用", addedAt: "2026-05-15 14:22", status: "active" },
      ],
      riskRules: [
        { id: "rr_1", name: "单 IP 高频请求拦截", condition: "60秒内 > 120 次请求", action: "临时封禁 30 分钟", enabled: true },
        { id: "rr_2", name: "异常错误码连续触发封禁", condition: "5分钟内 429/500 > 50 次", action: "封禁 1 小时 + 通知", enabled: true },
      ],
      riskEvents: [
        { id: "ev_1", time: "2026-05-18 10:32:15", type: "高频请求", user: "Test Bot", detail: "IP 103.45.67.89 在 60 秒内发起 287 次请求", level: "high", handled: true },
      ],
      settings: {
        siteName: "FlowAPI", siteDomain: "flowapi.fun", apiBaseUrl: "https://flowapi.fun/v1",
        adminEmail: "admin@flowapi.fun", openRegistration: true, registerBonus: 5.00,
        defaultLevel: "Basic", minRecharge: 10,
        paymentChannels: ["微信支付", "支付宝", "淘宝激活码"],
        lowBalanceAlert: 5.00, lowBalanceAlertEmail: true,
        abnormalCallAlert: true, upstreamErrorAlert: true,
        logRetentionDays: 90, timezone: "Asia/Shanghai (UTC+8)",
      },
    };
  }
  return globalThis.__TOKEN_ROUTER_ADMIN__;
}

const genId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// ==================== Channels ====================

export async function listChannels() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_channels ORDER BY created_at DESC");
    return r ? r.rows.map((row) => row.data) : adminStore().channels;
  }
  return adminStore().channels;
}

export async function saveChannel(channel) {
  const store = adminStore();
  const idx = store.channels.findIndex((c) => c.id === channel.id);
  if (idx >= 0) {
    store.channels[idx] = channel;
  } else {
    store.channels.push({ ...channel, id: channel.id || genId("ch") });
  }
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_channels (id, data, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data = $2",
      [channel.id || store.channels[store.channels.length - 1].id, JSON.stringify(channel)]
    );
  }
  return channel;
}

export async function deleteChannel(id) {
  const store = adminStore();
  store.channels = store.channels.filter((c) => c.id !== id);
  if (hasDatabase()) await query("DELETE FROM admin_channels WHERE id = $1", [id]);
  return { ok: true };
}

// ==================== Routing Rules ====================

export async function listRoutingRules() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_routing ORDER BY created_at DESC");
    return r ? r.rows.map((row) => row.data) : adminStore().routingRules;
  }
  return adminStore().routingRules;
}

export async function saveRoutingRule(rule) {
  const store = adminStore();
  const idx = store.routingRules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) {
    store.routingRules[idx] = rule;
  } else {
    store.routingRules.push({ ...rule, id: rule.id || genId("rt") });
  }
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_routing (id, data, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data = $2",
      [rule.id || store.routingRules[store.routingRules.length - 1].id, JSON.stringify(rule)]
    );
  }
  return rule;
}

export async function deleteRoutingRule(id) {
  const store = adminStore();
  store.routingRules = store.routingRules.filter((r) => r.id !== id);
  if (hasDatabase()) await query("DELETE FROM admin_routing WHERE id = $1", [id]);
  return { ok: true };
}

// ==================== Billing ====================

export async function getBillingConfig() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'billing'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().billingConfig;
}

export async function saveBillingConfig(config) {
  adminStore().billingConfig = config;
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('billing', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(config)]
    );
  }
  return config;
}

export async function listModelPrices() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'modelPrices'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().modelPrices;
}

export async function saveModelPrices(prices) {
  adminStore().modelPrices = prices;
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('modelPrices', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(prices)]
    );
  }
  return prices;
}

export async function listAlertRules() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'alertRules'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().alertRules;
}

export async function saveAlertRule(rule) {
  const store = adminStore();
  const idx = store.alertRules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) {
    store.alertRules[idx] = rule;
  } else {
    store.alertRules.push({ ...rule, id: rule.id || genId("ar") });
  }
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('alertRules', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.alertRules)]
    );
  }
  return rule;
}

export async function deleteAlertRule(id) {
  const store = adminStore();
  store.alertRules = store.alertRules.filter((r) => r.id !== id);
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('alertRules', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.alertRules)]
    );
  }
  return { ok: true };
}

// ==================== Security ====================

export async function listBlacklist() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'blacklist'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().blacklist;
}

export async function addBlacklist(entry) {
  const store = adminStore();
  const newEntry = { ...entry, id: genId("bl"), addedAt: new Date().toISOString().replace("T", " ").slice(0, 19), status: "active" };
  store.blacklist.push(newEntry);
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('blacklist', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.blacklist)]
    );
  }
  return newEntry;
}

export async function removeBlacklist(id) {
  const store = adminStore();
  store.blacklist = store.blacklist.filter((b) => b.id !== id);
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('blacklist', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.blacklist)]
    );
  }
  return { ok: true };
}

export async function listRiskRules() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'riskRules'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().riskRules;
}

export async function saveRiskRule(rule) {
  const store = adminStore();
  const idx = store.riskRules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) {
    store.riskRules[idx] = rule;
  } else {
    store.riskRules.push({ ...rule, id: rule.id || genId("rr") });
  }
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('riskRules', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.riskRules)]
    );
  }
  return rule;
}

export async function deleteRiskRule(id) {
  const store = adminStore();
  store.riskRules = store.riskRules.filter((r) => r.id !== id);
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('riskRules', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.riskRules)]
    );
  }
  return { ok: true };
}

export async function listRiskEvents() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'riskEvents'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().riskEvents;
}

export async function updateRiskEvent(id, updates) {
  const store = adminStore();
  const idx = store.riskEvents.findIndex((e) => e.id === id);
  if (idx >= 0) {
    store.riskEvents[idx] = { ...store.riskEvents[idx], ...updates };
  }
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('riskEvents', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(store.riskEvents)]
    );
  }
  return store.riskEvents[idx] || null;
}

// ==================== Settings ====================

export async function getSettings() {
  if (hasDatabase()) {
    const r = await query("SELECT data FROM admin_config WHERE key = 'settings'");
    if (r && r.rows.length > 0) return r.rows[0].data;
  }
  return adminStore().settings;
}

export async function saveSettings(settings) {
  adminStore().settings = settings;
  if (hasDatabase()) {
    await query(
      "INSERT INTO admin_config (key, data, created_at) VALUES ('settings', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = $1",
      [JSON.stringify(settings)]
    );
  }
  return settings;
}

// ==================== Schema init ====================

export async function ensureAdminSchema() {
  if (!hasDatabase()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS admin_channels (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_routing (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
