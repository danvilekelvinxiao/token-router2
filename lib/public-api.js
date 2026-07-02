const defaultPublicApiBaseUrl = "https://pincc.flowapi.fun/v1";
const forbiddenPublicApiBasePattern = /aicards|openrouter|uniapi|aheapi|newapi|new-api|sub2api|xiaoleai\.team|api\.xiaoleai\.team|localhost:3001|127\.0\.0\.1:3001|localhost:8080|127\.0\.0\.1:8080/i;

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
    process.env.PUBLIC_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  const normalizedSiteOrigin = siteOrigin
    ? normalizePublicApiBaseUrl(siteOrigin.startsWith("http") ? siteOrigin : `https://${siteOrigin}`)
    : "";

  return normalizePublicApiBaseUrl(configured || normalizedSiteOrigin || defaultPublicApiBaseUrl);
}
