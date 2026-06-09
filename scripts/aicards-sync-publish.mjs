import fs from "node:fs";

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

loadEnvFileIfExists(".env.production");
loadEnvFileIfExists(".env.local");

const adminId = process.env.FLOWAPI_DEPLOY_ADMIN_ID || "workbench-aicards-sync";
const maxCount = Number(process.env.FLOWAPI_AICARDS_SYNC_MAX_COUNT || 80);
const autoPrice = process.env.FLOWAPI_AICARDS_AUTO_PRICE !== "false";
const autoHealthCheck = process.env.FLOWAPI_AICARDS_AUTO_HEALTH_CHECK !== "false";
const perModelHealthCheck = process.env.FLOWAPI_AICARDS_PER_MODEL_HEALTH_CHECK === "true";
const includeImages = process.env.FLOWAPI_AICARDS_INCLUDE_IMAGES === "true";
const publicBase = process.env.FLOWAPI_PUBLIC_BASE_URL || "http://127.0.0.1:3000";

function mask(value = "") {
  const text = String(value || "");
  if (!text) return "(not set)";
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

async function main() {
  console.log("==> FlowAPI AICards sync/publish");
  console.log(JSON.stringify({
    aicardsBaseUrl: process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL || "(admin upstream or not set)",
    aicardsApiKey: mask(process.env.AICARDS_API_KEY),
    maxCount,
    autoPrice,
    autoHealthCheck,
    perModelHealthCheck,
    includeImages,
    publicBase,
  }, null, 2));

  const { getAicardsConfig, syncAicardsModels, healthCheckAicards, bulkPublishAicardsCandidates } = await import("../lib/aicards-provider.js");
  const config = await getAicardsConfig();
  if (!config.enabled) {
    throw new Error("AICards is not configured. Set AICARDS_API_BASE_URL/AICARDS_BASE_URL and AICARDS_API_KEY on the server.");
  }

  const sync = await syncAicardsModels({ adminId });
  console.log("==> synced");
  console.log(JSON.stringify({ total: sync.total, added: sync.added, updated: sync.updated }, null, 2));

  const health = await healthCheckAicards({ adminId, skipModelTest: !autoHealthCheck });
  console.log("==> health");
  console.log(JSON.stringify({
    ok: health.ok,
    modelsOk: health.modelsOk,
    totalModels: health.totalModels,
    modelTest: health.modelTest ? {
      skipped: health.modelTest.skipped,
      ok: health.modelTest.ok,
      statusCode: health.modelTest.statusCode,
      latencyMs: health.modelTest.latencyMs,
      error: health.modelTest.error,
    } : undefined,
    lastError: health.lastError,
  }, null, 2));

  if (process.env.FLOWAPI_AICARDS_SYNC_ONLY === "true") {
    console.log("==> sync-only mode");
    console.log("Skipped publish and public branding scan because FLOWAPI_AICARDS_SYNC_ONLY=true.");
    return;
  }

  const publish = await bulkPublishAicardsCandidates({
    adminId,
    maxCount,
    autoPrice,
    autoSync: false,
    autoHealthCheck: false,
    perModelHealthCheck,
    includeImages,
  });
  console.log("==> published");
  console.log(JSON.stringify({
    ok: publish.ok,
    total: publish.total,
    publishedCount: publish.publishedCount,
    skippedCount: publish.skippedCount,
    examples: publish.published?.slice(0, 10).map((item) => ({
      publicModelId: item.publicModelId,
      displayName: item.displayName,
      sellInputPricePerMillion: item.sellInputPricePerMillion,
      sellOutputPricePerMillion: item.sellOutputPricePerMillion,
    })) || [],
    skippedExamples: publish.skipped?.slice(0, 10) || [],
  }, null, 2));

  console.log("==> public branding scan");
  const { spawnSync } = await import("node:child_process");
  const scan = spawnSync(process.execPath, ["scripts/scan-public-branding.mjs", publicBase], {
    stdio: "inherit",
    env: { ...process.env, FLOWAPI_PUBLIC_BASE_URL: publicBase },
  });
  if (scan.status !== 0) throw new Error("Public branding scan failed after AICards publish.");
  if (!publish.ok) {
    throw new Error("No AICards candidates were published. Check upstream cost/pricing/health details above.");
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
