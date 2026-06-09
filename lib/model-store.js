/**
 * Model product config and upstream model store.
 * Supports both PostgreSQL (via lib/db.js) and in-memory fallback.
 */
import { hasDatabase, query } from "./db.js";

function memoryStore() {
  if (!globalThis.__MODEL_STORE__) {
    globalThis.__MODEL_STORE__ = {
      modelConfigs: {},
      upstreamModels: [],
    };
  }
  return globalThis.__MODEL_STORE__;
}

// ==================== Model Products Config ====================

export async function getModelConfig(productId) {
  if (!productId) return null;
  if (hasDatabase()) {
    const r = await query("SELECT data FROM model_products_config WHERE id = $1", [productId]);
    return r?.rows?.[0]?.data || null;
  }
  return memoryStore().modelConfigs[productId] || null;
}

export async function getAllModelConfigs() {
  if (hasDatabase()) {
    const r = await query("SELECT id, data FROM model_products_config");
    const configs = {};
    if (r?.rows) {
      for (const row of r.rows) {
        configs[row.id] = row.data;
      }
    }
    return configs;
  }
  return { ...memoryStore().modelConfigs };
}

export async function saveModelConfig(productId, config) {
  if (!productId) return null;
  const data = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  if (hasDatabase()) {
    await query(
      `INSERT INTO model_products_config (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [productId, JSON.stringify(data)]
    );
  } else {
    memoryStore().modelConfigs[productId] = data;
  }
  return data;
}

export async function updateModelConfig(productId, updates) {
  const existing = (await getModelConfig(productId)) || {};
  return saveModelConfig(productId, { ...existing, ...updates });
}

// ==================== Upstream Models ====================

export async function saveUpstreamModels(models) {
  if (!Array.isArray(models) || models.length === 0) return [];

  const now = new Date().toISOString();

  if (hasDatabase()) {
    for (const m of models) {
      await query(
        `INSERT INTO upstream_models (id, provider, upstream_channel, actual_model_id, display_name, is_detected, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
           provider = $2, upstream_channel = $3, actual_model_id = $4,
           display_name = $5, is_detected = $6, last_synced_at = NOW()`,
        [
          m.id || `up_${m.actual_model_id}`,
          m.provider || "",
          m.upstreamChannel || m.upstream_channel || "uniapi",
          m.actualModelId || m.actual_model_id || "",
          m.displayName || m.display_name || "",
          m.isDetected !== false,
        ]
      );
    }
  } else {
    const store = memoryStore();
    for (const m of models) {
      const id = m.id || `up_${m.actualModelId || m.actual_model_id}`;
      const idx = store.upstreamModels.findIndex((u) => u.id === id);
      const entry = {
        id,
        provider: m.provider || "",
        upstreamChannel: m.upstreamChannel || m.upstream_channel || "uniapi",
        actualModelId: m.actualModelId || m.actual_model_id || "",
        displayName: m.displayName || m.display_name || "",
        isDetected: m.isDetected !== false,
        lastSyncedAt: now,
      };
      if (idx >= 0) {
        store.upstreamModels[idx] = entry;
      } else {
        store.upstreamModels.push(entry);
      }
    }
  }
  return models;
}

export async function listUpstreamModels({ provider, channel } = {}) {
  if (hasDatabase()) {
    const conditions = [];
    const params = [];
    if (provider) { params.push(provider); conditions.push(`provider = $${params.length}`); }
    if (channel) { params.push(channel); conditions.push(`upstream_channel = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const r = await query(`SELECT * FROM upstream_models ${where} ORDER BY display_name`, params);
    return (r?.rows || []).map(rowToUpstreamModel);
  }
  let models = memoryStore().upstreamModels;
  if (provider) models = models.filter((m) => m.provider === provider);
  if (channel) models = models.filter((m) => m.upstreamChannel === channel);
  return models;
}

export async function clearUpstreamModels(channel) {
  if (hasDatabase()) {
    if (channel) {
      await query("DELETE FROM upstream_models WHERE upstream_channel = $1", [channel]);
    } else {
      await query("DELETE FROM upstream_models");
    }
  } else {
    const store = memoryStore();
    if (channel) {
      store.upstreamModels = store.upstreamModels.filter((m) => m.upstreamChannel !== channel);
    } else {
      store.upstreamModels = [];
    }
  }
}

function rowToUpstreamModel(row) {
  return {
    id: row.id,
    provider: row.provider || "",
    upstreamChannel: row.upstream_channel || "",
    actualModelId: row.actual_model_id || "",
    displayName: row.display_name || "",
    isDetected: row.is_detected !== false,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
  };
}
