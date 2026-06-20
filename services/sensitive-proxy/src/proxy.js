const { createProxyMiddleware, fixRequestBody } = require("http-proxy-middleware");
const { extractSensitiveText } = require("./extractor");
const { buildSensitiveErrorResponse } = require("./response");
const { logSensitiveEvent, getRequestId } = require("./logger");
const { loadWords, checkSensitiveText } = require("./detector");

const PROXY_PATHS = new Set([
  "/v1/chat/completions",
  "/v1/responses",
  "/v1/completions",
  "/v1/models",
  "/api/v1/chat/completions",
  "/api/v1/responses",
  "/api/v1/completions",
  "/api/v1/models",
]);

function isSensitivePath(pathname = "") {
  const normalized = String(pathname || "").replace(/\/+$/, "");
  return PROXY_PATHS.has(normalized);
}

function normalizeProxyTargetPath(pathname = "") {
  const normalized = String(pathname || "").replace(/\/+$/, "");
  if (normalized.startsWith("/api/v1/")) {
    return normalized.replace(/^\/api/, "");
  }
  return normalized;
}

function isAllowedUpstreamPath(pathname = "") {
  return isSensitivePath(pathname);
}

function rejectUnknownPath(req, res) {
  return res.status(404).json({
    error: {
      message: "该路径未被 sensitive-proxy 允许，请只使用 OpenAI 兼容接口。",
      type: "not_found",
    },
    path: req.path,
  });
}

function createSensitiveProxy(config = {}) {
  const ensureWordsLoaded = () => loadWords(config);
  ensureWordsLoaded();

  const proxy = createProxyMiddleware({
    target: config.upstreamBaseUrl,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: "silent",
    on: {
      proxyReq: fixRequestBody,
    },
  });

  return function sensitiveProxyMiddleware(req, res, next) {
    const normalizedPath = normalizeProxyTargetPath(req.path);

    if (!isAllowedUpstreamPath(req.path)) {
      return rejectUnknownPath(req, res);
    }

    if (!config.sensitiveFilterEnabled) {
      req.url = normalizedPath;
      return proxy(req, res, next);
    }

    const { text } = extractSensitiveText(req.body || {});
    const result = checkSensitiveText(text, config);

    if (result.blocked) {
      logSensitiveEvent(req, result.matchedWords, config);
      return res.status(400).json(
        buildSensitiveErrorResponse({
          exposeMatchedWords: config.exposeMatchedWords,
          matchedWords: result.matchedWords,
        })
      );
    }

    req.headers["x-request-id"] = req.headers["x-request-id"] || getRequestId(req);
    req.url = normalizedPath;
    return proxy(req, res, next);
  };
}

module.exports = {
  createSensitiveProxy,
  isSensitivePath,
  isAllowedUpstreamPath,
  normalizeProxyTargetPath,
  PROXY_PATHS,
};
