import { hasDatabase, query } from "./db";

const DEFAULT_API_GROUPS = [
  {
    id: "default",
    name: "default",
    displayName: "默认",
    billingMultiplier: 0.68,
    description: "系统推荐的自动调度分组，适合大多数新手和常规客户。",
    available: true,
    recommended: true,
    discountStackable: true,
    supportedModels: [],
    status: "active",
    newApiGroup: process.env.NEW_API_DEFAULT_GROUP || process.env.NEW_API_EXECUTION_GROUP || "default",
    channelStrategy: "auto",
  },
  {
    id: "official",
    name: "official",
    displayName: "官方",
    billingMultiplier: 0.88,
    description: "优先走官方稳定通道，适合对稳定性和成功率更敏感的业务。",
    available: true,
    recommended: false,
    discountStackable: false,
    supportedModels: [],
    status: "active",
    newApiGroup: process.env.NEW_API_OFFICIAL_GROUP || process.env.NEW_API_DEFAULT_GROUP || "default",
    channelStrategy: "official",
  },
  {
    id: "azure",
    name: "azure",
    displayName: "Azure",
    billingMultiplier: 0.5,
    description: "适合需要 Azure 通道的客户，倍率更低但以后台实际可用模型为准。",
    available: true,
    recommended: false,
    discountStackable: true,
    supportedModels: [],
    status: "active",
    newApiGroup: process.env.NEW_API_AZURE_GROUP || "azure",
    channelStrategy: "azure",
  },
  {
    id: "bridge",
    name: "bridge",
    displayName: "Bridge",
    billingMultiplier: 0.1,
    description: "低成本桥接通道，适合测试和价格敏感客户。",
    available: true,
    recommended: false,
    discountStackable: true,
    supportedModels: [],
    status: "limited",
    newApiGroup: process.env.NEW_API_BRIDGE_GROUP || "bridge",
    channelStrategy: "bridge",
  },
];

function memoryStore() {
  if (!globalThis.__FLOWAPI_API_GROUP_STORE__) {
    globalThis.__FLOWAPI_API_GROUP_STORE__ = {
      groups: DEFAULT_API_GROUPS.map((group) => ({ ...group })),
    };
  }
  return globalThis.__FLOWAPI_API_GROUP_STORE__;
}

function normalizeSupportedModels(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGroup(input = {}) {
  const id = String(input.id || input.name || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const billingMultiplier = Number(input.billingMultiplier ?? input.billing_multiplier ?? 1);
  return {
    id,
    name: String(input.name || id).trim() || id,
    displayName: String(input.displayName || input.display_name || input.name || id).trim() || id,
    billingMultiplier: Number.isFinite(billingMultiplier) && billingMultiplier > 0 ? Number(billingMultiplier.toFixed(4)) : 1,
    description: String(input.description || "").trim(),
    available: input.available !== false && input.enabled !== false,
    recommended: Boolean(input.recommended),
    discountStackable: input.discountStackable !== false && input.discount_stackable !== false,
    supportedModels: normalizeSupportedModels(input.supportedModels ?? input.supported_models),
    status: String(input.status || (input.available === false ? "disabled" : "active")).trim() || "active",
    newApiGroup: String(input.newApiGroup || input.new_api_group || input.executionGroup || input.execution_group || input.id || "").trim(),
    channelStrategy: String(input.channelStrategy || input.channel_strategy || "auto").trim() || "auto",
    updatedAt: input.updatedAt || input.updated_at || new Date().toISOString(),
  };
}

function hydrateDefaults(groups = []) {
  const map = new Map(DEFAULT_API_GROUPS.map((group) => [group.id, normalizeGroup(group)]));
  groups.map(normalizeGroup).filter((group) => group.id).forEach((group) => map.set(group.id, group));
  return Array.from(map.values()).sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "zh-CN");
  });
}

export function modelSupportedByGroup(group, modelProduct) {
  if (!group || !modelProduct) return false;
  const supported = normalizeSupportedModels(group.supportedModels);
  if (supported.length === 0) return true;
  const aliases = [
    modelProduct.id,
    modelProduct.publicModelId,
    modelProduct.modelId,
    modelProduct.actualModelId,
    modelProduct.displayName,
  ].map((item) => String(item || "").toLowerCase()).filter(Boolean);
  return supported.some((item) => aliases.includes(String(item || "").toLowerCase()));
}

export function publicApiGroup(group, models = []) {
  const normalized = normalizeGroup(group);
  return {
    id: normalized.id,
    name: normalized.name,
    displayName: normalized.displayName,
    billingMultiplier: normalized.billingMultiplier,
    description: normalized.description,
    available: normalized.available,
    recommended: normalized.recommended,
    discountStackable: normalized.discountStackable,
    modelCount: normalized.supportedModels.length || models.length || 0,
    supportedModels: normalized.supportedModels,
    status: normalized.status,
  };
}

export async function listApiGroups({ includeUnavailable = true } = {}) {
  let groups = [];
  if (hasDatabase()) {
    const result = await query("SELECT id, data FROM api_group_configs ORDER BY id");
    groups = (result?.rows || []).map((row) => ({ id: row.id, ...(row.data || {}) }));
  } else {
    groups = memoryStore().groups;
  }
  return hydrateDefaults(groups).filter((group) => includeUnavailable || group.available);
}

export async function getApiGroup(groupId) {
  const groups = await listApiGroups({ includeUnavailable: true });
  const id = String(groupId || "").trim().toLowerCase();
  return groups.find((group) => group.id === id || group.name === id) || groups.find((group) => group.recommended && group.available) || groups[0] || null;
}

export async function upsertApiGroup(input = {}) {
  const group = normalizeGroup(input);
  if (!group.id) {
    const error = new Error("分组 ID 不能为空");
    error.code = "INVALID_API_GROUP";
    throw error;
  }
  if (!group.displayName) {
    const error = new Error("分组名称不能为空");
    error.code = "INVALID_API_GROUP";
    throw error;
  }
  if (!Number.isFinite(group.billingMultiplier) || group.billingMultiplier <= 0) {
    const error = new Error("倍率必须大于 0");
    error.code = "INVALID_API_GROUP";
    throw error;
  }

  if (hasDatabase()) {
    await query(
      `INSERT INTO api_group_configs (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [group.id, JSON.stringify(group)]
    );
  } else {
    const store = memoryStore();
    const index = store.groups.findIndex((item) => item.id === group.id);
    if (index >= 0) store.groups[index] = group;
    else store.groups.push(group);
  }
  return group;
}

export async function deleteApiGroup(groupId) {
  const id = String(groupId || "").trim().toLowerCase();
  if (!id || id === "default") return false;
  if (hasDatabase()) {
    await query("DELETE FROM api_group_configs WHERE id = $1", [id]);
  } else {
    const store = memoryStore();
    store.groups = store.groups.filter((group) => group.id !== id);
  }
  return true;
}

export function apiGroupLabel(group) {
  const normalized = normalizeGroup(group || DEFAULT_API_GROUPS[0]);
  return `${normalized.displayName} · ${normalized.billingMultiplier}x`;
}
