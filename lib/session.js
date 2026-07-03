import crypto from "crypto";

const COOKIE_NAME = "flowapi_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function getSecret() {
  const configured = process.env.SESSION_SECRET
    || process.env.NEXTAUTH_SECRET
    || process.env.ADMIN_SECRET
    || process.env.JWT_SECRET
    || process.env.PROXY_ACCESS_TOKEN;

  if (configured) return configured;

  return "flowapi-local-session-secret";
}

function base64Url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

export function createSessionToken(customer) {
  const payload = {
    customerId: customer.id,
    email: customer.email || "",
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
    nonce: crypto.randomBytes(8).toString("base64url"),
  };
  const encoded = base64Url(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token = "") {
  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature || sign(encoded) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.customerId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setCustomerSession(res, customer) {
  const token = createSessionToken(customer);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`,
    `flowapi_session_public=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`,
  ]);
  return token;
}

export function getSessionPayload(req) {
  const token = getSessionToken(req);
  return verifySessionToken(token);
}

export function getSessionToken(req) {
  const bearer = req.headers?.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  return bearer || parseCookies(req)[COOKIE_NAME] || "";
}

export function requireCustomerSession(req, res) {
  const session = getSessionPayload(req);
  if (!session?.customerId) {
    res.status(401).json({ error: "请先登录后再操作" });
    return null;
  }
  return session;
}

export function assertCustomerOwner(req, res, requestedCustomerId) {
  const session = requireCustomerSession(req, res);
  if (!session) return null;
  if (requestedCustomerId && requestedCustomerId !== session.customerId) {
    res.status(403).json({ error: "无权操作其他用户的数据" });
    return null;
  }
  return session;
}
