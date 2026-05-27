const defaultPublicApiBaseUrl = "https://api.flowapi.fun/v1";

export function getPublicApiBaseUrl() {
  // Public docs should always show the real customer-facing API domain unless explicitly configured.
  const configured =
    process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    // Ensure /v1 suffix is present
    const base = configured.replace(/\/+$/, "");
    return base.endsWith("/v1") ? base : `${base}/v1`;
  }

  return defaultPublicApiBaseUrl;
}
