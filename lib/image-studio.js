import { getCustomer, findCustomerByToken } from "@/lib/customer-store";
import { hasDatabase, query } from "@/lib/db";
import { getUpstreamConfigs } from "@/lib/upstream";
import { getClientIp } from "@/lib/security";

const DEFAULT_IMAGE_MODELS = [
  {
    id: "gpt-image-2",
    display_name: "GPT-5.4 Image 2",
    upstream_model: "openai/gpt-image-1",
    provider: "OpenAI",
    enabled: true,
    recommended: true,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 88,
    stability_score: 94,
    quality_score: 95,
    unit_price_token_text_to_image: 12.5,
    unit_price_token_image_to_image: 15.5,
    unit_price_rmb_text_to_image: 0.28,
    unit_price_rmb_image_to_image: 0.36,
    fallback_model_id: "flux-schnell",
    tags: ["推荐", "稳定", "高质量", "适合海报", "适合图生图"],
    scene_description: "默认推荐，适合大多数商业场景",
    sort_order: 10,
  },
  {
    id: "flux-pro",
    display_name: "Flux Pro",
    upstream_model: "black-forest-labs/flux-pro",
    provider: "Black Forest Labs",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 72,
    stability_score: 88,
    quality_score: 96,
    unit_price_token_text_to_image: 15,
    unit_price_token_image_to_image: 18,
    unit_price_rmb_text_to_image: 0.36,
    unit_price_rmb_image_to_image: 0.42,
    fallback_model_id: "flux-schnell",
    tags: ["高质量", "细节强", "适合电商", "适合产品图"],
    scene_description: "细节表现更强，适合商品、电商、海报",
    sort_order: 20,
  },
  {
    id: "flux-schnell",
    display_name: "Flux Schnell",
    upstream_model: "black-forest-labs/flux-schnell",
    provider: "Black Forest Labs",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 97,
    stability_score: 84,
    quality_score: 82,
    unit_price_token_text_to_image: 8.5,
    unit_price_token_image_to_image: 10.5,
    unit_price_rmb_text_to_image: 0.16,
    unit_price_rmb_image_to_image: 0.22,
    fallback_model_id: "sdxl",
    tags: ["速度快", "快速草图", "低成本"],
    scene_description: "响应最快，适合打样、批量测试、快速迭代",
    sort_order: 30,
  },
  {
    id: "sdxl",
    display_name: "SDXL",
    upstream_model: "stabilityai/sdxl",
    provider: "Stability",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 82,
    stability_score: 80,
    quality_score: 78,
    unit_price_token_text_to_image: 6.5,
    unit_price_token_image_to_image: 7.8,
    unit_price_rmb_text_to_image: 0.12,
    unit_price_rmb_image_to_image: 0.16,
    fallback_model_id: "flux-schnell",
    tags: ["经济", "入门", "批量友好"],
    scene_description: "成本更低，适合预算敏感型测试",
    sort_order: 40,
  },
  {
    id: "recraft",
    display_name: "Recraft",
    upstream_model: "recraft/recraft-v3",
    provider: "Recraft",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: false,
    supports_batch: true,
    speed_score: 78,
    stability_score: 85,
    quality_score: 90,
    unit_price_token_text_to_image: 11,
    unit_price_token_image_to_image: 11,
    unit_price_rmb_text_to_image: 0.24,
    unit_price_rmb_image_to_image: 0.24,
    fallback_model_id: "flux-schnell",
    tags: ["设计感强", "版式", "品牌图"],
    scene_description: "适合品牌视觉、KV、设计风格图",
    sort_order: 50,
  },
  {
    id: "ideogram",
    display_name: "Ideogram",
    upstream_model: "ideogram/ideogram-v3",
    provider: "Ideogram",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: false,
    supports_batch: true,
    speed_score: 74,
    stability_score: 86,
    quality_score: 89,
    unit_price_token_text_to_image: 10.8,
    unit_price_token_image_to_image: 10.8,
    unit_price_rmb_text_to_image: 0.22,
    unit_price_rmb_image_to_image: 0.22,
    fallback_model_id: "flux-schnell",
    tags: ["适合带文字海报", "封面", "营销图"],
    scene_description: "更适合带字体、标题、封面的图片任务",
    sort_order: 60,
  },
];

const QUALITY_MULTIPLIER = {
  standard: 1,
  hd: 1.6,
  ultra: 2.2,
};

const ASPECT_RATIO_TO_SIZE = {
  "1:1": "1024x1024",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "16:9": "1536x864",
  "9:16": "864x1536",
};

const imageStudioStore = globalThis.__FLOWAPI_IMAGE_STUDIO__ || {
  imageModels: DEFAULT_IMAGE_MODELS.map((item) => ({ ...item })),
  workspaces: [],
  workspaceMembers: [],
  imageLogs: [],
  apiUsageLogs: [],
  walletTransactions: [],
};

globalThis.__FLOWAPI_IMAGE_STUDIO__ = imageStudioStore;

let imageStudioInitPromise = null;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function roundMoney(value) {
  return Number(toNumber(value).toFixed(6));
}

function truncateText(value = "", max = 120) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getQualityMultiplier(quality = "standard") {
  return QUALITY_MULTIPLIER[String(quality || "standard").toLowerCase()] || 1;
}

function normalizeImageArray(images) {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof images === "string") {
    return [images.trim()].filter(Boolean);
  }
  return [];
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isFatalStatus(status) {
  return status === 400 || status === 401 || status === 402 || status === 403 || status === 404 || status === 413 || status === 422;
}

function canRetryImageResult(result = {}) {
  if (!result || result.ok) return false;
  if (result.errorCode === "UPSTREAM_NOT_CONFIGURED") return false;
  return isRetryableStatus(result.status) && !isFatalStatus(result.status);
}

function mapAspectRatioToSize(aspectRatio = "1:1") {
  return ASPECT_RATIO_TO_SIZE[aspectRatio] || ASPECT_RATIO_TO_SIZE["1:1"];
}

function isAdminCustomer(customer = {}) {
  const email = String(customer?.email || "").toLowerCase();
  return customer?.role === "admin" || customer?.id === "cus_admin" || email === "xiaoyijie@flowapi.fun";
}

