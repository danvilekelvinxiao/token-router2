import { verifyCustomerAccess } from "./customer-store";

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export function getCustomerAccessToken(req) {
  return String(req.headers["x-flowapi-customer-token"] || getBearerToken(req) || "").trim();
}

export function requireCustomerAccess(req, res, customerId = "") {
  if (!customerId) {
    res.status(400).json({ error: "Missing customerId" });
    return false;
  }

  if (!verifyCustomerAccess(customerId, getCustomerAccessToken(req))) {
    res.status(401).json({ error: "请先登录后再操作" });
    return false;
  }

  return true;
}

export function requireAdminAccess(req, res) {
  const expected = process.env.FLOWAPI_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || "";

  if (!expected) {
    res.status(503).json({ error: "管理员后台未配置访问密钥" });
    return false;
  }

  const actual = String(req.headers["x-flowapi-admin-token"] || getBearerToken(req) || "").trim();

  if (actual !== expected) {
    res.status(401).json({ error: "管理员权限验证失败" });
    return false;
  }

  return true;
}
