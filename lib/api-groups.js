import { hasDatabase, query } from "./db";
import { compareApiGroups, getApiGroupTier, sortApiGroups } from "./api-groups-order";

const DEFAULT_API_GROUPS = [
  {
    id: "default",
    name: "default",
    displayName: "默认",
    sortOrder: 0,
    billingMultiplier: 0.68,
    description: "默认线路，接入你的 sub2api 配置。",
    available: true,
    recommended: true,
    discountStackable: true,
    supportedModels: [],
    status: "active",
    newApiGroup: process.env.SUB2API_NEW_API_GROUP || process.env.NEW_API_DEFAULT_GROUP || process.env.NEW_API_EXECUTION_GROUP || "default",
    channelStrategy: "sub2api",
  },
  {
    id: "official",
    name: "official",
    displayName: "备用1",
    sortOrder: 10,
    billingMultiplier: 0.88,
    description: "aicards.shop 备用线路，作为默认线路后的第一备用。",
    available: true,
    recommended: false,
    discountStackable: false,
    supportedModels: [],
    status: "active",
    newApiGroup: process.env.NEW_API_AICARDS_GROUP || process.env.NEW_API_OFFICIAL_GROUP || process.env.NEW_API_DEFAULT_GROUP || "aicards",
    channelStrategy: "backup_1",
  },
  {
    id: "azure",
    name: "azure",
    displayName: "备用2",
    sortOrder: 20,
    billingMultiplier: 0.5,
    description: "其他中转站备用线路。",
    available: true,
    recommended: false,
    discountStackable: true,
    supportedModels: [],
    status: "active",
    newApiGroup: process.env.NEW_API_BACKUP_2_GROUP || process.env.NEW_API_AZURE_GROUP || "backup-2",
    channelStrategy: "backup_2",
  },
  {
    id: "bridge",
    name: "bridge",
    displayName: "备用3",
    sortOrder: 9999,
    billingMultiplier: 0.1,
    description: "OpenRouter 兜底线路。",
    available: true,
    recommended: false,
    discountStackable: true,
    supportedModels: [],
    status: "limited",
    newApiGroup: process.env.OPENROUTER_NEW_API_GROUP || process.env.NEW_API_BRIDGE_GROUP || "openrouter",
    channelStrategy: "backup_3",
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
  const defaultSortOrder = {
    default: 0,
    official: 10,
    azure: 20,
    bridge: 9999,
  };
  const explicitSortOrder = Number(input.sortOrder ?? input.sort_order);
  return {
    id,
    name: String(input.name || id).trim() || id,
    displayName: String(input.displayName || input.display_name || input.name || id).trim() || id,
    sortOrder: Number.isFinite(explicitSortOrder) ? explicitSortOrder : (defaultSortOrder[id] ?? 100),
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
  return sortApiGroups(Array.from(map.values()));
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
    try {
      const result = await query("SELECT id, data FROM api_group_configs ORDER BY id");
      groups = (result?.rows || []).map((row) => ({ id: row.id, ...(row.data || {}) }));
    } catch (error) {
      console.warn("[api-groups] falling back to memory store after db query failure:", error?.message || error);
      groups = memoryStore().groups;
    }
  } else {
    groups = memoryStore().groups;
  }
  return hydrateDefaults(groups).filter((group) => includeUnavailable || group.available);
}

export async function getApiGroup(groupId) {
  const groups = await listApiGroups({ includeUnavailable: true });
  const id = String(groupId || "").trim().toLowerCase();
  return groups.find((group) => group.id === id || group.name === id)
    || groups.find((group) => group.id === "default" && group.available)
    || groups.find((group) => group.recommended && group.available)
    || groups[0]
    || null;
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
