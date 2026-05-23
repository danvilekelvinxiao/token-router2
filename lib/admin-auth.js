import { hasDatabase, query } from "./db";
import { getSessionPayload } from "./session";

function isAdminCustomer(customer = {}) {
  const email = String(customer.email || "").toLowerCase();
  return (
    customer.role === "admin" ||
    customer.isAdmin === true ||
    customer.id === "cus_admin" ||
    email === "xiaoyijie@flowapi.fun"
  );
}

async function findSessionCustomer(customerId) {
  if (!customerId) return null;
  if (hasDatabase()) {
    const result = await query("SELECT id, email, role FROM customers WHERE id = $1 LIMIT 1", [customerId]);
    return result.rows[0] || null;
  }
  if (globalThis.__TOKEN_ROUTER_CUSTOMERS__?.customers) {
    return globalThis.__TOKEN_ROUTER_CUSTOMERS__.customers.find((item) => item.id === customerId) || null;
  }
  return null;
}

export async function requireAdmin(req, res) {
  const session = getSessionPayload(req);
  if (!session?.customerId) {
    res.status(401).json({ error: "请先登录管理员账号" });
    return null;
  }

  const customer = await findSessionCustomer(session.customerId);
  if (!isAdminCustomer(customer)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return { session, customer };
}
