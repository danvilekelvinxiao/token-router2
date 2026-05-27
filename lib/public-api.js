const publicApiPath = "/v1";

export function getPublicApiBaseUrl() {
  // Priority: configured public API domain > localhost during development > production API domain.
  const configured =
    process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    // Ensure /v1 suffix is present
    const base = configured.replace(/\/+$/, "");
    return base.endsWith("/v1") ? base : `${base}/v1`;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    const hostname = window.location.hostname || "";
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      return `${window.location.origin}${publicApiPath}`;
    }
    if (hostname === "api.flowapi.fun") {
      return `${window.location.origin}${publicApiPath}`;
    }
    return "https://api.flowapi.fun/v1";
  }

  // Fallback for SSR or unknown environments
  return "https://api.flowapi.fun/v1";
}
