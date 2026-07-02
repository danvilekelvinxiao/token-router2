const ROUTE_CODE_MAP = {
  sub2api: "A",
  newApi: "B",
  backup: "C",
  openai: "D",
  uniapi: "E",
  openrouter: "X",
};

export function getRouteCodeFromTier(tier = "") {
  const raw = String(tier || "").trim();
  const lower = raw.toLowerCase();
  if (!lower) return "X";
  if (lower.includes("sub2api")) return "A";
  if (lower.includes("newapi") || lower.includes("new-api")) return "B";
  if (lower.includes("backup") || lower.includes("aicards")) return "C";
  if (lower.includes("openai")) return "D";
  if (lower.includes("uniapi")) return "E";
  if (lower.includes("openrouter")) return "X";
  return ROUTE_CODE_MAP[raw] || ROUTE_CODE_MAP[lower] || "X";
}

export function appendRouteCodeToRequestId(requestId = "", routeCode = "") {
  const cleanId = String(requestId || "").trim();
  const cleanCode = String(routeCode || "").trim();
  if (!cleanId) return cleanCode ? `call_${Date.now()}_${Math.random().toString(16).slice(2, 10)}${cleanCode}` : "";
  if (!cleanCode) return cleanId;
  return cleanId.endsWith(cleanCode) ? cleanId : `${cleanId}${cleanCode}`;
}
