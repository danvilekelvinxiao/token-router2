import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const providerSource = fs.readFileSync(path.join(repoRoot, "lib/aicards-provider.js"), "utf8");
const safeUrlSource = fs.readFileSync(path.join(repoRoot, "lib/safe-upstream-url.js"), "utf8");
const adminConfigSource = fs.readFileSync(path.join(repoRoot, "lib/admin-commercial-config.js"), "utf8");
const modelProductsSource = fs.readFileSync(path.join(repoRoot, "lib/model-products-server.js"), "utf8");
const publicProviderSource = fs.readFileSync(path.join(repoRoot, "lib/public-model-provider.js"), "utf8");
const dashboardSource = fs.readFileSync(path.join(repoRoot, "pages/dashboard.js"), "utf8");
const upstreamHealthApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/upstreams/health.js"), "utf8");
const marketApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/models/market.js"), "utf8");
const apiKeyOptionsSource = fs.readFileSync(path.join(repoRoot, "pages/api/models/api-key-options.js"), "utf8");
const contentModelsSource = fs.readFileSync(path.join(repoRoot, "pages/api/content/models.js"), "utf8");
const teamPoolSource = fs.readFileSync(path.join(repoRoot, "lib/team-token-pool.js"), "utf8");
const teamUsageApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/team/usage.js"), "utf8");
const imageStudioSource = fs.readFileSync(path.join(repoRoot, "lib/image-studio.js"), "utf8");
const imageModelsApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/image/models.js"), "utf8");
const imageHistoryApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/images/history.js"), "utf8");
const newApiAdminProxySource = fs.readFileSync(path.join(repoRoot, "lib/new-api/admin-proxy.js"), "utf8");
const genericAdminProxySource = fs.readFileSync(path.join(repoRoot, "pages/api/admin/[...path].js"), "utf8");
const bulkPublishApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/admin/providers/aicards/bulk-publish.js"), "utf8");
const modelMarketAdminApiSource = fs.readFileSync(path.join(repoRoot, "pages/api/admin/model-market/index.js"), "utf8");
const modelMarketAdminPageSource = fs.readFileSync(path.join(repoRoot, "pages/admin/model-market.js"), "utf8");

const publicBlocklist = [
  "aicards",
  "aicards.shop",
  "openrouter",
  "uniapi",
  "newapi",
  "new-api",
  "sub2api",
  "upstream",
  "actual_model",
  "provider_key",
  "base_url",
  "api_key",
  "bearer",
  "authorization",
  "proxy",
  "route",
  "backup",
  "supplier",
  "vendor",
  "sk-",
  "cr_",
  "上游",
  "供应商",
  "供货商",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stableHash(value = "") {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(6, "0").slice(0, 8);
}

function containsBlockedPublicText(value = "") {
  const text = String(value || "").toLowerCase();
  return publicBlocklist.some((keyword) => text.includes(keyword));
}

function detectModelCategory(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("claude")) return "claude";
  if (id.includes("codex")) return "codex";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("image") || id.includes("flux") || id.includes("sdxl")) return "image";
  if (id.includes("gpt") || id.includes("openai") || /\bo[134]\b/.test(id)) return "chatgpt";
  if (id.includes("grok")) return "grok";
  return "general";
}

function publicModelIdForCandidate(modelId = "") {
  const category = detectModelCategory(modelId).replace(/[^a-z0-9-]/g, "") || "model";
  return `flowapi-${category}-${stableHash(modelId || "model")}`;
}

const sampleModels = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "gpt-5.4",
  "claude-opus-4-6",
  "gpt-5.4-mini",
  "gpt-5.4-high",
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-fast",
  "gpt-image-2",
  "gpt-5.5",
  "claude-opus-4-7",
  "claude-opus-4-7-kiro",
  "gemini-2-5-pro",
  "deepseek-chat",
  "qwen3-32b",
  "codex-plus",
  "aicards-openrouter-claude-sonnet-4-6-provider_key",
  "vendor-proxy-gpt-5.4-backup-route",
];

