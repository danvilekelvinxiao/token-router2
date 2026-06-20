const crypto = require("crypto");

function sha256(value) {
  if (!value) return null;
  return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || null;
}

function getRequestId(req) {
  return String(req.headers["x-request-id"] || req.headers["x-correlation-id"] || crypto.randomUUID());
}

function logSensitiveEvent(req, matchedWords, options = {}) {
  if (!options.auditLogEnabled) return;
  const payload = {
    event: "sensitive_words_detected",
    timestamp: new Date().toISOString(),
    path: req.originalUrl || req.url || "",
    method: String(req.method || "").toUpperCase(),
    request_id: getRequestId(req),
    client_ip: getClientIp(req),
    authorization_hash: sha256(req.headers.authorization || req.headers.Authorization || null),
    matched_count: Array.isArray(matchedWords) ? matchedWords.length : 0,
  };

  if (options.logRawPrompt) {
    payload.raw_prompt = req.body || null;
  }

  console.log(JSON.stringify(payload));
  return payload;
}

module.exports = { logSensitiveEvent, sha256, getClientIp, getRequestId };
