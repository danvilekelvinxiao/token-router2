#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFileIfExists(path.join(repoRoot, ".env.production"));
loadEnvFileIfExists(path.join(repoRoot, ".env.local"));

const baseUrl = String(
  process.env.XIAOLEAI_BASE_URL
  || process.env.XIAOLEAI_API_BASE_URL
  || process.env.SUB2API_BASE_URL
  || "",
).trim().replace(/\/+$/, "");
const apiKeys = [
  process.env.XIAOLEAI_API_KEY,
  process.env.XIAOLEAI_API_KEY_SECONDARY,
  process.env.XIAOLEAI_KEY,
  process.env.XIAOLEAI_RUNTIME_KEY,
  process.env.SUB2API_API_KEY,
  process.env.SUB2API_API_KEY_SECONDARY,
  process.env.SUB2API_KEY,
  process.env.SUB2API_RUNTIME_KEY,
].map((value) => String(value || "").trim()).filter(Boolean);
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const adminId = process.env.FLOWAPI_DEPLOY_ADMIN_ID || "workbench-xiaoleai-sync";
const useSsl = process.env.DATABASE_SSL !== "false";

function mask(value = "") {
  const text = String(value || "");
  return text ? `${text.slice(0, 8)}...${text.slice(-4)}` : "(not set)";
}

function normalizeModelId(value = "") {
  return String(value || "").trim();
}

function inferModelType(modelId = "") {
  const id = normalizeModelId(modelId).toLowerCase();
  if (id.includes("image") || id.includes("imagen") || id.includes("flux") || id.includes("sdxl") || id.includes("seedream") || id.includes("recraft") || id.includes("ideogram")) return "image";
  if (id.includes("video") || id.includes("sora") || id.includes("kling")) return "video";
  if (id.includes("audio") || id.includes("tts") || id.includes("whisper")) return "audio";
  if (id.includes("embed")) return "embedding";
  return "text";
}

function inferProvider(modelId = "") {
  const id = normalizeModelId(modelId).toLowerCase();
  if (id.includes("claude")) return "Anthropic";
  if (id.includes("gemini")) return "Google";
  if (id.includes("deepseek")) return "DeepSeek";
  if (id.includes("grok")) return "xAI";
  if (id.includes("codex")) return "OpenAI";
  if (id.includes("gpt")) return "OpenAI";
  if (id.includes("image")) return "Image";
  return "Custom";
}