assert(
  providerSource.includes("function publicModelIdForCandidate")
    && providerSource.includes("flowapi-${category}-${stableHash"),
  "lib/aicards-provider.js 必须使用 flowapi-分类-hash 生成候选 public_model_id",
);
assert(
  providerSource.includes("assertSafePublicModelText(publicModelId")
    && providerSource.includes("assertSafePublicModelText(displayName"),
  "AICards 审核发布必须校验对外模型 ID 和显示名不能包含供应链词",
);
assert(
  providerSource.includes('const modelFilter = modelId ? "AND actual_model_id = $7" : ""')
    && providerSource.includes("WHERE (provider_key = $1 OR provider_name = $1) ${modelFilter}"),
  "AICards 单模型健康检查不能更新同 provider 下所有候选通道",
);
assert(
  providerSource.includes("showInModelSquare: false")
    && providerSource.includes("showInApiKeyCreate: false")
    && providerSource.includes("showInImageGeneration: false")
    && providerSource.includes("enabled: false"),
  "AICards 取消发布必须同步下架模型广场、API Key 创建和运行时入口",
);
assert(
  providerSource.includes("export async function bulkPublishAicardsCandidates")
    && bulkPublishApiSource.includes("bulkPublishAicardsCandidates"),
  "AICards 必须提供批量发布达标候选的管理员 API",
);
assert(
  safeUrlSource.includes('"aicards.shop"'),
  "aicards.shop 必须进入服务端上游域名白名单",
);
assert(
  safeUrlSource.includes('FLOWAPI_ALLOW_PRIVATE_UPSTREAMS === "true" && process.env.NODE_ENV !== "production"'),
  "生产环境不能通过 FLOWAPI_ALLOW_PRIVATE_UPSTREAMS 绕过上游 URL 安全检查",
);
assert(
  publicProviderSource.includes("sanitizePublicModelForClient")
    && marketApiSource.includes("sanitizePublicModelForClient")
    && apiKeyOptionsSource.includes("sanitizePublicModelForClient")
    && contentModelsSource.includes("sanitizePublicModelForClient"),
  "公开模型接口必须在服务端统一清洗供应链 provider/display 文案",
);
assert(
  publicProviderSource.includes("const publicModel = {")
    && publicProviderSource.includes("Object.fromEntries(Object.entries(publicModel)")
    && !publicProviderSource.includes("...sanitized"),
  "公开模型 sanitizer 必须使用字段白名单，不能把 actualModelId/providerKey/baseUrl 等内部字段透出",
);
assert(
  dashboardSource.includes("/api/analytics/global-model-rank")
    && !dashboardSource.includes("/api/analytics/openrouter-top-models")
    && upstreamHealthApiSource.includes("modelService")
    && upstreamHealthApiSource.includes("serviceStatus")
    && !upstreamHealthApiSource.includes("upstream:"),
  "用户端 Dashboard 和公开健康接口必须使用 FlowAPI/模型服务命名，不能暴露上游通道语义",
);
assert(
  publicProviderSource.includes('provider.toLowerCase() === "flowapi"')
    && publicProviderSource.includes("normalizeText(model.displayProvider).toLowerCase() === \"flowapi\""),
  "后台发布为 FlowAPI 的模型在公开接口中必须保持 FlowAPI 品牌，不得按模型关键词改回厂商品牌",
);
assert(
  imageModelsApiSource.includes("mapPublicImageModel")
    && imageStudioSource.includes("export function mapPublicImageModel")
    && imageModelsApiSource.includes("(await listImageModels()).map(mapPublicImageModel)")
    && !imageModelsApiSource.includes("const models = await listImageModels();"),
  "公开图片模型接口必须返回 mapPublicImageModel 后的结果，不能暴露 upstreamModel/provider",
);
assert(
  imageStudioSource.includes("function sanitizeImageLogForViewer")
    && imageStudioSource.includes("listImageHistory")
    && imageStudioSource.includes("result.rows.map(mapImageLogRow).map((item) => sanitizeImageLogForViewer")
    && imageHistoryApiSource.includes("listImageHistory"),
  "图片历史接口必须复用 sanitizeImageLogForViewer，普通用户不能看到 upstreamModel/upstreamProvider",
);
assert(
  imageStudioSource.includes("FLOWAPI_MIN_IMAGE_PROFIT_MARGIN")
    && imageStudioSource.includes("IMAGE_MODEL_MARGIN_TOO_LOW")
    && imageStudioSource.includes("IMAGE_MODEL_COST_NOT_CONFIGURED")
    && imageStudioSource.includes("sellPerImage < costPerImage * (1 + minMargin)")
    && !imageStudioSource.includes("const profitPerImage = Math.max(0, sellPerImage - costPerImage)"),
  "图片固定利润模式必须硬性阻断成本缺失、价格缺失和低毛利配置，不能把亏损压成 0",
);
assert(
  adminConfigSource.includes("function assertPublishedModelCommercialGuard")
    && adminConfigSource.includes("公开模型必须先配置真实成本")
    && adminConfigSource.includes("公开模型售价必须覆盖成本")
    && adminConfigSource.includes("normalizePricingPayload(")
    && adminConfigSource.includes("assertPublishedModelCommercialGuard("),
  "通用模型发布入口必须复用服务端财务 guard，公开收费模型不能绕过成本/售价/毛利检查",
);
assert(
  adminConfigSource.includes("STARTER_MODEL_PACK_IDS")
    && adminConfigSource.includes("PACK_PRICING_PRESETS")
    && adminConfigSource.includes("export async function bootstrapModelMarketPack")
    && adminConfigSource.includes('provider: "FlowAPI"')
    && modelMarketAdminApiSource.includes("bootstrap_model_pack")
    && modelMarketAdminApiSource.includes("listModelProductsWithConfig")
    && modelMarketAdminApiSource.includes("mapSystemProductForAdmin")
    && modelMarketAdminPageSource.includes("开通基础推荐包")
    && modelMarketAdminPageSource.includes("铺好完整模型包"),
  "模型广场后台必须提供老板一键开通入口，并展示系统推荐模型，避免管理员面对空表和复杂上游字段",
);
assert(
  adminConfigSource.includes("upstream_model_id")
    && adminConfigSource.includes("model.upstreamModelId")
    && modelProductsSource.includes("item.upstreamModelId"),
  "发布模型必须持久化并读取真实上游模型 ID，避免 public_model_id 被直接发给上游",
);
assert(
  teamPoolSource.includes("function sanitizeTokenForTeamMember")
    && teamPoolSource.includes("provider: \"FlowAPI\"")
    && teamUsageApiSource.includes("quotaPools")
    && teamUsageApiSource.includes("logs"),
  "团队成员接口必须保留用量/额度，同时隐藏供应链 token 元数据",
);
assert(
  !/localStorage\.(getItem|setItem|removeItem)\(\s*['"]flowapi_admin_secret/.test(
    fs.readdirSync(path.join(repoRoot, "pages/admin"))
      .filter((name) => name.endsWith(".js"))
      .map((name) => fs.readFileSync(path.join(repoRoot, "pages/admin", name), "utf8"))
      .join("\n"),
  ),
  "后台管理员密钥不能再长期写入 localStorage",
);
assert(
  newApiAdminProxySource.includes("NEW_API_ADMIN_TOKEN")
    && !newApiAdminProxySource.includes('"cookie"')
    && !newApiAdminProxySource.includes("Set-Cookie")
    && genericAdminProxySource.includes("禁止通过 /api/admin/* 泛代理访问上游管理面"),
  "New API 管理代理必须使用服务端 Token，且不能转发浏览器 Cookie 或保留泛代理",
);

const mapped = sampleModels.map((actualModelId) => ({
  actualModelId,
  publicModelId: publicModelIdForCandidate(actualModelId),
}));
const publicIds = mapped.map((item) => item.publicModelId);
const uniquePublicIds = new Set(publicIds);

assert(uniquePublicIds.size === publicIds.length, "AICards 候选 public_model_id 必须逐模型唯一");
assert(publicIds.every((id) => /^flowapi-[a-z0-9-]+-[a-z0-9]{6,8}$/.test(id)), "public_model_id 必须是 FlowAPI 品牌化格式");
assert(publicIds.every((id) => !containsBlockedPublicText(id)), "public_model_id 不能包含上游供应链词");
assert(publicIds.every((id) => !/\b5-4\b|\bsonnet\b|\bopus\b|\bhaiku\b|\bprovider\b|\bbackup\b|\bproxy\b/.test(id)), "public_model_id 不能直接拼接真实模型版本或线路描述");

for (const unsafe of ["aicards-claude", "flowapi-openrouter-gpt", "flowapi-base_url-test", "上游 Claude", "供应商 GPT"]) {
  assert(containsBlockedPublicText(unsafe), `供应链词必须被识别：${unsafe}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: mapped.length,
  uniquePublicIds: uniquePublicIds.size,
  examples: mapped.slice(0, 4),
}, null, 2));
