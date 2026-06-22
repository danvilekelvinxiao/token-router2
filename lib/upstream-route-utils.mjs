function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
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
  return dedupeUpstreamCandidates(routeOrdered);
}