function buildPricing(modelId = "", modelType = "text") {
  const id = modelId.toLowerCase();
  if (modelType === "image") {
    const isCheap = id.includes("mini") || id.includes("flash");
    return {
      billingMode: "per_image_fixed_profit",
      imageCostPerImageCny: isCheap ? 0.08 : 0.12,
      imageFixedProfitPerImageCny: isCheap ? 0.12 : 0.18,
    };
  }
  if (id.includes("claude-opus") || id.includes("gpt-5.5")) {
    return { billingMode: "token_multiplier", inputCostPerMTokens: 18, outputCostPerMTokens: 90, inputSellPricePerMTokens: 36, outputSellPricePerMTokens: 180 };
  }
  if (id.includes("claude-sonnet") || id.includes("gpt-5.4") || id.includes("gpt-5.3-codex")) {
    return { billingMode: "token_multiplier", inputCostPerMTokens: 8, outputCostPerMTokens: 32, inputSellPricePerMTokens: 16, outputSellPricePerMTokens: 64 };
  }
  if (id.includes("gemini")) {
    return { billingMode: "token_multiplier", inputCostPerMTokens: 1.4, outputCostPerMTokens: 5.6, inputSellPricePerMTokens: 4, outputSellPricePerMTokens: 16 };
  }
  if (id.includes("grok")) {
    return { billingMode: "token_multiplier", inputCostPerMTokens: 4, outputCostPerMTokens: 16, inputSellPricePerMTokens: 8, outputSellPricePerMTokens: 32 };
  }
  if (id.includes("codex")) {
    return { billingMode: "token_multiplier", inputCostPerMTokens: 8, outputCostPerMTokens: 32, inputSellPricePerMTokens: 16, outputSellPricePerMTokens: 64 };
  }
  if (id.includes("deepseek")) {
    return { billingMode: "token_multiplier", inputCostPerMTokens: 1.45, outputCostPerMTokens: 5.77, inputSellPricePerMTokens: 3, outputSellPricePerMTokens: 12 };
  }
  return { billingMode: "token_multiplier", inputCostPerMTokens: 6, outputCostPerMTokens: 24, inputSellPricePerMTokens: 12, outputSellPricePerMTokens: 48 };
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upstream_models (
      id TEXT PRIMARY KEY,
      provider TEXT DEFAULT '',
      upstream_channel TEXT DEFAULT '',
      actual_model_id TEXT DEFAULT '',
      display_name TEXT DEFAULT '',
      is_detected BOOLEAN NOT NULL DEFAULT true,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS model_products_config (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS published_models (
      id TEXT PRIMARY KEY,
      imported_model_id TEXT DEFAULT '',
      model_id TEXT NOT NULL,
      upstream_model_id TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      logo TEXT NOT NULL DEFAULT '',
      model_type TEXT NOT NULL DEFAULT 'text',
      description TEXT DEFAULT '',
      tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      official_release_date TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 999,
      recommended BOOLEAN NOT NULL DEFAULT false,
      hot BOOLEAN NOT NULL DEFAULT false,
      free BOOLEAN NOT NULL DEFAULT false,
      member_only BOOLEAN NOT NULL DEFAULT false,
      black_gold_only BOOLEAN NOT NULL DEFAULT false,
      enabled BOOLEAN NOT NULL DEFAULT true,
      show_in_model_square BOOLEAN NOT NULL DEFAULT true,
      show_in_api_key_create BOOLEAN NOT NULL DEFAULT true,
      show_in_image_generation BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS model_pricing_configs (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      model_type TEXT NOT NULL DEFAULT 'text',
      billing_mode TEXT NOT NULL DEFAULT 'token_multiplier',
      input_cost_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      output_cost_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      cached_input_cost_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      input_sell_price_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      output_sell_price_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      cached_input_sell_price_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1,
      image_cost_per_image_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      image_fixed_profit_per_image_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      image_sell_price_per_image_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      video_cost_per_second_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      video_fixed_profit_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      video_sell_price_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      profit_margin NUMERIC(8, 4) NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function fetchRemoteModels() {
  const results = [];
  for (const apiKey of Array.from(new Set(apiKeys))) {
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json().catch(() => ({}));
    const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
    results.push({ apiKey, ok: res.ok, status: res.status, count: list.length, models: list });
  }
  const allModels = [];
  for (const item of results.filter((entry) => entry.ok && entry.count > 0)) {
    for (const model of item.models) {
      allModels.push({ ...model, __apiKey: item.apiKey });
    }
  }
  const dedup = new Map();
  for (const model of allModels) {
    const id = normalizeModelId(model.id || model.model || model.name || "");
    if (!id || dedup.has(id)) continue;
    dedup.set(id, model);
  }
  if (!dedup.size) {
    throw new Error(`xiaoleai /v1/models 不可用: ${results.map((item) => `HTTP ${item.status} count=${item.count}`).join("; ")}`);
  }
  return Array.from(dedup.values());
}

async function probeModel(modelId, apiKey) {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      stream: false,
    }),
  });
  const text = await res.text().catch(() => "");
  return {
    modelId,
    status: res.status,
    ok: res.ok,
    body: text.slice(0, 220),
  };
}

async function syncRuntime(pool, models) {
  for (const model of models) {
    const id = normalizeModelId(model.id || model.model || model.name || "");
    if (!id) continue;
    const modelType = inferModelType(id);
    const provider = inferProvider(id);
    const publicId = `flowapi-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
    const pricing = buildPricing(id, modelType);
    const tags = [provider, modelType].filter(Boolean);
    await pool.query(
      `INSERT INTO upstream_models (id, provider, upstream_channel, actual_model_id, display_name, is_detected, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (id) DO UPDATE SET
         provider=$2, upstream_channel=$3, actual_model_id=$4, display_name=$5, is_detected=$6, last_synced_at=NOW()`,
      [id, provider, "xiaoleai", id, model.name || id, true]
    );
    await pool.query(
      `INSERT INTO model_products_config (id, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
      [
        publicId,
        JSON.stringify({
          id: publicId,
          displayName: model.name || id,
          actualModelId: id,
          provider,
          group: modelType === "image" ? "image" : /claude|gpt|codex|gemini|deepseek|grok/i.test(id) ? "text-premium" : "default",
          executionGroup: "xiaoleai",
          planId: "xiaoleai",
          description: `Synced from xiaoleai upstream model ${id}.`,
          useCases: [provider, modelType].filter(Boolean),
          recommendedTools: ["CC-Switch", "Cursor", "Chatbox"],
          priceMultiplier: 1,
          isAvailable: true,
          isComingSoon: false,
          sortOrder: 100,
          provider,
          underlyingRoute: id,
          pricing,
        }),
      ]
    );
    await pool.query(
      `INSERT INTO published_models (
        id, imported_model_id, model_id, upstream_model_id, display_name, provider, logo, model_type,
        description, tags_json, official_release_date, sort_order, recommended, hot, free,
        member_only, black_gold_only, enabled, show_in_model_square, show_in_api_key_create, show_in_image_generation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (model_id) DO UPDATE SET
        upstream_model_id=$4, display_name=$5, provider=$6, logo=$7, model_type=$8, description=$9, tags_json=$10::jsonb,
        official_release_date=$11, sort_order=$12, recommended=$13, hot=$14, free=$15,
        member_only=$16, black_gold_only=$17, enabled=$18, show_in_model_square=$19,
        show_in_api_key_create=$20, show_in_image_generation=$21, updated_at=NOW()`,
      [
        `pub_${id}`,
        "",
        publicId,
        id,
        model.name || id,
        provider,
        provider,
        modelType,
        `Synced from xiaoleai upstream model ${id}.`,
        JSON.stringify(tags),
        "",
        100,
        true,
        /gpt|claude|codex|gemini|deepseek|grok/i.test(id),
        false,
        false,
        false,
        false,
        false,
        modelType === "image",
        false,
      ]
    );
    await pool.query(
      `INSERT INTO model_pricing_configs (
        id, model_id, display_name, provider, model_type, billing_mode,
        input_cost_per_m_tokens, output_cost_per_m_tokens, cached_input_cost_per_m_tokens,
        input_sell_price_per_m_tokens, output_sell_price_per_m_tokens, cached_input_sell_price_per_m_tokens,
        multiplier, image_cost_per_image_cny, image_fixed_profit_per_image_cny, image_sell_price_per_image_cny,
        video_cost_per_second_cny, video_fixed_profit_cny, video_sell_price_cny, currency, profit_margin, enabled
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (model_id) DO UPDATE SET
        display_name=$3, provider=$4, model_type=$5, billing_mode=$6,
        input_cost_per_m_tokens=$7, output_cost_per_m_tokens=$8, cached_input_cost_per_m_tokens=$9,
        input_sell_price_per_m_tokens=$10, output_sell_price_per_m_tokens=$11, cached_input_sell_price_per_m_tokens=$12,
        multiplier=$13, image_cost_per_image_cny=$14, image_fixed_profit_per_image_cny=$15,
        image_sell_price_per_image_cny=$16, video_cost_per_second_cny=$17, video_fixed_profit_cny=$18,
        video_sell_price_cny=$19, currency=$20, profit_margin=$21, enabled=$22, updated_at=NOW()`,
      [
        `price_${id}`,
        publicId,
        model.name || id,
        provider,
        modelType,
        pricing.billingMode,
        pricing.inputCostPerMTokens || 0,
        pricing.outputCostPerMTokens || 0,
        0,
        pricing.inputSellPricePerMTokens || 0,
        pricing.outputSellPricePerMTokens || 0,
        0,
        1,
        pricing.imageCostPerImageCny || 0,
        pricing.imageFixedProfitPerImageCny || 0,
        pricing.imageSellPricePerImageCny || 0,
        0,
        0,
        0,
        "CNY",
        0.3,
        true,
      ]
    );
  }
}

async function main() {
  console.log("==> xiaoleai sync/publish");
  console.log(JSON.stringify({ baseUrl, apiKeys: apiKeys.map(mask), adminId }, null, 2));
  if (!baseUrl) throw new Error("XIAOLEAI_BASE_URL / SUB2API_BASE_URL 未配置");
  if (!apiKeys.length) throw new Error("缺少 XIAOLEAI_API_KEY / XIAOLEAI_API_KEY_SECONDARY");
  if (!databaseUrl) throw new Error("DATABASE_URL / POSTGRES_URL 未配置");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 4,
    connectionTimeoutMillis: 5000,
  });

  try {
    await ensureSchema(pool);
    const models = await fetchRemoteModels();
    await syncRuntime(pool, models);
    const probeTargets = models
      .slice(0, Number(process.env.XIAOLEAI_PROBE_MAX_COUNT || 25))
      .map((model) => ({
        modelId: normalizeModelId(model.id || model.model || model.name || ""),
        apiKey: String(model.__apiKey || apiKeys[0] || "").trim(),
      }))
      .filter((item) => item.modelId && item.apiKey);
    const probeResults = [];
    for (const target of probeTargets) {
      probeResults.push(await probeModel(target.modelId, target.apiKey));
    }
    const failed = probeResults.filter((item) => !item.ok);
    console.log("==> health", JSON.stringify({
      total: probeResults.length,
      passed: probeResults.length - failed.length,
      failed: failed.length,
      samples: probeResults.slice(0, 5),
    }, null, 2));
    console.log("==> synced", JSON.stringify({ models: models.length, firstModel: probeTargets[0]?.modelId || "" }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
