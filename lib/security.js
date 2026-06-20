import { getSafeEmailFrom } from "@/lib/resend";

const buckets = globalThis.__FLOWAPI_RATE_LIMITS__ || new Map();
const graylist = globalThis.__FLOWAPI_GRAYLIST__ || new Map();
const concurrency = globalThis.__FLOWAPI_CONCURRENCY__ || new Map();
const alertThrottle = globalThis.__FLOWAPI_ALERT_THROTTLE__ || new Map();

globalThis.__FLOWAPI_RATE_LIMITS__ = buckets;
globalThis.__FLOWAPI_GRAYLIST__ = graylist;
globalThis.__FLOWAPI_CONCURRENCY__ = concurrency;
globalThis.__FLOWAPI_ALERT_THROTTLE__ = alertThrottle;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "throwawaymail.com",
  "sharklasers.com",
]);

export function getClientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  const forwarded = req.headers["x-forwarded-for"];
  return (
    (typeof cf === "string" ? cf.trim() : "") ||
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

export function getEmailDomain(email = "") {
  return String(email).toLowerCase().split("@")[1] || "";
}

export function isDisposableEmail(email = "") {
  return DISPOSABLE_EMAIL_DOMAINS.has(getEmailDomain(email));
}

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const retryAfterMs = windowMs - (now - recent[0]);
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { ok: true, remaining: limit - recent.length, retryAfter: 0 };
}

export function isGraylisted(key) {
  const until = graylist.get(key) || 0;
  if (until <= Date.now()) {
    graylist.delete(key);
    return false;
  }
  return true;
}

export function graylistKey(key, durationMs) {
  graylist.set(key, Date.now() + durationMs);
}

export function acquireConcurrency(key, max) {
  const current = concurrency.get(key) || 0;
  if (current >= max) return false;
  concurrency.set(key, current + 1);
  return true;
}

export function releaseConcurrency(key) {
  const current = concurrency.get(key) || 0;
  if (current <= 1) {
    concurrency.delete(key);
    return;
  }
  concurrency.set(key, current - 1);
}

export function securityLog(event, details = {}) {
  const payload = {
    event,
    details,
    time: new Date().toISOString(),
  };

  console.warn("[flowapi-security]", JSON.stringify(payload));

  const webhook = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (webhook) {
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  const alertEmail = process.env.SECURITY_ALERT_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (alertEmail && resendKey && shouldSendAlert(event)) {
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getSafeEmailFrom(process.env.EMAIL_FROM || "FlowAPI <hello@flowapi.fun>"),
        to: [alertEmail],
        subject: `FlowAPI 安全告警：${event}`,
        html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`,
      }),
    }).catch(() => {});
  }
}

function shouldSendAlert(event) {
  const now = Date.now();
  const key = `mail:${event}`;
  const last = alertThrottle.get(key) || 0;
  if (now - last < Number(process.env.SECURITY_ALERT_COOLDOWN_MS || 5 * 60 * 1000)) {
    return false;
  }
  alertThrottle.set(key, now);
  return true;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
