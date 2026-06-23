function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

const ROUTE_TIER_ORDER = ["sub2api", "newApi", "backup", "openai", "uniapi", "openrouter"];

function upstreamTierName(candidate = {}) {
  const name = String(candidate.name || candidate.upstreamName || candidate.channelName || candidate.providerName || "").toLowerCase();
  const label = String(candidate.label || "").toLowerCase();
  const text = `${name} ${label}`;
  if (text.includes("sub2api") || text.includes("default")) return "sub2api";
  if (text.includes("new-api") || text.includes("newapi")) return "newApi";
  if (text.includes("openai official") || text.includes("official-openai") || text.includes("api.openai.com") || text.includes("openai")) return "openai";
  if (text.includes("openrouter")) return "openrouter";
  if (text.includes("aicards") || text.includes("backup") || (text.includes("备用") && !text.includes("openrouter"))) return "backup";
  if (text.includes("uniapi")) return "uniapi";
  return "backup";
}

function compareUpstreamPriority(a = {}, b = {}) {
  const rankA = ROUTE_TIER_ORDER.indexOf(upstreamTierName(a));
  const rankB = ROUTE_TIER_ORDER.indexOf(upstreamTierName(b));
  const safeRankA = rankA >= 0 ? rankA : ROUTE_TIER_ORDER.length;
  const safeRankB = rankB >= 0 ? rankB : ROUTE_TIER_ORDER.length;
  const scoreA = Number(a.score || 0);
  const scoreB = Number(b.score || 0);
  return safeRankA - safeRankB || b.score - a.score || a.priority - b.priority || scoreB - scoreA || String(a.name || "").localeCompare(String(b.name || ""));
}

export function normalizeUpstreamIdentity(candidate = {}) {
  const upstreamUrl = String(candidate.upstreamUrl || candidate.modelsUrl || candidate.healthUrl || "").trim();
  let upstreamOrigin = normalizeBaseUrl(upstreamUrl);
  if (upstreamUrl) {
    try {
      upstreamOrigin = new URL(upstreamUrl).origin;
    } catch {
      upstreamOrigin = normalizeBaseUrl(upstreamUrl);
    }
  }
  const apiKey = String(candidate.apiKey || "").trim();
  return `${upstreamOrigin}|${apiKey}`;
}

export function dedupeUpstreamCandidates(candidates = []) {
  const deduped = new Map();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = normalizeUpstreamIdentity(candidate);
    if (!deduped.has(key)) deduped.set(key, candidate);
  }
  return Array.from(deduped.values());
}

export function orderUpstreamCandidates(routeDecision = {}, upstreams = []) {
  const defaultCandidates = upstreams.filter((upstream) => upstream.includeAsDefaultCandidate !== false);
  const candidates = Array.isArray(routeDecision.fallbackChain)
    ? routeDecision.fallbackChain
    : defaultCandidates;
  const routeOrdered = routeDecision.upstream
    ? [routeDecision.upstream, ...candidates.filter((candidate) => candidate.name !== (routeDecision.upstream?.name))]
    : candidates;
  return dedupeUpstreamCandidates(routeOrdered).sort(compareUpstreamPriority);
}

export function shouldRetryUpstreamStatus(status, { retry429 = false } = {}) {
  const code = Number(status || 0);
  if (!Number.isFinite(code) || code <= 0) return false;
  if (code === 429) return Boolean(retry429);
  return [401, 402, 403, 404, 408, 500, 502, 503, 504].includes(code) || code >= 500;
}
