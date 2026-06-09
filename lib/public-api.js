const defaultPublicApiBaseUrl = "https://api.flowapi.fun/v1";
const forbiddenPublicApiBasePattern = /aicards|openrouter|uniapi|aheapi|newapi|new-api|sub2api|localhost:3001|127\.0\.0\.1:3001/i;

export function normalizePublicApiBaseUrl(value = "") {
  const configured = String(value || "").trim();
  if (!configured || forbiddenPublicApiBasePattern.test(configured)) {
    return defaultPublicApiBaseUrl;
  }
  const base = configured.replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

export function getPublicApiBaseUrl() {
  // Public docs should always show the real customer-facing API domain unless explicitly configured.
  const configured =
    process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  return normalizePublicApiBaseUrl(configured || defaultPublicApiBaseUrl);
}
