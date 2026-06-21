const [, , baseArg = process.env.FLOWAPI_PUBLIC_BASE_URL || "https://flowapi.fun"] = process.argv;

const base = String(baseArg || "https://flowapi.fun").replace(/\/+$/, "");
const apiPaths = [
  "/api/models/market",
  "/api/models/api-key-options",
  "/api/image/models",
  "/api/market-models",
  "/api/analytics/openrouter-top-models",
  "/api/market/model-rank",
];
const pagePaths = [
  "/",
  "/models",
  "/api-management",
  "/guide",
  "/help",
  "/console/api-access",
  "/api-management",
  "/images",
];

const apiLeakRe = /(aicards|aicards\.shop|uniapi|aheapi|new api|new-api|newapi|sub2api|actual_model|provider_key|base_url|api_key|bearer|authorization|sk-|cr_|上游|供应商|供货商)/i;
const pageLeakRe = /(aicards|aicards\.shop|openrouter|openrouter\.ai|uniapi|aheapi|new api|new-api|newapi|sub2api|actual_model|provider_key|localhost:3001|127\.0\.0\.1:3001|localhost:8080|127\.0\.0\.1:8080)/i;
const publicUiBrandLeakRe = /(OpenAI|Anthropic|DeepSeek|Alibaba|Moonshot|Zhipu|Auto Router)\s+API ACCESS|OpenAI\s+兼容(?:客户端)?/i;
const maxFetchAttempts = Number(process.env.FLOWAPI_PUBLIC_SCAN_ATTEMPTS || 3);

function urlFor(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchText(path) {
  const url = urlFor(path);
  let lastError;
  for (let attempt = 1; attempt <= maxFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "text/html,application/json" } });
      return { response, text: await response.text() };
    } catch (error) {
      lastError = error;
      if (attempt < maxFetchAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  return {
    response: { ok: false, status: 0 },
    text: JSON.stringify({ error: lastError?.message || "fetch failed", url }),
  };
}

async function scanApi(path) {
  const { response, text } = await fetchText(path);
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  const rows = Array.isArray(payload.models) ? payload.models : Array.isArray(payload.data) ? payload.data : [];
  const providers = [...new Set(rows.map((item) => item.provider || item.providerName).filter(Boolean))];
  const badProviders = providers.filter((provider) => provider !== "FlowAPI");
  const imageCount = rows.filter((item) => String(item.category || item.primaryButtonHref || "").includes("image") || item.primaryButtonHref === "/images").length;
  const leaked = apiLeakRe.test(text);
  const ok = response.ok && !leaked && badProviders.length === 0 && (path !== "/api/models/market" || imageCount >= 1);
  return { type: "api", path, ok, status: response.status, count: rows.length, imageCount, providers, leaked, badProviders };
}

async function scanPage(path) {
  const { response, text } = await fetchText(path);
  const leaked = pageLeakRe.test(text) || (["/console/api-access", "/api-management"].includes(path) && publicUiBrandLeakRe.test(text));
  return { type: "page", path, ok: response.ok && !leaked, status: response.status, leaked };
}

let failed = false;
for (const path of apiPaths) {
  const result = await scanApi(path);
  if (!result.ok) failed = true;
  console.log(JSON.stringify(result));
}
for (const path of pagePaths) {
  const result = await scanPage(path);
  if (!result.ok) failed = true;
  console.log(JSON.stringify(result));
}
if (failed) {
  console.error("FlowAPI public branding scan failed.");
  process.exit(1);
}
