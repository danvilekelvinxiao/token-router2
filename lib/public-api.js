const publicApiPath = "/v1";

export function getPublicApiBaseUrl() {
  // Priority: NEXT_PUBLIC_FLOWAPI_BASE_URL > NEXT_PUBLIC_API_BASE_URL > window.location
  const configured =
    process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    // Ensure /v1 suffix is present
    const base = configured.replace(/\/+$/, "");
    return base.endsWith("/v1") ? base : `${base}/v1`;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${publicApiPath}`;
  }

  // Fallback for SSR or unknown environments
  return "https://api.flowapi.fun/v1";
}
