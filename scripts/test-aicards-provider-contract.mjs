import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const providerSource = fs.readFileSync(path.join(repoRoot, "lib/aicards-provider.js"), "utf8");

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
