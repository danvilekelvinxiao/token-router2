import dns from "dns/promises";
import net from "net";

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata",
]);

const DEFAULT_ALLOWED_HOSTS = [
  "127.0.0.1",
  "openrouter.ai",
  "api.openai.com",
  "api.anthropic.com",
  "api.deepseek.com",
  "generativelanguage.googleapis.com",
  "dashscope.aliyuncs.com",
  "api.xiaoleai.team",
  "xiaoleai.team",
  "pincc.flowapi.fun",
  "api.flowapi.fun",
  "aicards.shop",
];

function envList(name) {
  const fallback = name === "FLOWAPI_ALLOWED_UPSTREAM_HOSTS" ? DEFAULT_ALLOWED_HOSTS.join(",") : "";
  return String(process.env[name] || fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedHost(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (process.env.FLOWAPI_ALLOW_PRIVATE_UPSTREAMS === "true" && process.env.NODE_ENV !== "production") return true;
  return envList("FLOWAPI_ALLOWED_UPSTREAM_HOSTS").includes(host);
}

function isPrivateIpv4(address = "") {
  const parts = String(address).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address = "") {
  const value = String(address || "").toLowerCase();
  if (!value || value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isBlockedAddress(address = "") {
  const normalized = String(address || "").replace(/^\[/, "").replace(/\]$/, "");
  const family = net.isIP(normalized);
  if (family === 4) return isPrivateIpv4(normalized);
  if (family === 6) return isPrivateIpv6(normalized);
  return true;
}

export function sanitizeSecretText(value = "") {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer ***")
    .replace(/\bsk-[A-Za-z0-9._~+/=-]{8,}/g, "sk-***")
    .replace(/\bsk-or-v1-[A-Za-z0-9._~+/=-]{8,}/g, "sk-or-v1-***")
    .replace(/\bcr_[A-Za-z0-9._~+/=-]{8,}/g, "cr_***")
    .replace(/\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "***jwt***")
    .slice(0, 500);
}

export function normalizeHttpUrl(input = "") {
  const value = String(input || "").trim().replace(/\/+$/, "");
  if (!value) throw new Error("请填写上游地址");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("上游地址格式错误，请填写 https:// 开头的公网地址");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("上游地址只支持 http 或 https");
  }
  if (url.username || url.password) {
    throw new Error("上游地址不能包含账号密码");
  }
  return url;
}

export async function assertSafeUpstreamUrl(input = "", { resolveDns = true } = {}) {
  const url = normalizeHttpUrl(input);
  const hostname = url.hostname.toLowerCase();
  const allowed = isAllowedHost(hostname);
  const requireAllowlist = process.env.FLOWAPI_REQUIRE_UPSTREAM_HOST_ALLOWLIST === "true";

  if (!allowed) {
    if (requireAllowlist) {
      throw new Error("该模型服务域名不在 FlowAPI 允许列表，请先让管理员加入白名单");
    }
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      throw new Error("上游地址不能使用 localhost 或本地域名");
    }
    if (METADATA_HOSTS.has(hostname) || hostname === "169.254.169.254") {
      throw new Error("上游地址不能指向云服务器 metadata 服务");
    }
    if (net.isIP(hostname.replace(/^\[/, "").replace(/\]$/, "")) && isBlockedAddress(hostname)) {
      throw new Error("上游地址不能指向内网、回环或保留 IP");
    }
  }

  if (resolveDns && !allowed && !net.isIP(hostname)) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length) throw new Error("上游地址 DNS 解析失败");
    const blocked = records.find((record) => isBlockedAddress(record.address));
    if (blocked) {
      throw new Error("上游地址解析到内网或保留 IP，已阻止请求");
    }
  }

  return url.toString().replace(/\/+$/, "");
}