async function ensureImageStudioSchema() {
  if (!hasDatabase()) return;
  if (!imageStudioInitPromise) {
    imageStudioInitPromise = query(`
      CREATE TABLE IF NOT EXISTS image_models (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'OpenRouter',
        enabled BOOLEAN NOT NULL DEFAULT true,
        recommended BOOLEAN NOT NULL DEFAULT false,
        supports_text_to_image BOOLEAN NOT NULL DEFAULT true,
        supports_image_to_image BOOLEAN NOT NULL DEFAULT false,
        supports_batch BOOLEAN NOT NULL DEFAULT false,
        speed_score INTEGER NOT NULL DEFAULT 0,
        stability_score INTEGER NOT NULL DEFAULT 0,
        quality_score INTEGER NOT NULL DEFAULT 0,
        unit_price_token_text_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price_token_image_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price_rmb_text_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price_rmb_image_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        fallback_model_id TEXT DEFAULT '',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        scene_description TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 999,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        balance NUMERIC(14, 6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        member_name TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS image_generation_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        request_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        model_display_name TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        upstream_provider TEXT NOT NULL DEFAULT 'OpenRouter',
        prompt TEXT DEFAULT '',
        prompt_preview TEXT DEFAULT '',
        input_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_thumbnail_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_image_count INTEGER NOT NULL DEFAULT 0,
        aspect_ratio TEXT DEFAULT '1:1',
        quality TEXT DEFAULT 'standard',
        token_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        money_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        error_source TEXT DEFAULT '',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        saved_to_history BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        request_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'POST',
        mode TEXT NOT NULL,
        model_display_name TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        upstream_provider TEXT NOT NULL DEFAULT 'OpenRouter',
        prompt_preview TEXT DEFAULT '',
        input_image_count INTEGER NOT NULL DEFAULT 0,
        output_image_count INTEGER NOT NULL DEFAULT 0,
        token_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        money_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        error_source TEXT DEFAULT '',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        request_id TEXT DEFAULT '',
        transaction_type TEXT NOT NULL,
        token_amount NUMERIC(14, 6) NOT NULL DEFAULT 0,
        money_amount NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        related_log_id TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by_user_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS assigned_user_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS visible_scope TEXT DEFAULT 'self';

      CREATE INDEX IF NOT EXISTS idx_image_models_enabled_sort ON image_models(enabled, sort_order);
      CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_image_logs_user_created ON image_generation_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_image_logs_workspace_created ON image_generation_logs(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_image_logs_request_id ON image_generation_logs(request_id);
      CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_created ON api_usage_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);
    `).then(syncDefaultImageModels);
  }
  await imageStudioInitPromise;
}

async function syncDefaultImageModels() {
  if (!hasDatabase()) return;
  for (const model of DEFAULT_IMAGE_MODELS) {
    await query(
      `INSERT INTO image_models (
        id, display_name, upstream_model, provider, enabled, recommended,
        supports_text_to_image, supports_image_to_image, supports_batch,
        speed_score, stability_score, quality_score,
        unit_price_token_text_to_image, unit_price_token_image_to_image,
        unit_price_rmb_text_to_image, unit_price_rmb_image_to_image,
        fallback_model_id, tags, scene_description, sort_order, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14,
        $15, $16,
        $17, $18::jsonb, $19, $20, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        upstream_model = EXCLUDED.upstream_model,
        provider = EXCLUDED.provider,
        recommended = EXCLUDED.recommended,
        supports_text_to_image = EXCLUDED.supports_text_to_image,
        supports_image_to_image = EXCLUDED.supports_image_to_image,
        supports_batch = EXCLUDED.supports_batch,
        speed_score = EXCLUDED.speed_score,
        stability_score = EXCLUDED.stability_score,
        quality_score = EXCLUDED.quality_score,
        unit_price_token_text_to_image = EXCLUDED.unit_price_token_text_to_image,
        unit_price_token_image_to_image = EXCLUDED.unit_price_token_image_to_image,
        unit_price_rmb_text_to_image = EXCLUDED.unit_price_rmb_text_to_image,
        unit_price_rmb_image_to_image = EXCLUDED.unit_price_rmb_image_to_image,
        fallback_model_id = EXCLUDED.fallback_model_id,
        tags = EXCLUDED.tags,
        scene_description = EXCLUDED.scene_description,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()`,
      [
        model.id,
        model.display_name,
        model.upstream_model,
        model.provider,
        model.enabled,
        model.recommended,
        model.supports_text_to_image,
        model.supports_image_to_image,
        model.supports_batch,
        model.speed_score,
        model.stability_score,
        model.quality_score,
        model.unit_price_token_text_to_image,
        model.unit_price_token_image_to_image,
        model.unit_price_rmb_text_to_image,
        model.unit_price_rmb_image_to_image,
        model.fallback_model_id,
        JSON.stringify(model.tags || []),
        model.scene_description,
        model.sort_order,
      ]
    );
  }
}

function mapImageModelRow(row = {}) {
  const provider = row.provider || "OpenRouter";
  const displayName = row.display_name || row.displayName;
  const tags = Array.isArray(row.tags) ? row.tags : typeof row.tags === "string" ? JSON.parse(row.tags || "[]") : [];
  const logoCode = provider.toLowerCase().includes("openai")
    ? "AI"
    : provider.toLowerCase().includes("black") || String(displayName || "").toLowerCase().includes("flux")
      ? "FX"
      : provider.toLowerCase().includes("stability") || String(displayName || "").toLowerCase().includes("sdxl")
        ? "SD"
        : provider.toLowerCase().includes("recraft")
          ? "RC"
          : provider.toLowerCase().includes("ideogram")
            ? "ID"
            : "IM";
  return {
    id: row.id,
    displayName,
    upstreamModel: row.upstream_model || row.upstreamModel,
    provider,
    logoCode,
    enabled: row.enabled !== false,
    recommended: Boolean(row.recommended),
    supportsTextToImage: row.supports_text_to_image !== false,
    supportsImageToImage: Boolean(row.supports_image_to_image),
    supportsBatch: Boolean(row.supports_batch),
    supportsMultiImage: Boolean(row.supports_image_to_image && row.supports_batch),
    supportsVideoInput: false,
    supportsFileInput: false,
    speedScore: Number(row.speed_score || 0),
    stabilityScore: Number(row.stability_score || 0),
    qualityScore: Number(row.quality_score || 0),
    unitPriceTokenTextToImage: Number(row.unit_price_token_text_to_image || 0),
    unitPriceTokenImageToImage: Number(row.unit_price_token_image_to_image || 0),
    unitPriceRmbTextToImage: Number(row.unit_price_rmb_text_to_image || 0),
    unitPriceRmbImageToImage: Number(row.unit_price_rmb_image_to_image || 0),
    fallbackModelId: row.fallback_model_id || "",
    tags,
    sceneDescription: row.scene_description || "",
    sortOrder: Number(row.sort_order || 999),
    labelTags: tags,
  };
}

