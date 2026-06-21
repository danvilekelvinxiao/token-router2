const upstreamFailureCache = new Map();

const UPSTREAM_FAILURE_COOLDOWN_MS = Number(process.env.UPSTREAM_FAILURE_COOLDOWN_MS || 2 * 60 * 1000);

function upstreamFailureKey(upstream = {}) {
  return String(upstream.id || upstream.name || upstream.label || upstream.upstreamUrl || "").toLowerCase();
}

export function clearUpstreamFailure(upstream = {}) {
  const key = upstreamFailureKey(upstream);
  if (!key) return;
  upstreamFailureCache.delete(key);
}

export function reportUpstreamFailure(upstream = {}, { statusCode = 0, errorCode = "upstream_failure" } = {}) {
  const key = upstreamFailureKey(upstream);
  if (!key) return;
  upstreamFailureCache.set(key, {
    ts: Date.now(),
    statusCode,
    errorCode,
  });
}

export function isUpstreamCoolingDown(upstream = {}) {
  const key = upstreamFailureKey(upstream);
  if (!key) return false;
  const entry = upstreamFailureCache.get(key);
  if (!entry) return false;
  if (Date.now() - entry.ts > UPSTREAM_FAILURE_COOLDOWN_MS) {
    upstreamFailureCache.delete(key);
    return false;
  }
  return true;
}
