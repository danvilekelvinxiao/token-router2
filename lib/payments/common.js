import crypto from "node:crypto";

export function getAppOrigin(req) {
  const protoHeader = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const hostHeader = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const protocol = protoHeader || (hostHeader.includes("localhost") ? "http" : "https");
  if (!hostHeader) return "";
  return `${protocol}://${hostHeader}`;
}

export function makeRechargeDescription(amount) {
  return `FlowAPI 余额充值 ¥${Number(amount).toFixed(2)}`;
}

export function toFen(amount) {
  return Math.round(Number(amount) * 100);
}

export function fromFen(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

export function randomNonce(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

export function signRsaSha256(content, privateKey) {
  return crypto.sign("RSA-SHA256", Buffer.from(content, "utf8"), privateKey).toString("base64");
}

export function verifyRsaSha256(content, signature, publicKey) {
  return crypto.verify(
    "RSA-SHA256",
    Buffer.from(content, "utf8"),
    publicKey,
    Buffer.from(signature, "base64")
  );
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function parsePem(value = "") {
  const trimmed = String(value || "").trim();
  return trimmed.includes("BEGIN") ? trimmed : trimmed.replace(/\\n/g, "\n");
}

export function stringifySignedParams(params) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}
