import { DEFAULT_ROUTE_POLICY } from "./route-policy-constants.js";
import { getRoutePolicyConfig as loadRoutePolicyConfig, saveRoutePolicyConfig as persistRoutePolicyConfig, normalizeRoutePolicyConfig } from "./admin-store.js";

export { DEFAULT_ROUTE_POLICY, normalizeRoutePolicyConfig };

export async function getRoutePolicyConfig() {
  return loadRoutePolicyConfig();
}

export async function saveRoutePolicyConfig(config) {
  return persistRoutePolicyConfig(config);
}

export function routeTierForCandidate(candidate = {}) {
  const haystack = [
    candidate.id,
    candidate.name,
    candidate.label,
    candidate.channelName,
    candidate.providerName,
    candidate.groupName,
    candidate.upstreamName,
    candidate.raw?.name,
    candidate.raw?.provider,
    candidate.raw?.provider_name,
    candidate.raw?.channel_name,
    candidate.raw?.channelName,
    candidate.raw?.group_name,
    candidate.raw?.upstream_channel,
    candidate.raw?.upstream_provider,
  ].filter(Boolean).join(" ").toLowerCase();

  if (haystack.includes("openrouter") || haystack.includes("bridge")) return "openrouter";
  if (haystack.includes("uniapi") || haystack.includes("uni api") || haystack.includes("uni-api")) return "uniapi";
  if (haystack.includes("new-api") || haystack.includes("new api") || haystack.includes("newapi")) return "newApi";
  if (haystack.includes("sub2api") || haystack.includes("default")) return "sub2api";
  return "backup";
}

export function normalizeRoutePolicyRouteOrder(policy = {}) {
  const source = normalizeRoutePolicyConfig(policy);
  return source.fallbackOrder.filter(Boolean);
}

export function getRouteTierIndex(candidate = {}, policy = DEFAULT_ROUTE_POLICY) {
  const normalized = normalizeRoutePolicyConfig(policy);
  if (normalized.enabled === false) return 0;
  const order = normalizeRoutePolicyRouteOrder(normalized);
  const tier = routeTierForCandidate(candidate);
  const index = order.indexOf(tier);
  return index >= 0 ? index : order.length;
}

export function compareRouteCandidates(a = {}, b = {}, policy = DEFAULT_ROUTE_POLICY) {
  const normalized = normalizeRoutePolicyConfig(policy);
  if (normalized.enabled === false) {
    const scoreA = Number(a.score || 0);
    const scoreB = Number(b.score || 0);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const priorityA = Number(a.priority ?? 50);
    const priorityB = Number(b.priority ?? 50);
    if (priorityA !== priorityB) return priorityA - priorityB;

    const latencyA = Number(a.avgFirstTokenMs || a.avgLatencyMs || 0);
    const latencyB = Number(b.avgFirstTokenMs || b.avgLatencyMs || 0);
    if (latencyA !== latencyB) return latencyA - latencyB;

    return String(a.label || a.channelName || a.name || "").localeCompare(String(b.label || b.channelName || b.name || ""), "zh-CN");
  }
  const tierA = getRouteTierIndex(a, normalized);
  const tierB = getRouteTierIndex(b, normalized);
  if (tierA !== tierB) return tierA - tierB;

  const scoreA = Number(a.score || 0);
  const scoreB = Number(b.score || 0);
  if (scoreA !== scoreB) return scoreB - scoreA;

  const priorityA = Number(a.priority ?? 50);
  const priorityB = Number(b.priority ?? 50);
  if (priorityA !== priorityB) return priorityA - priorityB;

  const latencyA = Number(a.avgFirstTokenMs || a.avgLatencyMs || 0);
  const latencyB = Number(b.avgFirstTokenMs || b.avgLatencyMs || 0);
  if (latencyA !== latencyB) return latencyA - latencyB;

  return String(a.label || a.channelName || a.name || "").localeCompare(String(b.label || b.channelName || b.name || ""), "zh-CN");
}

export function isRouteTierEnabled(candidate = {}, policy = DEFAULT_ROUTE_POLICY) {
  const normalized = normalizeRoutePolicyConfig(policy);
  if (normalized.enabled === false) return true;
  const tier = typeof candidate === "string" ? candidate : routeTierForCandidate(candidate);
  return normalized.tierEnabled?.[tier] !== false;
}

export function filterRouteCandidatesByPolicy(candidates = [], policy = DEFAULT_ROUTE_POLICY) {
  const normalized = normalizeRoutePolicyConfig(policy);
  if (normalized.enabled === false) return [...candidates];
  const filtered = candidates.filter((candidate) => isRouteTierEnabled(candidate, normalized));
  return filtered.length ? filtered : [...candidates];
}
