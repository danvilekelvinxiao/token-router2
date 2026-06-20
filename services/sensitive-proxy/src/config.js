const path = require("path");

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function resolvePath(baseDir, targetPath) {
  if (!targetPath) return "";
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath);
}

function loadConfig(env = process.env, cwd = process.cwd()) {
  const baseDir = cwd;
  return {
    port: Number(env.PORT || 8787),
    upstreamBaseUrl: String(env.UPSTREAM_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, ""),
    upstreamHealthPath: String(env.UPSTREAM_HEALTH_PATH || "/api/health").trim() || "/api/health",
    sensitiveFilterEnabled: toBool(env.SENSITIVE_FILTER_ENABLED, true),
    useSystemWords: toBool(env.USE_SYSTEM_WORDS, false),
    blocklistPath: resolvePath(baseDir, env.BLOCKLIST_PATH || "./words/blocklist.example.txt"),
    allowlistPath: resolvePath(baseDir, env.ALLOWLIST_PATH || "./words/allowlist.example.txt"),
    exposeMatchedWords: toBool(env.EXPOSE_MATCHED_WORDS, false),
    auditLogEnabled: toBool(env.AUDIT_LOG_ENABLED, true),
    logRawPrompt: toBool(env.LOG_RAW_PROMPT, false),
  };
}

module.exports = { loadConfig, toBool, resolvePath };