function mapImageLogRow(row = {}) {
  const inputImages = Array.isArray(row.input_image_urls) ? row.input_image_urls : JSON.parse(row.input_image_urls || "[]");
  const outputImages = Array.isArray(row.output_image_urls) ? row.output_image_urls : JSON.parse(row.output_image_urls || "[]");
  const thumbnails = Array.isArray(row.output_thumbnail_urls) ? row.output_thumbnail_urls : JSON.parse(row.output_thumbnail_urls || "[]");
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    workspaceId: row.workspace_id || row.workspaceId,
    apiKeyId: row.api_key_id || row.apiKeyId || null,
    requestId: row.request_id || row.requestId,
    mode: row.mode,
    modelDisplayName: row.model_display_name || row.modelDisplayName,
    upstreamModel: row.upstream_model || row.upstreamModel,
    upstreamProvider: row.upstream_provider || row.upstreamProvider || "OpenRouter",
    prompt: row.prompt || "",
    promptPreview: row.prompt_preview || row.promptPreview || "",
    inputImageUrls: inputImages,
    outputImageUrls: outputImages,
    outputThumbnailUrls: thumbnails,
    outputImageCount: Number(row.output_image_count || row.outputImageCount || outputImages.length || 0),
    aspectRatio: row.aspect_ratio || "1:1",
    quality: row.quality || "standard",
    tokenCost: Number(row.token_cost || row.tokenCost || 0),
    moneyCost: Number(row.money_cost || row.moneyCost || 0),
    balanceBefore: Number(row.balance_before || row.balanceBefore || 0),
    balanceAfter: Number(row.balance_after || row.balanceAfter || 0),
    status: row.status || "success",
    errorCode: row.error_code || row.errorCode || "",
    errorMessage: row.error_message || row.errorMessage || "",
    errorSource: row.error_source || row.errorSource || "",
    latencyMs: Number(row.latency_ms || row.latencyMs || 0),
    retryCount: Number(row.retry_count || row.retryCount || 0),
    savedToHistory: row.saved_to_history !== false,
    metadata: row.metadata && typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : (row.metadata || {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || new Date().toISOString(),
  };
}

async function getCustomerBalanceRecord(customerId) {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  return {
    customer,
    balance: Number(customer.balance || 0),
  };
}

async function reserveCustomerBalance(customerId, reserveAmount) {
  const amount = roundMoney(reserveAmount);
  const beforeRecord = await getCustomerBalanceRecord(customerId);
  if (!beforeRecord) return { error: "用户不存在" };
  if (beforeRecord.balance < amount) {
    return {
      error: "余额不足，请先充值后再生成图片",
      balanceBefore: beforeRecord.balance,
    };
  }

  if (!hasDatabase()) {
    const memoryCustomer = globalThis.__TOKEN_ROUTER_CUSTOMERS__?.customers?.find((item) => item.id === customerId);
    if (!memoryCustomer) return { error: "用户不存在" };
    memoryCustomer.balance = roundMoney(Number(memoryCustomer.balance || 0) - amount);
    memoryCustomer.totalSpend = roundMoney(Number(memoryCustomer.totalSpend || 0) + amount);
    return {
      balanceBefore: beforeRecord.balance,
      balanceAfter: Number(memoryCustomer.balance || 0),
      reservedAmount: amount,
    };
  }

  const result = await query(
    `UPDATE customers
     SET balance = balance - $2,
         total_spend = total_spend + $2
     WHERE id = $1 AND balance >= $2
     RETURNING balance`,
    [customerId, amount]
  );
  if (!result.rows[0]) {
    return {
      error: "余额不足，请先充值后再生成图片",
      balanceBefore: beforeRecord.balance,
    };
  }
  return {
    balanceBefore: beforeRecord.balance,
    balanceAfter: Number(result.rows[0].balance || 0),
    reservedAmount: amount,
  };
}

async function settleCustomerBalance(customerId, reservedAmount, actualAmount) {
  const reserved = roundMoney(reservedAmount);
  const actual = roundMoney(actualAmount);
  const delta = roundMoney(actual - reserved);

  if (!hasDatabase()) {
    const memoryCustomer = globalThis.__TOKEN_ROUTER_CUSTOMERS__?.customers?.find((item) => item.id === customerId);
    if (!memoryCustomer) return { balanceAfter: 0, delta };
    if (delta < 0) {
      memoryCustomer.balance = roundMoney(Number(memoryCustomer.balance || 0) + Math.abs(delta));
      memoryCustomer.totalSpend = roundMoney(Math.max(0, Number(memoryCustomer.totalSpend || 0) - Math.abs(delta)));
    } else if (delta > 0) {
      memoryCustomer.balance = roundMoney(Number(memoryCustomer.balance || 0) - delta);
      memoryCustomer.totalSpend = roundMoney(Number(memoryCustomer.totalSpend || 0) + delta);
    }
    return { balanceAfter: Number(memoryCustomer.balance || 0), delta };
  }

  let result;
  if (delta < 0) {
    result = await query(
      `UPDATE customers
       SET balance = balance + $2,
           total_spend = GREATEST(0, total_spend - $2)
       WHERE id = $1
       RETURNING balance`,
      [customerId, Math.abs(delta)]
    );
  } else if (delta > 0) {
    result = await query(
      `UPDATE customers
       SET balance = balance - $2,
           total_spend = total_spend + $2
       WHERE id = $1
       RETURNING balance`,
      [customerId, delta]
    );
  } else {
    result = await query("SELECT balance FROM customers WHERE id = $1 LIMIT 1", [customerId]);
  }

  return {
    balanceAfter: Number(result.rows[0]?.balance || 0),
    delta,
  };
}

async function recordWalletTransaction(entry) {
  const payload = {
    id: makeId("wallet_tx"),
    userId: entry.userId,
    workspaceId: entry.workspaceId || null,
    requestId: entry.requestId || "",
    transactionType: entry.transactionType || "consume",
    tokenAmount: roundMoney(entry.tokenAmount || 0),
    moneyAmount: roundMoney(entry.moneyAmount || 0),
    balanceBefore: roundMoney(entry.balanceBefore || 0),
    balanceAfter: roundMoney(entry.balanceAfter || 0),
    relatedLogId: entry.relatedLogId || "",
    description: entry.description || "",
    createdAt: new Date().toISOString(),
  };

  if (!hasDatabase()) {
    imageStudioStore.walletTransactions.unshift(payload);
    return payload;
  }

  await query(
    `INSERT INTO wallet_transactions (
      id, user_id, workspace_id, request_id, transaction_type,
      token_amount, money_amount, balance_before, balance_after,
      related_log_id, description, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId,
      payload.requestId,
      payload.transactionType,
      payload.tokenAmount,
      payload.moneyAmount,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.relatedLogId,
      payload.description,
    ]
  );
  return payload;
}

async function upsertDefaultWorkspaceForUser(customer) {
  if (!customer?.id) return null;
  const workspaceName = customer.company || customer.name || `${String(customer.email || "FlowAPI").split("@")[0]} 团队空间`;

  if (!hasDatabase()) {
    let workspace = imageStudioStore.workspaces.find((item) => item.ownerUserId === customer.id);
    if (!workspace) {
      workspace = {
        id: makeId("ws"),
        name: workspaceName,
        ownerUserId: customer.id,
        balance: Number(customer.balance || 0),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      imageStudioStore.workspaces.push(workspace);
    }
    const existingMember = imageStudioStore.workspaceMembers.find((item) => item.workspaceId === workspace.id && item.userId === customer.id);
    if (!existingMember) {
      imageStudioStore.workspaceMembers.push({
        id: makeId("wsm"),
        workspaceId: workspace.id,
        userId: customer.id,
        role: "owner",
        memberName: customer.name || customer.email || "Owner",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    workspace.balance = Number(customer.balance || 0);
    return workspace;
  }

  await ensureImageStudioSchema();
  let workspaceResult = await query("SELECT * FROM workspaces WHERE owner_user_id = $1 ORDER BY created_at ASC LIMIT 1", [customer.id]);
  let workspace = workspaceResult.rows[0];

  if (!workspace) {
    workspaceResult = await query(
      `INSERT INTO workspaces (id, name, owner_user_id, balance, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
       RETURNING *`,
      [makeId("ws"), workspaceName, customer.id, Number(customer.balance || 0)]
    );
    workspace = workspaceResult.rows[0];
  } else {
    workspaceResult = await query(
      `UPDATE workspaces
       SET balance = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [workspace.id, Number(customer.balance || 0)]
    );
    workspace = workspaceResult.rows[0];
  }

  await query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, member_name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', $4, 'active', NOW(), NOW())
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       member_name = EXCLUDED.member_name,
       status = 'active',
       updated_at = NOW()`,
    [makeId("wsm"), workspace.id, customer.id, customer.name || customer.email || "Owner"]
  );

  return {
    id: workspace.id,
    name: workspace.name,
    ownerUserId: workspace.owner_user_id,
    balance: Number(workspace.balance || 0),
    status: workspace.status || "active",
  };
}

export async function getWorkspaceContext(customerId, requestedWorkspaceId = "") {
  await ensureImageStudioSchema();
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  const defaultWorkspace = await upsertDefaultWorkspaceForUser(customer);

  if (!requestedWorkspaceId || requestedWorkspaceId === defaultWorkspace.id) {
    return {
      customer,
      workspace: defaultWorkspace,
      role: "owner",
    };
  }

  if (!hasDatabase()) {
    const workspace = imageStudioStore.workspaces.find((item) => item.id === requestedWorkspaceId) || defaultWorkspace;
    const membership = imageStudioStore.workspaceMembers.find((item) => item.workspaceId === workspace.id && item.userId === customerId);
    return {
      customer,
      workspace,
      role: membership?.role || (workspace.ownerUserId === customerId ? "owner" : "member"),
    };
  }

  const membershipResult = await query(
    `SELECT m.role AS member_role, m.status AS member_status, w.*
     FROM workspace_members m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.workspace_id = $1 AND m.user_id = $2
     LIMIT 1`,
    [requestedWorkspaceId, customerId]
  );
  const membership = membershipResult.rows[0];
  if (!membership) return null;
    return {
      customer,
      workspace: {
        id: membership.id,
        name: membership.name,
        ownerUserId: membership.owner_user_id,
        balance: Number(membership.balance || 0),
        status: membership.status || "active",
      },
      role: membership.member_role || "member",
    };
  }

export async function listImageModels({ includeDisabled = false } = {}) {
  await ensureImageStudioSchema();
  if (!hasDatabase()) {
    const rows = imageStudioStore.imageModels
      .filter((item) => includeDisabled || item.enabled)
      .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
    return rows.map(mapImageModelRow);
  }
  const result = await query(
    `SELECT * FROM image_models
     ${includeDisabled ? "" : "WHERE enabled = true"}
     ORDER BY sort_order ASC, created_at ASC`
  );
  return result.rows.map(mapImageModelRow);
}

export async function getImageModel(modelId = "") {
  const models = await listImageModels({ includeDisabled: true });
  return models.find((item) => item.id === modelId) || models[0] || null;
}

export async function updateImageModelConfig(modelId, updates = {}) {
  await ensureImageStudioSchema();
  const fields = {
    display_name: updates.displayName,
    upstream_model: updates.upstreamModel,
    provider: updates.provider,
    enabled: updates.enabled,
    recommended: updates.recommended,
    supports_text_to_image: updates.supportsTextToImage,
    supports_image_to_image: updates.supportsImageToImage,
    supports_batch: updates.supportsBatch,
    speed_score: updates.speedScore,
    stability_score: updates.stabilityScore,
    quality_score: updates.qualityScore,
    unit_price_token_text_to_image: updates.unitPriceTokenTextToImage,
    unit_price_token_image_to_image: updates.unitPriceTokenImageToImage,
    unit_price_rmb_text_to_image: updates.unitPriceRmbTextToImage,
    unit_price_rmb_image_to_image: updates.unitPriceRmbImageToImage,
    fallback_model_id: updates.fallbackModelId,
    tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
    scene_description: updates.sceneDescription,
    sort_order: updates.sortOrder,
  };

  if (!hasDatabase()) {
    const target = imageStudioStore.imageModels.find((item) => item.id === modelId);
    if (!target) return null;
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) target[key] = key === "tags" ? JSON.parse(value) : value;
    });
    return mapImageModelRow(target);
  }

  const setClauses = [];
  const values = [];
  let index = 1;
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined) return;
    setClauses.push(`${key} = $${index}`);
    values.push(value);
    index += 1;
  });
  if (!setClauses.length) return getImageModel(modelId);
  setClauses.push("updated_at = NOW()");
  values.push(modelId);
  const result = await query(
    `UPDATE image_models
     SET ${setClauses.join(", ")}
     WHERE id = $${index}
     RETURNING *`,
    values
  );
  return result.rows[0] ? mapImageModelRow(result.rows[0]) : null;
}

function estimateImageCost(model, { mode = "text_to_image", quality = "standard", n = 1 } = {}) {
  const count = Math.max(1, Math.min(6, Number(n || 1)));
  const qualityMultiplier = getQualityMultiplier(quality);
  const tokenBase = mode === "image_to_image"
    ? Number(model.unitPriceTokenImageToImage || model.unitPriceTokenTextToImage || 0)
    : Number(model.unitPriceTokenTextToImage || 0);
  const moneyBase = mode === "image_to_image"
    ? Number(model.unitPriceRmbImageToImage || model.unitPriceRmbTextToImage || 0)
    : Number(model.unitPriceRmbTextToImage || 0);
  return {
    tokenCost: roundMoney(tokenBase * qualityMultiplier * count),
    moneyCost: roundMoney(moneyBase * qualityMultiplier * count),
  };
}

function buildImageRequestBody({ prompt, model, images, aspectRatio, quality, n, returnFormat }) {
  const normalizedImages = normalizeImageArray(images);
  const body = {
    model: model.upstreamModel,
    prompt,
    n: Math.max(1, Math.min(6, Number(n || 1))),
    size: mapAspectRatioToSize(aspectRatio),
    aspect_ratio: aspectRatio || "1:1",
    quality: String(quality || "standard").toLowerCase(),
    response_format: returnFormat === "b64_json" ? "b64_json" : "url",
  };

  if (normalizedImages.length) {
    body.image = normalizedImages[0];
    body.images = normalizedImages;
    body.input_image = normalizedImages[0];
    body.input_images = normalizedImages;
  }

  return body;
}

function parseImageOutputs(payload) {
  const items = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.images)
      ? payload.images
      : Array.isArray(payload?.output)
        ? payload.output
        : [];

  return items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item?.url) return item.url;
      if (item?.image_url) return item.image_url;
      if (item?.data_url) return item.data_url;
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
      if (item?.b64) return `data:image/png;base64,${item.b64}`;
      return "";
    })
    .filter(Boolean);
}

async function callImageUpstream({
  endpoint,
  body,
  req,
}) {
  const upstreams = getUpstreamConfigs();
  const upstream = upstreams[0];
  if (!upstream?.apiKey) {
    return {
      ok: false,
      status: 500,
      errorCode: "UPSTREAM_NOT_CONFIGURED",
      errorMessage: "图片上游未配置，请联系管理员",
      errorSource: "flowapi",
    };
  }

  const headers = {
    Authorization: `Bearer ${upstream.apiKey}`,
    "Content-Type": "application/json",
  };
  if (upstream.name === "openrouter") {
    headers["HTTP-Referer"] = process.env.PROXY_HTTP_REFERER || "https://flowapi.fun";
    headers["X-Title"] = process.env.PROXY_TITLE || "FlowAPI Image Studio";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.IMAGE_UPSTREAM_TIMEOUT_MS || 90000));
  try {
    const response = await fetch(`${upstream.baseUrl}/v1/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    return {
      ok: response.ok,
      status: response.status,
      payload: json,
      outputs: parseImageOutputs(json),
      provider: upstream.label,
      endpoint,
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" ? 408 : 502,
      errorCode: error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_REQUEST_FAILED",
      errorMessage: error?.name === "AbortError" ? "图片生成超时，系统将尝试自动重试" : (error?.message || "图片上游请求失败"),
      errorSource: "upstream",
      provider: upstream.label,
      endpoint,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeImageRequest({
  model,
  prompt,
  images,
  aspectRatio,
  quality,
  n,
  returnFormat,
  autoRetry,
  req,
}) {
  const mode = images.length ? "image_to_image" : "text_to_image";
  const endpoint = mode === "image_to_image" ? "images/edits" : "images/generations";
  const baseBody = buildImageRequestBody({
    prompt,
    model,
    images,
    aspectRatio,
    quality,
    n,
    returnFormat,
  });

  let retryCount = 0;
  let fallbackUsed = false;
  let currentModel = model;
  let result = await callImageUpstream({ endpoint, body: baseBody, req });
  const canRetryPrimary = autoRetry && canRetryImageResult(result);

  if (!result.ok && canRetryPrimary) {
    retryCount += 1;
    result = await callImageUpstream({ endpoint, body: baseBody, req });
  }

  const canTryFallback = canRetryImageResult(result);
  if (canTryFallback && currentModel.fallbackModelId) {
    const fallbackModel = await getImageModel(currentModel.fallbackModelId);
    if (fallbackModel?.enabled) {
      fallbackUsed = true;
      currentModel = fallbackModel;
      const fallbackBody = buildImageRequestBody({
        prompt,
        model: fallbackModel,
        images,
        aspectRatio,
        quality,
        n,
        returnFormat,
      });
      retryCount += 1;
      result = await callImageUpstream({ endpoint, body: fallbackBody, req });
    }
  }

  return {
    ...result,
    retryCount,
    fallbackUsed,
    mode,
    modelUsed: currentModel,
  };
}

async function insertImageLog(log) {
  const payload = {
    id: makeId("imglog"),
    ...log,
  };

  if (!hasDatabase()) {
    imageStudioStore.imageLogs.unshift({
      ...payload,
      input_image_urls: payload.inputImageUrls || [],
      output_image_urls: payload.outputImageUrls || [],
      output_thumbnail_urls: payload.outputThumbnailUrls || [],
      createdAt: payload.createdAt || new Date().toISOString(),
    });
    return {
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
    };
  }

  await query(
    `INSERT INTO image_generation_logs (
      id, user_id, workspace_id, api_key_id, request_id, mode,
      model_display_name, upstream_model, upstream_provider,
      prompt, prompt_preview, input_image_urls, output_image_urls, output_thumbnail_urls,
      output_image_count, aspect_ratio, quality, token_cost, money_cost,
      balance_before, balance_after, status, error_code, error_message, error_source,
      latency_ms, retry_count, saved_to_history, metadata, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12::jsonb, $13::jsonb, $14::jsonb,
      $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25,
      $26, $27, $28, $29::jsonb, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId,
      payload.apiKeyId,
      payload.requestId,
      payload.mode,
      payload.modelDisplayName,
      payload.upstreamModel,
      payload.upstreamProvider,
      payload.prompt,
      payload.promptPreview,
      JSON.stringify(payload.inputImageUrls || []),
      JSON.stringify(payload.outputImageUrls || []),
      JSON.stringify(payload.outputThumbnailUrls || []),
      payload.outputImageCount,
      payload.aspectRatio,
      payload.quality,
      payload.tokenCost,
      payload.moneyCost,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.status,
      payload.errorCode,
      payload.errorMessage,
      payload.errorSource,
      payload.latencyMs,
      payload.retryCount,
      payload.savedToHistory !== false,
      JSON.stringify(payload.metadata || {}),
    ]
  );
  return payload;
}

async function insertApiUsageLog(entry) {
  const payload = {
    id: makeId("apilog"),
    ...entry,
  };
  if (!hasDatabase()) {
    imageStudioStore.apiUsageLogs.unshift(payload);
    return payload;
  }
  await query(
    `INSERT INTO api_usage_logs (
      id, user_id, workspace_id, api_key_id, request_id, endpoint, method, mode,
      model_display_name, upstream_model, upstream_provider, prompt_preview,
      input_image_count, output_image_count, token_cost, money_cost,
      balance_before, balance_after, status, error_code, error_message, error_source,
      latency_ms, retry_count, ip_address, user_agent, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22,
      $23, $24, $25, $26, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId,
      payload.apiKeyId,
      payload.requestId,
      payload.endpoint,
      payload.method || "POST",
      payload.mode,
      payload.modelDisplayName,
      payload.upstreamModel,
      payload.upstreamProvider,
      payload.promptPreview,
      payload.inputImageCount,
      payload.outputImageCount,
      payload.tokenCost,
      payload.moneyCost,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.status,
      payload.errorCode,
      payload.errorMessage,
      payload.errorSource,
      payload.latencyMs,
      payload.retryCount,
      payload.ipAddress || "",
      payload.userAgent || "",
    ]
  );
  return payload;
}

function buildFriendlyFailure(errorMessage = "", requestId = "") {
  return `${errorMessage || "图片生成失败"}${requestId ? `（请求 ID：${requestId}）` : ""}`;
}

function normalizeModelResult(selectedModel, upstreamResult) {
  const triedFallback = Boolean(upstreamResult?.fallbackUsed && upstreamResult?.modelUsed?.id && upstreamResult.modelUsed.id !== selectedModel.id);
  const modelForDisplay = triedFallback || upstreamResult?.ok
    ? (upstreamResult?.modelUsed || selectedModel)
    : selectedModel;

  return {
    displayName: modelForDisplay?.displayName || selectedModel.displayName,
    upstreamModel: modelForDisplay?.upstreamModel || selectedModel.upstreamModel,
    provider: upstreamResult?.provider || modelForDisplay?.provider || selectedModel.provider,
    usedId: modelForDisplay?.id || selectedModel.id,
  };
}

export async function runImageStudioJob({
  req,
  customerId,
  apiKeyId = null,
  prompt,
  images = [],
  modelId,
  aspectRatio = "1:1",
  quality = "standard",
  n = 1,
  saveHistory = true,
  autoRetry = true,
  returnFormat = "url",
  endpoint = "/api/image-chat",
  actionType = "",
  sourceImageId = "",
  sourceGenerationId = "",
  avoidImageId = "",
}) {
  await ensureImageStudioSchema();
  const customer = await getCustomer(customerId);
  if (!customer) {
    return { ok: false, status: 404, error: "用户不存在" };
  }

  const workspaceContext = await getWorkspaceContext(customerId);
  if (!workspaceContext?.workspace) {
    return { ok: false, status: 400, error: "工作空间初始化失败" };
  }

  const normalizedImages = normalizeImageArray(images);
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt && !normalizedImages.length) {
    return { ok: false, status: 400, error: "请输入图片需求，或上传图片后告诉我你想怎么修改" };
  }
  if (!cleanPrompt && normalizedImages.length) {
    return { ok: false, status: 400, error: "请再补充一句修改要求，例如：保留主体，背景换成科技办公室风格" };
  }

  const selectedModel = await getImageModel(modelId);
  if (!selectedModel?.enabled) {
    return { ok: false, status: 400, error: "当前图片模型暂不可用，请切换其他模型" };
  }

  const mode = normalizedImages.length ? "image_to_image" : "text_to_image";
  const estimation = estimateImageCost(selectedModel, {
    mode,
    quality,
    n,
  });
  const requestId = `img_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const reserve = await reserveCustomerBalance(customerId, estimation.moneyCost);

  if (reserve?.error) {
    return {
      ok: false,
      status: 402,
      error: reserve.error,
      code: "INSUFFICIENT_BALANCE",
      requestId,
      needRecharge: true,
      currentBalance: Number(customer.balance || 0),
      estimatedCost: estimation,
    };
  }

  const startedAt = Date.now();
  const upstreamResult = await executeImageRequest({
    model: selectedModel,
    prompt: cleanPrompt,
    images: normalizedImages,
    aspectRatio,
    quality,
    n,
    returnFormat,
    autoRetry,
    req,
  });
  const latencyMs = Date.now() - startedAt;
  const outputCount = upstreamResult.outputs?.length || 0;
  const actualCost = upstreamResult.ok
    ? estimateImageCost(upstreamResult.modelUsed || selectedModel, {
        mode,
        quality,
        n: outputCount || n,
      })
    : { tokenCost: 0, moneyCost: 0 };
  const settlement = await settleCustomerBalance(customerId, reserve.reservedAmount, actualCost.moneyCost);
  const finalBalance = Number(settlement.balanceAfter || reserve.balanceBefore || 0);
  const logStatus = upstreamResult.ok
    ? (outputCount > 0 && outputCount < Number(n || 1) ? "partial_success" : "success")
    : "failed";
  const normalizedModelResult = normalizeModelResult(selectedModel, upstreamResult);

  const imageLog = await insertImageLog({
    userId: customerId,
    workspaceId: workspaceContext.workspace.id,
    apiKeyId,
    requestId,
    mode,
    modelDisplayName: normalizedModelResult.displayName,
    upstreamModel: normalizedModelResult.upstreamModel,
    upstreamProvider: normalizedModelResult.provider,
    prompt: cleanPrompt,
    promptPreview: truncateText(cleanPrompt),
    inputImageUrls: normalizedImages,
    outputImageUrls: upstreamResult.outputs || [],
    outputThumbnailUrls: upstreamResult.outputs || [],
    outputImageCount: outputCount,
    aspectRatio,
    quality,
    tokenCost: actualCost.tokenCost,
    moneyCost: actualCost.moneyCost,
    balanceBefore: reserve.balanceBefore,
    balanceAfter: upstreamResult.ok ? finalBalance : reserve.balanceBefore,
    status: logStatus,
    errorCode: upstreamResult.errorCode || "",
    errorMessage: upstreamResult.ok ? "" : (upstreamResult.errorMessage || "图片生成失败"),
    errorSource: upstreamResult.errorSource || "",
    latencyMs,
    retryCount: upstreamResult.retryCount || 0,
    savedToHistory: saveHistory !== false,
    metadata: {
      fallbackUsed: Boolean(upstreamResult.fallbackUsed),
      modelRequested: selectedModel.id,
      modelUsedId: normalizedModelResult.usedId,
      estimatedCost: estimation,
      returnFormat,
      actionType,
      sourceImageId,
      sourceGenerationId,
      avoidImageId,
    },
  });

  await insertApiUsageLog({
    userId: customerId,
    workspaceId: workspaceContext.workspace.id,
    apiKeyId,
    requestId,
    endpoint,
    method: "POST",
    mode,
    modelDisplayName: normalizedModelResult.displayName,
    upstreamModel: normalizedModelResult.upstreamModel,
    upstreamProvider: normalizedModelResult.provider,
    promptPreview: truncateText(cleanPrompt),
    inputImageCount: normalizedImages.length,
    outputImageCount: outputCount,
    tokenCost: actualCost.tokenCost,
    moneyCost: actualCost.moneyCost,
    balanceBefore: reserve.balanceBefore,
    balanceAfter: upstreamResult.ok ? finalBalance : reserve.balanceBefore,
    status: logStatus,
    errorCode: upstreamResult.errorCode || "",
    errorMessage: upstreamResult.ok ? "" : (upstreamResult.errorMessage || "图片生成失败"),
    errorSource: upstreamResult.errorSource || "",
    latencyMs,
    retryCount: upstreamResult.retryCount || 0,
    ipAddress: getClientIp(req),
    userAgent: String(req?.headers?.["user-agent"] || ""),
  });

  if (upstreamResult.ok) {
    await recordWalletTransaction({
      userId: customerId,
      workspaceId: workspaceContext.workspace.id,
      requestId,
      transactionType: "consume",
      tokenAmount: actualCost.tokenCost,
      moneyAmount: actualCost.moneyCost,
      balanceBefore: reserve.balanceBefore,
      balanceAfter: finalBalance,
      relatedLogId: imageLog.id,
      description: `${mode === "image_to_image" ? "图片编辑" : "图片生成"} · ${upstreamResult.modelUsed?.displayName || selectedModel.displayName}`,
    });
  } else {
    await recordWalletTransaction({
      userId: customerId,
      workspaceId: workspaceContext.workspace.id,
      requestId,
      transactionType: "refund",
      tokenAmount: 0,
      moneyAmount: 0,
      balanceBefore: reserve.balanceBefore,
      balanceAfter: reserve.balanceBefore,
      relatedLogId: imageLog.id,
      description: "图片生成失败，自动退回预占额度",
    });
  }

  const estimatedRemainingImages = actualCost.moneyCost > 0
    ? Math.max(0, Math.floor(finalBalance / actualCost.moneyCost))
    : Math.max(0, Math.floor(finalBalance / Math.max(0.01, estimation.moneyCost || 0.01)));

  if (!upstreamResult.ok) {
    return {
      ok: false,
      status: upstreamResult.status || 502,
      error: buildFriendlyFailure(upstreamResult.errorMessage, requestId),
      requestId,
      mode,
      modelDisplayName: normalizedModelResult.displayName,
      tokenCost: 0,
      moneyCost: 0,
      balanceBefore: reserve.balanceBefore,
      balanceAfter: reserve.balanceBefore,
      latencyMs,
      autoRetried: Boolean(upstreamResult.retryCount),
      fallbackUsed: Boolean(upstreamResult.fallbackUsed),
      logId: imageLog.id,
    };
  }

  return {
    ok: true,
    status: 200,
    requestId,
    mode,
    images: upstreamResult.outputs || [],
    outputImageCount: outputCount,
    modelDisplayName: upstreamResult.modelUsed?.displayName || selectedModel.displayName,
    modelId: upstreamResult.modelUsed?.id || selectedModel.id,
    tokenCost: actualCost.tokenCost,
    moneyCost: actualCost.moneyCost,
    balanceBefore: reserve.balanceBefore,
    balanceAfter: finalBalance,
    latencyMs,
    estimatedRemainingImages,
    autoRetried: Boolean(upstreamResult.retryCount),
    fallbackUsed: Boolean(upstreamResult.fallbackUsed),
    logId: imageLog.id,
    saveHistory: saveHistory !== false,
    friendlyMessage: outputCount > 1 ? `已生成 ${outputCount} 张图片` : "图片生成成功",
  };
}

function buildWhereClause({ targetUserId, workspaceId, onlySavedHistory = false, status = "", type = "" } = {}) {
  const clauses = [];
  const values = [];
  let index = 1;
  if (targetUserId) {
    clauses.push(`user_id = $${index}`);
    values.push(targetUserId);
    index += 1;
  }
  if (workspaceId) {
    clauses.push(`workspace_id = $${index}`);
    values.push(workspaceId);
    index += 1;
  }
  if (onlySavedHistory) {
    clauses.push("saved_to_history = true");
  }
  if (status) {
    clauses.push(`status = $${index}`);
    values.push(status);
    index += 1;
  }
  if (type) {
    clauses.push(`mode = $${index}`);
    values.push(type);
    index += 1;
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function buildRequestIdFilter(requestId = "", nextIndex = 1) {
  if (!requestId) {
    return { clause: "", values: [] };
  }
  return {
    clause: `request_id = $${nextIndex}`,
    values: [requestId],
  };
}

export async function listImageHistory({
  viewerId,
  targetUserId,
  workspaceId = "",
  limit = 50,
  status = "",
  type = "",
  requestId = "",
}) {
  await ensureImageStudioSchema();
  const context = await getWorkspaceContext(viewerId, workspaceId);
  if (!context) return { error: "无权查看该工作空间" };
  const effectiveTargetUserId = targetUserId && targetUserId !== viewerId
    ? (context.role === "owner" || context.role === "admin" || isAdminCustomer(context.customer) ? targetUserId : null)
    : viewerId;
  if (!effectiveTargetUserId) return { error: "无权查看其他成员图片历史" };

  if (!hasDatabase()) {
    const items = imageStudioStore.imageLogs
      .map(mapImageLogRow)
      .filter((item) => item.userId === effectiveTargetUserId && item.savedToHistory)
      .filter((item) => !status || item.status === status)
      .filter((item) => !type || item.mode === type)
      .filter((item) => !requestId || item.requestId === requestId)
      .slice(0, Math.max(1, Math.min(100, Number(limit || 50))));
    return {
      workspace: context.workspace,
      role: context.role,
      items,
    };
  }

  const clause = buildWhereClause({
    targetUserId: effectiveTargetUserId,
    workspaceId: context.workspace.id,
    onlySavedHistory: true,
    status,
    type,
  });
  const requestIdFilter = buildRequestIdFilter(requestId, clause.values.length + 1);
  const where = [clause.where.replace(/^WHERE\s+/i, ""), requestIdFilter.clause].filter(Boolean).join(" AND ");
  const result = await query(
    `SELECT * FROM image_generation_logs
     ${where ? `WHERE ${where}` : ""}
     ORDER BY created_at DESC
     LIMIT ${Math.max(1, Math.min(100, Number(limit || 50)))}`,
    [...clause.values, ...requestIdFilter.values]
  );
  return {
    workspace: context.workspace,
    role: context.role,
    items: result.rows.map(mapImageLogRow),
  };
}

export async function listImageLogs({
  viewerId,
  targetUserId,
  workspaceId = "",
  limit = 100,
  status = "",
  type = "",
  requestId = "",
}) {
  await ensureImageStudioSchema();
  const context = await getWorkspaceContext(viewerId, workspaceId);
  if (!context) return { error: "无权查看该工作空间" };
  const canViewTeam = context.role === "owner" || context.role === "admin" || isAdminCustomer(context.customer);
  const effectiveTargetUserId = targetUserId && targetUserId !== viewerId ? (canViewTeam ? targetUserId : null) : viewerId;
  if (targetUserId && targetUserId !== viewerId && !canViewTeam) {
    return { error: "成员之间不能互相查看日志" };
  }

  if (!hasDatabase()) {
    const items = imageStudioStore.imageLogs
      .map(mapImageLogRow)
      .filter((item) => !effectiveTargetUserId || item.userId === effectiveTargetUserId)
      .filter((item) => !status || item.status === status)
      .filter((item) => !type || item.mode === type)
      .filter((item) => !requestId || item.requestId === requestId)
      .slice(0, Math.max(1, Math.min(200, Number(limit || 100))));
    return {
      workspace: context.workspace,
      role: context.role,
      items,
    };
  }

  const clause = buildWhereClause({
    targetUserId: effectiveTargetUserId,
    workspaceId: context.workspace.id,
    status,
    type,
  });
  const requestIdFilter = buildRequestIdFilter(requestId, clause.values.length + 1);
  const where = [clause.where.replace(/^WHERE\s+/i, ""), requestIdFilter.clause].filter(Boolean).join(" AND ");
  const result = await query(
    `SELECT * FROM image_generation_logs
     ${where ? `WHERE ${where}` : ""}
     ORDER BY created_at DESC
     LIMIT ${Math.max(1, Math.min(200, Number(limit || 100)))}`,
    [...clause.values, ...requestIdFilter.values]
  );
  return {
    workspace: context.workspace,
    role: context.role,
    items: result.rows.map(mapImageLogRow),
  };
}

function summarizeLogs(logs = []) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((item) => String(item.createdAt || "").slice(0, 10) === todayKey);
  const successLogs = logs.filter((item) => item.status === "success" || item.status === "partial_success");
  const totalImages = logs.reduce((sum, item) => sum + Number(item.outputImageCount || 0), 0);
  const totalMoney = logs.reduce((sum, item) => sum + Number(item.moneyCost || 0), 0);
  const totalTokens = logs.reduce((sum, item) => sum + Number(item.tokenCost || 0), 0);
  const modelCounter = logs.reduce((memo, item) => {
    const key = item.modelDisplayName || "Unknown";
    memo[key] = (memo[key] || 0) + 1;
    return memo;
  }, {});
  const topModel = Object.entries(modelCounter).sort((a, b) => b[1] - a[1])[0]?.[0] || "暂无";
  return {
    totalGenerations: logs.length,
    totalImages,
    totalMoney: roundMoney(totalMoney),
    totalTokens: roundMoney(totalTokens),
    todayGenerations: todayLogs.length,
    todayImages: todayLogs.reduce((sum, item) => sum + Number(item.outputImageCount || 0), 0),
    todayMoney: roundMoney(todayLogs.reduce((sum, item) => sum + Number(item.moneyCost || 0), 0)),
    todayTokens: roundMoney(todayLogs.reduce((sum, item) => sum + Number(item.tokenCost || 0), 0)),
    successRate: logs.length ? Number(((successLogs.length / logs.length) * 100).toFixed(1)) : 0,
    topModel,
  };
}

export async function getImageSummary({ viewerId, workspaceId = "", targetUserId = "" } = {}) {
  const logsResult = await listImageLogs({
    viewerId,
    workspaceId,
    targetUserId,
    limit: 365,
  });
  if (logsResult.error) return logsResult;
  const summary = summarizeLogs(logsResult.items || []);
  const workspace = logsResult.workspace;
  const balance = Number(workspace?.balance || 0);
  const models = await listImageModels();
  const cheapest = models[0] || DEFAULT_IMAGE_MODELS[0];
  const estimatedRemainingImages = cheapest
    ? Math.max(0, Math.floor(balance / Math.max(0.01, Number(cheapest.unitPriceRmbTextToImage || 0.01))))
    : 0;
  return {
    workspace,
    role: logsResult.role,
    summary: {
      ...summary,
      currentBalance: balance,
      estimatedRemainingImages,
    },
    trend7d: Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const dayLogs = (logsResult.items || []).filter((item) => String(item.createdAt || "").slice(0, 10) === key);
      return {
        date: key,
        label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
        images: dayLogs.reduce((sum, item) => sum + Number(item.outputImageCount || 0), 0),
        tokenCost: roundMoney(dayLogs.reduce((sum, item) => sum + Number(item.tokenCost || 0), 0)),
        moneyCost: roundMoney(dayLogs.reduce((sum, item) => sum + Number(item.moneyCost || 0), 0)),
      };
    }),
  };
}

export async function getTeamBilling({
  viewerId,
  workspaceId = "",
}) {
  await ensureImageStudioSchema();
  const context = await getWorkspaceContext(viewerId, workspaceId);
  if (!context) return { error: "无权查看该工作空间" };
  if (!(context.role === "owner" || context.role === "admin" || isAdminCustomer(context.customer))) {
    return { error: "仅队长或管理员可查看团队记账" };
  }

  if (!hasDatabase()) {
    const members = imageStudioStore.workspaceMembers.filter((item) => item.workspaceId === context.workspace.id);
    const logs = imageStudioStore.imageLogs.map(mapImageLogRow).filter((item) => item.workspaceId === context.workspace.id);
    const summary = summarizeLogs(logs);
    const memberRows = members.map((member) => {
      const memberLogs = logs.filter((item) => item.userId === member.userId);
      const memberSummary = summarizeLogs(memberLogs);
      return {
        userId: member.userId,
        memberName: member.memberName || member.userId,
        role: member.role,
        todayImages: memberSummary.todayImages,
        todayTokens: memberSummary.todayTokens,
        todayMoney: memberSummary.todayMoney,
        totalMoney: memberSummary.totalMoney,
        lastUsedAt: memberLogs[0]?.createdAt || null,
        successRate: memberSummary.successRate,
      };
    });
    return {
      workspace: context.workspace,
      role: context.role,
      summary,
      members: memberRows,
    };
  }

  const [membersResult, logsResult] = await Promise.all([
    query(
      `SELECT m.*, c.email
       FROM workspace_members m
       LEFT JOIN customers c ON c.id = m.user_id
       WHERE m.workspace_id = $1
       ORDER BY m.created_at ASC`,
      [context.workspace.id]
    ),
    query(
      `SELECT * FROM image_generation_logs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 1000`,
      [context.workspace.id]
    ),
  ]);

  const logs = logsResult.rows.map(mapImageLogRow);
  const summary = summarizeLogs(logs);
  const members = membersResult.rows.map((member) => {
    const memberLogs = logs.filter((item) => item.userId === member.user_id);
    const memberSummary = summarizeLogs(memberLogs);
    return {
      userId: member.user_id,
      memberName: member.member_name || member.email || member.user_id,
      role: member.role,
      todayImages: memberSummary.todayImages,
      todayTokens: memberSummary.todayTokens,
      todayMoney: memberSummary.todayMoney,
      totalMoney: memberSummary.totalMoney,
      lastUsedAt: memberLogs[0]?.createdAt || null,
      successRate: memberSummary.successRate,
    };
  });

  return {
    workspace: context.workspace,
    role: context.role,
    summary,
    members,
  };
}

export async function getTeamMemberBillingDetail({
  viewerId,
  workspaceId = "",
  memberUserId,
}) {
  const team = await getTeamBilling({ viewerId, workspaceId });
  if (team.error) return team;
  const logsResult = await listImageLogs({
    viewerId,
    workspaceId: team.workspace.id,
    targetUserId: memberUserId,
    limit: 200,
  });
  if (logsResult.error) return logsResult;
  return {
    workspace: team.workspace,
    role: team.role,
    member: team.members.find((item) => item.userId === memberUserId) || null,
    summary: summarizeLogs(logsResult.items || []),
    items: logsResult.items || [],
  };
}

export function buildImageEndpointPayload(body = {}) {
  const prompt = String(body.prompt || body.text || "").trim();
  const images = normalizeImageArray(body.images || body.input_images || body.inputImages || body.image);
  return {
    prompt,
    images,
    modelId: String(body.model || body.modelId || "gpt-image-2").trim(),
    aspectRatio: String(body.aspect_ratio || body.aspectRatio || "1:1"),
    quality: String(body.quality || "standard"),
    n: Math.max(1, Math.min(4, Number(body.n || 1))),
    saveHistory: body.save_history !== false && body.saveHistory !== false,
    autoRetry: body.auto_retry !== false && body.autoRetry !== false,
    returnFormat: String(body.return_format || body.response_format || "url"),
  };
}

export async function runImageStudioJobByToken({
  req,
  token,
  body,
  endpoint,
}) {
  const match = await findCustomerByToken(token);
  if (!match?.customer?.id) {
    return { ok: false, status: 401, error: "无效的 FlowAPI API Key" };
  }
  const payload = buildImageEndpointPayload(body);
  return runImageStudioJob({
    req,
    customerId: match.customer.id,
    apiKeyId: match.apiKey.id,
    prompt: payload.prompt,
    images: payload.images,
    modelId: payload.modelId,
    aspectRatio: payload.aspectRatio,
    quality: payload.quality,
    n: payload.n,
    saveHistory: payload.saveHistory,
    autoRetry: payload.autoRetry,
    returnFormat: payload.returnFormat,
    endpoint,
  });
}
