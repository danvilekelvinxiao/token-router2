import crypto from "crypto";

const argv = process.argv.slice(2);

function readArg(name, fallback = "") {
  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  return argv[index + 1] || fallback;
}

const baseUrl = readArg("base-url", process.env.FLOWAPI_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`);
const pack = readArg("pack", "full");
const customerId = readArg("customer-id", process.env.FLOWAPI_ADMIN_CUSTOMER_ID || "cus_admin");
const email = readArg("email", process.env.FLOWAPI_ADMIN_EMAIL || "xiaoyijie@flowapi.fun");
const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.ADMIN_SECRET || process.env.JWT_SECRET || "";

if (!secret) {
  console.error("缺少 SESSION_SECRET / NEXTAUTH_SECRET / ADMIN_SECRET / JWT_SECRET，无法生成管理员会话。");
  process.exit(1);
}

function createSessionToken() {
  const payload = {
    customerId,
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

const response = await fetch(`${String(baseUrl).replace(/\/+$/, "")}/api/admin/model-market`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: `flowapi_session=${createSessionToken()}`,
  },
  body: JSON.stringify({
    action: "bootstrap_model_pack",
    pack,
  }),
});

const data = await response.json().catch(() => ({}));
console.log(JSON.stringify({
  status: response.status,
  ok: response.ok,
  pack,
  publishedCount: Number(data.publishedCount || 0),
  skippedCount: Number(data.skippedCount || 0),
  publishedModels: Array.isArray(data.published) ? data.published.map((item) => item.modelId || item.displayName) : [],
  skipped: Array.isArray(data.skipped) ? data.skipped.map((item) => ({
    id: item.id || "",
    reason: item.reason || "跳过",
  })) : [],
}, null, 2));

if (!response.ok || data?.ok === false) {
  process.exit(1);
}
